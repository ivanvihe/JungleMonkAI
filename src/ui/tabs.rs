use eframe::egui::{self, Color32, Margin, RichText, Sense, Stroke};

use crate::state::MainTab;

use super::theme;

const ICON_CHAT: &str = "\u{f086}"; // comments
const ICON_CRON: &str = "\u{f017}"; // clock
const ICON_ACTIVITY: &str = "\u{f201}"; // chart-line
const ICON_DEBUG: &str = "\u{f120}"; // terminal

#[derive(Clone, Copy)]
pub struct TabDefinition<T> {
    pub id: T,
    pub label: &'static str,
    pub icon: Option<&'static str>,
    pub tooltip: &'static str,
}

pub const CHAT_SECTION_TABS: &[TabDefinition<MainTab>] = &[
    TabDefinition {
        id: MainTab::Chat,
        label: "Chat",
        icon: Some(ICON_CHAT),
        tooltip: "Conversación principal",
    },
    TabDefinition {
        id: MainTab::Cron,
        label: "Cron",
        icon: Some(ICON_CRON),
        tooltip: "Tareas programadas y cron jobs",
    },
    TabDefinition {
        id: MainTab::Activity,
        label: "Activity",
        icon: Some(ICON_ACTIVITY),
        tooltip: "Actividad reciente del sistema",
    },
    TabDefinition {
        id: MainTab::DebugConsole,
        label: "Debug console",
        icon: Some(ICON_DEBUG),
        tooltip: "Herramientas de diagnóstico",
    },
];

pub fn draw_tab_bar<T: Copy + PartialEq>(
    ui: &mut egui::Ui,
    active: T,
    definitions: &[TabDefinition<T>],
) -> Option<T> {
    ui.set_width(ui.available_width());
    let bar_frame = egui::Frame::none()
        .fill(Color32::from_rgb(24, 26, 32))
        .stroke(Stroke::new(1.0, theme::COLOR_BORDER))
        .inner_margin(Margin {
            left: 20.0,
            right: 20.0,
            top: 12.0,
            bottom: 6.0,
        });

    let mut selection = None;

    bar_frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.spacing_mut().item_spacing.x = 24.0;
        ui.horizontal(|ui| {
            for definition in definitions {
                if draw_tab_button(ui, active, definition) {
                    selection = Some(definition.id);
                }
            }
        });
    });

    selection
}

fn draw_tab_button<T: Copy + PartialEq>(
    ui: &mut egui::Ui,
    active: T,
    definition: &TabDefinition<T>,
) -> bool {
    let is_active = active == definition.id;
    let text_color = if is_active {
        theme::COLOR_TEXT_PRIMARY
    } else {
        theme::COLOR_TEXT_WEAK
    };

    let underline_color = if is_active {
        theme::COLOR_PRIMARY
    } else {
        theme::COLOR_BORDER
    };

    let galley = egui::WidgetText::from(definition.label).into_galley(
        ui,
        Some(false),
        f32::INFINITY,
        egui::TextStyle::Button,
    );
    let text_width = galley.rect.width().ceil();

    let button_width = (text_width + 32.0).max(112.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(button_width, 30.0), Sense::click());

    let painter = ui.painter_at(rect);
    let mut label_ui = ui.child_ui(rect, egui::Layout::left_to_right(egui::Align::Center));
    label_ui.add_space(2.0);

    if let Some(icon) = definition.icon {
        label_ui.label(
            RichText::new(icon)
                .font(theme::icon_font(14.0))
                .color(text_color),
        );
        label_ui.add_space(6.0);
    }

    label_ui.label(
        RichText::new(definition.label)
            .color(text_color)
            .strong()
            .size(14.0),
    );

    if is_active {
        painter.line_segment(
            [
                egui::pos2(rect.left(), rect.bottom() - 2.0),
                egui::pos2(rect.right(), rect.bottom() - 2.0),
            ],
            Stroke::new(2.0, underline_color),
        );
    }

    let was_clicked = response.clicked();

    if !definition.tooltip.is_empty() {
        response.on_hover_text(definition.tooltip);
    }

    was_clicked
}
