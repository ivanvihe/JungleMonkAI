use crate::state::{AppState, MainView, PreferenceSection};
use eframe::egui::{self, Color32, RichText};

use super::theme;

const ICON_CHAT: &str = "\u{f086}"; // comments
const ICON_LOGS: &str = "\u{f0f6}"; // file-lines
const ICON_RESOURCES: &str = "\u{f1b3}"; // cubes
const ICON_SYSTEM: &str = "\u{f2db}"; // microchip
const ICON_PROVIDERS: &str = "\u{f6ff}"; // network-wired
const ICON_LOCAL: &str = "\u{f0a0}"; // hard-drive
const ICON_NETWORK: &str = "\u{f0ac}"; // globe
const ICON_GITHUB: &str = "\u{f126}"; // code-branch
const ICON_CACHE: &str = "\u{f1c0}"; // database
const ICON_RESOURCE_USAGE: &str = "\u{f625}"; // gauge-high
const ICON_PROVIDER_ANTHROPIC: &str = "\u{f544}"; // robot
const ICON_PROVIDER_OPENAI: &str = "\u{e2ca}"; // wand-magic-sparkles
const ICON_PROVIDER_GROQ: &str = "\u{f0e7}"; // bolt
const ICON_LOCAL_HF: &str = "\u{f49e}"; // box-open
const ICON_LOCAL_GITHUB: &str = "\u{f09b}"; // github
const ICON_LOCAL_REPLICATE: &str = "\u{f1e0}"; // share-alt
const ICON_LOCAL_OLLAMA: &str = "\u{f233}"; // server
const ICON_LOCAL_OPENROUTER: &str = "\u{f6ff}"; // route
const ICON_LOCAL_MODELSCOPE: &str = "\u{f0c3}"; // flask
const ICON_LOCAL_SETTINGS: &str = "\u{f1de}"; // sliders
const ICON_CUSTOMIZATION: &str = "\u{f1de}"; // sliders
const ICON_COMMANDS: &str = "\u{f120}"; // terminal
const ICON_MEMORY: &str = "\u{f5dc}"; // brain
const ICON_PROFILES: &str = "\u{f2c1}"; // id-badge
const ICON_PROJECTS: &str = "\u{f542}"; // diagram-project
const ICON_BRANCH_COLLAPSED: &str = "\u{f054}"; // chevron-right
const ICON_BRANCH_EXPANDED: &str = "\u{f078}"; // chevron-down
const ICON_COLLAPSE_LEFT: &str = "\u{f053}"; // chevron-left
const ICON_EXPAND_RIGHT: &str = "\u{f054}"; // chevron-right

