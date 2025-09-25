use anyhow::{anyhow, Context, Result};
use hf_hub::api::sync::ApiBuilder;
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
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
        .map(|raw| LocalModelCard {
            provider: LocalModelProvider::HuggingFace,
            id: raw.model_id,
            author: raw.author,
            pipeline_tag: raw.pipeline_tag,
            tags: raw.tags,
            likes: raw.likes,
            downloads: raw.downloads,
            requires_token: raw.private || raw.gated,
            description: None,
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

    let target_dir = install_dir.join(model.id.replace('/', "_"));
    fs::create_dir_all(&target_dir)
        .with_context(|| format!("No se pudo crear el directorio {:?}", target_dir))?;

    let metadata_path = target_dir.join("metadata.json");
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
        match repo.download(remote) {
            Ok(path) => {
                let destination = target_dir.join(remote);
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
                Ok(())
            }
            Err(_err) if optional => Ok(()),
            Err(err) => Err(anyhow!(
                "No se pudo descargar '{}' desde Hugging Face: {}",
                remote,
                err
            )),
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

    let preferred_weights = [
        "model.safetensors",
        "pytorch_model.bin",
        "model.bin",
        "diffusion_pytorch_model.bin",
        "openvino_model.bin",
        "rust_model.ot",
    ];

    let mut downloaded_weights = false;
    for file in preferred_weights {
        if available_files.contains(file) {
            download_file(file, false)?;
            downloaded_weights = true;
            break;
        }
    }

    if !downloaded_weights {
        if let Some(gguf) = available_files
            .iter()
            .find(|name| name.ends_with(".gguf"))
            .cloned()
        {
            download_file(&gguf, false)?;
            downloaded_weights = true;
        }
    }

    if !downloaded_weights {
        if let Some(bin) = available_files
            .iter()
            .find(|name| name.ends_with(".bin"))
            .cloned()
        {
            download_file(&bin, false)?;
            downloaded_weights = true;
        }
    }

    if !downloaded_weights {
        return Err(anyhow!(
            "No se encontraron archivos de pesos compatibles en el modelo '{}'",
            model.id
        ));
    }

    let modules_path = target_dir.join("modules.json");
    if modules_path.exists() {
        let module_data = fs::read_to_string(&modules_path)
            .with_context(|| format!("No se pudo leer {:?}", modules_path))?;
        let modules: Vec<Value> = serde_json::from_str(&module_data)
            .with_context(|| format!("modules.json inválido en {:?}", modules_path))?;

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

    Ok(target_dir)
}
