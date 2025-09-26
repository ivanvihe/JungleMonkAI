use crate::{
    api::local::JarvisRuntime,
    config::AppConfig,
    local_providers::{LocalModelCard, LocalModelIdentifier, LocalModelProvider},
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// Identifica la sección actualmente seleccionada en el árbol de preferencias.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreferenceSection {
    SystemGithub,
    SystemCache,
    SystemResources,
    CustomizationCommands,
    CustomizationMemory,
    CustomizationProfiles,
    CustomizationProjects,
    ModelsLocalHuggingFace,
    ModelsLocalGithub,
    ModelsLocalReplicate,
    ModelsLocalOllama,
    ModelsLocalOpenRouter,
    ModelsLocalModelscope,
    ModelsLocalSettings,
    ModelsProviderAnthropic,
    ModelsProviderOpenAi,
    ModelsProviderGroq,
}

impl PreferenceSection {
    pub fn title(self) -> &'static str {
        match self {
            PreferenceSection::SystemGithub => "Preferences › System › GitHub for Projects",
            PreferenceSection::SystemCache => "Preferences › System › Cache",
            PreferenceSection::SystemResources => "Preferences › System › System resources",
            PreferenceSection::CustomizationCommands => {
                "Preferences › Customization › Custom commands"
            }
            PreferenceSection::CustomizationMemory => "Preferences › Customization › Memory",
            PreferenceSection::CustomizationProfiles => "Preferences › Customization › Profiles",
            PreferenceSection::CustomizationProjects => "Preferences › Customization › Projects",
            PreferenceSection::ModelsLocalHuggingFace => {
                "Preferences › Models › Local (Jarvis) › HuggingFace"
            }
            PreferenceSection::ModelsLocalGithub => {
                "Preferences › Models › Local (Jarvis) › GitHub Models"
            }
            PreferenceSection::ModelsLocalReplicate => {
                "Preferences › Models › Local (Jarvis) › Replicate"
            }
            PreferenceSection::ModelsLocalOllama => {
                "Preferences › Models › Local (Jarvis) › Ollama"
            }
            PreferenceSection::ModelsLocalOpenRouter => {
                "Preferences › Models › Local (Jarvis) › OpenRouter"
            }
            PreferenceSection::ModelsLocalModelscope => {
                "Preferences › Models › Local (Jarvis) › ModelScope"
            }
            PreferenceSection::ModelsLocalSettings => {
                "Preferences › Models › Local (Jarvis) › Settings"
            }
            PreferenceSection::ModelsProviderAnthropic => {
                "Preferences › Models › Providers › Anthropic"
            }
            PreferenceSection::ModelsProviderOpenAi => "Preferences › Models › Providers › OpenAI",
            PreferenceSection::ModelsProviderGroq => "Preferences › Models › Providers › Groq",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            PreferenceSection::SystemGithub => {
                "Configure GitHub integration, authentication tokens, and project repositories."
            }
            PreferenceSection::SystemCache => {
                "Adjust cache storage, automatic cleanup schedules, and manual maintenance actions."
            }
            PreferenceSection::SystemResources => {
                "Limit how much memory and disk space the agent may allocate for cached data."
            }
            PreferenceSection::CustomizationCommands => {
                "Manage reusable custom commands that are available inside the chat interface."
            }
            PreferenceSection::CustomizationMemory => {
                "Tune how the assistant stores and retains contextual memories across sessions."
            }
            PreferenceSection::CustomizationProfiles => {
                "Switch between predefined profiles and edit their metadata."
            }
            PreferenceSection::CustomizationProjects => {
                "Organize the active projects that the assistant tracks and syncs."
            }
            PreferenceSection::ModelsLocalHuggingFace => {
                "Search for local models published on HuggingFace and install them into Jarvis."
            }
            PreferenceSection::ModelsLocalGithub => {
                "Discover models curated by GitHub and prepare them for the Jarvis runtime."
            }
            PreferenceSection::ModelsLocalReplicate => {
                "Explore Replicate community models that can be exported for offline use."
            }
            PreferenceSection::ModelsLocalOllama => {
                "List and pull Ollama-ready models into the local Jarvis workspace."
            }
            PreferenceSection::ModelsLocalOpenRouter => {
                "Review OpenRouter compatible models and mirror them locally for Jarvis."
            }
            PreferenceSection::ModelsLocalModelscope => {
                "Search ModelScope catalogs and fetch compatible checkpoints for Jarvis."
            }
            PreferenceSection::ModelsLocalSettings => {
                "Configure how the local Jarvis runtime boots and where models are stored."
            }
            PreferenceSection::ModelsProviderAnthropic => {
                "Provide Anthropic credentials and defaults for Claude based workflows."
            }
            PreferenceSection::ModelsProviderOpenAi => {
                "Configure OpenAI access tokens and preferred GPT models."
            }
            PreferenceSection::ModelsProviderGroq => {
                "Enter Groq API keys and select the default Groq-hosted model."
            }
        }
    }
}

