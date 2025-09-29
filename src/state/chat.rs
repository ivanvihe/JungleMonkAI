use std::sync::mpsc::{self, Receiver, Sender};

use super::{
    feature::{CommandRegistry, FeatureModule, WorkbenchRegistry},
    navigation::NavigationNode,
    ChatMessage, ChatRoutingState, CustomCommand, CustomCommandAction, LocalInstallMessage,
    MainView, NavigationRegistry, NavigationTarget, PendingLocalInstall, PendingProviderCall,
    ProviderResponse, SECTION_PRIMARY,
};
use crate::config::AppConfig;

pub struct ChatState {
    pub input: String,
    pub messages: Vec<ChatMessage>,
    pub custom_commands: Vec<CustomCommand>,
    pub new_command: String,
    pub new_command_action: CustomCommandAction,
    pub command_feedback: Option<String>,
    pub show_functions_modal: bool,
    pub routing: ChatRoutingState,
    pub pending_copy_conversation: bool,
    pub provider_response_rx: Receiver<ProviderResponse>,
    pub provider_response_tx: Sender<ProviderResponse>,
    pub local_install_rx: Receiver<LocalInstallMessage>,
    pub local_install_tx: Sender<LocalInstallMessage>,
    pub pending_local_installs: Vec<PendingLocalInstall>,
    pub pending_provider_calls: Vec<PendingProviderCall>,
    pub next_provider_call_id: u64,
}

impl ChatState {
    pub fn from_config(config: &AppConfig) -> Self {
        let (provider_response_tx, provider_response_rx) = mpsc::channel();
        let (local_install_tx, local_install_rx) = mpsc::channel();

        let mut state = Self {
            input: String::new(),
            messages: vec![ChatMessage::default()],
            custom_commands: if config.custom_commands.is_empty() {
                super::default_custom_commands()
            } else {
                config.custom_commands.clone()
            },
            new_command: String::new(),
            new_command_action: CustomCommandAction::ShowCurrentTime,
            command_feedback: None,
            show_functions_modal: false,
            routing: ChatRoutingState::default(),
            pending_copy_conversation: false,
            provider_response_rx,
            provider_response_tx,
            local_install_rx,
            local_install_tx,
            pending_local_installs: Vec::new(),
            pending_provider_calls: Vec::new(),
            next_provider_call_id: 0,
        };

        let routing_hint = state.routing.status.clone().unwrap_or_else(|| {
            "Menciona @claude, @openai o @groq para enrutar tus mensajes. Jarvis responderá automáticamente etiquetando sus respuestas con @jarvis.".to_string()
        });
        state.routing.update_status(Some(routing_hint.clone()));
        state
            .messages
            .push(ChatMessage::system(routing_hint.clone()));

        state
    }

    pub fn available_actions(&self) -> impl Iterator<Item = CustomCommandAction> + '_ {
        DEFAULT_CUSTOM_ACTIONS.iter().copied()
    }

    pub fn current_route_display(&self) -> String {
        self.routing
            .status
            .clone()
            .unwrap_or_else(|| "Rutas disponibles mediante menciones".to_string())
    }
}

impl FeatureModule for ChatState {
    fn register_navigation(&self, registry: &mut NavigationRegistry) {
        let target = NavigationTarget::main(MainView::ChatMultimodal);
        registry.register_node(NavigationNode {
            id: target.id(),
            label: "Chat multimodal".into(),
            description: Some("Conversa con JungleMonkAI en modo multimodal.".into()),
            icon: Some("💬".into()),
            badge: None,
            target,
            order: 0,
            section_id: SECTION_PRIMARY.to_string(),
        });
    }

    fn register_commands(&self, registry: &mut CommandRegistry) {
        registry.extend(self.available_actions());
    }

    fn register_workbench_views(&self, registry: &mut WorkbenchRegistry) {
        crate::ui::chat::register_chat_workbench_view(registry);
    }
}

pub const DEFAULT_CUSTOM_ACTIONS: &[CustomCommandAction] = &[
    CustomCommandAction::ShowCurrentTime,
    CustomCommandAction::ShowSystemStatus,
    CustomCommandAction::ShowSystemDiagnostics,
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
