use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

const GROQ_ENDPOINT: &str = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Deserialize)]
pub struct ProviderCommandRequest {
    #[serde(rename = "apiKey")]
    api_key: String,
    body: Value,
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
    url: &str,
    api_key: &str,
    api_key_header: (&str, Option<&str>),
    body: &Value,
    extra_headers: &[(&str, &str)],
) -> Result<Value, String> {
    let client = Client::new();
    let mut request = client.post(url).header("Content-Type", "application/json");

    let (header_name, prefix) = api_key_header;
    let header_value = match prefix {
        Some(prefix) => format!("{} {}", prefix, api_key),
        None => api_key.to_string(),
    };
    request = request.header(header_name, header_value).json(body);

    for (key, value) in extra_headers {
        request = request.header(*key, *value);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        if let Ok(payload) = serde_json::from_slice::<Value>(&bytes) {
            if let Some(message) = extract_error_message(&payload) {
                return Err(message);
            }
        }

        let body_text = String::from_utf8_lossy(&bytes).trim().to_string();
        if !body_text.is_empty() {
            return Err(body_text);
        }

        return Err(format!("Solicitud falló con estado {}", status));
    }

    serde_json::from_slice::<Value>(&bytes).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn call_groq_chat(request: ProviderCommandRequest) -> Result<Value, String> {
    execute_post_request(
        GROQ_ENDPOINT,
        &request.api_key,
        ("Authorization", Some("Bearer")),
        &request.body,
        &[],
    )
    .await
}

#[tauri::command]
pub async fn call_anthropic_chat(request: ProviderCommandRequest) -> Result<Value, String> {
    execute_post_request(
        ANTHROPIC_ENDPOINT,
        &request.api_key,
        ("x-api-key", None),
        &request.body,
        &[("anthropic-version", ANTHROPIC_VERSION)],
    )
    .await
}
