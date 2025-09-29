use eframe::egui;
use vscode_shell::components::{self, NavigationModel, SidebarItem, SidebarProps, SidebarSection};

use crate::local_providers::LocalModelProvider;
use crate::state::{
    AppState, MainTab, MainView, PreferencePanel, RemoteProviderKind, ResourceSection,
};
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
    fn primary_section(&self) -> SidebarSection {
        SidebarSection {
            id: "primary".into(),
            title: "Principal".into(),
            items: vec![
                self.main_item("main:chat", "💬 Chat multimodal", MainView::ChatMultimodal),
                self.main_item("main:cron", "⏱️ Cron", MainView::CronScheduler),
                self.main_item("main:activity", "📈 Actividad", MainView::ActivityFeed),
                self.main_item("main:debug", "🪲 Debug", MainView::DebugConsole),
            ],
        }
    }

    fn preference_sections(&self) -> Vec<SidebarSection> {
        vec![
            self.preference_group(
                "Preferencias · Sistema",
                &[
                    PreferencePanel::SystemGithub,
                    PreferencePanel::SystemCache,
                    PreferencePanel::SystemResources,
                ],
            ),
            self.preference_group(
                "Preferencias · Personalización",
                &[
                    PreferencePanel::CustomizationCommands,
                    PreferencePanel::CustomizationMemory,
                    PreferencePanel::CustomizationProfiles,
                    PreferencePanel::CustomizationProjects,
                ],
            ),
            self.preference_group(
                "Preferencias · Proveedores",
                &[
                    PreferencePanel::ProvidersAnthropic,
                    PreferencePanel::ProvidersOpenAi,
                    PreferencePanel::ProvidersGroq,
                ],
            ),
            self.preference_group(
                "Preferencias · Modelos locales",
                &[PreferencePanel::LocalJarvis],
            ),
        ]
    }

    fn resources_sections(&self) -> Vec<SidebarSection> {
        vec![
            SidebarSection {
                id: "resources-remote".into(),
                title: "Recursos · Catálogos remotos".into(),
                items: [
                    RemoteProviderKind::Anthropic,
                    RemoteProviderKind::OpenAi,
                    RemoteProviderKind::Groq,
                ]
                .into_iter()
                .map(|provider| {
                    let section = ResourceSection::RemoteCatalog(provider);
                    let metadata = section.metadata();
                    SidebarItem {
                        id: format!("{}", resource_id(&section)),
                        label: metadata
                            .breadcrumb
                            .last()
                            .copied()
                            .unwrap_or(metadata.title)
                            .to_string(),
                        description: Some(metadata.description.to_string()),
                        icon: Some("☁️".into()),
                        badge: None,
                        selected: self
                            .state
                            .selected_resource
                            .map(|current| current == section)
                            .unwrap_or(false)
                            && self.state.active_main_view == MainView::ResourceBrowser,
                    }
                })
                .collect(),
            },
            SidebarSection {
                id: "resources-local".into(),
                title: "Recursos · Galerías locales".into(),
                items: [
                    LocalModelProvider::HuggingFace,
                    LocalModelProvider::GithubModels,
                    LocalModelProvider::Replicate,
                    LocalModelProvider::Ollama,
                    LocalModelProvider::OpenRouter,
                    LocalModelProvider::Modelscope,
                ]
                .into_iter()
                .map(|provider| {
                    let section = ResourceSection::LocalCatalog(provider);
                    let metadata = section.metadata();
                    SidebarItem {
                        id: resource_id(&section),
                        label: metadata
                            .breadcrumb
                            .last()
                            .copied()
                            .unwrap_or(metadata.title)
                            .to_string(),
                        description: Some(metadata.description.to_string()),
                        icon: Some("💾".into()),
                        badge: None,
                        selected: self
                            .state
                            .selected_resource
                            .map(|current| current == section)
                            .unwrap_or(false)
                            && self.state.active_main_view == MainView::ResourceBrowser,
                    }
                })
                .collect(),
            },
            SidebarSection {
                id: "resources-installed".into(),
                title: "Recursos · Espacios conectados".into(),
                items: vec![
                    resource_item(
                        ResourceSection::InstalledLocal,
                        self.state.selected_resource,
                        "🧩",
                    ),
                    resource_item(
                        ResourceSection::ConnectedProjects,
                        self.state.selected_resource,
                        "🗂️",
                    ),
                    resource_item(
                        ResourceSection::GithubRepositories,
                        self.state.selected_resource,
                        "📁",
                    ),
                ],
            },
        ]
    }

    fn main_item(&self, id: &str, label: &str, view: MainView) -> SidebarItem {
        SidebarItem {
            id: id.into(),
            label: label.into(),
            description: None,
            icon: None,
            badge: None,
            selected: self.state.active_main_view == view,
        }
    }

    fn preference_group(&self, title: &str, panels: &[PreferencePanel]) -> SidebarSection {
        SidebarSection {
            id: format!("prefs-{}", title.replace(' ', "-").to_lowercase()),
            title: title.into(),
            items: panels
                .iter()
                .map(|panel| {
                    let metadata = panel.metadata();
                    SidebarItem {
                        id: preference_id(*panel),
                        label: metadata
                            .breadcrumb
                            .last()
                            .copied()
                            .unwrap_or(metadata.title)
                            .to_string(),
                        description: Some(metadata.description.to_string()),
                        icon: Some("⚙️".into()),
                        badge: None,
                        selected: self.state.active_main_view == MainView::Preferences
                            && self.state.selected_preference == *panel,
                    }
                })
                .collect(),
        }
    }
}

