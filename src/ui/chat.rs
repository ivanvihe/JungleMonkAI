use crate::api::{claude::AnthropicModel, github};
use crate::local_providers::{LocalModelCard, LocalModelIdentifier, LocalModelProvider};
use crate::state::{AppState, ChatMessage, MainView, PreferenceSection, AVAILABLE_CUSTOM_ACTIONS};
use anyhow::Result;
use eframe::egui::{self, Color32, RichText, Spinner};

use super::{logs, theme};

const ICON_USER: &str = "\u{f007}"; // user
const ICON_SYSTEM: &str = "\u{f085}"; // cogs
const ICON_ASSISTANT: &str = "\u{f544}"; // robot
const ICON_CLOCK: &str = "\u{f017}"; // clock
const ICON_COPY: &str = "\u{f0c5}"; // copy
const ICON_QUOTE: &str = "\u{f10e}"; // quote-right
const ICON_PIN: &str = "\u{f08d}"; // thumb-tack
const ICON_SEND: &str = "\u{f04b}"; // play
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
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 0.0,
                    top: 18.0,
                    bottom: 14.0,
                }),
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
        .inner_margin(egui::Margin {
            left: 20.0,
            right: 14.0,
            top: 20.0,
            bottom: 18.0,
        })
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
        let mut bubble_width = (available_width - 8.0).max(260.0);
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
                draw_message_body(ui, message, accent);
            });
        });

        if response.response.double_clicked() && !is_user && !message.is_pending() {
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
    let enabled = !message.is_pending();

    if message_action_button(ui, ICON_COPY, "Copiar mensaje al portapapeles", enabled).clicked() {
        let text = message.text.clone();
        ui.output_mut(|out| out.copied_text = text);
    }

    if message_action_button(ui, ICON_QUOTE, "Citar mensaje en el input", enabled).clicked() {
        let mut quoted = message
            .text
            .lines()
            .map(|line| format!("> {}", line))
            .collect::<Vec<_>>()
            .join("\n");
        quoted.push_str("\n\n");
        pending_actions.push(PendingChatAction::Quote(quoted));
    }

    if message_action_button(ui, ICON_PIN, "Reutilizar este mensaje", enabled).clicked() {
        pending_actions.push(PendingChatAction::Reuse(message.text.clone()));
    }
}

fn message_action_button(
    ui: &mut egui::Ui,
    icon: &str,
    tooltip: &str,
    enabled: bool,
) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(icon)
            .font(theme::icon_font(13.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(30.0, 26.0))
    .fill(Color32::from_rgb(44, 46, 54))
    .rounding(egui::Rounding::same(6.0));

    let response = ui.add_enabled(enabled, button);
    response.on_hover_text(tooltip)
}

fn draw_message_body(ui: &mut egui::Ui, message: &ChatMessage, accent: Color32) {
    if message.is_pending() {
        ui.horizontal(|ui| {
            ui.add(Spinner::new().size(18.0));
            ui.label(
                RichText::new(&message.text)
                    .color(theme::COLOR_TEXT_WEAK)
                    .italics()
                    .size(14.0),
            );
        });
        return;
    }

    let blocks = parse_markdown_blocks(&message.text);
    if blocks.is_empty() {
        render_formatted_text(ui, &message.text, theme::COLOR_TEXT_PRIMARY, 15.0);
    } else {
        render_markdown_blocks(ui, &blocks, accent);
    }
}

fn render_markdown_blocks(ui: &mut egui::Ui, blocks: &[MarkdownBlock], accent: Color32) {
    let mut first = true;
    for block in blocks {
        if !first {
            ui.add_space(6.0);
        }
        first = false;

        match block {
            MarkdownBlock::Heading { level, text } => {
                let size = match level {
                    1 => 20.0,
                    2 => 18.0,
                    3 => 16.0,
                    _ => 15.0,
                };
                ui.label(RichText::new(text).color(accent).strong().size(size));
            }
            MarkdownBlock::Paragraph(text) => {
                render_formatted_text(ui, text, theme::COLOR_TEXT_PRIMARY, 15.0);
            }
            MarkdownBlock::BulletList(items) => {
                ui.vertical(|ui| {
                    for item in items {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            ui.label(RichText::new("•").color(accent).strong().size(16.0));
                            render_formatted_text(ui, item, theme::COLOR_TEXT_PRIMARY, 15.0);
                        });
                    }
                });
            }
            MarkdownBlock::CodeBlock { language, code } => {
                draw_code_block(ui, language, code);
            }
        }
    }
}

