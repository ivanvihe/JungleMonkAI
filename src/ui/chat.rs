use crate::state::{AppState, ChatMessage};
use eframe::egui;

pub fn draw_chat_panel(ctx: &egui::Context, state: &mut AppState) {
    egui::CentralPanel::default().show(ctx, |ui| {
        ui.heading("Chat Multimodal");
        ui.separator();

        // Display chat messages
        egui::ScrollArea::vertical()
            .stick_to_bottom(true)
            .show(ui, |ui| {
                for message in &state.chat_messages {
                    ui.add_space(5.0); // Add some spacing between messages

                    if message.sender == "User" {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::TOP), |ui| {
                            egui::Frame::none()
                                .fill(ui.visuals().selection.bg_fill)
                                .rounding(egui::Rounding::same(5.0))
                                .inner_margin(egui::Margin::same(8.0))
                                .show(ui, |ui| {
                                    ui.label(&message.text);
                                });
                        });
                    } else {
                        ui.with_layout(egui::Layout::left_to_right(egui::Align::TOP), |ui| {
                            egui::Frame::none()
                                .fill(ui.visuals().widgets.noninteractive.bg_fill)
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
            ui.add_space(12.0);

            ui.vertical_centered(|ui| {
                let max_width = 720.0;
                let available_width = ui.available_width().min(max_width);

                ui.scope(|ui| {
                    ui.set_width(available_width);

                    egui::Frame::none()
                        .fill(ui.visuals().faint_bg_color)
                        .stroke(egui::Stroke::new(
                            1.0,
                            ui.visuals().widgets.noninteractive.bg_fill,
                        ))
                        .rounding(egui::Rounding::same(14.0))
                        .inner_margin(egui::Margin::symmetric(16.0, 10.0))
                        .show(ui, |ui| {
                            let spacing = 10.0;
                            ui.spacing_mut().item_spacing.x = spacing;

                            let send_button_width = 88.0;
                            let control_height = 34.0;
                            let text_width =
                                (ui.available_width() - send_button_width - spacing).max(200.0);

                            ui.horizontal(|ui| {
                                let text_edit =
                                    egui::TextEdit::singleline(&mut state.current_chat_input)
                                        .hint_text("Type your message or command here...")
                                        .desired_width(f32::INFINITY)
                                        .horizontal_align(egui::Align::Center);

                                ui.add_sized([text_width, control_height], text_edit);

                                let send_button = egui::Button::new("Send")
                                    .rounding(egui::Rounding::same(10.0))
                                    .min_size(egui::vec2(send_button_width, control_height));

                                if ui.add(send_button).clicked() {
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
        });
    });
}
