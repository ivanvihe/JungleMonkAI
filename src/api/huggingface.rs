use anyhow::{anyhow, Context, Result};
use hf_hub::api::sync::ApiBuilder;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use crate::local_providers::{LocalModelCard, LocalModelProvider};

#[derive(Debug, Clone, Deserialize)]
struct RawModelSummary {
    #[serde(rename = "modelId")]
    model_id: String,
    author: Option<String>,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    gated: bool,
    #[serde(default)]
    likes: Option<u64>,
    #[serde(default)]
    downloads: Option<u64>,
    #[serde(rename = "pipeline_tag")]
    pipeline_tag: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

fn huggingface_incompatibility(raw: &RawModelSummary) -> Option<String> {
    let tags_lower: Vec<String> = raw.tags.iter().map(|tag| tag.to_lowercase()).collect();

    let has_embedding_tag = tags_lower.iter().any(|tag| {
        tag.contains("embedding")
            || tag.contains("retrieval")
            || tag.contains("sentence-transformers")
            || tag.contains("semantic-search")
    });

    if tags_lower
        .iter()
        .any(|tag| tag.contains("gguf") || tag.contains("ggml"))
    {
        return Some(
            "Este repositorio solo ofrece pesos en formato GGUF/GGML, incompatible con el runtime local de Jarvis.".
                to_string(),
        );
    }

    if let Some(pipeline) = raw.pipeline_tag.as_deref() {
        let pipeline_lower = pipeline.to_lowercase();
        let supported = matches!(
            pipeline_lower.as_str(),
            "feature-extraction"
                | "sentence-similarity"
                | "text-embedding"
                | "text-embeddings-inference"
                | "embeddings"
        );
        let compatible_by_tags = !supported
            && has_embedding_tag
            && matches!(
                pipeline_lower.as_str(),
                "text-generation" | "text2text-generation"
            );

        if !supported && !compatible_by_tags {
            return Some(format!(
                "La pipeline declarada '{}' no es compatible con el runtime de incrustaciones de Jarvis.",
                pipeline
            ));
        }
    } else if !has_embedding_tag {
        return Some(
            "El modelo no especifica una pipeline de embeddings compatible con el runtime de Jarvis.".
                to_string(),
        );
    }

    None
}

/// Busca modelos en Hugging Face y devuelve una lista de metadatos resumidos.
pub fn search_models(query: &str, token: Option<&str>) -> Result<Vec<LocalModelCard>> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("No se pudo crear el cliente HTTP para Hugging Face")?;

    let mut request = client
        .get("https://huggingface.co/api/models")
        .query(&[("search", query), ("limit", "25")]);

    if let Some(token) = token {
        if !token.trim().is_empty() {
            request = request.bearer_auth(token.trim());
        }
    }

    let response = request
        .send()
        .context("Error enviando la búsqueda a Hugging Face")?
        .error_for_status()
        .context("Hugging Face devolvió un estado de error")?;

    let models: Vec<RawModelSummary> = response
        .json()
        .context("No se pudo interpretar la respuesta de búsqueda de Hugging Face")?;

    Ok(models
        .into_iter()
        .map(|raw| {
            let incompatible_reason = huggingface_incompatibility(&raw);
            LocalModelCard {
                provider: LocalModelProvider::HuggingFace,
                id: raw.model_id,
                author: raw.author,
                pipeline_tag: raw.pipeline_tag,
                tags: raw.tags,
                likes: raw.likes,
                downloads: raw.downloads,
                requires_token: raw.private || raw.gated,
                description: None,
                incompatible_reason,
            }
        })
        .collect())
}