impl Default for PreferenceSection {
    fn default() -> Self {
        PreferenceSection::SystemGithub
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MainView {
    ChatMultimodal,
    Preferences,
}

impl Default for MainView {
    fn default() -> Self {
        MainView::ChatMultimodal
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RemoteProviderKind {
    Anthropic,
    OpenAi,
    Groq,
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

pub const AVAILABLE_CUSTOM_ACTIONS: &[CustomCommandAction] = &[
    CustomCommandAction::ShowCurrentTime,
    CustomCommandAction::ShowSystemStatus,
    CustomCommandAction::ShowUsageStatistics,
    CustomCommandAction::ListActiveProjects,
    CustomCommandAction::ListConfiguredProfiles,
    CustomCommandAction::ShowCacheConfiguration,
    CustomCommandAction::ListAvailableModels,
    CustomCommandAction::ShowGithubSummary,
    CustomCommandAction::ShowMemorySettings,
    CustomCommandAction::ShowActiveProviders,
    CustomCommandAction::ShowJarvisStatus,
    CustomCommandAction::ShowCommandHelp,
];

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

/// Contiene el estado global de la aplicación.
pub struct AppState {
    /// Controla la visibilidad de la ventana modal de configuración.
    pub show_settings_modal: bool,
    /// Texto del buscador en el header.
    pub search_buffer: String,
    /// El texto actual en el campo de entrada del chat.
    pub current_chat_input: String,
    /// Historial de mensajes del chat.
    pub chat_messages: Vec<ChatMessage>,
    /// Configuración de la aplicación.
    pub config: AppConfig, // New field
    /// Vista principal activa (chat o live multimodal).
    pub active_main_view: MainView,
    /// Sección de preferencias seleccionada en el árbol lateral.
    pub selected_section: PreferenceSection,
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
    /// Lista de comandos personalizados disponibles.
    pub custom_commands: Vec<CustomCommand>,
    /// Campo auxiliar para agregar un nuevo comando.
    pub new_custom_command: String,
    /// Acción asociada al nuevo comando que se agregará.
    pub new_custom_command_action: CustomCommandAction,
    /// Mensaje de retroalimentación para comandos.
    pub command_feedback: Option<String>,
    /// Controla la visibilidad de la documentación de funciones disponibles.
    pub show_functions_modal: bool,
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
    /// Estado por proveedor del explorador de modelos locales.
    pub local_provider_states: BTreeMap<LocalModelProvider, LocalProviderState>,
    /// Ruta del modelo local de Jarvis.
    pub jarvis_model_path: String,
    /// Directorio donde se instalarán los modelos locales de Jarvis.
    pub jarvis_install_dir: String,
    /// Determina si Jarvis inicia automáticamente.
    pub jarvis_auto_start: bool,
    /// Mensaje de estado sobre la configuración local de Jarvis.
    pub jarvis_status: Option<String>,
    /// Modelos instalados para Jarvis.
    pub installed_local_models: Vec<LocalModelIdentifier>,
    /// Proveedor seleccionado en la sección de configuración local.
    pub jarvis_selected_provider: LocalModelProvider,
    /// Identificador del modelo activo para Jarvis.
    pub jarvis_active_model: Option<LocalModelIdentifier>,
    /// Runtime actualmente cargado del modelo local.
    pub jarvis_runtime: Option<JarvisRuntime>,
    /// Alias que el usuario debe mencionar para despertar a Jarvis en el chat.
    pub jarvis_alias: String,
    /// Permite que Jarvis responda incluso si no se lo menciona explícitamente.
    pub jarvis_respond_without_alias: bool,
    /// Modelo por defecto de Anthropic/Claude.
    pub claude_default_model: String,
    /// Alias configurado para invocar a Claude desde el chat.
    pub claude_alias: String,
    /// Mensaje de prueba de conexión con Anthropic.
    pub anthropic_test_status: Option<String>,
    /// Modelo por defecto de OpenAI.
    pub openai_default_model: String,
    /// Alias configurado para invocar a OpenAI desde el chat.
    pub openai_alias: String,
    /// Mensaje de prueba de conexión con OpenAI.
    pub openai_test_status: Option<String>,
    /// Modelo por defecto de Groq.
    pub groq_default_model: String,
    /// Alias configurado para invocar a Groq desde el chat.
    pub groq_alias: String,
    /// Mensaje de prueba de conexión con Groq.
    pub groq_test_status: Option<String>,
    /// Ramas expandidas del árbol de navegación.
    pub expanded_nav_nodes: BTreeSet<&'static str>,
    /// Determina si el panel de logs inferior está visible.
    pub logs_panel_expanded: bool,
    /// Registros de actividad recientes.
    pub activity_logs: Vec<LogEntry>,
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

        let mut local_provider_states: BTreeMap<LocalModelProvider, LocalProviderState> =
            BTreeMap::new();
        for provider in LocalModelProvider::ALL {
            let mut provider_state = LocalProviderState::from_config(provider, &config);
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

        let installed_local_models: Vec<LocalModelIdentifier> = config
            .jarvis
            .installed_models
            .iter()
            .map(|entry| LocalModelIdentifier::parse(entry))
            .collect();

        let jarvis_active_model = config
            .jarvis
            .active_model
            .as_ref()
            .map(|entry| LocalModelIdentifier::parse(entry))
            .or_else(|| installed_local_models.first().cloned());

        let jarvis_selected_provider = jarvis_active_model
            .as_ref()
            .map(|model| model.provider)
            .unwrap_or(LocalModelProvider::HuggingFace);

        let selected_profile = config
            .selected_profile
            .filter(|idx| profiles.get(*idx).is_some())
            .or(Some(0));
        let selected_project = config
            .selected_project
            .filter(|idx| projects.get(*idx).is_some())
            .or(Some(0));

        let mut expanded_nav_nodes = BTreeSet::new();
        for id in [
            "resources",
            "system",
            "providers",
            "local_model",
            "customization",
        ] {
            expanded_nav_nodes.insert(id);
        }

        let mut state = Self {
            show_settings_modal: false,
            search_buffer: String::new(),
            current_chat_input: String::new(),
            chat_messages: vec![ChatMessage::default()],
            config: config.clone(),
            active_main_view: MainView::default(),
            selected_section: PreferenceSection::default(),
            github_token: config.github_token.unwrap_or_default(),
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
            custom_commands: if config.custom_commands.is_empty() {
                default_custom_commands()
            } else {
                config.custom_commands.clone()
            },
            new_custom_command: String::new(),
            new_custom_command_action: CustomCommandAction::ShowCurrentTime,
            command_feedback: None,
            show_functions_modal: false,
            enable_memory_tracking: config.enable_memory_tracking,
            memory_retention_days: config.memory_retention_days,
            profiles,
            selected_profile,
            projects,
            selected_project,
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
            expanded_nav_nodes,
            logs_panel_expanded: true,
            activity_logs: default_logs(),
        };

        if state.jarvis_auto_start {
            match state.ensure_jarvis_runtime() {
                Ok(runtime) => {
                    state.jarvis_status = Some(format!(
                        "Jarvis iniciado con el modelo {}.",
                        runtime.model_label()
                    ));
                }
                Err(err) => {
                    state.jarvis_status = Some(format!(
                        "No se pudo iniciar Jarvis automáticamente: {}",
                        err
                    ));
                }
            }
        }

        state
    }
}

#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub sender: String,
    pub text: String,
    pub timestamp: String,
}

impl ChatMessage {
    pub fn new(sender: impl Into<String>, text: impl Into<String>) -> Self {
        ChatMessage {
            sender: sender.into(),
            text: text.into(),
            timestamp: Local::now().format("%H:%M:%S").to_string(),
        }
    }

    pub fn system(text: impl Into<String>) -> Self {
        Self::new("System", text)
    }

    pub fn user(text: impl Into<String>) -> Self {
        Self::new("User", text)
    }
}

impl Default for ChatMessage {
    fn default() -> Self {
        ChatMessage::system("Welcome to Multimodal Agent!")
    }
}

pub const MAX_COMMAND_DEPTH: usize = 5;

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

        self.activity_logs.push(entry);
        const MAX_ACTIVITY_LOGS: usize = 200;
        if self.activity_logs.len() > MAX_ACTIVITY_LOGS {
            let overflow = self.activity_logs.len() - MAX_ACTIVITY_LOGS;
            self.activity_logs.drain(0..overflow);
        }
    }

    pub fn provider_state(&self, provider: LocalModelProvider) -> &LocalProviderState {
        self.local_provider_states
            .get(&provider)
            .expect("estado del proveedor no inicializado")
    }

    pub fn provider_state_mut(&mut self, provider: LocalModelProvider) -> &mut LocalProviderState {
        if !self.local_provider_states.contains_key(&provider) {
            self.local_provider_states.insert(
                provider,
                LocalProviderState::from_config(provider, &self.config),
            );
        }
        self.local_provider_states
            .get_mut(&provider)
            .expect("estado del proveedor no inicializado")
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
        self.config.custom_commands = self.custom_commands.clone();
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
        self.config.jarvis.model_path = self.jarvis_model_path.clone();
        self.config.jarvis.install_dir = self.jarvis_install_dir.clone();
        self.config.jarvis.auto_start = self.jarvis_auto_start;
        self.config.jarvis.installed_models = self
            .installed_local_models
            .iter()
            .map(LocalModelIdentifier::serialize)
            .collect();
        self.config.jarvis.active_model = self
            .jarvis_active_model
            .as_ref()
            .map(LocalModelIdentifier::serialize);
        self.config.jarvis.chat_alias = self.jarvis_alias.trim().to_string();
        if self.config.jarvis.chat_alias.is_empty() {
            self.config.jarvis.chat_alias = "jarvis".to_string();
        }
        self.jarvis_alias = self.config.jarvis.chat_alias.clone();
        self.config.jarvis.respond_without_alias = self.jarvis_respond_without_alias;
        self.config.anthropic.default_model = self.claude_default_model.clone();
        self.config.anthropic.alias = self.claude_alias.clone();
        self.config.openai.default_model = self.openai_default_model.clone();
        self.config.openai.alias = self.openai_alias.clone();
        self.config.groq.default_model = self.groq_default_model.clone();
        self.config.groq.alias = self.groq_alias.clone();

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
        if let Err(err) = self.config.save() {
            self.chat_messages.push(ChatMessage::system(format!(
                "No se pudo guardar la configuración: {}",
                err
            )));
        }
    }

    fn jarvis_model_directory(&self) -> Option<PathBuf> {
        let direct_path = self.jarvis_model_path.trim();
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

        self.jarvis_active_model
            .as_ref()
            .map(|model| self.jarvis_model_directory_for(model))
    }

    fn jarvis_model_directory_for(&self, model: &LocalModelIdentifier) -> PathBuf {
        Path::new(&self.jarvis_install_dir).join(model.sanitized_dir_name())
    }

    pub fn ensure_jarvis_runtime(&mut self) -> anyhow::Result<&mut JarvisRuntime> {
        let target_dir = self
            .jarvis_model_directory()
            .ok_or_else(|| anyhow::anyhow!("No hay un modelo local configurado para Jarvis."))?;

        let needs_reload = match &self.jarvis_runtime {
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
                self.jarvis_active_model
                    .as_ref()
                    .map(|model| model.model_id.clone()),
            )?;
            self.jarvis_runtime = Some(runtime);
            self.jarvis_model_path = target_dir.display().to_string();
            let loaded_label = self
                .jarvis_runtime
                .as_ref()
                .map(|runtime| runtime.model_label());
            if let Some(label) = loaded_label {
                self.push_activity_log(
                    LogStatus::Ok,
                    "Jarvis",
                    format!("Modelo {} listo para responder.", label),
                );
                self.jarvis_status = Some(format!(
                    "Jarvis cargó {} desde {}.",
                    label, self.jarvis_model_path
                ));
            }
        }

        Ok(self
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
                        self.jarvis_status =
                            Some(format!("Jarvis responde con el modelo {}.", label));
                        self.push_activity_log(
                            LogStatus::Ok,
                            "Jarvis",
                            format!("Respuesta generada por {}", label),
                        );
                        self.chat_messages.push(ChatMessage::new("Jarvis", reply));
                    }
                    Err(err) => {
                        self.chat_messages.push(ChatMessage::system(format!(
                            "Jarvis no pudo generar respuesta: {}",
                            err
                        )));
                        self.jarvis_status = Some(format!(
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
                self.chat_messages.push(ChatMessage::system(format!(
                    "Jarvis no está listo: {}",
                    err
                )));
                self.jarvis_status = Some(format!("Jarvis no está listo: {}", err));
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

    fn handle_provider_call<F>(
        &mut self,
        provider_kind: RemoteProviderKind,
        alias: String,
        provider_name: &str,
        prompt: String,
        api_key: Option<String>,
        model: String,
        caller: F,
    ) where
        F: Fn(&str, &str, &str) -> anyhow::Result<String>,
    {
        if let Some(key) = api_key {
            self.push_activity_log(
                LogStatus::Running,
                provider_name,
                format!("Consultando '{}' con el alias '{}'.", model, alias),
            );

            match caller(&key, &model, &prompt) {
                Ok(response) => {
                    let snippet: String = response.chars().take(120).collect();
                    *self.provider_status_slot(provider_kind) = Some(format!(
                        "{} respondió correctamente ({} caracteres).",
                        model,
                        response.chars().count()
                    ));
                    self.push_activity_log(
                        LogStatus::Ok,
                        provider_name,
                        format!("Respuesta recibida de '{}': {}", model, snippet),
                    );
                    self.chat_messages
                        .push(ChatMessage::new(alias.clone(), response));
                }
                Err(err) => {
                    *self.provider_status_slot(provider_kind) =
                        Some(format!("Último error: {}", err));
                    self.push_activity_log(
                        LogStatus::Error,
                        provider_name,
                        format!("Fallo al invocar '{}': {}", model, err),
                    );
                    self.chat_messages.push(ChatMessage::system(format!(
                        "{}: error al solicitar respuesta: {}",
                        alias, err
                    )));
                }
            }
        } else {
            self.chat_messages.push(ChatMessage::system(format!(
                "Configura la API key de {} antes de usar el alias '{}'.",
                provider_name, alias
            )));
            *self.provider_status_slot(provider_kind) =
                Some(format!("Falta la API key para {}.", provider_name));
        }
    }

    fn provider_status_slot(&mut self, provider: RemoteProviderKind) -> &mut Option<String> {
        match provider {
            RemoteProviderKind::Anthropic => &mut self.anthropic_test_status,
            RemoteProviderKind::OpenAi => &mut self.openai_test_status,
            RemoteProviderKind::Groq => &mut self.groq_test_status,
        }
    }

    fn invoke_anthropic(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.claude_alias, "claude");
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
            self.claude_default_model.clone(),
            |api_key, model, content| crate::api::claude::send_message(api_key, model, content),
        );
    }

    fn invoke_openai(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.openai_alias, "openai");
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
            self.openai_default_model.clone(),
            |api_key, model, content| crate::api::openai::send_message(api_key, model, content),
        );
    }

    fn invoke_groq(&mut self, prompt: String) {
        let alias = Self::provider_alias_display(&self.groq_alias, "groq");
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
            self.groq_default_model.clone(),
            |api_key, model, content| crate::api::groq::send_message(api_key, model, content),
        );
    }

