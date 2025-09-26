use crate::state::AppState;
use eframe::egui;

pub mod chat;
pub mod header;
pub mod logs;
pub mod modals;
pub mod resource_sidebar;
pub mod sidebar;
pub mod theme;

pub fn draw_ui(ctx: &egui::Context, state: &mut AppState) {
    if state.update_async_tasks() {
        ctx.request_repaint();
    }
    theme::apply(ctx);
    ctx.style_mut(|style| {
        style.interaction.resize_grab_radius_side = 6.0;
        style.interaction.resize_grab_radius_corner = 8.0;
        style.spacing.window_margin = egui::Margin::same(0.0);
    });
    header::draw_header(ctx, state);
    logs::draw_logs_panel(ctx, state);
    sidebar::draw_sidebar(ctx, state);
    resource_sidebar::draw_resource_sidebar(ctx, state);
    chat::draw_main_content(ctx, state);

    modals::draw_settings_modal(ctx, state);
    modals::draw_functions_modal(ctx, state);
}
