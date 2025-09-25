use crate::api::github;
use crate::state::{AppState, ChatMessage, MainView, PreferenceSection, AVAILABLE_CUSTOM_ACTIONS};
use eframe::egui::{self, Color32, RichText};
use egui_extras::{Column, TableBuilder};

use super::theme;

pub fn draw_main_content(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default()
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::symmetric(20.0, 16.0)),
        )
        .show(ctx, |ui| {
            draw_tab_bar(ui, state);
            ui.add_space(12.0);
            match state.active_main_view {
                MainView::ChatMultimodal => draw_chat_view(ui, state),
                MainView::Preferences => draw_preferences_view(ui, state),
            }
        });
}

fn draw_tab_bar(ui: &mut egui::Ui, state: &mut AppState) {
    let frame = egui::Frame::none()
        .fill(Color32::from_rgb(34, 34, 34))
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(12.0, 8.0));

    frame.show(ui, |ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        let tabs = [
            (MainView::ChatMultimodal, "Conversación"),
            (MainView::Preferences, "Preferencias"),
        ];

        for (view, label) in tabs {
            let is_active = state.active_main_view == view;
            let fill = if is_active {
                theme::COLOR_PRIMARY
            } else {
                Color32::from_rgb(40, 40, 40)
            };
            let text_color = if is_active {
                Color32::from_rgb(240, 240, 240)
            } else {
                theme::COLOR_TEXT_WEAK
            };

            let button = egui::Button::new(RichText::new(label).color(text_color))
                .fill(fill)
                .min_size(egui::vec2(140.0, 30.0));

            if ui.add(button).clicked() {
                state.active_main_view = view;
            }
        }
    });
}

fn draw_chat_view(ui: &mut egui::Ui, state: &mut AppState) {
    draw_resource_summary(ui, state);
    ui.add_space(12.0);
    draw_chat_history(ui, state);
    ui.add_space(12.0);
    draw_chat_input(ui, state);
}

fn draw_resource_summary(ui: &mut egui::Ui, state: &AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(30, 30, 30))
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("Resumen de recursos")
                        .strong()
                        .color(theme::COLOR_TEXT_PRIMARY),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(RichText::new("Actualizado ahora").color(theme::COLOR_TEXT_WEAK));
                });
            });
            ui.add_space(6.0);

            TableBuilder::new(ui)
                .striped(true)
                .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
                .column(Column::exact(36.0))
                .column(Column::exact(150.0))
                .column(Column::remainder())
                .column(Column::exact(150.0))
                .body(|mut body| {
                    for row in resource_rows(state) {
                        body.row(26.0, |mut row_ui| {
                            row_ui.col(|ui| {
                                ui.label(RichText::new(row.icon).color(row.status_color));
                            });
                            row_ui.col(|ui| {
                                ui.label(RichText::new(row.name).color(theme::COLOR_TEXT_PRIMARY));
                            });
                            row_ui.col(|ui| {
                                ui.label(RichText::new(&row.detail).color(theme::COLOR_TEXT_WEAK));
                            });
                            row_ui.col(|ui| {
                                ui.label(row.status.clone());
                            });
                        });
                    }
                });
        });
}

fn resource_rows(state: &AppState) -> Vec<ResourceRow> {
    let mut rows = Vec::new();

    let (status, color) = status_visuals(None, "Operativo");
    rows.push(ResourceRow {
        icon: "🖥️",
        name: "Sistema",
        detail: format!(
            "Memoria límite {:.1} GB · Disco {:.1} GB",
            state.resource_memory_limit_gb, state.resource_disk_limit_gb
        ),
        status,
        status_color: color,
    });

    let (status, color) = status_visuals(state.jarvis_status.as_ref(), "Listo");
    rows.push(ResourceRow {
        icon: "💽",
        name: "Jarvis",
        detail: format!("Ruta {}", state.jarvis_model_path),
        status,
        status_color: color,
    });

    let (status, color) = status_visuals(state.openai_test_status.as_ref(), "Disponible");
    rows.push(ResourceRow {
        icon: "🤖",
        name: "OpenAI",
        detail: format!("Modelo {}", state.openai_default_model),
        status,
        status_color: color,
    });

    let (status, color) = status_visuals(state.anthropic_test_status.as_ref(), "Disponible");
    rows.push(ResourceRow {
        icon: "✨",
        name: "Claude",
        detail: format!("Modelo {}", state.claude_default_model),
        status,
        status_color: color,
    });

    let (status, color) = status_visuals(state.groq_test_status.as_ref(), "Disponible");
    rows.push(ResourceRow {
        icon: "⚡",
        name: "Groq",
        detail: format!("Modelo {}", state.groq_default_model),
        status,
        status_color: color,
    });

    rows
}

