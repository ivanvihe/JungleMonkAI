pub mod automation;
pub mod chat;
pub mod feature;
pub mod resources;

pub use automation::AutomationState;
pub use chat::ChatState;
pub use feature::{CommandRegistry, FeatureModule, WorkbenchRegistry};
pub use resources::ResourceState;

use crate::{
    api::{claude::AnthropicModel, local::JarvisRuntime},
    config::{AppConfig, InstalledModelConfig},
    local_providers::{LocalModelCard, LocalModelIdentifier, LocalModelProvider},
    ui::{
        theme::{self, FontSource, ThemePreset, ThemeTokens},
        workbench::WorkbenchView,
    },
};
use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use vscode_shell::{layout::LayoutConfig, AppShell};

pub use navigation::{
    NavigationNode, NavigationRegistry, NavigationTarget, SECTION_PRIMARY,
    SECTION_RESOURCES_INSTALLED, SECTION_RESOURCES_LOCAL, SECTION_RESOURCES_REMOTE,
};

/// Define metadatos reutilizables para paneles y recursos navegables.
#[derive(Clone, Copy, Debug)]
pub struct PanelMetadata {
    pub title: &'static str,
    pub description: &'static str,
    pub breadcrumb: &'static [&'static str],
}

/// Paneles de preferencias que agrupan formularios y ajustes persistentes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PreferencePanel {
    SystemGithub,
    SystemCache,
    SystemResources,
    CustomizationCommands,
    CustomizationAppearance,
    CustomizationMemory,
    CustomizationProfiles,
    CustomizationProjects,
    ProvidersAnthropic,
    ProvidersOpenAi,
    ProvidersGroq,
    LocalJarvis,
}

impl PreferencePanel {
    pub fn metadata(self) -> PanelMetadata {
        match self {
            PreferencePanel::SystemGithub => PanelMetadata {
                title: "Preferencias › Sistema › Integración con GitHub",
                description:
                    "Administra las credenciales de GitHub y el repositorio sincronizado con JungleMonkAI.",
                breadcrumb: &["Preferencias", "Sistema", "GitHub"],
            },
            PreferencePanel::SystemCache => PanelMetadata {
                title: "Preferencias › Sistema › Caché",
                description:
                    "Configura el directorio de caché, límites de espacio y automatizaciones de limpieza.",
                breadcrumb: &["Preferencias", "Sistema", "Caché"],
            },
            PreferencePanel::SystemResources => PanelMetadata {
                title: "Preferencias › Sistema › Recursos",
                description:
                    "Delimita el uso permitido de memoria y almacenamiento para la ejecución local.",
                breadcrumb: &["Preferencias", "Sistema", "Recursos"],
            },
            PreferencePanel::CustomizationCommands => PanelMetadata {
                title: "Preferencias › Personalización › Comandos",
                description:
                    "Crea y gestiona accesos rápidos disponibles como slash-commands en el chat.",
                breadcrumb: &["Preferencias", "Personalización", "Comandos"],
            },
            PreferencePanel::CustomizationAppearance => PanelMetadata {
                title: "Preferencias › Personalización › Apariencia",
                description:
                    "Selecciona el tema claro u oscuro inspirado en la estética de VSCode.",
                breadcrumb: &["Preferencias", "Personalización", "Apariencia"],
            },
            PreferencePanel::CustomizationMemory => PanelMetadata {
                title: "Preferencias › Personalización › Memoria",
                description:
                    "Ajusta la retención de memoria contextual y la persistencia entre sesiones.",
                breadcrumb: &["Preferencias", "Personalización", "Memoria"],
            },
            PreferencePanel::CustomizationProfiles => PanelMetadata {
                title: "Preferencias › Personalización › Perfiles",
                description:
                    "Selecciona, crea y renombra perfiles de configuración para la experiencia diaria.",
                breadcrumb: &["Preferencias", "Personalización", "Perfiles"],
            },
            PreferencePanel::CustomizationProjects => PanelMetadata {
                title: "Preferencias › Personalización › Proyectos",
                description:
                    "Organiza los proyectos que JungleMonkAI sigue y prioriza dentro del espacio de trabajo.",
                breadcrumb: &["Preferencias", "Personalización", "Proyectos"],
            },
            PreferencePanel::ProvidersAnthropic => PanelMetadata {
                title: "Preferencias › Proveedores › Anthropic",
                description:
                    "Introduce credenciales de Anthropic, alias de invocación y prueba la conectividad de Claude.",
                breadcrumb: &["Preferencias", "Proveedores", "Anthropic"],
            },
            PreferencePanel::ProvidersOpenAi => PanelMetadata {
                title: "Preferencias › Proveedores › OpenAI",
                description:
                    "Define la API key de OpenAI, alias de chat y el modelo predeterminado para peticiones.",
                breadcrumb: &["Preferencias", "Proveedores", "OpenAI"],
            },
            PreferencePanel::ProvidersGroq => PanelMetadata {
                title: "Preferencias › Proveedores › Groq",
                description:
                    "Configura las credenciales de Groq y valida la disponibilidad de su endpoint.",
                breadcrumb: &["Preferencias", "Proveedores", "Groq"],
            },
            PreferencePanel::LocalJarvis => PanelMetadata {
                title: "Preferencias › Modelos locales › Configuración",
                description:
                    "Controla la ruta, instalación y comportamiento de arranque del runtime Jarvis.",
                breadcrumb: &["Preferencias", "Modelos locales", "Jarvis"],
            },
        }
    }
}

impl Default for PreferencePanel {
    fn default() -> Self {
        PreferencePanel::SystemGithub
    }
}

/// Agrupa catálogos y recursos navegables independientes de los formularios.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ResourceSection {
    LocalCatalog(LocalModelProvider),
    RemoteCatalog(RemoteProviderKind),
    InstalledLocal,
    ConnectedProjects,
    GithubRepositories,
}

