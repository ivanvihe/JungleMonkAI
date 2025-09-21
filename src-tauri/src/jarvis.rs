use serde::Serialize;
use std::{
    env,
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::process::{Command, CommandChild, CommandEvent, TerminatedPayload};
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarvisStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub last_exit_code: Option<i32>,
    pub last_signal: Option<i32>,
    pub last_stdout: Option<String>,
    pub last_stderr: Option<String>,
    pub last_error: Option<String>,
}

impl Default for JarvisStatus {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            last_exit_code: None,
            last_signal: None,
            last_stdout: None,
            last_stderr: None,
            last_error: None,
        }
    }
}

struct JarvisRuntime {
    child: Option<CommandChild>,
    status: JarvisStatus,
    shutting_down: bool,
}

impl Default for JarvisRuntime {
    fn default() -> Self {
        Self {
            child: None,
            status: JarvisStatus::default(),
            shutting_down: false,
        }
    }
}

#[derive(Clone, Default)]
pub struct JarvisState {
    inner: Arc<Mutex<JarvisRuntime>>,
}

impl JarvisState {
    pub async fn shutdown(&self) -> Result<(), String> {
        let child = {
            let mut runtime = self.inner.lock().await;
            runtime.shutting_down = true;
            runtime.status.running = false;
            runtime.status.pid = None;
            runtime.child.take()
        };

        if let Some(child) = child {
            if let Err(error) = child.kill() {
                return Err(error.to_string());
            }
        }

        Ok(())
    }

    async fn status(&self) -> JarvisStatus {
        self.inner.lock().await.status.clone()
    }
}

fn python_candidates(custom: Option<String>) -> Vec<String> {
    let mut values = Vec::new();

    if let Some(path) = custom.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }) {
        values.push(path);
    }

    if let Ok(env_path) = env::var("JARVISCORE_PYTHON") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            values.push(trimmed.to_string());
        }
    }

    if let Ok(env_path) = env::var("PYTHON") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            values.push(trimmed.to_string());
        }
    }

    values.push("python3".to_string());
    values.push("python".to_string());

    values
}

fn resolve_jarvis_core_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(env_dir) = env::var("JARVISCORE_DIR") {
        let candidate = PathBuf::from(env_dir);
        candidates.push(candidate);
    }

    let resolver = app.path_resolver();

    if let Some(resource) = resolver.resolve_resource("jarvis_core") {
        candidates.push(resource);
    }

    if let Some(resource_dir) = resolver.resource_dir() {
        candidates.push(resource_dir.join("jarvis_core"));
    }

    if let Some(app_dir) = resolver.app_dir() {
        candidates.push(app_dir.join("jarvis_core"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("jarvis_core"));
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("jarvis_core"),
    );

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("No se pudo localizar la carpeta de JarvisCore".to_string())
}

fn format_path(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| "La ruta de JarvisCore contiene caracteres inválidos".to_string())
}

fn python_path_env(dir: &Path) -> String {
    let mut parts = Vec::new();
    parts.push(dir.to_path_buf());

    if let Ok(existing) = env::var("PYTHONPATH") {
        if !existing.trim().is_empty() {
            parts.extend(
                existing
                    .split(if cfg!(windows) { ';' } else { ':' })
                    .map(PathBuf::from),
            );
        }
    }

    let separator = if cfg!(windows) { ';' } else { ':' };
    let mut buffer = String::new();

    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            buffer.push(separator);
        }
        buffer.push_str(&part.display().to_string());
    }

    buffer
}

fn apply_command_environment(command: &mut Command, jarvis_dir: &Path) {
    command.current_dir(jarvis_dir);
    command.env("PYTHONUNBUFFERED", "1");
    command.env("PYTHONPATH", python_path_env(jarvis_dir));
}