fn status_visuals(message: Option<&String>, fallback: &str) -> (RichText, Color32) {
    let label = message.cloned().unwrap_or_else(|| fallback.to_string());
    let lower = label.to_lowercase();
    let color = if lower.contains("error") || lower.contains("fail") {
        theme::COLOR_DANGER
    } else if lower.contains("index") || lower.contains("sync") {
        theme::COLOR_PRIMARY
    } else {
        theme::COLOR_SUCCESS
    };

    (RichText::new(label).color(color), color)
}

#[derive(Clone)]
struct ResourceRow {
    icon: &'static str,
    name: &'static str,
    detail: String,
    status: RichText,
    status_color: Color32,
}

fn draw_preferences_view(ui: &mut egui::Ui, state: &mut AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(32, 32, 32))
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(18.0, 14.0))
        .show(ui, |ui| {
            ui.heading(
                RichText::new(state.selected_section.title())
                    .color(theme::COLOR_TEXT_PRIMARY)
                    .strong(),
            );
            ui.label(
                RichText::new(state.selected_section.description()).color(theme::COLOR_TEXT_WEAK),
            );
            ui.add_space(10.0);

            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    draw_selected_section(ui, state);
                });
        });
}

fn draw_chat_history(ui: &mut egui::Ui, state: &mut AppState) {
    let max_height = (ui.available_height() * 0.55).max(220.0);
    egui::Frame::none()
        .fill(Color32::from_rgb(30, 30, 30))
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(16.0, 12.0))
        .show(ui, |ui| {
            egui::ScrollArea::vertical()
                .stick_to_bottom(true)
                .max_height(max_height)
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for message in &state.chat_messages {
                        ui.add_space(6.0);
                        let (bg_fill, icon, align_right) = if message.sender == "User" {
                            (Color32::from_rgb(36, 52, 72), "🧑", true)
                        } else if message.sender == "System" {
                            (Color32::from_rgb(36, 36, 36), "🛠", false)
                        } else {
                            (Color32::from_rgb(38, 38, 38), "🤖", false)
                        };

                        let layout = if align_right {
                            egui::Layout::right_to_left(egui::Align::TOP)
                        } else {
                            egui::Layout::left_to_right(egui::Align::TOP)
                        };

                        ui.with_layout(layout, |ui| {
                            egui::Frame::none()
                                .fill(bg_fill)
                                .stroke(theme::subtle_border())
                                .inner_margin(egui::Margin::symmetric(12.0, 8.0))
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        ui.label(RichText::new(icon).color(theme::COLOR_TEXT_WEAK));
                                        if message.sender != "User" {
                                            ui.label(
                                                RichText::new(format!("{}", message.sender))
                                                    .strong()
                                                    .color(theme::COLOR_TEXT_PRIMARY),
                                            );
                                        }
                                        ui.label(
                                            RichText::new(&message.text)
                                                .color(theme::COLOR_TEXT_PRIMARY),
                                        );
                                    });
                                });
                        });
                    }
                });
        });
}

fn draw_chat_input(ui: &mut egui::Ui, state: &mut AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 34, 34))
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(16.0, 12.0))
        .show(ui, |ui| {
            let spacing = 10.0;
            ui.spacing_mut().item_spacing.x = spacing;

            let send_button_width = 120.0;
            let control_height = 32.0;
            let text_width = (ui.available_width() - send_button_width - spacing).max(200.0);

            let mut should_send = false;

            ui.horizontal(|ui| {
                let text_edit = egui::TextEdit::singleline(&mut state.current_chat_input)
                    .hint_text("Escribe tu mensaje o comando...")
                    .desired_width(f32::INFINITY);

                let response = ui.add_sized([text_width, control_height], text_edit);
                if response.lost_focus() && ui.input(|input| input.key_pressed(egui::Key::Enter)) {
                    should_send = true;
                    ui.memory_mut(|mem| mem.request_focus(response.id));
                }

                let send_button = theme::primary_button(
                    RichText::new("➤ Enviar").color(Color32::from_rgb(240, 240, 240)),
                )
                .min_size(egui::vec2(send_button_width, control_height));

                if ui.add(send_button).clicked() {
                    should_send = true;
                }
            });

            if should_send {
                submit_chat_message(state);
            }
        });
}