impl NavigationModel for AppSidebar<'_> {
    fn theme(&self) -> vscode_shell::layout::ShellTheme {
        shell_theme(&self.state.theme)
    }

    fn props(&self) -> SidebarProps {
        let mut sections = Vec::new();
        sections.push(self.primary_section());
        sections.extend(self.preference_sections());
        sections.extend(self.resources_sections());

        SidebarProps {
            title: Some("Navegación".into()),
            sections,
            collapse_button_tooltip: Some("Ocultar navegación".into()),
        }
    }

    fn on_item_selected(&mut self, item_id: &str) {
        if let Some(view) = match item_id {
            "main:chat" => Some(MainView::ChatMultimodal),
            "main:cron" => Some(MainView::CronScheduler),
            "main:activity" => Some(MainView::ActivityFeed),
            "main:debug" => Some(MainView::DebugConsole),
            _ => None,
        } {
            self.state.active_main_view = view;
            if let Some(tab) = MainTab::from_view(view) {
                self.state.set_active_tab(tab);
            }
            return;
        }

        if let Some(panel) = parse_preference_id(item_id) {
            self.state.selected_preference = panel;
            self.state.selected_resource = None;
            self.state.active_main_view = MainView::Preferences;
            self.state.sync_active_tab_from_view();
            return;
        }

        if let Some(section) = parse_resource_id(item_id) {
            self.state.selected_resource = Some(section);
            self.state.active_main_view = MainView::ResourceBrowser;
            self.state.sync_active_tab_from_view();
        }
    }
}

fn preference_id(panel: PreferencePanel) -> String {
    match panel {
        PreferencePanel::SystemGithub => "pref:system_github",
        PreferencePanel::SystemCache => "pref:system_cache",
        PreferencePanel::SystemResources => "pref:system_resources",
        PreferencePanel::CustomizationCommands => "pref:custom_commands",
        PreferencePanel::CustomizationMemory => "pref:custom_memory",
        PreferencePanel::CustomizationProfiles => "pref:custom_profiles",
        PreferencePanel::CustomizationProjects => "pref:custom_projects",
        PreferencePanel::ProvidersAnthropic => "pref:providers_anthropic",
        PreferencePanel::ProvidersOpenAi => "pref:providers_openai",
        PreferencePanel::ProvidersGroq => "pref:providers_groq",
        PreferencePanel::LocalJarvis => "pref:local_jarvis",
    }
    .into()
}

