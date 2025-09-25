use crate::api::github;
use crate::state::{AppState, ChatMessage, MainView, PreferenceSection, AVAILABLE_CUSTOM_ACTIONS};
use eframe::egui::{self, Color32, RichText};

use super::{logs, theme};

const ICON_USER: &str = "\u{f007}"; // user
const ICON_SYSTEM: &str = "\u{f085}"; // cogs
const ICON_ASSISTANT: &str = "\u{f544}"; // robot
const ICON_CLOCK: &str = "\u{f017}"; // clock
const ICON_COPY: &str = "\u{f0c5}"; // copy
const ICON_QUOTE: &str = "\u{f10e}"; // quote-right
const ICON_PIN: &str = "\u{f08d}"; // thumb-tack
const ICON_SEND: &str = "\u{f1d8}"; // paper-plane
const ICON_CODE: &str = "\u{f121}"; // code
const ICON_PREMIUM: &str = "\u{f521}"; // crown
const ICON_FREE: &str = "\u{f06b}"; // gift
const ICON_DOWNLOAD: &str = "\u{f019}"; // download

const QUICK_MENTIONS: [(&str, &str); 3] =
    [("@claude", "@claude"), ("@gpt", "@gpt"), ("@groq", "@groq")];

enum PendingChatAction {
    Mention(String),
    Quote(String),
    Reuse(String),
}

pub fn draw_main_content(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default()
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::symmetric(20.0, 16.0)),
        )
        .show(ctx, |ui| {
            logs::draw_logs_panel(ui, state);

            match state.active_main_view {
                MainView::ChatMultimodal => draw_chat_view(ui, state),
                MainView::Preferences => draw_preferences_view(ui, state),
            }
        });
}

fn draw_chat_view(ui: &mut egui::Ui, state: &mut AppState) {
    let available = ui.available_size();
    let (rect, _) = ui.allocate_exact_size(available, egui::Sense::hover());
    let mut content_ui = ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
    content_ui.set_min_width(available.x);
    content_ui.set_min_height(available.y);
    content_ui.set_clip_rect(rect);

    egui::TopBottomPanel::bottom("chat_input_panel")
        .resizable(false)
        .show_separator_line(false)
        .frame(egui::Frame::none())
        .show_inside(&mut content_ui, |ui| {
            ui.add_space(6.0);
            draw_chat_input(ui, state);
        });

    egui::CentralPanel::default()
        .frame(egui::Frame::none())
        .show_inside(&mut content_ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_min_height(ui.available_height());
            draw_chat_history(ui, state);
        });
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
    let mut pending_actions = Vec::new();

    egui::Frame::none()
        .fill(Color32::from_rgb(26, 28, 32))
        .stroke(theme::subtle_border())
        .rounding(egui::Rounding::same(16.0))
        .inner_margin(egui::Margin::symmetric(20.0, 18.0))
        .show(ui, |ui| {
            let available_height = ui.available_height();
            let available_width = ui.available_width();
            ui.set_width(available_width);
            ui.set_min_height(available_height);
            egui::ScrollArea::vertical()
                .stick_to_bottom(true)
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    for (index, message) in state.chat_messages.iter().enumerate() {
                        draw_message_bubble(ui, message, index, &mut pending_actions);
                    }
                });
        });

    apply_pending_actions(state, pending_actions);
}

fn draw_message_bubble(
    ui: &mut egui::Ui,
    message: &ChatMessage,
    index: usize,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    ui.add_space(if index == 0 { 0.0 } else { 10.0 });

    let is_user = message.sender == "User";
    let is_system = message.sender == "System";
    let (background, border, icon, accent) = if is_user {
        (
            Color32::from_rgb(34, 48, 70),
            Color32::from_rgb(62, 120, 192),
            ICON_USER,
            Color32::from_rgb(130, 180, 240),
        )
    } else if is_system {
        (
            Color32::from_rgb(36, 36, 36),
            Color32::from_rgb(88, 88, 88),
            ICON_SYSTEM,
            Color32::from_rgb(200, 200, 200),
        )
    } else {
        (
            Color32::from_rgb(30, 36, 46),
            Color32::from_rgb(70, 110, 180),
            ICON_ASSISTANT,
            Color32::from_rgb(150, 200, 255),
        )
    };

    let layout = if is_user {
        egui::Layout::right_to_left(egui::Align::TOP)
    } else {
        egui::Layout::left_to_right(egui::Align::TOP)
    };

    ui.with_layout(layout, |ui| {
        let available_width = ui.available_width();
        let mut bubble_width = (available_width * 0.98).max(260.0);
        bubble_width = bubble_width.min(available_width);
        let frame = egui::Frame::none()
            .fill(background)
            .stroke(egui::Stroke::new(1.4, border))
            .rounding(egui::Rounding::same(14.0))
            .inner_margin(egui::Margin::same(16.0));

        let response = frame.show(ui, |ui| {
            ui.set_width(bubble_width);
            ui.vertical(|ui| {
                draw_message_header(ui, message, icon, accent, pending_actions);
                ui.add_space(6.0);
                ui.label(
                    RichText::new(&message.text)
                        .color(theme::COLOR_TEXT_PRIMARY)
                        .size(15.0),
                );
            });
        });

        if response.response.double_clicked() && !is_user {
            pending_actions.push(PendingChatAction::Mention(format!(
                "@{}",
                message.sender.to_lowercase()
            )));
        }
    });
}

