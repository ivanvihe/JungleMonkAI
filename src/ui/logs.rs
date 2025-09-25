use eframe::egui::{self, RichText};
use egui_extras::{Column, TableBuilder};

use crate::state::{AppState, LogStatus};

use super::theme;

const ICON_LOGS: &str = "\u{f0f6}"; // file-lines

pub fn draw_logs_panel(ui: &mut egui::Ui, state: &mut AppState) {
    let mut panel = egui::TopBottomPanel::bottom("logs_panel");
    if state.logs_panel_expanded {
        panel = panel
            .frame(expanded_frame())
            .min_height(160.0)
            .max_height(360.0)
            .resizable(true);
    } else {
        panel = panel
            .frame(collapsed_frame())
            .exact_height(38.0)
            .resizable(false);
    }

    panel.show_inside(ui, |ui| {
        if state.logs_panel_expanded {
            draw_expanded_logs(ui, state);
        } else {
            draw_collapsed_logs(ui, state);
        }
    });
}

fn draw_expanded_logs(ui: &mut egui::Ui, state: &mut AppState) {
    ui.set_width(ui.available_width());
    ui.set_min_height(ui.available_height());

    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 10.0;
        ui.label(
            RichText::new(ICON_LOGS)
                .font(theme::icon_font(16.0))
                .color(theme::COLOR_PRIMARY),
        );
        ui.heading(RichText::new("Registros & tareas").color(theme::COLOR_TEXT_PRIMARY));
        ui.add_space(ui.available_width());
        let hide_label = RichText::new("Ocultar panel").color(theme::COLOR_TEXT_PRIMARY);
        if ui
            .add_sized([130.0, 26.0], theme::secondary_button(hide_label))
            .clicked()
        {
            state.logs_panel_expanded = false;
        }
    });
    ui.add_space(6.0);

    let table_size = ui.available_size();
    ui.allocate_ui(table_size, |ui| {
        egui::ScrollArea::both()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.set_min_height(table_size.y);
                draw_logs_table(ui, state);
            });
    });
}

fn draw_collapsed_logs(ui: &mut egui::Ui, state: &mut AppState) {
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
        let show_label = RichText::new("Mostrar panel").color(theme::COLOR_TEXT_PRIMARY);
        if ui
            .add_sized([150.0, 26.0], theme::secondary_button(show_label))
            .clicked()
        {
            state.logs_panel_expanded = true;
        }
    });
}

fn draw_logs_table(ui: &mut egui::Ui, state: &AppState) {
    let header_bg = egui::Color32::from_rgb(40, 42, 48);
    let row_even = egui::Color32::from_rgb(36, 38, 44);
    let row_odd = egui::Color32::from_rgb(32, 34, 40);

    TableBuilder::new(ui)
        .striped(false)
        .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
        .column(Column::initial(64.0).resizable(true))
        .column(Column::initial(160.0).resizable(true))
        .column(Column::remainder().resizable(true))
        .column(Column::initial(140.0).resizable(true))
        .resizable(true)
        .header(28.0, |mut header| {
            header.col(|ui| {
                paint_header_cell(ui, header_bg);
                ui.label(RichText::new("Estado").color(theme::COLOR_TEXT_WEAK));
            });
            header.col(|ui| {
                paint_header_cell(ui, header_bg);
                ui.label(RichText::new("Origen").color(theme::COLOR_TEXT_WEAK));
            });
            header.col(|ui| {
                paint_header_cell(ui, header_bg);
                ui.label(RichText::new("Detalle").color(theme::COLOR_TEXT_WEAK));
            });
            header.col(|ui| {
                paint_header_cell(ui, header_bg);
                ui.label(RichText::new("Hora").color(theme::COLOR_TEXT_WEAK));
            });
        })
        .body(|mut body| {
            for (index, entry) in state.activity_logs.iter().enumerate() {
                let bg = if index % 2 == 0 { row_even } else { row_odd };
                body.row(28.0, |mut row| {
                    row.col(|ui| {
                        paint_cell(ui, bg);
                        ui.label(status_badge(entry.status));
                    });
                    row.col(|ui| {
                        paint_cell(ui, bg);
                        ui.label(
                            RichText::new(&entry.source)
                                .color(theme::COLOR_TEXT_PRIMARY)
                                .strong(),
                        );
                    });
                    row.col(|ui| {
                        paint_cell(ui, bg);
                        ui.label(RichText::new(&entry.message).color(theme::COLOR_TEXT_PRIMARY));
                    });
                    row.col(|ui| {
                        paint_cell(ui, bg);
                        ui.label(RichText::new(&entry.timestamp).color(theme::COLOR_TEXT_WEAK));
                    });
                });
            }
        });
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

fn paint_header_cell(ui: &mut egui::Ui, color: egui::Color32) {
    let rect = ui.max_rect();
    ui.painter()
        .rect_filled(rect, egui::Rounding::same(6.0), color);
}

fn paint_cell(ui: &mut egui::Ui, color: egui::Color32) {
    let rect = ui.max_rect();
    ui.painter()
        .rect_filled(rect, egui::Rounding::same(4.0), color);
}
