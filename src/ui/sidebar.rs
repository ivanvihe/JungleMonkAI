use crate::state::AppState;
use eframe::egui;

use super::{tabs, theme};

const LEFT_PANEL_WIDTH: f32 = 280.0;

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    state.left_panel_width = LEFT_PANEL_WIDTH;

    egui::SidePanel::left("navigation_panel")
        .resizable(false)
        .exact_width(LEFT_PANEL_WIDTH)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 18.0,
                    top: 18.0,
                    bottom: 18.0,
                })
                .rounding(egui::Rounding::same(14.0)),
        )
        .show(ctx, |ui| {
            ui.set_width(ui.available_width());
            tabs::draw_sidebar_icons(ui, state);
        });
}
