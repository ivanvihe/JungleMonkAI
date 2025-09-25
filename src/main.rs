mod api;
mod config;
mod state;
mod ui;

use eframe::egui;
use state::AppState;

fn main() -> anyhow::Result<()> {
    // Inicializa el logger, config, etc. aquí si es necesario

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size(egui::vec2(1280.0, 800.0))
            .with_maximized(true),
        ..Default::default()
    };

    eframe::run_native(
        "Multimodal Agent",
        options,
        Box::new(|cc| Box::new(MultimodalApp::new(cc))),
    )
    .map_err(|e| anyhow::anyhow!("Eframe error: {}", e))?;

    Ok(())
}

struct MultimodalApp {
    state: AppState,
}

impl MultimodalApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        ui::theme::apply(&cc.egui_ctx);

        Self {
            state: AppState::default(),
        }
    }
}

impl eframe::App for MultimodalApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ui::draw_ui(ctx, &mut self.state);
    }
}
