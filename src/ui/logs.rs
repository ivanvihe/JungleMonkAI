use eframe::egui::{self, RichText};
use egui_extras::{Column, TableBuilder};

use crate::state::{AppState, LogStatus};

use super::theme;

const ICON_LOGS: &str = "\u{f0f6}"; // file-lines

const COLLAPSED_HEIGHT: f32 = 28.0;
const MIN_EXPANDED_HEIGHT: f32 = 100.0;
const MAX_EXPANDED_HEIGHT: f32 = 360.0;

pub fn draw_logs_panel(ctx: &egui::Context, state: &mut AppState) {
    let target_height = state
        .logs_panel_height
        .clamp(MIN_EXPANDED_HEIGHT, MAX_EXPANDED_HEIGHT);
    let animation = ctx.animate_bool(
        egui::Id::new("logs_panel_animation"),
        state.logs_panel_expanded,
    );
    let current_height = egui::lerp(COLLAPSED_HEIGHT..=target_height, animation);

    let mut panel = egui::TopBottomPanel::bottom("logs_panel")
        .show_separator_line(false)
        .default_height(current_height)
        .frame(if state.logs_panel_expanded {
            expanded_frame()
        } else {
            collapsed_frame()
        });

    if state.logs_panel_expanded {
        panel = panel
            .min_height(MIN_EXPANDED_HEIGHT)
            .max_height(MAX_EXPANDED_HEIGHT)
            .resizable(true);
    } else {
        panel = panel
            .min_height(COLLAPSED_HEIGHT)
            .max_height(COLLAPSED_HEIGHT)
            .resizable(false);
    }

    let panel_response = panel.show(ctx, |ui| {
        ui.set_clip_rect(ui.max_rect());
        if state.logs_panel_expanded {
            draw_expanded_logs(ui, state);
        } else {
            draw_collapsed_logs(ui, state);
        }
    });

    if state.logs_panel_expanded {
        let measured_height = panel_response.response.rect.height();
        if (measured_height - state.logs_panel_height).abs() > f32::EPSILON {
            state.logs_panel_height =
                measured_height.clamp(MIN_EXPANDED_HEIGHT, MAX_EXPANDED_HEIGHT);
        }
    }

    let separator_rect = egui::Rect::from_min_max(
        egui::pos2(
            panel_response.response.rect.left(),
            panel_response.response.rect.top() + 2.0,
        ),
        egui::pos2(
            panel_response.response.rect.right(),
            panel_response.response.rect.top() + 6.0,
        ),
    );
    let painter = ctx.layer_painter(egui::LayerId::new(
        egui::Order::Foreground,
        egui::Id::new("logs_separator"),
    ));
    painter.rect_filled(
        separator_rect,
        0.0,
        theme::COLOR_PRIMARY.gamma_multiply(0.25),
    );

    if (animation < 1.0 && state.logs_panel_expanded)
        || (animation > 0.0 && !state.logs_panel_expanded)
    {
        ctx.request_repaint();
    }
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
        .inner_margin(egui::Margin {
            left: 16.0,
            right: 16.0,
            top: 4.0,
            bottom: 4.0,
        })
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