fn submit_chat_message(state: &mut AppState) {
    if state.current_chat_input.trim().is_empty() {
        state.current_chat_input.clear();
        return;
    }

    let input = state.current_chat_input.trim().to_string();
    state.current_chat_input.clear();

    if input.starts_with('/') {
        state.chat_messages.push(ChatMessage {
            sender: "User".to_string(),
            text: input.clone(),
        });
        state.handle_command(input);
    } else {
        state.chat_messages.push(ChatMessage {
            sender: "User".to_string(),
            text: input.clone(),
        });
        state.try_route_provider_message(&input);
    }
}

fn draw_selected_section(ui: &mut egui::Ui, state: &mut AppState) {
    match state.selected_section {
        PreferenceSection::SystemGithub => draw_system_github(ui, state),
        PreferenceSection::SystemCache => draw_system_cache(ui, state),
        PreferenceSection::SystemResources => draw_system_resources(ui, state),
        PreferenceSection::CustomizationCommands => draw_custom_commands(ui, state),
        PreferenceSection::CustomizationMemory => draw_customization_memory(ui, state),
        PreferenceSection::CustomizationProfiles => draw_customization_profiles(ui, state),
        PreferenceSection::CustomizationProjects => draw_customization_projects(ui, state),
        PreferenceSection::ModelsLocalHuggingFace => draw_local_huggingface(ui, state),
        PreferenceSection::ModelsLocalSettings => draw_local_settings(ui, state),
        PreferenceSection::ModelsProviderAnthropic => draw_provider_anthropic(ui, state),
        PreferenceSection::ModelsProviderOpenAi => draw_provider_openai(ui, state),
        PreferenceSection::ModelsProviderGroq => draw_provider_groq(ui, state),
    }
}

