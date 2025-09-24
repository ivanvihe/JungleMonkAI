use crate::state::{AppState, ChatMessage};
use eframe::egui;

pub fn draw_chat_panel(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default().show(ctx, |ui| {
        ui.heading("Chat Multimodal");
        ui.separator();

        // Display chat messages
        egui::ScrollArea::vertical().stick_to_bottom(true).show(ui, |ui| {
            for message in &state.chat_messages {
                ui.add_space(5.0); // Add some spacing between messages

                if message.sender == "User" {
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
                        egui::Frame::none()
                            .fill(ui.visuals().selection.bg_fill) // Example: use selection color for user messages
                            .rounding(egui::Rounding::same(5.0))
                            .inner_margin(egui::Margin::same(8.0))
                            .show(ui, |ui| {
                                ui.label(&message.text);
                            });
                    });
                } else {
                    ui.with_layout(egui::Layout::left_to_right(egui::Align::TOP), |ui| {
                        egui::Frame::none()
                            .fill(ui.visuals().widgets.noninteractive.bg_fill) // Example: use noninteractive color for system/model messages
                            .rounding(egui::Rounding::same(5.0))
                            .inner_margin(egui::Margin::same(8.0))
                            .show(ui, |ui| {
                                ui.strong(format!("{}:", message.sender));
                                ui.label(&message.text);
                            });
                    });
                }
            }
        });

        // Input area at the bottom
        ui.with_layout(egui::Layout::bottom_up(egui::Align::Center), |ui| {
            egui::Frame::none()
                .fill(ui.visuals().panel_fill) // Use panel fill for background
                .stroke(egui::Stroke::new(1.0, ui.visuals().widgets.noninteractive.bg_fill)) // Subtle border
                .rounding(egui::Rounding::same(10.0)) // Rounded corners
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.add(egui::TextEdit::singleline(&mut state.current_chat_input).hint_text("Type your message or command here...").desired_width(f32::INFINITY));

                        if ui.button("Send").clicked() {
                            if !state.current_chat_input.is_empty() {
                                let input = state.current_chat_input.clone();
                                state.current_chat_input.clear();

                                if input.starts_with('/') {
                                    // It's a command
                                    state.handle_command(input);
                                } else {
                                    // It's a regular message
                                    state.chat_messages.push(ChatMessage {
                                        sender: "User".to_string(),
                                        text: input,
                                    });
                                }
                            }
                        }
                    });
                });
        });
    });
}