fn parse_preference_id(id: &str) -> Option<PreferencePanel> {
    Some(match id {
        "pref:system_github" => PreferencePanel::SystemGithub,
        "pref:system_cache" => PreferencePanel::SystemCache,
        "pref:system_resources" => PreferencePanel::SystemResources,
        "pref:custom_commands" => PreferencePanel::CustomizationCommands,
        "pref:custom_memory" => PreferencePanel::CustomizationMemory,
        "pref:custom_profiles" => PreferencePanel::CustomizationProfiles,
        "pref:custom_projects" => PreferencePanel::CustomizationProjects,
        "pref:providers_anthropic" => PreferencePanel::ProvidersAnthropic,
        "pref:providers_openai" => PreferencePanel::ProvidersOpenAi,
        "pref:providers_groq" => PreferencePanel::ProvidersGroq,
        "pref:local_jarvis" => PreferencePanel::LocalJarvis,
        _ => return None,
    })
}

pub(crate) fn resource_id(section: &ResourceSection) -> String {
    match section {
        ResourceSection::LocalCatalog(provider) => format!("resource:local:{:?}", provider),
        ResourceSection::RemoteCatalog(provider) => format!("resource:remote:{:?}", provider),
        ResourceSection::InstalledLocal => "resource:installed".into(),
        ResourceSection::ConnectedProjects => "resource:projects".into(),
        ResourceSection::GithubRepositories => "resource:github".into(),
    }
}

fn resource_item(
    section: ResourceSection,
    current: Option<ResourceSection>,
    icon: &str,
) -> SidebarItem {
    let metadata = section.metadata();
    SidebarItem {
        id: resource_id(&section),
        label: metadata
            .breadcrumb
            .last()
            .copied()
            .unwrap_or(metadata.title)
            .to_string(),
        description: Some(metadata.description.to_string()),
        icon: Some(icon.into()),
        badge: None,
        selected: current.map(|active| active == section).unwrap_or(false)
            && matches!(
                current,
                Some(ResourceSection::InstalledLocal)
                    | Some(ResourceSection::ConnectedProjects)
                    | Some(ResourceSection::GithubRepositories)
            ),
    }
}

pub(crate) fn parse_resource_id(id: &str) -> Option<ResourceSection> {
    if let Some(rest) = id.strip_prefix("resource:local:") {
        return match rest {
            "HuggingFace" => Some(ResourceSection::LocalCatalog(
                LocalModelProvider::HuggingFace,
            )),
            "GithubModels" => Some(ResourceSection::LocalCatalog(
                LocalModelProvider::GithubModels,
            )),
            "Replicate" => Some(ResourceSection::LocalCatalog(LocalModelProvider::Replicate)),
            "Ollama" => Some(ResourceSection::LocalCatalog(LocalModelProvider::Ollama)),
            "OpenRouter" => Some(ResourceSection::LocalCatalog(
                LocalModelProvider::OpenRouter,
            )),
            "Modelscope" => Some(ResourceSection::LocalCatalog(
                LocalModelProvider::Modelscope,
            )),
            _ => None,
        };
    }

    if let Some(rest) = id.strip_prefix("resource:remote:") {
        return match rest {
            "Anthropic" => Some(ResourceSection::RemoteCatalog(
                RemoteProviderKind::Anthropic,
            )),
            "OpenAi" => Some(ResourceSection::RemoteCatalog(RemoteProviderKind::OpenAi)),
            "Groq" => Some(ResourceSection::RemoteCatalog(RemoteProviderKind::Groq)),
            _ => None,
        };
    }

    match id {
        "resource:installed" => Some(ResourceSection::InstalledLocal),
        "resource:projects" => Some(ResourceSection::ConnectedProjects),
        "resource:github" => Some(ResourceSection::GithubRepositories),
        _ => None,
    }
}
