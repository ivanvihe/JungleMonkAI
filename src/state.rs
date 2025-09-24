use crate::config::AppConfig; // New import
use chrono::Local;

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
    LiveMultimodal,
}

impl Default for MainView {
    fn default() -> Self {
        MainView::ChatMultimodal
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

#[derive(Clone)]
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

/// Contiene el estado global de la aplicación.
pub struct AppState {
    /// Controla la visibilidad de la ventana modal de configuración.
    pub show_settings_modal: bool,
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
    /// Consulta actual para buscar modelos en HuggingFace.
    pub huggingface_search_query: String,
    /// Resultados disponibles en HuggingFace.
    pub huggingface_models: Vec<String>,
    /// Modelo seleccionado dentro de HuggingFace.
    pub selected_huggingface_model: Option<usize>,
    /// Mensaje de estado tras intentar instalar un modelo local.
    pub huggingface_install_status: Option<String>,
    /// Ruta del modelo local de Jarvis.
    pub jarvis_model_path: String,
    /// Determina si Jarvis inicia automáticamente.
    pub jarvis_auto_start: bool,
    /// Mensaje de estado sobre la configuración local de Jarvis.
    pub jarvis_status: Option<String>,
    /// Modelo por defecto de Anthropic/Claude.
    pub claude_default_model: String,
    /// Mensaje de prueba de conexión con Anthropic.
    pub anthropic_test_status: Option<String>,
    /// Modelo por defecto de OpenAI.
    pub openai_default_model: String,
    /// Mensaje de prueba de conexión con OpenAI.
    pub openai_test_status: Option<String>,
    /// Modelo por defecto de Groq.
    pub groq_default_model: String,
    /// Mensaje de prueba de conexión con Groq.
    pub groq_test_status: Option<String>,
    /// Eventos recientes del panel live multimodal.
    pub live_events: Vec<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            show_settings_modal: false,
            current_chat_input: String::new(),
            chat_messages: vec![ChatMessage::default()],
            config: AppConfig::default(),
            active_main_view: MainView::default(),
            selected_section: PreferenceSection::default(),
            github_token: String::new(),
            github_username: None,
            github_repositories: Vec::new(),
            selected_github_repo: None,
            github_connection_status: None,
            cache_directory: "/var/tmp/jungle/cache".to_string(),
            cache_size_limit_gb: 8.0,
            enable_auto_cleanup: true,
            cache_cleanup_interval_hours: 24,
            last_cache_cleanup: None,
            resource_memory_limit_gb: 32.0,
            resource_disk_limit_gb: 128.0,
            custom_commands: vec![
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
            ],
            new_custom_command: String::new(),
            new_custom_command_action: CustomCommandAction::ShowCurrentTime,
            command_feedback: None,
            enable_memory_tracking: true,
            memory_retention_days: 30,
            profiles: vec![
                "Default".to_string(),
                "Research".to_string(),
                "Operations".to_string(),
            ],
            selected_profile: Some(0),
            projects: vec!["Autonomous Agent".to_string(), "RAG Pipeline".to_string()],
            selected_project: Some(0),
            huggingface_search_query: String::new(),
            huggingface_models: vec![
                "sentence-transformers/all-MiniLM-L6-v2".to_string(),
                "openai/whisper-small".to_string(),
                "stabilityai/stable-diffusion-xl".to_string(),
            ],
            selected_huggingface_model: None,
            huggingface_install_status: None,
            jarvis_model_path: "/models/jarvis/latest.bin".to_string(),
            jarvis_auto_start: true,
            jarvis_status: None,
            claude_default_model: "claude-3-opus".to_string(),
            anthropic_test_status: None,
            openai_default_model: "gpt-4.1-mini".to_string(),
            openai_test_status: None,
            groq_default_model: "llama3-70b-8192".to_string(),
            groq_test_status: None,
            live_events: vec![
                "Agent boot sequence completed.".to_string(),
                "Connected to OpenAI, Anthropic and Groq providers.".to_string(),
                "Jarvis local runtime idle. Awaiting first job.".to_string(),
            ],
        }
    }
}

// Define ChatMessage struct
pub struct ChatMessage {
    pub sender: String,
    pub text: String,
}

impl Default for ChatMessage {
    fn default() -> Self {
        ChatMessage {
            sender: "System".to_string(),
            text: "Welcome to Multimodal Agent!".to_string(),
        }
    }
}

