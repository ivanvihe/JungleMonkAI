use crate::state::AppState;
use eframe::egui;
use vscode_shell::components::{MainContentAction, MainContentTab};

/// Metadatos básicos que describen una vista registrada en el workbench.
pub struct WorkbenchMetadata {
    pub title: Option<String>,
    pub subtitle: Option<String>,
}

impl WorkbenchMetadata {
    pub fn new(title: impl Into<Option<String>>, subtitle: impl Into<Option<String>>) -> Self {
        Self {
            title: title.into(),
            subtitle: subtitle.into(),
        }
    }
}

/// Describe el contrato mínimo que debe cumplir una vista para integrarse en el workbench.
pub trait WorkbenchView {
    /// Devuelve el título y subtítulo que se mostrarán en el encabezado del contenedor.
    fn metadata(&self, state: &AppState) -> WorkbenchMetadata;

    /// Lista de acciones disponibles para la vista actual.
    fn actions(&self, state: &AppState) -> Vec<MainContentAction> {
        default_layout_actions(state)
    }

    /// Define las pestañas visibles en el encabezado.
    fn tabs(&self, _state: &AppState) -> Vec<MainContentTab> {
        Vec::new()
    }

    /// Identificador de la pestaña activa, si aplica.
    fn active_tab(&self, _state: &AppState) -> Option<String> {
        None
    }

    /// Maneja la selección de una pestaña. Retorna `true` si fue atendida.
    fn on_tab_selected(&self, _state: &mut AppState, _tab_id: &str) -> bool {
        false
    }

    /// Maneja una acción del encabezado. Retorna `true` si fue atendida.
    fn on_action(&self, _state: &mut AppState, _action_id: &str) -> bool {
        false
    }

    /// Renderiza el contenido principal de la vista.
    fn render(&self, ui: &mut egui::Ui, state: &mut AppState);
}

/// Genera las acciones de visibilidad de paneles comunes a todas las vistas.
pub fn default_layout_actions(state: &AppState) -> Vec<MainContentAction> {
    vec![
        MainContentAction {
            id: "toggle-navigation".into(),
            label: if state.layout.navigation_collapsed() {
                "Mostrar navegación".into()
            } else {
                "Ocultar navegación".into()
            },
            icon: Some("📂".into()),
            enabled: true,
        },
        MainContentAction {
            id: "toggle-resources".into(),
            label: if state.layout.resource_collapsed() {
                "Mostrar recursos".into()
            } else {
                "Ocultar recursos".into()
            },
            icon: Some("📚".into()),
            enabled: true,
        },
    ]
}
