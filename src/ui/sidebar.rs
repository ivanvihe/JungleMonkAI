use crate::state::AppState;
use eframe::egui;

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    egui::SidePanel::left("sidebar")
        .resizable(true)
        .default_width(250.0)
        .width_range(200.0..=400.0)
        .show(ctx, |ui| {
            ui.heading("Multimodal Agent");
            ui.separator();

            egui::ScrollArea::vertical().show(ui, |ui| {

                egui::CollapsingHeader::new("Models")
                    .default_open(true)
                    .show(ui, |ui| {
                        ui.label("Claude");
                        ui.label("OpenAI");
                        ui.label("Groq");
                        ui.label("HuggingFace");
                        ui.label("Local");
                    });

                egui::CollapsingHeader::new("GitHub")
                    .default_open(true)
                    .show(ui, |ui| {
                        ui.label("Repositories");
                        ui.label("Issues");
                        ui.label("Pull Requests");
                    });
            });

            ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
                ui.separator();
                if ui.button("⚙ Settings").clicked() {
                    state.show_settings_modal = true;
                }
            });
        });
}

pub fn draw_right_sidebar(ctx: &egui::Context, _state: &mut AppState) {
    egui::SidePanel::right("right_sidebar")
        .resizable(true)
        .default_width(200.0)
        .width_range(150.0..=300.0)
        .show(ctx, |ui| {
            ui.heading("Providers & Local Model");
            ui.separator();
            ui.label("Loaded Providers:");
            // TODO: Display loaded remote models here
            ui.label("OpenAI");
            ui.label("Claude");
            ui.label("Groq");
            ui.label("HuggingFace");
            ui.separator();
            ui.label("Local Model (Jarvis):");
            // TODO: Display local Jarvis model status here
            ui.label("Status: Loaded");
        });
}