fn draw_system_github(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Personal access token");
    if ui.text_edit_singleline(&mut state.github_token).changed() {
        state.persist_config();
    }

    if ui.button("Connect & sync").clicked() {
        if state.github_token.trim().is_empty() {
            state.github_username = None;
            state.github_repositories.clear();
            state.selected_github_repo = None;
            state.github_connection_status =
                Some("Please enter a valid GitHub token before syncing.".to_string());
        } else {
            match github::fetch_user_and_repositories(&state.github_token) {
                Ok(data) => {
                    state.github_username = Some(data.username.clone());
                    state.github_repositories = data.repositories;
                    state.selected_github_repo = None;
                    state.github_connection_status =
                        Some(format!("GitHub data loaded for {}.", data.username));
                }
                Err(err) => {
                    state.github_connection_status =
                        Some(format!("Failed to sync GitHub: {}", err));
                }
            }
        }
    }

    if let Some(username) = &state.github_username {
        ui.colored_label(
            ui.visuals().weak_text_color(),
            format!("Authenticated as: {}", username),
        );
    }

    let combo_label = state
        .selected_github_repo
        .and_then(|idx| state.github_repositories.get(idx))
        .cloned()
        .unwrap_or_else(|| "Choose a repository".to_string());

    ui.add_enabled_ui(!state.github_repositories.is_empty(), |ui| {
        egui::ComboBox::from_label("Select repository")
            .selected_text(combo_label)
            .show_ui(ui, |ui| {
                for (idx, repo) in state.github_repositories.iter().enumerate() {
                    ui.selectable_value(&mut state.selected_github_repo, Some(idx), repo);
                }
            });
    });

    if state.github_repositories.is_empty() {
        ui.label("No repositories found yet. Connect with a token to load them.");
    }

    if ui.button("Sync repository").clicked() {
        let message = match (
            state.github_token.trim().is_empty(),
            state.selected_github_repo,
        ) {
            (true, _) => "Cannot sync without a GitHub token.".to_string(),
            (_, None) => "Please select a repository to sync.".to_string(),
            (_, Some(idx)) => {
                let repo = state.github_repositories[idx].clone();
                format!("Repository '{}' scheduled for synchronization.", repo)
            }
        };
        state.github_connection_status = Some(message);
        state.persist_config();
    }

    if let Some(status) = &state.github_connection_status {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_cache(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.label("Cache directory");
        if ui
            .text_edit_singleline(&mut state.cache_directory)
            .changed()
        {
            state.persist_config();
        }
    });

    if ui
        .add(
            egui::Slider::new(&mut state.cache_size_limit_gb, 1.0..=256.0)
                .text("Cache size limit (GB)"),
        )
        .changed()
    {
        state.persist_config();
    }

    if ui
        .checkbox(&mut state.enable_auto_cleanup, "Enable automatic cleanup")
        .changed()
    {
        state.persist_config();
    }

    if ui
        .add(
            egui::Slider::new(&mut state.cache_cleanup_interval_hours, 1..=168)
                .text("Cleanup interval (hours)"),
        )
        .changed()
    {
        state.persist_config();
    }

    if ui.button("Run cleanup now").clicked() {
        state.last_cache_cleanup = Some(format!(
            "Manual cleanup triggered. Next automatic run in {} hours.",
            state.cache_cleanup_interval_hours
        ));
        state.persist_config();
    }

    if let Some(status) = &state.last_cache_cleanup {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_resources(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Memory limit for cache");
    if ui
        .add(egui::Slider::new(&mut state.resource_memory_limit_gb, 1.0..=512.0).suffix(" GB"))
        .changed()
    {
        state.persist_config();
    }

    ui.label("Disk limit for cache");
    if ui
        .add(egui::Slider::new(&mut state.resource_disk_limit_gb, 8.0..=4096.0).suffix(" GB"))
        .changed()
    {
        state.persist_config();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        format!(
            "Current limits: {:.1} GB memory · {:.1} GB disk",
            state.resource_memory_limit_gb, state.resource_disk_limit_gb
        ),
    );
}

fn draw_custom_commands(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("Command palette");
    ui.label("Link slash commands with built-in automation functions.");

    let mut remove_index = None;
    for (idx, command) in state.custom_commands.iter().enumerate() {
        ui.group(|ui| {
            ui.horizontal(|ui| {
                ui.strong(&command.trigger);
                ui.label(format!("→ {}", command.action.label()));
                if ui.button(egui::RichText::new("Remove").small()).clicked() {
                    remove_index = Some(idx);
                }
            });
            ui.colored_label(ui.visuals().weak_text_color(), command.action.description());
        });
        ui.add_space(4.0);
    }

    if let Some(idx) = remove_index {
        if let Some(command) = state.custom_commands.get(idx).cloned() {
            state.custom_commands.remove(idx);
            state.command_feedback = Some(format!(
                "Removed custom command '{}' ({})",
                command.trigger,
                command.action.label()
            ));
            state.persist_config();
        }
    }

    ui.add_space(8.0);
    ui.label("Create a new command");
    ui.horizontal(|ui| {
        ui.add(
            egui::TextEdit::singleline(&mut state.new_custom_command)
                .hint_text("Trigger (e.g. /time)"),
        );

        egui::ComboBox::from_id_source("new_custom_command_action")
            .selected_text(state.new_custom_command_action.label())
            .show_ui(ui, |ui| {
                for action in AVAILABLE_CUSTOM_ACTIONS {
                    ui.selectable_value(
                        &mut state.new_custom_command_action,
                        *action,
                        format!("{} — {}", action.label(), action.description()),
                    );
                }
            });

        if ui.button("Add").clicked() {
            let trimmed = state.new_custom_command.trim();
            if trimmed.is_empty() {
                state.command_feedback = Some("Command cannot be empty.".to_string());
            } else {
                let normalized = if trimmed.starts_with('/') {
                    trimmed.to_string()
                } else {
                    format!("/{}", trimmed)
                };

                if state
                    .custom_commands
                    .iter()
                    .any(|cmd| cmd.trigger == normalized)
                {
                    state.command_feedback =
                        Some(format!("Command '{}' already exists.", normalized));
                } else {
                    let action = state.new_custom_command_action;
                    state.custom_commands.push(crate::state::CustomCommand {
                        trigger: normalized.clone(),
                        action,
                    });
                    state.command_feedback = Some(format!(
                        "Added '{}' linked to {}.",
                        normalized,
                        action.label()
                    ));
                    state.new_custom_command.clear();
                    state.persist_config();
                }
            }
        }
    });

    if let Some(feedback) = &state.command_feedback {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), feedback);
    }

    ui.add_space(8.0);
    if ui
        .button("Available functions")
        .on_hover_text("Consulta documentación detallada y ejemplos")
        .clicked()
    {
        state.show_functions_modal = true;
    }
}

fn draw_customization_memory(ui: &mut egui::Ui, state: &mut AppState) {
    if ui
        .checkbox(
            &mut state.enable_memory_tracking,
            "Enable contextual memory",
        )
        .changed()
    {
        state.persist_config();
    }

    if ui
        .add(egui::Slider::new(&mut state.memory_retention_days, 1..=365).text("Retention (days)"))
        .changed()
    {
        state.persist_config();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        format!(
            "Memories older than {} days will be archived.",
            state.memory_retention_days
        ),
    );
}

