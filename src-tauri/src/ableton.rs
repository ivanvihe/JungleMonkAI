use crate::config::ConfigState;
use midir::{MidiOutput, MidiOutputConnection};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct AbletonState {
    connection: Mutex<Option<MidiOutputConnection>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AbletonPayload {
    #[serde(default)]
    message_id: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    scene: Option<u8>,
    #[serde(default)]
    capability_id: Option<String>,
    #[serde(default)]
    permission_id: Option<String>,
}

fn connect_output(port_name: &str) -> Result<MidiOutputConnection, String> {
    let mut midi_out = MidiOutput::new("jungle-ableton").map_err(|err| err.to_string())?;
    let ports = midi_out.ports();
    let port = ports
        .iter()
        .find(|candidate| {
            midi_out
                .port_name(candidate)
                .ok()
                .map(|name| name == port_name)
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("No se encontró el puerto MIDI «{}»", port_name))?;

    midi_out
        .connect(port, "jungle-ableton-out")
        .map_err(|err| err.to_string())
}

fn ensure_connection(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AbletonState>();
    let port_name = {
        let cfg_state = app.state::<ConfigState>();
        cfg_state
            .inner
            .read()
            .map_err(|err| err.to_string())?
            .midi_port
            .clone()
            .ok_or_else(|| "No hay un puerto MIDI configurado para Ableton".to_string())?
    };

    let mut guard = state
        .connection
        .lock()
        .map_err(|_| "No se pudo bloquear el estado de Ableton".to_string())?;

    if guard.is_none() {
        *guard = Some(connect_output(&port_name)?);
    }

    Ok(())
}

fn extract_scene(payload: &AbletonPayload) -> Option<u8> {
    if let Some(scene) = payload.scene {
        return Some(scene);
    }

    let value = payload.value.as_deref()?;
    for token in value
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .filter(|token| !token.is_empty())
    {
        if let Ok(scene) = token.parse::<u8>() {
            return Some(scene);
        }
    }

    None
}

fn default_channel(app: &AppHandle) -> u8 {
    let cfg_state = app.state::<ConfigState>();
    cfg_state
        .inner
        .read()
        .ok()
        .and_then(|cfg| cfg.layers.values().next().map(|layer| layer.midi_channel))
        .unwrap_or(0)
}

fn send_message(app: &AppHandle, data: &[u8]) -> Result<(), String> {
    ensure_connection(app)?;
    let state = app.state::<AbletonState>();
    let mut guard = state
        .connection
        .lock()
        .map_err(|_| "No se pudo acceder a la conexión MIDI")?;
    if let Some(connection) = guard.as_mut() {
        connection.send(data).map_err(|err| err.to_string())?;
    } else {
        return Err("No hay conexión MIDI activa".to_string());
    }
    Ok(())
}

fn trigger_scene(app: &AppHandle, payload: AbletonPayload) -> Result<serde_json::Value, String> {
    let scene = extract_scene(&payload).ok_or_else(|| {
        "No se pudo inferir la escena a disparar a partir del mensaje MCP".to_string()
    })?;
    let channel = default_channel(app).min(15);
    let note = scene.saturating_add(60);

    send_message(app, &[0x90 | channel, note, 0x7F])?;
    send_message(app, &[0x80 | channel, note, 0x00])?;

    let _ = app.emit_all(
        "ableton-remote:scene",
        serde_json::json!({
            "messageId": payload.message_id,
            "scene": scene,
        }),
    );

    Ok(serde_json::json!({
        "status": "scene-triggered",
        "scene": scene,
    }))
}

fn stop_transport(app: &AppHandle) -> Result<serde_json::Value, String> {
    let channel = default_channel(app).min(15);
    send_message(app, &[0xB0 | channel, 0x7B, 0x00])?;
    send_message(app, &[0xFC])?;
    Ok(serde_json::json!({ "status": "transport-stopped" }))
}

pub fn handle_plugin_command(
    app: &AppHandle,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match command {
        "trigger_scene" => {
            let payload: AbletonPayload = serde_json::from_value(payload)
                .map_err(|err| format!("Payload inválido para trigger_scene: {err}"))?;
            trigger_scene(app, payload)
        }
        "stop_transport" => stop_transport(app),
        other => Ok(serde_json::json!({
            "status": "queued",
            "command": other,
        })),
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    if let Err(error) = ensure_connection(&app) {
        eprintln!("[ableton] no se pudo preparar la conexión: {error}");
    }
    Ok(())
}
