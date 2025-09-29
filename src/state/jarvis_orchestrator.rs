use std::time::Duration;

use chrono::Local;
use regex::Regex;

use super::{
    AppState, ChatMessage, LogStatus, ProviderCallDispatch, ProviderCallResult, ProviderCallTicket,
    RemoteProviderKind, ScheduledTask, ScheduledTaskStatus,
};

pub struct JarvisOrchestrator<'a> {
    state: &'a mut AppState,
    executed_commands: Vec<String>,
    scheduled_tasks: Vec<ScheduledTask>,
    blocked_messages: Vec<String>,
}

impl<'a> JarvisOrchestrator<'a> {
    pub fn new(state: &'a mut AppState) -> Self {
        Self {
            state,
            executed_commands: Vec::new(),
            scheduled_tasks: Vec::new(),
            blocked_messages: Vec::new(),
        }
    }

    pub fn execute(&mut self, instruction: String) {
        let trimmed = instruction.trim();
        if trimmed.is_empty() {
            return;
        }

        let targets = self.resolve_targets(trimmed);
        self.capture_commands(trimmed);
        let provider_hint = targets.first().copied();
        self.try_schedule_task(trimmed, provider_hint);

        let (tickets, blocked) = self.dispatch_requests(trimmed, &targets);
        self.blocked_messages.extend(blocked);
        let results = if tickets.is_empty() {
            Vec::new()
        } else {
            self.state
                .wait_for_provider_calls(&tickets, Duration::from_secs(45))
        };

        let local_reply = self.state.generate_local_jarvis_reply(trimmed);
        self.emit_summary(trimmed, results, local_reply);
    }

    fn resolve_targets(&self, instruction: &str) -> Vec<RemoteProviderKind> {
        let mut targets = Vec::new();
        let lower = instruction.to_lowercase();
        let alias_entries = [
            (
                RemoteProviderKind::Anthropic,
                self.state.resources.claude_alias.clone(),
            ),
            (
                RemoteProviderKind::OpenAi,
                self.state.resources.openai_alias.clone(),
            ),
            (
                RemoteProviderKind::Groq,
                self.state.resources.groq_alias.clone(),
            ),
        ];

        for (kind, alias) in alias_entries {
            let mut variants = Vec::new();
            let sanitized = alias.trim().trim_start_matches('@').to_lowercase();
            if !sanitized.is_empty() {
                variants.push(sanitized);
            }
            variants.push(kind.short_code().to_lowercase());
            variants.push(kind.display_name().to_lowercase());

            if variants
                .iter()
                .filter(|value| !value.is_empty())
                .any(|candidate| lower.contains(candidate))
            {
                if !targets.contains(&kind) {
                    targets.push(kind);
                }
            }
        }

        targets
    }

    fn capture_commands(&mut self, instruction: &str) {
        let command_re = Regex::new(r"(?m)/[A-Za-z0-9_-]+[^\n;]*").ok();
        if let Some(regex) = command_re {
            for capture in regex.find_iter(instruction) {
                let command = capture.as_str().trim().to_string();
                if command.is_empty() {
                    continue;
                }
                self.state.handle_command(command.clone());
                self.executed_commands.push(command);
            }
        }
    }

    fn try_schedule_task(&mut self, instruction: &str, provider_hint: Option<RemoteProviderKind>) {
        let schedule_re = Regex::new(
            r"(?i)(programa|agenda|schedule)\s+(?P<name>[^.]+?)(?:\s+para\s+|\s+)(?:cada|todos?\s+los|todas?\s+las)\s+(?P<cadence>[^.;]+)",
        )
        .ok();

        if let Some(regex) = schedule_re {
            if let Some(captures) = regex.captures(instruction) {
                let name = captures
                    .name("name")
                    .map(|m| m.as_str().trim())
                    .filter(|value| !value.is_empty());
                let cadence = captures
                    .name("cadence")
                    .map(|m| m.as_str().trim())
                    .filter(|value| !value.is_empty());

                if let (Some(name), Some(cadence)) = (name, cadence) {
                    let (cron_expression, cadence_label) = Self::cron_from_cadence(cadence);
                    let next_id = self
                        .state
                        .automation
                        .cron_board
                        .tasks
                        .iter()
                        .map(|task| task.id)
                        .max()
                        .unwrap_or(0)
                        + 1;
                    let task = ScheduledTask {
                        id: next_id,
                        name: name.to_string(),
                        description: format!(
                            "Creado automáticamente por Jarvis a partir de: {}",
                            instruction.trim()
                        ),
                        cron_expression: cron_expression.clone(),
                        cadence_label: cadence_label.clone(),
                        last_run: None,
                        next_run: Some(Local::now().format("%Y-%m-%d %H:%M").to_string()),
                        status: ScheduledTaskStatus::Scheduled,
                        owner: "Jarvis".to_string(),
                        provider: provider_hint,
                        tags: vec!["jarvis".to_string(), "automation".to_string()],
                        enabled: true,
                    };
                    self.state.automation.cron_board.tasks.push(task.clone());
                    self.scheduled_tasks.push(task);
                    self.state.push_activity_log(
                        LogStatus::Ok,
                        "Jarvis Orchestrator",
                        format!(
                            "Tarea '{}' programada automáticamente con cadencia {}.",
                            name, cadence_label
                        ),
                    );
                }
            }
        }
    }