impl ResourceSection {
    pub fn metadata(self) -> PanelMetadata {
        match self {
            ResourceSection::LocalCatalog(provider) => match provider {
                LocalModelProvider::HuggingFace => PanelMetadata {
                    title: "Recursos › Galerías locales › Hugging Face",
                    description:
                        "Explora modelos publicados en Hugging Face listos para instalar en Jarvis.",
                    breadcrumb: &["Recursos", "Galerías locales", "Hugging Face"],
                },
                LocalModelProvider::GithubModels => PanelMetadata {
                    title: "Recursos › Galerías locales › GitHub Models",
                    description:
                        "Consulta colecciones de GitHub Models y prepara su exportación para uso offline.",
                    breadcrumb: &["Recursos", "Galerías locales", "GitHub Models"],
                },
                LocalModelProvider::Replicate => PanelMetadata {
                    title: "Recursos › Galerías locales › Replicate",
                    description:
                        "Busca modelos de la comunidad de Replicate compatibles con el runtime local.",
                    breadcrumb: &["Recursos", "Galerías locales", "Replicate"],
                },
                LocalModelProvider::Ollama => PanelMetadata {
                    title: "Recursos › Galerías locales › Ollama",
                    description:
                        "Conecta con tu servidor Ollama y descarga modelos optimizados para CPU/GPU.",
                    breadcrumb: &["Recursos", "Galerías locales", "Ollama"],
                },
                LocalModelProvider::OpenRouter => PanelMetadata {
                    title: "Recursos › Galerías locales › OpenRouter",
                    description:
                        "Lista modelos disponibles en OpenRouter y sincronízalos con el entorno local.",
                    breadcrumb: &["Recursos", "Galerías locales", "OpenRouter"],
                },
                LocalModelProvider::Modelscope => PanelMetadata {
                    title: "Recursos › Galerías locales › ModelScope",
                    description:
                        "Revisa checkpoints publicados en ModelScope para incorporarlos a Jarvis.",
                    breadcrumb: &["Recursos", "Galerías locales", "ModelScope"],
                },
            },
            ResourceSection::RemoteCatalog(provider) => match provider {
                RemoteProviderKind::Anthropic => PanelMetadata {
                    title: "Recursos › Catálogos remotos › Claude",
                    description:
                        "Explora el catálogo actualizado de modelos Claude disponibles vía Anthropic.",
                    breadcrumb: &["Recursos", "Catálogos remotos", "Claude"],
                },
                RemoteProviderKind::OpenAi => PanelMetadata {
                    title: "Recursos › Catálogos remotos › OpenAI",
                    description:
                        "Revisa la disponibilidad planificada de modelos GPT y sus capacidades.",
                    breadcrumb: &["Recursos", "Catálogos remotos", "OpenAI"],
                },
                RemoteProviderKind::Groq => PanelMetadata {
                    title: "Recursos › Catálogos remotos › Groq",
                    description:
                        "Consulta los modelos acelerados por Groq y su estado de compatibilidad.",
                    breadcrumb: &["Recursos", "Catálogos remotos", "Groq"],
                },
            },
            ResourceSection::InstalledLocal => PanelMetadata {
                title: "Recursos › Modelos instalados",
                description:
                    "Gestiona los modelos locales ya descargados, su tamaño y fecha de instalación.",
                breadcrumb: &["Recursos", "Modelos locales", "Instalados"],
            },
            ResourceSection::ConnectedProjects => PanelMetadata {
                title: "Recursos › Proyectos locales conectados",
                description:
                    "Navega proyectos locales indexados como recursos con resúmenes y estado de sincronización.",
                breadcrumb: &["Recursos", "Productividad", "Proyectos"],
            },
            ResourceSection::GithubRepositories => PanelMetadata {
                title: "Recursos › Repositorios GitHub conectados",
                description:
                    "Consulta repositorios enlazados con previews de README y sincronización bidireccional.",
                breadcrumb: &["Recursos", "Productividad", "GitHub"],
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MainView {
    ChatMultimodal,
    CronScheduler,
    ActivityFeed,
    DebugConsole,
    Preferences,
    ResourceBrowser,
}

impl Default for MainView {
    fn default() -> Self {
        MainView::ChatMultimodal
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MainTab {
    Chat,
    Cron,
    Activity,
    DebugConsole,
}

impl Default for MainTab {
    fn default() -> Self {
        MainTab::Chat
    }
}

impl From<MainTab> for MainView {
    fn from(value: MainTab) -> Self {
        match value {
            MainTab::Chat => MainView::ChatMultimodal,
            MainTab::Cron => MainView::CronScheduler,
            MainTab::Activity => MainView::ActivityFeed,
            MainTab::DebugConsole => MainView::DebugConsole,
        }
    }
}

impl MainTab {
    pub fn from_view(view: MainView) -> Option<Self> {
        match view {
            MainView::ChatMultimodal => Some(MainTab::Chat),
            MainView::CronScheduler => Some(MainTab::Cron),
            MainView::ActivityFeed => Some(MainTab::Activity),
            MainView::DebugConsole => Some(MainTab::DebugConsole),
            MainView::Preferences | MainView::ResourceBrowser => None,
        }
    }
}

mod navigation {
    use super::{MainTab, MainView, PreferencePanel, ResourceSection};
    use std::collections::BTreeMap;

    pub const SECTION_PRIMARY: &str = "primary";
    pub const SECTION_PREFERENCES_SYSTEM: &str = "preferences-system";
    pub const SECTION_PREFERENCES_CUSTOMIZATION: &str = "preferences-customization";
    pub const SECTION_PREFERENCES_PROVIDERS: &str = "preferences-providers";
    pub const SECTION_PREFERENCES_LOCAL: &str = "preferences-local";
    pub const SECTION_RESOURCES_REMOTE: &str = "resources-remote";
    pub const SECTION_RESOURCES_LOCAL: &str = "resources-local";
    pub const SECTION_RESOURCES_INSTALLED: &str = "resources-installed";

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
    pub enum NavigationTarget {
        Main {
            view: MainView,
            tab: Option<MainTab>,
        },
        Preference(PreferencePanel),
        Resource(ResourceSection),
    }

    impl NavigationTarget {
        pub fn main(view: MainView) -> Self {
            Self::Main { view, tab: None }
        }

        pub fn preference(panel: PreferencePanel) -> Self {
            Self::Preference(panel)
        }

        pub fn resource(section: ResourceSection) -> Self {
            Self::Resource(section)
        }

        pub fn id(self) -> String {
            match self {
                NavigationTarget::Main { view, .. } => match view {
                    MainView::ChatMultimodal => "main:chat".into(),
                    MainView::CronScheduler => "main:cron".into(),
                    MainView::ActivityFeed => "main:activity".into(),
                    MainView::DebugConsole => "main:debug".into(),
                    MainView::Preferences => "main:preferences".into(),
                    MainView::ResourceBrowser => "main:resources".into(),
                },
                NavigationTarget::Preference(panel) => match panel {
                    PreferencePanel::SystemGithub => "pref:system_github".into(),
                    PreferencePanel::SystemCache => "pref:system_cache".into(),
                    PreferencePanel::SystemResources => "pref:system_resources".into(),
                    PreferencePanel::CustomizationCommands => "pref:custom_commands".into(),
                    PreferencePanel::CustomizationAppearance => "pref:custom_appearance".into(),
                    PreferencePanel::CustomizationMemory => "pref:custom_memory".into(),
                    PreferencePanel::CustomizationProfiles => "pref:custom_profiles".into(),
                    PreferencePanel::CustomizationProjects => "pref:custom_projects".into(),
                    PreferencePanel::ProvidersAnthropic => "pref:providers_anthropic".into(),
                    PreferencePanel::ProvidersOpenAi => "pref:providers_openai".into(),
                    PreferencePanel::ProvidersGroq => "pref:providers_groq".into(),
                    PreferencePanel::LocalJarvis => "pref:local_jarvis".into(),
                },
                NavigationTarget::Resource(section) => match section {
                    ResourceSection::LocalCatalog(provider) => {
                        format!("resource:local:{:?}", provider)
                    }
                    ResourceSection::RemoteCatalog(provider) => {
                        format!("resource:remote:{:?}", provider)
                    }
                    ResourceSection::InstalledLocal => "resource:installed".into(),
                    ResourceSection::ConnectedProjects => "resource:projects".into(),
                    ResourceSection::GithubRepositories => "resource:github".into(),
                },
            }
        }
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub struct NavigationNode {
        pub id: String,
        pub label: String,
        pub description: Option<String>,
        pub icon: Option<String>,
        pub badge: Option<String>,
        pub target: NavigationTarget,
        pub order: u32,
        pub section_id: String,
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub struct NavigationSection {
        pub id: String,
        pub title: String,
        pub tooltip: Option<String>,
        pub order: u32,
        pub visible_in_sidebar: bool,
    }

    #[derive(Clone, Debug, Default)]
    pub struct NavigationRegistry {
        sections: BTreeMap<String, NavigationSectionEntry>,
        nodes: BTreeMap<String, NavigationNode>,
    }

    #[derive(Clone, Debug)]
    struct NavigationSectionEntry {
        section: NavigationSection,
        node_ids: Vec<String>,
    }

    impl NavigationRegistry {
        pub fn register_section(&mut self, section: NavigationSection) {
            self.sections
                .entry(section.id.clone())
                .and_modify(|entry| entry.section = section.clone())
                .or_insert_with(|| NavigationSectionEntry {
                    section,
                    node_ids: Vec::new(),
                });
        }

        pub fn register_node(&mut self, node: NavigationNode) {
            let section_id = node.section_id.clone();
            let node_id = node.id.clone();
            self.nodes.insert(node_id.clone(), node);

            let entry =
                self.sections
                    .entry(section_id.clone())
                    .or_insert_with(|| NavigationSectionEntry {
                        section: NavigationSection {
                            id: section_id.clone(),
                            title: section_id.clone(),
                            tooltip: None,
                            order: u32::MAX,
                            visible_in_sidebar: true,
                        },
                        node_ids: Vec::new(),
                    });

            if !entry.node_ids.iter().any(|id| id == &node_id) {
                entry.node_ids.push(node_id);
            }
            entry.node_ids.sort_by(|a, b| {
                let (a_order, a_label) = self
                    .nodes
                    .get(a)
                    .map(|node| (node.order, node.label.as_str()))
                    .unwrap_or((u32::MAX, ""));
                let (b_order, b_label) = self
                    .nodes
                    .get(b)
                    .map(|node| (node.order, node.label.as_str()))
                    .unwrap_or((u32::MAX, ""));
                a_order
                    .cmp(&b_order)
                    .then_with(|| a_label.cmp(b_label))
                    .then_with(|| a.cmp(b))
            });
        }

        pub fn node(&self, id: &str) -> Option<&NavigationNode> {
            self.nodes.get(id)
        }

        pub fn sidebar_sections(&self) -> Vec<(NavigationSection, Vec<NavigationNode>)> {
            let mut entries: Vec<&NavigationSectionEntry> = self.sections.values().collect();
            entries.sort_by(|a, b| {
                a.section
                    .order
                    .cmp(&b.section.order)
                    .then_with(|| a.section.title.cmp(&b.section.title))
                    .then_with(|| a.section.id.cmp(&b.section.id))
            });

            let mut sections = Vec::new();
            for entry in entries {
                if !entry.section.visible_in_sidebar {
                    continue;
                }
                let mut nodes: Vec<NavigationNode> = entry
                    .node_ids
                    .iter()
                    .filter_map(|id| self.nodes.get(id).cloned())
                    .collect();
                nodes.sort_by(|a, b| {
                    a.order
                        .cmp(&b.order)
                        .then_with(|| a.label.cmp(&b.label))
                        .then_with(|| a.id.cmp(&b.id))
                });
                if !nodes.is_empty() {
                    sections.push((entry.section.clone(), nodes));
                }
            }

            sections
        }

        pub fn nodes_for_section(&self, section_id: &str) -> Vec<NavigationNode> {
            self.sections
                .get(section_id)
                .map(|entry| {
                    let mut nodes: Vec<NavigationNode> = entry
                        .node_ids
                        .iter()
                        .filter_map(|id| self.nodes.get(id).cloned())
                        .collect();
                    nodes.sort_by(|a, b| {
                        a.order
                            .cmp(&b.order)
                            .then_with(|| a.label.cmp(&b.label))
                            .then_with(|| a.id.cmp(&b.id))
                    });
                    nodes
                })
                .unwrap_or_default()
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RemoteProviderKind {
    Anthropic,
    OpenAi,
    Groq,
}

impl RemoteProviderKind {
    pub fn display_name(self) -> &'static str {
        match self {
            RemoteProviderKind::Anthropic => "Anthropic · Claude",
            RemoteProviderKind::OpenAi => "OpenAI · GPT",
            RemoteProviderKind::Groq => "Groq",
        }
    }

    pub fn short_code(self) -> &'static str {
        match self {
            RemoteProviderKind::Anthropic => "anthropic",
            RemoteProviderKind::OpenAi => "openai",
            RemoteProviderKind::Groq => "groq",
        }
    }
}

fn build_navigation_registry(config: &AppConfig) -> NavigationRegistry {
    use navigation::{
        NavigationNode, NavigationRegistry, NavigationSection, NavigationTarget,
        SECTION_PREFERENCES_CUSTOMIZATION, SECTION_PREFERENCES_LOCAL,
        SECTION_PREFERENCES_PROVIDERS, SECTION_PREFERENCES_SYSTEM, SECTION_PRIMARY,
        SECTION_RESOURCES_INSTALLED, SECTION_RESOURCES_LOCAL, SECTION_RESOURCES_REMOTE,
    };

    let mut registry = NavigationRegistry::default();
    let resources_installed_order = if config.selected_profile.unwrap_or(0) > 0 {
        19
    } else {
        22
    };

    registry.register_section(NavigationSection {
        id: SECTION_PRIMARY.to_string(),
        title: "Principal".into(),
        tooltip: Some("Accesos directos a las vistas principales".into()),
        order: 0,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_PREFERENCES_SYSTEM.to_string(),
        title: "Preferencias · Sistema".into(),
        tooltip: Some("Configura integraciones y recursos del sistema".into()),
        order: 10,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_PREFERENCES_CUSTOMIZATION.to_string(),
        title: "Preferencias · Personalización".into(),
        tooltip: Some("Ajusta la experiencia de JungleMonkAI".into()),
        order: 11,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_PREFERENCES_PROVIDERS.to_string(),
        title: "Preferencias · Proveedores".into(),
        tooltip: Some("Gestiona credenciales y catálogos remotos".into()),
        order: 12,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_PREFERENCES_LOCAL.to_string(),
        title: "Preferencias · Modelos locales".into(),
        tooltip: Some("Controla el runtime y las instalaciones locales".into()),
        order: 13,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_RESOURCES_REMOTE.to_string(),
        title: "Recursos · Catálogos remotos".into(),
        tooltip: Some("Explora modelos disponibles en la nube".into()),
        order: 20,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_RESOURCES_LOCAL.to_string(),
        title: "Recursos · Galerías locales".into(),
        tooltip: Some("Instala modelos optimizados para ejecución local".into()),
        order: 21,
        visible_in_sidebar: true,
    });

    registry.register_section(NavigationSection {
        id: SECTION_RESOURCES_INSTALLED.to_string(),
        title: "Recursos · Espacios conectados".into(),
        tooltip: Some("Gestiona los recursos ya integrados".into()),
        order: resources_installed_order,
        visible_in_sidebar: true,
    });

    let preference_groups: [(&str, &[PreferencePanel]); 4] = [
        (
            SECTION_PREFERENCES_SYSTEM,
            &[
                PreferencePanel::SystemGithub,
                PreferencePanel::SystemCache,
                PreferencePanel::SystemResources,
            ],
        ),
        (
            SECTION_PREFERENCES_CUSTOMIZATION,
            &[
                PreferencePanel::CustomizationCommands,
                PreferencePanel::CustomizationAppearance,
                PreferencePanel::CustomizationMemory,
                PreferencePanel::CustomizationProfiles,
                PreferencePanel::CustomizationProjects,
            ],
        ),
        (
            SECTION_PREFERENCES_PROVIDERS,
            &[
                PreferencePanel::ProvidersAnthropic,
                PreferencePanel::ProvidersOpenAi,
                PreferencePanel::ProvidersGroq,
            ],
        ),
        (SECTION_PREFERENCES_LOCAL, &[PreferencePanel::LocalJarvis]),
    ];

    for (section_id, panels) in preference_groups {
        for (index, panel) in panels.iter().enumerate() {
            let metadata = panel.metadata();
            let label = metadata
                .breadcrumb
                .last()
                .copied()
                .unwrap_or(metadata.title);
            let target = NavigationTarget::preference(*panel);
            registry.register_node(NavigationNode {
                id: target.id(),
                label: label.to_string(),
                description: Some(metadata.description.to_string()),
                icon: Some("⚙️".into()),
                badge: None,
                target,
                order: index as u32,
                section_id: section_id.to_string(),
            });
        }
    }

    registry
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct RemoteModelKey {
    pub provider: RemoteProviderKind,
    pub id: String,
}

impl RemoteModelKey {
    pub fn new(provider: RemoteProviderKind, id: impl Into<String>) -> Self {
        Self {
            provider,
            id: id.into(),
        }
    }

    pub fn as_display(&self) -> String {
        format!("{} · {}", self.provider.display_name(), self.id)
    }
}

#[derive(Clone, Debug)]
pub struct RemoteModelCard {
    pub key: RemoteModelKey,
    pub title: String,
    pub description: String,
    pub context_tokens: u32,
    pub max_output_tokens: u32,
    pub input_cost_per_million: f32,
    pub output_cost_per_million: f32,
    pub latency_ms: u32,
    pub tags: Vec<String>,
    pub capabilities: Vec<String>,
    pub favorite_hint: String,
    pub quick_actions: Vec<String>,
    pub multimodal: bool,
}

impl RemoteModelCard {
    pub fn sample(
        provider: RemoteProviderKind,
        id: &str,
        title: &str,
        description: &str,
        context_tokens: u32,
        max_output_tokens: u32,
        input_cost_per_million: f32,
        output_cost_per_million: f32,
        latency_ms: u32,
        tags: Vec<&str>,
        capabilities: Vec<&str>,
        favorite_hint: &str,
        quick_actions: Vec<&str>,
        multimodal: bool,
    ) -> Self {
        Self {
            key: RemoteModelKey::new(provider, id),
            title: title.to_string(),
            description: description.to_string(),
            context_tokens,
            max_output_tokens,
            input_cost_per_million,
            output_cost_per_million,
            latency_ms,
            tags: tags.into_iter().map(|tag| tag.to_string()).collect(),
            capabilities: capabilities
                .into_iter()
                .map(|cap| cap.to_string())
                .collect(),
            favorite_hint: favorite_hint.to_string(),
            quick_actions: quick_actions
                .into_iter()
                .map(|action| action.to_string())
                .collect(),
            multimodal,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct RemoteCatalogFilters {
    pub search: String,
    pub max_cost: Option<f32>,
    pub min_context: Option<u32>,
    pub favorites_only: bool,
    pub multimodal_only: bool,
    pub tag_filters: BTreeSet<String>,
}

#[derive(Clone, Debug)]
pub struct RemoteCatalogState {
    pub provider_cards: BTreeMap<RemoteProviderKind, Vec<RemoteModelCard>>,
    pub filters: BTreeMap<RemoteProviderKind, RemoteCatalogFilters>,
    pub favorites: BTreeSet<RemoteModelKey>,
    pub comparison: Vec<RemoteModelKey>,
    pub quick_test_prompt: String,
    pub last_status: Option<String>,
}

impl Default for RemoteCatalogState {
    fn default() -> Self {
        let mut provider_cards: BTreeMap<RemoteProviderKind, Vec<RemoteModelCard>> =
            BTreeMap::new();

        provider_cards.insert(
            RemoteProviderKind::Anthropic,
            vec![
                RemoteModelCard::sample(
                    RemoteProviderKind::Anthropic,
                    "claude-3-opus-20240229",
                    "Claude 3 Opus",
                    "Modelo premium multimodal orientado a razonamiento profundo y tareas estratégicas.",
                    200_000,
                    4096,
                    15.0,
                    75.0,
                    1800,
                    vec!["razonamiento", "multimodal", "premium"],
                    vec!["análisis", "long context"],
                    "Ideal para conversaciones críticas y generación de estrategias.",
                    vec!["Generar informe", "Analizar conversación"],
                    true,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::Anthropic,
                    "claude-3-sonnet-20240229",
                    "Claude 3 Sonnet",
                    "Equilibrio entre coste y capacidades; recomendado para asistentes diarios.",
                    200_000,
                    4096,
                    8.0,
                    24.0,
                    1200,
                    vec!["balanced", "multimodal"],
                    vec!["coding", "drafting"],
                    "Selecciona Sonnet cuando busques velocidad sin sacrificar precisión.",
                    vec!["Redactar resumen", "Generar unit tests"],
                    true,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::Anthropic,
                    "claude-3-haiku-20240307",
                    "Claude 3 Haiku",
                    "Respuesta ágil para experiencias conversacionales en tiempo real.",
                    200_000,
                    4096,
                    2.0,
                    10.0,
                    450,
                    vec!["ligero", "realtime"],
                    vec!["chatbots", "streaming"],
                    "Comparte este modelo con tus integraciones móviles para latencias reducidas.",
                    vec!["Responder FAQ", "Validar intención"],
                    true,
                ),
            ],
        );

        provider_cards.insert(
            RemoteProviderKind::OpenAi,
            vec![
                RemoteModelCard::sample(
                    RemoteProviderKind::OpenAi,
                    "gpt-4.1-mini",
                    "GPT-4.1 Mini",
                    "Modelo ágil con cobertura multimodal y precios contenidos.",
                    128_000,
                    4096,
                    3.0,
                    15.0,
                    900,
                    vec!["multimodal", "fast"],
                    vec!["summaries", "prototyping"],
                    "Escoge Mini para asistentes interactivos o generación de borradores rápidos.",
                    vec!["Resumir hilo", "Generar story"],
                    true,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::OpenAi,
                    "gpt-4.1",
                    "GPT-4.1",
                    "Capacidades completas con respuestas extensas y razonamiento confiable.",
                    300_000,
                    8192,
                    30.0,
                    60.0,
                    1500,
                    vec!["razonamiento", "enterprise"],
                    vec!["analysis", "synthesis"],
                    "Úsalo para revisiones detalladas y planes de proyecto.",
                    vec!["Auditar código", "Planificar roadmap"],
                    true,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::OpenAi,
                    "o1-preview",
                    "o1 preview",
                    "Modelo orientado a planificación paso a paso con cadenas de pensamiento explícitas.",
                    200_000,
                    4096,
                    6.0,
                    18.0,
                    2200,
                    vec!["deliberativo", "planificación"],
                    vec!["reasoning", "research"],
                    "Aprovecha este modelo para dividir tareas complejas en pasos accionables.",
                    vec!["Crear plan de experimentos", "Refinar prompts"],
                    false,
                ),
            ],
        );

        provider_cards.insert(
            RemoteProviderKind::Groq,
            vec![
                RemoteModelCard::sample(
                    RemoteProviderKind::Groq,
                    "llama3-70b-8192",
                    "Llama 3 70B Instruct",
                    "Inferencia acelerada en hardware Groq para respuestas en milisegundos.",
                    8_192,
                    4096,
                    0.7,
                    0.9,
                    230,
                    vec!["latencia-baja", "open"],
                    vec!["code", "assistants"],
                    "Excelente para herramientas de desarrollo con respuestas instantáneas.",
                    vec!["Explicar código", "Responder tests"],
                    false,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::Groq,
                    "mixtral-8x7b-32768",
                    "Mixtral 8x7B",
                    "Modelo mixture-of-experts servido en Groq para tareas analíticas.",
                    32_768,
                    4096,
                    0.9,
                    1.1,
                    260,
                    vec!["moe", "razonamiento"],
                    vec!["analysis", "summaries"],
                    "Selecciona Mixtral para análisis de datos y evaluación de hipótesis rápidas.",
                    vec!["Resumir logs", "Describir métricas"],
                    false,
                ),
                RemoteModelCard::sample(
                    RemoteProviderKind::Groq,
                    "gemma-7b-it",
                    "Gemma 7B Instruct",
                    "Modelo ligero optimizado en Groq para bots conversacionales y QA interno.",
                    8_192,
                    2048,
                    0.2,
                    0.3,
                    190,
                    vec!["ligero", "qa"],
                    vec!["support", "chat"],
                    "Ideal para FAQs, agentes de soporte y automatizaciones de TI.",
                    vec!["Responder ticket", "Clasificar bug"],
                    false,
                ),
            ],
        );

        Self {
            provider_cards,
            filters: BTreeMap::new(),
            favorites: BTreeSet::new(),
            comparison: Vec::new(),
            quick_test_prompt: String::new(),
            last_status: None,
        }
    }
}

impl RemoteCatalogState {
    pub fn filters_mut(&mut self, provider: RemoteProviderKind) -> &mut RemoteCatalogFilters {
        self.filters
            .entry(provider)
            .or_insert_with(RemoteCatalogFilters::default)
    }

    pub fn filters(&self, provider: RemoteProviderKind) -> RemoteCatalogFilters {
        self.filters.get(&provider).cloned().unwrap_or_default()
    }

    pub fn cards_for(&self, provider: RemoteProviderKind) -> &[RemoteModelCard] {
        self.provider_cards
            .get(&provider)
            .map(|cards| cards.as_slice())
            .unwrap_or(&[])
    }

    pub fn cards_for_mut(&mut self, provider: RemoteProviderKind) -> &mut Vec<RemoteModelCard> {
        self.provider_cards.entry(provider).or_default()
    }

    pub fn is_favorite(&self, key: &RemoteModelKey) -> bool {
        self.favorites.contains(key)
    }

    pub fn toggle_favorite(&mut self, key: RemoteModelKey) {
        if !self.favorites.remove(&key) {
            self.favorites.insert(key);
        }
    }

    pub fn in_comparison(&self, key: &RemoteModelKey) -> bool {
        self.comparison.iter().any(|entry| entry == key)
    }

    pub fn toggle_comparison(&mut self, key: RemoteModelKey) {
        if let Some(pos) = self.comparison.iter().position(|entry| entry == &key) {
            self.comparison.remove(pos);
        } else {
            if self.comparison.len() >= 3 {
                self.comparison.remove(0);
            }
            self.comparison.push(key);
        }
    }

    pub fn filtered_cards(&self, provider: RemoteProviderKind) -> Vec<&RemoteModelCard> {
        let filters = self.filters(provider);
        self.cards_for(provider)
            .iter()
            .filter(|card| {
                if filters.favorites_only && !self.is_favorite(&card.key) {
                    return false;
                }

                if filters.multimodal_only && !card.multimodal {
                    return false;
                }

                if let Some(max_cost) = filters.max_cost {
                    if card.input_cost_per_million > max_cost
                        && card.output_cost_per_million > max_cost
                    {
                        return false;
                    }
                }

                if let Some(min_context) = filters.min_context {
                    if card.context_tokens < min_context {
                        return false;
                    }
                }

                if !filters.tag_filters.is_empty()
                    && !filters
                        .tag_filters
                        .iter()
                        .all(|tag| card.tags.iter().any(|ct| ct.eq_ignore_ascii_case(tag)))
                {
                    return false;
                }

                if filters.search.trim().is_empty() {
                    return true;
                }

                let haystack = format!(
                    "{} {} {}",
                    card.title,
                    card.description,
                    card.tags.join(" ")
                )
                .to_lowercase();
                haystack.contains(&filters.search.to_lowercase())
            })
            .collect()
    }

    pub fn all_tags(&self, provider: RemoteProviderKind) -> BTreeSet<String> {
        let mut tags = BTreeSet::new();
        for card in self.cards_for(provider) {
            for tag in &card.tags {
                tags.insert(tag.to_string());
            }
        }
        tags
    }

    pub fn update_status(&mut self, status: Option<String>) {
        self.last_status = status;
    }
}

#[derive(Clone, Debug, Default)]
pub struct LocalLibraryState {
    pub filter: String,
    pub show_only_ready: bool,
    pub selection: Option<LocalModelIdentifier>,
    pub operation_feedback: Option<String>,
}

#[derive(Clone, Debug)]
pub struct KnowledgeResourceCard {
    pub title: String,
    pub subtitle: String,
    pub resource_type: String,
    pub last_synced: String,
    pub tags: Vec<String>,
    pub link: Option<String>,
}

impl KnowledgeResourceCard {
    pub fn new(
        title: impl Into<String>,
        subtitle: impl Into<String>,
        resource_type: impl Into<String>,
        last_synced: impl Into<String>,
        tags: Vec<&str>,
        link: Option<String>,
    ) -> Self {
        Self {
            title: title.into(),
            subtitle: subtitle.into(),
            resource_type: resource_type.into(),
            last_synced: last_synced.into(),
            tags: tags.into_iter().map(|tag| tag.to_string()).collect(),
            link,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PersonalizationResourcesState {
    pub memories: Vec<KnowledgeResourceCard>,
    pub profiles: Vec<KnowledgeResourceCard>,
    pub contexts: Vec<KnowledgeResourceCard>,
}

impl PersonalizationResourcesState {
    pub fn from_sources(
        profiles: &[String],
        projects: &[String],
        github_repositories: &[String],
    ) -> Self {
        let memories = vec![
            KnowledgeResourceCard::new(
                "Memoria conversacional",
                "Persistencia automática de hechos clave compartidos con el asistente.",
                "Memoria",
                "Actualizado cada sesión",
                vec!["contexto", "resumen"],
                None,
            ),
            KnowledgeResourceCard::new(
                "Knowledge Base local",
                "Colección de notas sincronizadas desde /workspace/notes para respuestas rápidas.",
                "Repositorio",
                "Hace 2 h",
                vec!["markdown", "offline"],
                Some("file:///workspace/notes".to_string()),
            ),
        ];

        let profiles_cards: Vec<_> = profiles
            .iter()
            .enumerate()
            .map(|(idx, name)| {
                KnowledgeResourceCard::new(
                    format!("Perfil #{idx} · {name}"),
                    "Preferencias preconfiguradas de tono, idioma y formato de entrega.",
                    "Perfil",
                    "Sincronizado al guardar",
                    vec!["config", "perfil"],
                    None,
                )
            })
            .collect();

        let mut contexts = Vec::new();
        for project in projects {
            contexts.push(KnowledgeResourceCard::new(
                project,
                "Resumen ejecutivo del proyecto seguido por JungleMonkAI.",
                "Proyecto",
                "Hace 1 h",
                vec!["prioridad", "roadmap"],
                None,
            ));
        }

        for repo in github_repositories {
            contexts.push(KnowledgeResourceCard::new(
                repo,
                "Repositorio conectado como fuente de conocimiento navegable.",
                "GitHub",
                "Sync pendiente",
                vec!["github", "code"],
                Some(format!("https://github.com/{repo}")),
            ));
        }

        Self {
            memories,
            profiles: profiles_cards,
            contexts,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ModelRouteSuggestion {
    pub title: String,
    pub description: String,
    pub provider: RemoteProviderKind,
    pub tags: Vec<String>,
}

impl ModelRouteSuggestion {
    pub fn new(
        title: impl Into<String>,
        description: impl Into<String>,
        provider: RemoteProviderKind,
        tags: Vec<&str>,
    ) -> Self {
        Self {
            title: title.into(),
            description: description.into(),
            provider,
            tags: tags.into_iter().map(|tag| tag.to_string()).collect(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ChatRoutingState {
    pub active_thread_provider: RemoteProviderKind,
    pub message_override: Option<RemoteProviderKind>,
    pub route_every_message: bool,
    pub suggestions: Vec<ModelRouteSuggestion>,
    pub status: Option<String>,
}

impl Default for ChatRoutingState {
    fn default() -> Self {
        Self {
            active_thread_provider: RemoteProviderKind::Anthropic,
            message_override: None,
            route_every_message: true,
            suggestions: vec![
                ModelRouteSuggestion::new(
                    "Código y diffs",
                    "Envía a Groq para validar cambios y obtener tiempos de respuesta mínimos.",
                    RemoteProviderKind::Groq,
                    vec!["code", "latencia"],
                ),
                ModelRouteSuggestion::new(
                    "Resumen ejecutivo",
                    "OpenAI ofrece mejor compresión semántica en resúmenes largos.",
                    RemoteProviderKind::OpenAi,
                    vec!["resumen", "informes"],
                ),
                ModelRouteSuggestion::new(
                    "Análisis profundo",
                    "Claude Opus prioriza razonamiento para auditorías o decisiones críticas.",
                    RemoteProviderKind::Anthropic,
                    vec!["razonamiento", "auditoría"],
                ),
            ],
            status: None,
        }
    }
}

impl ChatRoutingState {
    pub fn set_override(&mut self, provider: RemoteProviderKind) {
        self.message_override = Some(provider);
    }

    pub fn take_override(&mut self) -> Option<RemoteProviderKind> {
        self.message_override.take()
    }

    pub fn update_status(&mut self, status: Option<String>) {
        self.status = status;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum ScheduledTaskStatus {
    Scheduled,
    Running,
    Success,
    Failed,
    Paused,
}

impl ScheduledTaskStatus {
    pub fn label(self) -> &'static str {
        match self {
            ScheduledTaskStatus::Scheduled => "Programado",
            ScheduledTaskStatus::Running => "En ejecución",
            ScheduledTaskStatus::Success => "Completado",
            ScheduledTaskStatus::Failed => "Error",
            ScheduledTaskStatus::Paused => "Pausado",
        }
    }
}

#[derive(Clone, Debug)]
pub struct ScheduledTask {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub cron_expression: String,
    pub cadence_label: String,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub status: ScheduledTaskStatus,
    pub owner: String,
    pub provider: Option<RemoteProviderKind>,
    pub tags: Vec<String>,
    pub enabled: bool,
}

impl ScheduledTask {
    pub fn provider_badge(&self) -> Option<String> {
        self.provider
            .map(|provider| format!("@{}", provider.short_code()))
    }
}

#[derive(Clone, Debug)]
pub struct CronBoardState {
    pub tasks: Vec<ScheduledTask>,
    pub show_only_enabled: bool,
    pub provider_filter: Option<RemoteProviderKind>,
    pub tag_filter: Option<String>,
    pub selected_task: Option<u32>,
}

impl Default for CronBoardState {
    fn default() -> Self {
        Self {
            tasks: Vec::new(),
            show_only_enabled: false,
            provider_filter: None,
            tag_filter: None,
            selected_task: None,
        }
    }
}

impl CronBoardState {
    pub fn with_tasks(tasks: Vec<ScheduledTask>) -> Self {
        let mut state = Self::default();
        state.tasks = tasks;
        state
    }

    pub fn filtered_indices(&self) -> Vec<usize> {
        self.tasks
            .iter()
            .enumerate()
            .filter(|(_, task)| {
                if self.show_only_enabled && !task.enabled {
                    return false;
                }

                if let Some(provider) = self.provider_filter {
                    if task.provider != Some(provider) {
                        return false;
                    }
                }

                if let Some(tag) = &self.tag_filter {
                    if !task
                        .tags
                        .iter()
                        .any(|candidate| candidate.eq_ignore_ascii_case(tag))
                    {
                        return false;
                    }
                }

                true
            })
            .map(|(idx, _)| idx)
            .collect()
    }

    pub fn unique_tags(&self) -> BTreeSet<String> {
        let mut tags = BTreeSet::new();
        for task in &self.tasks {
            for tag in &task.tags {
                tags.insert(tag.to_string());
            }
        }
        tags
    }

    pub fn status_count(&self, status: ScheduledTaskStatus) -> usize {
        self.tasks
            .iter()
            .filter(|task| task.status == status)
            .count()
    }

    pub fn select_task(&mut self, id: Option<u32>) {
        self.selected_task = id;
    }

    pub fn selected_task(&self) -> Option<&ScheduledTask> {
        self.selected_task
            .and_then(|id| self.tasks.iter().find(|task| task.id == id))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkflowStatus {
    Ready,
    Running,
    Failed,
    Draft,
}

impl WorkflowStatus {
    pub fn label(self) -> &'static str {
        match self {
            WorkflowStatus::Ready => "Listo",
            WorkflowStatus::Running => "En ejecución",
            WorkflowStatus::Failed => "Con errores",
            WorkflowStatus::Draft => "Borrador",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkflowStepKind {
    RemoteModel,
    LocalScript,
    SyncAction,
}

impl WorkflowStepKind {
    pub fn label(self) -> &'static str {
        match self {
            WorkflowStepKind::RemoteModel => "Modelo remoto",
            WorkflowStepKind::LocalScript => "Script local",
            WorkflowStepKind::SyncAction => "Sincronización",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkflowTriggerKind {
    Manual,
    ChatCommand,
    Scheduled,
    EventListener,
}

impl WorkflowTriggerKind {
    pub fn label(self) -> &'static str {
        match self {
            WorkflowTriggerKind::Manual => "Manual",
            WorkflowTriggerKind::ChatCommand => "Comando de chat",
            WorkflowTriggerKind::Scheduled => "Programado",
            WorkflowTriggerKind::EventListener => "Listener",
        }
    }
}

#[derive(Clone, Debug)]
pub struct WorkflowStep {
    pub kind: WorkflowStepKind,
    pub label: String,
    pub detail: String,
    pub provider: Option<RemoteProviderKind>,
}

#[derive(Clone, Debug)]
pub struct AutomationWorkflow {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub trigger: WorkflowTriggerKind,
    pub chat_command: Option<String>,
    pub linked_schedule: Option<u32>,
    pub status: WorkflowStatus,
    pub last_run: Option<String>,
    pub pinned: bool,
    pub steps: Vec<WorkflowStep>,
}

impl AutomationWorkflow {}

#[derive(Clone, Debug)]
pub struct AutomationWorkflowBoard {
    pub workflows: Vec<AutomationWorkflow>,
    pub show_only_pinned: bool,
}

impl Default for AutomationWorkflowBoard {
    fn default() -> Self {
        Self {
            workflows: Vec::new(),
            show_only_pinned: false,
        }
    }
}

impl AutomationWorkflowBoard {
    pub fn with_workflows(workflows: Vec<AutomationWorkflow>) -> Self {
        let mut state = Self::default();
        state.workflows = workflows;
        state
    }

    pub fn filtered_indices(&self) -> Vec<usize> {
        self.workflows
            .iter()
            .enumerate()
            .filter(|(_, workflow)| {
                if self.show_only_pinned && !workflow.pinned {
                    return false;
                }
                true
            })
            .map(|(idx, _)| idx)
            .collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReminderStatus {
    Scheduled,
    Sent,
    Snoozed,
}

impl ReminderStatus {
    pub fn label(self) -> &'static str {
        match self {
            ReminderStatus::Scheduled => "Programado",
            ReminderStatus::Sent => "Enviado",
            ReminderStatus::Snoozed => "Pospuesto",
        }
    }
}

#[derive(Clone, Debug)]
pub struct ScheduledReminder {
    pub id: u32,
    pub title: String,
    pub cadence: String,
    pub next_trigger: String,
    pub audience: String,
    pub delivery_channel: String,
    pub status: ReminderStatus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListenerEventKind {
    ChatMessage,
    GithubChange,
    CommandExecution,
    Scheduler,
}

impl ListenerEventKind {
    pub fn label(self) -> &'static str {
        match self {
            ListenerEventKind::ChatMessage => "Mensaje entrante",
            ListenerEventKind::GithubChange => "Webhook GitHub",
            ListenerEventKind::CommandExecution => "Ejecución de comando",
            ListenerEventKind::Scheduler => "Finalización de tarea",
        }
    }
}

#[derive(Clone, Debug)]
pub struct EventListener {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub event: ListenerEventKind,
    pub condition: String,
    pub action: String,
    pub enabled: bool,
    pub last_triggered: Option<String>,
}

#[derive(Clone, Debug)]
pub struct EventAutomationState {
    pub listeners: Vec<EventListener>,
    pub show_only_enabled: bool,
}

impl Default for EventAutomationState {
    fn default() -> Self {
        Self {
            listeners: Vec::new(),
            show_only_enabled: false,
        }
    }
}

impl EventAutomationState {
    pub fn with_listeners(listeners: Vec<EventListener>) -> Self {
        let mut state = Self::default();
        state.listeners = listeners;
        state
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyncHealth {
    Healthy,
    Warning,
    Error,
}

#[derive(Clone, Debug)]
pub struct SyncStatus {
    pub label: String,
    pub detail: String,
    pub health: SyncHealth,
}

impl SyncStatus {
    pub fn new(label: impl Into<String>, detail: impl Into<String>, health: SyncHealth) -> Self {
        Self {
            label: label.into(),
            detail: detail.into(),
            health,
        }
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn detail(&self) -> &str {
        &self.detail
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectResourceKind {
    LocalProject,
    GithubRepository,
}

impl ProjectResourceKind {
    pub fn label(self) -> &'static str {
        match self {
            ProjectResourceKind::LocalProject => "Proyecto local",
            ProjectResourceKind::GithubRepository => "Repositorio GitHub",
        }
    }
}

#[derive(Clone, Debug)]
pub struct ProjectResourceCard {
    pub name: String,
    pub kind: ProjectResourceKind,
    pub location: String,
    pub last_sync: String,
    pub status: SyncStatus,
    pub readme_preview: String,
    pub tags: Vec<String>,
    pub pending_actions: Vec<String>,
    pub default_branch: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntegrationStatus {
    Connected,
    Warning,
    Error,
    Syncing,
}

impl IntegrationStatus {
    pub fn label(self) -> &'static str {
        match self {
            IntegrationStatus::Connected => "Conectado",
            IntegrationStatus::Warning => "Advertencia",
            IntegrationStatus::Error => "Error",
            IntegrationStatus::Syncing => "Sincronizando",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExternalServiceKind {
    Gmail,
    GoogleCalendar,
    GithubWebhooks,
    CiCd,
    Ifttt,
    TaskManager,
}

impl ExternalServiceKind {
    pub fn label(self) -> &'static str {
        match self {
            ExternalServiceKind::Gmail => "Gmail",
            ExternalServiceKind::GoogleCalendar => "Google Calendar",
            ExternalServiceKind::GithubWebhooks => "GitHub Webhooks",
            ExternalServiceKind::CiCd => "CI/CD",
            ExternalServiceKind::Ifttt => "IFTTT / Zapier",
            ExternalServiceKind::TaskManager => "Gestores de tareas",
        }
    }
}

#[derive(Clone, Debug)]
pub struct ExternalIntegrationCard {
    pub id: u32,
    pub service: ExternalServiceKind,
    pub name: String,
    pub status: IntegrationStatus,
    pub status_detail: String,
    pub last_event: Option<String>,
    pub next_sync: Option<String>,
    pub quick_actions: Vec<String>,
    pub metadata: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct ExternalIntegrationsState {
    pub connectors: Vec<ExternalIntegrationCard>,
}

impl Default for ExternalIntegrationsState {
    fn default() -> Self {
        Self {
            connectors: Vec::new(),
        }
    }
}

impl ExternalIntegrationsState {
    pub fn with_connectors(connectors: Vec<ExternalIntegrationCard>) -> Self {
        Self { connectors }
    }
}

#[derive(Clone, Debug)]
pub struct GlobalSearchResult {
    pub title: String,
    pub subtitle: String,
    pub action_hint: String,
}

#[derive(Clone, Debug)]
pub struct GlobalSearchGroup {
    pub title: String,
    pub results: Vec<GlobalSearchResult>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DebugLogLevel {
    Info,
    Warning,
    Error,
}

impl DebugLogLevel {
    pub fn label(self) -> &'static str {
        match self {
            DebugLogLevel::Info => "INFO",
            DebugLogLevel::Warning => "WARN",
            DebugLogLevel::Error => "ERR",
        }
    }
}

#[derive(Clone, Debug)]
pub struct DebugLogEntry {
    pub level: DebugLogLevel,
    pub component: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Clone, Debug)]
pub struct DebugConsoleState {
    pub entries: Vec<DebugLogEntry>,
    pub search: String,
    pub level_filter: Option<DebugLogLevel>,
    pub auto_scroll: bool,
}

impl Default for DebugConsoleState {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            search: String::new(),
            level_filter: None,
            auto_scroll: true,
        }
    }
}

impl DebugConsoleState {
    pub fn with_entries(entries: Vec<DebugLogEntry>) -> Self {
        let mut state = Self::default();
        state.entries = entries;
        state
    }

    pub fn filtered_entries(&self) -> Vec<&DebugLogEntry> {
        self.entries
            .iter()
            .filter(|entry| {
                if let Some(level) = self.level_filter {
                    if entry.level != level {
                        return false;
                    }
                }

                if self.search.trim().is_empty() {
                    return true;
                }

                let haystack = format!(
                    "{} {} {}",
                    entry.level.label(),
                    entry.component,
                    entry.message
                )
                .to_lowercase();

                haystack.contains(&self.search.to_lowercase())
            })
            .collect()
    }

    pub fn level_totals(&self) -> (usize, usize, usize) {
        let info = self
            .entries
            .iter()
            .filter(|entry| entry.level == DebugLogLevel::Info)
            .count();
        let warning = self
            .entries
            .iter()
            .filter(|entry| entry.level == DebugLogLevel::Warning)
            .count();
        let error = self
            .entries
            .iter()
            .filter(|entry| entry.level == DebugLogLevel::Error)
            .count();
        (info, warning, error)
    }

    pub fn push_entry(
        &mut self,
        level: DebugLogLevel,
        component: impl Into<String>,
        message: impl Into<String>,
    ) {
        let entry = DebugLogEntry {
            level,
            component: component.into(),
            message: message.into(),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };
        self.entries.push(entry);
        const MAX_ENTRIES: usize = 400;
        if self.entries.len() > MAX_ENTRIES {
            let overflow = self.entries.len() - MAX_ENTRIES;
            self.entries.drain(0..overflow);
        }
    }
}

#[derive(Debug)]
pub(crate) enum LocalInstallMessage {
    Success {
        provider: LocalModelProvider,
        model: LocalModelCard,
        install_path: PathBuf,
    },
    Error {
        provider: LocalModelProvider,
        model_id: String,
        error: String,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct PendingLocalInstall {
    provider: LocalModelProvider,
    model_id: String,
}

#[derive(Clone, Debug, Default)]
pub struct LocalProviderState {
    pub access_token: Option<String>,
    pub token_input: String,
    pub search_query: String,
    pub models: Vec<LocalModelCard>,
    pub selected_model: Option<usize>,
    pub install_status: Option<String>,
}

#[derive(Clone, Debug)]
pub struct InstalledLocalModel {
    pub identifier: LocalModelIdentifier,
    pub install_path: String,
    pub size_bytes: u64,
    pub installed_at: DateTime<Utc>,
}

impl InstalledLocalModel {
    pub fn from_config(config: &InstalledModelConfig) -> Self {
        Self {
            identifier: LocalModelIdentifier::parse(&config.identifier),
            install_path: config.install_path.clone(),
            size_bytes: config.size_bytes,
            installed_at: config.installed_at,
        }
    }

    pub fn to_config(&self) -> InstalledModelConfig {
        InstalledModelConfig {
            identifier: self.identifier.serialize(),
            install_path: self.install_path.clone(),
            size_bytes: self.size_bytes,
            installed_at: self.installed_at,
        }
    }
}

impl LocalProviderState {
    fn from_config(provider: LocalModelProvider, config: &AppConfig) -> Self {
        let (token, query) = match provider {
            LocalModelProvider::HuggingFace => (
                config.huggingface.access_token.clone(),
                config.huggingface.last_search_query.clone(),
            ),
            LocalModelProvider::GithubModels => (
                config.github_models.access_token.clone(),
                config.github_models.last_search_query.clone(),
            ),
            LocalModelProvider::Replicate => (
                config.replicate.access_token.clone(),
                config.replicate.last_search_query.clone(),
            ),
            LocalModelProvider::Ollama => (
                config.ollama.access_token.clone(),
                config.ollama.last_search_query.clone(),
            ),
            LocalModelProvider::OpenRouter => (
                config.openrouter.access_token.clone(),
                config.openrouter.last_search_query.clone(),
            ),
            LocalModelProvider::Modelscope => (
                config.modelscope.access_token.clone(),
                config.modelscope.last_search_query.clone(),
            ),
        };

        Self {
            access_token: token.clone(),
            token_input: token.unwrap_or_default(),
            search_query: query,
            models: Vec::new(),
            selected_model: None,
            install_status: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CustomCommandAction {
    ShowCurrentTime,
    ShowSystemStatus,
    ShowSystemDiagnostics,
    ShowUsageStatistics,
    ListActiveProjects,
    ListConfiguredProfiles,
    ShowCacheConfiguration,
    ListAvailableModels,
    ShowGithubSummary,
    ShowMemorySettings,
    ShowActiveProviders,
    ShowJarvisStatus,
    ShowCommandHelp,
}

impl CustomCommandAction {
    pub fn label(self) -> &'static str {
        match self {
            CustomCommandAction::ShowCurrentTime => "showCurrentTime()",
            CustomCommandAction::ShowSystemStatus => "showSystemStatus()",
            CustomCommandAction::ShowSystemDiagnostics => "showSystemDiagnostics()",
            CustomCommandAction::ShowUsageStatistics => "showUsageStatistics()",
            CustomCommandAction::ListActiveProjects => "listActiveProjects()",
            CustomCommandAction::ListConfiguredProfiles => "listConfiguredProfiles()",
            CustomCommandAction::ShowCacheConfiguration => "showCacheConfiguration()",
            CustomCommandAction::ListAvailableModels => "listAvailableModels()",
            CustomCommandAction::ShowGithubSummary => "showGithubSummary()",
            CustomCommandAction::ShowMemorySettings => "showMemorySettings()",
            CustomCommandAction::ShowActiveProviders => "showActiveProviders()",
            CustomCommandAction::ShowJarvisStatus => "showJarvisStatus()",
            CustomCommandAction::ShowCommandHelp => "showCommandHelp()",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            CustomCommandAction::ShowCurrentTime => "Display the current local time.",
            CustomCommandAction::ShowSystemStatus => "Summarize the system health of the agent.",
            CustomCommandAction::ShowSystemDiagnostics => {
                "Provide an in-depth diagnostic report including providers, Jarvis runtime, and commands."
            }
            CustomCommandAction::ShowUsageStatistics => "Provide placeholder usage statistics.",
            CustomCommandAction::ListActiveProjects => "List the projects tracked by the agent.",
            CustomCommandAction::ListConfiguredProfiles => "List configured user profiles.",
            CustomCommandAction::ShowCacheConfiguration => {
                "Describe the current cache directory and limits."
            }
            CustomCommandAction::ListAvailableModels => {
                "List the models configured across providers and local runtime."
            }
            CustomCommandAction::ShowGithubSummary => {
                "Summarize the authenticated GitHub account and repositories."
            }
            CustomCommandAction::ShowMemorySettings => {
                "Explain the current contextual memory configuration."
            }
            CustomCommandAction::ShowActiveProviders => {
                "List all providers that are currently configured."
            }
            CustomCommandAction::ShowJarvisStatus => {
                "Display the status of the local Jarvis runtime."
            }
            CustomCommandAction::ShowCommandHelp => {
                "List every available slash command in the chat."
            }
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CustomCommand {
    pub trigger: String,
    pub action: CustomCommandAction,
}

pub fn default_custom_commands() -> Vec<CustomCommand> {
    vec![
        CustomCommand {
            trigger: "/time".to_string(),
            action: CustomCommandAction::ShowCurrentTime,
        },
        CustomCommand {
            trigger: "/projects".to_string(),
            action: CustomCommandAction::ListActiveProjects,
        },
        CustomCommand {
            trigger: "/providers".to_string(),
            action: CustomCommandAction::ShowActiveProviders,
        },
    ]
}

fn default_logs() -> Vec<LogEntry> {
    let timestamp = Local::now().format("%H:%M:%S").to_string();
    vec![
        LogEntry {
            status: LogStatus::Ok,
            source: "Scheduler".to_string(),
            message: "Sincronización de proveedores completada".to_string(),
            timestamp: timestamp.clone(),
        },
        LogEntry {
            status: LogStatus::Running,
            source: "Jarvis".to_string(),
            message: "Indexando embeddings locales".to_string(),
            timestamp: timestamp.clone(),
        },
        LogEntry {
            status: LogStatus::Error,
            source: "Red".to_string(),
            message: "Timeout al consultar métricas externas".to_string(),
            timestamp,
        },
    ]
}

fn default_scheduled_tasks() -> Vec<ScheduledTask> {
    vec![
        ScheduledTask {
            id: 1,
            name: "Sincronización de repositorios".to_string(),
            description: "Actualiza issues y pull requests destacados desde GitHub cada mañana."
                .to_string(),
            cron_expression: "0 7 * * 1-5".to_string(),
            cadence_label: "Diario hábil".to_string(),
            last_run: Some("2024-05-14 07:00".to_string()),
            next_run: Some("2024-05-15 07:00".to_string()),
            status: ScheduledTaskStatus::Success,
            owner: "Automation".to_string(),
            provider: Some(RemoteProviderKind::Anthropic),
            tags: vec!["sync".to_string(), "github".to_string()],
            enabled: true,
        },
        ScheduledTask {
            id: 2,
            name: "Informe de métricas".to_string(),
            description: "Genera un resumen ejecutivo con métricas clave usando GPT.".to_string(),
            cron_expression: "30 9 * * 1-5".to_string(),
            cadence_label: "Cada mañana".to_string(),
            last_run: Some("2024-05-14 09:30".to_string()),
            next_run: Some("2024-05-15 09:30".to_string()),
            status: ScheduledTaskStatus::Running,
            owner: "Insights".to_string(),
            provider: Some(RemoteProviderKind::OpenAi),
            tags: vec!["report".to_string(), "analytics".to_string()],
            enabled: true,
        },
        ScheduledTask {
            id: 3,
            name: "Limpieza de caché".to_string(),
            description:
                "Libera artefactos temporales y comprime logs viejos para ahorrar espacio."
                    .to_string(),
            cron_expression: "0 */4 * * *".to_string(),
            cadence_label: "Cada 4 horas".to_string(),
            last_run: Some("2024-05-14 12:00".to_string()),
            next_run: Some("2024-05-14 16:00".to_string()),
            status: ScheduledTaskStatus::Scheduled,
            owner: "Infra".to_string(),
            provider: None,
            tags: vec!["mantenimiento".to_string(), "sistema".to_string()],
            enabled: true,
        },
        ScheduledTask {
            id: 4,
            name: "Entrenamiento de embeddings".to_string(),
            description: "Recalcula embeddings del knowledge base local con el runtime Jarvis."
                .to_string(),
            cron_expression: "15 2 * * 2".to_string(),
            cadence_label: "Martes 02:15".to_string(),
            last_run: Some("2024-05-07 02:15".to_string()),
            next_run: Some("2024-05-14 02:15".to_string()),
            status: ScheduledTaskStatus::Failed,
            owner: "Knowledge".to_string(),
            provider: Some(RemoteProviderKind::Groq),
            tags: vec!["ml".to_string(), "embedding".to_string()],
            enabled: false,
        },
        ScheduledTask {
            id: 5,
            name: "Recordatorio de standup".to_string(),
            description: "Envía en el chat el resumen del standup diario para el equipo remoto."
                .to_string(),
            cron_expression: "0 9 * * 1-5".to_string(),
            cadence_label: "Diario 09:00".to_string(),
            last_run: Some("2024-05-13 09:00".to_string()),
            next_run: Some("2024-05-15 09:00".to_string()),
            status: ScheduledTaskStatus::Paused,
            owner: "People".to_string(),
            provider: Some(RemoteProviderKind::Anthropic),
            tags: vec!["comunicación".to_string(), "equipo".to_string()],
            enabled: false,
        },
    ]
}

fn default_automation_workflows() -> Vec<AutomationWorkflow> {
    vec![
        AutomationWorkflow {
            id: 1,
            name: "QA asistida por modelos".to_string(),
            description:
                "Encadena validación de tests, análisis de resultados y redacción de informe diario.".to_string(),
            trigger: WorkflowTriggerKind::ChatCommand,
            chat_command: Some("/qa".to_string()),
            linked_schedule: Some(3),
            status: WorkflowStatus::Ready,
            last_run: Some("2024-05-14 18:40".to_string()),
            pinned: true,
            steps: vec![
                WorkflowStep {
                    kind: WorkflowStepKind::RemoteModel,
                    label: "Análisis de cobertura con Claude Sonnet".to_string(),
                    detail: "Genera insights a partir del reporte junit".to_string(),
                    provider: Some(RemoteProviderKind::Anthropic),
                },
                WorkflowStep {
                    kind: WorkflowStepKind::LocalScript,
                    label: "./scripts/run_tests.sh".to_string(),
                    detail: "Ejecuta suites unitarias y de integración".to_string(),
                    provider: None,
                },
                WorkflowStep {
                    kind: WorkflowStepKind::SyncAction,
                    label: "Publicar resumen en Slack".to_string(),
                    detail: "Envía resultados al canal #qa con etiqueta diaria".to_string(),
                    provider: None,
                },
            ],
        },
        AutomationWorkflow {
            id: 2,
            name: "Resumen ejecutivo diario".to_string(),
            description:
                "Genera un briefing para dirección con métricas y próximos hitos.".to_string(),
            trigger: WorkflowTriggerKind::Scheduled,
            chat_command: Some("/briefing".to_string()),
            linked_schedule: Some(2),
            status: WorkflowStatus::Running,
            last_run: Some("2024-05-15 09:30".to_string()),
            pinned: true,
            steps: vec![
                WorkflowStep {
                    kind: WorkflowStepKind::RemoteModel,
                    label: "OpenAI GPT-4o".to_string(),
                    detail: "Sintetiza métricas y comentarios del día".to_string(),
                    provider: Some(RemoteProviderKind::OpenAi),
                },
                WorkflowStep {
                    kind: WorkflowStepKind::LocalScript,
                    label: "./scripts/render_briefing.py".to_string(),
                    detail: "Convierte el resumen en Markdown listo para enviar".to_string(),
                    provider: None,
                },
            ],
        },
        AutomationWorkflow {
            id: 3,
            name: "Sincronización RAG".to_string(),
            description:
                "Actualiza embeddings y repositorios de conocimiento para el agente contextual.".to_string(),
            trigger: WorkflowTriggerKind::EventListener,
            chat_command: None,
            linked_schedule: Some(4),
            status: WorkflowStatus::Failed,
            last_run: Some("2024-05-07 02:20".to_string()),
            pinned: false,
            steps: vec![
                WorkflowStep {
                    kind: WorkflowStepKind::LocalScript,
                    label: "jarvis index --refresh".to_string(),
                    detail: "Regenera embeddings en segundo plano".to_string(),
                    provider: None,
                },
                WorkflowStep {
                    kind: WorkflowStepKind::SyncAction,
                    label: "Actualizar dataset en S3".to_string(),
                    detail: "Sube el snapshot para el pipeline de producción".to_string(),
                    provider: None,
                },
            ],
        },
        AutomationWorkflow {
            id: 4,
            name: "Despliegue de emergencia".to_string(),
            description:
                "Pipeline manual para aplicar hotfixes coordinando CI/CD y notificaciones al equipo.".to_string(),
            trigger: WorkflowTriggerKind::Manual,
            chat_command: None,
            linked_schedule: None,
            status: WorkflowStatus::Draft,
            last_run: None,
            pinned: false,
            steps: vec![
                WorkflowStep {
                    kind: WorkflowStepKind::LocalScript,
                    label: "./scripts/build_hotfix.sh".to_string(),
                    detail: "Genera artefactos firmados listos para producción".to_string(),
                    provider: None,
                },
                WorkflowStep {
                    kind: WorkflowStepKind::SyncAction,
                    label: "Actualizar release en GitHub".to_string(),
                    detail: "Publica binarios y notifica al canal de incidencias".to_string(),
                    provider: None,
                },
            ],
        },
    ]
}

fn default_event_listeners() -> Vec<EventListener> {
    vec![
        EventListener {
            id: 1,
            name: "Crear issue desde TODO".to_string(),
            description:
                "Escucha mensajes con TODO y crea issues priorizados en GitHub automáticamente.".to_string(),
            event: ListenerEventKind::ChatMessage,
            condition: "message.contains('TODO:')".to_string(),
            action: "github.create_issue(label='automation')".to_string(),
            enabled: true,
            last_triggered: Some("2024-05-14 15:12".to_string()),
        },
        EventListener {
            id: 2,
            name: "Alertar fallos CI".to_string(),
            description:
                "Cuando llega un webhook de CI fallido se notifica al chat y se abre ticket en Linear.".to_string(),
            event: ListenerEventKind::GithubChange,
            condition: "payload.workflow_status == 'failure'".to_string(),
            action: "notify.chat + linear.create_issue".to_string(),
            enabled: true,
            last_triggered: Some("2024-05-13 21:48".to_string()),
        },
        EventListener {
            id: 3,
            name: "Cerrar recordatorios cumplidos".to_string(),
            description:
                "Al terminar un cron job de sincronización marca el recordatorio como enviado.".to_string(),
            event: ListenerEventKind::Scheduler,
            condition: "task.name == 'Recordatorio de standup'".to_string(),
            action: "reminders.mark_sent".to_string(),
            enabled: false,
            last_triggered: None,
        },
        EventListener {
            id: 4,
            name: "Auditar comandos sensibles".to_string(),
            description:
                "Tras ejecutar /deploy se registra un check en CI y se notifica a seguridad.".to_string(),
            event: ListenerEventKind::CommandExecution,
            condition: "command.name == '/deploy'".to_string(),
            action: "ci.trigger_check + notify.security".to_string(),
            enabled: true,
            last_triggered: Some("2024-05-12 11:02".to_string()),
        },
    ]
}

fn default_scheduled_reminders() -> Vec<ScheduledReminder> {
    vec![
        ScheduledReminder {
            id: 1,
            title: "Standup remoto".to_string(),
            cadence: "Diario 09:00".to_string(),
            next_trigger: "2024-05-15 09:00".to_string(),
            audience: "Equipo core".to_string(),
            delivery_channel: "Chat interno".to_string(),
            status: ReminderStatus::Scheduled,
        },
        ScheduledReminder {
            id: 2,
            title: "Recordatorio retrospectiva".to_string(),
            cadence: "Viernes 16:30".to_string(),
            next_trigger: "2024-05-17 16:30".to_string(),
            audience: "Ingeniería".to_string(),
            delivery_channel: "Correo".to_string(),
            status: ReminderStatus::Snoozed,
        },
        ScheduledReminder {
            id: 3,
            title: "Cierre de sprint".to_string(),
            cadence: "Cada 2 semanas".to_string(),
            next_trigger: "2024-05-24 12:00".to_string(),
            audience: "PMs".to_string(),
            delivery_channel: "Notificación en app".to_string(),
            status: ReminderStatus::Sent,
        },
    ]
}

fn default_external_integrations() -> Vec<ExternalIntegrationCard> {
    vec![
        ExternalIntegrationCard {
            id: 1,
            service: ExternalServiceKind::Gmail,
            name: "Gmail · bandeja prioritaria".to_string(),
            status: IntegrationStatus::Connected,
            status_detail: "OAuth renovado hace 2 días".to_string(),
            last_event: Some("2024-05-15 08:10 Sincronizó 3 threads".to_string()),
            next_sync: Some("En 5 min".to_string()),
            quick_actions: vec!["Ver bandeja".to_string(), "Resumir hilo".to_string()],
            metadata: vec![
                "Auto-resumen diario activado".to_string(),
                "Filtros: founders@, priority@".to_string(),
            ],
        },
        ExternalIntegrationCard {
            id: 2,
            service: ExternalServiceKind::GoogleCalendar,
            name: "Google Calendar · agenda del equipo".to_string(),
            status: IntegrationStatus::Syncing,
            status_detail: "Sincronizando próximos 30 eventos".to_string(),
            last_event: Some("2024-05-15 07:45 Actualizó workshop UX".to_string()),
            next_sync: Some("En curso".to_string()),
            quick_actions: vec![
                "Crear evento".to_string(),
                "Enviar resumen diario".to_string(),
            ],
            metadata: vec![
                "Acceso delegado por ops@company".to_string(),
                "Recordatorios push en chat".to_string(),
            ],
        },
        ExternalIntegrationCard {
            id: 3,
            service: ExternalServiceKind::GithubWebhooks,
            name: "GitHub · jungle/monk-ai".to_string(),
            status: IntegrationStatus::Warning,
            status_detail: "Webhook de CI tardando >5s".to_string(),
            last_event: Some("2024-05-15 06:32 Build #482".to_string()),
            next_sync: Some("Escuchando".to_string()),
            quick_actions: vec![
                "Ver últimas builds".to_string(),
                "Reenviar webhook".to_string(),
            ],
            metadata: vec![
                "Merge rápido habilitado".to_string(),
                "Asignación automática a reviewers".to_string(),
            ],
        },
        ExternalIntegrationCard {
            id: 4,
            service: ExternalServiceKind::Ifttt,
            name: "IFTTT · workflows compartidos".to_string(),
            status: IntegrationStatus::Connected,
            status_detail: "5 applets sincronizados".to_string(),
            last_event: Some("2024-05-14 20:05 Zapier › Actualizó hoja de status".to_string()),
            next_sync: Some("Cada 15 min".to_string()),
            quick_actions: vec![
                "Publicar como trigger".to_string(),
                "Compartir enlace".to_string(),
            ],
            metadata: vec![
                "Expone workflows locales como acciones".to_string(),
                "Conectado a Notion y Asana".to_string(),
            ],
        },
        ExternalIntegrationCard {
            id: 5,
            service: ExternalServiceKind::TaskManager,
            name: "Linear · Jira · Trello".to_string(),
            status: IntegrationStatus::Connected,
            status_detail: "Sincronización bidireccional activa".to_string(),
            last_event: Some("2024-05-15 09:05 Actualizó ticket LNR-431".to_string()),
            next_sync: Some("Cada 3 min".to_string()),
            quick_actions: vec!["Ver tareas".to_string(), "Sincronizar ahora".to_string()],
            metadata: vec![
                "Linear ↔️ estado en tiempo real".to_string(),
                "Comentarios espejados con Jira".to_string(),
                "Tableros Trello etiquetados".to_string(),
            ],
        },
        ExternalIntegrationCard {
            id: 6,
            service: ExternalServiceKind::CiCd,
            name: "CircleCI · pipeline principal".to_string(),
            status: IntegrationStatus::Error,
            status_detail: "Build #512 falló por pruebas end-to-end".to_string(),
            last_event: Some("2024-05-15 08:42 Deploy detenido".to_string()),
            next_sync: Some("Esperando acción".to_string()),
            quick_actions: vec![
                "Reintentar build".to_string(),
                "Abrir en CircleCI".to_string(),
            ],
            metadata: vec![
                "Workflows expuestos vía webhooks".to_string(),
                "Variables protegidas cargadas".to_string(),
            ],
        },
    ]
}

fn default_project_resources() -> Vec<ProjectResourceCard> {
    vec![
        ProjectResourceCard {
            name: "Workspace · Automation".to_string(),
            kind: ProjectResourceKind::LocalProject,
            location: "/workspace/projects/automation".to_string(),
            last_sync: "Hace 12 min".to_string(),
            status: SyncStatus::new(
                "Actualizado",
                "Sin cambios pendientes",
                SyncHealth::Healthy,
            ),
            readme_preview: "# Automation\nScripts para pipelines QA, builds nocturnos y despliegues sandbox.".to_string(),
            tags: vec!["python".to_string(), "qa".to_string(), "deploy".to_string()],
            pending_actions: vec!["Ejecutar pipeline nocturno".to_string()],
            default_branch: "main".to_string(),
        },
        ProjectResourceCard {
            name: "Workspace · RAG Notebook".to_string(),
            kind: ProjectResourceKind::LocalProject,
            location: "/workspace/projects/rag".to_string(),
            last_sync: "Hace 45 min".to_string(),
            status: SyncStatus::new(
                "Cambios locales",
                "2 commits por subir",
                SyncHealth::Warning,
            ),
            readme_preview:
                "# RAG Notebook\nExperimentos con embeddings y evaluación de respuestas contextuales.".to_string(),
            tags: vec!["rust".to_string(), "llm".to_string()],
            pending_actions: vec!["Enviar PR a repositorio remoto".to_string()],
            default_branch: "develop".to_string(),
        },
        ProjectResourceCard {
            name: "github.com/jungle/agent-orchestrator".to_string(),
            kind: ProjectResourceKind::GithubRepository,
            location: "https://github.com/jungle/agent-orchestrator".to_string(),
            last_sync: "Hace 3 h".to_string(),
            status: SyncStatus::new(
                "Divergencia leve",
                "1 PR pendiente de merge",
                SyncHealth::Warning,
            ),
            readme_preview:
                "# Agent Orchestrator\nMicroservicio que coordina workflows y listeners para JungleMonkAI.".to_string(),
            tags: vec!["github".to_string(), "rust".to_string(), "orchestration".to_string()],
            pending_actions: vec!["Revisar PR #128".to_string(), "Actualizar documentación".to_string()],
            default_branch: "main".to_string(),
        },
        ProjectResourceCard {
            name: "github.com/jungle/ops-playbooks".to_string(),
            kind: ProjectResourceKind::GithubRepository,
            location: "https://github.com/jungle/ops-playbooks".to_string(),
            last_sync: "Hace 1 día".to_string(),
            status: SyncStatus::new(
                "Error autenticación",
                "Token caducará en 24 h",
                SyncHealth::Error,
            ),
            readme_preview:
                "# Ops Playbooks\nColección de guías de respuesta e incidentes automatizados.".to_string(),
            tags: vec!["incident-response".to_string(), "docs".to_string()],
            pending_actions: vec!["Renovar token GitHub".to_string()],
            default_branch: "main".to_string(),
        },
    ]
}

fn default_global_search_recent() -> Vec<String> {
    vec![
        "model:claude opus".to_string(),
        "workflow qa".to_string(),
        "preferencias memoria".to_string(),
        "README orchestrator".to_string(),
    ]
}

fn default_debug_console_entries() -> Vec<DebugLogEntry> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    vec![
        DebugLogEntry {
            level: DebugLogLevel::Info,
            component: "runtime::bootstrap".to_string(),
            message: "Aplicación inicializada, cargando configuración desde jungle.toml"
                .to_string(),
            timestamp: now.clone(),
        },
        DebugLogEntry {
            level: DebugLogLevel::Warning,
            component: "providers::anthropic".to_string(),
            message: "API key cercana a expirar, renueva credenciales en 3 días".to_string(),
            timestamp: now.clone(),
        },
        DebugLogEntry {
            level: DebugLogLevel::Error,
            component: "jarvis::runtime".to_string(),
            message: "Fallo al montar /models: permisos insuficientes".to_string(),
            timestamp: now,
        },
    ]
}

/// Contiene el estado global de la aplicación.
pub struct AppState {
    /// Controla la visibilidad de la ventana modal de configuración.
    pub show_settings_modal: bool,
    /// Texto del buscador en el header.
    pub search_buffer: String,
    /// Estado del chat multimodal.
    pub chat: ChatState,
    /// Configuración de la aplicación.
    pub config: AppConfig, // New field
    /// Tokens visuales que definen paletas, espaciados y radios.
    pub theme: ThemeTokens,
    /// Fuentes registradas en egui (iconos, tipografías personalizadas, etc.).
    pub font_sources: Vec<FontSource>,
    /// Vista principal activa (chat, recursos o panel de preferencias).
    pub active_main_view: MainView,
    /// Tab principal activo dentro del contenedor central.
    pub active_main_tab: MainTab,
    /// Panel de preferencias actualmente seleccionado.
    pub selected_preference: PreferencePanel,
    /// Índice de tab activo por panel de preferencias.
    pub preference_tabs: HashMap<PreferencePanel, usize>,
    /// Estado del explorador de recursos y catálogos.
    pub resources: ResourceState,
    /// Token de acceso personal de GitHub.
    pub github_token: String,
    /// Nombre de usuario autenticado en GitHub.
    pub github_username: Option<String>,
    /// Repositorios disponibles para sincronizar.
    pub github_repositories: Vec<String>,
    /// Índice del repositorio seleccionado.
    pub selected_github_repo: Option<usize>,
    /// Mensaje de estado tras intentar conectar con GitHub.
    pub github_connection_status: Option<String>,
    /// Ruta base donde se almacena la caché.
    pub cache_directory: String,
    /// Límite máximo de caché en GB.
    pub cache_size_limit_gb: f32,
    /// Habilita la limpieza automática de caché.
    pub enable_auto_cleanup: bool,
    /// Intervalo en horas entre limpiezas automáticas.
    pub cache_cleanup_interval_hours: u32,
    /// Registro del último mensaje de limpieza manual.
    pub last_cache_cleanup: Option<String>,
    /// Límite de memoria en GB para la caché.
    pub resource_memory_limit_gb: f32,
    /// Límite de disco en GB para la caché.
    pub resource_disk_limit_gb: f32,
    /// Registro centralizado de comandos declarados por los módulos.
    pub command_registry: CommandRegistry,
    /// Registro de vistas disponibles en el panel principal.
    pub workbench_views: HashMap<MainView, Box<dyn WorkbenchView>>,
    /// Inicializadores dinámicos para registrar vistas externas en el workbench.
    pub workbench_initializers: Vec<Box<dyn Fn(&mut WorkbenchRegistry)>>,
    /// Indica si se almacena memoria de contexto.
    pub enable_memory_tracking: bool,
    /// Días que se conserva la memoria contextual.
    pub memory_retention_days: u32,
    /// Perfiles configurados.
    pub profiles: Vec<String>,
    /// Perfil actualmente seleccionado.
    pub selected_profile: Option<usize>,
    /// Proyectos configurados.
    pub projects: Vec<String>,
    /// Proyecto actualmente seleccionado.
    pub selected_project: Option<usize>,
    /// Preferencias de enrutamiento por hilo en el chat (obsoleto, se mantiene para compatibilidad).
    pub chat_routing: ChatRoutingState,
    /// Registro centralizado de secciones y nodos de navegación.
    pub navigation: NavigationRegistry,
    /// Configuración de layout para los paneles del shell.
    pub layout: LayoutConfig,
    /// Estado de automatizaciones y cron jobs.
    pub automation: AutomationState,
    /// Consola de depuración del sistema.
    pub debug_console: DebugConsoleState,
    /// Consultas recientes en el buscador global.
    pub global_search_recent: Vec<String>,
}

impl Default for AppState {
    fn default() -> Self {
        let config = AppConfig::load_or_default();

        let mut profiles = if config.profiles.is_empty() {
            vec![
                "Default".to_string(),
                "Research".to_string(),
                "Operations".to_string(),
            ]
        } else {
            config.profiles.clone()
        };

        if profiles.is_empty() {
            profiles.push("Default".to_string());
        }

        let mut projects = if config.projects.is_empty() {
            vec!["Autonomous Agent".to_string(), "RAG Pipeline".to_string()]
        } else {
            config.projects.clone()
        };

        if projects.is_empty() {
            projects.push("Autonomous Agent".to_string());
        }

        let selected_profile = config
            .selected_profile
            .filter(|idx| profiles.get(*idx).is_some())
            .or(Some(0));
        let selected_project = config
            .selected_project
            .filter(|idx| projects.get(*idx).is_some())
            .or(Some(0));

        let chat = ChatState::from_config(&config);
        let automation = AutomationState::from_config(&config);
        let mut resources = ResourceState::from_config(&config, &profiles, &projects);
        resources.ensure_library_selection();
        let chat_routing = ChatRoutingState::default();
        let global_search_recent = default_global_search_recent();

        let theme_preset = config.theme;

        let mut state = Self {
            show_settings_modal: false,
            search_buffer: String::new(),
            chat,
            config: config.clone(),
            theme: ThemeTokens::from_preset(theme_preset),
            font_sources: theme::default_font_sources(),
            active_main_view: MainView::default(),
            active_main_tab: MainTab::default(),
            selected_preference: PreferencePanel::default(),
            preference_tabs: HashMap::new(),
            resources,
            github_token: config.github_token.clone().unwrap_or_default(),
            github_username: None,
            github_repositories: Vec::new(),
            selected_github_repo: None,
            github_connection_status: None,
            cache_directory: config.cache_directory.clone(),
            cache_size_limit_gb: config.cache_size_limit_gb,
            enable_auto_cleanup: config.enable_auto_cleanup,
            cache_cleanup_interval_hours: config.cache_cleanup_interval_hours,
            last_cache_cleanup: None,
            resource_memory_limit_gb: config.resource_memory_limit_gb,
            resource_disk_limit_gb: config.resource_disk_limit_gb,
            command_registry: CommandRegistry::default(),
            workbench_views: HashMap::new(),
            workbench_initializers: Vec::new(),
            enable_memory_tracking: config.enable_memory_tracking,
            memory_retention_days: config.memory_retention_days,
            profiles,
            selected_profile,
            projects,
            selected_project,
            chat_routing,
            navigation: build_navigation_registry(&config),
            layout: LayoutConfig::default(),
            automation,
            debug_console: DebugConsoleState::with_entries(default_debug_console_entries()),
            global_search_recent,
        };

        if state.resources.jarvis_auto_start {
            match state.ensure_jarvis_runtime() {
                Ok(runtime) => {
                    state.resources.jarvis_status = Some(format!(
                        "Jarvis iniciado con el modelo {}.",
                        runtime.model_label()
                    ));
                }
                Err(err) => {
                    state.resources.jarvis_status = Some(format!(
                        "No se pudo iniciar Jarvis automáticamente: {}",
                        err
                    ));
                }
            }
        }

        state.refresh_personalization_resources();
        state.rebuild_navigation();
        state.rebuild_command_registry();
        state.rebuild_workbench_views();

        state
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChatMessageStatus {
    Normal,
    Pending,
}

impl Default for ChatMessageStatus {
    fn default() -> Self {
        ChatMessageStatus::Normal
    }
}

#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub sender: String,
    pub text: String,
    pub timestamp: String,
    pub status: ChatMessageStatus,
}

impl ChatMessage {
    pub fn new(sender: impl Into<String>, text: impl Into<String>) -> Self {
        ChatMessage {
            sender: sender.into(),
            text: text.into(),
            timestamp: Local::now().format("%H:%M:%S").to_string(),
            status: ChatMessageStatus::Normal,
        }
    }

    pub fn system(text: impl Into<String>) -> Self {
        Self::new("System", text)
    }

    pub fn user(text: impl Into<String>) -> Self {
        Self::new("User", text)
    }

    pub fn pending(sender: impl Into<String>, text: impl Into<String>) -> Self {
        ChatMessage {
            sender: sender.into(),
            text: text.into(),
            timestamp: Local::now().format("%H:%M:%S").to_string(),
            status: ChatMessageStatus::Pending,
        }
    }

    pub fn is_pending(&self) -> bool {
        self.status == ChatMessageStatus::Pending
    }
}

impl Default for ChatMessage {
    fn default() -> Self {
        ChatMessage::system("Welcome to Multimodal Agent!")
    }
}

pub const MAX_COMMAND_DEPTH: usize = 5;

#[derive(Clone, Debug)]
pub(crate) struct PendingProviderCall {
    id: u64,
    provider_kind: RemoteProviderKind,
    provider_name: String,
    alias: String,
    model: String,
    message_index: usize,
}

#[derive(Debug)]
pub(crate) struct ProviderResponse {
    id: u64,
    outcome: std::result::Result<String, String>,
}

#[derive(Clone, Debug, Default)]
pub struct CommandInvocation {
    pub raw: String,
    pub name: String,
    pub args: BTreeMap<String, String>,
    pub flags: BTreeSet<String>,
    pub positional: Vec<String>,
}

impl CommandInvocation {
    pub fn parse(input: &str) -> Self {
        let mut invocation = CommandInvocation {
            raw: input.trim().to_string(),
            ..Default::default()
        };

        let mut tokens = input.split_whitespace();
        if let Some(first) = tokens.next() {
            invocation.name = first.to_string();
        } else {
            return invocation;
        }

        for token in tokens {
            if token.starts_with("--") {
                let stripped = &token[2..];
                if let Some((key, value)) = stripped.split_once('=') {
                    invocation.args.insert(key.to_string(), value.to_string());
                } else {
                    invocation.flags.insert(stripped.to_string());
                }
            } else if let Some((key, value)) = token.split_once('=') {
                invocation.args.insert(key.to_string(), value.to_string());
            } else {
                invocation.positional.push(token.to_string());
            }
        }

        invocation
    }

    pub fn arg(&self, key: &str) -> Option<&str> {
        self.args.get(key).map(|s| s.as_str())
    }

    pub fn flag(&self, key: &str) -> bool {
        self.flags.contains(key)
    }
}

pub struct CommandOutcome {
    pub messages: Vec<String>,
}

impl CommandOutcome {
    pub fn single(message: String) -> Self {
        CommandOutcome {
            messages: vec![message],
        }
    }
}

pub struct CommandDocumentation {
    pub signature: &'static str,
    pub summary: &'static str,
    pub parameters: &'static [&'static str],
    pub examples: &'static [&'static str],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogStatus {
    Ok,
    Warning,
    Error,
    Running,
}

#[derive(Clone, Debug)]
pub struct LogEntry {
    pub status: LogStatus,
    pub source: String,
    pub message: String,
    pub timestamp: String,
}

impl CustomCommandAction {
    pub fn documentation(self) -> CommandDocumentation {
        match self {
            CustomCommandAction::ShowCurrentTime => CommandDocumentation {
                signature: "showCurrentTime(format=human)",
                summary: "Muestra la hora actual con distintos formatos de salida.",
                parameters: &["format → human | 24 | iso"],
                examples: &["/time", "/time --format=24", "/time format=iso"],
            },
            CustomCommandAction::ShowSystemStatus => CommandDocumentation {
                signature: "showSystemStatus(detail=summary)",
                summary: "Resume el estado del sistema y permite profundizar en recursos concretos.",
                parameters: &[
                    "detail → summary | memory | disk | cache",
                    "verbose → flag que incluye notas adicionales",
                ],
                examples: &["/status", "/status --detail=memory --verbose"],
            },
            CustomCommandAction::ShowSystemDiagnostics => CommandDocumentation {
                signature: "showSystemDiagnostics(section=all)",
                summary: "Genera un informe de depuración con estados detallados de cada componente.",
                parameters: &[
                    "section → all | general | remote | local | commands | logs",
                    "focus → sinónimo de section",
                ],
                examples: &["/system debug", "/system debug section=remote"],
            },
            CustomCommandAction::ShowUsageStatistics => CommandDocumentation {
                signature: "showUsageStatistics(window=session)",
                summary: "Entrega estadísticas de uso y métricas de comandos.",
                parameters: &[
                    "window → session | day | week",
                    "include → commands | messages (separar con comas)",
                ],
                examples: &["/stats", "/stats include=commands,messages"],
            },
            CustomCommandAction::ListActiveProjects => CommandDocumentation {
                signature: "listActiveProjects(limit=all)",
                summary: "Lista los proyectos activos y permite limitar la salida.",
                parameters: &["limit → número máximo de proyectos"],
                examples: &["/projects", "/projects --limit=1"],
            },
            CustomCommandAction::ListConfiguredProfiles => CommandDocumentation {
                signature: "listConfiguredProfiles(sort=asc)",
                summary: "Muestra los perfiles configurados con orden opcional.",
                parameters: &["sort → asc | desc"],
                examples: &["/profiles", "/profiles --sort=desc"],
            },
            CustomCommandAction::ShowCacheConfiguration => CommandDocumentation {
                signature: "showCacheConfiguration(include=limits)",
                summary: "Describe la configuración actual de la caché del agente.",
                parameters: &["include → limits | schedule | path (separar con comas)"],
                examples: &["/cache", "/cache --include=limits,schedule"],
            },
            CustomCommandAction::ListAvailableModels => CommandDocumentation {
                signature: "listAvailableModels(provider=all)",
                summary: "Lista los modelos disponibles filtrando por proveedor si se desea.",
                parameters: &["provider → openai | anthropic | groq | jarvis | huggingface"],
                examples: &["/models", "/models provider=openai"],
            },
            CustomCommandAction::ShowGithubSummary => CommandDocumentation {
                signature: "showGithubSummary(include=repos)",
                summary: "Entrega un resumen de la conexión con GitHub y opcionalmente los repositorios.",
                parameters: &["include → repos (muestra la lista completa)"],
                examples: &["/github", "/github --include=repos"],
            },
            CustomCommandAction::ShowMemorySettings => CommandDocumentation {
                signature: "showMemorySettings(detail=summary)",
                summary: "Explica la configuración de memoria contextual.",
                parameters: &["detail → summary | retention"],
                examples: &["/memory", "/memory detail=retention"],
            },
            CustomCommandAction::ShowActiveProviders => CommandDocumentation {
                signature: "showActiveProviders(include=models)",
                summary: "Lista los proveedores activos con información opcional de modelos.",
                parameters: &["include → models | status"],
                examples: &["/providers", "/providers --include=models"],
            },
            CustomCommandAction::ShowJarvisStatus => CommandDocumentation {
                signature: "showJarvisStatus(detail=summary)",
                summary: "Describe el estado del runtime local Jarvis con posibilidad de ver rutas y logs.",
                parameters: &["detail → summary | path | logs"],
                examples: &["/jarvis", "/jarvis detail=path"],
            },
            CustomCommandAction::ShowCommandHelp => CommandDocumentation {
                signature: "showCommandHelp(mode=all)",
                summary: "Lista todos los comandos disponibles y su propósito.",
                parameters: &["mode → all | builtins | custom"],
                examples: &["/help", "/help mode=custom"],
            },
        }
    }
}

impl AppState {
    pub fn navigation_registry(&self) -> &NavigationRegistry {
        &self.navigation
    }

    pub fn navigation_registry_mut(&mut self) -> &mut NavigationRegistry {
        &mut self.navigation
    }

    pub fn activate_navigation_target(&mut self, target: NavigationTarget) {
        match target {
            NavigationTarget::Main { view, tab } => {
                if let Some(tab) = tab.or_else(|| MainTab::from_view(view)) {
                    self.set_active_tab(tab);
                } else {
                    self.active_main_view = view;
                    self.sync_active_tab_from_view();
                }
            }
            NavigationTarget::Preference(panel) => {
                self.selected_preference = panel;
                self.resources.selected_resource = None;
                self.active_main_view = MainView::Preferences;
                self.sync_active_tab_from_view();
            }
            NavigationTarget::Resource(section) => {
                self.resources.selected_resource = Some(section);
                self.active_main_view = MainView::ResourceBrowser;
                self.sync_active_tab_from_view();
            }
        }
    }

    pub fn activate_navigation_node(&mut self, node_id: &str) -> bool {
        if let Some(node) = self.navigation.node(node_id) {
            self.activate_navigation_target(node.target);
            true
        } else {
            false
        }
    }

    pub fn is_navigation_target_active(&self, target: NavigationTarget) -> bool {
        match target {
            NavigationTarget::Main { view, .. } => self.active_main_view == view,
            NavigationTarget::Preference(panel) => {
                self.active_main_view == MainView::Preferences && self.selected_preference == panel
            }
            NavigationTarget::Resource(section) => {
                self.active_main_view == MainView::ResourceBrowser
                    && self.resources.selected_resource == Some(section)
            }
        }
    }

    pub fn set_theme_preset(&mut self, preset: ThemePreset) {
        if self.config.theme != preset {
            self.config.theme = preset;
        }
        self.theme = ThemeTokens::from_preset(preset);
    }

    pub fn set_active_tab(&mut self, tab: MainTab) {
        self.active_main_tab = tab;
        self.active_main_view = tab.into();
    }

    pub fn sync_active_tab_from_view(&mut self) {
        if let Some(tab) = MainTab::from_view(self.active_main_view) {
            self.active_main_tab = tab;
        }
    }

    pub fn global_search_groups(&self) -> Vec<GlobalSearchGroup> {
        let query = self.search_buffer.trim().to_lowercase();
        let mut groups = Vec::new();

        if query.is_empty() && !self.global_search_recent.is_empty() {
            let results = self
                .global_search_recent
                .iter()
                .map(|entry| GlobalSearchResult {
                    title: entry.clone(),
                    subtitle: "Búsqueda reciente".to_string(),
                    action_hint: "Pulsa Enter para repetir".to_string(),
                })
                .collect();
            groups.push(GlobalSearchGroup {
                title: "Recientes".to_string(),
                results,
            });
        }

        let mut model_results = Vec::new();
        for (provider, cards) in &self.resources.remote_catalog.provider_cards {
            for card in cards {
                let haystack = format!(
                    "{} {} {} {}",
                    card.title,
                    card.description,
                    card.tags.join(" "),
                    card.capabilities.join(" ")
                )
                .to_lowercase();
                if query.is_empty() || haystack.contains(&query) {
                    model_results.push(GlobalSearchResult {
                        title: format!("{}", card.title),
                        subtitle: format!(
                            "{} · Contexto {} tokens",
                            provider.display_name(),
                            card.context_tokens
                        ),
                        action_hint: format!("Abrir catálogo {}", provider.display_name()),
                    });
                }
            }
        }
        if !model_results.is_empty() {
            model_results.truncate(5);
            groups.push(GlobalSearchGroup {
                title: "Modelos".to_string(),
                results: model_results,
            });
        }

        let mut conversation_results = Vec::new();
        for message in self.chat.messages.iter().rev().take(12) {
            let haystack = format!("{} {}", message.sender, message.text).to_lowercase();
            if query.is_empty() || haystack.contains(&query) {
                let mut preview = message.text.clone();
                if preview.len() > 96 {
                    preview.truncate(93);
                    preview.push_str("...");
                }
                conversation_results.push(GlobalSearchResult {
                    title: preview,
                    subtitle: format!("{} · {}", message.sender, message.timestamp),
                    action_hint: "Ir al historial de chat".to_string(),
                });
            }
        }
        if !conversation_results.is_empty() {
            conversation_results.truncate(6);
            groups.push(GlobalSearchGroup {
                title: "Conversaciones".to_string(),
                results: conversation_results,
            });
        }

        let preference_panels = [
            PreferencePanel::SystemGithub,
            PreferencePanel::SystemCache,
            PreferencePanel::SystemResources,
            PreferencePanel::CustomizationCommands,
            PreferencePanel::CustomizationAppearance,
            PreferencePanel::CustomizationMemory,
            PreferencePanel::CustomizationProfiles,
            PreferencePanel::CustomizationProjects,
            PreferencePanel::ProvidersAnthropic,
            PreferencePanel::ProvidersOpenAi,
            PreferencePanel::ProvidersGroq,
            PreferencePanel::LocalJarvis,
        ];

        let mut preference_results = Vec::new();
        for panel in preference_panels {
            let metadata = panel.metadata();
            let haystack = format!("{} {}", metadata.title, metadata.description).to_lowercase();
            if query.is_empty() || haystack.contains(&query) {
                preference_results.push(GlobalSearchResult {
                    title: metadata.title.to_string(),
                    subtitle: metadata.description.to_string(),
                    action_hint: "Abrir preferencias".to_string(),
                });
            }
        }
        if !preference_results.is_empty() {
            preference_results.truncate(6);
            groups.push(GlobalSearchGroup {
                title: "Preferencias".to_string(),
                results: preference_results,
            });
        }

        let mut document_results = Vec::new();
        for card in &self.resources.project_resources {
            let haystack = format!(
                "{} {} {}",
                card.name,
                card.readme_preview,
                card.tags.join(" ")
            )
            .to_lowercase();
            if query.is_empty() || haystack.contains(&query) {
                document_results.push(GlobalSearchResult {
                    title: card.name.clone(),
                    subtitle: format!("{} · {}", card.kind.label(), card.status.label()),
                    action_hint: "Abrir recurso".to_string(),
                });
            }
        }
        if !document_results.is_empty() {
            document_results.truncate(6);
            groups.push(GlobalSearchGroup {
                title: "Documentos y recursos".to_string(),
                results: document_results,
            });
        }

        let mut workflow_results = Vec::new();
        for workflow in &self.automation.workflows.workflows {
            let haystack = format!("{} {}", workflow.name, workflow.description).to_lowercase();
            if query.is_empty() || haystack.contains(&query) {
                let command_hint = workflow
                    .chat_command
                    .as_ref()
                    .map(|cmd| format!("Ejecutar {}", cmd))
                    .unwrap_or_else(|| "Iniciar workflow".to_string());
                let last_run = workflow
                    .last_run
                    .as_ref()
                    .map(|value| value.as_str())
                    .unwrap_or("sin registros");
                workflow_results.push(GlobalSearchResult {
                    title: workflow.name.clone(),
                    subtitle: format!(
                        "{} · Última ejecución {}",
                        workflow.trigger.label(),
                        last_run
                    ),
                    action_hint: command_hint,
                });
            }
        }
        if !workflow_results.is_empty() {
            workflow_results.truncate(6);
            groups.push(GlobalSearchGroup {
                title: "Workflows".to_string(),
                results: workflow_results,
            });
        }

        groups
    }

    pub fn trigger_workflow(&mut self, workflow_id: u32) -> Option<String> {
        if let Some(workflow) = self
            .automation
            .workflows
            .workflows
            .iter_mut()
            .find(|wf| wf.id == workflow_id)
        {
            workflow.status = WorkflowStatus::Running;
            let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            workflow.last_run = Some(timestamp.clone());
            let message = format!("Workflow '{}' lanzado.", workflow.name);
            self.push_activity_log(LogStatus::Running, "Automation", &message);
            self.push_debug_event(
                DebugLogLevel::Info,
                "automation::workflow",
                format!("{} ({})", message, timestamp),
            );
            Some(message)
        } else {
            None
        }
    }

    pub fn toggle_listener_enabled(&mut self, listener_id: u32) -> Option<bool> {
        let mut result = None;
        let mut message = None;

        if let Some(listener) = self
            .automation
            .event_automation
            .listeners
            .iter_mut()
            .find(|entry| entry.id == listener_id)
        {
            listener.enabled = !listener.enabled;
            let status_label = if listener.enabled {
                "habilitado"
            } else {
                "deshabilitado"
            };
            message = Some(format!("Listener '{}' {}", listener.name, status_label));
            result = Some(listener.enabled);
        }

        if let Some(msg) = message {
            self.push_activity_log(LogStatus::Ok, "Automation", &msg);
        }

        result
    }

    pub(crate) fn push_activity_log(
        &mut self,
        status: LogStatus,
        source: impl Into<String>,
        message: impl Into<String>,
    ) {
        let entry = LogEntry {
            status,
            source: source.into(),
            message: message.into(),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };

        self.automation.activity_logs.push(entry);
        const MAX_ACTIVITY_LOGS: usize = 200;
        if self.automation.activity_logs.len() > MAX_ACTIVITY_LOGS {
            let overflow = self.automation.activity_logs.len() - MAX_ACTIVITY_LOGS;
            self.automation.activity_logs.drain(0..overflow);
        }
    }

    pub fn push_debug_event(
        &mut self,
        level: DebugLogLevel,
        component: impl Into<String>,
        message: impl Into<String>,
    ) {
        self.debug_console.push_entry(level, component, message);
    }

    pub fn activate_jarvis_model(&mut self, identifier: &LocalModelIdentifier) -> String {
        self.resources.jarvis_selected_provider = identifier.provider;
        self.resources.jarvis_active_model = Some(identifier.clone());
        self.resources.jarvis_runtime = None;

        let install_path = self
            .installed_model(identifier)
            .map(|record| record.install_path.clone())
            .filter(|path| !path.trim().is_empty())
            .unwrap_or_else(|| {
                Path::new(&self.resources.jarvis_install_dir)
                    .join(identifier.sanitized_dir_name())
                    .display()
                    .to_string()
            });

        self.resources.jarvis_model_path = install_path.clone();

        let mut status = format!(
            "Modelo '{}' seleccionado para Jarvis.",
            identifier.display_label()
        );

        self.push_activity_log(
            LogStatus::Ok,
            "Jarvis",
            format!(
                "Modelo '{}' configurado como activo.",
                identifier.display_label()
            ),
        );

        if self.resources.jarvis_auto_start {
            match self.ensure_jarvis_runtime() {
                Ok(runtime) => {
                    let label = runtime.model_label();
                    status.push_str(&format!(" Jarvis se recargó con {}.", label));
                    self.push_activity_log(
                        LogStatus::Ok,
                        "Jarvis",
                        format!(
                            "Jarvis cargó {} tras activar {}.",
                            label,
                            identifier.display_label()
                        ),
                    );
                }
                Err(err) => {
                    status.push_str(&format!(
                        " No se pudo iniciar Jarvis automáticamente: {}.",
                        err
                    ));
                    self.push_activity_log(
                        LogStatus::Error,
                        "Jarvis",
                        format!(
                            "El autoarranque falló tras activar '{}': {}",
                            identifier.display_label(),
                            err
                        ),
                    );
                }
            }
        }

        self.resources.jarvis_status = Some(status.clone());
        self.persist_config();
        status
    }

    pub fn deactivate_jarvis_model(&mut self) -> String {
        self.resources.jarvis_active_model = None;
        self.resources.jarvis_runtime = None;
        self.resources.jarvis_model_path.clear();

        let status = "Jarvis quedó sin modelo activo.".to_string();
        self.resources.jarvis_status = Some(status.clone());
        self.push_activity_log(LogStatus::Ok, "Jarvis", &status);
        self.persist_config();
        status
    }

    pub fn uninstall_local_model(&mut self, identifier: &LocalModelIdentifier) -> Option<String> {
        if let Some(position) = self
            .resources
            .installed_local_models
            .iter()
            .position(|model| {
                model.identifier.provider == identifier.provider
                    && model.identifier.model_id == identifier.model_id
            })
        {
            let removed = self.resources.installed_local_models.remove(position);
            if self
                .resources
                .jarvis_active_model
                .as_ref()
                .map(|active| {
                    active.provider == identifier.provider && active.model_id == identifier.model_id
                })
                .unwrap_or(false)
            {
                self.resources.jarvis_active_model = None;
                self.resources.jarvis_runtime = None;
            }
            self.persist_config();
            let label = removed.identifier.display_label();
            let status = format!("Modelo '{}' eliminado de la biblioteca local.", label);
            self.push_activity_log(LogStatus::Warning, "Jarvis", status.clone());
            Some(status)
        } else {
            None
        }
    }

    pub fn mark_local_model_updated(
        &mut self,
        identifier: &LocalModelIdentifier,
    ) -> Option<String> {
        if let Some(entry) = self
            .resources
            .installed_local_models
            .iter_mut()
            .find(|model| {
                model.identifier.provider == identifier.provider
                    && model.identifier.model_id == identifier.model_id
            })
        {
            entry.installed_at = Utc::now();
            self.persist_config();
            let message = format!(
                "Modelo '{}' actualizado correctamente.",
                identifier.display_label()
            );
            self.push_activity_log(LogStatus::Ok, "Jarvis", message.clone());
            Some(message)
        } else {
            None
        }
    }

    pub fn queue_huggingface_install(
        &mut self,
        model: LocalModelCard,
        token: Option<String>,
    ) -> bool {
        let provider = model.provider;
        if self
            .chat
            .pending_local_installs
            .iter()
            .any(|pending| pending.provider == provider && pending.model_id == model.id)
        {
            return false;
        }

        let sanitized_status = format!("Descargando '{}' desde Hugging Face…", model.id);
        self.provider_state_mut(provider).install_status = Some(sanitized_status.clone());
        self.push_activity_log(LogStatus::Running, "Jarvis", sanitized_status);

        let trimmed_token = token.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        let install_dir = PathBuf::from(&self.resources.jarvis_install_dir);
        let tx = self.chat.local_install_tx.clone();
        let thread_model = model.clone();
        let pending = PendingLocalInstall {
            provider,
            model_id: model.id.clone(),
        };
        self.chat.pending_local_installs.push(pending);

        std::thread::spawn(move || {
            let token_ref = trimmed_token.as_deref();
            let outcome =
                crate::api::huggingface::download_model(&thread_model, &install_dir, token_ref);

            let message = match outcome {
                Ok(path) => LocalInstallMessage::Success {
                    provider,
                    model: thread_model,
                    install_path: path,
                },
                Err(err) => LocalInstallMessage::Error {
                    provider,
                    model_id: thread_model.id.clone(),
                    error: err.to_string(),
                },
            };

            let _ = tx.send(message);
        });

        true
    }

    pub fn provider_state(&self, provider: LocalModelProvider) -> &LocalProviderState {
        self.resources
            .local_provider_states
            .get(&provider)
            .expect("estado del proveedor no inicializado")
    }

    pub fn provider_state_mut(&mut self, provider: LocalModelProvider) -> &mut LocalProviderState {
        if !self.resources.local_provider_states.contains_key(&provider) {
            self.resources.local_provider_states.insert(
                provider,
                LocalProviderState::from_config(provider, &self.config),
            );
        }
        self.resources
            .local_provider_states
            .get_mut(&provider)
            .expect("estado del proveedor no inicializado")
    }

    pub fn upsert_installed_model(&mut self, record: InstalledLocalModel) {
        if let Some(existing) = self
            .resources
            .installed_local_models
            .iter_mut()
            .find(|entry| entry.identifier == record.identifier)
        {
            *existing = record;
        } else {
            self.resources.installed_local_models.push(record);
        }

        self.resources
            .installed_local_models
            .sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    }

    pub fn installed_model(
        &self,
        identifier: &LocalModelIdentifier,
    ) -> Option<&InstalledLocalModel> {
        self.resources
            .installed_local_models
            .iter()
            .find(|model| &model.identifier == identifier)
    }

    pub fn update_async_tasks(&mut self) -> bool {
        let mut updated = false;

        while let Ok(response) = self.chat.provider_response_rx.try_recv() {
            if let Some(position) = self
                .chat
                .pending_provider_calls
                .iter()
                .position(|pending| pending.id == response.id)
            {
                let pending = self.chat.pending_provider_calls.remove(position);

                match response.outcome {
                    Ok(text) => {
                        if let Some(message) = self.chat.messages.get_mut(pending.message_index) {
                            message.text = text.clone();
                            message.status = ChatMessageStatus::Normal;
                            message.timestamp = Local::now().format("%H:%M:%S").to_string();
                            message.sender = pending.alias.clone();
                        }

                        let char_count = text.chars().count();
                        let snippet: String = text.chars().take(120).collect();
                        *self.provider_status_slot(pending.provider_kind) = Some(format!(
                            "{} respondió correctamente ({} caracteres).",
                            pending.model, char_count
                        ));
                        self.push_activity_log(
                            LogStatus::Ok,
                            pending.provider_name.clone(),
                            format!("Respuesta recibida de '{}': {}", pending.model, snippet),
                        );
                    }
                    Err(err) => {
                        *self.provider_status_slot(pending.provider_kind) =
                            Some(format!("Último error: {}", err));
                        self.push_activity_log(
                            LogStatus::Error,
                            pending.provider_name.clone(),
                            format!("Fallo al invocar '{}': {}", pending.model, err),
                        );

                        if let Some(message) = self.chat.messages.get_mut(pending.message_index) {
                            *message = ChatMessage::system(format!(
                                "{}: error al solicitar respuesta: {}",
                                pending.alias, err
                            ));
                        }
                    }
                }

                updated = true;
            }
        }

        while let Ok(message) = self.chat.local_install_rx.try_recv() {
            match message {
                LocalInstallMessage::Success {
                    provider,
                    model,
                    install_path,
                } => {
                    let model_id = model.id.clone();
                    let identifier = LocalModelIdentifier::new(provider, &model_id);
                    let size_bytes = compute_directory_size(&install_path);
                    let install_path_string = install_path.display().to_string();
                    let record = InstalledLocalModel {
                        identifier: identifier.clone(),
                        install_path: install_path_string.clone(),
                        size_bytes,
                        installed_at: Utc::now(),
                    };
                    self.upsert_installed_model(record);

                    let activation_status = self.activate_jarvis_model(&identifier);
                    let size_label = format_bytes(size_bytes);
                    let mut status_message = format!(
                        "Modelo '{}' instalado en {} ({}).",
                        model_id, &install_path_string, size_label
                    );

                    if !activation_status.is_empty() {
                        status_message.push(' ');
                        status_message.push_str(&activation_status);
                    }

                    self.push_activity_log(
                        LogStatus::Ok,
                        "Jarvis",
                        format!(
                            "Modelo '{}' descargado en {} ({}).",
                            model_id, &install_path_string, size_label
                        ),
                    );

                    self.resources.jarvis_status = Some(status_message.clone());

                    {
                        let provider_state = self.provider_state_mut(provider);
                        provider_state.install_status = Some(status_message);
                        if provider_state.selected_model.is_none() {
                            provider_state.selected_model = provider_state
                                .models
                                .iter()
                                .position(|entry| entry.id == model_id);
                        }
                    }

                    self.chat.pending_local_installs.retain(|pending| {
                        !(pending.provider == provider && pending.model_id == model_id)
                    });
                }
                LocalInstallMessage::Error {
                    provider,
                    model_id,
                    error,
                } => {
                    self.chat.pending_local_installs.retain(|pending| {
                        !(pending.provider == provider && pending.model_id == model_id)
                    });

                    let status = format!("Fallo al instalar '{}': {}", model_id, error);
                    self.resources.jarvis_status = Some(status.clone());
                    self.push_activity_log(
                        LogStatus::Error,
                        "Jarvis",
                        format!("No se pudo descargar '{}': {}", model_id, error),
                    );
                    self.provider_state_mut(provider).install_status = Some(status);
                }
            }

            updated = true;
        }

        updated
    }

    fn normalize_string_option(value: &mut Option<String>) {
        if let Some(existing) = value.as_mut() {
            let trimmed = existing.trim();
            if trimmed.is_empty() {
                *value = None;
            } else if trimmed.len() != existing.len() {
                *existing = trimmed.to_string();
            }
        }
    }

    fn sync_config_from_state(&mut self) {
        self.config.github_token = if self.github_token.trim().is_empty() {
            None
        } else {
            Some(self.github_token.trim().to_string())
        };
        self.config.cache_directory = self.cache_directory.clone();
        self.config.cache_size_limit_gb = self.cache_size_limit_gb;
        self.config.enable_auto_cleanup = self.enable_auto_cleanup;
        self.config.cache_cleanup_interval_hours = self.cache_cleanup_interval_hours;
        self.config.resource_memory_limit_gb = self.resource_memory_limit_gb;
        self.config.resource_disk_limit_gb = self.resource_disk_limit_gb;
        self.config.custom_commands = self.chat.custom_commands.clone();
        self.config.enable_memory_tracking = self.enable_memory_tracking;
        self.config.memory_retention_days = self.memory_retention_days;
        self.config.profiles = self.profiles.clone();
        self.config.selected_profile = self.selected_profile;
        self.config.projects = self.projects.clone();
        self.config.selected_project = self.selected_project;
        let hf_state = self.provider_state(LocalModelProvider::HuggingFace).clone();
        self.config.huggingface.last_search_query = hf_state.search_query;
        self.config.huggingface.access_token = hf_state.access_token;

        let github_state = self
            .provider_state(LocalModelProvider::GithubModels)
            .clone();
        self.config.github_models.last_search_query = github_state.search_query;
        self.config.github_models.access_token = github_state.access_token;

        let replicate_state = self.provider_state(LocalModelProvider::Replicate).clone();
        self.config.replicate.last_search_query = replicate_state.search_query;
        self.config.replicate.access_token = replicate_state.access_token;

        let ollama_state = self.provider_state(LocalModelProvider::Ollama).clone();
        self.config.ollama.last_search_query = ollama_state.search_query;
        self.config.ollama.access_token = ollama_state.access_token;

        let openrouter_state = self.provider_state(LocalModelProvider::OpenRouter).clone();
        self.config.openrouter.last_search_query = openrouter_state.search_query;
        self.config.openrouter.access_token = openrouter_state.access_token;

        let modelscope_state = self.provider_state(LocalModelProvider::Modelscope).clone();
        self.config.modelscope.last_search_query = modelscope_state.search_query;
        self.config.modelscope.access_token = modelscope_state.access_token;
        self.config.jarvis.model_path = self.resources.jarvis_model_path.clone();
        self.config.jarvis.install_dir = self.resources.jarvis_install_dir.clone();
        self.config.jarvis.auto_start = self.resources.jarvis_auto_start;
        self.config.jarvis.installed_models = self
            .resources
            .installed_local_models
            .iter()
            .map(InstalledLocalModel::to_config)
            .collect();
        self.config.jarvis.active_model = self
            .resources
            .jarvis_active_model
            .as_ref()
            .map(LocalModelIdentifier::serialize);
        self.config.jarvis.chat_alias = self.resources.jarvis_alias.trim().to_string();
        if self.config.jarvis.chat_alias.is_empty() {
            self.config.jarvis.chat_alias = "jarvis".to_string();
        }
        self.resources.jarvis_alias = self.config.jarvis.chat_alias.clone();
        self.config.jarvis.respond_without_alias = self.resources.jarvis_respond_without_alias;
        self.config.anthropic.default_model = self.resources.claude_default_model.clone();
        self.config.anthropic.alias = self.resources.claude_alias.clone();
        self.config.openai.default_model = self.resources.openai_default_model.clone();
        self.config.openai.alias = self.resources.openai_alias.clone();
        self.config.groq.default_model = self.resources.groq_default_model.clone();
        self.config.groq.alias = self.resources.groq_alias.clone();

        Self::normalize_string_option(&mut self.config.anthropic.api_key);
        Self::normalize_string_option(&mut self.config.openai.api_key);
        Self::normalize_string_option(&mut self.config.groq.api_key);
        Self::normalize_string_option(&mut self.config.github_token);
        Self::normalize_string_option(&mut self.config.huggingface.access_token);
        Self::normalize_string_option(&mut self.config.github_models.access_token);
        Self::normalize_string_option(&mut self.config.replicate.access_token);
        Self::normalize_string_option(&mut self.config.ollama.access_token);
        Self::normalize_string_option(&mut self.config.openrouter.access_token);
        Self::normalize_string_option(&mut self.config.modelscope.access_token);
    }

    pub fn persist_config(&mut self) {
        self.sync_config_from_state();
        self.rebuild_navigation();
        if let Err(err) = self.config.save() {
            self.chat.messages.push(ChatMessage::system(format!(
                "No se pudo guardar la configuración: {}",
                err
            )));
        }
    }

    pub fn refresh_personalization_resources(&mut self) {
        self.resources.personalization_resources = PersonalizationResourcesState::from_sources(
            &self.profiles,
            &self.projects,
            &self.github_repositories,
        );
    }

    pub fn rebuild_command_registry(&mut self) {
        let mut registry = CommandRegistry::new();
        self.chat.register_commands(&mut registry);
        self.automation.register_commands(&mut registry);
        self.resources.register_commands(&mut registry);
        self.command_registry = registry;
    }

    pub fn register_workbench_view<V>(&mut self, view: MainView, view_impl: V)
    where
        V: WorkbenchView + 'static,
    {
        self.workbench_views.insert(view, Box::new(view_impl));
    }

    pub fn register_workbench_initializer<F>(&mut self, initializer: F)
    where
        F: Fn(&mut WorkbenchRegistry) + 'static,
    {
        self.workbench_initializers.push(Box::new(initializer));
        self.rebuild_workbench_views();
    }

    pub fn workbench_view(&self, view: MainView) -> Option<&dyn WorkbenchView> {
        self.workbench_views.get(&view).map(|view| view.as_ref())
    }

    pub fn with_workbench_view_mut<R>(
        &mut self,
        view: MainView,
        f: impl FnOnce(&mut dyn WorkbenchView, &mut AppState) -> R,
    ) -> Option<R> {
        let mut view_impl = self.workbench_views.remove(&view)?;
        let result = f(view_impl.as_mut(), self);
        self.workbench_views.insert(view, view_impl);
        Some(result)
    }

    pub fn rebuild_workbench_views(&mut self) {
        self.workbench_views.clear();
        let mut registry = WorkbenchRegistry::new(&mut self.workbench_views);
        self.chat.register_workbench_views(&mut registry);
        self.automation.register_workbench_views(&mut registry);
        self.resources.register_workbench_views(&mut registry);
        crate::ui::chat::register_preferences_workbench_view(&mut registry);
        for initializer in &self.workbench_initializers {
            initializer(&mut registry);
        }
    }

    pub fn rebuild_navigation(&mut self) {
        let mut registry = build_navigation_registry(&self.config);
        self.chat.register_navigation(&mut registry);
        self.automation.register_navigation(&mut registry);
        self.resources.register_navigation(&mut registry);
        self.navigation = registry;
    }

    fn jarvis_model_directory(&self) -> Option<PathBuf> {
        let direct_path = self.resources.jarvis_model_path.trim();
        if !direct_path.is_empty() {
            let dir = Path::new(direct_path);
            if dir.is_dir() {
                return Some(dir.to_path_buf());
            }
            if let Some(parent) = dir.parent() {
                if parent.is_dir() {
                    return Some(parent.to_path_buf());
                }
            }
        }

        self.resources
            .jarvis_active_model
            .as_ref()
            .map(|model| self.jarvis_model_directory_for(model))
    }

    fn jarvis_model_directory_for(&self, model: &LocalModelIdentifier) -> PathBuf {
        if let Some(record) = self.installed_model(model) {
            let path = Path::new(&record.install_path);
            if path.is_dir() {
                return path.to_path_buf();
            }
        }

        Path::new(&self.resources.jarvis_install_dir).join(model.sanitized_dir_name())
    }

    pub fn ensure_jarvis_runtime(&mut self) -> anyhow::Result<&mut JarvisRuntime> {
        let target_dir = self
            .jarvis_model_directory()
            .ok_or_else(|| anyhow::anyhow!("No hay un modelo local configurado para Jarvis."))?;

        let needs_reload = match &self.resources.jarvis_runtime {
            Some(runtime) => !runtime.matches(&target_dir),
            None => true,
        };

        if needs_reload {
            self.push_activity_log(
                LogStatus::Running,
                "Jarvis",
                format!("Cargando modelo local desde {}", target_dir.display()),
            );
            let runtime = JarvisRuntime::load(
                target_dir.clone(),
                self.resources
                    .jarvis_active_model
                    .as_ref()
                    .map(|model| model.model_id.clone()),
            )?;
            self.resources.jarvis_runtime = Some(runtime);
            self.resources.jarvis_model_path = target_dir.display().to_string();
            let loaded_label = self
                .resources
                .jarvis_runtime
                .as_ref()
                .map(|runtime| runtime.model_label());
            if let Some(label) = loaded_label {
                self.push_activity_log(
                    LogStatus::Ok,
                    "Jarvis",
                    format!("Modelo {} listo para responder.", label),
                );
                self.resources.jarvis_status = Some(format!(
                    "Jarvis cargó {} desde {}.",
                    label, self.resources.jarvis_model_path
                ));
            }
        }

        Ok(self
            .resources
            .jarvis_runtime
            .as_mut()
            .expect("runtime recién cargado"))
    }

    pub fn respond_with_jarvis(&mut self, prompt: String) {
        self.push_activity_log(
            LogStatus::Running,
            "Jarvis",
            format!(
                "Procesando entrada local de {} caracteres.",
                prompt.chars().count()
            ),
        );
        match self.ensure_jarvis_runtime() {
            Ok(runtime) => {
                let label = runtime.model_label();
                let reply_result = runtime.generate_reply(&prompt);
                let _ = runtime;
                match reply_result {
                    Ok(reply) => {
                        self.resources.jarvis_status =
                            Some(format!("Jarvis responde con el modelo {}.", label));
                        self.push_activity_log(
                            LogStatus::Ok,
                            "Jarvis",
                            format!("Respuesta generada por {}", label),
                        );
                        self.chat.messages.push(ChatMessage::new("Jarvis", reply));
                    }
                    Err(err) => {
                        self.chat.messages.push(ChatMessage::system(format!(
                            "Jarvis no pudo generar respuesta: {}",
                            err
                        )));
                        self.resources.jarvis_status = Some(format!(
                            "Jarvis falló al generar respuesta ({label}): {}",
                            err
                        ));
                        self.push_activity_log(
                            LogStatus::Error,
                            "Jarvis",
                            format!("Error al generar respuesta con {}: {}", label, err),
                        );
                    }
                }
            }
            Err(err) => {
                self.chat.messages.push(ChatMessage::system(format!(
                    "Jarvis no está listo: {}",
                    err
                )));
                self.resources.jarvis_status = Some(format!("Jarvis no está listo: {}", err));
                self.push_activity_log(
                    LogStatus::Error,
                    "Jarvis",
                    format!("Runtime inalcanzable: {}", err),
                );
            }
        }
    }

    fn provider_alias_display(alias: &str, fallback: &str) -> String {
        let trimmed = alias.trim();
        if trimmed.is_empty() {
            fallback.to_string()
        } else {
            trimmed.to_string()
        }
    }

    fn extract_alias_prompt(alias: &str, input: &str) -> Option<String> {
        let alias_trimmed = alias.trim();
        if alias_trimmed.is_empty() {
            return None;
        }

        let mut patterns = Vec::new();
        patterns.push(alias_trimmed.to_string());
        if !alias_trimmed.starts_with('@') {
            patterns.push(format!("@{}", alias_trimmed));
        } else {
            patterns.push(alias_trimmed.trim_start_matches('@').to_string());
        }

        for pattern in patterns
            .into_iter()
            .filter(|candidate| !candidate.trim().is_empty())
        {
            if let Some(remainder) = Self::match_alias_pattern(&pattern, input) {
                return Some(remainder);
            }
        }

        None
    }

    fn match_alias_pattern(pattern: &str, input: &str) -> Option<String> {
        let input_trimmed = input.trim_start();
        let pattern_chars: Vec<char> = pattern.chars().collect();
        let mut input_iter = input_trimmed.chars();

        for alias_ch in &pattern_chars {
            match input_iter.next() {
                Some(user_ch) if user_ch.eq_ignore_ascii_case(alias_ch) => {}
                _ => return None,
            }
        }

        let pattern_bytes: usize = pattern_chars.iter().map(|c| c.len_utf8()).sum();
        if input_trimmed.len() < pattern_bytes {
            return None;
        }

        let mut remainder = input_trimmed[pattern_bytes..].trim_start();
        remainder = remainder.trim_start_matches(|c: char| matches!(c, ':' | ','));
        remainder = remainder.trim_start();

        if remainder.is_empty() {
            None
        } else {
            Some(remainder.to_string())
        }
    }

    fn handle_provider_call(
        &mut self,
        provider_kind: RemoteProviderKind,
        alias: String,
        provider_name: &str,
        prompt: String,
        api_key: Option<String>,
        model: String,
        caller: fn(&str, &str, &str) -> anyhow::Result<String>,
    ) {
        if let Some(key) = api_key {
            self.push_activity_log(
                LogStatus::Running,
                provider_name,
                format!("Consultando '{}' con el alias '{}'.", model, alias),
            );
            let message_index = self.chat.messages.len();
            let pending = ChatMessage::pending(
                alias.clone(),
                format!("Esperando respuesta de {}…", provider_name),
            );
            self.chat.messages.push(pending);

            let call_id = self.chat.next_provider_call_id;
            self.chat.next_provider_call_id += 1;

            self.chat.pending_provider_calls.push(PendingProviderCall {
                id: call_id,
                provider_kind,
                provider_name: provider_name.to_string(),
                alias: alias.clone(),
                model: model.clone(),
                message_index,
            });

            let tx = self.chat.provider_response_tx.clone();
            std::thread::spawn(move || {
                let outcome = caller(&key, &model, &prompt).map_err(|err| err.to_string());
                let _ = tx.send(ProviderResponse {
                    id: call_id,
                    outcome,
                });
            });
        } else {
            self.chat.messages.push(ChatMessage::system(format!(
                "Configura la API key de {} antes de usar el alias '{}'.",
                provider_name, alias
            )));
            *self.provider_status_slot(provider_kind) =
                Some(format!("Falta la API key para {}.", provider_name));
        }
    }

    fn provider_status_slot(&mut self, provider: RemoteProviderKind) -> &mut Option<String> {
        match provider {
            RemoteProviderKind::Anthropic => &mut self.resources.anthropic_test_status,
            RemoteProviderKind::OpenAi => &mut self.resources.openai_test_status,
            RemoteProviderKind::Groq => &mut self.resources.groq_test_status,
        }
    }

    fn invoke_provider_kind(&mut self, provider: RemoteProviderKind, prompt: String) {
        match provider {
            RemoteProviderKind::Anthropic => self.invoke_anthropic(prompt),
            RemoteProviderKind::OpenAi => self.invoke_openai(prompt),
            RemoteProviderKind::Groq => self.invoke_groq(prompt),
        }
    }

    pub fn execute_remote_quick_test(&mut self, key: RemoteModelKey) -> Option<String> {
        let prompt = self
            .resources
            .remote_catalog
            .quick_test_prompt
            .trim()
            .to_string();
        if prompt.is_empty() {
            return Some("Escribe un prompt de prueba antes de lanzar la simulación.".to_string());
        }

        let label = key.as_display();
        let formatted = format!("[quick-test:{}]\n{}", key.id, prompt);
        self.resources
            .remote_catalog
            .update_status(Some(format!("Enviando prueba rápida a {}…", label)));
        self.invoke_provider_kind(key.provider, formatted);
        self.push_debug_event(
            DebugLogLevel::Info,
            format!("providers::{}", key.provider.short_code()),
            format!("Quick test lanzado para {}", key.id),
        );
        Some(format!("Prueba rápida enviada a {}.", label))
    }

    pub fn try_route_selected_provider(&mut self, input: &str) -> bool {
        if input.trim().is_empty() {
            return false;
        }

        let target = if let Some(provider) = self.chat_routing.take_override() {
            Some(provider)
        } else if self.chat_routing.route_every_message {
            Some(self.chat_routing.active_thread_provider)
        } else {
            None
        };

        if let Some(provider) = target {
            self.invoke_provider_kind(provider, input.to_string());
            self.chat_routing.update_status(Some(format!(
                "Mensaje enviado a {}",
                provider.display_name()
            )));
            true
        } else {
            false
        }
    }

    fn invoke_anthropic(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.resources.claude_alias, "claude");
        let key = self.config.anthropic.api_key.clone().and_then(|k| {
            let trimmed = k.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        self.handle_provider_call(
            RemoteProviderKind::Anthropic,
            alias,
            "Anthropic",
            prompt,
            key,
            self.resources.claude_default_model.clone(),
            crate::api::claude::send_message,
        );
    }

    fn invoke_openai(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.resources.openai_alias, "openai");
        let key = self.config.openai.api_key.clone().and_then(|k| {
            let trimmed = k.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        self.handle_provider_call(
            RemoteProviderKind::OpenAi,
            alias,
            "OpenAI",
            prompt,
            key,
            self.resources.openai_default_model.clone(),
            crate::api::openai::send_message,
        );
    }

    fn invoke_groq(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.resources.groq_alias, "groq");
        let key = self.config.groq.api_key.clone().and_then(|k| {
            let trimmed = k.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        self.handle_provider_call(
            RemoteProviderKind::Groq,
            alias,
            "Groq",
            prompt,
            key,
            self.resources.groq_default_model.clone(),
            crate::api::groq::send_message,
        );
    }

    pub fn try_route_provider_message(&mut self, input: &str) -> bool {
        if let Some(prompt) = Self::extract_alias_prompt(&self.resources.claude_alias, input) {
            self.invoke_anthropic(prompt);
            return true;
        }

        if let Some(prompt) = Self::extract_alias_prompt(&self.resources.openai_alias, input) {
            self.invoke_openai(prompt);
            return true;
        }

        if let Some(prompt) = Self::extract_alias_prompt(&self.resources.groq_alias, input) {
            self.invoke_groq(prompt);
            return true;
        }

        false
    }

    pub fn try_invoke_jarvis_alias(&mut self, input: &str) -> bool {
        if let Some(prompt) = Self::extract_alias_prompt(&self.resources.jarvis_alias, input) {
            self.respond_with_jarvis(prompt);
            true
        } else {
            false
        }
    }

    pub fn jarvis_mention_tag(&self) -> Option<String> {
        let alias = self.resources.jarvis_alias.trim();
        if alias.is_empty() {
            None
        } else if alias.starts_with('@') {
            Some(alias.to_string())
        } else {
            Some(format!("@{}", alias))
        }
    }

    pub fn handle_command(&mut self, command_input: String) {
        let trimmed = command_input.trim();
        if trimmed.is_empty() {
            return;
        }

        let invocation = CommandInvocation::parse(trimmed);
        if invocation.name.is_empty() {
            return;
        }

        let outcome = self.resolve_command(invocation, 0);
        if outcome.messages.is_empty() {
            return;
        }

        for message in outcome.messages {
            self.chat.messages.push(ChatMessage::system(message));
        }
    }

    fn resolve_command(&mut self, invocation: CommandInvocation, depth: usize) -> CommandOutcome {
        if depth > MAX_COMMAND_DEPTH {
            return CommandOutcome::single(
                "Recursión de comandos demasiado profunda. Revisa tus condicionales.".to_string(),
            );
        }

        if invocation.name == "/if" {
            return self.execute_conditional(invocation, depth);
        }

        if let Some(custom) = self
            .chat
            .custom_commands
            .iter()
            .find(|cmd| cmd.trigger == invocation.name)
            .cloned()
        {
            return CommandOutcome {
                messages: self.execute_custom_action(custom.action, &invocation),
            };
        }

        match invocation.name.as_str() {
            "/status" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowSystemStatus, &invocation),
            },
            "/system" => {
                let positional_debug = invocation
                    .positional
                    .first()
                    .map(|token| token.eq_ignore_ascii_case("debug"))
                    .unwrap_or(false);
                let arg_debug = invocation
                    .arg("mode")
                    .map(|value| value.eq_ignore_ascii_case("debug"))
                    .unwrap_or(false)
                    || invocation.flag("debug");

                let action = if positional_debug || arg_debug {
                    CustomCommandAction::ShowSystemDiagnostics
                } else {
                    CustomCommandAction::ShowSystemStatus
                };

                CommandOutcome {
                    messages: self.execute_custom_action(action, &invocation),
                }
            }
            "/models" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ListAvailableModels, &invocation),
            },
            "/stats" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowUsageStatistics, &invocation),
            },
            "/reload" => {
                let mut message =
                    "Recargando configuraciones... Los proveedores y la caché se sincronizarán en segundo plano.".to_string();
                if invocation.flag("force") {
                    message.push_str(" Forzando refresco inmediato de todas las credenciales.");
                }
                CommandOutcome::single(message)
            }
            "/help" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowCommandHelp, &invocation),
            },
            "/time" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowCurrentTime, &invocation),
            },
            "/projects" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ListActiveProjects, &invocation),
            },
            "/profiles" => CommandOutcome {
                messages: self.execute_custom_action(
                    CustomCommandAction::ListConfiguredProfiles,
                    &invocation,
                ),
            },
            "/cache" => CommandOutcome {
                messages: self.execute_custom_action(
                    CustomCommandAction::ShowCacheConfiguration,
                    &invocation,
                ),
            },
            "/github" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowGithubSummary, &invocation),
            },
            "/memory" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowMemorySettings, &invocation),
            },
            "/providers" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowActiveProviders, &invocation),
            },
            "/jarvis" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowJarvisStatus, &invocation),
            },
            _ => CommandOutcome::single(format!("Unknown command: {}", invocation.raw)),
        }
    }

    fn execute_conditional(
        &mut self,
        invocation: CommandInvocation,
        depth: usize,
    ) -> CommandOutcome {
        let condition_text = invocation
            .raw
            .trim_start_matches("/if")
            .trim_start()
            .to_string();

        if condition_text.is_empty() {
            return CommandOutcome::single(
                "Uso: /if <condición> then <comando> [else <comando>]".to_string(),
            );
        }

        let (condition_part, outcome_part) = match condition_text.split_once(" then ") {
            Some(parts) => parts,
            None => {
                return CommandOutcome::single(
                    "La instrucción condicional necesita la palabra clave 'then'.".to_string(),
                );
            }
        };

        let (then_command, else_command) =
            if let Some((then, otherwise)) = outcome_part.split_once(" else ") {
                (then.trim(), Some(otherwise.trim()))
            } else {
                (outcome_part.trim(), None)
            };

        let evaluation = match self.evaluate_condition(condition_part.trim()) {
            Ok(value) => value,
            Err(err) => return CommandOutcome::single(err),
        };

        let mut messages = Vec::new();
        messages.push(format!(
            "Condición '{}' evaluada como {}.",
            condition_part.trim(),
            if evaluation { "verdadera" } else { "falsa" }
        ));

        let branch = if evaluation {
            then_command
        } else if let Some(else_cmd) = else_command {
            else_cmd
        } else {
            messages.push("No se especificó comando 'else'.".to_string());
            return CommandOutcome { messages };
        };

        if branch.is_empty() {
            messages.push("No hay comando que ejecutar tras la condición.".to_string());
            return CommandOutcome { messages };
        }

        let nested_invocation = CommandInvocation::parse(branch);
        if nested_invocation.name.is_empty() {
            messages.push("No se pudo interpretar el comando de la rama seleccionada.".to_string());
            return CommandOutcome { messages };
        }

        messages.push(format!("Ejecutando '{}'.", branch));
        let nested = self.resolve_command(nested_invocation, depth + 1);
        messages.extend(nested.messages);
        CommandOutcome { messages }
    }

    fn evaluate_condition(&self, expression: &str) -> Result<bool, String> {
        let parts: Vec<&str> = expression.split_whitespace().collect();
        if parts.len() < 3 {
            return Err(
                "La condición debe tener el formato <campo> <operador> <valor>.".to_string(),
            );
        }

        let field = parts[0];
        let operator = parts[1];
        let value = parts[2..].join(" ");

        let lhs = self.resolve_condition_value(field)?;
        lhs.compare(operator, value.trim())
    }

    fn resolve_condition_value(&self, field: &str) -> Result<ConditionValue, String> {
        match field {
            "memory.enabled" => Ok(ConditionValue::Boolean(self.enable_memory_tracking)),
            "profiles.count" => Ok(ConditionValue::Number(self.profiles.len() as f64)),
            "projects.count" => Ok(ConditionValue::Number(self.projects.len() as f64)),
            "cache.auto_cleanup" => Ok(ConditionValue::Boolean(self.enable_auto_cleanup)),
            "providers.total" => Ok(ConditionValue::Number(3.0)),
            "github.connected" => Ok(ConditionValue::Boolean(self.github_username.is_some())),
            "jarvis.auto_start" => Ok(ConditionValue::Boolean(self.resources.jarvis_auto_start)),
            "commands.count" => Ok(ConditionValue::Number(
                self.chat.custom_commands.len() as f64
            )),
            _ => Err(format!("Campo desconocido en la condición: {}", field)),
        }
    }

    fn execute_custom_action(
        &mut self,
        action: CustomCommandAction,
        invocation: &CommandInvocation,
    ) -> Vec<String> {
        match action {
            CustomCommandAction::ShowCurrentTime => {
                let format = invocation.arg("format").unwrap_or("human");
                let now = Local::now();
                let rendered = match format {
                    "24" => now.format("%H:%M:%S").to_string(),
                    "iso" => now.to_rfc3339(),
                    _ => now.format("%I:%M %p").to_string(),
                };
                vec![format!("Hora actual: {}", rendered.trim())]
            }
            CustomCommandAction::ShowSystemStatus => {
                let detail = invocation.arg("detail").unwrap_or("summary");
                let verbose = invocation.flag("verbose");
                let mut lines = vec![format!(
                    "Sistema operativo estable. Límites configurados → Memoria: {:.1} GB · Disco: {:.1} GB.",
                    self.resource_memory_limit_gb, self.resource_disk_limit_gb
                )];

                match detail {
                    "memory" => lines.push(format!(
                        "Memoria disponible para caché: {:.1} GB. Auto limpieza: {}.",
                        self.resource_memory_limit_gb,
                        if self.enable_auto_cleanup {
                            "activada"
                        } else {
                            "desactivada"
                        }
                    )),
                    "disk" => lines.push(format!(
                        "Espacio de disco reservado para caché: {:.1} GB en {}.",
                        self.resource_disk_limit_gb, self.cache_directory
                    )),
                    "cache" => lines.push(format!(
                        "Limpieza automática cada {} horas. Última ejecución: {}.",
                        self.cache_cleanup_interval_hours,
                        self.last_cache_cleanup
                            .clone()
                            .unwrap_or_else(|| "nunca".to_string())
                    )),
                    _ => {}
                }

                if verbose {
                    lines.push("Modo detallado activado: recuerda revisar la configuración de recursos en Preferencias.".to_string());
                }

                lines
            }
            CustomCommandAction::ShowSystemDiagnostics => {
                let mut focus_tokens = invocation.positional.clone();
                if focus_tokens
                    .first()
                    .map(|token| token.eq_ignore_ascii_case("debug"))
                    .unwrap_or(false)
                {
                    focus_tokens.remove(0);
                }

                let requested_section = invocation
                    .arg("section")
                    .or_else(|| invocation.arg("focus"))
                    .map(|value| value.to_ascii_lowercase())
                    .or_else(|| focus_tokens.first().map(|token| token.to_ascii_lowercase()))
                    .unwrap_or_else(|| "all".to_string());

                let normalized = requested_section.as_str();
                let wants_all = matches!(
                    normalized,
                    "all" | "todo" | "todos" | "todas" | "full" | "completo" | "completa"
                );
                let wants_general = wants_all
                    || matches!(normalized, "general" | "recursos" | "status" | "resumen");
                let wants_remote = wants_all
                    || matches!(
                        normalized,
                        "remote" | "remoto" | "providers" | "proveedores" | "nube"
                    );
                let wants_local = wants_all
                    || matches!(
                        normalized,
                        "local" | "jarvis" | "modelos" | "models" | "runtime"
                    );
                let wants_commands = wants_all
                    || matches!(normalized, "commands" | "comandos" | "command" | "custom");
                let wants_logs = wants_all
                    || matches!(
                        normalized,
                        "logs" | "errores" | "errors" | "diagnostico" | "diagnóstico"
                    );

                let classify = |text: &str| {
                    let normalized = text.to_ascii_lowercase();
                    if normalized.contains("error")
                        || normalized.contains("fall")
                        || normalized.contains("no se pudo")
                        || normalized.contains("failed")
                    {
                        "ERROR"
                    } else if normalized.contains("sin ejecutar")
                        || normalized.contains("esperando")
                        || normalized.contains("pendiente")
                        || normalized.contains("sin actualizaciones")
                        || normalized.contains("no configurado")
                    {
                        "PEND"
                    } else {
                        "OK"
                    }
                };

                let mut lines = vec!["=== Diagnóstico avanzado del sistema ===".to_string()];
                if !wants_all {
                    lines.push(format!(
                        "Filtro aplicado a la sección: {}.",
                        requested_section
                    ));
                }

                if wants_general {
                    lines.push("--- Recursos y configuración ---".to_string());
                    lines.push(format!(
                        "Memoria límite: {:.1} GB · Disco límite: {:.1} GB · Auto limpieza: {} (cada {} h).",
                        self.resource_memory_limit_gb,
                        self.resource_disk_limit_gb,
                        if self.enable_auto_cleanup {
                            "activa"
                        } else {
                            "inactiva"
                        },
                        self.cache_cleanup_interval_hours
                    ));
                    lines.push(format!(
                        "Directorio de caché: {} · Última limpieza: {}.",
                        self.cache_directory,
                        self.last_cache_cleanup
                            .clone()
                            .unwrap_or_else(|| "nunca".to_string())
                    ));
                    lines.push(format!(
                        "Perfiles: {} · Proyectos: {} · Memoria contextual: {} ({} días).",
                        self.profiles.len(),
                        self.projects.len(),
                        if self.enable_memory_tracking {
                            "activa"
                        } else {
                            "inactiva"
                        },
                        self.memory_retention_days
                    ));
                }

                if wants_remote {
                    lines.push("--- Proveedores remotos ---".to_string());
                    let openai_status = self
                        .resources
                        .openai_test_status
                        .clone()
                        .unwrap_or_else(|| "sin ejecutar".to_string());
                    lines.push(format!(
                        "OpenAI [{}] modelo por defecto '{}' · {}.",
                        classify(&openai_status),
                        self.resources.openai_default_model,
                        openai_status
                    ));

                    let anthropic_status = self
                        .resources
                        .anthropic_test_status
                        .clone()
                        .unwrap_or_else(|| "sin ejecutar".to_string());
                    lines.push(format!(
                        "Claude [{}] modelo por defecto '{}' · {}.",
                        classify(&anthropic_status),
                        self.resources.claude_default_model,
                        anthropic_status
                    ));

                    let claude_catalog = self
                        .resources
                        .claude_models_status
                        .clone()
                        .unwrap_or_else(|| {
                            if self.resources.claude_available_models.is_empty() {
                                "catálogo sin cargar".to_string()
                            } else {
                                format!(
                                    "{} modelos disponibles en caché",
                                    self.resources.claude_available_models.len()
                                )
                            }
                        });
                    lines.push(format!(
                        "Claude catálogo [{}] {}.",
                        classify(&claude_catalog),
                        claude_catalog
                    ));

                    let groq_status = self
                        .resources
                        .groq_test_status
                        .clone()
                        .unwrap_or_else(|| "sin ejecutar".to_string());
                    lines.push(format!(
                        "Groq [{}] modelo por defecto '{}' · {}.",
                        classify(&groq_status),
                        self.resources.groq_default_model,
                        groq_status
                    ));
                }

                if wants_local {
                    lines.push("--- Runtime local y Jarvis ---".to_string());
                    let jarvis_status = self
                        .resources
                        .jarvis_status
                        .clone()
                        .unwrap_or_else(|| "sin actualizaciones registradas".to_string());
                    let runtime_status = if let Some(runtime) = &self.resources.jarvis_runtime {
                        format!("Inicializado ({})", runtime.model_label())
                    } else {
                        "No inicializado".to_string()
                    };
                    lines.push(format!(
                        "Jarvis [{}] {}.",
                        classify(&jarvis_status),
                        jarvis_status
                    ));
                    lines.push(format!(
                        "Runtime local: {} · Modelo configurado: {} · Instalación: {} · Autoarranque: {}.",
                        runtime_status,
                        self.resources.jarvis_model_path,
                        self.resources.jarvis_install_dir,
                        if self.resources.jarvis_auto_start {
                            "sí"
                        } else {
                            "no"
                        }
                    ));

                    if self.resources.installed_local_models.is_empty() {
                        lines.push("Modelos instalados: ninguno.".to_string());
                    } else {
                        let inventory = self
                            .resources
                            .installed_local_models
                            .iter()
                            .map(|model| {
                                let label = model.identifier.display_label();
                                let size = format_bytes(model.size_bytes);
                                let installed = model
                                    .installed_at
                                    .with_timezone(&Local)
                                    .format("%Y-%m-%d %H:%M")
                                    .to_string();
                                format!("{} · {} · instalado {}", label, size, installed)
                            })
                            .collect::<Vec<_>>()
                            .join(" | ");
                        lines.push(format!(
                            "Modelos instalados ({}): {}.",
                            self.resources.installed_local_models.len(),
                            inventory
                        ));
                    }

                    if self.chat.pending_local_installs.is_empty() {
                        lines.push("Instalaciones locales pendientes: ninguna.".to_string());
                    } else {
                        let installs = self
                            .chat
                            .pending_local_installs
                            .iter()
                            .map(|pending| {
                                format!(
                                    "{} › {}",
                                    pending.provider.display_name(),
                                    pending.model_id
                                )
                            })
                            .collect::<Vec<_>>()
                            .join(" · ");
                        lines.push(format!(
                            "Instalaciones locales pendientes ({}): {}.",
                            self.chat.pending_local_installs.len(),
                            installs
                        ));
                    }

                    if self.chat.pending_provider_calls.is_empty() {
                        lines.push("Llamadas remotas en vuelo: ninguna.".to_string());
                    } else {
                        let preview = self
                            .chat
                            .pending_provider_calls
                            .iter()
                            .take(3)
                            .map(|call| {
                                format!(
                                    "#{} {} · {} ({})",
                                    call.id, call.provider_name, call.alias, call.model
                                )
                            })
                            .collect::<Vec<_>>()
                            .join(" · ");
                        lines.push(format!(
                            "Llamadas remotas en vuelo ({}): {}{}.",
                            self.chat.pending_provider_calls.len(),
                            preview,
                            if self.chat.pending_provider_calls.len() > 3 {
                                " · ..."
                            } else {
                                ""
                            }
                        ));
                    }

                    lines.push("--- Proveedores locales ---".to_string());
                    for provider in LocalModelProvider::ALL {
                        let provider_state = self.provider_state(provider);
                        let token_state = if provider_state
                            .access_token
                            .as_ref()
                            .map(|token| !token.trim().is_empty())
                            .unwrap_or(false)
                        {
                            "token configurado"
                        } else {
                            "sin token"
                        };
                        let selection = provider_state
                            .selected_model
                            .and_then(|index| provider_state.models.get(index))
                            .map(|model| model.id.clone())
                            .unwrap_or_else(|| "ninguno".to_string());
                        let install_state = provider_state
                            .install_status
                            .clone()
                            .unwrap_or_else(|| "sin operaciones registradas".to_string());

                        lines.push(format!(
                            "{} → {} · modelos listados: {} · selección: {} · última instalación [{}] {}.",
                            provider.display_name(),
                            token_state,
                            provider_state.models.len(),
                            selection,
                            classify(&install_state),
                            install_state
                        ));
                    }
                }

                if wants_commands {
                    lines.push("--- Comandos personalizados ---".to_string());
                    if self.chat.custom_commands.is_empty() {
                        lines.push("No hay comandos personalizados registrados.".to_string());
                    } else {
                        for command in &self.chat.custom_commands {
                            lines.push(format!("{} → {}", command.trigger, command.action.label()));
                        }
                        lines.push(format!(
                            "Total de comandos personalizados: {}.",
                            self.chat.custom_commands.len()
                        ));
                    }
                }

                if wants_logs {
                    lines.push("--- Registros y alertas ---".to_string());
                    let ok_count = self
                        .automation
                        .activity_logs
                        .iter()
                        .filter(|entry| entry.status == LogStatus::Ok)
                        .count();
                    let warn_count = self
                        .automation
                        .activity_logs
                        .iter()
                        .filter(|entry| entry.status == LogStatus::Warning)
                        .count();
                    let err_count = self
                        .automation
                        .activity_logs
                        .iter()
                        .filter(|entry| entry.status == LogStatus::Error)
                        .count();
                    let running_count = self
                        .automation
                        .activity_logs
                        .iter()
                        .filter(|entry| entry.status == LogStatus::Running)
                        .count();

                    if let Some(last_error) = self
                        .automation
                        .activity_logs
                        .iter()
                        .rev()
                        .find(|entry| entry.status == LogStatus::Error)
                    {
                        lines.push(format!(
                            "Último error registrado a las {} desde {} → {}.",
                            last_error.timestamp, last_error.source, last_error.message
                        ));
                    } else {
                        lines.push("No hay errores registrados en los logs recientes.".to_string());
                    }

                    lines.push(format!(
                        "Resumen de logs → OK: {} · Warning: {} · Error: {} · Running: {}.",
                        ok_count, warn_count, err_count, running_count
                    ));
                }

                lines
            }
            CustomCommandAction::ShowUsageStatistics => {
                let window = invocation.arg("window").unwrap_or("session");
                let include = invocation
                    .arg("include")
                    .map(|value| {
                        value
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();

                let mut lines = vec![format!(
                    "Estadísticas (ventana: {}): {} mensajes registrados en esta sesión y {} comandos personalizados disponibles.",
                    window,
                    self.chat.messages.len(),
                    self.chat.custom_commands.len()
                )];

                if include.iter().any(|s| s == "commands") {
                    lines.push(format!(
                        "Triggers personalizados: {}",
                        self.chat
                            .custom_commands
                            .iter()
                            .map(|cmd| cmd.trigger.clone())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ));
                }

                if include.iter().any(|s| s == "messages") {
                    lines.push(format!(
                        "Último mensaje de usuario: {}",
                        self.chat
                            .messages
                            .iter()
                            .rev()
                            .find(|msg| msg.sender == "User")
                            .map(|msg| msg.text.clone())
                            .unwrap_or_else(|| "sin actividad".to_string())
                    ));
                }

                lines
            }
            CustomCommandAction::ListActiveProjects => {
                let limit = invocation
                    .arg("limit")
                    .and_then(|value| value.parse::<usize>().ok());
                let mut projects = self.projects.clone();
                if let Some(max) = limit {
                    projects.truncate(max);
                }

                if projects.is_empty() {
                    vec!["No hay proyectos configurados actualmente.".to_string()]
                } else {
                    vec![format!("Proyectos activos: {}.", projects.join(", "))]
                }
            }
            CustomCommandAction::ListConfiguredProfiles => {
                let mut profiles = self.profiles.clone();
                match invocation.arg("sort").unwrap_or("asc") {
                    "desc" => profiles.sort_by(|a, b| b.cmp(a)),
                    _ => profiles.sort(),
                }

                if profiles.is_empty() {
                    vec!["No hay perfiles configurados.".to_string()]
                } else {
                    vec![format!("Perfiles disponibles: {}.", profiles.join(", "))]
                }
            }
            CustomCommandAction::ShowCacheConfiguration => {
                let include = invocation
                    .arg("include")
                    .map(|value| {
                        value
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_else(|| vec!["limits".to_string()]);
                let mut lines = Vec::new();

                if include.iter().any(|s| s == "path") {
                    lines.push(format!("Directorio de caché: {}", self.cache_directory));
                }
                if include.iter().any(|s| s == "limits") {
                    lines.push(format!(
                        "Límite configurado: {:.1} GB, limpieza automática: {}.",
                        self.cache_size_limit_gb,
                        if self.enable_auto_cleanup {
                            "sí"
                        } else {
                            "no"
                        }
                    ));
                }
                if include.iter().any(|s| s == "schedule") {
                    lines.push(format!(
                        "La limpieza se programa cada {} horas. Última ejecución: {}.",
                        self.cache_cleanup_interval_hours,
                        self.last_cache_cleanup
                            .clone()
                            .unwrap_or_else(|| "nunca".to_string())
                    ));
                }

                if lines.is_empty() {
                    lines.push("No se reconocieron parámetros para mostrar.".to_string());
                }
                lines
            }
            CustomCommandAction::ListAvailableModels => {
                let provider = invocation.arg("provider").unwrap_or("all");
                let mut lines = Vec::new();

                match provider {
                    "openai" => lines.push(format!(
                        "Modelo OpenAI activo: {}",
                        self.resources.openai_default_model
                    )),
                    "anthropic" => lines.push(format!(
                        "Modelo Claude activo: {}",
                        self.resources.claude_default_model
                    )),
                    "groq" => lines.push(format!(
                        "Modelo Groq activo: {}",
                        self.resources.groq_default_model
                    )),
                    "jarvis" => lines.push(format!(
                        "Jarvis está configurado con: {}",
                        self.resources.jarvis_model_path
                    )),
                    "huggingface" => {
                        let provider_state = self.provider_state(LocalModelProvider::HuggingFace);
                        if provider_state.models.is_empty() {
                            lines.push("No hay modelos de HuggingFace registrados.".to_string());
                        } else {
                            let joined = provider_state
                                .models
                                .iter()
                                .map(|model| model.id.as_str())
                                .collect::<Vec<_>>()
                                .join(", ");
                            lines.push(format!("Modelos de HuggingFace: {}", joined));
                        }
                    }
                    "all" => {
                        lines.push(format!(
                            "OpenAI: {} · Claude: {} · Groq: {} · Jarvis: {}",
                            self.resources.openai_default_model,
                            self.resources.claude_default_model,
                            self.resources.groq_default_model,
                            self.resources.jarvis_model_path
                        ));
                        let provider_state = self.provider_state(LocalModelProvider::HuggingFace);
                        if provider_state.models.is_empty() {
                            lines.push("HuggingFace: sin resultados cargados.".to_string());
                        } else {
                            let preview: Vec<&str> = provider_state
                                .models
                                .iter()
                                .take(5)
                                .map(|model| model.id.as_str())
                                .collect();
                            lines.push(format!(
                                "HuggingFace ({} modelos): {}",
                                provider_state.models.len(),
                                preview.join(", ")
                            ));
                        }
                    }
                    other => lines.push(format!("Proveedor desconocido: {}", other)),
                }

                lines
            }
            CustomCommandAction::ShowGithubSummary => {
                let include_repos = invocation
                    .arg("include")
                    .map(|value| value.split(',').any(|v| v.trim() == "repos"))
                    .unwrap_or(false);

                let mut lines =
                    vec![
                        match (&self.github_username, self.github_repositories.is_empty()) {
                            (Some(username), false) => format!(
                                "GitHub autenticado como {} con {} repositorios sincronizables.",
                                username,
                                self.github_repositories.len()
                            ),
                            (Some(username), true) => format!(
                        "GitHub autenticado como {}, pero no se encontraron repositorios visibles.",
                        username
                    ),
                            _ => "GitHub no está conectado todavía.".to_string(),
                        },
                    ];

                if include_repos && !self.github_repositories.is_empty() {
                    lines.push(format!(
                        "Repositorios: {}",
                        self.github_repositories.join(", ")
                    ));
                }

                lines
            }
            CustomCommandAction::ShowMemorySettings => {
                let detail = invocation.arg("detail").unwrap_or("summary");
                let mut lines = vec![format!(
                    "Memoria contextual {} con retención de {} días.",
                    if self.enable_memory_tracking {
                        "activada"
                    } else {
                        "desactivada"
                    },
                    self.memory_retention_days
                )];

                if detail == "retention" {
                    lines.push("Los recuerdos más antiguos se archivan para mantener el contexto relevante.".to_string());
                }

                lines
            }
            CustomCommandAction::ShowActiveProviders => {
                let include = invocation
                    .arg("include")
                    .map(|value| {
                        value
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let mut lines = vec![format!(
                    "Proveedores activos → OpenAI ({}) · Claude ({}) · Groq ({})",
                    self.resources.openai_default_model,
                    self.resources.claude_default_model,
                    self.resources.groq_default_model
                )];

                if include.iter().any(|s| s == "models") {
                    lines.push(format!(
                        "Jarvis usa {} y hay {} modelos de HuggingFace listos.",
                        self.resources.jarvis_model_path,
                        self.provider_state(LocalModelProvider::HuggingFace)
                            .models
                            .len()
                    ));
                }
                if include.iter().any(|s| s == "status") {
                    lines.push(format!(
                        "Estado de pruebas → OpenAI: {} · Claude: {} · Groq: {}",
                        self.resources
                            .openai_test_status
                            .clone()
                            .unwrap_or_else(|| "sin ejecutar".to_string()),
                        self.resources
                            .anthropic_test_status
                            .clone()
                            .unwrap_or_else(|| "sin ejecutar".to_string()),
                        self.resources
                            .groq_test_status
                            .clone()
                            .unwrap_or_else(|| "sin ejecutar".to_string())
                    ));
                }

                lines
            }
            CustomCommandAction::ShowJarvisStatus => {
                let detail = invocation.arg("detail").unwrap_or("summary");
                let mut lines = vec![format!(
                    "Jarvis en '{}' ({}) → {}",
                    self.resources.jarvis_model_path,
                    if self.resources.jarvis_auto_start {
                        "autoarranque habilitado"
                    } else {
                        "autoarranque deshabilitado"
                    },
                    self.resources
                        .jarvis_status
                        .clone()
                        .unwrap_or_else(|| "Jarvis esperando tareas.".to_string())
                )];

                match detail {
                    "path" => lines.push(format!(
                        "El modelo local se puede actualizar reemplazando el archivo en {}.",
                        self.resources.jarvis_model_path
                    )),
                    "logs" => lines.push("Los registros en tiempo real no están disponibles en modo demo, pero se guardan en /var/log/jarvis.".to_string()),
                    _ => {}
                }

                lines
            }
            CustomCommandAction::ShowCommandHelp => {
                let mode = invocation.arg("mode").unwrap_or("all");
                let mut builtins = vec![
                    "/status",
                    "/system debug",
                    "/models",
                    "/stats",
                    "/reload",
                    "/help",
                    "/if",
                ];
                builtins.extend([
                    "/time",
                    "/projects",
                    "/profiles",
                    "/cache",
                    "/github",
                    "/memory",
                    "/providers",
                    "/jarvis",
                ]);
                let custom: Vec<String> = self
                    .chat
                    .custom_commands
                    .iter()
                    .map(|cmd| cmd.trigger.clone())
                    .collect();

                let mut lines = Vec::new();
                match mode {
                    "builtins" => lines.push(format!("Comandos base: {}", builtins.join(", "))),
                    "custom" => {
                        if custom.is_empty() {
                            lines.push("No hay comandos personalizados.".to_string());
                        } else {
                            lines.push(format!("Comandos personalizados: {}", custom.join(", ")));
                        }
                    }
                    _ => {
                        lines.push(format!("Comandos base: {}", builtins.join(", ")));
                        if custom.is_empty() {
                            lines.push("Comandos personalizados: ninguno configurado.".to_string());
                        } else {
                            lines.push(format!("Comandos personalizados: {}", custom.join(", ")));
                        }
                    }
                }

                if mode == "all" || mode == "builtins" {
                    lines.push(
                        "Utiliza '/if <condición> then <cmd>' para ejecutar lógica condicional."
                            .to_string(),
                    );
                }

                lines
            }
        }
    }
}

pub fn compute_directory_size(path: &Path) -> u64 {
    fn visit(path: &Path, total: &mut u64) {
        match fs::metadata(path) {
            Ok(metadata) if metadata.is_file() => {
                *total += metadata.len();
            }
            Ok(metadata) if metadata.is_dir() => {
                if let Ok(entries) = fs::read_dir(path) {
                    for entry in entries.flatten() {
                        visit(&entry.path(), total);
                    }
                }
            }
            _ => {}
        }
    }

    let mut total = 0u64;
    visit(path, &mut total);
    total
}

pub fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".to_string();
    }

    let mut value = bytes as f64;
    let mut unit_index = 0;

    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.1} {}", value, UNITS[unit_index])
    }
}

enum ConditionValue {
    Boolean(bool),
    Number(f64),
}

impl ConditionValue {
    fn compare(&self, operator: &str, rhs: &str) -> Result<bool, String> {
        match self {
            ConditionValue::Boolean(lhs) => {
                let rhs_bool = match rhs {
                    "true" | "1" => Ok(true),
                    "false" | "0" => Ok(false),
                    _ => Err("Se esperaba un valor booleano (true/false).".to_string()),
                }?;
                match operator {
                    "==" => Ok(*lhs == rhs_bool),
                    "!=" => Ok(*lhs != rhs_bool),
                    _ => Err(format!(
                        "Operador '{}' no soportado para booleanos.",
                        operator
                    )),
                }
            }
            ConditionValue::Number(lhs) => {
                let rhs_num = rhs
                    .parse::<f64>()
                    .map_err(|_| "Se esperaba un número en la comparación.".to_string())?;
                match operator {
                    "==" => Ok((*lhs - rhs_num).abs() < f64::EPSILON),
                    "!=" => Ok((*lhs - rhs_num).abs() >= f64::EPSILON),
                    ">" => Ok(*lhs > rhs_num),
                    ">=" => Ok(*lhs >= rhs_num),
                    "<" => Ok(*lhs < rhs_num),
                    "<=" => Ok(*lhs <= rhs_num),
                    _ => Err(format!(
                        "Operador '{}' no soportado para números.",
                        operator
                    )),
                }
            }
        }
    }
}

impl AppShell for AppState {
    fn init(&mut self, cc: &eframe::CreationContext<'_>) {
        theme::install_fonts(&cc.egui_ctx, self.font_sources.clone());
        theme::apply(&cc.egui_ctx, &self.theme);
    }

    fn update(&mut self, ctx: &eframe::egui::Context) {
        crate::ui::draw_ui(ctx, self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_navigation_sections_are_stable() {
        let registry = build_navigation_registry(&AppConfig::default());
        let sections: Vec<String> = registry
            .sidebar_sections()
            .into_iter()
            .map(|(section, _)| section.id)
            .collect();
        assert_eq!(
            sections,
            vec![
                SECTION_PRIMARY.to_string(),
                SECTION_PREFERENCES_SYSTEM.to_string(),
                SECTION_PREFERENCES_CUSTOMIZATION.to_string(),
                SECTION_PREFERENCES_PROVIDERS.to_string(),
                SECTION_PREFERENCES_LOCAL.to_string(),
                SECTION_RESOURCES_REMOTE.to_string(),
                SECTION_RESOURCES_LOCAL.to_string(),
                SECTION_RESOURCES_INSTALLED.to_string(),
            ]
        );
    }

    #[test]
    fn activating_navigation_updates_state() {
        let mut state = AppState::default();
        assert!(state.activate_navigation_node("pref:custom_commands"));
        assert_eq!(state.active_main_view, MainView::Preferences);
        assert_eq!(
            state.selected_preference,
            PreferencePanel::CustomizationCommands
        );

        assert!(state.activate_navigation_node("resource:remote:Anthropic"));
        assert_eq!(state.active_main_view, MainView::ResourceBrowser);
        assert_eq!(
            state.resources.selected_resource,
            Some(ResourceSection::RemoteCatalog(
                RemoteProviderKind::Anthropic
            ))
        );
    }

    #[test]
    fn modules_can_extend_navigation_registry() {
        let mut state = AppState::default();
        state
            .navigation_registry_mut()
            .register_node(NavigationNode {
                id: "main:custom-hook".into(),
                label: "Hook".into(),
                description: Some("Nodo registrado dinámicamente".into()),
                icon: Some("🧪".into()),
                badge: None,
                target: NavigationTarget::Main {
                    view: MainView::DebugConsole,
                    tab: Some(MainTab::DebugConsole),
                },
                order: 99,
                section_id: SECTION_PRIMARY.to_string(),
            });

        assert!(state.activate_navigation_node("main:custom-hook"));
        assert_eq!(state.active_main_view, MainView::DebugConsole);
    }
}
