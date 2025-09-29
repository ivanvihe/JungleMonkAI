use std::collections::BTreeMap;

use super::{
    feature::{CommandRegistry, FeatureModule, WorkbenchRegistry},
    navigation::{NavigationNode, NavigationTarget},
    AnthropicModel, LocalLibraryState, LocalModelCard, LocalModelIdentifier, LocalModelProvider,
    LocalProviderState, NavigationRegistry, PersonalizationResourcesState, ProjectResourceCard,
    ProjectResourceKind, RemoteCatalogState, RemoteProviderKind,
};
use crate::config::AppConfig;
use crate::state::{InstalledLocalModel, JarvisRuntime};

pub struct ResourceState {
    pub selected_resource: Option<super::ResourceSection>,
    pub local_provider_states: BTreeMap<LocalModelProvider, LocalProviderState>,
    pub jarvis_model_path: String,
    pub jarvis_install_dir: String,
    pub jarvis_auto_start: bool,
    pub jarvis_status: Option<String>,
    pub installed_local_models: Vec<InstalledLocalModel>,
    pub jarvis_selected_provider: LocalModelProvider,
    pub jarvis_active_model: Option<LocalModelIdentifier>,
    pub jarvis_runtime: Option<JarvisRuntime>,
    pub jarvis_alias: String,
    pub jarvis_respond_without_alias: bool,
    pub claude_default_model: String,
    pub claude_alias: String,
    pub anthropic_test_status: Option<String>,
    pub claude_available_models: Vec<AnthropicModel>,
    pub claude_models_status: Option<String>,
    pub openai_default_model: String,
    pub openai_alias: String,
    pub openai_test_status: Option<String>,
    pub groq_default_model: String,
    pub groq_alias: String,
    pub groq_test_status: Option<String>,
    pub remote_catalog: RemoteCatalogState,
    pub local_library: LocalLibraryState,
    pub personalization_resources: PersonalizationResourcesState,
    pub personalization_feedback: Option<String>,
    pub project_resources: Vec<ProjectResourceCard>,
}

impl ResourceState {
    pub fn from_config(config: &AppConfig, profiles: &[String], projects: &[String]) -> Self {
        let mut local_provider_states: BTreeMap<LocalModelProvider, LocalProviderState> =
            BTreeMap::new();
        for provider in LocalModelProvider::ALL {
            let mut provider_state = LocalProviderState::from_config(provider, config);
            if provider == LocalModelProvider::HuggingFace
                && provider_state.search_query.trim().is_empty()
            {
                provider_state.models = vec![
                    LocalModelCard::placeholder(
                        LocalModelProvider::HuggingFace,
                        "sentence-transformers/all-MiniLM-L6-v2",
                    ),
                    LocalModelCard::placeholder(
                        LocalModelProvider::HuggingFace,
                        "openai/whisper-small",
                    ),
                    LocalModelCard::placeholder(
                        LocalModelProvider::HuggingFace,
                        "stabilityai/stable-diffusion-xl",
                    ),
                ];
            }
            local_provider_states.insert(provider, provider_state);
        }

        let mut installed_local_models: Vec<InstalledLocalModel> = config
            .jarvis
            .installed_models
            .iter()
            .map(InstalledLocalModel::from_config)
            .collect();
        installed_local_models.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));

        let jarvis_active_model = config
            .jarvis
            .active_model
            .as_ref()
            .map(|value| LocalModelIdentifier::parse(value))
            .or_else(|| {
                installed_local_models
                    .first()
                    .map(|model| model.identifier.clone())
            });

        let jarvis_selected_provider = jarvis_active_model
            .as_ref()
            .map(|model| model.provider)
            .unwrap_or(LocalModelProvider::HuggingFace);

        let personalization_resources =
            PersonalizationResourcesState::from_sources(profiles, projects, &Vec::new());

        Self {
            selected_resource: None,
            local_provider_states,
            jarvis_model_path: config.jarvis.model_path.clone(),
            jarvis_install_dir: config.jarvis.install_dir.clone(),
            jarvis_auto_start: config.jarvis.auto_start,
            jarvis_status: None,
            installed_local_models,
            jarvis_selected_provider,
            jarvis_active_model,
            jarvis_runtime: None,
            jarvis_alias: if config.jarvis.chat_alias.trim().is_empty() {
                "jarvis".to_string()
            } else {
                config.jarvis.chat_alias.clone()
            },
            jarvis_respond_without_alias: config.jarvis.respond_without_alias,
            claude_default_model: if config.anthropic.default_model.is_empty() {
                "claude-3-opus-20240229".to_string()
            } else {
                config.anthropic.default_model.clone()
            },
            claude_alias: if config.anthropic.alias.is_empty() {
                "claude".to_string()
            } else {
                config.anthropic.alias.clone()
            },
            anthropic_test_status: None,
            claude_available_models: Vec::new(),
            claude_models_status: None,
            openai_default_model: if config.openai.default_model.is_empty() {
                "gpt-4.1-mini".to_string()
            } else {
                config.openai.default_model.clone()
            },
            openai_alias: if config.openai.alias.is_empty() {
                "gpt".to_string()
            } else {
                config.openai.alias.clone()
            },
            openai_test_status: None,
            groq_default_model: if config.groq.default_model.is_empty() {
                "llama3-70b-8192".to_string()
            } else {
                config.groq.default_model.clone()
            },
            groq_alias: if config.groq.alias.is_empty() {
                "groq".to_string()
            } else {
                config.groq.alias.clone()
            },
            groq_test_status: None,
            remote_catalog: RemoteCatalogState::default(),
            local_library: LocalLibraryState::default(),
            personalization_resources,
            personalization_feedback: None,
            project_resources: super::default_project_resources(),
        }
    }

    pub fn ensure_library_selection(&mut self) {
        if self.local_library.selection.is_none() {
            self.local_library.selection = self.jarvis_active_model.clone();
        }
    }

    pub fn project_resources_by_kind(&self, kind: ProjectResourceKind) -> Vec<ProjectResourceCard> {
        self.project_resources
            .iter()
            .filter(|card| card.kind == kind)
            .cloned()
            .collect()
    }
}