fn draw_message_header(
    ui: &mut egui::Ui,
    message: &ChatMessage,
    icon: &str,
    accent: Color32,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        ui.label(
            RichText::new(icon)
                .font(theme::icon_font(16.0))
                .color(accent),
        );
        let sender_label = if message.sender == "User" {
            "Tú"
        } else {
            &message.sender
        };
        ui.label(
            RichText::new(sender_label)
                .strong()
                .color(theme::COLOR_TEXT_PRIMARY),
        );
        ui.label(
            RichText::new(ICON_CLOCK)
                .font(theme::icon_font(12.0))
                .color(theme::COLOR_TEXT_WEAK),
        );
        ui.label(
            RichText::new(&message.timestamp)
                .italics()
                .size(12.0)
                .color(theme::COLOR_TEXT_WEAK),
        );
        ui.add_space(ui.available_width());
        draw_message_actions(ui, message, pending_actions);
    });
}

fn draw_message_actions(
    ui: &mut egui::Ui,
    message: &ChatMessage,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    if message_action_button(ui, ICON_COPY, "Copiar mensaje al portapapeles").clicked() {
        let text = message.text.clone();
        ui.output_mut(|out| out.copied_text = text);
    }

    if message_action_button(ui, ICON_QUOTE, "Citar mensaje en el input").clicked() {
        let mut quoted = message
            .text
            .lines()
            .map(|line| format!("> {}", line))
            .collect::<Vec<_>>()
            .join("\n");
        quoted.push_str("\n\n");
        pending_actions.push(PendingChatAction::Quote(quoted));
    }

    if message_action_button(ui, ICON_PIN, "Reutilizar este mensaje").clicked() {
        pending_actions.push(PendingChatAction::Reuse(message.text.clone()));
    }
}

fn message_action_button(ui: &mut egui::Ui, icon: &str, tooltip: &str) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(icon)
            .font(theme::icon_font(13.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(30.0, 26.0))
    .fill(Color32::from_rgb(44, 46, 54))
    .rounding(egui::Rounding::same(6.0));

    let response = ui.add(button);
    response.on_hover_text(tooltip)
}

fn apply_pending_actions(state: &mut AppState, actions: Vec<PendingChatAction>) {
    for action in actions {
        match action {
            PendingChatAction::Mention(tag) => insert_mention(state, &tag),
            PendingChatAction::Quote(text) => {
                if !state.current_chat_input.ends_with('\n') && !state.current_chat_input.is_empty()
                {
                    state.current_chat_input.push('\n');
                }
                state.current_chat_input.push_str(&text);
            }
            PendingChatAction::Reuse(text) => state.current_chat_input = text,
        }
    }
}

