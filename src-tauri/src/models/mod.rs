use anyhow::anyhow;
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{State, Window};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::OnceCell;

use crate::git::SecretManager;

const APP_USER_AGENT: &str = "JungleMonkAI/1.0";

#[derive(Debug, Clone, Serialize)]
pub struct ModelAsset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub provider: String,
    pub tags: Vec<String>,
    pub download_url: String,
    pub checksum: String,
    pub size: u64,
    pub file_name: String,
    pub repo: Option<String>,
    pub resolved_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub provider: String,
    pub tags: Vec<String>,
    pub size: u64,
    pub checksum: String,
    pub status: String,
    pub local_path: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalModelMetadata {
    file_name: String,
    checksum: String,
    #[serde(default)]
    metadata: HashMap<String, Value>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct ModelRegistryData {
    models: HashMap<String, LocalModelMetadata>,
    active_model: Option<String>,
    #[serde(default)]
    metadata: HashMap<String, Value>,
}

struct ModelRegistryEntry {
    manifest_path: PathBuf,
    models_dir: PathBuf,
    inner: RwLock<ModelRegistryData>,
    downloading: Mutex<HashSet<String>>,
}

impl ModelRegistryEntry {
    fn load(manifest_path: PathBuf, models_dir: PathBuf) -> anyhow::Result<Self> {
        if let Some(parent) = manifest_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::create_dir_all(&models_dir)?;

        let data = if manifest_path.exists() {
            let content = fs::read_to_string(&manifest_path)?;
            serde_json::from_str::<ModelRegistryData>(&content).unwrap_or_default()
        } else {
            ModelRegistryData::default()
        };

        Ok(Self {
            manifest_path,
            models_dir,
            inner: RwLock::new(data),
            downloading: Mutex::new(HashSet::new()),
        })
    }

    fn save_locked(&self, data: &ModelRegistryData) -> anyhow::Result<()> {
        let serialized = serde_json::to_string_pretty(data)?;
        fs::write(&self.manifest_path, serialized)?;
        Ok(())
    }

    fn model_path(&self, file_name: &str) -> PathBuf {
        self.models_dir.join(file_name)
    }

    fn list(&self) -> (ModelRegistryData, HashSet<String>) {
        let data = self.inner.read().unwrap().clone();
        let downloading = self.downloading.lock().unwrap().clone();
        (data, downloading)
    }

    fn store_model(&self, model_id: &str, metadata: LocalModelMetadata) -> anyhow::Result<()> {
        let mut data = self.inner.write().unwrap();
        data.models.insert(model_id.to_string(), metadata);
        self.save_locked(&data)
    }

    fn set_active(&self, model_id: &str) -> anyhow::Result<()> {
        let mut data = self.inner.write().unwrap();
        if !data.models.contains_key(model_id) {
            return Err(anyhow!("El modelo {model_id} no está instalado"));
        }
        data.active_model = Some(model_id.to_string());
        self.save_locked(&data)
    }

    fn begin_download(&self, model_id: &str) -> anyhow::Result<DownloadGuard<'_>> {
        let mut downloading = self.downloading.lock().unwrap();
        if downloading.contains(model_id) {
            return Err(anyhow!("El modelo {model_id} ya se está descargando"));
        }
        downloading.insert(model_id.to_string());
        Ok(DownloadGuard {
            registry: self,
            model_id: model_id.to_string(),
        })
    }
}

pub struct ModelRegistry {
    default_manifest_path: PathBuf,
    default_models_dir: PathBuf,
    registries: RwLock<HashMap<PathBuf, Arc<ModelRegistryEntry>>>,
}

impl ModelRegistry {
    pub fn load(
        default_manifest_path: PathBuf,
        default_models_dir: PathBuf,
    ) -> anyhow::Result<Self> {
        let entry =
            ModelRegistryEntry::load(default_manifest_path.clone(), default_models_dir.clone())?;
        let mut registries = HashMap::new();
        registries.insert(default_manifest_path.clone(), Arc::new(entry));

        Ok(Self {
            default_manifest_path,
            default_models_dir,
            registries: RwLock::new(registries),
        })
    }

