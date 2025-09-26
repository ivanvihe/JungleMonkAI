use crate::state::AppState;
use eframe::egui::{self, Color32, Frame, Label, Margin, RichText, Stroke};

use super::theme;
use std::path::Path;

const ICON_SYSTEM: &str = "\u{f2db}"; // microchip
const ICON_JARVIS: &str = "\u{f0a0}"; // hard-drive
const ICON_OPENAI: &str = "\u{f544}"; // robot
const ICON_CLAUDE: &str = "\u{e2ca}"; // wand-magic-sparkles
const ICON_GROQ: &str = "\u{f0e7}"; // bolt
const COLOR_WARNING: Color32 = Color32::from_rgb(255, 196, 0);
const ICON_COLLAPSE_RIGHT: &str = "\u{f054}"; // chevron-right
const ICON_EXPAND_LEFT: &str = "\u{f053}"; // chevron-left

const RIGHT_PANEL_WIDTH: f32 = 320.0;
const COLLAPSED_HANDLE_WIDTH: f32 = 28.0;

pub fn draw_resource_sidebar(ctx: &egui::Context, state: &mut AppState) {
    state.right_panel_width = RIGHT_PANEL_WIDTH;

    if !state.right_panel_visible {
        egui::SidePanel::right("resource_panel_collapsed")
            .resizable(false)
            .exact_width(COLLAPSED_HANDLE_WIDTH)
            .frame(
                egui::Frame::none()
                    .fill(theme::COLOR_PANEL)
                    .stroke(theme::subtle_border())
                    .inner_margin(egui::Margin::same(8.0))
                    .rounding(egui::Rounding::same(14.0)),
            )
            .show(ctx, |ui| {
                ui.vertical_centered(|ui| {
                    ui.add_space(12.0);
                    let button = egui::Button::new(
                        RichText::new(ICON_EXPAND_LEFT)
                            .font(theme::icon_font(16.0))
                            .color(theme::COLOR_TEXT_PRIMARY),
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
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 20.0,
                    top: 20.0,
                    bottom: 20.0,
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
                            .color(theme::COLOR_TEXT_PRIMARY),
                    )
                    .frame(false);
                    if ui.add_sized([26.0, 24.0], button).clicked() {
                        state.right_panel_visible = false;
                    }
                    ui.heading(
                        RichText::new("Resumen de recursos")
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .strong(),
                    );
                });
                ui.label(RichText::new("Actualizado ahora").color(theme::COLOR_TEXT_WEAK));
                ui.add_space(12.0);

                let rows = resource_rows(state);
                egui::ScrollArea::vertical()
                    .id_source("resource_summary_scroll")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        for row in rows.iter() {
                            draw_resource_row(ui, row);
                            ui.add_space(8.0);
                        }
                    });
            });
        });
}

fn draw_resource_row(ui: &mut egui::Ui, row: &ResourceRow) {
    let total_width = ui.available_width();
    let row_width = (total_width * 0.9).max(total_width - 42.0).min(total_width);

    ui.horizontal(|ui| {
        ui.add_space(2.0);
        ui.vertical(|ui| {
            ui.set_width(row_width);
            Frame::none()
                .fill(Color32::from_rgb(28, 30, 36))
                .stroke(theme::subtle_border())
                .rounding(egui::Rounding::same(14.0))
                .inner_margin(Margin::symmetric(12.0, 10.0))
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    let available = ui.available_width();
                    let status_width = (available * 0.32)
                        .max(110.0)
                        .min(available * 0.42)
                        .min(190.0);

                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 10.0;

                        ui.label(
                            RichText::new(row.icon)
                                .font(theme::icon_font(18.0))
                                .color(theme::COLOR_PRIMARY),
                        );

                        let available_after_icon = ui.available_width();
                        let text_width = (available_after_icon - status_width)
                            .max(140.0)
                            .min(available_after_icon);

                        ui.allocate_ui_with_layout(
                            egui::vec2(text_width, 0.0),
                            egui::Layout::top_down(egui::Align::LEFT),
                            |ui| {
                                ui.set_width(ui.available_width());
                                ui.label(
                                    RichText::new(row.name)
                                        .color(theme::COLOR_TEXT_PRIMARY)
                                        .strong(),
                                );
                            },
                        );

                        ui.allocate_ui_with_layout(
                            egui::vec2(status_width, 0.0),
                            egui::Layout::top_down(egui::Align::RIGHT),
                            |ui| {
                                ui.set_width(status_width);
                                ui.vertical_centered(|ui| {
                                    ui.with_layout(
                                        egui::Layout::left_to_right(egui::Align::Center),
                                        |ui| {
                                            let StatusIndicator::Led { color, status } =
                                                &row.indicator;
                                            draw_led(ui, *color, status);
                                        },
                                    );
                                });
                            },
                        );
                    });

                    if !row.details.is_empty() {
                        ui.add_space(10.0);
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 6.0;
                            for detail in &row.details {
                                if let Some(label) = &detail.label {
                                    ui.label(
                                        RichText::new(label)
                                            .color(theme::COLOR_TEXT_WEAK)
                                            .size(12.0),
                                    );
                                }
                                ui.label(
                                    RichText::new(&detail.value)
                                        .color(theme::COLOR_TEXT_PRIMARY)
                                        .size(13.0),
                                );
                            }
                        });
                    }
                });
        });
        ui.add_space(2.0);
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
    let label_width = ui.available_width().max(0.0);
    let label_widget = Label::new(
        RichText::new(label)
            .color(theme::COLOR_TEXT_PRIMARY)
            .size(12.0),
    )
    .wrap(true);
    ui.add_sized([label_width, 0.0], label_widget);
}

struct ResourceRow {
    icon: &'static str,
    name: &'static str,
    details: Vec<ResourceDetail>,
    indicator: StatusIndicator,
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

fn resource_rows(state: &AppState) -> Vec<ResourceRow> {
    vec![
        ResourceRow {
            icon: ICON_SYSTEM,
            name: "Sistema",
            details: vec![
                ResourceDetail::labeled(
                    "Memoria",
                    format!("{:.1} GB", state.resource_memory_limit_gb),
                ),
                ResourceDetail::labeled("Disco", format!("{:.1} GB", state.resource_disk_limit_gb)),
            ],
            indicator: StatusIndicator::Led {
                color: theme::COLOR_SUCCESS,
                status: "Operativo".to_string(),
            },
        },
        ResourceRow {
            icon: ICON_JARVIS,
            name: "Jarvis",
            details: jarvis_details(state),
            indicator: jarvis_indicator(state),
        },
        ResourceRow {
            icon: ICON_OPENAI,
            name: "OpenAI",
            details: provider_details("Modelo", &state.openai_default_model),
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
            details: provider_details("Modelo", &state.claude_default_model),
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
            details: provider_details("Modelo", &state.groq_default_model),
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

fn provider_details(prefix: &str, model: &str) -> Vec<ResourceDetail> {
    if model.trim().is_empty() {
        vec![ResourceDetail::labeled(prefix, "Sin modelo")]
    } else {
        vec![ResourceDetail::labeled(prefix, model.trim().to_string())]
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
