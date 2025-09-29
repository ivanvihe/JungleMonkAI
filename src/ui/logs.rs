use eframe::egui::{self, Color32, RichText};
use egui_extras::{Column, TableBuilder};

use crate::state::{AppState, LogStatus};

use super::theme;

const ICON_LOGS: &str = "\u{f0f6}"; // file-lines
const COLOR_WARNING: Color32 = Color32::from_rgb(255, 196, 0);
const COLOR_RUNNING: Color32 = Color32::from_rgb(64, 172, 255);

pub fn draw_logs_view(ui: &mut egui::Ui, state: &AppState) {
    let tokens = &state.theme;
    ui.set_width(ui.available_width());
    ui.set_min_height(ui.available_height());

    egui::Frame::none()
        .fill(Color32::from_rgb(26, 28, 32))
        .stroke(theme::subtle_border(tokens))
        .rounding(egui::Rounding::same(18.0))
        .inner_margin(egui::Margin {
            left: 20.0,
            right: 16.0,
            top: 20.0,
            bottom: 18.0,
        })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_min_height(ui.available_height());

            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_LOGS)
                        .font(theme::icon_font(18.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new("Registros y tareas")
                        .color(theme::color_text_primary())
                        .strong(),
                );
            });

            ui.add_space(12.0);

            egui::ScrollArea::both()
                .id_source("logs_view_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.set_min_height(ui.available_height());
                    draw_logs_table(ui, state);
                });
        });
}

fn draw_logs_table(ui: &mut egui::Ui, state: &AppState) {
    let header_bg = egui::Color32::from_rgb(42, 44, 50);
    let row_even = egui::Color32::from_rgb(34, 36, 42);
    let row_odd = egui::Color32::from_rgb(30, 32, 38);

    let min_height = ui.available_height().max(240.0);

    TableBuilder::new(ui)
        .striped(true)
        .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
        .column(Column::initial(72.0).at_least(64.0).resizable(true))
        .column(Column::initial(160.0).at_least(120.0).resizable(true))
        .column(Column::remainder().resizable(true))
        .column(Column::initial(150.0).at_least(120.0).resizable(true))
        .min_scrolled_height(min_height)
        .resizable(true)
        .header(30.0, |mut header| {
            header.col(|ui| {
                header_cell(ui, header_bg, |ui| {
                    ui.label(
                        RichText::new("Estado")
                            .color(theme::color_text_weak())
                            .monospace(),
                    );
                });
            });
            header.col(|ui| {
                header_cell(ui, header_bg, |ui| {
                    ui.label(
                        RichText::new("Origen")
                            .color(theme::color_text_weak())
                            .monospace(),
                    );
                });
            });
            header.col(|ui| {
                header_cell(ui, header_bg, |ui| {
                    ui.label(
                        RichText::new("Detalle")
                            .color(theme::color_text_weak())
                            .monospace(),
                    );
                });
            });
            header.col(|ui| {
                header_cell(ui, header_bg, |ui| {
                    ui.label(
                        RichText::new("Hora")
                            .color(theme::color_text_weak())
                            .monospace(),
                    );
                });
            });
        })
        .body(|mut body| {
            for (index, entry) in state.automation.activity_logs.iter().enumerate() {
                let bg = if index % 2 == 0 { row_even } else { row_odd };
                body.row(32.0, |mut row| {
                    row.col(|ui| {
                        row_cell(ui, bg, |ui| {
                            let (text, color) = match entry.status {
                                LogStatus::Ok => ("OK", theme::color_success()),
                                LogStatus::Warning => ("WARN", COLOR_WARNING),
                                LogStatus::Error => ("ERR", theme::color_danger()),
                                LogStatus::Running => ("RUN", COLOR_RUNNING),
                            };
                            ui.label(RichText::new(text).color(color).monospace());
                        });
                    });
                    row.col(|ui| {
                        row_cell(ui, bg, |ui| {
                            ui.label(
                                RichText::new(&entry.source)
                                    .color(theme::color_text_primary())
                                    .monospace(),
                            );
                        });
                    });
                    row.col(|ui| {
                        row_cell(ui, bg, |ui| {
                            ui.label(RichText::new(&entry.message).color(theme::color_text_weak()));
                        });
                    });
                    row.col(|ui| {
                        row_cell(ui, bg, |ui| {
                            ui.label(
                                RichText::new(&entry.timestamp)
                                    .color(theme::color_text_weak())
                                    .monospace(),
                            );
                        });
                    });
                });
            }
        });
}

fn header_cell(ui: &mut egui::Ui, bg: Color32, add_contents: impl FnOnce(&mut egui::Ui)) {
    ui.allocate_ui_with_layout(
        egui::vec2(ui.available_width(), 28.0),
        egui::Layout::left_to_right(egui::Align::Center),
        |ui| {
            let rect = ui.max_rect();
            ui.painter().rect_filled(rect, 4.0, bg);
            ui.set_clip_rect(rect);
            ui.add_space(12.0);
            add_contents(ui);
        },
    );
}

fn row_cell(ui: &mut egui::Ui, bg: Color32, add_contents: impl FnOnce(&mut egui::Ui)) {
    ui.allocate_ui_with_layout(
        egui::vec2(ui.available_width(), 28.0),
        egui::Layout::left_to_right(egui::Align::Center),
        |ui| {
            let rect = ui.max_rect();
            ui.painter().rect_filled(rect, 4.0, bg);
            ui.set_clip_rect(rect);
            ui.add_space(12.0);
            add_contents(ui);
        },
    );
}
