use crate::state::{AppState, AVAILABLE_CUSTOM_ACTIONS};
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

pub fn draw_functions_modal(ctx: &egui::Context, state: &mut AppState) {
    if !state.show_functions_modal {
        return;
    }

    let mut is_open = state.show_functions_modal;
    egui::Window::new("Available Functions")
        .collapsible(false)
        .resizable(true)
        .min_size(egui::vec2(540.0, 420.0))
        .open(&mut is_open)
        .show(ctx, |ui| {
            ui.label("Consulta la documentación ampliada de cada comando y función disponible.");
            ui.separator();

            egui::ScrollArea::vertical().show(ui, |ui| {
                ui.heading("Comandos integrados");
                ui.add_space(6.0);

                for (signature, summary, examples) in builtin_documentation() {
                    ui.group(|ui| {
                        ui.strong(signature);
                        ui.label(summary);
                        if !examples.is_empty() {
                            ui.label("Ejemplos:");
                            for example in examples.iter() {
                                ui.monospace(*example);
                            }
                        }
                    });
                    ui.add_space(10.0);
                }

                ui.separator();
                ui.heading("Funciones personalizables");
                ui.add_space(6.0);

                for action in AVAILABLE_CUSTOM_ACTIONS {
                    let doc = action.documentation();
                    ui.group(|ui| {
                        ui.strong(doc.signature);
                        ui.label(doc.summary);
                        if !doc.parameters.is_empty() {
                            ui.add_space(4.0);
                            ui.label("Parámetros:");
                            for parameter in doc.parameters {
                                ui.horizontal(|ui| {
                                    ui.label("•");
                                    ui.label(*parameter);
                                });
                            }
                        }
                        if !doc.examples.is_empty() {
                            ui.add_space(4.0);
                            ui.label("Ejemplos:");
                            for example in doc.examples.iter() {
                                ui.monospace(*example);
                            }
                        }
                    });
                    ui.add_space(10.0);
                }
            });
        });

    state.show_functions_modal = is_open;
}

fn builtin_documentation() -> Vec<(&'static str, &'static str, &'static [&'static str])> {
    vec![
        (
            "/if <condición> then <cmd> [else <cmd>]",
            "Ejecuta comandos condicionalmente evaluando campos del sistema (por ejemplo memory.enabled o projects.count).",
            &["/if memory.enabled == true then /status", "/if projects.count > 2 then /models else /help"],
        ),
        (
            "/reload [--force]",
            "Sincroniza la configuración y admite la bandera --force para reiniciar credenciales.",
            &["/reload", "/reload --force"],
        ),
    ]
}
