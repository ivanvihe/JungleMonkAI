/// Contiene el estado global de la aplicación.
#[derive(Default)]
pub struct AppState {
    /// Controla la visibilidad de la ventana modal de configuración.
    pub show_settings_modal: bool,
    /// El texto actual en el campo de entrada del chat.
    pub current_chat_input: String,
    /// Historial de mensajes del chat.
    pub chat_messages: Vec<ChatMessage>,
    // Aquí irían otros estados, como:
    // pub current_model: Option<String>,
    // pub active_chat: Vec<ChatMessage>,
    // pub github_repos: Vec<Repo>,
    // pub api_keys: ApiKeys,
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
                    text: "Available models: OpenAI, Claude, Groq, HuggingFace, Jarvis (local).".to_string(),
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
