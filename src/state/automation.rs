use super::{
    feature::{CommandRegistry, FeatureModule, WorkbenchRegistry},
    AutomationWorkflowBoard, CronBoardState, EventAutomationState, ExternalIntegrationsState,
    LogEntry, NavigationNode, NavigationRegistry, NavigationTarget, ScheduledReminder,
};
use crate::config::AppConfig;

pub struct AutomationState {
    pub cron_board: CronBoardState,
    pub workflows: AutomationWorkflowBoard,
    pub scheduled_reminders: Vec<ScheduledReminder>,
    pub event_automation: EventAutomationState,
    pub external_integrations: ExternalIntegrationsState,
    pub activity_logs: Vec<LogEntry>,
}

impl AutomationState {
    pub fn from_config(_config: &AppConfig) -> Self {
        Self {
            cron_board: CronBoardState::with_tasks(super::default_scheduled_tasks()),
            workflows: AutomationWorkflowBoard::with_workflows(
                super::default_automation_workflows(),
            ),
            scheduled_reminders: super::default_scheduled_reminders(),
            event_automation: EventAutomationState::default(),
            external_integrations: ExternalIntegrationsState::default(),
            activity_logs: super::default_logs(),
        }
    }

    pub fn push_activity(&mut self, entry: LogEntry) {
        self.activity_logs.push(entry);
        const MAX_ACTIVITY_LOGS: usize = 200;
        if self.activity_logs.len() > MAX_ACTIVITY_LOGS {
            let overflow = self.activity_logs.len() - MAX_ACTIVITY_LOGS;
            self.activity_logs.drain(0..overflow);
        }
    }
}

impl FeatureModule for AutomationState {
    fn register_navigation(&self, registry: &mut NavigationRegistry) {
        let nodes = [
            (
                NavigationTarget::main(super::MainView::CronScheduler),
                "Cron",
                "⏱️",
                "Programa y supervisa tareas automáticas.",
                1,
            ),
            (
                NavigationTarget::main(super::MainView::ActivityFeed),
                "Actividad",
                "📈",
                "Consulta los eventos recientes del sistema.",
                2,
            ),
            (
                NavigationTarget::main(super::MainView::DebugConsole),
                "Debug",
                "🪲",
                "Accede a diagnósticos y registros de depuración.",
                3,
            ),
        ];

        for (target, label, icon, description, order) in nodes {
            registry.register_node(NavigationNode {
                id: target.id(),
                label: label.to_string(),
                description: Some(description.to_string()),
                icon: Some(icon.to_string()),
                badge: None,
                target,
                order,
                section_id: super::SECTION_PRIMARY.to_string(),
            });
        }
    }

    fn register_commands(&self, registry: &mut CommandRegistry) {
        registry.extend([
            super::CustomCommandAction::ShowSystemStatus,
            super::CustomCommandAction::ShowSystemDiagnostics,
            super::CustomCommandAction::ShowUsageStatistics,
        ]);
    }

    fn register_workbench_views(&self, registry: &mut WorkbenchRegistry) {
        crate::ui::chat::register_cron_workbench_view(registry);
        crate::ui::chat::register_activity_workbench_view(registry);
        crate::ui::chat::register_debug_workbench_view(registry);
    }
}
