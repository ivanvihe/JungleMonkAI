use crate::api::github;
use crate::state::{AppState, ChatMessage, PreferenceSection, AVAILABLE_CUSTOM_ACTIONS};
use eframe::egui;

pub fn draw_chat_panel(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default().show(ctx, |ui| {
        egui::TopBottomPanel::bottom("chat_input_panel")
            .resizable(false)
            .show_inside(ui, |ui| {
                draw_chat_input(ui, state);
            });

        egui::CentralPanel::default().show_inside(ui, |ui| {
            ui.heading("Chat Multimodal");
            ui.separator();

            let max_height = ui.available_height() * 0.55;
            egui::ScrollArea::vertical()
                .stick_to_bottom(true)
                .max_height(max_height)
                .show(ui, |ui| {
                    for message in &state.chat_messages {
                        ui.add_space(5.0); // Add some spacing between messages

                        if message.sender == "User" {
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
                                egui::Frame::none()
                                    .fill(ui.visuals().selection.bg_fill)
                                    .rounding(egui::Rounding::same(5.0))
                                    .inner_margin(egui::Margin::same(8.0))
                                    .show(ui, |ui| {
                                        ui.label(&message.text);
                                    });
                            });
                        } else {
                            ui.with_layout(egui::Layout::left_to_right(egui::Align::TOP), |ui| {
                                egui::Frame::none()
                                    .fill(ui.visuals().widgets.noninteractive.bg_fill)
                                    .rounding(egui::Rounding::same(5.0))
                                    .inner_margin(egui::Margin::same(8.0))
                                    .show(ui, |ui| {
                                        ui.strong(format!("{}:", message.sender));
                                        ui.label(&message.text);
                                    });
                            });
                        }
                    }
                });

            ui.add_space(12.0);
            draw_selected_section(ui, state);
        });
    });
}

fn draw_chat_input(ui: &mut egui::Ui, state: &mut AppState) {
    ui.add_space(12.0);

    ui.vertical_centered(|ui| {
        let max_width = 720.0;
        let available_width = ui.available_width().min(max_width);

        ui.scope(|ui| {
            ui.set_width(available_width);

            egui::Frame::none()
                .fill(ui.visuals().faint_bg_color)
                .stroke(egui::Stroke::new(
                    1.0,
                    ui.visuals().widgets.noninteractive.bg_fill,
                ))
                .rounding(egui::Rounding::same(14.0))
                .inner_margin(egui::Margin::symmetric(16.0, 10.0))
                .show(ui, |ui| {
                    let spacing = 10.0;
                    ui.spacing_mut().item_spacing.x = spacing;

                    let send_button_width = 88.0;
                    let control_height = 34.0;
                    let text_width =
                        (ui.available_width() - send_button_width - spacing).max(200.0);

                    let mut should_send = false;

                    ui.horizontal(|ui| {
                        let text_edit = egui::TextEdit::singleline(&mut state.current_chat_input)
                            .hint_text("Type your message or command here...")
                            .desired_width(f32::INFINITY)
                            .horizontal_align(egui::Align::Center);

                        let response = ui.add_sized([text_width, control_height], text_edit);
                        if response.lost_focus()
                            && ui.input(|input| input.key_pressed(egui::Key::Enter))
                        {
                            should_send = true;
                            ui.memory_mut(|mem| mem.request_focus(response.id));
                        }

                        let send_button = egui::Button::new("Send")
                            .rounding(egui::Rounding::same(10.0))
                            .min_size(egui::vec2(send_button_width, control_height));

                        if ui.add(send_button).clicked() {
                            should_send = true;
                        }
                    });

                    if should_send {
                        submit_chat_message(state);
                    }
                });
        });
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
            text: input,
        });
    }
}

fn draw_selected_section(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading(state.selected_section.title());
    ui.label(state.selected_section.description());
    ui.separator();

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
    ui.text_edit_singleline(&mut state.github_token);

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
    }

    if let Some(status) = &state.github_connection_status {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_cache(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.label("Cache directory");
        ui.text_edit_singleline(&mut state.cache_directory);
    });

    ui.add(
        egui::Slider::new(&mut state.cache_size_limit_gb, 1.0..=256.0)
            .text("Cache size limit (GB)"),
    );

    ui.checkbox(&mut state.enable_auto_cleanup, "Enable automatic cleanup");

    ui.add(
        egui::Slider::new(&mut state.cache_cleanup_interval_hours, 1..=168)
            .text("Cleanup interval (hours)"),
    );

    if ui.button("Run cleanup now").clicked() {
        state.last_cache_cleanup = Some(format!(
            "Manual cleanup triggered. Next automatic run in {} hours.",
            state.cache_cleanup_interval_hours
        ));
    }

    if let Some(status) = &state.last_cache_cleanup {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_resources(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Memory limit for cache");
    ui.add(egui::Slider::new(&mut state.resource_memory_limit_gb, 1.0..=512.0).suffix(" GB"));

    ui.label("Disk limit for cache");
    ui.add(egui::Slider::new(&mut state.resource_disk_limit_gb, 8.0..=4096.0).suffix(" GB"));

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
                }
            }
        }
    });

    if let Some(feedback) = &state.command_feedback {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), feedback);
    }

    ui.add_space(8.0);
    egui::CollapsingHeader::new("Available functions")
        .default_open(false)
        .show(ui, |ui| {
            for action in AVAILABLE_CUSTOM_ACTIONS {
                ui.label(format!("{} — {}", action.label(), action.description()));
            }
        });
}

