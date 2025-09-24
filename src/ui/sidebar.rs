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
                ui.label("Live Multimodal");
                ui.add_space(8.0);

                egui::CollapsingHeader::new("Preferences")
                    .default_open(true)
                    .show(ui, |ui| {
                        ui.indent("preferences_system", |ui| {
                            egui::CollapsingHeader::new("System")
                                .default_open(true)
                                .show(ui, |ui| {
                                    ui.indent("preferences_system_items", |ui| {
                                        ui.label("GitHub for Projects");
                                        ui.label("Cache");
                                        ui.label("System resources");
                                    });
                                });

                            egui::CollapsingHeader::new("Customization")
                                .default_open(true)
                                .show(ui, |ui| {
                                    ui.indent("preferences_customization_items", |ui| {
                                        ui.label("Custom commands");
                                        ui.label("Memory");
                                        ui.label("Profiles");
                                        ui.label("Projects");
                                    });
                                });

                            egui::CollapsingHeader::new("Models")
                                .default_open(true)
                                .show(ui, |ui| {
                                    ui.indent("preferences_models_items", |ui| {
                                        egui::CollapsingHeader::new("Local (Jarvis)")
                                            .default_open(true)
                                            .show(ui, |ui| {
                                                ui.indent("preferences_models_local", |ui| {
                                                    ui.label("HuggingFace (explore and install)");
                                                    ui.label("Settings");
                                                });
                                            });

                                        egui::CollapsingHeader::new("Providers")
                                            .default_open(true)
                                            .show(ui, |ui| {
                                                ui.indent("preferences_models_providers", |ui| {
                                                    ui.label("Anthropic");
                                                    ui.label("OpenAI");
                                                    ui.label("Groq");
                                                });
                                            });
                                    });
                                });
                        });
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
