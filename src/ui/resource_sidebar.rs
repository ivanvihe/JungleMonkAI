use crate::state::AppState;
use eframe::egui::{self, Color32, RichText, Stroke};

use super::theme;

const ICON_SYSTEM: &str = "\u{f2db}"; // microchip
const ICON_JARVIS: &str = "\u{f0a0}"; // hard-drive
const ICON_OPENAI: &str = "\u{f544}"; // robot
const ICON_CLAUDE: &str = "\u{e2ca}"; // wand-magic-sparkles
const ICON_GROQ: &str = "\u{f0e7}"; // bolt

pub fn draw_resource_sidebar(ctx: &egui::Context, state: &AppState) {
    egui::SidePanel::right("resource_panel")
        .resizable(true)
        .default_width(280.0)
        .width_range(220.0..=360.0)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::same(16.0)),
        )
        .show(ctx, |ui| {
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
}

fn draw_resource_row(ui: &mut egui::Ui, row: &ResourceRow) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 10.0;
        ui.label(
            RichText::new(row.icon)
                .font(theme::icon_font(16.0))
                .color(theme::COLOR_PRIMARY),
        );
        ui.vertical(|ui| {
            ui.label(
                RichText::new(row.name)
                    .color(theme::COLOR_TEXT_PRIMARY)
                    .strong(),
            );
            ui.label(RichText::new(&row.detail).color(theme::COLOR_TEXT_WEAK));
        });
        ui.add_space(ui.available_width());
        match &row.indicator {
            StatusIndicator::Led { color, label } => draw_led(ui, *color, label),
            StatusIndicator::Text(text) => {
                ui.label(text.clone());
            }
        }
    });
}

fn draw_led(ui: &mut egui::Ui, color: Color32, label: &str) {
    let (rect, response) = ui.allocate_exact_size(egui::vec2(18.0, 18.0), egui::Sense::hover());
    let painter = ui.painter_at(rect);
    let center = rect.center();
    painter.circle_filled(center, 6.0, color);
    painter.circle_stroke(center, 6.0, Stroke::new(1.0, color.gamma_multiply(0.5)));
    painter.circle_stroke(center, 7.0, Stroke::new(1.5, color.gamma_multiply(0.2)));
    response.on_hover_text(label);
}

struct ResourceRow {
    icon: &'static str,
    name: &'static str,
    detail: String,
    indicator: StatusIndicator,
}

enum StatusIndicator {
    Led { color: Color32, label: String },
    Text(RichText),
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
            indicator: status_indicator(None, "Operativo"),
        },
        ResourceRow {
            icon: ICON_JARVIS,
            name: "Jarvis",
            detail: format!("Ruta {}", state.jarvis_model_path),
            indicator: status_indicator(state.jarvis_status.as_ref(), "Listo"),
        },
        ResourceRow {
            icon: ICON_OPENAI,
            name: "OpenAI",
            detail: format!("Modelo {}", state.openai_default_model),
            indicator: status_indicator(state.openai_test_status.as_ref(), "Disponible"),
        },
        ResourceRow {
            icon: ICON_CLAUDE,
            name: "Claude",
            detail: format!("Modelo {}", state.claude_default_model),
            indicator: status_indicator(state.anthropic_test_status.as_ref(), "Disponible"),
        },
        ResourceRow {
            icon: ICON_GROQ,
            name: "Groq",
            detail: format!("Modelo {}", state.groq_default_model),
            indicator: status_indicator(state.groq_test_status.as_ref(), "Disponible"),
        },
    ]
}

fn status_indicator(message: Option<&String>, fallback: &str) -> StatusIndicator {
    let label = message.cloned().unwrap_or_else(|| fallback.to_string());
    let color = status_color(&label);
    if label.to_lowercase().contains("disponible") {
        StatusIndicator::Led { color, label }
    } else {
        StatusIndicator::Text(RichText::new(label).color(color))
    }
}

fn status_color(label: &str) -> Color32 {
    let lower = label.to_lowercase();
    if lower.contains("error") || lower.contains("fail") {
        theme::COLOR_DANGER
    } else if lower.contains("index") || lower.contains("sync") {
        theme::COLOR_PRIMARY
    } else {
        theme::COLOR_SUCCESS
    }
}
