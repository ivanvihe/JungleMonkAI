use crate::git;
use crate::git::CommitRequest;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::accept_async;

const DEFAULT_BRIDGE_PORT: u16 = 17_654;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BridgeEvent {
    FocusMessage { message_id: String, content: String },
    PatchAvailable { message_id: String, patch: String },
}

pub struct VsCodeBridgeState {
    pub port: Mutex<Option<u16>>,
    pub broadcaster: broadcast::Sender<BridgeEvent>,
}

impl Default for VsCodeBridgeState {
    fn default() -> Self {
        let (tx, _rx) = broadcast::channel(32);
        Self {
            port: Mutex::new(None),
            broadcaster: tx,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum BridgeRequest {
    ApplyPatch {
        repo_path: String,
        patch: String,
        #[serde(default)]
        dry_run: bool,
    },
    CommitChanges {
        repo_path: String,
        message: String,
        #[serde(default)]
        files: Option<Vec<String>>,
        #[serde(default)]
        author_name: Option<String>,
        #[serde(default)]
        author_email: Option<String>,
        #[serde(default)]
        allow_empty: Option<bool>,
    },
    Ping {},
}

#[derive(Debug, Deserialize)]
struct BridgeEnvelope {
    #[serde(default)]
    id: Option<String>,
    #[serde(flatten)]
    payload: BridgeRequest,
}

#[derive(Debug, Serialize)]
struct BridgeResponse<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<&'a str>,
    status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

async fn handle_bridge_request(
    request: BridgeEnvelope,
) -> Result<Option<serde_json::Value>, String> {
    match request.payload {
        BridgeRequest::ApplyPatch {
            repo_path,
            patch,
            dry_run,
        } => {
            tauri::async_runtime::spawn_blocking(move || {
                git::apply_patch(repo_path, patch, dry_run)
            })
            .await
            .map_err(|err| err.to_string())?
            .map_err(|err| err)?;
            Ok(Some(serde_json::json!({
                "status": "ok",
                "id": request.id,
            })))
        }
        BridgeRequest::CommitChanges {
            repo_path,
            message,
            files,
            author_name,
            author_email,
            allow_empty,
        } => {
            let payload = CommitRequest {
                repo_path,
                message,
                files,
                author_name,
                author_email,
                allow_empty,
            };
            tauri::async_runtime::spawn_blocking(move || git::commit_changes(payload))
                .await
                .map_err(|err| err.to_string())?
                .map_err(|err| err)?;
            Ok(Some(serde_json::json!({
                "status": "ok",
                "id": request.id,
            })))
        }
        BridgeRequest::Ping {} => Ok(Some(serde_json::json!({
            "status": "ok",
            "id": request.id,
        }))),
    }
}

async fn serve_connection(
    socket: tokio::net::TcpStream,
    events: broadcast::Sender<BridgeEvent>,
) -> anyhow::Result<()> {
    let peer: SocketAddr = socket.peer_addr()?;
    let ws_stream = accept_async(socket).await?;
    let (mut sender, mut receiver) = ws_stream.split();
    let mut event_rx = events.subscribe();

    loop {
        tokio::select! {
            result = receiver.next() => {
                match result {
                    Some(Ok(message)) if message.is_text() => {
                        let payload: Result<BridgeEnvelope, _> = serde_json::from_str(message.to_text().unwrap_or(""));
                        let envelope = match payload {
                            Ok(value) => value,
                            Err(error) => {
                                let response = serde_json::to_string(&BridgeResponse {
                                    id: None,
                                    status: "error",
                                    message: Some(format!("JSON inválido: {error}")),
                                })?;
                                sender.send(tokio_tungstenite::tungstenite::Message::Text(response)).await?;
                                continue;
                            }
                        };

                        match handle_bridge_request(envelope).await {
                            Ok(Some(response)) => {
                                sender
                                    .send(tokio_tungstenite::tungstenite::Message::Text(
                                        response.to_string(),
                                    ))
                                    .await?;
                            }
                            Ok(None) => {}
                            Err(error) => {
                                let response = serde_json::to_string(&BridgeResponse {
                                    id: None,
                                    status: "error",
                                    message: Some(error),
                                })?;
                                sender
                                    .send(tokio_tungstenite::tungstenite::Message::Text(response))
                                    .await?;
                            }
                        }
                    }
                    Some(Ok(message)) if message.is_close() => {
                        break;
                    }
                    Some(Err(error)) => {
                        eprintln!("[vscode-bridge] error leyendo de {peer:?}: {error}");
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
            event = event_rx.recv() => {
                match event {
                    Ok(payload) => {
                        let serialized = serde_json::to_string(&payload)?;
                        if sender
                            .send(tokio_tungstenite::tungstenite::Message::Text(serialized))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
        }
    }

    Ok(())
}

async fn run_server(
    app: AppHandle,
    port: u16,
    events: broadcast::Sender<BridgeEvent>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    let mut guard = app
        .state::<VsCodeBridgeState>()
        .port
        .lock()
        .map_err(|_| anyhow::anyhow!("No se pudo bloquear el estado del bridge"))?;
    *guard = Some(port);
    drop(guard);

    loop {
        let (stream, _) = listener.accept().await?;
        let events_clone = events.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = serve_connection(stream, events_clone).await {
                eprintln!("[vscode-bridge] conexión terminada con error: {error:?}");
            }
        });
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let port = std::env::var("VSCODE_BRIDGE_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_BRIDGE_PORT);
    let events = app.state::<VsCodeBridgeState>().broadcaster.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_server(app_handle.clone(), port, events).await {
            eprintln!("[vscode-bridge] no se pudo iniciar el servidor: {error:?}");
            let _ = app_handle.emit_all(
                "vscode-bridge:error",
                serde_json::json!({
                    "message": format!("Error iniciando bridge VS Code: {error}"),
                }),
            );
        }
    });
    Ok(())
}

fn broadcast_event(app: &AppHandle, event: BridgeEvent) -> Result<serde_json::Value, String> {
    let broadcaster = app.state::<VsCodeBridgeState>().broadcaster.clone();
    match broadcaster.send(event.clone()) {
        Ok(_) => Ok(serde_json::json!({ "status": "sent" })),
        Err(broadcast::error::SendError::Lagged(_)) => Ok(serde_json::json!({
            "status": "queued",
            "warning": "Se descartaron eventos previos por retraso",
        })),
        Err(broadcast::error::SendError::Closed(_)) => {
            Err("El bridge de VS Code no está disponible en este momento".to_string())
        }
    }
}

pub fn handle_plugin_command(
    app: &AppHandle,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match command {
        "focus_message" => {
            let message_id = payload
                .get("messageId")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            let content = payload
                .get("value")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            broadcast_event(
                app,
                BridgeEvent::FocusMessage {
                    message_id,
                    content,
                },
            )
        }
        "send_patch" => {
            let message_id = payload
                .get("messageId")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            let patch = payload
                .get("value")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            if patch.trim().is_empty() {
                return Err("El mensaje MCP no contiene un diff para sincronizar".to_string());
            }
            broadcast_event(app, BridgeEvent::PatchAvailable { message_id, patch })
        }
        other => Ok(serde_json::json!({
            "status": "queued",
            "command": other,
        })),
    }
}
