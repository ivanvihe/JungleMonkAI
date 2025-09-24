use crate::state::{AppState, MainView, PreferenceSection};
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
                ui.selectable_value(
                    &mut state.active_main_view,
                    MainView::ChatMultimodal,
                    "Chat Multimodal",
                );
                ui.selectable_value(
                    &mut state.active_main_view,
                    MainView::LiveMultimodal,
                    "Live Multimodal",
                );
                ui.add_space(8.0);

                egui::CollapsingHeader::new("Preferences")
                    .default_open(true)
                    .show(ui, |ui| {
                        ui.indent("preferences_system", |ui| {
                            egui::CollapsingHeader::new("System")
                                .default_open(true)
                                .show(ui, |ui| {
                                    ui.indent("preferences_system_items", |ui| {
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::SystemGithub,
                                            "GitHub for Projects",
                                        );
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::SystemCache,
                                            "Cache",
                                        );
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::SystemResources,
                                            "System resources",
                                        );
                                    });
                                });

                            egui::CollapsingHeader::new("Customization")
                                .default_open(true)
                                .show(ui, |ui| {
                                    ui.indent("preferences_customization_items", |ui| {
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::CustomizationCommands,
                                            "Custom commands",
                                        );
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::CustomizationMemory,
                                            "Memory",
                                        );
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::CustomizationProfiles,
                                            "Profiles",
                                        );
                                        ui.selectable_value(
                                            &mut state.selected_section,
                                            PreferenceSection::CustomizationProjects,
                                            "Projects",
                                        );
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
                                                    ui.selectable_value(
                                                        &mut state.selected_section,
                                                        PreferenceSection::ModelsLocalHuggingFace,
                                                        "HuggingFace (explore and install)",
                                                    );
                                                    ui.selectable_value(
                                                        &mut state.selected_section,
                                                        PreferenceSection::ModelsLocalSettings,
                                                        "Settings",
                                                    );
                                                });
                                            });

                                        egui::CollapsingHeader::new("Providers")
                                            .default_open(true)
                                            .show(ui, |ui| {
                                                ui.indent("preferences_models_providers", |ui| {
                                                    ui.selectable_value(
                                                        &mut state.selected_section,
                                                        PreferenceSection::ModelsProviderAnthropic,
                                                        "Anthropic",
                                                    );
                                                    ui.selectable_value(
                                                        &mut state.selected_section,
                                                        PreferenceSection::ModelsProviderOpenAi,
                                                        "OpenAI",
                                                    );
                                                    ui.selectable_value(
                                                        &mut state.selected_section,
                                                        PreferenceSection::ModelsProviderGroq,
                                                        "Groq",
                                                    );
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

pub fn draw_right_sidebar(ctx: &egui::Context, state: &mut AppState) {
    egui::SidePanel::right("right_sidebar")
        .resizable(true)
        .default_width(200.0)
        .width_range(150.0..=300.0)
        .show(ctx, |ui| {
            ui.heading("Providers & Local Model");
            ui.separator();
            ui.label("Loaded Providers:");
            ui.label(format!("OpenAI · model {}", state.openai_default_model));
            ui.label(format!("Claude · model {}", state.claude_default_model));
            ui.label(format!("Groq · model {}", state.groq_default_model));

            if let Some(status) = &state.openai_test_status {
                ui.colored_label(ui.visuals().weak_text_color(), status);
            }
            if let Some(status) = &state.anthropic_test_status {
                ui.colored_label(ui.visuals().weak_text_color(), status);
            }
            if let Some(status) = &state.groq_test_status {
                ui.colored_label(ui.visuals().weak_text_color(), status);
            }

            ui.separator();
            ui.label("Local Model (Jarvis):");
            ui.label(format!("Path: {}", state.jarvis_model_path));
            ui.label(if state.jarvis_auto_start {
                "Auto start: enabled"
            } else {
                "Auto start: disabled"
            });
            if let Some(status) = &state.jarvis_status {
                ui.colored_label(ui.visuals().weak_text_color(), status);
            }
        });
}
