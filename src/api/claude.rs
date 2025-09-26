use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashSet;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type", default)]
    r#type: Option<String>,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnthropicModel {
    pub id: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub context_window: Option<u32>,
    #[serde(default)]
    pub input_token_limit: Option<u32>,
    #[serde(default)]
    pub output_token_limit: Option<u32>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(rename = "type", default)]
    pub r#type: Option<String>,
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

    let mut last_not_found: Option<(String, String)> = None;

    for candidate in build_model_candidates(model) {
        match send_request(&client, api_key, &candidate, prompt) {
            Ok(reply) => return Ok(reply),
            Err(RequestError::Api {
                error_type,
                message,
            }) => {
                if error_type.as_deref() == Some("not_found_error") {
                    last_not_found = Some((candidate, message));
                    continue;
                }

                let code = error_type.unwrap_or_else(|| "error_desconocido".to_string());
                return Err(anyhow!("Anthropic devolvió un error ({code}): {message}"));
            }
            Err(RequestError::Transport(err)) => return Err(err),
        }
    }

    if let Some((attempted_model, message)) = last_not_found {
        return Err(anyhow!(
            "Anthropic devolvió un error (not_found_error): {message} (modelo intentado: {attempted_model})"
        ));
    }

    Err(anyhow!(
        "Anthropic no devolvió una respuesta válida para el modelo especificado."
    ))
}

#[derive(Debug, Deserialize)]
struct ModelListResponse {
    data: Vec<AnthropicModel>,
}

/// Obtiene el catálogo completo de modelos disponibles para la cuenta de Anthropic.
pub fn list_models(api_key: &str) -> Result<Vec<AnthropicModel>> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(45))
        .build()
        .context("No se pudo crear el cliente HTTP para Anthropic")?;

    let response = client
        .get("https://api.anthropic.com/v1/models")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .map_err(|err| anyhow!("Error solicitando el listado de modelos: {}", err))?;

    let status = response.status();
    let body = response.text().map_err(|err| {
        anyhow!(
            "No se pudo leer la respuesta del listado de modelos de Anthropic: {}",
            err
        )
    })?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<AnthropicErrorResponse>(&body) {
            let code = error
                .error
                .r#type
                .unwrap_or_else(|| "error_desconocido".to_string());
            return Err(anyhow!(
                "Anthropic devolvió un error ({code}) al listar modelos: {}",
                error.error.message
            ));
        }

        return Err(anyhow!(
            "Anthropic devolvió un estado {} al listar modelos: {}",
            status,
            body
        ));
    }

    let mut response: ModelListResponse = serde_json::from_str(&body).map_err(|err| {
        anyhow!(
            "No se pudo interpretar el listado de modelos de Anthropic: {}",
            err
        )
    })?;

    response
        .data
        .sort_by(|a, b| a.id.to_lowercase().cmp(&b.id.to_lowercase()));

    Ok(response.data)
}

fn send_request(
    client: &Client,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<String, RequestError> {
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
        .map_err(|err| {
            RequestError::Transport(anyhow!("Error enviando la solicitud a Anthropic: {}", err))
        })?;

    let status = response.status();
    let body = response.text().map_err(|err| {
        RequestError::Transport(anyhow!(
            "No se pudo leer la respuesta de Anthropic: {}",
            err
        ))
    })?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<AnthropicErrorResponse>(&body) {
            return Err(RequestError::Api {
                error_type: error.error.r#type,
                message: error.error.message,
            });
        }

        return Err(RequestError::Transport(anyhow!(
            "Anthropic devolvió un estado {}: {}",
            status,
            body
        )));
    }

    let parsed: AnthropicResponse = serde_json::from_str(&body).map_err(|err| {
        RequestError::Transport(anyhow!(
            "No se pudo interpretar la respuesta de Anthropic: {}",
            err
        ))
    })?;

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

fn build_model_candidates(model: &str) -> Vec<String> {
    let trimmed = model.trim();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    if trimmed.is_empty() {
        return vec![String::new()];
    }

    add_candidate(trimmed, &mut candidates, &mut seen);

    if trimmed.contains('.') {
        let replaced = trimmed.replace('.', "-");
        add_candidate(&replaced, &mut candidates, &mut seen);
    }

    if trimmed.contains("3.5") {
        let replaced = trimmed.replace("3.5", "3-5");
        add_candidate(&replaced, &mut candidates, &mut seen);
    }

    if trimmed.contains("4.1") {
        let replaced = trimmed.replace("4.1", "4-1");
        add_candidate(&replaced, &mut candidates, &mut seen);
    }

    if trimmed.contains("4-1") {
        let replaced = trimmed.replace("4-1", "4.1");
        add_candidate(&replaced, &mut candidates, &mut seen);
    }

    candidates
}

fn add_candidate(base: &str, candidates: &mut Vec<String>, seen: &mut HashSet<String>) {
    push_candidate(base.to_string(), candidates, seen);

    if let Some(mapped) = map_known_alias(base) {
        push_candidate(mapped.to_string(), candidates, seen);
    }

    if !has_explicit_version(base) && !base.ends_with("-latest") {
        push_candidate(format!("{base}-latest"), candidates, seen);
    }
}

fn push_candidate(value: String, candidates: &mut Vec<String>, seen: &mut HashSet<String>) {
    if seen.insert(value.clone()) {
        candidates.push(value);
    }
}

fn has_explicit_version(model: &str) -> bool {
    model.contains("-20")
}

fn map_known_alias(model: &str) -> Option<&'static str> {
    match model {
        "claude-3-opus" | "claude-opus" | "claude-3-opus-latest" => Some("claude-3-opus-20240229"),
        "claude-3-sonnet" | "claude-sonnet" | "claude-3-sonnet-latest" => {
            Some("claude-3-sonnet-20240229")
        }
        "claude-3-haiku" | "claude-haiku" | "claude-3-haiku-latest" => {
            Some("claude-3-haiku-20240307")
        }
        "claude-3-5-sonnet" | "claude-35-sonnet" | "claude-3-5-sonnet-latest" => {
            Some("claude-3-5-sonnet-20241022")
        }
        "claude-3-5-haiku" | "claude-35-haiku" | "claude-3-5-haiku-latest" => {
            Some("claude-3-5-haiku-20241022")
        }
        _ => None,
    }
}

enum RequestError {
    Api {
        error_type: Option<String>,
        message: String,
    },
    Transport(anyhow::Error),
}
