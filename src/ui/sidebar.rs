use crate::local_providers::LocalModelProvider;
use crate::state::{
    AppState, MainTab, MainView, PreferencePanel, RemoteProviderKind, ResourceSection,
};
use eframe::egui;

use super::theme;

const LEFT_PANEL_WIDTH: f32 = 280.0;
const ICON_PREFS: &str = "\u{f013}"; // cog
const ICON_FOLDER: &str = "\u{f07c}"; // folder-open
const ICON_ARROW: &str = "\u{f105}"; // angle-right
const ICON_LIGHTBULB: &str = "\u{f0eb}"; // lightbulb
const ICON_CHAT: &str = "\u{f086}"; // comments

pub fn draw_sidebar(ctx: &egui::Context, state: &mut AppState) {
    state.left_panel_width = LEFT_PANEL_WIDTH;

    egui::SidePanel::left("navigation_panel")
        .resizable(false)
        .exact_width(LEFT_PANEL_WIDTH)
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
            ui.set_width(ui.available_width());

            ui.vertical(|ui| {
                draw_primary_navigation(ui, state);

                ui.add_space(12.0);
                ui.separator();
                ui.add_space(12.0);

                egui::ScrollArea::vertical()
                    .id_source("sidebar_navigation_tree")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        draw_preferences_tree(ui, state);
                        ui.add_space(16.0);
                        draw_resources_tree(ui, state);
                    });
            });
        });
}

fn draw_primary_navigation(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label(
        egui::RichText::new("Principal")
            .color(theme::COLOR_TEXT_WEAK)
            .size(12.0),
    );
    ui.add_space(6.0);

    let is_active = matches!(
        state.active_main_view,
        MainView::ChatMultimodal
            | MainView::CronScheduler
            | MainView::ActivityFeed
            | MainView::DebugConsole
    );

    let response = nav_entry(ui, 0.0, ICON_CHAT, "Chat multimodal", is_active)
        .on_hover_text("Conversación, cron y registros del agente");

    if response.clicked() {
        state.set_active_tab(MainTab::Chat);
    }
}

fn draw_preferences_tree(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label(
        egui::RichText::new(format!("{} Preferencias", ICON_PREFS))
            .color(theme::COLOR_TEXT_PRIMARY)
            .strong()
            .size(13.0),
    );
    ui.add_space(4.0);

    draw_preference_group(
        ui,
        state,
        "Sistema",
        &[
            PreferencePanel::SystemGithub,
            PreferencePanel::SystemCache,
            PreferencePanel::SystemResources,
        ],
    );
    draw_preference_group(
        ui,
        state,
        "Personalización",
        &[
            PreferencePanel::CustomizationCommands,
            PreferencePanel::CustomizationMemory,
            PreferencePanel::CustomizationProfiles,
            PreferencePanel::CustomizationProjects,
        ],
    );
    draw_preference_group(
        ui,
        state,
        "Proveedores",
        &[
            PreferencePanel::ProvidersAnthropic,
            PreferencePanel::ProvidersOpenAi,
            PreferencePanel::ProvidersGroq,
        ],
    );
    draw_preference_group(
        ui,
        state,
        "Modelos locales",
        &[PreferencePanel::LocalJarvis],
    );
}

fn draw_preference_group(
    ui: &mut egui::Ui,
    state: &mut AppState,
    title: &str,
    panels: &[PreferencePanel],
) {
    egui::CollapsingHeader::new(title)
        .default_open(true)
        .show(ui, |ui| {
            for panel in panels {
                let metadata = panel.metadata();
                let label = metadata
                    .breadcrumb
                    .last()
                    .copied()
                    .unwrap_or(metadata.title);
                let response = nav_entry(
                    ui,
                    12.0,
                    ICON_ARROW,
                    label,
                    state.active_main_view == MainView::Preferences
                        && state.selected_preference == *panel,
                );
                if response.clicked() {
                    state.selected_preference = *panel;
                    state.selected_resource = None;
                    state.active_main_view = MainView::Preferences;
                    state.sync_active_tab_from_view();
                }
            }
        });
}

