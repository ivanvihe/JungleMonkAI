mod audio;
mod config;
mod gpu;
mod midi;

use config::{Config, ConfigState, LayerConfig};
use log::error;
use tauri::{Manager, State};

#[tauri::command]
async fn set_layer_opacity(layer: String, opacity: f32, state: State<'_, ConfigState>) {
    let mut cfg = state.inner.write().unwrap();
    if let Some(l) = cfg.layers.get_mut(&layer) {
        l.opacity = opacity;
    } else {
        cfg.layers.insert(
            layer.clone(),
            LayerConfig {
                opacity,
                ..Default::default()
            },
        );
    }
}

#[tauri::command]
async fn get_config(state: State<'_, ConfigState>) -> Config {
    let cfg = state.inner.read().unwrap();
    cfg.clone()
}

#[tauri::command]
async fn save_config(state: State<'_, ConfigState>) -> Result<(), String> {
    let cfg = state.inner.read().unwrap();
    cfg.save(&state.path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_audio() {
    audio::stop();
}

fn main() {
    let config_path = tauri::api::path::app_config_dir(&tauri::Config::default())
        .unwrap_or(std::path::PathBuf::from("."))
        .join("config.json");
    let cfg = Config::load(&config_path);

    tauri::Builder::default()
        .manage(ConfigState { path: config_path, inner: std::sync::Mutex::new(cfg) })
        .invoke_handler(tauri::generate_handler![set_layer_opacity, get_config, save_config, stop_audio])

        .setup(|app| {
            if let Err(e) = midi::start(app.handle().clone()) {
                error!("failed to start midi: {e:?}");
                let _ = app.emit_all("error", format!("midi start error: {e}"));
            }
            if let Err(e) = audio::start(app.handle().clone()) {
                error!("failed to start audio: {e:?}");
                let _ = app.emit_all("error", format!("audio start error: {e}"));
            }
            tauri::async_runtime::spawn(gpu::init());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
