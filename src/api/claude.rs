use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicContent>,
}

/// Envía un mensaje a la API de Anthropic Claude y devuelve la primera respuesta textual.
pub fn send_message(api_key: &str, model: &str, prompt: &str) -> Result<String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .context("No se pudo crear el cliente HTTP para Anthropic")?;

    let payload = json!({
        "model": model,
        "max_tokens": 256,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    }
                ],
            }
        ],
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send()
        .context("Error enviando la solicitud a Anthropic")?
        .error_for_status()
        .context("Anthropic devolvió un estado de error")?;

    let parsed: AnthropicResponse = response
        .json()
        .context("No se pudo interpretar la respuesta de Anthropic")?;

    let reply = parsed
        .content
        .into_iter()
        .find_map(|content| {
            let trimmed = content.text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .unwrap_or_else(|| "(respuesta vacía)".to_string());

    Ok(reply)
}