/// Descarga metadatos básicos del modelo y los almacena en disco dentro del directorio indicado.
pub fn download_model(
    model: &LocalModelCard,
    install_dir: &Path,
    token: Option<&str>,
) -> Result<PathBuf> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("No se pudo crear el cliente HTTP para Hugging Face")?;

    let mut request = client.get(format!("https://huggingface.co/api/models/{}", model.id));
    if let Some(token) = token {
        if !token.trim().is_empty() {
            request = request.bearer_auth(token.trim());
        }
    }

    let response = request
        .send()
        .context("Error descargando metadatos del modelo en Hugging Face")?
        .error_for_status()
        .context("Hugging Face devolvió un estado de error al descargar metadatos")?;

    let metadata: Value = response
        .json()
        .context("No se pudo interpretar los metadatos del modelo de Hugging Face")?;

    let available_files: HashSet<String> = metadata
        .get("siblings")
        .and_then(|siblings| siblings.as_array())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("rfilename").and_then(|value| value.as_str()))
                .map(|value| value.to_string())
                .collect()
        })
        .unwrap_or_default();

    let safe_dir_name = sanitize_id(&model.id);
    let target_dir = install_dir.join(&safe_dir_name);
    let staging_dir = install_dir.join(format!("{}__downloading", safe_dir_name));

    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).with_context(|| {
            format!(
                "No se pudo limpiar el directorio temporal de descarga {:?}",
                staging_dir
            )
        })?;
    }
    fs::create_dir_all(&staging_dir)
        .with_context(|| format!("No se pudo crear el directorio {:?}", staging_dir))?;

    let metadata_path = staging_dir.join("metadata.json");
    fs::write(&metadata_path, serde_json::to_string_pretty(&metadata)?)
        .with_context(|| format!("No se pudo escribir {:?}", metadata_path))?;

    let mut builder = ApiBuilder::new().with_progress(false);
    if let Some(token) = token.and_then(|t| {
        let trimmed = t.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }) {
        builder = builder.with_token(Some(token));
    }

    let api = builder
        .build()
        .context("No se pudo inicializar el cliente de Hugging Face Hub")?;
    let repo = api.model(model.id.to_string());

    let download_file = |remote: &str, optional: bool| -> Result<()> {
        if !available_files.contains(remote) {
            if optional {
                return Ok(());
            }
            return Err(anyhow!(
                "El repositorio de Hugging Face no contiene el archivo obligatorio '{}'",
                remote
            ));
        }
        let mut last_err = None;
        for attempt in 1..=3 {
            match repo.download(remote) {
                Ok(path) => {
                    let destination = staging_dir.join(remote);
                    if let Some(parent) = destination.parent() {
                        fs::create_dir_all(parent)
                            .with_context(|| format!("No se pudo crear {:?}", parent))?;
                    }
                    fs::copy(&path, &destination).with_context(|| {
                        format!(
                            "No se pudo copiar el archivo descargado de Hugging Face {:?} a {:?}",
                            path, destination
                        )
                    })?;

                    let metadata = fs::metadata(&destination).with_context(|| {
                        format!("No se pudo obtener el tamaño del archivo {:?}", destination)
                    })?;
                    if metadata.len() == 0 {
                        last_err = Some(anyhow!(
                            "El archivo '{}' descargado está vacío. Inténtalo nuevamente.",
                            remote
                        ));
                        fs::remove_file(&destination).ok();
                        thread::sleep(Duration::from_millis(250 * attempt as u64));
                        continue;
                    }

                    return Ok(());
                }
                Err(err) => {
                    if optional {
                        return Ok(());
                    }
                    last_err = Some(anyhow!(
                        "No se pudo descargar '{}' desde Hugging Face (intento {} de 3): {}",
                        remote,
                        attempt,
                        err
                    ));
                    thread::sleep(Duration::from_millis(250 * attempt as u64));
                }
            }
        }

        if let Some(err) = last_err {
            Err(err)
        } else {
            Err(anyhow!("Error desconocido al descargar '{}'", remote))
        }
    };

    download_file("config.json", false)?;

    let optional_files = [
        "tokenizer.json",
        "tokenizer_config.json",
        "sentence_bert_config.json",
        "vocab.txt",
        "merges.txt",
        "special_tokens_map.json",
        "modules.json",
        "rust_model.ot",
    ];

    for file in optional_files {
        download_file(file, true)?;
    }

    let mut safetensor_files: Vec<_> = available_files
        .iter()
        .filter(|name| name.ends_with(".safetensors"))
        .cloned()
        .collect();
    safetensor_files.sort();

    if safetensor_files.is_empty() {
        return Err(anyhow!(
            "El modelo '{}' no publica archivos con extensión '.safetensors'. El runtime local requiere ese formato.",
            model.id
        ));
    }

    for file in safetensor_files {
        download_file(&file, false)?;
    }

    let modules_path = staging_dir.join("modules.json");
    if modules_path.exists() {
        let module_data = fs::read_to_string(&modules_path)
            .with_context(|| format!("No se pudo leer {:?}", modules_path))?;
        let modules: Vec<Value> = match serde_json::from_str(&module_data) {
            Ok(parsed) => parsed,
            Err(err) => {
                eprintln!(
                    "modules.json inválido en {:?}: {}. Continuando sin módulos opcionales.",
                    modules_path, err
                );
                Vec::new()
            }
        };

        for module in modules {
            if let Some(path) = module.get("path").and_then(|value| value.as_str()) {
                if path.trim().is_empty() {
                    continue;
                }
                let config_path = format!("{}/config.json", path);
                download_file(&config_path, true)?;
                let weights_path = format!("{}/rust_model.ot", path);
                download_file(&weights_path, true)?;
            }
        }
    }

    ensure_required_assets(&staging_dir)?;

    if target_dir.exists() {
        fs::remove_dir_all(&target_dir).with_context(|| {
            format!(
                "No se pudo reemplazar el directorio de instalación anterior {:?}",
                target_dir
            )
        })?;
    }

    fs::rename(&staging_dir, &target_dir).with_context(|| {
        format!(
            "No se pudo mover el modelo descargado de {:?} a {:?}",
            staging_dir, target_dir
        )
    })?;

    Ok(target_dir)
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .map(|ch| match ch {
            '/' | '\\' | ' ' => '_',
            ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => ch,
        })
        .collect()
}

fn ensure_required_assets(dir: &Path) -> Result<()> {
    let config_path = dir.join("config.json");
    if !config_path.exists() {
        return Err(anyhow!(
            "El modelo descargado no incluye config.json en {:?}",
            config_path
        ));
    }

    let tokenizer = dir.join("tokenizer.json");
    if !tokenizer.exists() {
        return Err(anyhow!(
            "El modelo descargado no incluye tokenizer.json en {:?}",
            tokenizer
        ));
    }

    let has_safetensors = fs::read_dir(dir)
        .with_context(|| format!("No se pudo listar el directorio {:?}", dir))?
        .filter_map(|entry| entry.ok())
        .any(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("safetensors"))
                .unwrap_or(false)
        });

    if !has_safetensors {
        return Err(anyhow!(
            "El modelo descargado no contiene archivos '.safetensors' en {:?}",
            dir
        ));
    }

    Ok(())
}