impl FeatureModule for ResourceState {
    fn register_navigation(&self, registry: &mut NavigationRegistry) {
        let remote_providers = [
            RemoteProviderKind::Anthropic,
            RemoteProviderKind::OpenAi,
            RemoteProviderKind::Groq,
        ];

        for (index, provider) in remote_providers.into_iter().enumerate() {
            let section = super::ResourceSection::RemoteCatalog(provider);
            let metadata = section.metadata();
            let label = metadata
                .breadcrumb
                .last()
                .copied()
                .unwrap_or(metadata.title);
            let target = NavigationTarget::resource(section);
            registry.register_node(NavigationNode {
                id: target.id(),
                label: label.to_string(),
                description: Some(metadata.description.to_string()),
                icon: Some("☁️".into()),
                badge: None,
                target,
                order: index as u32,
                section_id: super::SECTION_RESOURCES_REMOTE.to_string(),
            });
        }

        for (index, provider) in LocalModelProvider::ALL.iter().enumerate() {
            let section = super::ResourceSection::LocalCatalog(*provider);
            let metadata = section.metadata();
            let label = metadata
                .breadcrumb
                .last()
                .copied()
                .unwrap_or(metadata.title);
            let target = NavigationTarget::resource(section);
            registry.register_node(NavigationNode {
                id: target.id(),
                label: label.to_string(),
                description: Some(metadata.description.to_string()),
                icon: Some("💾".into()),
                badge: None,
                target,
                order: index as u32,
                section_id: super::SECTION_RESOURCES_LOCAL.to_string(),
            });
        }

        let installed_nodes = [
            (
                super::ResourceSection::InstalledLocal,
                "📦",
                "Modelos y recursos ya disponibles en Jarvis",
                0u32,
            ),
            (
                super::ResourceSection::ConnectedProjects,
                "🗂️",
                "Proyectos conectados y su estado de sincronización",
                1u32,
            ),
            (
                super::ResourceSection::GithubRepositories,
                "📁",
                "Repositorios disponibles desde GitHub",
                2u32,
            ),
        ];

        for (section, icon, description, order) in installed_nodes {
            let metadata = section.metadata();
            let label = metadata
                .breadcrumb
                .last()
                .copied()
                .unwrap_or(metadata.title);
            let target = NavigationTarget::resource(section);
            registry.register_node(NavigationNode {
                id: target.id(),
                label: label.to_string(),
                description: Some(description.into()),
                icon: Some(icon.into()),
                badge: None,
                target,
                order,
                section_id: super::SECTION_RESOURCES_INSTALLED.to_string(),
            });
        }
    }

    fn register_commands(&self, registry: &mut CommandRegistry) {
        registry.extend([
            super::CustomCommandAction::ListAvailableModels,
            super::CustomCommandAction::ShowJarvisStatus,
            super::CustomCommandAction::ShowActiveProviders,
        ]);
    }

    fn register_workbench_views(&self, registry: &mut WorkbenchRegistry) {
        crate::ui::chat::register_resource_workbench_view(registry);
    }
}