impl AppState {
    pub fn handle_command(&mut self, command_input: String) {
        let trimmed = command_input.trim();
        if trimmed.is_empty() {
            return;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            return;
        }

        let command = parts[0];

        if let Some(custom) = self
            .custom_commands
            .iter()
            .find(|cmd| cmd.trigger == command)
        {
            let response = self.execute_custom_action(custom.action);
            self.chat_messages.push(ChatMessage {
                sender: "System".to_string(),
                text: response,
            });
            return;
        }

        let response = match command {
            "/status" | "/system" => {
                Some(self.execute_custom_action(CustomCommandAction::ShowSystemStatus))
            }
            "/models" => {
                Some(self.execute_custom_action(CustomCommandAction::ListAvailableModels))
            }
            "/stats" => {
                Some(self.execute_custom_action(CustomCommandAction::ShowUsageStatistics))
            }
            "/reload" => Some(
                "Recargando configuraciones... Los proveedores y la caché se sincronizarán en segundo plano.".to_string(),
            ),
            "/help" => {
                Some(self.execute_custom_action(CustomCommandAction::ShowCommandHelp))
            }
            _ => None,
        };

        if let Some(message) = response {
            self.chat_messages.push(ChatMessage {
                sender: "System".to_string(),
                text: message,
            });
        } else {
            self.chat_messages.push(ChatMessage {
                sender: "System".to_string(),
                text: format!("Unknown command: {}", trimmed),
            });
        }
    }
}

impl AppState {
    pub fn execute_custom_action(&self, action: CustomCommandAction) -> String {
        match action {
            CustomCommandAction::ShowCurrentTime => {
                let now = Local::now();
                let formatted = now.format("%I:%M %p").to_string();
                let normalized = formatted
                    .trim_start_matches('0')
                    .replace(' ', "")
                    .to_lowercase();
                format!("Son las {}.", normalized)
            }
            CustomCommandAction::ShowSystemStatus => {
                format!(
                    "Sistema operativo estable. Límites configurados → Memoria: {:.1} GB · Disco: {:.1} GB.",
                    self.resource_memory_limit_gb, self.resource_disk_limit_gb
                )
            }
            CustomCommandAction::ShowUsageStatistics => {
                let total_messages = self.chat_messages.len();
                let custom_count = self.custom_commands.len();
                format!(
                    "Estadísticas de uso: {} mensajes registrados en esta sesión y {} comandos personalizados disponibles.",
                    total_messages, custom_count
                )
            }
            CustomCommandAction::ListActiveProjects => {
                if self.projects.is_empty() {
                    "No hay proyectos configurados actualmente.".to_string()
                } else {
                    format!("Proyectos activos: {}.", self.projects.join(", "))
                }
            }
            CustomCommandAction::ListConfiguredProfiles => {
                if self.profiles.is_empty() {
                    "No hay perfiles configurados.".to_string()
                } else {
                    format!("Perfiles disponibles: {}.", self.profiles.join(", "))
                }
            }
            CustomCommandAction::ShowCacheConfiguration => {
                format!(
                    "Caché en '{}', límite {:.1} GB con limpieza automática cada {} h.",
                    self.cache_directory,
                    self.cache_size_limit_gb,
                    self.cache_cleanup_interval_hours
                )
            }
            CustomCommandAction::ListAvailableModels => {
                let hf_preview = if self.huggingface_models.is_empty() {
                    "sin resultados".to_string()
                } else {
                    self.huggingface_models
                        .iter()
                        .take(3)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ")
                };

                format!(
                    "Modelos configurados → OpenAI: {} · Claude: {} · Groq: {} · Jarvis: {} · HuggingFace: {}",
                    self.openai_default_model,
                    self.claude_default_model,
                    self.groq_default_model,
                    self.jarvis_model_path,
                    hf_preview
                )
            }
            CustomCommandAction::ShowGithubSummary => {
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
                }
            }
            CustomCommandAction::ShowMemorySettings => {
                let status = if self.enable_memory_tracking {
                    "activada"
                } else {
                    "desactivada"
                };
                format!(
                    "Memoria contextual {} con retención de {} días.",
                    status, self.memory_retention_days
                )
            }
            CustomCommandAction::ShowActiveProviders => {
                format!(
                    "Proveedores activos → OpenAI ({}) · Claude ({}) · Groq ({})",
                    self.openai_default_model, self.claude_default_model, self.groq_default_model
                )
            }
            CustomCommandAction::ShowJarvisStatus => {
                let auto_start = if self.jarvis_auto_start {
                    "autoarranque habilitado"
                } else {
                    "autoarranque deshabilitado"
                };
                let status = self
                    .jarvis_status
                    .clone()
                    .unwrap_or_else(|| "Jarvis esperando tareas.".to_string());
                format!(
                    "Jarvis en '{}' ({}) → {}",
                    self.jarvis_model_path, auto_start, status
                )
            }
            CustomCommandAction::ShowCommandHelp => {
                let mut commands = vec!["/status", "/models", "/stats", "/reload", "/help"];
                commands.extend(self.custom_commands.iter().map(|cmd| cmd.trigger.as_str()));
                format!("Comandos disponibles: {}.", commands.join(", "))
            }
        }
    }
}