    fn cron_from_cadence(cadence: &str) -> (String, String) {
        let lower = cadence.to_lowercase();
        if lower.contains("hora") {
            ("0 * * * *".to_string(), "Cada hora".to_string())
        } else if lower.contains("semana") {
            ("0 9 * * 1".to_string(), "Semanal".to_string())
        } else if lower.contains("mes") {
            ("0 9 1 * *".to_string(), "Mensual".to_string())
        } else if let Some(time_match) = Regex::new(r"(\d{1,2}):(\d{2})")
            .ok()
            .and_then(|re| re.captures(&lower))
        {
            let hour = time_match.get(1).map(|m| m.as_str()).unwrap_or("9");
            let minute = time_match.get(2).map(|m| m.as_str()).unwrap_or("00");
            (
                format!("{} {} * * *", minute, hour),
                format!("Diario a las {}:{}", hour, minute),
            )
        } else {
            ("0 9 * * *".to_string(), "Diario".to_string())
        }
    }

    fn dispatch_requests(
        &mut self,
        instruction: &str,
        targets: &[RemoteProviderKind],
    ) -> (Vec<ProviderCallTicket>, Vec<String>) {
        let mut tickets = Vec::new();
        let mut blocked = Vec::new();

        for provider in targets {
            let prompt = self.build_prompt(*provider, instruction);
            match self.state.invoke_provider_kind(*provider, prompt) {
                ProviderCallDispatch::Pending(ticket) => tickets.push(ticket),
                ProviderCallDispatch::Deferred {
                    provider_kind,
                    provider_name,
                    alias,
                    model,
                    limit,
                    used,
                    created_at,
                } => blocked.push(format!(
                    "{} (@{}) diferido ({}) por alcanzar {}/{} usos diarios [{}] a las {}.",
                    provider_name,
                    alias,
                    model,
                    used,
                    limit,
                    provider_kind.short_code(),
                    created_at
                )),
                ProviderCallDispatch::MissingCredentials {
                    provider_kind,
                    provider_name,
                    alias,
                } => blocked.push(format!(
                    "{} (@{}) requiere credenciales válidas para {}.",
                    provider_name,
                    alias,
                    provider_kind.display_name()
                )),
            }
        }

        (tickets, blocked)
    }

    fn build_prompt(&self, provider: RemoteProviderKind, instruction: &str) -> String {
        format!(
            "Jarvis solicita tu ayuda como {}. Analiza la petición del usuario y devuelve hallazgos clave con atribuciones cuando sea posible. Instrucción: {}",
            provider.display_name(),
            instruction.trim()
        )
    }

    fn emit_summary(
        &mut self,
        instruction: &str,
        results: Vec<ProviderCallResult>,
        local_reply: Result<String, String>,
    ) {
        let mut lines = Vec::new();
        lines.push(format!("Resumen para \"{}\":", instruction));

        match &local_reply {
            Ok(reply) => lines.push(format!("• Perspectiva local: {}", Self::summarize(reply))),
            Err(err) => lines.push(format!("• Perspectiva local: no disponible ({})", err)),
        }

        if !results.is_empty() {
            lines.push("• Contribuciones externas:".to_string());
            for result in &results {
                match &result.outcome {
                    Ok(text) => lines.push(format!(
                        "  - {} (@{}): {}",
                        result.ticket.provider_name,
                        result.ticket.alias,
                        Self::summarize(text)
                    )),
                    Err(err) => lines.push(format!(
                        "  - {} (@{}): error {}",
                        result.ticket.provider_name, result.ticket.alias, err
                    )),
                }
            }
        }

        if !self.blocked_messages.is_empty() {
            lines.push("• Solicitudes diferidas:".to_string());
            for message in &self.blocked_messages {
                lines.push(format!("  - {}", message));
            }
        }

        if !self.scheduled_tasks.is_empty() {
            lines.push("• Automatizaciones creadas:".to_string());
            for task in &self.scheduled_tasks {
                lines.push(format!(
                    "  - [{}] {} → {} ({})",
                    task.id, task.name, task.cadence_label, task.cron_expression
                ));
            }
        }

        if !self.executed_commands.is_empty() {
            lines.push(format!(
                "• Comandos ejecutados: {}",
                self.executed_commands.join(", ")
            ));
        }

        lines.push(format!("Contexto original: {}", instruction));

        let mut message = ChatMessage::new("Jarvis", lines.join("\n"));
        if let Some(tag) = self.state.jarvis_mention_tag() {
            message = message.with_mention(tag);
        }
        self.state.chat.messages.push(message);

        let status = if local_reply.is_err() || results.iter().any(|r| r.outcome.is_err()) {
            LogStatus::Warning
        } else {
            LogStatus::Ok
        };

        self.state.push_activity_log(
            status,
            "Jarvis Orchestrator",
            format!(
                "Síntesis completada con {} respuestas remotas y {} comandos ejecutados.",
                results.len(),
                self.executed_commands.len()
            ),
        );
    }

    fn summarize(text: &str) -> String {
        let mut sanitized = text.replace('\n', " ").trim().to_string();
        const MAX_LEN: usize = 220;
        if sanitized.chars().count() > MAX_LEN {
            sanitized = sanitized.chars().take(MAX_LEN).collect::<String>();
            sanitized.push('…');
        }
        sanitized
    }
}
