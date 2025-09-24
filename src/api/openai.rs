use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct ChatMessage {
    #[serde(default)]
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<ChatChoice>,
}

/// Envía un mensaje a la API de OpenAI y devuelve la respuesta de chat generada.
pub fn send_message(api_key: &str, model: &str, prompt: &str) -> Result<String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .context("No se pudo crear el cliente HTTP para OpenAI")?;

    let payload = json!({
        "model": model,
        "max_tokens": 256,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "Eres un asistente que responde con frases breves."},
            {"role": "user", "content": prompt},
        ],
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .context("Error enviando la solicitud a OpenAI")?
        .error_for_status()
        .context("OpenAI devolvió un estado de error")?;

    let parsed: ChatResponse = response
        .json()
        .context("No se pudo interpretar la respuesta de OpenAI")?;

    let reply = parsed
        .choices
        .into_iter()
        .find_map(|choice| {
            let trimmed = choice.message.content.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .unwrap_or_else(|| "(respuesta vacía)".to_string());

    Ok(reply)
}
