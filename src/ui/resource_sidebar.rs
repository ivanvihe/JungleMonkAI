use crate::state::{AppState, ChatMessage};
use eframe::egui::{self, Color32, Frame, Margin, RichText, Stroke};

use super::theme;
use std::path::Path;

const ICON_JARVIS: &str = "\u{f0a0}"; // hard-drive
const COLOR_WARNING: Color32 = Color32::from_rgb(255, 196, 0);
const ICON_COLLAPSE_RIGHT: &str = "\u{f054}"; // chevron-right
const ICON_EXPAND_LEFT: &str = "\u{f053}"; // chevron-left

const RIGHT_PANEL_WIDTH: f32 = 280.0;
const COLLAPSED_HANDLE_WIDTH: f32 = 28.0;

pub fn draw_resource_sidebar(ctx: &egui::Context, state: &mut AppState) {
    state.right_panel_width = RIGHT_PANEL_WIDTH;

    if !state.right_panel_visible {
        egui::SidePanel::right("resource_panel_collapsed")
            .resizable(false)
            .exact_width(COLLAPSED_HANDLE_WIDTH)
            .frame(
                egui::Frame::none()
                    .fill(theme::color_panel())
                    .stroke(theme::subtle_border(&state.theme))
                    .inner_margin(egui::Margin::same(8.0))
                    .rounding(egui::Rounding::same(14.0)),
            )
            .show(ctx, |ui| {
                ui.vertical_centered(|ui| {
                    ui.add_space(12.0);
                    let button = egui::Button::new(
                        RichText::new(ICON_EXPAND_LEFT)
                            .font(theme::icon_font(16.0))
                            .color(theme::color_text_primary()),
                    )
                    .frame(false);
                    if ui.add_sized([20.0, 24.0], button).clicked() {
                        state.right_panel_visible = true;
                    }
                });
            });
        return;
    }

    egui::SidePanel::right("resource_panel")
        .resizable(false)
        .exact_width(state.right_panel_width)
        .frame(
            egui::Frame::none()
                .fill(theme::color_panel())
                .stroke(theme::subtle_border(&state.theme))
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 18.0,
                    top: 18.0,
                    bottom: 18.0,
                })
                .rounding(egui::Rounding::same(14.0)),
        )
        .show(ctx, |ui| {
            let available_height = ui.available_height();
            let clip_rect = ui.max_rect();
            ui.set_clip_rect(clip_rect);
            ui.set_min_height(available_height);
            ui.set_width(clip_rect.width());

            ui.with_layout(egui::Layout::top_down(egui::Align::LEFT), |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    let button = egui::Button::new(
                        RichText::new(ICON_COLLAPSE_RIGHT)
                            .font(theme::icon_font(15.0))
                            .color(theme::color_text_primary()),
                    )
                    .frame(false);
                    if ui.add_sized([26.0, 24.0], button).clicked() {
                        state.right_panel_visible = false;
                    }
                    ui.heading(
                        RichText::new("Resumen de recursos")
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                });
                ui.label(RichText::new("Actualizado ahora").color(theme::color_text_weak()));
                ui.add_space(12.0);

                egui::ScrollArea::vertical()
                    .id_source("resource_summary_scroll")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        draw_jarvis_card(ui, state);
                        ui.add_space(12.0);
                        draw_models_card(ui, state);
                        ui.add_space(12.0);
                        draw_actions_section(ui, state);
                    });
            });
        });
}

fn draw_led(ui: &mut egui::Ui, color: Color32, tooltip: &str) {
    let (rect, response) = ui.allocate_exact_size(egui::vec2(18.0, 18.0), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    let center = rect.center();
    painter.circle_filled(center, 6.0, color);
    painter.circle_stroke(center, 6.0, Stroke::new(1.0, color.gamma_multiply(0.5)));
    painter.circle_stroke(center, 7.0, Stroke::new(1.2, color.gamma_multiply(0.3)));
    if !tooltip.trim().is_empty() {
        response.on_hover_text(tooltip);
    }
}

fn draw_actions_section(ui: &mut egui::Ui, state: &AppState) {
    ui.label(
        RichText::new("Acciones")
            .color(theme::color_text_primary())
            .strong(),
    );
    ui.label(
        RichText::new("Herramientas rápidas para tu sesión actual")
            .color(theme::color_text_weak())
            .size(12.0),
    );
    ui.add_space(8.0);

    Frame::none()
        .fill(Color32::from_rgb(28, 30, 36))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());

            let button = theme::secondary_button(
                RichText::new("Copiar conversación")
                    .color(theme::color_text_primary())
                    .strong(),
                &state.theme,
            );

            if ui.add_sized([ui.available_width(), 32.0], button).clicked() {
                let transcript = build_conversation_transcript(&state.chat_messages);
                ui.output_mut(|out| out.copied_text = transcript);
                ui.colored_label(
                    theme::color_text_weak(),
                    "Conversación copiada al portapapeles",
                );
            }
        });
}