fn draw_customization_profiles(ui: &mut egui::Ui, state: &mut AppState) {
    let mut selected_profile = state.selected_profile;
    egui::ComboBox::from_label("Active profile")
        .selected_text(
            state
                .selected_profile
                .and_then(|idx| state.profiles.get(idx))
                .cloned()
                .unwrap_or_else(|| "Choose a profile".to_string()),
        )
        .show_ui(ui, |ui| {
            for (idx, profile) in state.profiles.iter().enumerate() {
                ui.selectable_value(&mut selected_profile, Some(idx), profile);
            }
        });

    if selected_profile != state.selected_profile {
        state.selected_profile = selected_profile;
        state.persist_config();
    }

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        if ui.button("Duplicate profile").clicked() {
            if let Some(idx) = state.selected_profile {
                let new_profile = format!("{} (copy)", state.profiles[idx]);
                state.profiles.push(new_profile);
                state.selected_profile = Some(state.profiles.len() - 1);
                state.persist_config();
            }
        }
        if ui.button("Delete profile").clicked() {
            if let Some(idx) = state.selected_profile {
                if state.profiles.len() > 1 {
                    state.profiles.remove(idx);
                    if state.profiles.is_empty() {
                        state.selected_profile = None;
                    } else if idx >= state.profiles.len() {
                        state.selected_profile = Some(state.profiles.len() - 1);
                    }
                    state.persist_config();
                }
            }
        }
    });

    ui.colored_label(
        ui.visuals().weak_text_color(),
        "Profiles let you quickly change between workspace presets.",
    );
}

fn draw_customization_projects(ui: &mut egui::Ui, state: &mut AppState) {
    let mut selected_project = state.selected_project;
    egui::ComboBox::from_label("Active project")
        .selected_text(
            state
                .selected_project
                .and_then(|idx| state.projects.get(idx))
                .cloned()
                .unwrap_or_else(|| "Choose a project".to_string()),
        )
        .show_ui(ui, |ui| {
            for (idx, project) in state.projects.iter().enumerate() {
                ui.selectable_value(&mut selected_project, Some(idx), project);
            }
        });

    if selected_project != state.selected_project {
        state.selected_project = selected_project;
        state.persist_config();
    }

    ui.add_space(6.0);
    if ui.button("Create placeholder project").clicked() {
        let new_project = format!("New Project {}", state.projects.len() + 1);
        state.projects.push(new_project);
        state.selected_project = Some(state.projects.len() - 1);
        state.persist_config();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        "Projects determine what repositories and documents are prioritised.",
    );
}

