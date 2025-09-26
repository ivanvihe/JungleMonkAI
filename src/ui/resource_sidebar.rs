use crate::state::AppState;
use eframe::egui::{self, Color32, Label, Margin, RichText, Stroke};

use super::theme;
use std::path::Path;

const ICON_SYSTEM: &str = "\u{f2db}"; // microchip
const ICON_JARVIS: &str = "\u{f0a0}"; // hard-drive
const ICON_OPENAI: &str = "\u{f544}"; // robot
const ICON_CLAUDE: &str = "\u{e2ca}"; // wand-magic-sparkles
const ICON_GROQ: &str = "\u{f0e7}"; // bolt
const COLOR_WARNING: Color32 = Color32::from_rgb(255, 196, 0);

pub fn draw_resource_sidebar(ctx: &egui::Context, state: &AppState) {
    egui::SidePanel::right("resource_panel")
        .resizable(true)
        .default_width(280.0)
        .width_range(220.0..=420.0)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::symmetric(20.0, 18.0)),
        )
        .show(ctx, |ui| {
            let total_width = ui.available_width();
            let content_width = total_width.min(360.0);
            let horizontal_padding = ((total_width - content_width) / 2.0).max(0.0);

            ui.horizontal(|ui| {
                if horizontal_padding > 0.0 {
                    ui.add_space(horizontal_padding);
                }

                ui.vertical(|ui| {
                    ui.set_width(content_width);
                    ui.heading(
                        RichText::new("Resumen de recursos")
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .strong(),
                    );
                    ui.label(RichText::new("Actualizado ahora").color(theme::COLOR_TEXT_WEAK));
                    ui.add_space(12.0);

                    let rows = resource_rows(state);
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            for (index, row) in rows.iter().enumerate() {
                                draw_resource_row(ui, row);
                                if index + 1 != rows.len() {
                                    ui.add_space(10.0);
                                    ui.separator();
                                    ui.add_space(10.0);
                                }
                            }
                        });
                });

                if horizontal_padding > 0.0 {
                    ui.add_space(horizontal_padding);
                }
            });
        });
}

fn draw_resource_row(ui: &mut egui::Ui, row: &ResourceRow) {
    egui::Frame::none()
        .fill(Color32::from_rgb(30, 32, 38))
        .stroke(theme::subtle_border())
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            let status_width = 150.0;

            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 14.0;

                ui.label(
                    RichText::new(row.icon)
                        .font(theme::icon_font(18.0))
                        .color(theme::COLOR_PRIMARY),
                );

                ui.vertical(|ui| {
                    ui.set_width((ui.available_width() - status_width).max(160.0));
                    ui.label(
                        RichText::new(row.name)
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .strong(),
                    );
                });

                let spacer = ui.available_width() - status_width;
                if spacer > 0.0 {
                    ui.add_space(spacer);
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let StatusIndicator::Led { color, status } = &row.indicator;
                    draw_led(ui, *color, status);
                });
            });

            ui.add_space(6.0);
            let detail_width = ui.available_width();
            ui.set_width(detail_width);
            ui.add(Label::new(RichText::new(&row.detail).color(theme::COLOR_TEXT_WEAK)).wrap(true));
        });
}

fn draw_led(ui: &mut egui::Ui, color: Color32, label: &str) {
    ui.spacing_mut().item_spacing.x = 6.0;
    let (rect, response) = ui.allocate_exact_size(egui::vec2(18.0, 18.0), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    let center = rect.center();
    painter.circle_filled(center, 6.0, color);
    painter.circle_stroke(center, 6.0, Stroke::new(1.0, color.gamma_multiply(0.5)));
    painter.circle_stroke(center, 7.0, Stroke::new(1.2, color.gamma_multiply(0.3)));
    response.on_hover_text(label);
    ui.label(
        RichText::new(label)
            .color(theme::COLOR_TEXT_PRIMARY)
            .size(12.0),
    );
}

struct ResourceRow {
    icon: &'static str,
    name: &'static str,
    detail: String,
    indicator: StatusIndicator,
}

enum StatusIndicator {
    Led { color: Color32, status: String },
}

fn resource_rows(state: &AppState) -> Vec<ResourceRow> {
    vec![
        ResourceRow {
            icon: ICON_SYSTEM,
            name: "Sistema",
            detail: format!(
                "Memoria límite {:.1} GB · Disco {:.1} GB",
                state.resource_memory_limit_gb, state.resource_disk_limit_gb
            ),
            indicator: StatusIndicator::Led {
                color: theme::COLOR_SUCCESS,
                status: "Operativo".to_string(),
            },
        },
        ResourceRow {
            icon: ICON_JARVIS,
            name: "Jarvis",
            detail: jarvis_detail(state),
            indicator: jarvis_indicator(state),
        },
        ResourceRow {
            icon: ICON_OPENAI,
            name: "OpenAI",
            detail: format!("Modelo {}", state.openai_default_model),
            indicator: provider_indicator(
                state.openai_test_status.as_ref(),
                state.config.openai.api_key.as_ref().map(|s| s.as_str()),
                "OpenAI",
                "Pendiente de prueba",
            ),
        },
        ResourceRow {
            icon: ICON_CLAUDE,
            name: "Claude",
            detail: format!("Modelo {}", state.claude_default_model),
            indicator: provider_indicator(
                state.anthropic_test_status.as_ref(),
                state.config.anthropic.api_key.as_ref().map(|s| s.as_str()),
                "Anthropic",
                "Pendiente de prueba",
            ),
        },
        ResourceRow {
            icon: ICON_GROQ,
            name: "Groq",
            detail: format!("Modelo {}", state.groq_default_model),
            indicator: provider_indicator(
                state.groq_test_status.as_ref(),
                state.config.groq.api_key.as_ref().map(|s| s.as_str()),
                "Groq",
                "Pendiente de prueba",
            ),
        },
    ]
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
            color: theme::COLOR_SUCCESS,
            status: format!("{} modelos listos", state.installed_local_models.len()),
        }
    }
}

fn jarvis_detail(state: &AppState) -> String {
    if let Some(model) = &state.jarvis_active_model {
        let trimmed_path = state.jarvis_model_path.trim();
        if trimmed_path.is_empty() {
            return format!("{} · ruta sin configurar", model.display_label());
        }

        let path = Path::new(trimmed_path);
        let display = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string())
            .unwrap_or_else(|| trimmed_path.to_string());

        format!("{} · {}", model.display_label(), display)
    } else if state.jarvis_model_path.trim().is_empty() {
        "Sin modelo seleccionado".to_string()
    } else {
        format!("Ruta {}", state.jarvis_model_path)
    }
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
        theme::COLOR_DANGER
    } else if lower.contains("alcanzable")
        || lower.contains("reachable")
        || lower.contains("ok")
        || lower.contains("complet")
        || lower.contains("instal")
        || lower.contains("disponible")
    {
        theme::COLOR_SUCCESS
    } else {
        COLOR_WARNING
    };

    StatusIndicator::Led {
        color,
        status: message.to_string(),
    }
}
