use eframe::egui::{self, Color32, Frame, Margin, RichText, Rounding};

use crate::state::AppState;

use super::theme;

pub fn draw_header(ctx: &egui::Context, state: &mut AppState) {
    egui::TopBottomPanel::top("global_header")
        .exact_height(64.0)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_HEADER)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 18.0,
                    top: 10.0,
                    bottom: 10.0,
                }),
        )
        .show(ctx, |ui| {
            ui.set_height(44.0);
            ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                ui.spacing_mut().item_spacing.x = 10.0;

                draw_logo(ui);
                ui.label(
                    RichText::new("Jungle MonkAI")
                        .size(18.0)
                        .color(theme::COLOR_TEXT_PRIMARY)
                        .strong(),
                );

                ui.add_space(12.0);
                ui.separator();
                ui.add_space(16.0);

                let available = ui.available_width();
                let search_width = available.clamp(240.0, 420.0);
                if available > search_width {
                    ui.add_space(available - search_width);
                }

                ui.allocate_ui_with_layout(
                    egui::vec2(search_width, 0.0),
                    egui::Layout::left_to_right(egui::Align::Center),
                    |ui| {
                        ui.set_width(search_width);
                        draw_search(ui, state);
                    },
                );
            });
        });
}

fn draw_logo(ui: &mut egui::Ui) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(30.0, 30.0), egui::Sense::hover());
    let painter = ui.painter_at(rect);

    let outer = rect.expand2(egui::vec2(0.0, 0.0));
    painter.rect(
        outer,
        egui::Rounding::same(4.0),
        Color32::from_rgb(0, 204, 102),
        egui::Stroke::new(1.5, Color32::from_rgb(10, 70, 40)),
    );

    let inner_rect = egui::Rect::from_center_size(outer.center(), egui::vec2(22.0, 22.0));
    painter.circle(
        inner_rect.center(),
        inner_rect.width() * 0.35,
        theme::COLOR_HEADER,
        egui::Stroke::new(1.2, Color32::from_rgb(0, 204, 102)),
    );

    painter.text(
        inner_rect.center(),
        egui::Align2::CENTER_CENTER,
        "JM",
        egui::FontId::proportional(12.0),
        Color32::from_rgb(12, 18, 16),
    );
}

fn draw_search(ui: &mut egui::Ui, state: &mut AppState) {
    Frame::none()
        .fill(Color32::from_rgb(44, 46, 52))
        .stroke(theme::subtle_border())
        .rounding(Rounding::same(12.0))
        .inner_margin(Margin::symmetric(14.0, 10.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_height(36.0);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 8.0;
                ui.label(RichText::new("🔍").color(theme::COLOR_TEXT_WEAK));
                let input_width = ui.available_width().max(160.0);
                ui.add_sized(
                    [input_width, 28.0],
                    egui::TextEdit::singleline(&mut state.search_buffer)
                        .hint_text("Buscar recursos...")
                        .frame(false),
                );
            });
        });
}
