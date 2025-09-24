use crate::config::AppConfig; // New import

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
    /// Sección de preferencias seleccionada en el árbol lateral.
    pub selected_section: PreferenceSection,
    /// Token de acceso personal de GitHub.
    pub github_token: String,
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
    pub custom_commands: Vec<String>,
    /// Campo auxiliar para agregar un nuevo comando.
    pub new_custom_command: String,
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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            show_settings_modal: false,
            current_chat_input: String::new(),
            chat_messages: vec![ChatMessage::default()],
            config: AppConfig::default(),
            selected_section: PreferenceSection::default(),
            github_token: String::new(),
            github_repositories: vec![
                "agent-platform".to_string(),
                "knowledge-graph".to_string(),
                "workspace-sync".to_string(),
            ],
            selected_github_repo: None,
            github_connection_status: None,
            cache_directory: "/var/tmp/jungle/cache".to_string(),
            cache_size_limit_gb: 8.0,
            enable_auto_cleanup: true,
            cache_cleanup_interval_hours: 24,
            last_cache_cleanup: None,
            resource_memory_limit_gb: 32.0,
            resource_disk_limit_gb: 128.0,
            custom_commands: vec!["/summarize".to_string(), "/deploy".to_string()],
            new_custom_command: String::new(),
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
        let parts: Vec<&str> = command_input.trim().splitn(2, ' ').collect();
        let command = parts[0];
        let _args = parts.get(1).unwrap_or(&"");

        match command {
            "/status" => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: "Status: All systems nominal.".to_string(),
                });
            }
            "/models" => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: "Available models: OpenAI, Claude, Groq, HuggingFace, Jarvis (local)."
                        .to_string(),
                });
            }
            "/system" => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: "System information: [Placeholder for system info]".to_string(),
                });
            }
            "/stats" => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: "Usage statistics: [Placeholder for usage stats]".to_string(),
                });
            }
            "/reload" => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: "Reloading configurations... (Placeholder)".to_string(),
                });
            }
            _ => {
                self.chat_messages.push(ChatMessage {
                    sender: "System".to_string(),
                    text: format!("Unknown command: {}", command_input),
                });
            }
        }
    }
}