fn build_conversation_transcript(messages: &[ChatMessage]) -> String {
    let mut transcript = String::new();

    for (index, message) in messages.iter().enumerate() {
        if index > 0 {
            transcript.push_str("\n\n");
        }

        let status = if message.is_pending() {
            " (pendiente)"
        } else {
            ""
        };

        transcript.push_str(&format!(
            "[{}] {}{}:\n{}",
            message.timestamp, message.sender, status, message.text
        ));
    }

    transcript
}

enum StatusIndicator {
    Led { color: Color32, status: String },
}

struct ResourceDetail {
    label: Option<String>,
    value: String,
}

impl ResourceDetail {
    fn value(value: impl Into<String>) -> Self {
        Self {
            label: None,
            value: value.into(),
        }
    }

    fn labeled(label: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            label: Some(label.into()),
            value: value.into(),
        }
    }
}

struct ModelOverview {
    handle: &'static str,
    detail: String,
    indicator: StatusIndicator,
}

fn draw_jarvis_card(ui: &mut egui::Ui, state: &AppState) {
    Frame::none()
        .fill(Color32::from_rgb(28, 30, 36))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());

            let indicator = jarvis_indicator(state);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 12.0;
                ui.label(
                    RichText::new(ICON_JARVIS)
                        .font(theme::icon_font(22.0))
                        .color(theme::color_primary()),
                );
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("Jarvis")
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                    ui.label(
                        RichText::new("Runtime de incrustaciones")
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    draw_status_led(ui, &indicator);
                });
            });

            let details = jarvis_details(state);
            if !details.is_empty() {
                ui.add_space(10.0);
                ui.spacing_mut().item_spacing.y = 6.0;
                for detail in &details {
                    if let Some(label) = &detail.label {
                        ui.label(
                            RichText::new(label)
                                .color(theme::color_text_weak())
                                .size(12.0),
                        );
                    }
                    ui.label(
                        RichText::new(&detail.value)
                            .color(theme::color_text_primary())
                            .size(13.0),
                    );
                }
            }
        });
}

fn draw_models_card(ui: &mut egui::Ui, state: &AppState) {
    let entries = vec![
        ModelOverview {
            handle: "@gpt",
            detail: provider_model_caption(&state.openai_default_model),
            indicator: provider_indicator(
                state.openai_test_status.as_ref(),
                state.config.openai.api_key.as_deref(),
                "OpenAI",
                "Pendiente de prueba",
            ),
        },
        ModelOverview {
            handle: "@claude",
            detail: provider_model_caption(&state.claude_default_model),
            indicator: provider_indicator(
                state.anthropic_test_status.as_ref(),
                state.config.anthropic.api_key.as_deref(),
                "Anthropic",
                "Pendiente de prueba",
            ),
        },
        ModelOverview {
            handle: "@groq",
            detail: provider_model_caption(&state.groq_default_model),
            indicator: provider_indicator(
                state.groq_test_status.as_ref(),
                state.config.groq.api_key.as_deref(),
                "Groq",
                "Pendiente de prueba",
            ),
        },
    ];

    Frame::none()
        .fill(Color32::from_rgb(28, 30, 36))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(
                RichText::new("Modelos conectados")
                    .color(theme::color_text_primary())
                    .strong(),
            );

            for (index, entry) in entries.iter().enumerate() {
                if index > 0 {
                    ui.add_space(10.0);
                    ui.separator();
                    ui.add_space(10.0);
                } else {
                    ui.add_space(8.0);
                }

                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 10.0;
                    ui.label(
                        RichText::new(entry.handle)
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        draw_status_led(ui, &entry.indicator);
                    });
                });

                ui.add_space(4.0);
                ui.label(
                    RichText::new(&entry.detail)
                        .color(theme::color_text_weak())
                        .size(12.0),
                );
            }
        });
}

