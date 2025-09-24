use crate::config::AppConfig; // New import
use chrono::Local;
use std::collections::{BTreeMap, BTreeSet};

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
    Preferences,
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
            show_functions_modal: false,
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
            self.chat_messages.push(ChatMessage {
                sender: "System".to_string(),
                text: message,
            });
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
                        if self.huggingface_models.is_empty() {
                            lines.push("No hay modelos de HuggingFace registrados.".to_string());
                        } else {
                            lines.push(format!(
                                "Modelos de HuggingFace: {}",
                                self.huggingface_models.join(", ")
                            ));
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
                        if self.huggingface_models.is_empty() {
                            lines.push("HuggingFace: sin resultados cargados.".to_string());
                        } else {
                            lines.push(format!(
                                "HuggingFace ({} modelos): {}",
                                self.huggingface_models.len(),
                                self.huggingface_models
                                    .iter()
                                    .take(5)
                                    .cloned()
                                    .collect::<Vec<_>>()
                                    .join(", ")
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
                        self.huggingface_models.len()
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