fn draw_code_block(ui: &mut egui::Ui, language: &str, code: &str) {
    let code_string = code.trim_end_matches('\n').to_string();

    egui::Frame::none()
        .fill(Color32::from_rgb(32, 34, 40))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(60, 72, 92)))
        .rounding(egui::Rounding::same(10.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 6.0;
                    if !language.trim().is_empty() {
                        ui.label(
                            RichText::new(language)
                                .monospace()
                                .color(theme::COLOR_TEXT_WEAK)
                                .size(13.0),
                        );
                    } else {
                        ui.label(
                            RichText::new("Bloque de código")
                                .color(theme::COLOR_TEXT_WEAK)
                                .size(13.0)
                                .italics(),
                        );
                    }
                    ui.add_space(ui.available_width());
                    if code_copy_button(ui).clicked() {
                        ui.output_mut(|out| out.copied_text = code_string.clone());
                    }
                });

                ui.add_space(6.0);

                let mut code_buffer = code_string.clone();
                let rows = code_buffer.lines().count().max(1);
                ui.add(
                    egui::TextEdit::multiline(&mut code_buffer)
                        .font(egui::FontId::monospace(14.0))
                        .desired_rows(rows)
                        .frame(false)
                        .interactive(false)
                        .desired_width(f32::INFINITY),
                );
            });
        });
}

fn code_copy_button(ui: &mut egui::Ui) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(ICON_COPY)
            .font(theme::icon_font(14.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(32.0, 26.0))
    .fill(Color32::from_rgb(45, 47, 56))
    .rounding(egui::Rounding::same(6.0));

    ui.add(button).on_hover_text("Copiar bloque de código")
}

fn render_formatted_text(ui: &mut egui::Ui, text: &str, color: Color32, size: f32) {
    let segments = parse_inline_segments(text);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;
        for segment in segments {
            if segment.text.is_empty() {
                continue;
            }

            let mut rich = RichText::new(segment.text).color(color).size(size);
            if segment.bold {
                rich = rich.strong();
            }
            if segment.italic {
                rich = rich.italics();
            }
            if segment.code {
                rich = rich
                    .monospace()
                    .background_color(Color32::from_rgb(40, 44, 54))
                    .color(Color32::from_rgb(220, 220, 220));
            }

            ui.label(rich);
        }
    });
}

fn parse_markdown_blocks(text: &str) -> Vec<MarkdownBlock> {
    let mut blocks = Vec::new();
    let mut paragraph: Vec<String> = Vec::new();
    let mut list_items: Vec<String> = Vec::new();
    let mut code_lines: Vec<String> = Vec::new();
    let mut code_language = String::new();
    let mut in_code_block = false;

    let flush_paragraph = |blocks: &mut Vec<MarkdownBlock>, paragraph: &mut Vec<String>| {
        if paragraph.is_empty() {
            return;
        }
        let mut combined = String::new();
        for (index, line) in paragraph.iter().enumerate() {
            if index > 0 {
                combined.push(' ');
            }
            combined.push_str(line);
        }
        paragraph.clear();
        blocks.push(MarkdownBlock::Paragraph(combined));
    };

    let flush_list = |blocks: &mut Vec<MarkdownBlock>, list_items: &mut Vec<String>| {
        if list_items.is_empty() {
            return;
        }
        blocks.push(MarkdownBlock::BulletList(list_items.clone()));
        list_items.clear();
    };

    for line in text.lines() {
        let trimmed_start = line.trim_start();
        let trimmed = line.trim();

        if in_code_block {
            if trimmed_start.starts_with("```") {
                let code = code_lines.join("\n");
                blocks.push(MarkdownBlock::CodeBlock {
                    language: code_language.clone(),
                    code,
                });
                code_lines.clear();
                code_language.clear();
                in_code_block = false;
            } else {
                code_lines.push(line.to_string());
            }
            continue;
        }

        if trimmed_start.starts_with("```") {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            code_language = trimmed_start[3..].trim().to_string();
            in_code_block = true;
            code_lines.clear();
            continue;
        }

        if trimmed.is_empty() {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            continue;
        }

        if trimmed_start.starts_with('#') {
            let hash_count = trimmed_start
                .chars()
                .take_while(|ch| *ch == '#')
                .count()
                .max(1);
            let content = trimmed_start[hash_count..].trim();
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            blocks.push(MarkdownBlock::Heading {
                level: hash_count.min(6),
                text: content.to_string(),
            });
            continue;
        }

        if let Some(stripped) = trimmed_start.strip_prefix("- ") {
            flush_paragraph(&mut blocks, &mut paragraph);
            list_items.push(stripped.trim().to_string());
            continue;
        }

        if let Some(stripped) = trimmed_start.strip_prefix("* ") {
            flush_paragraph(&mut blocks, &mut paragraph);
            list_items.push(stripped.trim().to_string());
            continue;
        }

        paragraph.push(trimmed.to_string());
    }

    if in_code_block {
        let code = code_lines.join("\n");
        blocks.push(MarkdownBlock::CodeBlock {
            language: code_language,
            code,
        });
    }

    flush_paragraph(&mut blocks, &mut paragraph);
    flush_list(&mut blocks, &mut list_items);

    blocks
}

