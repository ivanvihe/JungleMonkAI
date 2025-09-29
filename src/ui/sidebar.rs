use eframe::egui;
use vscode_shell::components::{self, NavigationModel, SidebarItem, SidebarProps, SidebarSection};

use crate::state::{AppState, NavigationNode};
use crate::ui::layout_bridge::shell_theme;

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    let mut layout = state.layout.clone();
    {
        let mut model = AppSidebar { state };
        components::draw_sidebar(ctx, &mut layout, &mut model);
    }
    state.layout = layout;
}

struct AppSidebar<'a> {
    state: &'a mut AppState,
}

impl AppSidebar<'_> {
    fn sections(&self) -> Vec<SidebarSection> {
        self.state
            .navigation_registry()
            .sidebar_sections()
            .into_iter()
            .map(|(section, nodes)| SidebarSection {
                id: section.id,
                title: section.title,
                items: nodes
                    .into_iter()
                    .map(|node| self.sidebar_item(node))
                    .collect(),
            })
            .collect()
    }

    fn sidebar_item(&self, node: NavigationNode) -> SidebarItem {
        let selected = self.state.is_navigation_target_active(node.target);
        SidebarItem {
            id: node.id,
            label: node.label,
            description: node.description,
            icon: node.icon,
            badge: node.badge,
            selected,
        }
    }
}

impl NavigationModel for AppSidebar<'_> {
    fn theme(&self) -> vscode_shell::layout::ShellTheme {
        shell_theme(&self.state.theme)
    }

    fn props(&self) -> SidebarProps {
        SidebarProps {
            title: Some("Navegación".into()),
            sections: self.sections(),
            collapse_button_tooltip: Some("Ocultar navegación".into()),
        }
    }

    fn on_item_selected(&mut self, item_id: &str) {
        let _ = self.state.activate_navigation_node(item_id);
    }
}