fn draw_chat_input(ui: &mut egui::Ui, state: &mut AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(24, 26, 32))
        .stroke(theme::subtle_border())
        .rounding(egui::Rounding::same(16.0))
        .inner_margin(egui::Margin::symmetric(18.0, 14.0))
        .show(ui, |ui| {
            let full_width = ui.available_width();
            ui.set_width(full_width);
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    if let Some(tag) = state.jarvis_mention_tag() {
                        if quick_chip(ui, &tag).clicked() {
                            insert_mention(state, &tag);
                        }
                    }

                    for (mention, label) in QUICK_MENTIONS {
                        if quick_chip(ui, label).clicked() {
                            insert_mention(state, mention);
                        }
                    }

                    ui.add_space(ui.available_width());

                    if quick_chip_with_icon(ui, ICON_CODE, "Insertar bloque de código").clicked() {
                        insert_code_template(state);
                    }
                });

                ui.add_space(12.0);

                let mut should_send = false;

                let text_height = 110.0;
                let enter_pressed = ui.input(|input| {
                    input.key_pressed(egui::Key::Enter) && !input.modifiers.shift
                });

                let available_width = ui.available_width();
                let spacing = 12.0;
                let button_width = 68.0;
                let text_width = (available_width - button_width - spacing).max(140.0);

                let text_response = ui
                    .allocate_ui_with_layout(
                        egui::vec2(text_width, text_height),
                        egui::Layout::top_down(egui::Align::LEFT),
                        |ui| {
                            let text_edit = egui::TextEdit::multiline(&mut state.current_chat_input)
                                .desired_rows(4)
                                .hint_text(
                                    "Escribe tu mensaje o comando. Usa Shift+Enter para saltos de línea.",
                                )
                                .lock_focus(true)
                                .desired_width(f32::INFINITY)
                                .frame(false);

                            let text_frame = egui::Frame::none()
                                .fill(Color32::from_rgb(30, 32, 38))
                                .stroke(theme::subtle_border())
                                .rounding(egui::Rounding::same(12.0))
                                .inner_margin(egui::Margin::symmetric(14.0, 12.0));

                            text_frame
                                .show(ui, |ui| {
                                    let width = ui.available_width();
                                    ui.add_sized([width, text_height], text_edit)
                                })
                                .inner
                        },
                    )
                    .inner;

                if text_response.has_focus() && enter_pressed {
                    should_send = true;
                    ui.ctx()
                        .memory_mut(|mem| mem.request_focus(text_response.id));
                }

                ui.add_space(spacing);

                let (send_rect, send_response) =
                    ui.allocate_exact_size(egui::vec2(button_width, text_height), egui::Sense::click());
                let send_fill = if send_response.hovered() {
                    Color32::from_rgb(58, 140, 232)
                } else {
                    Color32::from_rgb(46, 112, 196)
                };
                let painter = ui.painter_at(send_rect);
                painter.rect_filled(send_rect, egui::Rounding::same(12.0), send_fill);
                painter.rect_stroke(
                    send_rect,
                    egui::Rounding::same(12.0),
                    theme::subtle_border(),
                );
                painter.text(
                    send_rect.center() - egui::vec2(0.0, 22.0),
                    egui::Align2::CENTER_CENTER,
                    ICON_SEND,
                    theme::icon_font(20.0),
                    Color32::from_rgb(240, 240, 240),
                );
                painter.text(
                    send_rect.center() + egui::vec2(0.0, 10.0),
                    egui::Align2::CENTER_CENTER,
                    "Enviar",
                    egui::FontId::proportional(13.0),
                    Color32::from_rgb(240, 240, 240),
                );

                if send_response.clicked() {
                    should_send = true;
                }

                if should_send {
                    submit_chat_message(state);
                }
            });
        });
}

