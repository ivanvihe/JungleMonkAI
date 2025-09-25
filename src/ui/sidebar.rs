use crate::state::{AppState, MainView, PreferenceSection};
use eframe::egui::{self, Color32, RichText};

use super::theme;

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    egui::SidePanel::left("navigation_panel")
        .resizable(true)
        .default_width(280.0)
        .width_range(220.0..=420.0)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin::same(16.0)),
        )
        .show(ctx, |ui| {
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for node in NAV_TREE {
                        draw_nav_node(ui, state, node, 0);
                        ui.add_space(4.0);
                    }
                });
        });
}

#[derive(Clone, Copy)]
struct NavNode {
    id: &'static str,
    label: &'static str,
    icon: &'static str,
    view: Option<MainView>,
    section: Option<PreferenceSection>,
    children: &'static [NavNode],
}

const NAV_TREE: &[NavNode] = &[
    NavNode {
        id: "chat",
        label: "Panel multimodal",
        icon: "💬",
        view: Some(MainView::ChatMultimodal),
        section: None,
        children: &[],
    },
    NavNode {
        id: "resources",
        label: "Recursos",
        icon: "📦",
        view: None,
        section: None,
        children: RESOURCE_CHILDREN,
    },
    NavNode {
        id: "customization",
        label: "Personalización",
        icon: "🛠️",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationCommands),
        children: CUSTOMIZATION_DETAILS,
    },
];

const RESOURCE_CHILDREN: &[NavNode] = &[
    NavNode {
        id: "system",
        label: "Sistema",
        icon: "🖥️",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemResources),
        children: SYSTEM_DETAILS,
    },
    NavNode {
        id: "providers",
        label: "Proveedores",
        icon: "🖲️",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderOpenAi),
        children: PROVIDER_DETAILS,
    },
    NavNode {
        id: "local_model",
        label: "Modelo local",
        icon: "💽",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalSettings),
        children: LOCAL_DETAILS,
    },
    NavNode {
        id: "network",
        label: "Red",
        icon: "🌐",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemGithub),
        children: NETWORK_DETAILS,
    },
];

const SYSTEM_DETAILS: &[NavNode] = &[
    NavNode {
        id: "system_github",
        label: "GitHub",
        icon: "☁",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemGithub),
        children: &[],
    },
    NavNode {
        id: "system_cache",
        label: "Caché",
        icon: "🧹",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemCache),
        children: &[],
    },
    NavNode {
        id: "system_resources",
        label: "Recursos",
        icon: "📊",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemResources),
        children: &[],
    },
];

const PROVIDER_DETAILS: &[NavNode] = &[
    NavNode {
        id: "provider_anthropic",
        label: "Anthropic",
        icon: "🤖",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderAnthropic),
        children: &[],
    },
    NavNode {
        id: "provider_openai",
        label: "OpenAI",
        icon: "✨",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderOpenAi),
        children: &[],
    },
    NavNode {
        id: "provider_groq",
        label: "Groq",
        icon: "⚡",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderGroq),
        children: &[],
    },
];

const LOCAL_DETAILS: &[NavNode] = &[
    NavNode {
        id: "local_hf",
        label: "HuggingFace",
        icon: "📦",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalHuggingFace),
        children: &[],
    },
    NavNode {
        id: "local_settings",
        label: "Configuración",
        icon: "⚙",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalSettings),
        children: &[],
    },
];

const NETWORK_DETAILS: &[NavNode] = &[NavNode {
    id: "network_providers",
    label: "Red de proveedores",
    icon: "🌐",
    view: Some(MainView::Preferences),
    section: Some(PreferenceSection::ModelsProviderOpenAi),
    children: &[],
}];

const CUSTOMIZATION_DETAILS: &[NavNode] = &[
    NavNode {
        id: "custom_commands",
        label: "Comandos",
        icon: "🧰",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationCommands),
        children: &[],
    },
    NavNode {
        id: "custom_memory",
        label: "Memoria",
        icon: "🧠",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationMemory),
        children: &[],
    },
    NavNode {
        id: "custom_profiles",
        label: "Perfiles",
        icon: "👤",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationProfiles),
        children: &[],
    },
    NavNode {
        id: "custom_projects",
        label: "Proyectos",
        icon: "📁",
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationProjects),
        children: &[],
    },
];

fn draw_nav_node(ui: &mut egui::Ui, state: &mut AppState, node: &NavNode, depth: usize) {
    let indent = (depth as f32) * 18.0;
    let available_width = ui.available_width();
    let (rect, response) =
        ui.allocate_at_least(egui::vec2(available_width, 30.0), egui::Sense::click());

    let is_expanded = state.expanded_nav_nodes.contains(node.id);
    let is_selected = node_is_selected(state, node);
    let branch_active = node_is_active(state, node);

    let base_fill = if depth == 0 {
        egui::Color32::from_rgb(28, 28, 28)
    } else {
        egui::Color32::from_rgb(24, 24, 24)
    };

    let fill = if is_selected {
        egui::Color32::from_rgb(52, 62, 78)
    } else if branch_active {
        egui::Color32::from_rgb(34, 40, 52)
    } else {
        base_fill
    };

    let border = if is_selected {
        egui::Stroke::new(1.0, Color32::from_rgb(70, 110, 150))
    } else {
        theme::subtle_border()
    };

    let painter = ui.painter();
    painter.rect(rect.shrink2(egui::vec2(0.5, 1.0)), 0.0, fill, border);

    let mut content_ui = ui.child_ui(
        egui::Rect::from_min_max(
            egui::pos2(rect.min.x + 12.0 + indent, rect.min.y),
            egui::pos2(rect.max.x - 12.0, rect.max.y),
        ),
        egui::Layout::left_to_right(egui::Align::Center),
    );

    if !node.children.is_empty() {
        let arrow = if is_expanded { "▾" } else { "▸" };
        content_ui.label(RichText::new(arrow).color(theme::COLOR_TEXT_WEAK));
    } else {
        content_ui.add_space(16.0);
    }

    let icon_color = if branch_active {
        theme::COLOR_SUCCESS
    } else {
        theme::COLOR_TEXT_WEAK
    };

    content_ui.label(RichText::new(node.icon).color(icon_color));
    content_ui.add_space(6.0);
    content_ui.label(RichText::new(node.label).color(theme::COLOR_TEXT_PRIMARY));

    if response.clicked() {
        if !node.children.is_empty() {
            toggle_branch(state, node.id, is_expanded);
        }

        if let Some(view) = node.view {
            state.active_main_view = view;
        }
        if let Some(section) = node.section {
            state.selected_section = section;
            if state.active_main_view != MainView::Preferences {
                state.active_main_view = MainView::Preferences;
            }
        }
    }

    if !node.children.is_empty() && (is_expanded || depth == 0) {
        for child in node.children {
            draw_nav_node(ui, state, child, depth + 1);
        }
    }
}

fn toggle_branch(state: &mut AppState, id: &'static str, expanded: bool) {
    if expanded {
        state.expanded_nav_nodes.remove(id);
    } else {
        state.expanded_nav_nodes.insert(id);
    }
}

fn node_is_selected(state: &AppState, node: &NavNode) -> bool {
    if let Some(view) = node.view {
        if state.active_main_view == view && node.section.is_none() {
            return true;
        }
    }
    if let Some(section) = node.section {
        if state.selected_section == section && state.active_main_view == MainView::Preferences {
            return true;
        }
    }
    false
}

fn node_is_active(state: &AppState, node: &NavNode) -> bool {
    if node_is_selected(state, node) {
        return true;
    }

    node.children
        .iter()
        .any(|child| node_is_active(state, child))
}
