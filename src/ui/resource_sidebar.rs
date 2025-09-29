use eframe::egui;
use vscode_shell::components::{
    self, ResourceItem, ResourcePanelModel, ResourcePanelProps, ResourceSectionProps,
};

use crate::state::{
    AppState, ChatMessage, MainView, RemoteProviderKind, ResourceSection, AVAILABLE_CUSTOM_ACTIONS,
};
use crate::ui::layout_bridge::shell_theme;

pub fn draw_resource_sidebar(ctx: &egui::Context, state: &mut AppState) {
    let mut layout = state.layout.clone();
    {
        let mut model = AppResourcePanel { state };
        components::draw_resource_panel(ctx, &mut layout, &mut model);
    }
    state.layout = layout;

    if state.pending_copy_conversation {
        copy_conversation_to_clipboard(ctx, &state.chat_messages);
        state.pending_copy_conversation = false;
    }
}

struct AppResourcePanel<'a> {
    state: &'a mut AppState,
}

impl AppResourcePanel<'_> {
    fn status_sections(&self) -> Vec<ResourceSectionProps> {
        let jarvis_status = self
            .state
            .jarvis_status
            .clone()
            .unwrap_or_else(|| "Jarvis listo para iniciar".to_string());
        let active_model = self
            .state
            .jarvis_active_model
            .as_ref()
            .map(|model| model.display_label())
            .unwrap_or_else(|| "Sin modelo seleccionado".to_string());

        vec![ResourceSectionProps {
            id: "status".into(),
            title: "Jarvis runtime".into(),
            description: Some("Resumen del entorno local".into()),
            items: vec![
                ResourceItem {
                    id: "status:jarvis".into(),
                    title: jarvis_status,
                    subtitle: Some(format!(
                        "Inicio automático: {}",
                        if self.state.jarvis_auto_start {
                            "activado"
                        } else {
                            "manual"
                        }
                    )),
                    selected: false,
                },
                ResourceItem {
                    id: "status:model".into(),
                    title: format!("Modelo configurado: {}", active_model),
                    subtitle: Some(format!("Alias: {}", self.state.jarvis_alias)),
                    selected: false,
                },
            ],
        }]
    }

    fn quick_actions(&self) -> ResourceSectionProps {
        let mut items = vec![
            ResourceItem {
                id: "action:open_settings".into(),
                title: "Abrir preferencias".into(),
                subtitle: Some("Configura proveedores y automatizaciones".into()),
                selected: false,
            },
            ResourceItem {
                id: "action:open_functions".into(),
                title: "Explorar funciones".into(),
                subtitle: Some(format!(
                    "{} funciones personalizables",
                    AVAILABLE_CUSTOM_ACTIONS.len()
                )),
                selected: false,
            },
        ];

        if !self.state.chat_messages.is_empty() {
            items.push(ResourceItem {
                id: "action:copy_conversation".into(),
                title: "Copiar conversación".into(),
                subtitle: Some("Guarda el historial actual en el portapapeles".into()),
                selected: false,
            });
        }

        ResourceSectionProps {
            id: "quick-actions".into(),
            title: "Acciones rápidas".into(),
            description: Some("Atajos frecuentes durante la sesión".into()),
            items,
        }
    }

    fn resource_navigation(&self) -> ResourceSectionProps {
        let mut items = Vec::new();
        for provider in [
            RemoteProviderKind::Anthropic,
            RemoteProviderKind::OpenAi,
            RemoteProviderKind::Groq,
        ] {
            let section = ResourceSection::RemoteCatalog(provider);
            let metadata = section.metadata();
            items.push(ResourceItem {
                id: super::sidebar::resource_id(&section),
                title: metadata
                    .breadcrumb
                    .last()
                    .copied()
                    .unwrap_or(metadata.title)
                    .to_string(),
                subtitle: Some(metadata.description.to_string()),
                selected: self
                    .state
                    .selected_resource
                    .map(|current| current == section)
                    .unwrap_or(false)
                    && self.state.active_main_view == MainView::ResourceBrowser,
            });
        }
        ResourceSectionProps {
            id: "resource-nav".into(),
            title: "Catálogos destacados".into(),
            description: Some("Explora proveedores conectados".into()),
            items,
        }
    }
}

fn copy_conversation_to_clipboard(ctx: &egui::Context, messages: &[ChatMessage]) {
    if messages.is_empty() {
        return;
    }

    let mut transcript = String::new();
    for (index, message) in messages.iter().enumerate() {
        if index > 0 {
            transcript.push_str("\n\n");
        }
        let status = if message.is_pending() {
            " (pendiente)"
        } else {
            ""
        };
        transcript.push_str(&format!(
            "[{}] {}{}:\n{}",
            message.timestamp, message.sender, status, message.text
        ));
    }

    ctx.output_mut(|out| out.copied_text = transcript);
}

impl ResourcePanelModel for AppResourcePanel<'_> {
    fn theme(&self) -> vscode_shell::layout::ShellTheme {
        shell_theme(&self.state.theme)
    }

    fn props(&self) -> ResourcePanelProps {
        let mut sections = self.status_sections();
        sections.push(self.quick_actions());
        sections.push(self.resource_navigation());

        ResourcePanelProps {
            title: Some("Recursos".into()),
            sections,
            collapse_button_tooltip: Some("Ocultar panel de recursos".into()),
        }
    }

    fn on_item_selected(&mut self, item_id: &str) {
        match item_id {
            "action:open_settings" => self.state.show_settings_modal = true,
            "action:open_functions" => self.state.show_functions_modal = true,
            "action:copy_conversation" => self.state.pending_copy_conversation = true,
            _ => {
                if let Some(section) = super::sidebar::parse_resource_id(item_id) {
                    self.state.selected_resource = Some(section);
                    self.state.active_main_view = MainView::ResourceBrowser;
                    self.state.sync_active_tab_from_view();
                }
            }
        }
    }
}