fn parse_inline_segments(text: &str) -> Vec<InlineSegment> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut bold = false;
    let mut italic = false;
    let mut code = false;
    let mut index = 0;
    let bytes = text.as_bytes();

    while index < bytes.len() {
        if !code && text[index..].starts_with("**") {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            bold = !bold;
            index += 2;
            continue;
        }

        if !code && text[index..].starts_with('*') {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            italic = !italic;
            index += 1;
            continue;
        }

        if text[index..].starts_with('`') {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            code = !code;
            index += 1;
            continue;
        }

        let ch = text[index..].chars().next().unwrap();
        current.push(ch);
        index += ch.len_utf8();
    }

    if !current.is_empty() {
        segments.push(InlineSegment {
            text: current,
            bold,
            italic,
            code,
        });
    }

    segments
}

#[derive(Clone)]
struct InlineSegment {
    text: String,
    bold: bool,
    italic: bool,
    code: bool,
}

#[derive(Debug)]
enum MarkdownBlock {
    Heading { level: usize, text: String },
    Paragraph(String),
    BulletList(Vec<String>),
    CodeBlock { language: String, code: String },
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

                let text_height = 82.0;
                let enter_pressed = ui.input(|input| {
                    input.key_pressed(egui::Key::Enter) && !input.modifiers.shift
                });

                let text_response = ui
                    .allocate_ui_with_layout(
                        egui::vec2(ui.available_width(), text_height),
                        egui::Layout::top_down(egui::Align::LEFT),
                        |ui| {
                            let text_edit = egui::TextEdit::multiline(&mut state.current_chat_input)
                                .desired_rows(3)
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
                                .inner_margin(egui::Margin::symmetric(14.0, 10.0));

                            text_frame
                                .show(ui, |ui| {
                                    ui.set_height(text_height);
                                    ui.spacing_mut().item_spacing.x = 12.0;

                                    ui.horizontal(|ui| {
                                        let button_width = 34.0;
                                        let available = ui.available_width();
                                        let text_size = [
                                            (available - button_width).max(120.0),
                                            text_height - 20.0,
                                        ];
                                        let text_response =
                                            ui.add_sized(text_size, text_edit);

                                        let (button_rect, send_response) = ui
                                            .allocate_exact_size(
                                                egui::vec2(
                                                    button_width,
                                                    text_response
                                                        .rect
                                                        .height()
                                                        .max(28.0),
                                                ),
                                                egui::Sense::click(),
                                            );
                                        let send_response = send_response
                                            .on_hover_text("Enviar mensaje")
                                            .on_hover_cursor(egui::CursorIcon::PointingHand);
                                        let painter = ui.painter_at(button_rect);
                                        painter.text(
                                            button_rect.center(),
                                            egui::Align2::CENTER_CENTER,
                                            ICON_SEND,
                                            theme::icon_font(20.0),
                                            Color32::from_rgb(240, 240, 240),
                                        );

                                        (text_response, send_response)
                                    })
                                    .inner
                                })
                                .inner
                        },
                    )
                    .inner;

                let (text_response, send_response) = text_response;

