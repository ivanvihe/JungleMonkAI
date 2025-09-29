use eframe::egui::{self, Color32, Margin, Stroke};

/// Conjunto mínimo de tokens de estilo utilizados por los componentes del shell.
#[derive(Clone, Debug)]
pub struct ShellTheme {
    pub root_background: Color32,
    pub surface_background: Color32,
    pub header_background: Color32,
    pub border: Color32,
    pub text_primary: Color32,
    pub text_muted: Color32,
    pub accent: Color32,
    pub accent_soft: Color32,
}

impl Default for ShellTheme {
    fn default() -> Self {
        Self {
            root_background: Color32::from_rgb(24, 26, 30),
            surface_background: Color32::from_rgb(32, 34, 38),
            header_background: Color32::from_rgb(40, 42, 48),
            border: Color32::from_rgba_unmultiplied(70, 72, 78, 160),
            text_primary: Color32::from_rgb(232, 233, 239),
            text_muted: Color32::from_rgb(172, 176, 184),
            accent: Color32::from_rgb(65, 148, 245),
            accent_soft: Color32::from_rgb(48, 86, 128),
        }
    }
}

/// Controla la visibilidad y el ancho de los paneles principales del layout.
#[derive(Clone, Debug)]
pub struct LayoutConfig {
    pub show_header: bool,
    pub show_navigation: bool,
    pub show_resource_panel: bool,
    pub navigation_width: f32,
    pub resource_width: f32,
    navigation_collapsed: bool,
    resource_collapsed: bool,
    navigation_signal: Option<bool>,
    resource_signal: Option<bool>,
}

impl Default for LayoutConfig {
    fn default() -> Self {
        Self {
            show_header: true,
            show_navigation: true,
            show_resource_panel: true,
            navigation_width: 280.0,
            resource_width: 320.0,
            navigation_collapsed: false,
            resource_collapsed: false,
            navigation_signal: None,
            resource_signal: None,
        }
    }
}

impl LayoutConfig {
    pub fn navigation_collapsed(&self) -> bool {
        self.navigation_collapsed
    }

    pub fn resource_collapsed(&self) -> bool {
        self.resource_collapsed
    }

    pub fn set_navigation_collapsed(&mut self, collapsed: bool) {
        self.navigation_collapsed = collapsed;
    }

    pub fn set_resource_collapsed(&mut self, collapsed: bool) {
        self.resource_collapsed = collapsed;
    }

    pub fn emit_navigation_signal(&mut self, collapsed: bool) {
        self.navigation_collapsed = collapsed;
        self.navigation_signal = Some(collapsed);
    }

    pub fn emit_resource_signal(&mut self, collapsed: bool) {
        self.resource_collapsed = collapsed;
        self.resource_signal = Some(collapsed);
    }

    pub fn take_navigation_signal(&mut self) -> Option<bool> {
        self.navigation_signal.take()
    }

    pub fn take_resource_signal(&mut self) -> Option<bool> {
        self.resource_signal.take()
    }
}

/// Envoltorio utilitario que pinta un panel principal centralizado.
pub(crate) fn main_surface_frame(theme: &ShellTheme) -> egui::Frame {
    egui::Frame::none()
        .fill(theme.surface_background)
        .stroke(Stroke::new(1.0, theme.border))
        .inner_margin(Margin {
            left: 18.0,
            right: 18.0,
            top: 18.0,
            bottom: 14.0,
        })
}