const LEFT_PANEL_WIDTH: f32 = 280.0;
const COLLAPSED_HANDLE_WIDTH: f32 = 28.0;

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    state.left_panel_width = LEFT_PANEL_WIDTH;

    if !state.left_panel_visible {
        egui::SidePanel::left("navigation_panel_collapsed")
            .resizable(false)
            .exact_width(COLLAPSED_HANDLE_WIDTH)
            .frame(
                egui::Frame::none()
                    .fill(theme::COLOR_PANEL)
                    .stroke(theme::subtle_border())
                    .inner_margin(egui::Margin::same(8.0))
                    .rounding(egui::Rounding::same(14.0)),
            )
            .show(ctx, |ui| {
                ui.vertical_centered(|ui| {
                    ui.add_space(12.0);
                    let button = egui::Button::new(
                        RichText::new(ICON_EXPAND_RIGHT)
                            .font(theme::icon_font(16.0))
                            .color(theme::COLOR_TEXT_PRIMARY),
                    )
                    .frame(false);
                    if ui.add_sized([20.0, 24.0], button).clicked() {
                        state.left_panel_visible = true;
                    }
                });
            });
        return;
    }

    egui::SidePanel::left("navigation_panel")
        .resizable(false)
        .exact_width(state.left_panel_width)
        .frame(
            egui::Frame::none()
                .fill(theme::COLOR_PANEL)
                .stroke(theme::subtle_border())
                .inner_margin(egui::Margin {
                    left: 18.0,
                    right: 18.0,
                    top: 18.0,
                    bottom: 18.0,
                })
                .rounding(egui::Rounding::same(14.0)),
        )
        .show(ctx, |ui| {
            let available_height = ui.available_height();
            let clip_rect = ui.max_rect();
            ui.set_clip_rect(clip_rect);
            ui.set_min_height(available_height);
            ui.set_width(clip_rect.width());

            ui.horizontal(|ui| {
                let button = egui::Button::new(
                    RichText::new(ICON_COLLAPSE_LEFT)
                        .font(theme::icon_font(15.0))
                        .color(theme::COLOR_TEXT_PRIMARY),
                )
                .frame(false);
                if ui.add_sized([26.0, 24.0], button).clicked() {
                    state.left_panel_visible = false;
                }
                ui.label(
                    RichText::new("Navegación")
                        .color(theme::COLOR_TEXT_PRIMARY)
                        .strong(),
                );
            });
            ui.separator();

            egui::ScrollArea::vertical()
                .id_source("navigation_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.add_space(4.0);
                    for node in NAV_TREE {
                        draw_nav_node(ui, state, node, 0);
                        ui.add_space(6.0);
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
        label: "Chat Multimodal",
        icon: ICON_CHAT,
        view: Some(MainView::ChatMultimodal),
        section: None,
        children: &[],
    },
    NavNode {
        id: "logs",
        label: "Registros & tareas",
        icon: ICON_LOGS,
        view: Some(MainView::Logs),
        section: None,
        children: &[],
    },
    NavNode {
        id: "resources",
        label: "Recursos",
        icon: ICON_RESOURCES,
        view: None,
        section: None,
        children: RESOURCE_CHILDREN,
    },
    NavNode {
        id: "customization",
        label: "Personalización",
        icon: ICON_CUSTOMIZATION,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationCommands),
        children: CUSTOMIZATION_DETAILS,
    },
];

const RESOURCE_CHILDREN: &[NavNode] = &[
    NavNode {
        id: "system",
        label: "Sistema",
        icon: ICON_SYSTEM,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemResources),
        children: SYSTEM_DETAILS,
    },
    NavNode {
        id: "providers",
        label: "Proveedores",
        icon: ICON_PROVIDERS,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderOpenAi),
        children: PROVIDER_DETAILS,
    },
    NavNode {
        id: "local_model",
        label: "Modelo local",
        icon: ICON_LOCAL,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalSettings),
        children: LOCAL_DETAILS,
    },
    NavNode {
        id: "network",
        label: "Red",
        icon: ICON_NETWORK,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemGithub),
        children: NETWORK_DETAILS,
    },
];

const SYSTEM_DETAILS: &[NavNode] = &[
    NavNode {
        id: "system_github",
        label: "GitHub",
        icon: ICON_GITHUB,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemGithub),
        children: &[],
    },
    NavNode {
        id: "system_cache",
        label: "Caché",
        icon: ICON_CACHE,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemCache),
        children: &[],
    },
    NavNode {
        id: "system_resources",
        label: "Recursos",
        icon: ICON_RESOURCE_USAGE,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::SystemResources),
        children: &[],
    },
];

const PROVIDER_DETAILS: &[NavNode] = &[
    NavNode {
        id: "provider_anthropic",
        label: "Anthropic",
        icon: ICON_PROVIDER_ANTHROPIC,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderAnthropic),
        children: &[],
    },
    NavNode {
        id: "provider_openai",
        label: "OpenAI",
        icon: ICON_PROVIDER_OPENAI,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderOpenAi),
        children: &[],
    },
    NavNode {
        id: "provider_groq",
        label: "Groq",
        icon: ICON_PROVIDER_GROQ,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsProviderGroq),
        children: &[],
    },
];