                if text_response.has_focus() && enter_pressed {
                    should_send = true;
                    ui.ctx()
                        .memory_mut(|mem| mem.request_focus(text_response.id));
                }

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
        PreferenceSection::ModelsLocalHuggingFace => {
            draw_local_provider(ui, state, LocalModelProvider::HuggingFace)
        }
        PreferenceSection::ModelsLocalGithub => {
            draw_local_provider(ui, state, LocalModelProvider::GithubModels)
        }
        PreferenceSection::ModelsLocalReplicate => {
            draw_local_provider(ui, state, LocalModelProvider::Replicate)
        }
        PreferenceSection::ModelsLocalOllama => {
            draw_local_provider(ui, state, LocalModelProvider::Ollama)
        }
        PreferenceSection::ModelsLocalOpenRouter => {
            draw_local_provider(ui, state, LocalModelProvider::OpenRouter)
        }
        PreferenceSection::ModelsLocalModelscope => {
            draw_local_provider(ui, state, LocalModelProvider::Modelscope)
        }
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

fn draw_local_provider(ui: &mut egui::Ui, state: &mut AppState, provider: LocalModelProvider) {
    let mut persist_changes = false;
    let mut search_request: Option<(String, Option<String>)> = None;

    {
        let provider_state = state.provider_state_mut(provider);
        let token_label = provider.token_label();
        ui.label(format!("{}", token_label));
        ui.horizontal(|ui| {
            let response = ui.text_edit_singleline(&mut provider_state.token_input);
            if response.changed() {
                // Do not persist immediately; wait for the save button.
            }

            let save_label = RichText::new("Guardar").color(Color32::from_rgb(240, 240, 240));
            let button = theme::primary_button(save_label).min_size(egui::vec2(0.0, 28.0));
            if ui.add_sized([110.0, 30.0], button).clicked() {
                let trimmed = provider_state.token_input.trim();
                if trimmed.is_empty() {
                    provider_state.access_token = None;
                    provider_state.token_input.clear();
                } else {
                    provider_state.access_token = Some(trimmed.to_string());
                    provider_state.token_input = trimmed.to_string();
                }
                persist_changes = true;
            }
        });

        if provider.requires_token() && provider_state.access_token.is_none() {
            ui.colored_label(
                Color32::from_rgb(255, 196, 96),
                "Este proveedor requiere un token válido para listar modelos.",
            );
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
                    let search_edit = egui::TextEdit::singleline(&mut provider_state.search_query)
                        .hint_text(provider.search_hint())
                        .desired_width(f32::INFINITY);
                    let response = ui.add_sized([text_width, 30.0], search_edit);
                    if response.changed() {
                        persist_changes = true;
                    }

                    let needs_token =
                        provider.requires_token() && provider_state.access_token.is_none();
                    let mut clicked = false;
                    let search_label =
                        RichText::new("Buscar").color(Color32::from_rgb(240, 240, 240));
                    ui.add_enabled_ui(!needs_token, |ui| {
                        if ui
                            .add_sized(
                                [button_width, 32.0],
                                theme::primary_button(search_label.clone()),
                            )
                            .clicked()
                        {
                            clicked = true;
                        }
                    });

                    if clicked {
                        search_request = Some((
                            provider_state.search_query.clone(),
                            provider_state.access_token.clone(),
                        ));
                    }
                });
            });
    }

    if persist_changes {
        state.persist_config();
    }

    if let Some((query, token)) = search_request {
        match search_models_for_provider(provider, &query, token.as_deref()) {
            Ok(models) => {
                let count = models.len();
                let provider_state = state.provider_state_mut(provider);
                provider_state.models = models;
                provider_state.selected_model = None;
                provider_state.install_status = Some(format!(
                    "Se encontraron {} modelos para '{}'.",
                    count, query
                ));
                state.persist_config();
            }
            Err(err) => {
                let provider_state = state.provider_state_mut(provider);
                provider_state.install_status = Some(format!("Fallo al buscar modelos: {}", err));
            }
        }
    }

    ui.add_space(12.0);

    let (models, selected_model) = {
        let provider_state = state.provider_state(provider);
        (provider_state.models.clone(), provider_state.selected_model)
    };

    if models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Busca un término para poblar la galería de modelos.",
        );
    } else {
        ui.horizontal(|ui| {
            ui.heading(
                RichText::new(format!("Galería de modelos ({} resultados)", models.len()))
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
        draw_provider_gallery(ui, state, provider, &models, selected_model);
    }

    ui.add_space(12.0);
    let installed: Vec<LocalModelIdentifier> = state
        .installed_local_models
        .iter()
        .cloned()
        .filter(|model| model.provider == provider)
        .collect();

    if installed.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Todavía no hay modelos instalados desde este proveedor.",
        );
    } else {
        ui.label("Modelos instalados:");
        ui.add_space(4.0);
        egui::Grid::new(format!("installed_models_{}", provider.key()))
            .num_columns(1)
            .spacing([12.0, 6.0])
            .show(ui, |ui| {
                for model in installed {
                    ui.label(RichText::new(model.display_label()).color(theme::COLOR_TEXT_PRIMARY));
                    ui.end_row();
                }
            });
    }

    if let Some(status) = state.provider_state(provider).install_status.clone() {
        ui.add_space(10.0);
        ui.colored_label(theme::COLOR_TEXT_WEAK, status);
    }
}