    pub fn try_route_provider_message(&mut self, input: &str) -> bool {
        if let Some(prompt) = Self::extract_alias_prompt(&self.claude_alias, input) {
            self.invoke_anthropic(prompt);
            return true;
        }

        if let Some(prompt) = Self::extract_alias_prompt(&self.openai_alias, input) {
            self.invoke_openai(prompt);
            return true;
        }

        if let Some(prompt) = Self::extract_alias_prompt(&self.groq_alias, input) {
            self.invoke_groq(prompt);
            return true;
        }

        false
    }

    pub fn try_invoke_jarvis_alias(&mut self, input: &str) -> bool {
        if let Some(prompt) = Self::extract_alias_prompt(&self.jarvis_alias, input) {
            self.respond_with_jarvis(prompt);
            true
        } else {
            false
        }
    }

    pub fn jarvis_mention_tag(&self) -> Option<String> {
        let alias = self.jarvis_alias.trim();
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
            self.chat_messages.push(ChatMessage::system(message));
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
            "/status" | "/system" => CommandOutcome {
                messages: self
                    .execute_custom_action(CustomCommandAction::ShowSystemStatus, &invocation),
            },
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
            "jarvis.auto_start" => Ok(ConditionValue::Boolean(self.jarvis_auto_start)),
            "commands.count" => Ok(ConditionValue::Number(self.custom_commands.len() as f64)),
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
                    self.chat_messages.len(),
                    self.custom_commands.len()
                )];

                if include.iter().any(|s| s == "commands") {
                    lines.push(format!(
                        "Triggers personalizados: {}",
                        self.custom_commands
                            .iter()
                            .map(|cmd| cmd.trigger.clone())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ));
                }

                if include.iter().any(|s| s == "messages") {
                    lines.push(format!(
                        "Último mensaje de usuario: {}",
                        self.chat_messages
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
                        self.openai_default_model
                    )),
                    "anthropic" => lines.push(format!(
                        "Modelo Claude activo: {}",
                        self.claude_default_model
                    )),
                    "groq" => {
                        lines.push(format!("Modelo Groq activo: {}", self.groq_default_model))
                    }
                    "jarvis" => lines.push(format!(
                        "Jarvis está configurado con: {}",
                        self.jarvis_model_path
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
                            self.openai_default_model,
                            self.claude_default_model,
                            self.groq_default_model,
                            self.jarvis_model_path
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
                    self.openai_default_model, self.claude_default_model, self.groq_default_model
                )];

                if include.iter().any(|s| s == "models") {
                    lines.push(format!(
                        "Jarvis usa {} y hay {} modelos de HuggingFace listos.",
                        self.jarvis_model_path,
                        self.provider_state(LocalModelProvider::HuggingFace)
                            .models
                            .len()
                    ));
                }
                if include.iter().any(|s| s == "status") {
                    lines.push(format!(
                        "Estado de pruebas → OpenAI: {} · Claude: {} · Groq: {}",
                        self.openai_test_status
                            .clone()
                            .unwrap_or_else(|| "sin ejecutar".to_string()),
                        self.anthropic_test_status
                            .clone()
                            .unwrap_or_else(|| "sin ejecutar".to_string()),
                        self.groq_test_status
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
                    self.jarvis_model_path,
                    if self.jarvis_auto_start {
                        "autoarranque habilitado"
                    } else {
                        "autoarranque deshabilitado"
                    },
                    self.jarvis_status
                        .clone()
                        .unwrap_or_else(|| "Jarvis esperando tareas.".to_string())
                )];

                match detail {
                    "path" => lines.push(format!(
                        "El modelo local se puede actualizar reemplazando el archivo en {}.",
                        self.jarvis_model_path
                    )),
                    "logs" => lines.push("Los registros en tiempo real no están disponibles en modo demo, pero se guardan en /var/log/jarvis.".to_string()),
                    _ => {}
                }

                lines
            }
            CustomCommandAction::ShowCommandHelp => {
                let mode = invocation.arg("mode").unwrap_or("all");
                let mut builtins = vec!["/status", "/models", "/stats", "/reload", "/help", "/if"];
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
