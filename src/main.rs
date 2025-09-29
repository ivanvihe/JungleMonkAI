mod api;
mod config;
mod local_providers;
mod state;
mod ui;

use state::AppState;

fn main() -> anyhow::Result<()> {
    vscode_shell::run(|| Box::new(AppState::default()))
        .map_err(|e| anyhow::anyhow!("Eframe error: {}", e))?;

    Ok(())
}
