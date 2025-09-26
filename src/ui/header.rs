use eframe::egui::{self, Color32, RichText};

use crate::state::AppState;

use super::theme;

pub fn draw_header(ctx: &egui::Context, state: &mut AppState) {
    egui::TopBottomPanel::top("global_header")
        .exact_height(56.0)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_HEADER)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::symmetric(12.0, 6.0)),
        )
        .show(ctx, |ui| {
            ui.set_height(44.0);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;

                draw_logo(ui);
                ui.label(
                    RichText::new("Jungle MonkAI")
                        .size(18.0)
                        .color(theme::COLOR_TEXT_PRIMARY)
                        .strong(),
                );

                ui.separator();
                ui.add_space(4.0);
                draw_search(ui, state);
                ui.add_space(ui.available_width());
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
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        ui.label(RichText::new("🔍").color(theme::COLOR_TEXT_WEAK));
        ui.add_sized(
            [200.0, 26.0],
            egui::TextEdit::singleline(&mut state.search_buffer).hint_text("Buscar recursos..."),
        );
    });
}
