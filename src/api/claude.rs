use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type", default)]
    r#type: Option<String>,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorDetail {
    #[serde(default)]
    message: String,
    #[serde(rename = "type", default)]
    r#type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorResponse {
    error: AnthropicErrorDetail,
}

/// Envía un mensaje a la API de Anthropic Claude y devuelve la primera respuesta textual.
pub fn send_message(api_key: &str, model: &str, prompt: &str) -> Result<String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(45))
        .build()
        .context("No se pudo crear el cliente HTTP para Anthropic")?;

    let payload = json!({
        "model": model,
        "max_tokens": 512,
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
        .context("Error enviando la solicitud a Anthropic")?;

    let status = response.status();
    let body = response
        .text()
        .context("No se pudo leer la respuesta de Anthropic")?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<AnthropicErrorResponse>(&body) {
            let code = error.error.r#type.as_deref().unwrap_or("error_desconocido");
            return Err(anyhow!(
                "Anthropic devolvió un error ({code}): {}",
                error.error.message
            ));
        }

        return Err(anyhow!("Anthropic devolvió un estado {}: {}", status, body));
    }

    let parsed: AnthropicResponse =
        serde_json::from_str(&body).context("No se pudo interpretar la respuesta de Anthropic")?;

    let reply = parsed
        .content
        .into_iter()
        .find_map(|content| {
            if let Some(block_type) = content.r#type.as_deref() {
                if block_type != "text" {
                    return None;
                }
            }

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
