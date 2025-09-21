use log::error;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;

const GROQ_ENDPOINT: &str = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

const REQUEST_TIMEOUT_SECS: u64 = 60;
const MAX_ATTEMPTS: u8 = 2;
const RETRYABLE_STATUS_CODES: [u16; 7] = [408, 425, 429, 500, 502, 503, 504];
const RETRY_DELAY_BASE_MS: u64 = 250;

#[derive(Debug, Deserialize)]
pub struct ProviderCommandRequest {
    #[serde(rename = "apiKey")]
    api_key: String,
    body: Value,
}

fn mask_api_key(api_key: &str) -> String {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return "(vacía)".to_string();
    }

    if trimmed.len() <= 8 {
        return "***".to_string();
    }

    format!("{}…{}", &trimmed[..4], &trimmed[trimmed.len() - 4..])
}

fn extract_error_message(payload: &Value) -> Option<String> {
    payload
        .pointer("/error/message")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            payload
                .get("error")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .or_else(|| {
            payload
                .get("message")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
}

async fn execute_post_request(
    provider_name: &str,
    url: &str,
    api_key: &str,
    api_key_header: (&str, Option<&str>),
    body: &Value,
    extra_headers: &[(&str, &str)],
) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| error.to_string())?;

    let trimmed_key = api_key.trim();
    let (header_name, prefix) = api_key_header;
    let mut last_error: Option<String> = None;

    for attempt in 1..=MAX_ATTEMPTS {
        let mut request = client.post(url).header("Content-Type", "application/json");

        let header_value = match prefix {
            Some(prefix) => format!("{} {}", prefix, trimmed_key),
            None => trimmed_key.to_string(),
        };
        request = request.header(header_name, header_value).json(body);

        for (key, value) in extra_headers {
            request = request.header(*key, *value);
        }

        let result = request.send().await;

        let (message, retryable) = match result {
            Ok(response) => {
                let status = response.status();
                let bytes = match response.bytes().await {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        last_error = Some(error.to_string());
                        error!(
                            "[{}] fallo al leer respuesta (intento {}): {} (api_key: {})",
                            provider_name,
                            attempt,
                            error,
                            mask_api_key(trimmed_key),
                        );
                        if attempt == MAX_ATTEMPTS {
                            return Err(error.to_string());
                        }
                        sleep(Duration::from_millis(RETRY_DELAY_BASE_MS * attempt as u64)).await;
                        continue;
                    }
                };

                if status.is_success() {
                    return serde_json::from_slice::<Value>(&bytes).map_err(|error| error.to_string());
                }

                let status_code = status.as_u16();
                let mut message = None;
                if let Ok(payload) = serde_json::from_slice::<Value>(&bytes) {
                    if let Some(extracted) = extract_error_message(&payload) {
                        message = Some(extracted);
                    }
                }

                if message.is_none() {
                    let body_text = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !body_text.is_empty() {
                        message = Some(body_text);
                    }
                }

                let final_message = message.unwrap_or_else(|| format!("Solicitud falló con estado {}", status));
                (final_message, RETRYABLE_STATUS_CODES.contains(&status_code))
            }
            Err(error) => (error.to_string(), true),
        };

        last_error = Some(message.clone());

        if retryable && attempt < MAX_ATTEMPTS {
            error!(
                "[{}] intento {} fallido: {} (api_key: {})",
                provider_name,
                attempt,
                message,
                mask_api_key(trimmed_key),
            );
            sleep(Duration::from_millis(RETRY_DELAY_BASE_MS * attempt as u64)).await;
            continue;
        }

        error!(
            "[{}] intento {} fallido: {} (api_key: {})",
            provider_name,
            attempt,
            message,
            mask_api_key(trimmed_key),
        );
        return Err(message);
    }

    Err(last_error.unwrap_or_else(|| format!(
        "No se pudo completar la solicitud para {}.",
        provider_name
    )))
}

#[tauri::command]
pub async fn providers_chat(
    provider: String,
    payload: ProviderCommandRequest,
) -> Result<Value, String> {
    match provider.to_lowercase().as_str() {
        "groq" => {
            execute_post_request(
                "Groq",
                GROQ_ENDPOINT,
                &payload.api_key,
                ("Authorization", Some("Bearer")),
                &payload.body,
                &[],
            )
            .await
        }
        "openai" => {
            execute_post_request(
                "OpenAI",
                OPENAI_ENDPOINT,
                &payload.api_key,
                ("Authorization", Some("Bearer")),
                &payload.body,
                &[],
            )
            .await
        }
        "anthropic" => {
            execute_post_request(
                "Anthropic",
                ANTHROPIC_ENDPOINT,
                &payload.api_key,
                ("x-api-key", None),
                &payload.body,
                &[("anthropic-version", ANTHROPIC_VERSION)],
            )
            .await
        }
        _ => Err(format!("Proveedor no soportado: {}", provider)),
    }
}
