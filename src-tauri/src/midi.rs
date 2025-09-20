use crate::config::ConfigState;
use midir::{Ignore, MidiInput, MidiInputConnection};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct MidiState {
    pub connection: Mutex<Option<MidiInputConnection<()>>>,
}

impl Default for MidiState {
    fn default() -> Self {
        Self { connection: Mutex::new(None) }
    }
}

impl Drop for MidiState {
    fn drop(&mut self) {
        if let Some(conn) = self.connection.lock().unwrap().take() {
            drop(conn);
        }
    }

}

#[tauri::command]
pub fn list_midi_ports() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("tauri-midi").map_err(|e| e.to_string())?;
    Ok(midi_in.ports().iter().filter_map(|p| midi_in.port_name(p).ok()).collect())
}

fn connect_port(port_name: &str, app: AppHandle, state: &State<MidiState>) -> Result<(), String> {
    {
        let mut lock = state.connection.lock().unwrap();
        if let Some(conn) = lock.take() {
            drop(conn);
        }
    }

    let mut midi_in = MidiInput::new("tauri-midi").map_err(|e| e.to_string())?;
    midi_in.ignore(Ignore::None);
    let ports = midi_in.ports();
    let port = ports
        .into_iter()
        .find(|p| midi_in.port_name(p).ok().map(|n| n == port_name).unwrap_or(false))
        .ok_or_else(|| "port not found".to_string())?;

    let app_clone = app.clone();
    let conn = midi_in
        .connect(&port, "midir", move |_stamp, message, _| {
            if message.len() >= 3 {
                let status = message[0];
                let channel = status & 0x0F;

                if (13..=15).contains(&channel) {
                    let note = message[1];
                    let vel = message[2];
                    let _ = app_clone.emit_all("midi", &(channel + 1, note, vel));
                }
            }
        }, ())
        .map_err(|e| e.to_string())?;

    let mut lock = state.connection.lock().unwrap();
    *lock = Some(conn);


    Ok(())
}

#[tauri::command]
pub fn select_midi_port(
    port_name: String,
    app: AppHandle,
    midi_state: State<MidiState>,
    config: State<ConfigState>,
) -> Result<(), String> {
    {
        let mut cfg = config.inner.lock().unwrap();
        cfg.midi_port = Some(port_name.clone());
    }
    connect_port(&port_name, app, &midi_state)
}

pub fn start(app: AppHandle) {
    let midi_state = app.state::<MidiState>();
    let cfg_state = app.state::<ConfigState>();
    let port = { cfg_state.inner.lock().unwrap().midi_port.clone() };
    if let Some(p) = port {
        if let Err(e) = connect_port(&p, app, &midi_state) {
            eprintln!("midi error: {e:?}");
        }
    }
}