fn submit_chat_message(state: &mut AppState) {
    let trimmed = state.current_chat_input.trim();
    if trimmed.is_empty() {
        state.current_chat_input.clear();
        return;
    }

    let mut input = trimmed.to_string();
    while input.ends_with('\n') {
        input.pop();
    }
    state.current_chat_input.clear();

    if input.starts_with('/') {
        state.chat_messages.push(ChatMessage::user(input.clone()));
        state.handle_command(input);
    } else {
        state.chat_messages.push(ChatMessage::user(input.clone()));
        if state.try_route_provider_message(&input) {
            return;
        }

        if state.try_invoke_jarvis_alias(&input) {
            return;
        }

        if state.jarvis_respond_without_alias {
            state.respond_with_jarvis(input);
        }
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
    egui::Frame::none()
        .fill(Color32::from_rgb(30, 32, 36))
        .stroke(theme::subtle_border())
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                let button_width = 120.0;
                let text_width = (ui.available_width() - button_width - 12.0).max(240.0);
                let search_edit = egui::TextEdit::singleline(&mut state.huggingface_search_query)
                    .hint_text("Busca modelos, ej. whisper, mistral, diffusion")
                    .desired_width(f32::INFINITY);
                let response = ui.add_sized([text_width, 30.0], search_edit);
                if response.changed() {
                    state.persist_config();
                }

                let search_label = RichText::new("Buscar").color(Color32::from_rgb(240, 240, 240));
                if ui
                    .add_sized([button_width, 32.0], theme::primary_button(search_label))
                    .clicked()
                {
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
                                "Se encontraron {} modelos para '{}'.",
                                state.huggingface_models.len(),
                                state.huggingface_search_query
                            ));
                            state.selected_huggingface_model = None;
                            state.persist_config();
                        }
                        Err(err) => {
                            state.huggingface_install_status =
                                Some(format!("Fallo al buscar modelos: {}", err));
                        }
                    }
                }
            });
        });

    ui.add_space(12.0);

    if state.huggingface_models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Busca un término para poblar la galería de modelos.",
        );
    } else {
        ui.horizontal(|ui| {
            ui.heading(
                RichText::new(format!(
                    "Galería de modelos ({} resultados)",
                    state.huggingface_models.len()
                ))
                .color(theme::COLOR_TEXT_PRIMARY),
            );
            ui.add_space(ui.available_width());
            ui.label(
                RichText::new("Clic en una tarjeta para seleccionarla o instalarla.")
                    .color(theme::COLOR_TEXT_WEAK)
                    .size(12.0),
            );
        });
        ui.add_space(8.0);
        draw_huggingface_gallery(ui, state);
    }

    ui.add_space(12.0);

    if state.installed_jarvis_models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Todavía no hay modelos de Hugging Face instalados para Jarvis.",
        );
    } else {
        ui.label("Modelos instalados:");
        ui.add_space(4.0);
        egui::Grid::new("installed_hf_models")
            .num_columns(2)
            .spacing([12.0, 6.0])
            .show(ui, |ui| {
                for model in &state.installed_jarvis_models {
                    ui.label(RichText::new("•").color(theme::COLOR_PRIMARY));
                    ui.label(RichText::new(model).color(theme::COLOR_TEXT_PRIMARY));
                    ui.end_row();
                }
            });
    }

    if let Some(status) = &state.huggingface_install_status {
        ui.add_space(10.0);
        ui.colored_label(theme::COLOR_TEXT_WEAK, status);
    }
}

fn draw_huggingface_gallery(ui: &mut egui::Ui, state: &mut AppState) {
    let columns = if ui.available_width() > 840.0 { 3 } else { 2 };
    let spacing = 16.0;
    let models = state.huggingface_models.clone();

    egui::ScrollArea::vertical()
        .max_height(360.0)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let available_width = ui.available_width();
            let card_width = ((available_width - spacing * ((columns as f32) - 1.0))
                / columns as f32)
                .max(240.0);

            let mut base_index = 0usize;
            for chunk in models.chunks(columns) {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = spacing;
                    for (offset, model) in chunk.iter().enumerate() {
                        let index = base_index + offset;
                        let (rect, response) = ui
                            .allocate_at_least(egui::vec2(card_width, 190.0), egui::Sense::click());
                        let mut card_ui =
                            ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                        draw_model_card(&mut card_ui, state, model, index);

                        if response.clicked() {
                            state.selected_huggingface_model = Some(index);
                        }

                        if response.double_clicked() {
                            install_huggingface_model(state, index);
                        }
                    }

                    if chunk.len() < columns {
                        for _ in chunk.len()..columns {
                            ui.add_space(card_width);
                        }
                    }
                });
                ui.add_space(spacing);
                base_index += chunk.len();
            }
        });
}

