use eframe::egui;
use crate::state::AppState;

pub mod chat;
pub mod modals;
pub mod sidebar;

pub fn draw_ui(ctx: &egui::Context, state: &mut AppState) {
    sidebar::draw_sidebar(ctx, state);
    sidebar::draw_right_sidebar(ctx, state); // New call for right sidebar
    chat::draw_chat_panel(ctx, state);
    modals::draw_settings_modal(ctx, state);
}
