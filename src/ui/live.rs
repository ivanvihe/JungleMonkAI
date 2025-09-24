use crate::state::AppState;
use eframe::egui;

pub fn draw_live_panel(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default().show(ctx, |ui| {
        ui.heading("Live Multimodal");
        ui.label("Monitor real-time activity across providers and system services.");
        ui.separator();

        egui::ScrollArea::vertical()
            .stick_to_bottom(true)
            .show(ui, |ui| {
                if state.live_events.is_empty() {
                    ui.label("No live events yet. Tasks will appear here as they stream in.");
                } else {
                    for event in state.live_events.iter().rev() {
                        ui.group(|ui| {
                            ui.label(event);
                        });
                        ui.add_space(6.0);
                    }
                }
            });
    });
}