fn draw_model_card(
    ui: &mut egui::Ui,
    state: &mut AppState,
    model: &crate::api::huggingface::HuggingFaceModelInfo,
    index: usize,
) {
    let is_selected = state.selected_huggingface_model == Some(index);
    let premium = model.requires_token;

    let fill = if premium {
        Color32::from_rgb(48, 36, 56)
    } else {
        Color32::from_rgb(34, 38, 44)
    };
    let border = if is_selected {
        theme::COLOR_PRIMARY
    } else if premium {
        Color32::from_rgb(182, 134, 242)
    } else {
        Color32::from_rgb(70, 80, 96)
    };

    egui::Frame::none()
        .fill(fill)
        .stroke(egui::Stroke::new(
            if is_selected { 2.0 } else { 1.0 },
            border,
        ))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    let badge_icon = if premium { ICON_PREMIUM } else { ICON_FREE };
                    let badge_color = if premium {
                        Color32::from_rgb(255, 214, 102)
                    } else {
                        Color32::from_rgb(108, 214, 148)
                    };
                    ui.label(
                        RichText::new(badge_icon)
                            .font(theme::icon_font(15.0))
                            .color(badge_color),
                    );
                    ui.label(
                        RichText::new(&model.id)
                            .strong()
                            .color(theme::COLOR_TEXT_PRIMARY),
                    );
                });

                if let Some(author) = &model.author {
                    ui.label(
                        RichText::new(format!("Autor: {}", author))
                            .color(theme::COLOR_TEXT_WEAK)
                            .size(12.0),
                    );
                }

                if let Some(pipeline) = &model.pipeline_tag {
                    ui.label(
                        RichText::new(format!("Pipeline: {}", pipeline))
                            .color(theme::COLOR_TEXT_WEAK)
                            .size(12.0),
                    );
                }

                if !model.tags.is_empty() {
                    let tags: Vec<&str> =
                        model.tags.iter().take(3).map(|tag| tag.as_str()).collect();
                    ui.label(
                        RichText::new(format!("Etiquetas: {}", tags.join(", ")))
                            .color(theme::COLOR_TEXT_WEAK)
                            .size(11.0),
                    );
                }

                let mut metrics = Vec::new();
                if let Some(likes) = model.likes {
                    metrics.push(format!("❤ {}", format_count(likes)));
                }
                if let Some(downloads) = model.downloads {
                    metrics.push(format!("⬇ {}", format_count(downloads)));
                }
                if !metrics.is_empty() {
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new(metrics.join("  · "))
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .size(12.0),
                    );
                }

                ui.add_space(8.0);

                let button_label = if premium {
                    format!("{} Instalar (token)", ICON_DOWNLOAD)
                } else {
                    format!("{} Instalar", ICON_DOWNLOAD)
                };
                if ui
                    .add_sized(
                        [ui.available_width(), 30.0],
                        theme::primary_button(
                            RichText::new(button_label).color(Color32::from_rgb(240, 240, 240)),
                        ),
                    )
                    .clicked()
                {
                    install_huggingface_model(state, index);
                }
            });
        });
}

fn install_huggingface_model(state: &mut AppState, index: usize) {
    if let Some(model) = state.huggingface_models.get(index).cloned() {
        let install_dir = std::path::Path::new(&state.jarvis_install_dir);
        let token = state
            .huggingface_access_token
            .as_ref()
            .map(|token| token.as_str());

        let status = match crate::api::huggingface::download_model(&model.id, install_dir, token) {
            Ok(path) => {
                if !state
                    .installed_jarvis_models
                    .iter()
                    .any(|installed| installed == &model.id)
                {
                    state.installed_jarvis_models.push(model.id.clone());
                }

                state.jarvis_active_model = Some(model.id.clone());
                state.jarvis_runtime = None;
                state.jarvis_model_path = path.display().to_string();

                let mut message = format!("Modelo '{}' instalado en {}.", model.id, path.display());

                if state.jarvis_auto_start {
                    match state.ensure_jarvis_runtime() {
                        Ok(runtime) => {
                            message.push_str(&format!(
                                " Jarvis se recargó con {}.",
                                runtime.model_label()
                            ));
                        }
                        Err(err) => {
                            message.push_str(&format!(
                                " No se pudo reiniciar Jarvis automáticamente: {}.",
                                err
                            ));
                        }
                    }
                }

                state.persist_config();
                message
            }
            Err(err) => format!("Fallo al instalar '{}': {}", model.id, err),
        };

        state.selected_huggingface_model = Some(index);
        state.huggingface_install_status = Some(status);
    }
}

fn format_count(value: u64) -> String {
    if value >= 1_000_000 {
        let short = value as f64 / 1_000_000.0;
        if short >= 10.0 {
            format!("{:.0}M", short)
        } else {
            format!("{:.1}M", short)
        }
    } else if value >= 1_000 {
        let short = value as f64 / 1_000.0;
        if short >= 10.0 {
            format!("{:.0}K", short)
        } else {
            format!("{:.1}K", short)
        }
    } else {
        value.to_string()
    }
}

fn quick_chip(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(label)
            .color(Color32::from_rgb(228, 228, 228))
            .strong(),
    )
    .min_size(egui::vec2(0.0, 28.0))
    .fill(Color32::from_rgb(36, 38, 46))
    .rounding(egui::Rounding::same(10.0));
    ui.add(button)
}

