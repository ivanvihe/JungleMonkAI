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
    theme::apply(ctx);
    header::draw_header(ctx, state);
    sidebar::draw_sidebar(ctx, state);
    resource_sidebar::draw_resource_sidebar(ctx, state);
    logs::draw_logs_panel(ctx, state);
    chat::draw_main_content(ctx, state);

    modals::draw_settings_modal(ctx, state);
    modals::draw_functions_modal(ctx, state);
}