fn draw_customization_memory(ui: &mut egui::Ui, state: &mut AppState) {
    ui.checkbox(
        &mut state.enable_memory_tracking,
        "Enable contextual memory",
    );

    ui.add(egui::Slider::new(&mut state.memory_retention_days, 1..=365).text("Retention (days)"));

    ui.colored_label(
        ui.visuals().weak_text_color(),
        format!(
            "Memories older than {} days will be archived.",
            state.memory_retention_days
        ),
    );
}

fn draw_customization_profiles(ui: &mut egui::Ui, state: &mut AppState) {
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
                ui.selectable_value(&mut state.selected_profile, Some(idx), profile);
            }
        });

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        if ui.button("Duplicate profile").clicked() {
            if let Some(idx) = state.selected_profile {
                let new_profile = format!("{} (copy)", state.profiles[idx]);
                state.profiles.push(new_profile);
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
                ui.selectable_value(&mut state.selected_project, Some(idx), project);
            }
        });

    ui.add_space(6.0);
    if ui.button("Create placeholder project").clicked() {
        let new_project = format!("New Project {}", state.projects.len() + 1);
        state.projects.push(new_project);
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        "Projects determine what repositories and documents are prioritised.",
    );
}

fn draw_local_huggingface(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.add(
            egui::TextEdit::singleline(&mut state.huggingface_search_query)
                .hint_text("Search models, e.g. whisper"),
        );
        if ui.button("Search").clicked() {
            // Placeholder search that filters the static list.
            let query = state.huggingface_search_query.to_lowercase();
            if query.is_empty() {
                state.huggingface_models = vec![
                    "sentence-transformers/all-MiniLM-L6-v2".to_string(),
                    "openai/whisper-small".to_string(),
                    "stabilityai/stable-diffusion-xl".to_string(),
                ];
            } else {
                state
                    .huggingface_models
                    .retain(|model| model.to_lowercase().contains(&query));
            }
        }
    });

    egui::ComboBox::from_label("Available models")
        .selected_text(
            state
                .selected_huggingface_model
                .and_then(|idx| state.huggingface_models.get(idx))
                .cloned()
                .unwrap_or_else(|| "Select a model".to_string()),
        )
        .show_ui(ui, |ui| {
            for (idx, model) in state.huggingface_models.iter().enumerate() {
                ui.selectable_value(&mut state.selected_huggingface_model, Some(idx), model);
            }
        });

    if ui.button("Install model").clicked() {
        let status = state
            .selected_huggingface_model
            .and_then(|idx| state.huggingface_models.get(idx))
            .map(|model| format!("Model '{}' added to the local Jarvis registry.", model))
            .unwrap_or_else(|| "Select a model to install.".to_string());
        state.huggingface_install_status = Some(status);
    }

    if let Some(status) = &state.huggingface_install_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_local_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Model path");
    ui.text_edit_singleline(&mut state.jarvis_model_path);
    ui.checkbox(&mut state.jarvis_auto_start, "Start Jarvis automatically");

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
    }

    if let Some(status) = &state.jarvis_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_anthropic(ui: &mut egui::Ui, state: &mut AppState) {
    let key = state.config.claude_api_key.get_or_insert_with(String::new);

    ui.label("Anthropic API key");
    ui.text_edit_singleline(key);

    ui.label("Default Claude model");
    ui.text_edit_singleline(&mut state.claude_default_model);

    if ui.button("Test connection").clicked() {
        if key.trim().is_empty() {
            state.anthropic_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            state.anthropic_test_status = Some(format!(
                "Successfully validated token against model {} (simulated).",
                state.claude_default_model
            ));
        }
    }

    if let Some(status) = &state.anthropic_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_openai(ui: &mut egui::Ui, state: &mut AppState) {
    let key = state.config.openai_api_key.get_or_insert_with(String::new);

    ui.label("OpenAI API key");
    ui.text_edit_singleline(key);

    ui.label("Default OpenAI model");
    ui.text_edit_singleline(&mut state.openai_default_model);

    if ui.button("Test connection").clicked() {
        if key.trim().is_empty() {
            state.openai_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            state.openai_test_status = Some(format!(
                "Test request accepted for model {} (simulated).",
                state.openai_default_model
            ));
        }
    }

    if let Some(status) = &state.openai_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_groq(ui: &mut egui::Ui, state: &mut AppState) {
    let key = state.config.groq_api_key.get_or_insert_with(String::new);

    ui.label("Groq API key");
    ui.text_edit_singleline(key);

    ui.label("Default Groq model");
    ui.text_edit_singleline(&mut state.groq_default_model);

    if ui.button("Test connection").clicked() {
        if key.trim().is_empty() {
            state.groq_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            state.groq_test_status = Some(format!(
                "Latency check successful for model {} (simulated).",
                state.groq_default_model
            ));
        }
    }

    if let Some(status) = &state.groq_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}