fn quick_chip_with_icon(ui: &mut egui::Ui, icon: &str, tooltip: &str) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(icon)
            .font(theme::icon_font(14.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(32.0, 28.0))
    .fill(Color32::from_rgb(36, 38, 46))
    .rounding(egui::Rounding::same(10.0));
    let response = ui.add(button);
    response.on_hover_text(tooltip)
}

fn insert_mention(state: &mut AppState, mention: &str) {
    let trimmed = state.current_chat_input.trim();
    if trimmed.starts_with(mention) {
        if !state.current_chat_input.ends_with(' ') {
            state.current_chat_input.push(' ');
        }
        return;
    }

    if trimmed.is_empty() {
        state.current_chat_input = format!("{} ", mention);
    } else {
        state.current_chat_input = format!("{} {}", mention, trimmed);
    }
}

fn insert_code_template(state: &mut AppState) {
    let template = "```language\n\n```";
    if state.current_chat_input.trim().is_empty() {
        state.current_chat_input = template.to_string();
    } else {
        if !state.current_chat_input.ends_with('\n') {
            state.current_chat_input.push('\n');
        }
        state.current_chat_input.push_str(template);
    }
}

fn draw_local_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Alias para mencionar a Jarvis en el chat");
    if ui.text_edit_singleline(&mut state.jarvis_alias).changed() {
        state.persist_config();
    }

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

    if state.installed_jarvis_models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Instala un modelo desde Hugging Face para habilitar Jarvis.",
        );
    } else {
        let mut selected_model = state.jarvis_active_model.clone();
        let current_label = selected_model
            .clone()
            .unwrap_or_else(|| "Selecciona un modelo instalado".to_string());

        egui::ComboBox::from_label("Modelo local activo")
            .selected_text(current_label)
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut selected_model, None, "— Sin modelo —");
                for model in &state.installed_jarvis_models {
                    ui.selectable_value(&mut selected_model, Some(model.clone()), model);
                }
            });

        if selected_model != state.jarvis_active_model {
            state.jarvis_active_model = selected_model.clone();
            state.jarvis_runtime = None;

            if let Some(model_id) = selected_model {
                let sanitized = model_id.replace('/', "_");
                let path = std::path::Path::new(&state.jarvis_install_dir).join(sanitized);
                state.jarvis_model_path = path.display().to_string();
                state.jarvis_status =
                    Some(format!("Modelo '{}' seleccionado para Jarvis.", model_id));

                if state.jarvis_auto_start {
                    match state.ensure_jarvis_runtime() {
                        Ok(runtime) => {
                            state.jarvis_status =
                                Some(format!("Jarvis activo con {}.", runtime.model_label()));
                        }
                        Err(err) => {
                            state.jarvis_status = Some(format!(
                                "No se pudo iniciar Jarvis con {}: {}.",
                                model_id, err
                            ));
                        }
                    }
                }
            } else {
                state.jarvis_status = Some("Jarvis quedó sin modelo activo.".to_string());
                state.jarvis_model_path.clear();
            }

            state.persist_config();
        }
    }

    if ui
        .checkbox(&mut state.jarvis_auto_start, "Start Jarvis automatically")
        .changed()
    {
        state.persist_config();
        if state.jarvis_auto_start {
            match state.ensure_jarvis_runtime() {
                Ok(runtime) => {
                    state.jarvis_status = Some(format!(
                        "Jarvis se iniciará automáticamente con {}.",
                        runtime.model_label()
                    ));
                }
                Err(err) => {
                    state.jarvis_status =
                        Some(format!("No se pudo preparar el autoarranque: {}", err));
                }
            }
        } else {
            state.jarvis_status =
                Some("El autoarranque de Jarvis ha sido desactivado.".to_string());
            state.jarvis_runtime = None;
        }
    }

    ui.horizontal(|ui| {
        if ui
            .checkbox(
                &mut state.jarvis_respond_without_alias,
                "Responder automáticamente sin mención",
            )
            .changed()
        {
            state.persist_config();
        }
        ui.add_space(8.0);
        ui.label(
            RichText::new("Cuando está activo, Jarvis contestará todos los mensajes.")
                .color(theme::COLOR_TEXT_WEAK)
                .size(12.0),
        );
    });

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
