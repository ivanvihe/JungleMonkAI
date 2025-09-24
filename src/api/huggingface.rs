use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct ModelSummary {
    #[serde(rename = "modelId")]
    model_id: String,
}

/// Busca modelos en Hugging Face y devuelve una lista de identificadores.
pub fn search_models(query: &str, token: Option<&str>) -> Result<Vec<String>> {
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

    let models: Vec<ModelSummary> = response
        .json()
        .context("No se pudo interpretar la respuesta de búsqueda de Hugging Face")?;

    Ok(models.into_iter().map(|m| m.model_id).collect())
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