fn draw_local_huggingface(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Hugging Face access token (optional)");
    if ui
        .text_edit_singleline(
            state
                .huggingface_access_token
                .get_or_insert_with(String::new),
        )
        .changed()
    {
        if state
            .huggingface_access_token
            .as_ref()
            .is_some_and(|token| token.trim().is_empty())
        {
            state.huggingface_access_token = None;
        }
        state.persist_config();
    }

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        if ui
            .add(
                egui::TextEdit::singleline(&mut state.huggingface_search_query)
                    .hint_text("Search models, e.g. whisper"),
            )
            .changed()
        {
            state.persist_config();
        }
        if ui.button("Search").clicked() {
            match crate::api::huggingface::search_models(
                &state.huggingface_search_query,
                state
                    .huggingface_access_token
                    .as_ref()
                    .map(|token| token.as_str()),
            ) {
                Ok(models) => {
                    state.huggingface_models = models;
                    state.huggingface_install_status = Some(format!(
                        "Found {} models for query '{}'.",
                        state.huggingface_models.len(),
                        state.huggingface_search_query
                    ));
                    state.selected_huggingface_model = None;
                    state.persist_config();
                }
                Err(err) => {
                    state.huggingface_install_status =
                        Some(format!("Failed to search models: {}", err));
                }
            }
        }
    });

    let combo_label = state
        .selected_huggingface_model
        .and_then(|idx| state.huggingface_models.get(idx))
        .cloned()
        .unwrap_or_else(|| "Select a model".to_string());

    egui::ComboBox::from_label("Available models")
        .selected_text(combo_label)
        .show_ui(ui, |ui| {
            for (idx, model) in state.huggingface_models.iter().enumerate() {
                ui.selectable_value(&mut state.selected_huggingface_model, Some(idx), model);
            }
        });

    if ui.button("Install model").clicked() {
        let status = if let Some(idx) = state.selected_huggingface_model {
            if let Some(model) = state.huggingface_models.get(idx).cloned() {
                let install_dir = std::path::Path::new(&state.jarvis_install_dir);
                let token = state
                    .huggingface_access_token
                    .as_ref()
                    .map(|token| token.as_str());
                match crate::api::huggingface::download_model(&model, install_dir, token) {
                    Ok(path) => {
                        if !state.installed_jarvis_models.contains(&model) {
                            state.installed_jarvis_models.push(model.clone());
                        }
                        state.persist_config();
                        format!("Model '{}' installed at {}.", model, path.display())
                    }
                    Err(err) => format!("Failed to install '{}': {}", model, err),
                }
            } else {
                "Select a model to install.".to_string()
            }
        } else {
            "Select a model to install.".to_string()
        };

        state.huggingface_install_status = Some(status);
    }

    if state.installed_jarvis_models.is_empty() {
        ui.add_space(6.0);
        ui.colored_label(
            ui.visuals().weak_text_color(),
            "No Hugging Face models installed for Jarvis yet.",
        );
    } else {
        ui.add_space(6.0);
        ui.label("Installed models:");
        for model in &state.installed_jarvis_models {
            ui.label(format!("• {}", model));
        }
    }

    if let Some(status) = &state.huggingface_install_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_local_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Model path");
    if ui
        .text_edit_singleline(&mut state.jarvis_model_path)
        .changed()
    {
        state.persist_config();
    }

    ui.label("Model install directory");
    if ui
        .text_edit_singleline(&mut state.jarvis_install_dir)
        .changed()
    {
        state.persist_config();
    }

    if ui
        .checkbox(&mut state.jarvis_auto_start, "Start Jarvis automatically")
        .changed()
    {
        state.persist_config();
    }

    if ui.button("Apply settings").clicked() {
        state.jarvis_status = Some(format!(
            "Jarvis will {} at startup with model at {}.",
            if state.jarvis_auto_start {
                "start"
            } else {
                "remain stopped"
            },
            state.jarvis_model_path
        ));
        state.persist_config();
    }

    if let Some(status) = &state.jarvis_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_anthropic(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui.text_edit_singleline(&mut state.claude_alias).changed() {
        state.persist_config();
    }

    ui.label("Anthropic API key");
    let mut key_changed = false;
    {
        let key = state
            .config
            .anthropic
            .api_key
            .get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default Claude model");
    if ui
        .text_edit_singleline(&mut state.claude_default_model)
        .changed()
    {
        state.persist_config();
    }

    let anthropic_key = state.config.anthropic.api_key.clone().unwrap_or_default();

    if ui.button("Test connection").clicked() {
        if anthropic_key.trim().is_empty() {
            state.anthropic_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::claude::send_message(
                anthropic_key.trim(),
                &state.claude_default_model,
                "Responde únicamente con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.anthropic_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.anthropic_test_status = Some(format!("Anthropic test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.anthropic_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_openai(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui.text_edit_singleline(&mut state.openai_alias).changed() {
        state.persist_config();
    }

    ui.label("OpenAI API key");
    let mut key_changed = false;
    {
        let key = state.config.openai.api_key.get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default OpenAI model");
    if ui
        .text_edit_singleline(&mut state.openai_default_model)
        .changed()
    {
        state.persist_config();
    }

    let openai_key = state.config.openai.api_key.clone().unwrap_or_default();

    if ui.button("Test connection").clicked() {
        if openai_key.trim().is_empty() {
            state.openai_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::openai::send_message(
                openai_key.trim(),
                &state.openai_default_model,
                "Responde con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.openai_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.openai_test_status = Some(format!("OpenAI test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.openai_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_groq(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui.text_edit_singleline(&mut state.groq_alias).changed() {
        state.persist_config();
    }

    ui.label("Groq API key");
    let mut key_changed = false;
    {
        let key = state.config.groq.api_key.get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default Groq model");
    if ui
        .text_edit_singleline(&mut state.groq_default_model)
        .changed()
    {
        state.persist_config();
    }

    let groq_key = state.config.groq.api_key.clone().unwrap_or_default();

    if ui.button("Test connection").clicked() {
        if groq_key.trim().is_empty() {
            state.groq_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::groq::send_message(
                groq_key.trim(),
                &state.groq_default_model,
                "Contesta con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.groq_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.groq_test_status = Some(format!("Groq test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.groq_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}