fn draw_status_led(ui: &mut egui::Ui, indicator: &StatusIndicator) {
    let StatusIndicator::Led { color, status } = indicator;
    draw_led(ui, *color, status);
}

fn provider_model_caption(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        "[sin modelo configurado]".to_string()
    } else {
        format!("[{}]", trimmed)
    }
}

fn jarvis_indicator(state: &AppState) -> StatusIndicator {
    if let Some(status) = &state.jarvis_status {
        return led_from_message(status);
    }

    if state.installed_local_models.is_empty() {
        StatusIndicator::Led {
            color: COLOR_WARNING,
            status: "Sin modelos instalados".to_string(),
        }
    } else {
        StatusIndicator::Led {
            color: theme::color_success(),
            status: format!("{} modelos listos", state.installed_local_models.len()),
        }
    }
}

fn jarvis_details(state: &AppState) -> Vec<ResourceDetail> {
    if let Some(model) = &state.jarvis_active_model {
        let trimmed_path = state.jarvis_model_path.trim();
        let mut details = vec![ResourceDetail::labeled("Modelo", model.display_label())];

        if let Some(record) = state.installed_model(model) {
            let size = format_sidebar_bytes(record.size_bytes);
            details.push(ResourceDetail::labeled("Tamaño", size));
            let timestamp = format_sidebar_timestamp(record.installed_at);
            details.push(ResourceDetail::labeled("Instalado", timestamp));

            let effective_path = if record.install_path.trim().is_empty() {
                trimmed_path
            } else {
                record.install_path.as_str()
            };

            let display = Path::new(effective_path)
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_string())
                .unwrap_or_else(|| effective_path.to_string());
            details.push(ResourceDetail::labeled("Ruta", display));
            return details;
        }

        if trimmed_path.is_empty() {
            details.push(ResourceDetail::labeled("Ruta", "Sin configurar"));
        } else {
            let path = Path::new(trimmed_path);
            let display = path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_string())
                .unwrap_or_else(|| trimmed_path.to_string());
            details.push(ResourceDetail::labeled("Ruta", display));
        }

        details
    } else if state.jarvis_model_path.trim().is_empty() {
        vec![
            ResourceDetail::value("Sin modelo"),
            ResourceDetail::labeled("Ruta", "Configurar"),
        ]
    } else {
        vec![ResourceDetail::labeled(
            "Ruta",
            state.jarvis_model_path.trim().to_string(),
        )]
    }
}

fn format_sidebar_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "—".to_string();
    }

    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }

    if unit == 0 {
        format!("{} {}", bytes, UNITS[unit])
    } else {
        format!("{:.1} {}", value, UNITS[unit])
    }
}

fn format_sidebar_timestamp(timestamp: chrono::DateTime<chrono::Utc>) -> String {
    let local: chrono::DateTime<chrono::Local> = chrono::DateTime::from(timestamp);
    local.format("%d %b %Y").to_string()
}

fn provider_indicator(
    status: Option<&String>,
    api_key: Option<&str>,
    provider: &str,
    fallback: &str,
) -> StatusIndicator {
    if let Some(message) = status {
        return led_from_message(message);
    }

    let has_key = api_key.is_some_and(|key| !key.trim().is_empty());
    if has_key {
        StatusIndicator::Led {
            color: COLOR_WARNING,
            status: fallback.to_string(),
        }
    } else {
        StatusIndicator::Led {
            color: COLOR_WARNING,
            status: format!("{} sin API key", provider),
        }
    }
}

fn led_from_message(message: &str) -> StatusIndicator {
    let lower = message.to_lowercase();
    let color = if lower.contains("error")
        || lower.contains("fail")
        || lower.contains("timeout")
        || lower.contains("rechaz")
    {
        theme::color_danger()
    } else if lower.contains("alcanzable")
        || lower.contains("reachable")
        || lower.contains("ok")
        || lower.contains("complet")
        || lower.contains("instal")
        || lower.contains("disponible")
    {
        theme::color_success()
    } else {
        COLOR_WARNING
    };

    StatusIndicator::Led {
        color,
        status: message.to_string(),
    }
}