const LOCAL_DETAILS: &[NavNode] = &[
    NavNode {
        id: "local_hf",
        label: "HuggingFace",
        icon: ICON_LOCAL_HF,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalHuggingFace),
        children: &[],
    },
    NavNode {
        id: "local_github_models",
        label: "GitHub Models",
        icon: ICON_LOCAL_GITHUB,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalGithub),
        children: &[],
    },
    NavNode {
        id: "local_replicate",
        label: "Replicate",
        icon: ICON_LOCAL_REPLICATE,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalReplicate),
        children: &[],
    },
    NavNode {
        id: "local_ollama",
        label: "Ollama",
        icon: ICON_LOCAL_OLLAMA,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalOllama),
        children: &[],
    },
    NavNode {
        id: "local_openrouter",
        label: "OpenRouter",
        icon: ICON_LOCAL_OPENROUTER,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalOpenRouter),
        children: &[],
    },
    NavNode {
        id: "local_modelscope",
        label: "ModelScope",
        icon: ICON_LOCAL_MODELSCOPE,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalModelscope),
        children: &[],
    },
    NavNode {
        id: "local_settings",
        label: "Configuración",
        icon: ICON_LOCAL_SETTINGS,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::ModelsLocalSettings),
        children: &[],
    },
];

const NETWORK_DETAILS: &[NavNode] = &[NavNode {
    id: "network_providers",
    label: "Red de proveedores",
    icon: ICON_NETWORK,
    view: Some(MainView::Preferences),
    section: Some(PreferenceSection::ModelsProviderOpenAi),
    children: &[],
}];

const CUSTOMIZATION_DETAILS: &[NavNode] = &[
    NavNode {
        id: "custom_commands",
        label: "Comandos",
        icon: ICON_COMMANDS,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationCommands),
        children: &[],
    },
    NavNode {
        id: "custom_memory",
        label: "Memoria",
        icon: ICON_MEMORY,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationMemory),
        children: &[],
    },
    NavNode {
        id: "custom_profiles",
        label: "Perfiles",
        icon: ICON_PROFILES,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationProfiles),
        children: &[],
    },
    NavNode {
        id: "custom_projects",
        label: "Proyectos",
        icon: ICON_PROJECTS,
        view: Some(MainView::Preferences),
        section: Some(PreferenceSection::CustomizationProjects),
        children: &[],
    },
];

fn draw_nav_node(ui: &mut egui::Ui, state: &mut AppState, node: &NavNode, depth: usize) {
    let indent = (depth as f32) * 18.0;
    let available_width = ui.available_width();
    let (rect, response) =
        ui.allocate_at_least(egui::vec2(available_width, 28.0), egui::Sense::click());

    let is_expanded = state.expanded_nav_nodes.contains(node.id);
    let is_selected = node_is_selected(state, node);
    let branch_active = node_is_active(state, node);

    let highlight = if is_selected {
        Some(egui::Color32::from_rgb(54, 68, 88))
    } else if response.hovered() || branch_active {
        Some(egui::Color32::from_rgb(40, 46, 58))
    } else {
        None
    };

    if let Some(color) = highlight {
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect.shrink(1.0), 4.0, color);
    }

    let content_rect = egui::Rect::from_min_max(
        egui::pos2(rect.min.x + 12.0 + indent, rect.min.y),
        egui::pos2(rect.max.x - 12.0, rect.max.y),
    )
    .intersect(rect);

    let mut content_ui = ui.child_ui(
        content_rect,
        egui::Layout::left_to_right(egui::Align::Center),
    );
    content_ui.set_clip_rect(content_rect);

    if !node.children.is_empty() {
        let arrow = if is_expanded {
            ICON_BRANCH_EXPANDED
        } else {
            ICON_BRANCH_COLLAPSED
        };
        content_ui.label(
            RichText::new(arrow)
                .font(theme::icon_font(12.0))
                .color(theme::COLOR_TEXT_WEAK),
        );
    } else {
        content_ui.add_space(14.0);
    }

    let icon_color = if branch_active || is_selected {
        theme::COLOR_PRIMARY
    } else {
        theme::COLOR_TEXT_WEAK
    };

    content_ui.add_space(6.0);
    content_ui.label(
        RichText::new(node.icon)
            .font(theme::icon_font(15.0))
            .color(icon_color),
    );
    content_ui.add_space(8.0);
    let text_color = if is_selected {
        theme::COLOR_TEXT_PRIMARY
    } else if branch_active {
        Color32::from_rgb(210, 210, 210)
    } else {
        theme::COLOR_TEXT_WEAK
    };
    content_ui.label(RichText::new(node.label).color(text_color));

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
