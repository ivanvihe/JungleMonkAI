use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;

use crate::local_providers::{LocalModelCard, LocalModelProvider};

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    #[serde(default)]
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModel {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    architecture: Option<OpenRouterArchitecture>,
}

#[derive(Debug, Deserialize, Default)]
struct OpenRouterArchitecture {
    #[serde(default)]
    modality: Option<String>,
    #[serde(default)]
    input_modalities: Vec<String>,
    #[serde(default)]
    output_modalities: Vec<String>,
}

/// Fetches the public OpenRouter catalog and filters it using the provided query.
pub fn search_models(query: &str) -> Result<Vec<LocalModelCard>> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("No se pudo crear el cliente HTTP para OpenRouter")?;

    let response: OpenRouterResponse = client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .context("No se pudo enviar la petición a OpenRouter")?
        .error_for_status()
        .context("OpenRouter devolvió un estado de error")?
        .json()
        .context("No se pudo interpretar la respuesta de OpenRouter")?;

    let needle = query.to_lowercase();

    Ok(response
        .data
        .into_iter()
        .filter(|model| {
            model.id.to_lowercase().contains(&needle)
                || model
                    .name
                    .as_ref()
                    .map(|value| value.to_lowercase().contains(&needle))
                    .unwrap_or(false)
                || model
                    .description
                    .as_ref()
                    .map(|value| value.to_lowercase().contains(&needle))
                    .unwrap_or(false)
        })
        .map(|model| {
            let mut tags = Vec::new();
            if let Some(arch) = model.architecture.as_ref() {
                if let Some(modality) = arch.modality.as_ref() {
                    tags.push(modality.to_string());
                }
                tags.extend(
                    arch.input_modalities
                        .iter()
                        .map(|value| format!("input:{}", value.to_lowercase())),
                );
                tags.extend(
                    arch.output_modalities
                        .iter()
                        .map(|value| format!("output:{}", value.to_lowercase())),
                );
            }

            let author = model
                .name
                .as_ref()
                .and_then(|name| name.split(':').next())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            LocalModelCard {
                provider: LocalModelProvider::OpenRouter,
                id: model.id,
                author,
                pipeline_tag: None,
                tags,
                likes: None,
                downloads: None,
                requires_token: true,
                description: model.description,
            }
        })
        .take(50)
        .collect())
}
