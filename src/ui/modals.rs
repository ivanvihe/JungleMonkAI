use crate::state::AppState;
use eframe::egui;

pub fn draw_settings_modal(ctx: &egui::Context, state: &mut AppState) {
    let mut is_open = state.show_settings_modal;

    egui::Window::new("Settings")
        .collapsible(false)
        .resizable(false)
        .open(&mut is_open)
        .show(ctx, |ui| {
            ui.heading("API Configuration");
            ui.separator();
            ui.label("Configura aquí tus claves de API y otros ajustes.");
            // TODO: Añadir campos para las claves de API (OpenAI, Claude, etc.)

            if ui.button("Close").clicked() {
                // The window will be closed by the .open() method when the user clicks the 'x' button or if `is_open` is set to false elsewhere.
                // No need to explicitly set is_open = false here.
            }
        });

    state.show_settings_modal = is_open;
}