    fn registry_for_storage_dir(
        &self,
        storage_dir: Option<PathBuf>,
    ) -> anyhow::Result<Arc<ModelRegistryEntry>> {
        let (manifest_path, models_dir) = match storage_dir {
            Some(dir) => {
                let manifest_path = dir.join("models.json");
                let models_dir = dir.join("models");
                (manifest_path, models_dir)
            }
            None => (
                self.default_manifest_path.clone(),
                self.default_models_dir.clone(),
            ),
        };

        if let Some(entry) = self.registries.read().unwrap().get(&manifest_path).cloned() {
            return Ok(entry);
        }

        let entry = Arc::new(ModelRegistryEntry::load(manifest_path.clone(), models_dir)?);
        let mut registries = self.registries.write().unwrap();
        Ok(registries
            .entry(manifest_path)
            .or_insert_with(|| entry.clone())
            .clone())
    }

    pub fn resolve(&self, storage_dir: Option<PathBuf>) -> anyhow::Result<Arc<ModelRegistryEntry>> {
        self.registry_for_storage_dir(storage_dir)
    }
}

struct DownloadGuard<'a> {
    registry: &'a ModelRegistryEntry,
    model_id: String,
}

impl<'a> Drop for DownloadGuard<'a> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.registry.downloading.lock() {
            guard.remove(&self.model_id);
        }
    }
}

fn parse_storage_dir(storage_dir: Option<String>) -> Option<PathBuf> {
    storage_dir.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    })
}

fn path_to_string(path: PathBuf) -> Option<String> {
    Some(path.to_string_lossy().to_string())
}

fn metadata_string(meta: &LocalModelMetadata, key: &str) -> Option<String> {
    meta.metadata.get(key).and_then(|value| match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    })
}

fn metadata_u64(meta: &LocalModelMetadata, key: &str) -> Option<u64> {
    meta.metadata.get(key).and_then(|value| match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    })
}

fn metadata_tags(meta: &LocalModelMetadata, key: &str) -> Vec<String> {
    meta.metadata
        .get(key)
        .map(|value| match value {
            Value::Array(items) => items
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect(),
            Value::String(text) => vec![text.clone()],
            _ => Vec::new(),
        })
        .unwrap_or_default()
}

#[derive(Debug)]
struct ModelSource {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    provider: &'static str,
    tags: &'static [&'static str],
    repo: Option<&'static str>,
    file_name: &'static str,
    download_url: Option<&'static str>,
    checksum: Option<&'static str>,
    size: Option<u64>,
}

static MODEL_SOURCES: &[ModelSource] = &[
    ModelSource {
        id: "local-phi3",
        name: "Phi-3 Mini 4K Instruct Q4",
        description:
            "Modelo orientado a asistentes locales basado en Phi-3 Mini con cuantización Q4.",
        provider: "Hugging Face",
        tags: &["asistente", "cuantizado", "phi3"],
        repo: Some("microsoft/Phi-3-mini-4k-instruct-gguf"),
        file_name: "Phi-3-mini-4k-instruct-q4.gguf",
        download_url: None,
        checksum: None,
        size: None,
    },
    ModelSource {
        id: "local-mistral",
        name: "Mistral 7B Instruct v0.2 Q4_K_M",
        description: "Modelo generalista cuantizado Q4_K_M para tareas de conversación y análisis.",
        provider: "Hugging Face",
        tags: &["instruct", "mistral", "cuantizado"],
        repo: Some("mistralai/Mistral-7B-Instruct-v0.2-GGUF"),
        file_name: "Mistral-7B-Instruct-v0.2.Q4_K_M.gguf",
        download_url: None,
        checksum: None,
        size: None,
    },
    ModelSource {
        id: "local-wizardcoder",
        name: "WizardCoder 15B 1.0 Q4_K_M",
        description:
            "Modelo especializado en generación de código basado en WizardCoder con cuantización Q4_K_M.",
        provider: "Hugging Face",
        tags: &["código", "wizardcoder", "cuantizado"],
        repo: Some("TheBloke/WizardCoder-15B-1.0-GGUF"),
        file_name: "WizardCoder-15B-1.0.Q4_K_M.gguf",
        download_url: None,
        checksum: None,
        size: None,
    },
    ModelSource {
        id: "local-deepseek-coder",
        name: "DeepSeek Coder 6.7B Instruct Q4_K_M",
        description:
            "Modelo Instruct orientado a desarrollo de software con equilibrio entre tamaño y calidad.",
        provider: "Hugging Face",
        tags: &["código", "deepseek", "instruct"],
        repo: Some("deepseek-ai/deepseek-coder-6.7b-instruct-GGUF"),
        file_name: "deepseek-coder-6.7b-instruct.Q4_K_M.gguf",
        download_url: None,
        checksum: None,
        size: None,
    },
    ModelSource {
        id: "local-mistral-small",
        name: "Mistral 7B Instruct v0.2 Q5_K_M",
        description:
            "Cuantización Q5_K_M para obtener mayor calidad en respuestas conversacionales manteniendo tamaño manejable.",
        provider: "Hugging Face",
        tags: &["instruct", "mistral", "cuantizado"],
        repo: Some("mistralai/Mistral-7B-Instruct-v0.2-GGUF"),
        file_name: "Mistral-7B-Instruct-v0.2.Q5_K_M.gguf",
        download_url: None,
        checksum: None,
        size: None,
    },
];