fn draw_resources_tree(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label(
        egui::RichText::new(format!("{} Recursos", ICON_FOLDER))
            .color(theme::COLOR_TEXT_PRIMARY)
            .strong()
            .size(13.0),
    );
    ui.add_space(4.0);

    egui::CollapsingHeader::new("Catálogos remotos")
        .default_open(true)
        .show(ui, |ui| {
            for provider in [
                RemoteProviderKind::Anthropic,
                RemoteProviderKind::OpenAi,
                RemoteProviderKind::Groq,
            ] {
                let label = provider.display_name();
                let response = nav_entry(
                    ui,
                    12.0,
                    ICON_ARROW,
                    label,
                    matches!(
                        state.selected_resource,
                        Some(ResourceSection::RemoteCatalog(active)) if active == provider
                    ) && state.active_main_view == MainView::ResourceBrowser,
                );
                if response.clicked() {
                    state.selected_resource = Some(ResourceSection::RemoteCatalog(provider));
                    state.active_main_view = MainView::ResourceBrowser;
                    state.sync_active_tab_from_view();
                }
            }
        });

    egui::CollapsingHeader::new("Galerías locales")
        .default_open(false)
        .show(ui, |ui| {
            for provider in [
                LocalModelProvider::HuggingFace,
                LocalModelProvider::GithubModels,
                LocalModelProvider::Replicate,
                LocalModelProvider::Ollama,
                LocalModelProvider::OpenRouter,
                LocalModelProvider::Modelscope,
            ] {
                let label = provider.display_name();
                let response = nav_entry(
                    ui,
                    12.0,
                    ICON_FOLDER,
                    label,
                    matches!(
                        state.selected_resource,
                        Some(ResourceSection::LocalCatalog(active)) if active == provider
                    ) && state.active_main_view == MainView::ResourceBrowser,
                );
                if response.clicked() {
                    state.selected_resource = Some(ResourceSection::LocalCatalog(provider));
                    state.active_main_view = MainView::ResourceBrowser;
                    state.sync_active_tab_from_view();
                }
            }
        });

    egui::CollapsingHeader::new("Productividad y proyectos")
        .default_open(true)
        .show(ui, |ui| {
            let entries = [
                (
                    ICON_FOLDER,
                    "Proyectos locales",
                    ResourceSection::ConnectedProjects,
                ),
                (
                    ICON_ARROW,
                    "Repositorios GitHub",
                    ResourceSection::GithubRepositories,
                ),
            ];
            for (icon, label, section) in entries {
                let response = nav_entry(
                    ui,
                    12.0,
                    icon,
                    label,
                    state.selected_resource == Some(section)
                        && state.active_main_view == MainView::ResourceBrowser,
                );
                if response.clicked() {
                    state.selected_resource = Some(section);
                    state.active_main_view = MainView::ResourceBrowser;
                    state.sync_active_tab_from_view();
                }
            }
        });

    let response = nav_entry(
        ui,
        0.0,
        ICON_LIGHTBULB,
        "Modelos instalados",
        matches!(
            state.selected_resource,
            Some(ResourceSection::InstalledLocal)
        ) && state.active_main_view == MainView::ResourceBrowser,
    );
    if response.clicked() {
        state.selected_resource = Some(ResourceSection::InstalledLocal);
        state.active_main_view = MainView::ResourceBrowser;
        state.sync_active_tab_from_view();
    }
}

fn nav_entry(
    ui: &mut egui::Ui,
    indent: f32,
    icon: &str,
    label: &str,
    selected: bool,
) -> egui::Response {
    let desired = egui::vec2(ui.available_width(), 30.0);
    let (rect, response) = ui.allocate_exact_size(desired, egui::Sense::click());

    let highlight = if selected {
        theme::COLOR_PRIMARY.gamma_multiply(0.15)
    } else {
        egui::Color32::from_rgba_unmultiplied(0, 0, 0, 0)
    };
    ui.painter().rect_filled(rect, 6.0, highlight);

    let mut contents = ui.child_ui(rect, egui::Layout::left_to_right(egui::Align::Center));
    contents.add_space(6.0 + indent);
    contents.label(
        egui::RichText::new(icon)
            .font(theme::icon_font(13.0))
            .color(theme::COLOR_TEXT_WEAK),
    );
    contents.add_space(8.0);
    contents.label(
        egui::RichText::new(label)
            .color(if selected {
                theme::COLOR_TEXT_PRIMARY
            } else {
                theme::COLOR_TEXT_WEAK
            })
            .size(13.0),
    );

    response
}
