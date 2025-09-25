use eframe::egui::{self, RichText};
use egui_extras::{Column, TableBuilder};

use crate::state::{AppState, LogStatus};

use super::theme;

pub fn draw_logs_panel(ctx: &egui::Context, state: &mut AppState) {
    egui::TopBottomPanel::bottom("logs_panel")
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::symmetric(14.0, 10.0)),
        )
        .min_height(140.0)
        .max_height(320.0)
        .resizable(true)
        .show_animated(ctx, state.logs_panel_expanded, |ui| {
            ui.horizontal(|ui| {
                ui.heading(RichText::new("Registros & tareas").color(theme::COLOR_TEXT_PRIMARY));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui
                        .add_sized(
                            [110.0, 26.0],
                            theme::secondary_button(
                                RichText::new("Ocultar").color(theme::COLOR_TEXT_PRIMARY),
                            ),
                        )
                        .clicked()
                    {
                        state.logs_panel_expanded = false;
                    }
                });
            });
            ui.add_space(6.0);

            egui::ScrollArea::both()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let header_bg = egui::Color32::from_rgb(36, 36, 36);
                    let row_even = egui::Color32::from_rgb(38, 38, 38);
                    let row_odd = egui::Color32::from_rgb(46, 46, 46);

                    TableBuilder::new(ui)
                        .striped(false)
                        .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
                        .column(Column::exact(36.0))
                        .column(Column::exact(120.0))
                        .column(Column::remainder())
                        .column(Column::exact(120.0))
                        .header(24.0, |mut header| {
                            header.col(|ui| {
                                ui.painter().rect_filled(ui.max_rect(), 0.0, header_bg);
                                ui.label(RichText::new("Estado").color(theme::COLOR_TEXT_WEAK));
                            });
                            header.col(|ui| {
                                ui.painter().rect_filled(ui.max_rect(), 0.0, header_bg);
                                ui.label(RichText::new("Origen").color(theme::COLOR_TEXT_WEAK));
                            });
                            header.col(|ui| {
                                ui.painter().rect_filled(ui.max_rect(), 0.0, header_bg);
                                ui.label(RichText::new("Detalle").color(theme::COLOR_TEXT_WEAK));
                            });
                            header.col(|ui| {
                                ui.painter().rect_filled(ui.max_rect(), 0.0, header_bg);
                                ui.label(RichText::new("Hora").color(theme::COLOR_TEXT_WEAK));
                            });
                        })
                        .body(|mut body| {
                            for (index, entry) in state.activity_logs.iter().enumerate() {
                                let bg = if index % 2 == 0 { row_even } else { row_odd };
                                body.row(26.0, |mut row| {
                                    row.col(|ui| {
                                        ui.painter().rect_filled(ui.max_rect(), 0.0, bg);
                                        ui.label(status_badge(entry.status));
                                    });
                                    row.col(|ui| {
                                        ui.painter().rect_filled(ui.max_rect(), 0.0, bg);
                                        ui.label(
                                            RichText::new(&entry.source)
                                                .color(theme::COLOR_TEXT_PRIMARY),
                                        );
                                    });
                                    row.col(|ui| {
                                        ui.painter().rect_filled(ui.max_rect(), 0.0, bg);
                                        ui.label(
                                            RichText::new(&entry.message)
                                                .color(theme::COLOR_TEXT_PRIMARY),
                                        );
                                    });
                                    row.col(|ui| {
                                        ui.painter().rect_filled(ui.max_rect(), 0.0, bg);
                                        ui.label(
                                            RichText::new(&entry.timestamp)
                                                .color(theme::COLOR_TEXT_WEAK),
                                        );
                                    });
                                });
                            }
                        });
                });
        });
}

fn status_badge(status: LogStatus) -> RichText {
    match status {
        LogStatus::Ok => RichText::new("✔ OK").color(theme::COLOR_SUCCESS),
        LogStatus::Error => RichText::new("❌ Error").color(theme::COLOR_DANGER),
        LogStatus::Running => RichText::new("⏳ En curso").color(theme::COLOR_PRIMARY),
    }
}