static AVAILABLE_MODELS: Lazy<OnceCell<Vec<ModelAsset>>> = Lazy::new(OnceCell::const_new);

#[derive(Debug, Deserialize)]
struct HuggingFaceResponse {
    siblings: Vec<HuggingFaceSibling>,
}

#[derive(Debug, Deserialize)]
struct HuggingFaceSibling {
    #[serde(rename = "rfilename")]
    file_name: String,
    size: Option<u64>,
    sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HuggingFaceModelApiEntry {
    id: String,
    pipeline_tag: Option<String>,
    downloads: Option<u64>,
    siblings: Option<Vec<HuggingFaceSibling>>,
}

#[derive(Debug, Serialize)]
pub struct HuggingFaceModelEntry {
    pub id: String,
    pub pipeline_tag: Option<String>,
    pub downloads: Option<u64>,
    pub files: Vec<HuggingFaceModelFile>,
}

#[derive(Debug, Serialize)]
pub struct HuggingFaceModelFile {
    pub file_name: String,
    pub size: Option<u64>,
}

fn huggingface_token() -> Option<String> {
    env::var("HF_TOKEN")
        .or_else(|_| env::var("HUGGINGFACE_TOKEN"))
        .ok()
}

fn resolve_huggingface_token(manager: &SecretManager) -> Option<String> {
    manager
        .read("huggingface")
        .ok()
        .and_then(|stored| {
            if stored.trim().is_empty() {
                None
            } else {
                Some(stored)
            }
        })
        .or_else(huggingface_token)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
#[allow(non_snake_case)]
pub async fn query_huggingface_models(
    apiBaseUrl: Option<String>,
    limit: Option<u32>,
    search: Option<String>,
    filter_library: Option<String>,
    pipeline_tag: Option<String>,
    manager: State<'_, SecretManager>,
) -> Result<Vec<HuggingFaceModelEntry>, String> {
    let base_url = apiBaseUrl.unwrap_or_else(|| "https://huggingface.co".to_string());
    let mut url =
        Url::parse(&base_url).map_err(|err| format!("URL base inválida ({base_url}): {err}"))?;
    url.set_path("/api/models");

    {
        let mut query_pairs = url.query_pairs_mut();
        if let Some(limit) = limit {
            query_pairs.append_pair("limit", &limit.to_string());
        }
        if let Some(search) = search.as_ref() {
            if !search.is_empty() {
                query_pairs.append_pair("search", search);
            }
        }
        if let Some(library) = filter_library.as_ref() {
            if !library.is_empty() {
                query_pairs.append_pair("filter", &format!("library:{library}"));
            }
        }
        if let Some(pipeline_tag) = pipeline_tag.as_ref() {
            if !pipeline_tag.is_empty() {
                query_pairs.append_pair("pipeline_tag", pipeline_tag);
            }
        }
    }

    let client = reqwest::Client::new();
    let mut request = client
        .get(url)
        .header(reqwest::header::USER_AGENT, APP_USER_AGENT);

    if let Some(token) = resolve_huggingface_token(&manager) {
        request = request.bearer_auth(token);
    }

    let response = request
        .send()
        .await
        .map_err(|err| format!("Error consultando Hugging Face: {err}"))?;

    let response = response
        .error_for_status()
        .map_err(|err| format!("Respuesta inválida de Hugging Face: {err}"))?;

    let payload: Vec<HuggingFaceModelApiEntry> = response
        .json()
        .await
        .map_err(|err| format!("No se pudo parsear la respuesta de Hugging Face: {err}"))?;

    let models = payload
        .into_iter()
        .map(|entry| HuggingFaceModelEntry {
            id: entry.id,
            pipeline_tag: entry.pipeline_tag,
            downloads: entry.downloads,
            files: entry
                .siblings
                .unwrap_or_default()
                .into_iter()
                .map(|sibling| HuggingFaceModelFile {
                    file_name: sibling.file_name,
                    size: sibling.size,
                })
                .collect(),
        })
        .collect();

    Ok(models)
}

async fn fetch_model_asset(
    client: &reqwest::Client,
    source: &ModelSource,
) -> anyhow::Result<ModelAsset> {
    let (size, checksum) = if let Some(repo) = source.repo {
        let api_url = format!("https://huggingface.co/api/models/{}", repo);
        let mut request = client
            .get(api_url)
            .header(reqwest::header::USER_AGENT, APP_USER_AGENT);
        if let Some(token) = huggingface_token() {
            request = request.bearer_auth(token);
        }

        let response = request.send().await?;
        let response = response.error_for_status()?;
        let payload: HuggingFaceResponse = response.json().await?;

        let sibling = payload
            .siblings
            .into_iter()
            .find(|item| item.file_name == source.file_name)
            .ok_or_else(|| anyhow!("No se encontró el archivo {} en {}", source.file_name, repo))?;

        let size = sibling.size.or(source.size).ok_or_else(|| {
            anyhow!(
                "No se pudo obtener el tamaño del archivo {} en {}",
                source.file_name,
                repo
            )
        })?;

        let checksum = sibling
            .sha256
            .or_else(|| source.checksum.map(|value| value.to_string()))
            .ok_or_else(|| {
                anyhow!(
                    "No se pudo obtener el checksum SHA-256 del archivo {} en {}",
                    source.file_name,
                    repo
                )
            })?;

        (size, checksum)
    } else {
        let size = source.size.ok_or_else(|| {
            anyhow!(
                "No se pudo obtener el tamaño del archivo {} (fuente {})",
                source.file_name,
                source.id
            )
        })?;
        let checksum = source
            .checksum
            .map(|value| value.to_string())
            .ok_or_else(|| {
                anyhow!(
                    "No se pudo obtener el checksum del archivo {} (fuente {})",
                    source.file_name,
                    source.id
                )
            })?;
        (size, checksum)
    };

    let download_url = if let Some(url) = source.download_url {
        url.to_string()
    } else if let Some(repo) = source.repo {
        format!(
            "https://huggingface.co/{}/resolve/main/{}?download=1",
            repo, source.file_name
        )
    } else {
        return Err(anyhow!(
            "No se pudo construir la URL de descarga para el modelo {}",
            source.id
        ));
    };

    Ok(ModelAsset {
        id: source.id.to_string(),
        name: source.name.to_string(),
        description: source.description.to_string(),
        provider: source.provider.to_string(),
        tags: source.tags.iter().map(|tag| tag.to_string()).collect(),
        download_url,
        checksum,
        size,
        file_name: source.file_name.to_string(),
        repo: source.repo.map(|value| value.to_string()),
        resolved_file: Some(source.file_name.to_string()),
    })
}

async fn ensure_model_manifest() -> anyhow::Result<Vec<ModelAsset>> {
    let manifest = AVAILABLE_MODELS
        .get_or_try_init(|| async {
            let client = reqwest::Client::new();
            let mut assets = Vec::with_capacity(MODEL_SOURCES.len());
            for source in MODEL_SOURCES {
                let asset = fetch_model_asset(&client, source).await?;
                assets.push(asset);
            }
            Ok::<_, anyhow::Error>(assets)
        })
        .await?;

    Ok(manifest.clone())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn list_models(
    storageDir: Option<String>,
    state: State<'_, ModelRegistry>,
) -> Result<Vec<ModelSummary>, String> {
    let storage_dir = parse_storage_dir(storageDir);
    let registry = state
        .resolve(storage_dir)
        .map_err(|err| format!("No se pudo preparar el registro de modelos: {err}"))?;

    let assets = ensure_model_manifest()
        .await
        .map_err(|err| format!("No se pudo cargar el catálogo de modelos: {err}"))?;
    let (data, downloading) = registry.list();

    let mut seen = HashSet::new();
    let mut summaries = Vec::with_capacity(assets.len() + data.models.len());

    for asset in &assets {
        seen.insert(asset.id.clone());
        let (status, local_path) = if downloading.contains(&asset.id) {
            (
                "downloading".to_string(),
                data.models
                    .get(&asset.id)
                    .map(|m| registry.model_path(&m.file_name)),
            )
        } else if let Some(meta) = data.models.get(&asset.id) {
            (
                "ready".to_string(),
                Some(registry.model_path(&meta.file_name)),
            )
        } else {
            ("not_installed".to_string(), None)
        };

        summaries.push(ModelSummary {
            id: asset.id.clone(),
            name: asset.name.clone(),
            description: asset.description.clone(),
            provider: asset.provider.clone(),
            tags: asset.tags.clone(),
            size: asset.size,
            checksum: asset.checksum.clone(),
            status,
            local_path: local_path.and_then(path_to_string),
            active: data.active_model.as_deref() == Some(asset.id.as_str()),
        });
    }

    for (model_id, meta) in &data.models {
        if seen.contains(model_id) {
            continue;
        }

        let status = if downloading.contains(model_id) {
            "downloading".to_string()
        } else {
            "ready".to_string()
        };

        let name = metadata_string(meta, "name").unwrap_or_else(|| model_id.clone());
        let description = metadata_string(meta, "description").unwrap_or_default();
        let provider =
            metadata_string(meta, "provider").unwrap_or_else(|| "Catálogo local".to_string());
        let tags = metadata_tags(meta, "tags");
        let size = metadata_u64(meta, "size").unwrap_or(0);

        summaries.push(ModelSummary {
            id: model_id.clone(),
            name,
            description,
            provider,
            tags,
            size,
            checksum: meta.checksum.clone(),
            status,
            local_path: Some(registry.model_path(&meta.file_name)).and_then(path_to_string),
            active: data.active_model.as_deref() == Some(model_id.as_str()),
        });
    }

    Ok(summaries)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn download_model(
    window: Window,
    modelId: String,
    storageDir: Option<String>,
    state: State<'_, ModelRegistry>,
    manager: State<'_, SecretManager>,
) -> Result<(), String> {
    let model_id = modelId;
    let storage_dir = parse_storage_dir(storageDir);
    let registry = state
        .resolve(storage_dir)
        .map_err(|err| format!("No se pudo preparar el registro de modelos: {err}"))?;

    let assets = ensure_model_manifest()
        .await
        .map_err(|err| format!("No se pudo cargar el catálogo de modelos: {err}"))?;

    let asset = assets
        .into_iter()
        .find(|item| item.id == model_id)
        .ok_or_else(|| format!("Modelo desconocido: {model_id}"))?;

    let download_url = asset.download_url.clone();
    let checksum = asset.checksum.clone();
    let size = asset.size;
    let file_name = asset.file_name.clone();
    let repo = asset.repo.clone();
    let resolved_file = asset
        .resolved_file
        .clone()
        .unwrap_or_else(|| file_name.clone());

    let _guard = registry
        .begin_download(&model_id)
        .map_err(|err| err.to_string())?;

    let client = reqwest::Client::new();
    let mut request = client
        .get(&download_url)
        .header(reqwest::header::USER_AGENT, APP_USER_AGENT);
    if download_url.contains("huggingface.co") {
        if let Some(token) = resolve_huggingface_token(&manager) {
            request = request.bearer_auth(token);
        }
    }
    let response = request.send().await.map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "No se pudo descargar el modelo: status {}",
            response.status()
        ));
    }

    let total = response.content_length().unwrap_or(size);
    let mut stream = response.bytes_stream();
    let dest_path = registry.model_path(&file_name);
    let tmp_path = dest_path.with_extension("download");

    let mut file = File::create(&tmp_path)
        .await
        .map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| err.to_string())?;
        file.write_all(&chunk)
            .await
            .map_err(|err| err.to_string())?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            downloaded as f64 / total as f64
        } else {
            0.0
        };

        let _ = window.emit(
            "model-download-progress",
            serde_json::json!({
                "id": &model_id,
                "downloaded": downloaded,
                "total": total,
                "progress": progress,
            }),
        );
    }

    file.flush().await.map_err(|err| err.to_string())?;
    drop(file);

    let hash = format!("{:x}", hasher.finalize());
    if !hash.eq_ignore_ascii_case(&checksum) {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        let message = format!(
            "La verificación de integridad falló para {model_id}: esperado {} pero se obtuvo {hash}",
            checksum
        );
        let _ = window.emit(
            "model-download-error",
            serde_json::json!({ "id": model_id, "error": message }),
        );
        return Err(message);
    }

    tokio::fs::rename(&tmp_path, &dest_path)
        .await
        .map_err(|err| err.to_string())?;

    let mut metadata = HashMap::new();
    metadata.insert("name".to_string(), Value::String(asset.name.clone()));
    metadata.insert(
        "description".to_string(),
        Value::String(asset.description.clone()),
    );
    metadata.insert(
        "provider".to_string(),
        Value::String(asset.provider.clone()),
    );
    metadata.insert(
        "tags".to_string(),
        Value::Array(
            asset
                .tags
                .iter()
                .map(|tag| Value::String(tag.clone()))
                .collect(),
        ),
    );
    metadata.insert("download_url".to_string(), Value::String(download_url));
    metadata.insert("size".to_string(), Value::from(size));
    metadata.insert(
        "resolved_file".to_string(),
        Value::String(resolved_file.clone()),
    );
    if let Some(repo) = repo {
        metadata.insert("repo".to_string(), Value::String(repo));
    }

    registry
        .store_model(
            &model_id,
            LocalModelMetadata {
                file_name: file_name.clone(),
                checksum: checksum.clone(),
                metadata,
            },
        )
        .map_err(|err| err.to_string())?;

    let _ = window.emit(
        "model-download-complete",
        serde_json::json!({
            "id": model_id,
            "path": dest_path.to_string_lossy(),
            "checksum": checksum,
        }),
    );

    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn activate_model(
    model_id: String,
    storageDir: Option<String>,
    state: State<'_, ModelRegistry>,
) -> Result<(), String> {
    let storage_dir = parse_storage_dir(storageDir);
    let registry = state
        .resolve(storage_dir)
        .map_err(|err| format!("No se pudo preparar el registro de modelos: {err}"))?;
    registry
        .set_active(&model_id)
        .map_err(|err| err.to_string())
}

pub fn local_model_path(model_id: &str, registry: &ModelRegistry) -> Option<PathBuf> {
    let entry = registry.resolve(None).ok()?;
    let data = entry.inner.read().ok()?;
    data.models
        .get(model_id)
        .map(|meta| entry.model_path(&meta.file_name))
}

pub fn model_exists(model_id: &str, registry: &ModelRegistry) -> bool {
    registry
        .resolve(None)
        .ok()
        .and_then(|entry| {
            entry
                .inner
                .read()
                .ok()
                .map(|data| data.models.contains_key(model_id))
        })
        .unwrap_or(false)
}

pub fn model_is_active(model_id: &str, registry: &ModelRegistry) -> bool {
    registry
        .resolve(None)
        .ok()
        .and_then(|entry| {
            entry
                .inner
                .read()
                .ok()
                .map(|data| data.active_model.as_deref() == Some(model_id))
        })
        .unwrap_or(false)
}

fn _assert_send_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<ModelRegistry>();
}