fn start_process(
    app: &AppHandle,
    runtime: &mut JarvisRuntime,
    python: &str,
    jarvis_dir: PathBuf,
) -> Result<(CommandChild, tokio::sync::mpsc::Receiver<CommandEvent>), String> {
    let script_path = jarvis_dir.join("JarvisCore.py");
    if !script_path.exists() {
        return Err("No se encontró JarvisCore.py en la ruta seleccionada".to_string());
    }

    let script_arg = format_path(&script_path)?;

    let mut command = Command::new(python);
    apply_command_environment(&mut command, &jarvis_dir);
    command.args(["-u".to_string(), script_arg]);

    let (rx, child) = command
        .spawn()
        .map_err(|error| format!("No se pudo iniciar JarvisCore: {error}"))?;

    runtime.status.running = true;
    runtime.status.pid = Some(child.pid());
    runtime.status.last_exit_code = None;
    runtime.status.last_signal = None;
    runtime.status.last_error = None;
    runtime.status.last_stdout = None;
    runtime.status.last_stderr = None;
    runtime.shutting_down = false;

    Ok((child, rx))
}

fn handle_stdout(runtime: &mut JarvisRuntime, line: String) {
    runtime.status.last_stdout = Some(line.clone());
    log::info!(target: "jarvis-core", "{line}");
}

fn handle_stderr(runtime: &mut JarvisRuntime, line: String) {
    runtime.status.last_stderr = Some(line.clone());
    log::warn!(target: "jarvis-core", "{line}");
}

fn handle_error(runtime: &mut JarvisRuntime, message: String) {
    runtime.status.last_error = Some(message.clone());
    runtime.status.last_stdout = None;
    runtime.status.last_stderr = None;
    runtime.status.running = false;
    runtime.status.pid = None;
    log::error!(target: "jarvis-core", "{message}");
}

fn handle_termination(runtime: &mut JarvisRuntime, payload: TerminatedPayload) {
    runtime.status.running = false;
    runtime.status.pid = None;
    runtime.status.last_exit_code = payload.code;
    runtime.status.last_signal = payload.signal;
    runtime.child = None;
}

#[tauri::command]
pub async fn jarvis_start(
    app: AppHandle,
    state: State<'_, JarvisState>,
    python_path: Option<String>,
) -> Result<JarvisStatus, String> {
    let jarvis_dir = resolve_jarvis_core_dir(&app)?;

    let mut runtime = state.inner.lock().await;
    if runtime.child.is_some() {
        return Ok(runtime.status.clone());
    }

    let mut last_error: Option<String> = None;
    for candidate in python_candidates(python_path.clone()) {
        match start_process(&app, &mut runtime, &candidate, jarvis_dir.clone()) {
            Ok((child, mut rx)) => {
                let state_handle = state.clone();
                let app_handle = app.clone();
                runtime.child = Some(child);

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let mut guard = state_handle.inner.lock().await;
                                handle_stdout(&mut guard, line.clone());
                                let _ = app_handle.emit_all("jarvis://stdout", &line);
                            }
                            CommandEvent::Stderr(line) => {
                                let mut guard = state_handle.inner.lock().await;
                                handle_stderr(&mut guard, line.clone());
                                let _ = app_handle.emit_all("jarvis://stderr", &line);
                            }
                            CommandEvent::Error(message) => {
                                let mut guard = state_handle.inner.lock().await;
                                handle_error(&mut guard, message.clone());
                                let _ = app_handle.emit_all("jarvis://error", &message);
                            }
                            CommandEvent::Terminated(payload) => {
                                let mut guard = state_handle.inner.lock().await;
                                handle_termination(&mut guard, payload.clone());
                                let _ = app_handle.emit_all("jarvis://terminated", &payload);
                            }
                        }
                    }
                });

                return Ok(runtime.status.clone());
            }
            Err(error) => {
                last_error = Some(error);
            }
        }
    }

    let message =
        last_error.unwrap_or_else(|| "No se pudo iniciar el intérprete de Python".to_string());
    runtime.status.last_error = Some(message.clone());
    Err(message)
}

#[tauri::command]
pub async fn jarvis_stop(state: State<'_, JarvisState>) -> Result<JarvisStatus, String> {
    let child = {
        let mut runtime = state.inner.lock().await;
        runtime.shutting_down = true;
        runtime.status.running = false;
        runtime.status.pid = None;
        runtime.child.take()
    };

    if let Some(child) = child {
        child
            .kill()
            .map_err(|error| format!("No se pudo detener JarvisCore: {error}"))?;
    }

    Ok(state.status().await)
}

#[tauri::command]
pub async fn jarvis_status(state: State<'_, JarvisState>) -> Result<JarvisStatus, String> {
    Ok(state.status().await)
}
