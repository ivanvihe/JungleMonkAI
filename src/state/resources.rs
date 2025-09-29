use std::collections::BTreeMap;

use chrono::{Local, NaiveDate};

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
    pub provider_usage: BTreeMap<RemoteProviderKind, ProviderUsageState>,
    pub deferred_requests: Vec<DeferredProviderRequest>,
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

        let mut provider_usage = BTreeMap::new();
        provider_usage.insert(
            RemoteProviderKind::Anthropic,
            ProviderUsageState::from_limit(config.anthropic.daily_limit),
        );
        provider_usage.insert(
            RemoteProviderKind::OpenAi,
            ProviderUsageState::from_limit(config.openai.daily_limit),
        );
        provider_usage.insert(
            RemoteProviderKind::Groq,
            ProviderUsageState::from_limit(config.groq.daily_limit),
        );

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
            provider_usage,
            deferred_requests: Vec::new(),
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

    pub fn usage_state_mut(&mut self, provider: RemoteProviderKind) -> &mut ProviderUsageState {
        self.provider_usage
            .entry(provider)
            .or_insert_with(|| ProviderUsageState::from_limit(None))
    }

    pub fn try_acquire_provider_quota(
        &mut self,
        provider: RemoteProviderKind,
        alias: &str,
        prompt: &str,
        model: &str,
    ) -> Result<ProviderUsageSnapshot, ProviderQuotaExceeded> {
        let usage = self.usage_state_mut(provider);
        usage.refresh_if_needed();
        if let Some(limit) = usage.daily_limit {
            if usage.calls_today >= limit {
                let exceeded = ProviderQuotaExceeded {
                    limit,
                    used: usage.calls_today,
                    provider,
                    alias: alias.to_string(),
                    model: model.to_string(),
                    prompt: prompt.to_string(),
                    created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                };
                self.deferred_requests
                    .push(DeferredProviderRequest::from_exceeded(&exceeded));
                return Err(exceeded);
            }
        }

        usage.calls_today += 1;
        Ok(ProviderUsageSnapshot {
            used: usage.calls_today,
            limit: usage.daily_limit,
        })
    }
}

#[derive(Clone, Debug)]
pub struct ProviderUsageState {
    pub daily_limit: Option<u32>,
    pub calls_today: u32,
    pub last_reset: NaiveDate,
}

impl ProviderUsageState {
    pub fn from_limit(limit: Option<u32>) -> Self {
        Self {
            daily_limit: limit,
            calls_today: 0,
            last_reset: Local::now().date_naive(),
        }
    }

    fn refresh_if_needed(&mut self) {
        let today = Local::now().date_naive();
        if today != self.last_reset {
            self.calls_today = 0;
            self.last_reset = today;
        }
    }
}

#[derive(Clone, Debug)]
pub struct ProviderUsageSnapshot {
    pub used: u32,
    pub limit: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct ProviderQuotaExceeded {
    pub provider: RemoteProviderKind,
    pub limit: u32,
    pub used: u32,
    pub alias: String,
    pub model: String,
    pub prompt: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct DeferredProviderRequest {
    pub provider: RemoteProviderKind,
    pub alias: String,
    pub model: String,
    pub prompt: String,
    pub created_at: String,
}

impl DeferredProviderRequest {
    fn from_exceeded(exceeded: &ProviderQuotaExceeded) -> Self {
        Self {
            provider: exceeded.provider,
            alias: exceeded.alias.clone(),
            model: exceeded.model.clone(),
            prompt: exceeded.prompt.clone(),
            created_at: exceeded.created_at.clone(),
        }
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