fn draw_provider_gallery(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: LocalModelProvider,
    models: &[LocalModelCard],
    selected_model: Option<usize>,
) {
    let columns = if ui.available_width() > 840.0 { 3 } else { 2 };
    let spacing = 16.0;

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
                        draw_model_card(
                            &mut card_ui,
                            state,
                            provider,
                            model,
                            index,
                            selected_model == Some(index),
                        );

                        if response.clicked() {
                            state.provider_state_mut(provider).selected_model = Some(index);
                        }

                        if response.double_clicked() {
                            install_local_model(state, provider, index);
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
    provider: LocalModelProvider,
    model: &LocalModelCard,
    index: usize,
    is_selected: bool,
) {
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

                if let Some(description) = &model.description {
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new(description)
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
                    install_local_model(state, provider, index);
                }
            });
        });
}

fn install_local_model(state: &mut AppState, provider: LocalModelProvider, index: usize) {
    let (model, token) = {
        let provider_state = state.provider_state(provider);
        if let Some(model) = provider_state.models.get(index).cloned() {
            (model, provider_state.access_token.clone())
        } else {
            return;
        }
    };

    debug_assert_eq!(model.provider, provider);

    let status = match provider {
        LocalModelProvider::HuggingFace => {
            let install_dir = std::path::Path::new(&state.jarvis_install_dir);
            match crate::api::huggingface::download_model(&model, install_dir, token.as_deref()) {
                Ok(path) => {
                    let identifier = LocalModelIdentifier::new(provider, &model.id);
                    if !state
                        .installed_local_models
                        .iter()
                        .any(|installed| installed == &identifier)
                    {
                        state.installed_local_models.push(identifier.clone());
                    }

                    state.jarvis_selected_provider = provider;
                    state.jarvis_active_model = Some(identifier.clone());
                    state.jarvis_runtime = None;
                    state.jarvis_model_path = path.display().to_string();

                    let mut message =
                        format!("Modelo '{}' instalado en {}.", model.id, path.display());

                    state.push_activity_log(
                        crate::state::LogStatus::Ok,
                        "Jarvis",
                        format!("Modelo '{}' descargado en {}", model.id, path.display()),
                    );

                    if state.jarvis_auto_start {
                        match state.ensure_jarvis_runtime() {
                            Ok(runtime) => {
                                let label = runtime.model_label();
                                let _ = runtime;
                                message.push_str(&format!(" Jarvis se recargó con {}.", label));
                                state.push_activity_log(
                                    crate::state::LogStatus::Ok,
                                    "Jarvis",
                                    format!("Se instaló '{}' y Jarvis cargó {}.", model.id, label),
                                );
                            }
                            Err(err) => {
                                message.push_str(&format!(
                                    " No se pudo reiniciar Jarvis automáticamente: {}.",
                                    err
                                ));
                                state.push_activity_log(
                                    crate::state::LogStatus::Error,
                                    "Jarvis",
                                    format!(
                                        "El autoarranque falló tras instalar '{}': {}",
                                        model.id, err
                                    ),
                                );
                            }
                        }
                    }

                    state.persist_config();
                    state.jarvis_status = Some(message.clone());
                    message
                }
                Err(err) => {
                    let status = format!("Fallo al instalar '{}': {}", model.id, err);
                    state.jarvis_status = Some(status.clone());
                    state.push_activity_log(
                        crate::state::LogStatus::Error,
                        "Jarvis",
                        format!("No se pudo descargar '{}': {}", model.id, err),
                    );
                    status
                }
            }
        }
        LocalModelProvider::Ollama => {
            match crate::api::ollama::pull_model(&model.id, token.as_deref()) {
                Ok(()) => format!(
                "Modelo '{}' preparado mediante Ollama. Usa el runtime de Ollama para servirlo.",
                model.id
            ),
                Err(err) => format!("No se pudo preparar '{}' con Ollama: {}", model.id, err),
            }
        }
        _ => format!(
            "La instalación automática aún no está disponible para {}.",
            provider.display_name()
        ),
    };

    let provider_state = state.provider_state_mut(provider);
    provider_state.selected_model = Some(index);
    provider_state.install_status = Some(status);
}

