use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

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

/// Información resumida de un modelo publicado en Hugging Face.
#[derive(Debug, Clone)]
pub struct HuggingFaceModelInfo {
    pub id: String,
    pub author: Option<String>,
    pub pipeline_tag: Option<String>,
    pub tags: Vec<String>,
    pub likes: Option<u64>,
    pub downloads: Option<u64>,
    pub requires_token: bool,
}

impl HuggingFaceModelInfo {
    /// Construye una tarjeta de modelo a partir de datos crudos provenientes de la API.
    fn from_raw(raw: RawModelSummary) -> Self {
        let requires_token = raw.private || raw.gated;
        Self {
            id: raw.model_id,
            author: raw.author,
            pipeline_tag: raw.pipeline_tag,
            tags: raw.tags,
            likes: raw.likes,
            downloads: raw.downloads,
            requires_token,
        }
    }

    /// Genera un modelo ficticio utilizado como placeholder cuando no hay búsqueda previa.
    pub fn placeholder(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            author: None,
            pipeline_tag: None,
            tags: Vec::new(),
            likes: None,
            downloads: None,
            requires_token: false,
        }
    }
}

/// Busca modelos en Hugging Face y devuelve una lista de metadatos resumidos.
pub fn search_models(query: &str, token: Option<&str>) -> Result<Vec<HuggingFaceModelInfo>> {
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
        .map(HuggingFaceModelInfo::from_raw)
        .collect())
}

/// Descarga metadatos básicos del modelo y los almacena en disco dentro del directorio indicado.
pub fn download_model(model_id: &str, install_dir: &Path, token: Option<&str>) -> Result<PathBuf> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("No se pudo crear el cliente HTTP para Hugging Face")?;

    let mut request = client.get(format!("https://huggingface.co/api/models/{}", model_id));
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

    let target_dir = install_dir.join(model_id.replace('/', "_"));
    fs::create_dir_all(&target_dir)
        .with_context(|| format!("No se pudo crear el directorio {:?}", target_dir))?;

    let metadata_path = target_dir.join("metadata.json");
    fs::write(&metadata_path, serde_json::to_string_pretty(&metadata)?)
        .with_context(|| format!("No se pudo escribir {:?}", metadata_path))?;

    Ok(target_dir)
}
