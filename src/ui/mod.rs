use crate::state::{AppState, MainView};
use eframe::egui;

pub mod chat;
pub mod live;
pub mod modals;
pub mod sidebar;

pub fn draw_ui(ctx: &egui::Context, state: &mut AppState) {
    sidebar::draw_sidebar(ctx, state);
    sidebar::draw_right_sidebar(ctx, state); // New call for right sidebar
    match state.active_main_view {
        MainView::ChatMultimodal => chat::draw_chat_panel(ctx, state),
        MainView::LiveMultimodal => live::draw_live_panel(ctx, state),
    }
    modals::draw_settings_modal(ctx, state);
}