fn search_models_for_provider(
    provider: LocalModelProvider,
    query: &str,
    token: Option<&str>,
) -> Result<Vec<LocalModelCard>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    match provider {
        LocalModelProvider::HuggingFace => crate::api::huggingface::search_models(trimmed, token),
        LocalModelProvider::Ollama => crate::api::ollama::search_models(trimmed, token),
        LocalModelProvider::OpenRouter => crate::api::openrouter::search_models(trimmed),
        _ => {
            let lowercase = trimmed.to_lowercase();
            let catalog = sample_catalog(provider);
            let filtered = catalog
                .into_iter()
                .filter(|card| {
                    card.id.to_lowercase().contains(&lowercase)
                        || card
                            .description
                            .as_ref()
                            .map(|desc| desc.to_lowercase().contains(&lowercase))
                            .unwrap_or(false)
                })
                .collect();
            Ok(filtered)
        }
    }
}

fn sample_catalog(provider: LocalModelProvider) -> Vec<LocalModelCard> {
    match provider {
        LocalModelProvider::GithubModels => vec![
            LocalModelCard {
                provider,
                id: "github/CodeLlama-34b".to_string(),
                author: Some("GitHub".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["code".to_string(), "llama".to_string()],
                description: Some(
                    "Modelos experimentales de GitHub Models listos para desplegar en contenedores.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "github/Phi-3-mini".to_string(),
                author: Some("GitHub".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["chat".to_string(), "preview".to_string()],
                description: Some(
                    "Inferencia hospedada en GitHub Models compatible con la API de OpenAI.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Replicate => vec![
            LocalModelCard {
                provider,
                id: "replicate/flux-dev".to_string(),
                author: Some("Replicate".to_string()),
                pipeline_tag: Some("image-to-image".to_string()),
                tags: vec!["diffusion".to_string(), "vision".to_string()],
                description: Some(
                    "Modelos visuales populares de la comunidad de Replicate disponibles mediante API.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "replicate/llama-3-70b-instruct".to_string(),
                author: Some("Replicate".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["chat".to_string(), "meta".to_string()],
                description: Some(
                    "Versión alojada de Llama 3 para uso inmediato a través de Replicate API.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Ollama => vec![
            LocalModelCard {
                provider,
                id: "ollama/llama3".to_string(),
                author: Some("Ollama".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["local".to_string(), "chat".to_string()],
                description: Some(
                    "Modelos descargables mediante 'ollama pull' listos para ejecutarse en tu host.".
                        to_string(),
                ),
                requires_token: false,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "ollama/codellama".to_string(),
                author: Some("Ollama".to_string()),
                pipeline_tag: Some("code-generation".to_string()),
                tags: vec!["code".to_string(), "local".to_string()],
                description: Some(
                    "Ejemplos de modelos que Ollama expone como imágenes portables para contenedores.".
                        to_string(),
                ),
                requires_token: false,
                ..Default::default()
            },
        ],
        LocalModelProvider::OpenRouter => vec![
            LocalModelCard {
                provider,
                id: "openrouter/google/gemini-pro".to_string(),
                author: Some("OpenRouter".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["router".to_string(), "gemini".to_string()],
                description: Some(
                    "Agrega modelos de múltiples proveedores con una única API compatible con OpenAI.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "openrouter/mistral/mixtral-8x7b".to_string(),
                author: Some("OpenRouter".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["mixture-of-experts".to_string()],
                description: Some(
                    "Modelos orquestados por OpenRouter listos para su consumo mediante claves personales.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Modelscope => vec![
            LocalModelCard {
                provider,
                id: "modelscope/Qwen1.5-14B-Chat".to_string(),
                author: Some("ModelScope".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["qwen".to_string(), "chat".to_string()],
                description: Some(
                    "Modelos del ecosistema ModelScope listos para descarga mediante su SDK oficial.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "modelscope/speech_paraformer".to_string(),
                author: Some("ModelScope".to_string()),
                pipeline_tag: Some("automatic-speech-recognition".to_string()),
                tags: vec!["audio".to_string(), "asr".to_string()],
                description: Some(
                    "Ejemplos de pipelines de voz disponibles a través del hub de ModelScope.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::HuggingFace => Vec::new(),
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

    if state.installed_local_models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Instala un modelo desde Hugging Face para habilitar Jarvis.",
        );
    } else {
        let mut provider = state.jarvis_selected_provider;
        let available_providers: Vec<LocalModelProvider> = state
            .installed_local_models
            .iter()
            .map(|model| model.provider)
            .collect();

        if !available_providers.contains(&provider) {
            provider = state
                .installed_local_models
                .first()
                .map(|model| model.provider)
                .unwrap_or(LocalModelProvider::HuggingFace);
        }

        egui::ComboBox::from_label("Proveedor local")
            .selected_text(provider.display_name().to_string())
            .show_ui(ui, |ui| {
                for candidate in LocalModelProvider::ALL {
                    if available_providers.contains(&candidate) {
                        ui.selectable_value(&mut provider, candidate, candidate.display_name());
                    }
                }
            });

        if provider != state.jarvis_selected_provider {
            state.jarvis_selected_provider = provider;
            if state
                .jarvis_active_model
                .as_ref()
                .map(|model| model.provider)
                != Some(provider)
            {
                state.jarvis_active_model = None;
            }
            state.persist_config();
        }

        let available_models: Vec<LocalModelIdentifier> = state
            .installed_local_models
            .iter()
            .cloned()
            .filter(|model| model.provider == provider)
            .collect();

        let mut selected_model = state
            .jarvis_active_model
            .as_ref()
            .filter(|model| model.provider == provider)
            .cloned();

        let current_label = selected_model
            .as_ref()
            .map(|model| model.display_label())
            .unwrap_or_else(|| "Selecciona un modelo instalado".to_string());

        egui::ComboBox::from_label("Modelo local activo")
            .selected_text(current_label)
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut selected_model, None, "— Sin modelo —");
                for model in &available_models {
                    ui.selectable_value(
                        &mut selected_model,
                        Some(model.clone()),
                        model.display_label(),
                    );
                }
            });

        if selected_model != state.jarvis_active_model {
            state.jarvis_active_model = selected_model.clone();
            state.jarvis_runtime = None;

            if let Some(model) = selected_model {
                let path = std::path::Path::new(&state.jarvis_install_dir)
                    .join(model.sanitized_dir_name());
                state.jarvis_model_path = path.display().to_string();
                state.jarvis_status = Some(format!(
                    "Modelo '{}' seleccionado para Jarvis.",
                    model.display_label()
                ));

                if state.jarvis_auto_start {
                    match state.ensure_jarvis_runtime() {
                        Ok(runtime) => {
                            state.jarvis_status =
                                Some(format!("Jarvis activo con {}.", runtime.model_label()));
                        }
                        Err(err) => {
                            state.jarvis_status = Some(format!(
                                "No se pudo iniciar Jarvis con {}: {}.",
                                model.display_label(),
                                err
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

    ui.add_space(16.0);
    ui.separator();
    ui.add_space(10.0);

    ui.heading(
        RichText::new("Catálogo de modelos disponibles")
            .color(theme::COLOR_TEXT_PRIMARY)
            .strong(),
    );
    ui.label(
        RichText::new(
            "Consulta la API de Anthropic para descubrir los modelos compatibles con tu cuenta.",
        )
        .color(theme::COLOR_TEXT_WEAK)
        .size(12.0),
    );
    ui.add_space(10.0);

    let mut refresh_triggered = false;
    if ui
        .add_sized(
            [180.0, 32.0],
            theme::primary_button(
                RichText::new("Actualizar catálogo").color(Color32::from_rgb(240, 240, 240)),
            ),
        )
        .clicked()
    {
        refresh_triggered = true;
    }

    if refresh_triggered {
        if anthropic_key.trim().is_empty() {
            state.claude_models_status =
                Some("Ingresa una API key válida antes de solicitar el catálogo.".to_string());
        } else {
            match crate::api::claude::list_models(anthropic_key.trim()) {
                Ok(models) => {
                    let count = models.len();
                    state.claude_available_models = models;
                    state.claude_models_status = Some(if count == 0 {
                        "No se encontraron modelos disponibles para esta cuenta.".to_string()
                    } else {
                        format!("Se encontraron {count} modelos disponibles.")
                    });
                }
                Err(err) => {
                    state.claude_models_status =
                        Some(format!("No se pudo obtener el listado de modelos: {}", err));
                }
            }
        }
    }

    if let Some(status) = &state.claude_models_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }

    ui.add_space(12.0);

    if state.claude_available_models.is_empty() {
        ui.colored_label(
            theme::COLOR_TEXT_WEAK,
            "Pulsa \"Actualizar catálogo\" para listar los modelos disponibles.",
        );
    } else {
        let models = state.claude_available_models.clone();
        draw_claude_models_gallery(ui, state, &models);
    }
}

fn draw_claude_models_gallery(ui: &mut egui::Ui, state: &mut AppState, models: &[AnthropicModel]) {
    let columns = if ui.available_width() > 720.0 { 2 } else { 1 };
    let spacing = 16.0;

    egui::ScrollArea::vertical()
        .max_height(360.0)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let available_width = ui.available_width();
            let card_width = ((available_width - spacing * ((columns as f32) - 1.0))
                / columns as f32)
                .max(260.0);

            for chunk in models.chunks(columns) {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = spacing;
                    for model in chunk {
                        let (rect, _) = ui
                            .allocate_at_least(egui::vec2(card_width, 200.0), egui::Sense::hover());
                        let mut card_ui =
                            ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                        draw_claude_model_card(&mut card_ui, state, model);
                    }

                    if chunk.len() < columns {
                        for _ in chunk.len()..columns {
                            ui.add_space(card_width);
                        }
                    }
                });
                ui.add_space(spacing);
            }
        });
}

fn draw_claude_model_card(ui: &mut egui::Ui, state: &mut AppState, model: &AnthropicModel) {
    let is_selected = state.claude_default_model.trim() == model.id;
    let fill = Color32::from_rgb(34, 38, 44);
    let border = if is_selected {
        theme::COLOR_PRIMARY
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
                let title = model
                    .display_name
                    .clone()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| model.id.clone());
                ui.label(
                    RichText::new(title)
                        .strong()
                        .color(theme::COLOR_TEXT_PRIMARY),
                );

                if model
                    .display_name
                    .as_ref()
                    .map(|value| value.trim() != model.id)
                    .unwrap_or(false)
                {
                    ui.label(
                        RichText::new(&model.id)
                            .color(theme::COLOR_TEXT_WEAK)
                            .size(12.0),
                    );
                }

                let mut metrics = Vec::new();
                if let Some(context) = model.context_window {
                    metrics.push(format!("Contexto: {} tokens", context));
                }
                if let Some(limit) = model.input_token_limit {
                    metrics.push(format!("Entrada máx: {}", limit));
                }
                if let Some(limit) = model.output_token_limit {
                    metrics.push(format!("Salida máx: {}", limit));
                }
                if let Some(kind) = &model.r#type {
                    if !kind.trim().is_empty() {
                        metrics.push(format!("Tipo: {}", kind));
                    }
                }
                if !metrics.is_empty() {
                    ui.label(
                        RichText::new(metrics.join("  ·  "))
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .size(12.0),
                    );
                }

                if !model.aliases.is_empty() {
                    let mut aliases: Vec<&str> =
                        model.aliases.iter().map(|alias| alias.as_str()).collect();
                    if aliases.len() > 3 {
                        aliases.truncate(3);
                    }
                    let suffix = if model.aliases.len() > aliases.len() {
                        format!(" (+{} más)", model.aliases.len() - aliases.len())
                    } else {
                        String::new()
                    };
                    ui.label(
                        RichText::new(format!("Aliases: {}{}", aliases.join(", "), suffix))
                            .color(theme::COLOR_TEXT_WEAK)
                            .size(11.0),
                    );
                }

                if let Some(description) = &model.description {
                    if !description.trim().is_empty() {
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new(description)
                                .color(theme::COLOR_TEXT_WEAK)
                                .size(11.0),
                        );
                    }
                }

                ui.add_space(10.0);

                if ui
                    .add_sized(
                        [ui.available_width(), 30.0],
                        theme::primary_button(
                            RichText::new("Use this model").color(Color32::from_rgb(240, 240, 240)),
                        ),
                    )
                    .clicked()
                {
                    state.claude_default_model = model.id.clone();
                    state.persist_config();
                    state.claude_models_status = Some(format!(
                        "Modelo '{}' establecido como predeterminado.",
                        model.id
                    ));
                }
            });
        });
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
