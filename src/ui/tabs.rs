use eframe::egui::{self, Color32, Margin, RichText, Sense, Stroke};

use crate::state::{AppState, MainTab};

use super::theme;

const ICON_CHAT: &str = "\u{f086}"; // comments
const ICON_CRON: &str = "\u{f017}"; // clock
const ICON_ACTIVITY: &str = "\u{f201}"; // chart-line
const ICON_DEBUG: &str = "\u{f120}"; // terminal

#[derive(Clone, Copy)]
pub struct TabDefinition {
    pub tab: MainTab,
    pub label: &'static str,
    pub icon: &'static str,
    pub tooltip: &'static str,
}

pub const MAIN_TABS: &[TabDefinition] = &[
    TabDefinition {
        tab: MainTab::Chat,
        label: "CHAT",
        icon: ICON_CHAT,
        tooltip: "Conversación principal",
    },
    TabDefinition {
        tab: MainTab::Cron,
        label: "CRON",
        icon: ICON_CRON,
        tooltip: "Tareas programadas y cron jobs",
    },
    TabDefinition {
        tab: MainTab::Activity,
        label: "ACTIVITY",
        icon: ICON_ACTIVITY,
        tooltip: "Actividad reciente del sistema",
    },
    TabDefinition {
        tab: MainTab::DebugConsole,
        label: "DEBUG CONSOLE",
        icon: ICON_DEBUG,
        tooltip: "Herramientas de diagnóstico",
    },
];

pub fn draw_main_tab_bar(ui: &mut egui::Ui, state: &mut AppState) {
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

    bar_frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.spacing_mut().item_spacing.x = 24.0;
        ui.horizontal(|ui| {
            for definition in MAIN_TABS {
                draw_tab_button(ui, state, definition);
            }
        });
    });
}

fn draw_tab_button(ui: &mut egui::Ui, state: &mut AppState, definition: &TabDefinition) {
    let is_active = state.active_main_tab == definition.tab;
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
    label_ui.label(
        RichText::new(definition.icon)
            .font(theme::icon_font(14.0))
            .color(text_color),
    );
    label_ui.add_space(6.0);
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

    if response.clicked() {
        state.set_active_tab(definition.tab);
    }

    if !definition.tooltip.is_empty() {
        response.on_hover_text(definition.tooltip);
    }
}
