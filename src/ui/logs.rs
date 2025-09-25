use eframe::egui::{self, RichText};
use egui_extras::{Column, TableBuilder};

use crate::state::{AppState, LogStatus};

use super::theme;

const ICON_LOGS: &str = "\u{f0f6}"; // file-lines

pub fn draw_logs_panel(ctx: &egui::Context, state: &mut AppState) {
    if state.logs_panel_expanded {
        egui::TopBottomPanel::bottom("logs_panel")
            .frame(expanded_frame())
            .min_height(160.0)
            .max_height(360.0)
            .resizable(true)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 10.0;
                    ui.label(
                        RichText::new(ICON_LOGS)
                            .font(theme::icon_font(16.0))
                            .color(theme::COLOR_PRIMARY),
                    );
                    ui.heading(
                        RichText::new("Registros & tareas").color(theme::COLOR_TEXT_PRIMARY),
                    );
                    ui.add_space(ui.available_width());
                    let hide_label =
                        RichText::new("Ocultar panel").color(theme::COLOR_TEXT_PRIMARY);
                    if ui
                        .add_sized([130.0, 26.0], theme::secondary_button(hide_label))
                        .clicked()
                    {
                        state.logs_panel_expanded = false;
                    }
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
                                    ui.label(
                                        RichText::new("Detalle").color(theme::COLOR_TEXT_WEAK),
                                    );
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
    } else {
        egui::TopBottomPanel::bottom("logs_panel")
            .frame(collapsed_frame())
            .exact_height(38.0)
            .resizable(false)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 10.0;
                    ui.label(
                        RichText::new(ICON_LOGS)
                            .font(theme::icon_font(16.0))
                            .color(theme::COLOR_PRIMARY),
                    );
                    ui.label(
                        RichText::new("Registros & tareas")
                            .color(theme::COLOR_TEXT_PRIMARY)
                            .strong(),
                    );
                    ui.add_space(ui.available_width());
                    let show_label =
                        RichText::new("Mostrar panel").color(theme::COLOR_TEXT_PRIMARY);
                    if ui
                        .add_sized([150.0, 26.0], theme::secondary_button(show_label))
                        .clicked()
                    {
                        state.logs_panel_expanded = true;
                    }
                });
            });
    }
}

fn expanded_frame() -> egui::Frame {
    egui::Frame::none()
        .fill(theme::COLOR_PANEL)
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(14.0, 10.0))
}

fn collapsed_frame() -> egui::Frame {
    egui::Frame::none()
        .fill(theme::COLOR_PANEL)
        .stroke(theme::subtle_border())
        .inner_margin(egui::Margin::symmetric(10.0, 6.0))
}

fn status_badge(status: LogStatus) -> RichText {
    match status {
        LogStatus::Ok => RichText::new("✔ OK").color(theme::COLOR_SUCCESS),
        LogStatus::Error => RichText::new("❌ Error").color(theme::COLOR_DANGER),
        LogStatus::Running => RichText::new("⏳ En curso").color(theme::COLOR_PRIMARY),
    }
}
