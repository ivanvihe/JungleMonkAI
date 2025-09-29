use eframe::egui;
use vscode_shell::components::{
    self, HeaderAction, HeaderModel, HeaderProps, SearchGroup, SearchResult,
};

use crate::state::{AppState, MainView};
use crate::ui::layout_bridge::shell_theme;

pub fn draw_header(ctx: &egui::Context, state: &mut AppState) {
    let layout = state.layout.clone();
    let mut model = AppHeader { state };
    components::draw_header(ctx, &layout, &mut model);
}

struct AppHeader<'a> {
    state: &'a mut AppState,
}

impl AppHeader<'_> {
    fn active_view_subtitle(&self) -> Option<String> {
        Some(
            match self.state.active_main_view {
                MainView::ChatMultimodal => "Conversación multimodal",
                MainView::CronScheduler => "Planificador de tareas",
                MainView::ActivityFeed => "Actividad reciente",
                MainView::DebugConsole => "Consola de depuración",
                MainView::Preferences => "Preferencias avanzadas",
                MainView::ResourceBrowser => "Explorador de recursos",
            }
            .to_string(),
        )
    }

    fn parse_result_id(id: &str) -> Option<(usize, usize)> {
        let (group, row) = id.split_once(':')?;
        let g = group.strip_prefix('g')?.parse().ok()?;
        let r = row.strip_prefix('r')?.parse().ok()?;
        Some((g, r))
    }
}

impl HeaderModel for AppHeader<'_> {
    fn theme(&self) -> vscode_shell::layout::ShellTheme {
        shell_theme(&self.state.theme)
    }

    fn props(&self) -> HeaderProps {
        HeaderProps {
            title: "Jungle MonkAI".into(),
            subtitle: self.active_view_subtitle(),
            search_placeholder: Some(
                "Cmd/Ctrl+K · Buscar modelos, conversaciones y documentos".into(),
            ),
            actions: vec![
                HeaderAction {
                    id: "open_settings".into(),
                    label: "Preferencias".into(),
                    icon: Some("⚙️".into()),
                    shortcut: Some("Ctrl+,".into()),
                    enabled: true,
                },
                HeaderAction {
                    id: "open_functions".into(),
                    label: "Funciones".into(),
                    icon: Some("🧰".into()),
                    shortcut: Some("Ctrl+Shift+F".into()),
                    enabled: true,
                },
            ],
            logo_acronym: Some("JM".into()),
        }
    }

    fn search_value(&self) -> String {
        self.state.search_buffer.clone()
    }

    fn set_search_value(&mut self, value: String) {
        self.state.search_buffer = value;
    }

    fn search_palette(&self) -> Vec<SearchGroup> {
        self.state
            .global_search_groups()
            .into_iter()
            .enumerate()
            .map(|(group_index, group)| SearchGroup {
                id: format!("g{}", group_index),
                title: group.title,
                results: group
                    .results
                    .into_iter()
                    .enumerate()
                    .map(|(result_index, result)| SearchResult {
                        id: format!("g{}:r{}", group_index, result_index),
                        title: result.title,
                        subtitle: result.subtitle,
                        action_hint: Some(result.action_hint),
                    })
                    .collect(),
            })
            .collect()
    }

    fn on_search_result(&mut self, result_id: &str) {
        if let Some((group_index, result_index)) = Self::parse_result_id(result_id) {
            if let Some(group) = self.state.global_search_groups().get(group_index) {
                if let Some(result) = group.results.get(result_index) {
                    self.state.search_buffer = result.title.clone();
                    if !self
                        .state
                        .global_search_recent
                        .iter()
                        .any(|entry| entry == &result.title)
                    {
                        self.state
                            .global_search_recent
                            .insert(0, result.title.clone());
                        self.state.global_search_recent.truncate(10);
                    }
                }
            }
        }
    }

    fn on_action(&mut self, action_id: &str) {
        match action_id {
            "open_settings" => self.state.show_settings_modal = true,
            "open_functions" => self.state.show_functions_modal = true,
            _ => {}
        }
    }
}
