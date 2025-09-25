use std::process::Command;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;

use crate::local_providers::{LocalModelCard, LocalModelProvider};

#[derive(Debug, Deserialize, Default)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize, Default)]
struct OllamaModel {
    name: String,
    #[serde(default)]
    size: Option<String>,
    #[serde(default)]
    details: Option<OllamaDetails>,
}

#[derive(Debug, Deserialize, Default)]
struct OllamaDetails {
    #[serde(default)]
    family: Option<String>,
    #[serde(default, rename = "parameter_size")]
    parameters: Option<String>,
    #[serde(default, rename = "quantization_level")]
    quantization: Option<String>,
}

fn resolve_host(token: Option<&str>) -> String {
    let host = token.unwrap_or_default().trim();
    if host.is_empty() {
        "http://localhost:11434".to_string()
    } else {
        host.trim_end_matches('/').to_string()
    }
}

/// Query the Ollama daemon for the list of available model tags.
pub fn search_models(query: &str, token: Option<&str>) -> Result<Vec<LocalModelCard>> {
    let host = resolve_host(token);

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("No se pudo crear el cliente HTTP para Ollama")?;

    let url = format!("{}/api/tags", host);
    let response: OllamaTagsResponse = client
        .get(&url)
        .send()
        .context("No se pudo consultar la lista de modelos de Ollama")?
        .error_for_status()
        .context("Ollama devolvió un estado de error")?
        .json()
        .context("No se pudo interpretar la respuesta de Ollama")?;

    let needle = query.to_lowercase();

    Ok(response
        .models
        .into_iter()
        .filter(|model| model.name.to_lowercase().contains(&needle))
        .map(|model| {
            let details = model.details.unwrap_or_default();

            let mut tags = Vec::new();
            if let Some(ref family) = details.family {
                tags.push(family.clone());
            }
            if let Some(ref parameters) = details.parameters {
                tags.push(parameters.clone());
            }
            if let Some(ref quantization) = details.quantization {
                tags.push(quantization.clone());
            }
            if let Some(size) = model.size {
                tags.push(size);
            }

            LocalModelCard {
                provider: LocalModelProvider::Ollama,
                id: model.name,
                author: details.family,
                pipeline_tag: Some("text-generation".to_string()),
                tags,
                likes: None,
                downloads: None,
                requires_token: false,
                description: None,
            }
        })
        .collect())
}

/// Attempt to pull a model using the local `ollama` binary.
pub fn pull_model(model: &str, token: Option<&str>) -> Result<()> {
    let host = resolve_host(token);

    let mut command = Command::new("ollama");
    command.arg("pull").arg(model);

    if host != "http://localhost:11434" {
        command.env("OLLAMA_HOST", &host);
    }

    let output = command
        .output()
        .context("No se pudo invocar al binario de Ollama")?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!(
            "ollama pull falló (salida: {} {}): {}",
            stdout.trim(),
            stderr.trim(),
            output.status
        ));
    }

    Ok(())
}
