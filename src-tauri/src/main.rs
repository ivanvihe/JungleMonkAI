mod ableton;
mod ai;
mod audio;
mod config;
mod git;
mod gpu;
mod midi;
mod models;
mod plugins;
mod settings;
mod vscode;

use config::{Config, ConfigState, LayerConfig};
use git::{
    apply_patch as git_apply_patch, commit_changes as git_commit_changes,
    create_pull_request as git_create_pull_request, get_file_diff as git_get_file_diff,
    get_repository_context as git_get_repository_context,
    has_secret as git_has_secret, list_repository_files as git_list_repository_files,
    list_user_repos as git_list_user_repos, pull_changes as git_pull_changes,
    push_changes as git_push_changes, repository_status as git_repository_status,
    clone_repository as git_clone_repository, store_secret as git_store_secret, SecretManager,
};
use log::error;
use models::{activate_model, download_model, list_models, ModelRegistry};
use settings::{UserDataPathsInfo, UserDataPathsState};
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

#[tauri::command]
fn get_user_data_paths(state: State<'_, UserDataPathsState>) -> Result<UserDataPathsInfo, String> {
    Ok(state.info())
}

#[tauri::command]
fn set_user_data_base_dir(
    path: String,
    state: State<'_, UserDataPathsState>,
) -> Result<UserDataPathsInfo, String> {
    let candidate = std::path::PathBuf::from(path);
    state
        .update_base_dir(candidate)
        .map_err(|error| error.to_string())
}

fn main() {
    let app_config = tauri::Config::default();
    let legacy_config_dir = tauri::api::path::app_config_dir(&app_config)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let legacy_data_dir = tauri::api::path::app_data_dir(&app_config)
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let user_paths =
        settings::UserDataPaths::initialize(legacy_config_dir.clone(), legacy_data_dir.clone())
            .expect("no se pudo inicializar las rutas de datos de usuario");

    let config_dir = user_paths.config_dir();
    let data_dir = user_paths.data_dir();

    let config_path = config_dir.join("config.json");
    let models_manifest = data_dir.join("models.json");
    let models_dir = data_dir.join("models");

    let cfg = Config::load(&config_path);
    let plugins_dir = config_dir.join("plugins");
    let model_registry = ModelRegistry::load(models_manifest, models_dir)
        .expect("no se pudo cargar el inventario de modelos");

    tauri::Builder::default()
        .manage(ConfigState {
            path: config_path,
            inner: std::sync::RwLock::new(cfg),
        })
        .manage(UserDataPathsState::new(user_paths))
        .manage(
            SecretManager::new("JungleMonkAI", config_dir.clone())
                .expect("no se pudo inicializar el gestor de secretos"),
        )
        .manage(model_registry)
        .manage(
            plugins::PluginManager::new(plugins_dir.clone())
                .expect("no se pudo inicializar el gestor de plugins"),
        )
        .manage(ableton::AbletonState::default())
        .manage(vscode::VsCodeBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            set_layer_opacity,
            get_config,
            save_config,
            stop_audio,
            list_models,
            download_model,
            activate_model,
            ai::providers_chat,
            git_list_repository_files,
            git_repository_status,
            git_apply_patch,
            git_commit_changes,
            git_push_changes,
            git_pull_changes,
            git_create_pull_request,
            git_get_file_diff,
            git_store_secret,
            git_has_secret,
            git_get_repository_context,
            git_list_user_repos,
            git_clone_repository,
            git::reveal_secret,
            get_user_data_paths,
            set_user_data_base_dir,
            plugins::plugin_list,
            plugins::plugin_invoke
        ])
        .setup(|app| {
            if let Some(manager) = app.try_state::<plugins::PluginManager>() {
                if let Err(error) = manager.refresh() {
                    error!("failed to load plugins: {error:?}");
                }
            }
            if let Err(e) = midi::start(app.handle().clone()) {
                error!("failed to start midi: {e:?}");
                let _ = app.emit_all("error", format!("midi start error: {e}"));
            }
            if let Err(e) = ableton::start(app.handle().clone()) {
                error!("failed to start ableton bridge: {e:?}");
            }
            if let Err(e) = audio::start(app.handle().clone()) {
                error!("failed to start audio: {e:?}");
                let _ = app.emit_all("error", format!("audio start error: {e}"));
            }
            if let Err(e) = vscode::start(app.handle().clone()) {
                error!("failed to start vscode bridge: {e:?}");
            }
            tauri::async_runtime::spawn(gpu::init());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
