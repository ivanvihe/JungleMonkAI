use crate::api::{claude::AnthropicModel, github};
use crate::local_providers::{LocalModelCard, LocalModelIdentifier, LocalModelProvider};
use crate::state::{
    format_bytes, AppState, AutomationWorkflow, ChatMessage, DebugLogLevel, InstalledLocalModel,
    IntegrationStatus, KnowledgeResourceCard, LogStatus, MainTab, MainView, PreferencePanel,
    ProjectResourceCard, ProjectResourceKind, ReminderStatus, RemoteModelCard, RemoteModelKey,
    RemoteProviderKind, ResourceSection, ScheduledTaskStatus, SyncHealth, WorkflowStatus,
    WorkflowStepKind,
};
use anyhow::Result;
use chrono::{DateTime, Local, Utc};
use eframe::egui::{self, Color32, RichText, Spinner};
use egui_extras::{Column, TableBuilder};
use std::path::Path;
use vscode_shell::components::{
    self, MainContentAction, MainContentModel, MainContentProps, MainContentTab,
};

use super::{logs, tabs, theme};
use crate::ui::{
    layout_bridge::shell_theme,
    theme::{ThemePreset, ThemeTokens},
};

const ICON_USER: &str = "\u{f007}"; // user
const ICON_SYSTEM: &str = "\u{f085}"; // cogs
const ICON_ASSISTANT: &str = "\u{f544}"; // robot
const ICON_CLOCK: &str = "\u{f017}"; // clock
const ICON_COPY: &str = "\u{f0c5}"; // copy
const ICON_QUOTE: &str = "\u{f10e}"; // quote-right
const ICON_PIN: &str = "\u{f08d}"; // thumb-tack
const ICON_SEND: &str = "\u{f04b}"; // play
const ICON_CODE: &str = "\u{f121}"; // code
const ICON_PREMIUM: &str = "\u{f521}"; // crown
const ICON_FREE: &str = "\u{f06b}"; // gift
const ICON_DOWNLOAD: &str = "\u{f019}"; // download
const ICON_STAR: &str = "\u{f005}"; // star
const ICON_COMPARE: &str = "\u{f24e}"; // balance-scale
const ICON_ACTIVITY: &str = "\u{f201}"; // chart-line
const ICON_LIGHTNING: &str = "\u{f0e7}"; // bolt
const ICON_FILTER: &str = "\u{f0b0}"; // filter
const ICON_TABLE: &str = "\u{f0ce}"; // table
const ICON_LINK: &str = "\u{f0c1}"; // link
const ICON_FOLDER: &str = "\u{f07c}"; // folder-open
const ICON_FILE_DOC: &str = "\u{f15b}"; // file
const ICON_CALENDAR: &str = "\u{f073}"; // calendar-alt
const ICON_REPEAT: &str = "\u{f021}"; // sync-alt
const ICON_PLAY: &str = "\u{f04b}"; // play
const ICON_STOP: &str = "\u{f04d}"; // stop
const ICON_BUG: &str = "\u{f188}"; // bug
const ICON_INFO: &str = "\u{f129}"; // info-circle
const ICON_BOOK: &str = "\u{f02d}"; // book
const ICON_SLIDERS: &str = "\u{f1de}"; // sliders-h
const ICON_DATABASE: &str = "\u{f1c0}"; // database
const ICON_CHART: &str = "\u{f080}"; // line-chart

const QUICK_MENTIONS: [(&str, &str); 3] =
    [("@claude", "@claude"), ("@gpt", "@gpt"), ("@groq", "@groq")];

const QUICK_COMMANDS: [(&str, &str); 4] = [
    ("/summary", "Resumen"),
    ("/diff", "Diff"),
    ("/tests", "Tests"),
    ("@jarvis test", "@jarvis test"),
];

enum PendingChatAction {
    Mention(String),
    Quote(String),
    Reuse(String),
}

fn desired_main_width(available_width: f32) -> f32 {
    if available_width <= 0.0 {
        return 0.0;
    }
    available_width.min(1356.0)
}

fn with_centered_main_surface(ui: &mut egui::Ui, add_contents: impl FnOnce(&mut egui::Ui)) {
    let available = ui.available_size();
    let width = available.x.max(0.0);
    let height = available.y.max(0.0);
    ui.set_min_height(height);
    let target_width = desired_main_width(width);
    let side_padding = ((width - target_width) / 2.0).max(0.0);

    ui.with_layout(egui::Layout::left_to_right(egui::Align::TOP), |ui| {
        if side_padding > 0.0 {
            ui.add_space(side_padding);
        }
        ui.vertical(|ui| {
            ui.set_width(target_width);
            ui.set_min_height(height);
            add_contents(ui);
        });
        if side_padding > 0.0 {
            ui.add_space(side_padding);
        }
    });
}

pub fn draw_main_content(ctx: &egui::Context, state: &mut AppState) {
    let layout = state.layout.clone();
    let mut model = AppMainContent { state };
    components::draw_main_content(ctx, &layout, &mut model);
}

struct AppMainContent<'a> {
    state: &'a mut AppState,
}

impl AppMainContent<'_> {
    fn active_title(&self) -> Option<String> {
        Some(
            match self.state.active_main_view {
                MainView::ChatMultimodal => "Chat multimodal",
                MainView::CronScheduler => "Cron Scheduler",
                MainView::ActivityFeed => "Activity feed",
                MainView::DebugConsole => "Debug console",
                MainView::Preferences => "Preferencias",
                MainView::ResourceBrowser => "Explorador de recursos",
            }
            .to_string(),
        )
    }

    fn active_subtitle(&self) -> Option<String> {
        match self.state.active_main_view {
            MainView::ChatMultimodal => Some("Coordina agentes, herramientas y documentos".into()),
            MainView::CronScheduler => Some("Gestiona tareas automatizadas y cron jobs".into()),
            MainView::ActivityFeed => Some("Audita eventos recientes del sistema".into()),
            MainView::DebugConsole => Some("Monitorea registros y diagnósticos".into()),
            MainView::Preferences => Some("Configura integraciones y flujos de trabajo".into()),
            MainView::ResourceBrowser => Some("Explora catálogos locales y remotos".into()),
        }
    }

    fn tabs(&self) -> Vec<MainContentTab> {
        tabs::CHAT_SECTION_TABS
            .iter()
            .map(|definition| MainContentTab {
                id: tab_id(definition.id),
                label: definition.label.to_string(),
                icon: definition.icon.map(|icon| icon.to_string()),
            })
            .collect()
    }
}

impl MainContentModel for AppMainContent<'_> {
    fn theme(&self) -> vscode_shell::layout::ShellTheme {
        shell_theme(&self.state.theme)
    }

    fn props(&self) -> MainContentProps {
        let mut props = MainContentProps {
            title: self.active_title(),
            subtitle: self.active_subtitle(),
            actions: vec![
                MainContentAction {
                    id: "toggle-navigation".into(),
                    label: if self.state.layout.navigation_collapsed() {
                        "Mostrar navegación".into()
                    } else {
                        "Ocultar navegación".into()
                    },
                    icon: Some("📂".into()),
                    enabled: true,
                },
                MainContentAction {
                    id: "toggle-resources".into(),
                    label: if self.state.layout.resource_collapsed() {
                        "Mostrar recursos".into()
                    } else {
                        "Ocultar recursos".into()
                    },
                    icon: Some("📚".into()),
                    enabled: true,
                },
            ],
            tabs: Vec::new(),
            active_tab: None,
        };

        if matches!(
            self.state.active_main_view,
            MainView::ChatMultimodal
                | MainView::CronScheduler
                | MainView::ActivityFeed
                | MainView::DebugConsole
        ) {
            props.tabs = self.tabs();
            props.active_tab = Some(tab_id(self.state.active_main_tab));
        }

        props
    }

    fn on_action(&mut self, action_id: &str) {
        match action_id {
            "toggle-navigation" => {
                let next = !self.state.layout.navigation_collapsed();
                self.state.layout.emit_navigation_signal(next);
            }
            "toggle-resources" => {
                let next = !self.state.layout.resource_collapsed();
                self.state.layout.emit_resource_signal(next);
            }
            _ => {}
        }
    }

    fn on_tab_selected(&mut self, tab_id: &str) {
        if let Some(tab) = parse_tab_id(tab_id) {
            self.state.set_active_tab(tab);
        }
    }

    fn show_content(&mut self, ui: &mut egui::Ui) {
        match self.state.active_main_view {
            MainView::ChatMultimodal => draw_chat_view(ui, self.state),
            MainView::CronScheduler => draw_cron_view(ui, self.state),
            MainView::ActivityFeed => draw_activity_view(ui, self.state),
            MainView::DebugConsole => draw_debug_console_view(ui, self.state),
            MainView::Preferences => draw_preferences_view(ui, self.state),
            MainView::ResourceBrowser => draw_resource_view(ui, self.state),
        }
    }
}

fn tab_id(tab: MainTab) -> String {
    match tab {
        MainTab::Chat => "tab:chat",
        MainTab::Cron => "tab:cron",
        MainTab::Activity => "tab:activity",
        MainTab::DebugConsole => "tab:debug",
    }
    .into()
}

fn parse_tab_id(value: &str) -> Option<MainTab> {
    Some(match value {
        "tab:chat" => MainTab::Chat,
        "tab:cron" => MainTab::Cron,
        "tab:activity" => MainTab::Activity,
        "tab:debug" => MainTab::DebugConsole,
        _ => return None,
    })
}

fn draw_chat_view(ui: &mut egui::Ui, state: &mut AppState) {
    with_centered_main_surface(ui, |ui| {
        egui::Frame::none()
            .fill(state.theme.palette.panel_background)
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::ZERO)
            .inner_margin(egui::Margin {
                left: 18.0,
                right: 18.0,
                top: 18.0,
                bottom: 16.0,
            })
            .show(ui, |ui| {
                let available = ui.available_size();
                let (rect, _) = ui.allocate_exact_size(
                    egui::vec2(available.x, available.y),
                    egui::Sense::hover(),
                );
                let mut content_ui = ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                content_ui.set_min_height(rect.height());
                content_ui.set_clip_rect(rect);

                egui::TopBottomPanel::bottom("chat_input_panel")
                    .resizable(false)
                    .show_separator_line(false)
                    .frame(egui::Frame::none())
                    .show_inside(&mut content_ui, |ui| {
                        ui.add_space(8.0);
                        draw_chat_input(ui, state);
                    });

                egui::CentralPanel::default()
                    .frame(egui::Frame::none())
                    .show_inside(&mut content_ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.set_min_height(ui.available_height());
                        draw_chat_history(ui, state);
                    });
            });
    });
}

fn draw_preferences_view(ui: &mut egui::Ui, state: &mut AppState) {
    with_centered_main_surface(ui, |ui| {
        egui::Frame::none()
            .fill(state.theme.palette.panel_background)
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::ZERO)
            .inner_margin(egui::Margin {
                left: 20.0,
                right: 20.0,
                top: 20.0,
                bottom: 18.0,
            })
            .show(ui, |ui| {
                let metadata = state.selected_preference.metadata();
                let breadcrumb_text = if metadata.breadcrumb.is_empty() {
                    String::new()
                } else {
                    metadata.breadcrumb.join(" › ")
                };

                let heading = metadata
                    .breadcrumb
                    .last()
                    .copied()
                    .unwrap_or(metadata.title);

                let mut tab_definitions = preference_tab_definitions(state.selected_preference);
                if tab_definitions.is_empty() {
                    tab_definitions.push(tabs::TabDefinition {
                        id: 0,
                        label: heading,
                        icon: None,
                        tooltip: metadata.description,
                    });
                }

                let active_tab_entry = state
                    .preference_tabs
                    .entry(state.selected_preference)
                    .or_insert(0);
                if let Some(selection) = tabs::draw_tab_bar(
                    ui,
                    *active_tab_entry,
                    tab_definitions.as_slice(),
                    &state.theme,
                ) {
                    *active_tab_entry = selection;
                }
                ui.add_space(12.0);

                if !breadcrumb_text.is_empty() {
                    ui.label(
                        RichText::new(breadcrumb_text)
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                }

                ui.heading(
                    RichText::new(heading)
                        .color(theme::color_text_primary())
                        .strong(),
                );
                ui.label(RichText::new(metadata.description).color(theme::color_text_weak()));
                ui.add_space(12.0);

                let active_tab_index = *active_tab_entry;

                egui::ScrollArea::vertical()
                    .id_source("preferences_scroll")
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        draw_selected_preference(ui, state, active_tab_index);
                    });
            });
    });
}

fn preference_tab_definitions(panel: PreferencePanel) -> Vec<tabs::TabDefinition<usize>> {
    match panel {
        PreferencePanel::CustomizationCommands => vec![
            tabs::TabDefinition {
                id: 0,
                label: "Custom commands",
                icon: Some(ICON_CODE),
                tooltip: "Define y gestiona comandos personalizados",
            },
            tabs::TabDefinition {
                id: 1,
                label: "Documentation",
                icon: Some(ICON_BOOK),
                tooltip: "Consulta referencias y ejemplos de comandos",
            },
            tabs::TabDefinition {
                id: 2,
                label: "Activity",
                icon: Some(ICON_ACTIVITY),
                tooltip: "Revisa la actividad reciente de los comandos",
            },
        ],
        PreferencePanel::ProvidersAnthropic => vec![
            tabs::TabDefinition {
                id: 0,
                label: "Configuration",
                icon: Some(ICON_SLIDERS),
                tooltip: "Configura credenciales y alias de Anthropic",
            },
            tabs::TabDefinition {
                id: 1,
                label: "Modelos",
                icon: Some(ICON_DATABASE),
                tooltip: "Gestiona el catálogo de modelos Claude",
            },
            tabs::TabDefinition {
                id: 2,
                label: "Usage",
                icon: Some(ICON_CHART),
                tooltip: "Supervisa consumo y límites de Anthropic",
            },
        ],
        PreferencePanel::ProvidersOpenAi => vec![
            tabs::TabDefinition {
                id: 0,
                label: "Configuration",
                icon: Some(ICON_SLIDERS),
                tooltip: "Configura credenciales y alias de OpenAI",
            },
            tabs::TabDefinition {
                id: 1,
                label: "Modelos",
                icon: Some(ICON_DATABASE),
                tooltip: "Selecciona modelos y parámetros de OpenAI",
            },
            tabs::TabDefinition {
                id: 2,
                label: "Usage",
                icon: Some(ICON_CHART),
                tooltip: "Controla el consumo de tokens en OpenAI",
            },
        ],
        PreferencePanel::ProvidersGroq => vec![
            tabs::TabDefinition {
                id: 0,
                label: "Configuration",
                icon: Some(ICON_SLIDERS),
                tooltip: "Configura credenciales y alias de Groq",
            },
            tabs::TabDefinition {
                id: 1,
                label: "Modelos",
                icon: Some(ICON_DATABASE),
                tooltip: "Explora modelos acelerados por Groq",
            },
            tabs::TabDefinition {
                id: 2,
                label: "Usage",
                icon: Some(ICON_CHART),
                tooltip: "Supervisa uso y límites de Groq",
            },
        ],
        _ => {
            let metadata = panel.metadata();
            let label = metadata
                .breadcrumb
                .last()
                .copied()
                .unwrap_or(metadata.title);
            vec![tabs::TabDefinition {
                id: 0,
                label,
                icon: None,
                tooltip: metadata.description,
            }]
        }
    }
}

fn resource_tab_definitions(section: ResourceSection) -> Vec<tabs::TabDefinition<usize>> {
    let metadata = section.metadata();
    let label = metadata
        .breadcrumb
        .last()
        .copied()
        .unwrap_or(metadata.title);

    vec![tabs::TabDefinition {
        id: 0,
        label,
        icon: None,
        tooltip: metadata.description,
    }]
}

fn draw_resource_view(ui: &mut egui::Ui, state: &mut AppState) {
    with_centered_main_surface(ui, |ui| {
        egui::Frame::none()
            .fill(Color32::from_rgb(30, 32, 36))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::ZERO)
            .inner_margin(egui::Margin {
                left: 20.0,
                right: 20.0,
                top: 20.0,
                bottom: 18.0,
            })
            .show(ui, |ui| {
                if let Some(section) = state.resources.selected_resource {
                    let metadata = section.metadata();
                    let breadcrumb_text = if metadata.breadcrumb.is_empty() {
                        String::new()
                    } else {
                        metadata.breadcrumb.join(" › ")
                    };

                    let heading = metadata
                        .breadcrumb
                        .last()
                        .copied()
                        .unwrap_or(metadata.title);

                    let mut tab_definitions = resource_tab_definitions(section);
                    if tab_definitions.is_empty() {
                        tab_definitions.push(tabs::TabDefinition {
                            id: 0,
                            label: heading,
                            icon: None,
                            tooltip: metadata.description,
                        });
                    }
                    let active_tab_index = 0usize;
                    let _ =
                        tabs::draw_tab_bar(
                            ui,
                            active_tab_index,
                            tab_definitions.as_slice(),
                            &state.theme,
                        );
                    ui.add_space(12.0);

                    if !breadcrumb_text.is_empty() {
                        ui.label(
                            RichText::new(breadcrumb_text)
                                .color(theme::color_text_weak())
                                .size(12.0),
                        );
                    }

                    ui.heading(
                        RichText::new(heading)
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                    ui.label(
                        RichText::new(metadata.description)
                            .color(theme::color_text_weak()),
                    );
                    ui.add_space(12.0);

                    egui::ScrollArea::vertical()
                        .id_source("resources_scroll")
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            draw_selected_resource(ui, state, section);
                        });
                } else {
                    ui.vertical_centered(|ui| {
                        ui.add_space(80.0);
                        ui.label(
                            RichText::new(
                                "Selecciona un recurso en el panel izquierdo para explorar su contenido.",
                            )
                            .color(theme::color_text_weak()),
                        );
                    });
                }
            });
    });
}

fn draw_cron_view(ui: &mut egui::Ui, state: &mut AppState) {
    with_centered_main_surface(ui, |ui| {
        egui::Frame::none()
            .fill(Color32::from_rgb(30, 32, 36))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::ZERO)
            .inner_margin(egui::Margin {
                left: 20.0,
                right: 20.0,
                top: 20.0,
                bottom: 18.0,
            })
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 10.0;
                    ui.label(
                        RichText::new(ICON_CALENDAR)
                            .font(theme::icon_font(18.0))
                            .color(theme::color_primary()),
                    );
                    ui.heading(
                        RichText::new("Tareas programadas")
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                });
                ui.label(
                    RichText::new(
                        "Gestiona cron jobs, automatizaciones y recordatorios ejecutados por JungleMonkAI.",
                    )
                    .color(theme::color_text_weak()),
                );

                ui.add_space(12.0);
                draw_cron_summary(ui, state);
                ui.add_space(10.0);
                draw_workflow_panel(ui, state);
                ui.add_space(10.0);
                draw_reminder_panel(ui, state);
                ui.add_space(10.0);
                draw_cron_filters(ui, state);
                ui.add_space(10.0);
                draw_cron_table(ui, state);

                if let Some(task) = state.automation.cron_board.selected_task() {
                    ui.add_space(14.0);
                    draw_cron_task_detail(ui, state, task);
                }

                ui.add_space(14.0);
                draw_listener_panel(ui, state);
                ui.add_space(14.0);
                draw_integration_panel(ui, state);
            });
    });
}

fn draw_activity_view(ui: &mut egui::Ui, state: &AppState) {
    with_centered_main_surface(ui, |ui| {
        logs::draw_logs_view(ui, state);
    });
}

fn draw_debug_console_view(ui: &mut egui::Ui, state: &mut AppState) {
    with_centered_main_surface(ui, |ui| {
        egui::Frame::none()
            .fill(Color32::from_rgb(26, 28, 32))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::ZERO)
            .inner_margin(egui::Margin {
                left: 20.0,
                right: 20.0,
                top: 20.0,
                bottom: 18.0,
            })
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 10.0;
                    ui.label(
                        RichText::new(ICON_BUG)
                            .font(theme::icon_font(18.0))
                            .color(theme::color_primary()),
                    );
                    ui.heading(
                        RichText::new("Debug console")
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                });
                let (info, warning, error) = state.debug_console.level_totals();
                ui.label(
                    RichText::new("Inspecciona errores, advertencias e información del runtime.")
                        .color(theme::color_text_weak()),
                );

                ui.add_space(10.0);
                draw_debug_summary(ui, info, warning, error, &state.theme);
                ui.add_space(10.0);
                draw_debug_filters(ui, state);
                ui.add_space(10.0);
                draw_debug_entries(ui, state);
            });
    });
}

fn draw_cron_summary(ui: &mut egui::Ui, state: &AppState) {
    let total_enabled = state
        .automation
        .cron_board
        .tasks
        .iter()
        .filter(|task| task.enabled)
        .count();
    let running = state
        .automation
        .cron_board
        .status_count(ScheduledTaskStatus::Running);
    let failing = state
        .automation
        .cron_board
        .status_count(ScheduledTaskStatus::Failed);

    ui.horizontal(|ui| {
        summary_chip(
            ui,
            ICON_REPEAT,
            "Activas",
            total_enabled,
            theme::color_primary(),
            &state.theme,
        );
        summary_chip(
            ui,
            ICON_PLAY,
            "En ejecución",
            running,
            Color32::from_rgb(64, 172, 255),
            &state.theme,
        );
        summary_chip(
            ui,
            ICON_STOP,
            "Con errores",
            failing,
            theme::color_danger(),
            &state.theme,
        );
    });
}

fn summary_chip(
    ui: &mut egui::Ui,
    icon: &str,
    label: &str,
    value: usize,
    color: Color32,
    tokens: &ThemeTokens,
) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(tokens))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(16.0, 12.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(icon)
                        .font(theme::icon_font(16.0))
                        .color(color),
                );
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(label)
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.label(
                        RichText::new(value.to_string())
                            .color(theme::color_text_primary())
                            .size(16.0)
                            .strong(),
                    );
                });
            });
        });
}

fn draw_workflow_panel(ui: &mut egui::Ui, state: &mut AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(egui::Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_LIGHTNING)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new("Workflows automatizados")
                        .color(theme::color_text_primary())
                        .strong(),
                );
                ui.add_space(ui.available_width());
                ui.checkbox(
                    &mut state.automation.workflows.show_only_pinned,
                    "Solo favoritos",
                )
                .on_hover_text("Filtra workflows fijados para acceso rápido");
            });
            ui.label(
                RichText::new(
                    "Encadena modelos remotos con scripts locales y orquesta pipelines desde el chat.",
                )
                .color(theme::color_text_weak())
                .size(12.0),
            );

            ui.add_space(8.0);
            let indices = state.automation.workflows.filtered_indices();
            if indices.is_empty() {
                ui.colored_label(
                    theme::color_text_weak(),
                    "No hay workflows guardados con los filtros actuales.",
                );
                return;
            }

            for index in indices {
                let workflow_snapshot = state.automation.workflows.workflows[index].clone();
                draw_workflow_card(ui, state, index, &workflow_snapshot);
                ui.add_space(8.0);
            }
        });
}

fn draw_workflow_card(
    ui: &mut egui::Ui,
    state: &mut AppState,
    index: usize,
    workflow: &AutomationWorkflow,
) {
    egui::Frame::none()
        .fill(Color32::from_rgb(28, 30, 36))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.heading(
                        RichText::new(&workflow.name)
                            .color(theme::color_text_primary())
                            .size(15.0)
                            .strong(),
                    );
                    if workflow.pinned {
                        ui.label(
                            RichText::new(ICON_STAR)
                                .font(theme::icon_font(14.0))
                                .color(Color32::from_rgb(255, 196, 0)),
                        );
                    }
                    ui.add_space(ui.available_width());
                    ui.label(
                        RichText::new(workflow.status.label())
                            .color(workflow_status_color(workflow.status))
                            .monospace()
                            .size(11.0),
                    );
                });

                ui.label(
                    RichText::new(&workflow.description)
                        .color(theme::color_text_weak())
                        .size(12.0),
                );

                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(format!("Disparador: {}", workflow.trigger.label()))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    if let Some(command) = &workflow.chat_command {
                        ui.add_space(16.0);
                        ui.label(
                            RichText::new(format!("Comando: {}", command))
                                .color(theme::color_text_primary())
                                .monospace()
                                .size(11.0),
                        );
                    }
                    if let Some(cron_id) = workflow.linked_schedule {
                        ui.add_space(16.0);
                        ui.label(
                            RichText::new(format!("Vinculado a tarea #{cron_id}"))
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                    }
                });

                ui.add_space(8.0);
                for step in &workflow.steps {
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 8.0;
                        ui.label(
                            RichText::new(workflow_step_icon(step.kind))
                                .font(theme::icon_font(14.0))
                                .color(theme::color_primary()),
                        );
                        ui.label(
                            RichText::new(format!("{} · {}", step.kind.label(), step.label))
                                .color(theme::color_text_primary())
                                .size(12.0),
                        );
                        if let Some(provider) = step.provider {
                            ui.label(
                                RichText::new(format!("@{}", provider.short_code()))
                                    .color(theme::color_text_weak())
                                    .size(11.0)
                                    .monospace(),
                            );
                        }
                    });
                    ui.label(
                        RichText::new(&step.detail)
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.add_space(4.0);
                }

                if let Some(last_run) = &workflow.last_run {
                    ui.label(
                        RichText::new(format!("Última ejecución: {last_run}"))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                } else {
                    ui.label(
                        RichText::new("Nunca ejecutado")
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                }

                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    let run_button = theme::primary_button(
                        RichText::new("Lanzar pipeline")
                            .color(Color32::WHITE)
                            .strong(),
                        &state.theme,
                    )
                    .min_size(egui::vec2(150.0, 30.0));
                    if ui.add(run_button).clicked() {
                        if let Some(message) = state.trigger_workflow(workflow.id) {
                            ui.colored_label(theme::color_text_weak(), message);
                        }
                    }

                    ui.add_space(8.0);
                    let select_button = theme::secondary_button(
                        RichText::new("Registrar en chat")
                            .color(theme::color_text_primary())
                            .strong(),
                        &state.theme,
                    )
                    .min_size(egui::vec2(150.0, 30.0));
                    if ui.add(select_button).clicked() {
                        if let Some(message) =
                            state.automation.workflows.workflows.get(index).map(|wf| {
                                format!("Workflow '{}' listo para orquestación.", wf.name)
                            })
                        {
                            state.push_activity_log(LogStatus::Ok, "Automation", &message);
                            state.push_debug_event(
                                DebugLogLevel::Info,
                                "automation::note",
                                message,
                            );
                        }
                    }
                });
            });
        });
}

fn workflow_step_icon(kind: WorkflowStepKind) -> &'static str {
    match kind {
        WorkflowStepKind::RemoteModel => ICON_LIGHTNING,
        WorkflowStepKind::LocalScript => ICON_CODE,
        WorkflowStepKind::SyncAction => ICON_REPEAT,
    }
}

fn workflow_status_color(status: WorkflowStatus) -> Color32 {
    match status {
        WorkflowStatus::Ready => theme::color_primary(),
        WorkflowStatus::Running => Color32::from_rgb(64, 172, 255),
        WorkflowStatus::Failed => theme::color_danger(),
        WorkflowStatus::Draft => Color32::from_rgb(160, 160, 160),
    }
}

fn draw_reminder_panel(ui: &mut egui::Ui, state: &AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(egui::Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_CLOCK)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new("Recordatorios programados")
                        .color(theme::color_text_primary())
                        .strong(),
                );
            });
            ui.label(
                RichText::new(
                    "Visualiza próximos avisos y confirma su canal de entrega en tiempo real.",
                )
                .color(theme::color_text_weak())
                .size(12.0),
            );

            ui.add_space(8.0);
            if state.automation.scheduled_reminders.is_empty() {
                ui.colored_label(
                    theme::color_text_weak(),
                    "No existen recordatorios activos por ahora.",
                );
                return;
            }

            for reminder in &state.automation.scheduled_reminders {
                egui::Frame::none()
                    .fill(Color32::from_rgb(28, 30, 36))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(10.0))
                    .inner_margin(egui::Margin::symmetric(12.0, 10.0))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            let color = reminder_status_color(reminder.status);
                            ui.label(RichText::new("●").color(color).size(14.0).monospace());
                            ui.label(
                                RichText::new(format!("#{} {}", reminder.id, reminder.title))
                                    .color(theme::color_text_primary())
                                    .strong()
                                    .size(13.0),
                            );
                            ui.add_space(ui.available_width());
                            ui.label(
                                RichText::new(reminder.status.label())
                                    .color(color)
                                    .size(11.0)
                                    .monospace(),
                            );
                        });
                        ui.label(
                            RichText::new(format!(
                                "Cadencia: {} · Próximo envío {}",
                                reminder.cadence, reminder.next_trigger
                            ))
                            .color(theme::color_text_weak())
                            .size(11.0),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Canal: {} · Audiencia: {}",
                                reminder.delivery_channel, reminder.audience
                            ))
                            .color(theme::color_text_weak())
                            .size(11.0),
                        );
                    });
                ui.add_space(6.0);
            }
        });
}

fn reminder_status_color(status: ReminderStatus) -> Color32 {
    match status {
        ReminderStatus::Scheduled => theme::color_primary(),
        ReminderStatus::Sent => theme::color_success(),
        ReminderStatus::Snoozed => Color32::from_rgb(255, 196, 0),
    }
}

fn draw_listener_panel(ui: &mut egui::Ui, state: &mut AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(egui::Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_INFO)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new("Listeners y disparadores")
                        .color(theme::color_text_primary())
                        .strong(),
                );
                ui.add_space(ui.available_width());
                ui.checkbox(
                    &mut state.automation.event_automation.show_only_enabled,
                    "Solo activos",
                )
                .on_hover_text("Oculta listeners deshabilitados");
            });
            ui.label(
                RichText::new(
                    "Configura automatizaciones basadas en eventos de chat, repositorios o jobs.",
                )
                .color(theme::color_text_weak())
                .size(12.0),
            );

            ui.add_space(8.0);
            let indices: Vec<usize> = state
                .automation
                .event_automation
                .listeners
                .iter()
                .enumerate()
                .filter(|(_, listener)| {
                    if state.automation.event_automation.show_only_enabled && !listener.enabled {
                        return false;
                    }
                    true
                })
                .map(|(idx, _)| idx)
                .collect();

            if indices.is_empty() {
                ui.colored_label(
                    theme::color_text_weak(),
                    "No hay listeners configurados para estos filtros.",
                );
                return;
            }

            for index in indices {
                let listener_snapshot = state.automation.event_automation.listeners[index].clone();
                egui::Frame::none()
                    .fill(Color32::from_rgb(28, 30, 36))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(10.0))
                    .inner_margin(egui::Margin::symmetric(12.0, 10.0))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(&listener_snapshot.name)
                                    .color(theme::color_text_primary())
                                    .strong()
                                    .size(13.0),
                            );
                            ui.add_space(ui.available_width());
                            ui.label(
                                RichText::new(listener_snapshot.event.label())
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        });
                        ui.label(
                            RichText::new(&listener_snapshot.description)
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new(format!("Condición: {}", listener_snapshot.condition))
                                .color(theme::color_text_weak())
                                .size(11.0)
                                .monospace(),
                        );
                        ui.label(
                            RichText::new(format!("Acción: {}", listener_snapshot.action))
                                .color(theme::color_text_primary())
                                .size(11.0)
                                .monospace(),
                        );
                        if let Some(last) = &listener_snapshot.last_triggered {
                            ui.label(
                                RichText::new(format!("Último disparo: {last}"))
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        }

                        ui.add_space(6.0);
                        let mut enabled_label = "Deshabilitar";
                        if !listener_snapshot.enabled {
                            enabled_label = "Habilitar";
                        }
                        let toggle_button = theme::secondary_button(
                            RichText::new(enabled_label)
                                .color(theme::color_text_primary())
                                .strong(),
                            &state.theme,
                        )
                        .min_size(egui::vec2(130.0, 28.0));
                        if ui.add(toggle_button).clicked() {
                            state.toggle_listener_enabled(listener_snapshot.id);
                        }
                    });
                ui.add_space(6.0);
            }
        });
}

fn draw_integration_panel(ui: &mut egui::Ui, state: &AppState) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(egui::Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_LINK)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new("Integraciones externas")
                        .color(theme::color_text_primary())
                        .strong(),
                );
            });
            ui.label(
                RichText::new(
                    "Gmail, Calendar, CI/CD e IFTTT se orquestan como triggers y acciones del agente.",
                )
                .color(theme::color_text_weak())
                .size(12.0),
            );

            ui.add_space(8.0);
            if state.automation.external_integrations.connectors.is_empty() {
                ui.colored_label(
                    theme::color_text_weak(),
                    "Sin conectores registrados todavía.",
                );
                return;
            }

            for connector in &state.automation.external_integrations.connectors {
                egui::Frame::none()
                    .fill(Color32::from_rgb(28, 30, 36))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(10.0))
                    .inner_margin(egui::Margin::symmetric(12.0, 10.0))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(connector.service.label())
                                    .color(theme::color_text_primary())
                                    .strong()
                                    .size(12.0),
                            );
                            ui.add_space(8.0);
                            ui.label(
                                RichText::new(format!("#{} {}", connector.id, connector.name))
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                            ui.add_space(ui.available_width());
                            ui.label(
                                RichText::new(connector.status.label())
                                    .color(integration_status_color(connector.status))
                                    .size(11.0)
                                    .monospace(),
                            );
                        });
                        ui.label(
                            RichText::new(&connector.status_detail)
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        if let Some(last) = &connector.last_event {
                            ui.label(
                                RichText::new(format!("Último evento: {last}"))
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        }
                        if let Some(next) = &connector.next_sync {
                            ui.label(
                                RichText::new(format!("Próxima sincronización: {next}"))
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        }
                        if !connector.metadata.is_empty() {
                            ui.horizontal_wrapped(|ui| {
                                ui.spacing_mut().item_spacing.x = 6.0;
                                for entry in &connector.metadata {
                                    selectable_chip(ui, entry, false);
                                }
                            });
                        }
                        if !connector.quick_actions.is_empty() {
                            ui.add_space(6.0);
                            ui.horizontal(|ui| {
                                for action in &connector.quick_actions {
                                    let button = theme::secondary_button(
                                        RichText::new(action)
                                            .color(theme::color_text_primary())
                                            .strong(),
                                        &state.theme,
                                    )
                                    .min_size(egui::vec2(130.0, 26.0));
                                    ui.add(button);
                                    ui.add_space(6.0);
                                }
                            });
                        }
                    });
                ui.add_space(6.0);
            }
        });
}

fn integration_status_color(status: IntegrationStatus) -> Color32 {
    match status {
        IntegrationStatus::Connected => theme::color_success(),
        IntegrationStatus::Warning => Color32::from_rgb(255, 196, 0),
        IntegrationStatus::Error => theme::color_danger(),
        IntegrationStatus::Syncing => Color32::from_rgb(64, 172, 255),
    }
}

fn draw_cron_filters(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        let toggle = ui.checkbox(
            &mut state.automation.cron_board.show_only_enabled,
            "Solo habilitadas",
        );
        toggle.on_hover_text("Oculta tareas desactivadas o pausadas");

        let provider_text = state
            .automation
            .cron_board
            .provider_filter
            .map(|provider| provider.display_name().to_string())
            .unwrap_or_else(|| "Todos los proveedores".to_string());
        egui::ComboBox::from_id_source("cron_provider_filter")
            .selected_text(provider_text)
            .show_ui(ui, |ui| {
                if ui
                    .selectable_label(
                        state.automation.cron_board.provider_filter.is_none(),
                        "Todos",
                    )
                    .clicked()
                {
                    state.automation.cron_board.provider_filter = None;
                }
                for provider in [
                    RemoteProviderKind::Anthropic,
                    RemoteProviderKind::OpenAi,
                    RemoteProviderKind::Groq,
                ] {
                    let selected = state.automation.cron_board.provider_filter == Some(provider);
                    let label = format!("{} ({})", provider.display_name(), provider.short_code());
                    if ui.selectable_label(selected, label).clicked() {
                        state.automation.cron_board.provider_filter = Some(provider);
                    }
                }
            });

        if ui
            .add(egui::Button::new("Limpiar filtros").min_size(egui::vec2(120.0, 28.0)))
            .clicked()
        {
            state.automation.cron_board.show_only_enabled = false;
            state.automation.cron_board.provider_filter = None;
            state.automation.cron_board.tag_filter = None;
        }
    });

    let tags = state.automation.cron_board.unique_tags();
    if !tags.is_empty() {
        ui.add_space(6.0);
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing.x = 6.0;
            ui.label(
                RichText::new(format!("{} Tags", ICON_FOLDER))
                    .color(theme::color_text_weak())
                    .size(11.0),
            );
            for tag in tags {
                let selected = state
                    .automation
                    .cron_board
                    .tag_filter
                    .as_ref()
                    .map(|current| current.eq_ignore_ascii_case(&tag))
                    .unwrap_or(false);
                if selectable_chip(ui, &tag, selected).clicked() {
                    if selected {
                        state.automation.cron_board.tag_filter = None;
                    } else {
                        state.automation.cron_board.tag_filter = Some(tag);
                    }
                }
            }
            if state.automation.cron_board.tag_filter.is_some() && ui.button("Quitar tag").clicked()
            {
                state.automation.cron_board.tag_filter = None;
            }
        });
    }
}

fn draw_cron_table(ui: &mut egui::Ui, state: &mut AppState) {
    let indices = state.automation.cron_board.filtered_indices();
    if indices.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "No hay tareas que coincidan con los filtros seleccionados.",
        );
        state.automation.cron_board.select_task(None);
        return;
    }

    let min_height = ui.available_height().max(220.0);
    TableBuilder::new(ui)
        .striped(true)
        .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
        .column(Column::initial(36.0))
        .column(Column::remainder().at_least(160.0))
        .column(Column::initial(120.0))
        .column(Column::initial(120.0))
        .column(Column::initial(120.0))
        .column(Column::initial(100.0))
        .column(Column::initial(90.0))
        .min_scrolled_height(min_height)
        .header(26.0, |mut header| {
            header.col(|ui| {
                ui.label(
                    RichText::new("Estado")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Tarea")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Cadencia")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Próxima ejecución")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Última ejecución")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Proveedor")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
            header.col(|ui| {
                ui.label(
                    RichText::new("Acciones")
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
        })
        .body(|mut body| {
            for index in indices {
                let task_snapshot = state.automation.cron_board.tasks[index].clone();
                let mut selection_change = None;
                let mut new_enabled: Option<bool> = None;
                let mut trigger_run = false;

                body.row(32.0, |mut row| {
                    row.col(|ui| {
                        let (rect, _) =
                            ui.allocate_exact_size(egui::vec2(24.0, 18.0), egui::Sense::hover());
                        let painter = ui.painter_at(rect);
                        painter.circle_filled(
                            rect.center(),
                            6.0,
                            cron_status_color(task_snapshot.status),
                        );
                    });
                    row.col(|ui| {
                        let selected =
                            state.automation.cron_board.selected_task == Some(task_snapshot.id);
                        let response = ui.add(egui::SelectableLabel::new(
                            selected,
                            RichText::new(&task_snapshot.name)
                                .color(theme::color_text_primary())
                                .size(13.0),
                        ));
                        if response.clicked() {
                            selection_change = Some(task_snapshot.id);
                        }
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(&task_snapshot.cadence_label)
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(
                                task_snapshot
                                    .next_run
                                    .clone()
                                    .unwrap_or_else(|| "—".to_string()),
                            )
                            .color(theme::color_text_primary())
                            .size(11.0),
                        );
                    });
                    row.col(|ui| {
                        ui.label(
                            RichText::new(
                                task_snapshot
                                    .last_run
                                    .clone()
                                    .unwrap_or_else(|| "—".to_string()),
                            )
                            .color(theme::color_text_weak())
                            .size(11.0),
                        );
                    });
                    row.col(|ui| {
                        let badge = task_snapshot
                            .provider_badge()
                            .unwrap_or_else(|| "local".to_string());
                        ui.label(
                            RichText::new(badge)
                                .color(theme::color_text_weak())
                                .monospace(),
                        );
                    });
                    row.col(|ui| {
                        ui.horizontal(|ui| {
                            let mut enabled = task_snapshot.enabled;
                            if ui.checkbox(&mut enabled, "").changed() {
                                new_enabled = Some(enabled);
                            }

                            let run_label = RichText::new(format!("{} Ejecutar", ICON_PLAY))
                                .color(Color32::from_rgb(240, 240, 240))
                                .size(11.0);
                            if ui
                                .add(egui::Button::new(run_label).min_size(egui::vec2(96.0, 26.0)))
                                .on_hover_text("Lanzar inmediatamente")
                                .clicked()
                            {
                                trigger_run = true;
                            }
                        });
                    });
                });

                if let Some(task_id) = selection_change {
                    state.automation.cron_board.select_task(Some(task_id));
                }

                if let Some(enabled) = new_enabled {
                    let mut message = None;
                    {
                        let task = &mut state.automation.cron_board.tasks[index];
                        if task.enabled != enabled {
                            task.enabled = enabled;
                            let task_name = task.name.clone();
                            let text = if enabled {
                                format!("Tarea '{}' activada", task_name)
                            } else {
                                format!("Tarea '{}' pausada", task_name)
                            };
                            message = Some(text);
                        }
                    }
                    if let Some(text) = message {
                        state.push_debug_event(
                            DebugLogLevel::Info,
                            "cron::scheduler",
                            text.clone(),
                        );
                        state.push_activity_log(
                            if enabled {
                                LogStatus::Ok
                            } else {
                                LogStatus::Warning
                            },
                            "Cron",
                            text,
                        );
                    }
                }

                if trigger_run {
                    let name = {
                        let task = &mut state.automation.cron_board.tasks[index];
                        task.status = ScheduledTaskStatus::Running;
                        task.last_run = Some(Local::now().format("%Y-%m-%d %H:%M").to_string());
                        task.name.clone()
                    };
                    state.push_activity_log(
                        LogStatus::Running,
                        "Cron",
                        format!("Tarea '{}' ejecutada manualmente", name),
                    );
                    state.push_debug_event(
                        DebugLogLevel::Info,
                        "cron::manual",
                        format!("Lanzando '{}'", name),
                    );
                }
            }
        });
}

fn draw_cron_task_detail(ui: &mut egui::Ui, state: &AppState, task: &crate::state::ScheduledTask) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(14.0))
        .inner_margin(egui::Margin::symmetric(18.0, 14.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                ui.label(
                    RichText::new(ICON_INFO)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.heading(
                    RichText::new(&task.name)
                        .color(theme::color_text_primary())
                        .size(16.0)
                        .strong(),
                );
                ui.add_space(ui.available_width());
                ui.label(
                    RichText::new(task.status.label())
                        .color(cron_status_color(task.status))
                        .monospace(),
                );
            });
            ui.add_space(4.0);
            ui.label(
                RichText::new(&task.description)
                    .color(theme::color_text_weak())
                    .size(12.0),
            );

            ui.add_space(8.0);
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!("Expresión cron: `{}`", task.cron_expression))
                        .color(theme::color_text_weak())
                        .monospace(),
                );
            });

            if !task.tags.is_empty() {
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing.x = 6.0;
                    for tag in &task.tags {
                        selectable_chip(ui, tag, false);
                    }
                });
            }

            ui.add_space(10.0);
            let badge = task.provider_badge().unwrap_or_else(|| "local".to_string());
            ui.label(
                RichText::new(format!(
                    "Responsable: {} · Proveedor: {}",
                    task.owner, badge
                ))
                .color(theme::color_text_weak())
                .size(11.0),
            );

            if let Some(status) = state
                .automation
                .activity_logs
                .iter()
                .rev()
                .find(|entry| entry.source == "Cron")
            {
                ui.add_space(6.0);
                ui.label(
                    RichText::new(format!(
                        "Última actividad registrada: {} ({})",
                        status.message, status.timestamp
                    ))
                    .color(theme::color_text_weak())
                    .size(11.0),
                );
            }
        });
}

fn cron_status_color(status: ScheduledTaskStatus) -> Color32 {
    match status {
        ScheduledTaskStatus::Scheduled => theme::color_primary(),
        ScheduledTaskStatus::Running => Color32::from_rgb(64, 172, 255),
        ScheduledTaskStatus::Success => theme::color_success(),
        ScheduledTaskStatus::Failed => theme::color_danger(),
        ScheduledTaskStatus::Paused => Color32::from_rgb(160, 160, 160),
    }
}

fn draw_debug_summary(
    ui: &mut egui::Ui,
    info: usize,
    warning: usize,
    error: usize,
    tokens: &ThemeTokens,
) {
    ui.horizontal(|ui| {
        summary_chip(ui, ICON_INFO, "Info", info, theme::color_primary(), tokens);
        summary_chip(
            ui,
            ICON_LIGHTNING,
            "Warnings",
            warning,
            Color32::from_rgb(255, 196, 0),
            tokens,
        );
        summary_chip(
            ui,
            ICON_STOP,
            "Errores",
            error,
            theme::color_danger(),
            tokens,
        );
    });
}

fn draw_debug_filters(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        let search_width = (ui.available_width() - 160.0).max(200.0);
        ui.add_sized(
            [search_width, 28.0],
            egui::TextEdit::singleline(&mut state.debug_console.search)
                .hint_text("Buscar por mensaje o componente"),
        );
        if ui
            .add_sized([120.0, 28.0], egui::Button::new("Limpiar búsqueda"))
            .clicked()
        {
            state.debug_console.search.clear();
        }
    });

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        let selected_text = match state.debug_console.level_filter {
            Some(DebugLogLevel::Info) => "Solo INFO",
            Some(DebugLogLevel::Warning) => "Solo WARN",
            Some(DebugLogLevel::Error) => "Solo ERR",
            None => "Todos los niveles",
        };
        egui::ComboBox::from_id_source("debug_level_filter")
            .selected_text(selected_text)
            .show_ui(ui, |ui| {
                if ui
                    .selectable_label(state.debug_console.level_filter.is_none(), "Todos")
                    .clicked()
                {
                    state.debug_console.level_filter = None;
                }
                for level in [
                    DebugLogLevel::Info,
                    DebugLogLevel::Warning,
                    DebugLogLevel::Error,
                ] {
                    let selected = state.debug_console.level_filter == Some(level);
                    if ui.selectable_label(selected, level.label()).clicked() {
                        state.debug_console.level_filter = Some(level);
                    }
                }
            });

        if ui
            .checkbox(&mut state.debug_console.auto_scroll, "Auto-scroll")
            .changed()
        {
            // nothing extra
        }

        if ui
            .add_sized([120.0, 28.0], egui::Button::new("Limpiar consola"))
            .clicked()
        {
            state.debug_console.entries.clear();
        }
    });
}

fn draw_debug_entries(ui: &mut egui::Ui, state: &AppState) {
    let entries = state.debug_console.filtered_entries();
    if entries.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Sin eventos registrados bajo los filtros actuales.",
        );
        return;
    }

    egui::ScrollArea::vertical()
        .id_source("debug_console_scroll")
        .stick_to_bottom(state.debug_console.auto_scroll)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            for entry in entries {
                egui::Frame::none()
                    .fill(Color32::from_rgb(32, 34, 40))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(10.0))
                    .inner_margin(egui::Margin::symmetric(14.0, 10.0))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(entry.level.label())
                                    .color(debug_level_color(entry.level))
                                    .monospace(),
                            );
                            ui.label(
                                RichText::new(&entry.timestamp)
                                    .color(theme::color_text_weak())
                                    .monospace()
                                    .size(11.0),
                            );
                            ui.add_space(ui.available_width());
                            ui.label(
                                RichText::new(&entry.component)
                                    .color(theme::color_text_primary())
                                    .monospace()
                                    .size(11.0),
                            );
                        });
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new(&entry.message)
                                .color(theme::color_text_weak())
                                .size(12.0),
                        );
                    });
                ui.add_space(6.0);
            }
        });
}

fn debug_level_color(level: DebugLogLevel) -> Color32 {
    match level {
        DebugLogLevel::Info => theme::color_primary(),
        DebugLogLevel::Warning => Color32::from_rgb(255, 196, 0),
        DebugLogLevel::Error => theme::color_danger(),
    }
}

fn draw_chat_history(ui: &mut egui::Ui, state: &mut AppState) {
    let mut pending_actions = Vec::new();

    let max_width = ui.available_width().min(580.0);
    let target_height = ui.available_height();
    ui.allocate_ui_with_layout(
        egui::vec2(max_width, target_height),
        egui::Layout::top_down(egui::Align::LEFT),
        |ui| {
            ui.set_width(max_width);
            egui::Frame::none()
                .fill(Color32::from_rgb(26, 28, 32))
                .stroke(theme::subtle_border(&state.theme))
                .rounding(egui::Rounding::same(16.0))
                .inner_margin(egui::Margin {
                    left: 20.0,
                    right: 12.0,
                    top: 20.0,
                    bottom: 18.0,
                })
                .show(ui, |ui| {
                    let available_height = ui.available_height();
                    ui.set_min_height(available_height);
                    ui.set_width(ui.available_width());

                    egui::ScrollArea::vertical()
                        .id_source("chat_history_scroll")
                        .stick_to_bottom(true)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            let feed_width = ui.available_width().min(540.0);
                            ui.set_width(feed_width);
                            for (index, message) in state.chat.messages.iter().enumerate() {
                                draw_message_bubble(
                                    ui,
                                    state,
                                    message,
                                    index,
                                    &mut pending_actions,
                                );
                            }
                        });
                });
        },
    );

    apply_pending_actions(state, pending_actions);
}

fn draw_model_routing_bar(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        ui.label(
            RichText::new("Proveedor activo")
                .color(theme::color_text_weak())
                .size(12.0),
        );

        let mut provider = state.chat_routing.active_thread_provider;
        egui::ComboBox::from_id_source("chat_routing_provider")
            .selected_text(provider.display_name())
            .show_ui(ui, |ui| {
                for candidate in [
                    RemoteProviderKind::Anthropic,
                    RemoteProviderKind::OpenAi,
                    RemoteProviderKind::Groq,
                ] {
                    ui.selectable_value(&mut provider, candidate, candidate.display_name());
                }
            });

        if provider != state.chat_routing.active_thread_provider {
            state.chat_routing.active_thread_provider = provider;
            state.chat_routing.update_status(Some(format!(
                "Hilo configurado para {}",
                provider.display_name()
            )));
        }

        let mut toggle = state.chat_routing.route_every_message;
        if ui
            .checkbox(&mut toggle, "Enviar automáticamente")
            .on_hover_text("Si está activo, cada mensaje se enviará al proveedor seleccionado")
            .changed()
        {
            state.chat_routing.route_every_message = toggle;
            if toggle {
                state.chat_routing.update_status(Some(format!(
                    "Todos los mensajes usarán {}",
                    provider.display_name()
                )));
            } else {
                state
                    .chat_routing
                    .update_status(Some("Selecciona proveedor por mensaje.".to_string()));
            }
        }

        let lightning = egui::Button::new(
            RichText::new(ICON_LIGHTNING)
                .font(theme::icon_font(14.0))
                .color(Color32::from_rgb(240, 240, 240)),
        )
        .min_size(egui::vec2(32.0, 24.0))
        .fill(Color32::from_rgb(44, 46, 54))
        .rounding(egui::Rounding::same(8.0));

        if ui
            .add(lightning)
            .on_hover_text("Enviar solo el próximo mensaje con este proveedor")
            .clicked()
        {
            state.chat_routing.set_override(provider);
            state.chat_routing.update_status(Some(format!(
                "El siguiente mensaje usará {}",
                provider.display_name()
            )));
        }
    });

    if let Some(status) = &state.chat_routing.status {
        ui.add_space(4.0);
        ui.colored_label(theme::color_text_weak(), status);
    }

    if !state.chat_routing.suggestions.is_empty() {
        ui.add_space(6.0);
        let suggestions = state.chat_routing.suggestions.clone();
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing.x = 10.0;
            for suggestion in &suggestions {
                ui.vertical(|ui| {
                    let response = ui
                        .add(
                            egui::Button::new(
                                RichText::new(&suggestion.title)
                                    .color(Color32::from_rgb(240, 240, 240))
                                    .size(12.0),
                            )
                            .fill(Color32::from_rgb(44, 46, 54))
                            .rounding(egui::Rounding::same(10.0)),
                        )
                        .on_hover_text(&suggestion.description);

                    if response.clicked() {
                        let provider = suggestion.provider;
                        let title = suggestion.title.clone();
                        state.chat_routing.active_thread_provider = provider;
                        state.chat_routing.set_override(provider);
                        state.chat_routing.update_status(Some(format!(
                            "Sugerencia aplicada: {} via {}",
                            title,
                            provider.display_name()
                        )));
                    }

                    if !suggestion.tags.is_empty() {
                        ui.add_space(4.0);
                        ui.horizontal_wrapped(|ui| {
                            ui.spacing_mut().item_spacing.x = 4.0;
                            for tag in &suggestion.tags {
                                let _ = selectable_chip(ui, tag, false);
                            }
                        });
                    }
                });
            }
        });
    }
}

fn insert_quick_token(state: &mut AppState, token: &str) {
    if !state.chat.input.is_empty() && !state.chat.input.ends_with(' ') {
        state.chat.input.push(' ');
    }
    state.chat.input.push_str(token);
    if !token.ends_with(' ') {
        state.chat.input.push(' ');
    }
}

fn draw_message_bubble(
    ui: &mut egui::Ui,
    state: &AppState,
    message: &ChatMessage,
    index: usize,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    ui.add_space(if index == 0 { 0.0 } else { 10.0 });

    let is_user = message.sender == "User";
    let is_system = message.sender == "System";
    let (background, border, icon, accent) = if is_user {
        (
            Color32::from_rgb(34, 48, 70),
            Color32::from_rgb(62, 120, 192),
            ICON_USER,
            Color32::from_rgb(130, 180, 240),
        )
    } else if is_system {
        (
            Color32::from_rgb(36, 36, 36),
            Color32::from_rgb(88, 88, 88),
            ICON_SYSTEM,
            Color32::from_rgb(200, 200, 200),
        )
    } else {
        (
            Color32::from_rgb(30, 36, 46),
            Color32::from_rgb(70, 110, 180),
            ICON_ASSISTANT,
            Color32::from_rgb(150, 200, 255),
        )
    };

    let layout = if is_user {
        egui::Layout::right_to_left(egui::Align::TOP)
    } else {
        egui::Layout::left_to_right(egui::Align::TOP)
    };

    ui.with_layout(layout, |ui| {
        let available_width = ui.available_width();
        let mut bubble_width = if available_width > 32.0 {
            (available_width - 16.0).max(available_width * 0.6)
        } else {
            available_width
        };
        if available_width > 320.0 {
            bubble_width = bubble_width.clamp(320.0, available_width);
        }
        bubble_width = bubble_width.min(available_width);

        ui.add_space(8.0);
        let frame = egui::Frame::none()
            .fill(background)
            .stroke(egui::Stroke::new(1.4, border))
            .rounding(egui::Rounding::same(14.0))
            .inner_margin(egui::Margin::same(16.0));

        let response = frame.show(ui, |ui| {
            ui.set_width(bubble_width);
            ui.vertical(|ui| {
                draw_message_header(ui, state, message, icon, accent, pending_actions);
                ui.add_space(6.0);
                draw_message_body(ui, message, accent);
                draw_developer_artifacts(ui, message, &state.theme);
            });
        });

        if response.response.double_clicked() && !is_user && !message.is_pending() {
            pending_actions.push(PendingChatAction::Mention(format!(
                "@{}",
                message.sender.to_lowercase()
            )));
        }
    });
}

fn draw_message_header(
    ui: &mut egui::Ui,
    state: &AppState,
    message: &ChatMessage,
    icon: &str,
    accent: Color32,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        ui.label(
            RichText::new(icon)
                .font(theme::icon_font(16.0))
                .color(accent),
        );
        let sender_label = if message.sender == "User" {
            "Tú"
        } else {
            &message.sender
        };
        ui.label(
            RichText::new(sender_label)
                .strong()
                .color(theme::color_text_primary()),
        );
        if message.sender != "User" && message.sender != "System" {
            let provider = state.chat_routing.active_thread_provider.display_name();
            ui.label(RichText::new(provider).color(accent).size(12.0).italics());
        }
        ui.label(
            RichText::new(ICON_CLOCK)
                .font(theme::icon_font(12.0))
                .color(theme::color_text_weak()),
        );
        ui.label(
            RichText::new(&message.timestamp)
                .italics()
                .size(12.0)
                .color(theme::color_text_weak()),
        );
        ui.add_space(ui.available_width());
        draw_message_actions(ui, message, pending_actions);
    });
}

fn draw_message_actions(
    ui: &mut egui::Ui,
    message: &ChatMessage,
    pending_actions: &mut Vec<PendingChatAction>,
) {
    let enabled = !message.is_pending();

    if message_action_button(ui, ICON_COPY, "Copiar mensaje al portapapeles", enabled).clicked() {
        let text = message.text.clone();
        ui.output_mut(|out| out.copied_text = text);
    }

    if message_action_button(ui, ICON_QUOTE, "Citar mensaje en el input", enabled).clicked() {
        let mut quoted = message
            .text
            .lines()
            .map(|line| format!("> {}", line))
            .collect::<Vec<_>>()
            .join("\n");
        quoted.push_str("\n\n");
        pending_actions.push(PendingChatAction::Quote(quoted));
    }

    if message_action_button(ui, ICON_PIN, "Reutilizar este mensaje", enabled).clicked() {
        pending_actions.push(PendingChatAction::Reuse(message.text.clone()));
    }
}

fn message_action_button(
    ui: &mut egui::Ui,
    icon: &str,
    tooltip: &str,
    enabled: bool,
) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(icon)
            .font(theme::icon_font(13.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(30.0, 26.0))
    .fill(Color32::from_rgb(44, 46, 54))
    .rounding(egui::Rounding::same(6.0));

    let response = ui.add_enabled(enabled, button);
    response.on_hover_text(tooltip)
}

fn draw_message_body(ui: &mut egui::Ui, message: &ChatMessage, accent: Color32) {
    if message.is_pending() {
        ui.horizontal(|ui| {
            ui.add(Spinner::new().size(18.0));
            ui.label(
                RichText::new(&message.text)
                    .color(theme::color_text_weak())
                    .italics()
                    .size(14.0),
            );
        });
        return;
    }

    let blocks = parse_markdown_blocks(&message.text);
    if blocks.is_empty() {
        render_formatted_text(ui, &message.text, theme::color_text_primary(), 15.0);
    } else {
        render_markdown_blocks(ui, &blocks, accent);
    }
}

fn render_markdown_blocks(ui: &mut egui::Ui, blocks: &[MarkdownBlock], accent: Color32) {
    let mut first = true;
    for block in blocks {
        if !first {
            ui.add_space(6.0);
        }
        first = false;

        match block {
            MarkdownBlock::Heading { level, text } => {
                let size = match level {
                    1 => 20.0,
                    2 => 18.0,
                    3 => 16.0,
                    _ => 15.0,
                };
                ui.label(RichText::new(text).color(accent).strong().size(size));
            }
            MarkdownBlock::Paragraph(text) => {
                render_formatted_text(ui, text, theme::color_text_primary(), 15.0);
            }
            MarkdownBlock::BulletList(items) => {
                ui.vertical(|ui| {
                    for item in items {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            ui.label(RichText::new("•").color(accent).strong().size(16.0));
                            render_formatted_text(ui, item, theme::color_text_primary(), 15.0);
                        });
                    }
                });
            }
            MarkdownBlock::CodeBlock { language, code } => {
                draw_code_block(ui, language, code);
            }
            MarkdownBlock::Table { headers, rows } => {
                draw_markdown_table(ui, headers, rows);
            }
        }
    }
}

fn draw_code_block(ui: &mut egui::Ui, language: &str, code: &str) {
    let code_string = code.trim_end_matches('\n').to_string();
    let header_label = if language.trim().is_empty() {
        "Bloque de código".to_string()
    } else {
        format!("{}", language)
    };

    egui::CollapsingHeader::new(
        RichText::new(format!("{} {}", ICON_CODE, header_label))
            .color(theme::color_text_primary())
            .strong()
            .size(13.0),
    )
    .default_open(true)
    .show(ui, |ui| {
        egui::Frame::none()
            .fill(Color32::from_rgb(32, 34, 40))
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(60, 72, 92)))
            .rounding(egui::Rounding::same(10.0))
            .inner_margin(egui::Margin::symmetric(14.0, 12.0))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.add_space(ui.available_width());
                    if code_copy_button(ui).clicked() {
                        ui.output_mut(|out| out.copied_text = code_string.clone());
                    }
                });
                ui.add_space(6.0);
                let mut code_buffer = code_string.clone();
                let rows = code_buffer.lines().count().max(1);
                ui.add(
                    egui::TextEdit::multiline(&mut code_buffer)
                        .font(egui::FontId::monospace(14.0))
                        .desired_rows(rows)
                        .frame(false)
                        .interactive(false)
                        .desired_width(f32::INFINITY),
                );
            });
    });
}

fn code_copy_button(ui: &mut egui::Ui) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(ICON_COPY)
            .font(theme::icon_font(14.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(32.0, 26.0))
    .fill(Color32::from_rgb(45, 47, 56))
    .rounding(egui::Rounding::same(6.0));

    ui.add(button).on_hover_text("Copiar bloque de código")
}

fn draw_markdown_table(ui: &mut egui::Ui, headers: &[String], rows: &[Vec<String>]) {
    egui::Frame::none()
        .fill(Color32::from_rgb(32, 34, 40))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(60, 72, 92)))
        .rounding(egui::Rounding::same(10.0))
        .inner_margin(egui::Margin::symmetric(12.0, 10.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!("{} Tabla", ICON_TABLE))
                        .color(theme::color_text_primary())
                        .strong()
                        .size(13.0),
                );
                ui.add_space(ui.available_width());
                if code_copy_button(ui).clicked() {
                    let mut buffer = String::new();
                    buffer.push('|');
                    buffer.push_str(&headers.join("|"));
                    buffer.push('|');
                    buffer.push('\n');
                    buffer.push('|');
                    buffer.push_str(&headers.iter().map(|_| "---").collect::<Vec<_>>().join("|"));
                    buffer.push('|');
                    buffer.push('\n');
                    for row in rows {
                        buffer.push('|');
                        buffer.push_str(&row.join("|"));
                        buffer.push('|');
                        buffer.push('\n');
                    }
                    ui.output_mut(|out| out.copied_text = buffer);
                }
            });

            ui.add_space(6.0);
            ui.push_id(("markdown_table", headers.len(), rows.len()), |ui| {
                egui::Grid::new("markdown_table_grid")
                    .striped(true)
                    .spacing(egui::vec2(12.0, 4.0))
                    .show(ui, |ui| {
                        for header in headers {
                            ui.label(
                                RichText::new(header)
                                    .color(theme::color_text_primary())
                                    .strong(),
                            );
                        }
                        ui.end_row();

                        for row in rows {
                            for cell in row {
                                ui.label(
                                    RichText::new(cell)
                                        .color(theme::color_text_weak())
                                        .size(12.0),
                                );
                            }
                            ui.end_row();
                        }
                    });
            });
        });
}

fn draw_developer_artifacts(ui: &mut egui::Ui, message: &ChatMessage, tokens: &ThemeTokens) {
    if message.sender == "User" || message.sender == "System" || message.is_pending() {
        return;
    }

    let blocks = parse_markdown_blocks(&message.text);
    let diff_block = extract_diff_block(&blocks);
    let preview_block = extract_preview_block(&blocks);
    let summary = extract_summary(&message.text);

    if diff_block.is_none() && preview_block.is_none() && summary.is_none() {
        return;
    }

    ui.add_space(10.0);
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 38, 44))
        .stroke(theme::subtle_border(tokens))
        .rounding(egui::Rounding::same(10.0))
        .inner_margin(egui::Margin::symmetric(12.0, 10.0))
        .show(ui, |ui| {
            ui.label(
                RichText::new("Herramientas de desarrollo")
                    .color(theme::color_text_primary())
                    .strong()
                    .size(13.0),
            );

            if let Some(summary) = summary {
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(ICON_QUOTE)
                            .font(theme::icon_font(12.0))
                            .color(theme::color_primary()),
                    );
                    ui.label(
                        RichText::new(summary)
                            .color(theme::color_text_primary())
                            .size(12.0),
                    );
                });
            }

            if let Some(diff) = diff_block {
                ui.add_space(6.0);
                egui::CollapsingHeader::new(
                    RichText::new(format!("{} Diferencias detectadas", ICON_COMPARE))
                        .color(theme::color_text_primary())
                        .strong()
                        .size(12.0),
                )
                .default_open(false)
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.add_space(ui.available_width());
                        if code_copy_button(ui).clicked() {
                            ui.output_mut(|out| out.copied_text = diff.clone());
                        }
                    });
                    let preview: String = diff
                        .lines()
                        .take(20)
                        .map(|line| line.to_string())
                        .collect::<Vec<_>>()
                        .join("\n");
                    ui.add(
                        egui::TextEdit::multiline(&mut preview.clone())
                            .font(egui::FontId::monospace(13.0))
                            .desired_rows(6)
                            .frame(false)
                            .interactive(false)
                            .desired_width(f32::INFINITY),
                    );
                });
            }

            if let Some((language, code)) = preview_block {
                ui.add_space(6.0);
                egui::CollapsingHeader::new(
                    RichText::new(format!("{} Vista previa de {}", ICON_FILE_DOC, language))
                        .color(theme::color_text_primary())
                        .strong()
                        .size(12.0),
                )
                .default_open(false)
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.add_space(ui.available_width());
                        if code_copy_button(ui).clicked() {
                            ui.output_mut(|out| out.copied_text = code.clone());
                        }
                    });
                    let snippet: String = code
                        .lines()
                        .take(20)
                        .map(|line| line.to_string())
                        .collect::<Vec<_>>()
                        .join("\n");
                    ui.add(
                        egui::TextEdit::multiline(&mut snippet.clone())
                            .font(egui::FontId::monospace(13.0))
                            .desired_rows(6)
                            .frame(false)
                            .interactive(false)
                            .desired_width(f32::INFINITY),
                    );
                });
            }
        });
}

fn render_formatted_text(ui: &mut egui::Ui, text: &str, color: Color32, size: f32) {
    let segments = parse_inline_segments(text);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;
        for segment in segments {
            if segment.text.is_empty() {
                continue;
            }

            let mut rich = RichText::new(segment.text).color(color).size(size);
            if segment.bold {
                rich = rich.strong();
            }
            if segment.italic {
                rich = rich.italics();
            }
            if segment.code {
                rich = rich
                    .monospace()
                    .background_color(Color32::from_rgb(40, 44, 54))
                    .color(Color32::from_rgb(220, 220, 220));
            }

            ui.label(rich);
        }
    });
}

fn parse_markdown_blocks(text: &str) -> Vec<MarkdownBlock> {
    let mut blocks = Vec::new();
    let mut paragraph: Vec<String> = Vec::new();
    let mut list_items: Vec<String> = Vec::new();
    let mut code_lines: Vec<String> = Vec::new();
    let mut code_language = String::new();
    let mut in_code_block = false;
    let mut in_table = false;
    let mut table_headers: Vec<String> = Vec::new();
    let mut table_rows: Vec<Vec<String>> = Vec::new();

    let flush_paragraph = |blocks: &mut Vec<MarkdownBlock>, paragraph: &mut Vec<String>| {
        if paragraph.is_empty() {
            return;
        }
        let mut combined = String::new();
        for (index, line) in paragraph.iter().enumerate() {
            if index > 0 {
                combined.push(' ');
            }
            combined.push_str(line);
        }
        paragraph.clear();
        blocks.push(MarkdownBlock::Paragraph(combined));
    };

    let flush_list = |blocks: &mut Vec<MarkdownBlock>, list_items: &mut Vec<String>| {
        if list_items.is_empty() {
            return;
        }
        blocks.push(MarkdownBlock::BulletList(list_items.clone()));
        list_items.clear();
    };

    for line in text.lines() {
        let trimmed_start = line.trim_start();
        let trimmed = line.trim();

        let is_table_candidate =
            trimmed.contains('|') && trimmed.chars().filter(|ch| *ch == '|').count() >= 2;
        let is_table_separator = trimmed
            .chars()
            .all(|ch| matches!(ch, '|' | '-' | ':' | ' '));

        if in_code_block {
            if trimmed_start.starts_with("```") {
                let code = code_lines.join("\n");
                blocks.push(MarkdownBlock::CodeBlock {
                    language: code_language.clone(),
                    code,
                });
                code_lines.clear();
                code_language.clear();
                in_code_block = false;
            } else {
                code_lines.push(line.to_string());
            }
            continue;
        }

        if trimmed_start.starts_with("```") {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            flush_table_block(
                &mut blocks,
                &mut table_headers,
                &mut table_rows,
                &mut in_table,
            );
            code_language = trimmed_start[3..].trim().to_string();
            in_code_block = true;
            code_lines.clear();
            continue;
        }

        if in_table && (!is_table_candidate || trimmed.is_empty()) {
            flush_table_block(
                &mut blocks,
                &mut table_headers,
                &mut table_rows,
                &mut in_table,
            );
        }

        if is_table_candidate && !is_table_separator {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            let cells = parse_table_cells(trimmed_start);
            if !in_table {
                table_headers = cells;
                in_table = true;
            } else {
                table_rows.push(cells);
            }
            continue;
        }

        if in_table && is_table_separator {
            continue;
        }

        if trimmed_start.starts_with("```") {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            code_language = trimmed_start[3..].trim().to_string();
            in_code_block = true;
            code_lines.clear();
            continue;
        }

        if trimmed.is_empty() {
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            flush_table_block(
                &mut blocks,
                &mut table_headers,
                &mut table_rows,
                &mut in_table,
            );
            continue;
        }

        if trimmed_start.starts_with('#') {
            let hash_count = trimmed_start
                .chars()
                .take_while(|ch| *ch == '#')
                .count()
                .max(1);
            let content = trimmed_start[hash_count..].trim();
            flush_paragraph(&mut blocks, &mut paragraph);
            flush_list(&mut blocks, &mut list_items);
            flush_table_block(
                &mut blocks,
                &mut table_headers,
                &mut table_rows,
                &mut in_table,
            );
            blocks.push(MarkdownBlock::Heading {
                level: hash_count.min(6),
                text: content.to_string(),
            });
            continue;
        }

        if let Some(stripped) = trimmed_start.strip_prefix("- ") {
            flush_paragraph(&mut blocks, &mut paragraph);
            list_items.push(stripped.trim().to_string());
            continue;
        }

        if let Some(stripped) = trimmed_start.strip_prefix("* ") {
            flush_paragraph(&mut blocks, &mut paragraph);
            list_items.push(stripped.trim().to_string());
            continue;
        }

        flush_table_block(
            &mut blocks,
            &mut table_headers,
            &mut table_rows,
            &mut in_table,
        );
        paragraph.push(trimmed.to_string());
    }

    if in_code_block {
        let code = code_lines.join("\n");
        blocks.push(MarkdownBlock::CodeBlock {
            language: code_language,
            code,
        });
    }

    flush_paragraph(&mut blocks, &mut paragraph);
    flush_list(&mut blocks, &mut list_items);
    flush_table_block(
        &mut blocks,
        &mut table_headers,
        &mut table_rows,
        &mut in_table,
    );

    blocks
}

fn flush_table_block(
    blocks: &mut Vec<MarkdownBlock>,
    headers: &mut Vec<String>,
    rows: &mut Vec<Vec<String>>,
    in_table: &mut bool,
) {
    if *in_table {
        blocks.push(MarkdownBlock::Table {
            headers: headers.clone(),
            rows: rows.clone(),
        });
        headers.clear();
        rows.clear();
        *in_table = false;
    }
}

fn parse_table_cells(line: &str) -> Vec<String> {
    line.trim()
        .trim_matches('|')
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect()
}

fn extract_diff_block(blocks: &[MarkdownBlock]) -> Option<String> {
    for block in blocks {
        if let MarkdownBlock::CodeBlock { language, code } = block {
            if language.trim().eq_ignore_ascii_case("diff") {
                return Some(code.clone());
            }
        }
    }
    None
}

fn extract_preview_block(blocks: &[MarkdownBlock]) -> Option<(String, String)> {
    for block in blocks {
        if let MarkdownBlock::CodeBlock { language, code } = block {
            if language.trim().eq_ignore_ascii_case("diff") {
                continue;
            }
            if !code.trim().is_empty() {
                return Some((language.clone(), code.clone()));
            }
        }
    }
    None
}

fn extract_summary(text: &str) -> Option<String> {
    let mut lines = text.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();
        if lower.starts_with("resumen")
            || lower.contains("resumen semántico")
            || lower.starts_with("summary")
        {
            let mut summary = String::new();
            if let Some(index) = trimmed.find(':') {
                let remainder = trimmed[index + 1..].trim();
                if !remainder.is_empty() {
                    summary.push_str(remainder);
                }
            }

            while let Some(peek) = lines.peek() {
                if peek.trim().is_empty()
                    || peek.trim_start().starts_with("```")
                    || peek.trim_start().starts_with('#')
                {
                    break;
                }
                let next_line = lines.next().unwrap();
                if !summary.is_empty() {
                    summary.push(' ');
                }
                summary.push_str(next_line.trim());
                if summary.len() > 320 {
                    break;
                }
            }

            if summary.is_empty() {
                continue;
            }

            return Some(summary);
        }
    }

    None
}

fn parse_inline_segments(text: &str) -> Vec<InlineSegment> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut bold = false;
    let mut italic = false;
    let mut code = false;
    let mut index = 0;
    let bytes = text.as_bytes();

    while index < bytes.len() {
        if !code && text[index..].starts_with("**") {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            bold = !bold;
            index += 2;
            continue;
        }

        if !code && text[index..].starts_with('*') {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            italic = !italic;
            index += 1;
            continue;
        }

        if text[index..].starts_with('`') {
            if !current.is_empty() {
                segments.push(InlineSegment {
                    text: current.clone(),
                    bold,
                    italic,
                    code,
                });
                current.clear();
            }
            code = !code;
            index += 1;
            continue;
        }

        let ch = text[index..].chars().next().unwrap();
        current.push(ch);
        index += ch.len_utf8();
    }

    if !current.is_empty() {
        segments.push(InlineSegment {
            text: current,
            bold,
            italic,
            code,
        });
    }

    segments
}

#[derive(Clone)]
struct InlineSegment {
    text: String,
    bold: bool,
    italic: bool,
    code: bool,
}

#[derive(Debug)]
enum MarkdownBlock {
    Heading {
        level: usize,
        text: String,
    },
    Paragraph(String),
    BulletList(Vec<String>),
    CodeBlock {
        language: String,
        code: String,
    },
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
}

fn apply_pending_actions(state: &mut AppState, actions: Vec<PendingChatAction>) {
    for action in actions {
        match action {
            PendingChatAction::Mention(tag) => insert_mention(state, &tag),
            PendingChatAction::Quote(text) => {
                if !state.chat.input.ends_with('\n') && !state.chat.input.is_empty() {
                    state.chat.input.push('\n');
                }
                state.chat.input.push_str(&text);
            }
            PendingChatAction::Reuse(text) => state.chat.input = text,
        }
    }
}

fn draw_chat_input(ui: &mut egui::Ui, state: &mut AppState) {
    let max_width = ui.available_width().min(580.0);
    ui.allocate_ui_with_layout(
        egui::vec2(max_width, 0.0),
        egui::Layout::top_down(egui::Align::LEFT),
        |ui| {
            ui.set_width(max_width);
            egui::Frame::none()
                .fill(Color32::from_rgb(24, 26, 32))
                .stroke(theme::subtle_border(&state.theme))
                .rounding(egui::Rounding::same(16.0))
                .inner_margin(egui::Margin::symmetric(18.0, 14.0))
                .show(ui, |ui| {
                    let full_width = ui.available_width().min(560.0);
                    ui.set_width(full_width);
                    ui.vertical(|ui| {
                        draw_model_routing_bar(ui, state);
                        ui.add_space(6.0);
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            if let Some(tag) = state.jarvis_mention_tag() {
                                if quick_chip(ui, &tag).clicked() {
                                    insert_mention(state, &tag);
                                }
                            }

                            for (mention, label) in QUICK_MENTIONS {
                                if quick_chip(ui, label).clicked() {
                                    insert_mention(state, mention);
                                }
                            }

                            ui.add_space(ui.available_width());

                            if quick_chip_with_icon(ui, ICON_CODE, "Insertar bloque de código").clicked() {
                                insert_code_template(state);
                            }
                        });

                        ui.add_space(4.0);
                        ui.horizontal_wrapped(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            for (command, label) in QUICK_COMMANDS {
                                if quick_chip(ui, label).clicked() {
                                    insert_quick_token(state, command);
                                }
                            }
                        });

                        ui.add_space(12.0);

                        let mut should_send = false;

                        let text_height = 82.0;
                        let enter_pressed = ui.input(|input| {
                            input.key_pressed(egui::Key::Enter) && !input.modifiers.shift
                        });

                        let text_response = ui
                            .allocate_ui_with_layout(
                                egui::vec2(ui.available_width(), text_height),
                                egui::Layout::top_down(egui::Align::LEFT),
                                |ui| {
                                    let text_edit = egui::TextEdit::multiline(
                                        &mut state.chat.input,
                                    )
                                    .desired_rows(3)
                                    .hint_text(
                                        "Escribe tu mensaje o comando. Usa Shift+Enter para saltos de línea.",
                                    )
                                    .lock_focus(true)
                                    .desired_width(f32::INFINITY)
                                    .frame(false);

                                    let text_frame = egui::Frame::none()
                                        .fill(Color32::from_rgb(30, 32, 38))
                                        .stroke(theme::subtle_border(&state.theme))
                                        .rounding(egui::Rounding::same(12.0))
                                        .inner_margin(egui::Margin::symmetric(14.0, 10.0));

                                    text_frame
                                        .show(ui, |ui| {
                                            ui.set_height(text_height);
                                            ui.spacing_mut().item_spacing.x = 12.0;

                                            ui.horizontal(|ui| {
                                                let button_width = 34.0;
                                                let available = ui.available_width();
                                                let text_size = [
                                                    (available - button_width).max(120.0),
                                                    text_height - 20.0,
                                                ];
                                                let text_response =
                                                    ui.add_sized(text_size, text_edit);

                                                let (button_rect, send_response) = ui
                                                    .allocate_exact_size(
                                                        egui::vec2(
                                                            button_width,
                                                            text_response
                                                                .rect
                                                                .height()
                                                                .max(28.0),
                                                        ),
                                                        egui::Sense::click(),
                                                    );
                                                let send_response = send_response
                                                    .on_hover_text("Enviar mensaje")
                                                    .on_hover_cursor(egui::CursorIcon::PointingHand);
                                                let painter = ui.painter_at(button_rect);
                                                painter.text(
                                                    button_rect.center(),
                                                    egui::Align2::CENTER_CENTER,
                                                    ICON_SEND,
                                                    theme::icon_font(20.0),
                                                    Color32::from_rgb(240, 240, 240),
                                                );

                                                (text_response, send_response)
                                            })
                                            .inner
                                        })
                                        .inner
                                },
                            )
                            .inner;

                        let (text_response, send_response) = text_response;

                        if text_response.has_focus() && enter_pressed {
                            should_send = true;
                            ui.ctx()
                                .memory_mut(|mem| mem.request_focus(text_response.id));
                        }

                        if send_response.clicked() {
                            should_send = true;
                        }

                        if should_send {
                            submit_chat_message(state);
                        }
                    });
                });
        },
    );
}

fn submit_chat_message(state: &mut AppState) {
    let trimmed = state.chat.input.trim();
    if trimmed.is_empty() {
        state.chat.input.clear();
        return;
    }

    let mut input = trimmed.to_string();
    while input.ends_with('\n') {
        input.pop();
    }
    state.chat.input.clear();

    if input.starts_with('/') {
        state.chat.messages.push(ChatMessage::user(input.clone()));
        state.handle_command(input);
    } else {
        state.chat.messages.push(ChatMessage::user(input.clone()));
        if state.try_route_provider_message(&input) {
            return;
        }

        if state.try_route_selected_provider(&input) {
            return;
        }

        if state.try_invoke_jarvis_alias(&input) {
            return;
        }

        if state.resources.jarvis_respond_without_alias {
            state.respond_with_jarvis(input);
        }
    }
}

fn draw_selected_preference(ui: &mut egui::Ui, state: &mut AppState, tab_index: usize) {
    match state.selected_preference {
        PreferencePanel::SystemGithub => draw_system_github(ui, state),
        PreferencePanel::SystemCache => draw_system_cache(ui, state),
        PreferencePanel::SystemResources => draw_system_resources(ui, state),
        PreferencePanel::CustomizationCommands => {
            draw_custom_commands_section(ui, state, tab_index)
        }
        PreferencePanel::CustomizationAppearance => draw_customization_appearance(ui, state),
        PreferencePanel::CustomizationMemory => draw_customization_memory(ui, state),
        PreferencePanel::CustomizationProfiles => draw_customization_profiles(ui, state),
        PreferencePanel::CustomizationProjects => draw_customization_projects(ui, state),
        PreferencePanel::ProvidersAnthropic => draw_provider_anthropic(ui, state, tab_index),
        PreferencePanel::ProvidersOpenAi => draw_provider_openai(ui, state, tab_index),
        PreferencePanel::ProvidersGroq => draw_provider_groq(ui, state, tab_index),
        PreferencePanel::LocalJarvis => draw_local_settings(ui, state),
    }
}

fn draw_selected_resource(ui: &mut egui::Ui, state: &mut AppState, section: ResourceSection) {
    match section {
        ResourceSection::LocalCatalog(provider) => draw_local_provider(ui, state, provider),
        ResourceSection::RemoteCatalog(kind) => draw_remote_provider_catalog(ui, state, kind),
        ResourceSection::InstalledLocal => draw_local_library_overview(ui, state),
        ResourceSection::ConnectedProjects => {
            draw_project_resources(ui, state, ProjectResourceKind::LocalProject)
        }
        ResourceSection::GithubRepositories => {
            draw_project_resources(ui, state, ProjectResourceKind::GithubRepository)
        }
    }
}

fn draw_project_resources(ui: &mut egui::Ui, state: &mut AppState, kind: ProjectResourceKind) {
    let (title, subtitle) = match kind {
        ProjectResourceKind::LocalProject => (
            "Proyectos locales sincronizados",
            "Explora carpetas conectadas al agente con estado de sincronización y README en vivo.",
        ),
        ProjectResourceKind::GithubRepository => (
            "Repositorios GitHub enlazados",
            "Consulta repositorios con sincronización bidireccional y acciones rápidas desde JungleMonkAI.",
        ),
    };

    ui.heading(
        RichText::new(title)
            .color(theme::color_text_primary())
            .strong()
            .size(18.0),
    );
    ui.label(
        RichText::new(subtitle)
            .color(theme::color_text_weak())
            .size(12.0),
    );

    ui.add_space(10.0);

    let cards = state.resources.project_resources_by_kind(kind);
    if cards.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "No hay recursos sincronizados en esta categoría todavía.",
        );
        return;
    }

    for card in cards {
        draw_project_resource_card(ui, state, &card);
        ui.add_space(12.0);
    }
}

fn draw_project_resource_card(ui: &mut egui::Ui, state: &mut AppState, card: &ProjectResourceCard) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(16.0))
        .inner_margin(egui::Margin {
            left: 18.0,
            right: 18.0,
            top: 14.0,
            bottom: 14.0,
        })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.heading(
                        RichText::new(&card.name)
                            .color(theme::color_text_primary())
                            .size(16.0)
                            .strong(),
                    );
                    ui.add_space(ui.available_width());
                    let status_color = sync_health_color(card.status.health);
                    ui.label(
                        RichText::new(card.status.label())
                            .color(status_color)
                            .monospace()
                            .size(12.0),
                    );
                });

                ui.label(
                    RichText::new(card.status.detail())
                        .color(theme::color_text_weak())
                        .size(12.0),
                );

                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(format!("Ubicación: {}", card.location))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.add_space(18.0);
                    ui.label(
                        RichText::new(format!("Última sincronización: {}", card.last_sync))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.add_space(18.0);
                    ui.label(
                        RichText::new(format!("Rama principal: {}", card.default_branch))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                });

                if !card.tags.is_empty() {
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing.x = 6.0;
                        ui.label(
                            RichText::new("Tags")
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        for tag in &card.tags {
                            selectable_chip(ui, tag, false);
                        }
                    });
                }

                ui.add_space(10.0);
                ui.label(
                    RichText::new("README destacado")
                        .color(theme::color_text_primary())
                        .size(12.0)
                        .strong(),
                );
                ui.add_space(4.0);
                egui::Frame::none()
                    .fill(Color32::from_rgb(28, 30, 36))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(12.0))
                    .inner_margin(egui::Margin::same(12.0))
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new(&card.readme_preview)
                                .color(theme::color_text_weak())
                                .monospace()
                                .size(12.0),
                        );
                    });

                if !card.pending_actions.is_empty() {
                    ui.add_space(8.0);
                    ui.label(
                        RichText::new("Acciones sugeridas")
                            .color(theme::color_text_primary())
                            .size(12.0)
                            .strong(),
                    );
                    for action in &card.pending_actions {
                        ui.label(
                            RichText::new(format!("• {}", action))
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                    }
                }

                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    let open_button = theme::secondary_button(
                        RichText::new("Abrir README")
                            .color(theme::color_text_primary())
                            .strong(),
                        &state.theme,
                    )
                    .min_size(egui::vec2(140.0, 30.0));
                    if ui.add(open_button).clicked() {
                        state.push_activity_log(
                            LogStatus::Ok,
                            "Recursos",
                            format!("Abrió README de {}", card.name),
                        );
                        ui.output_mut(|out| out.copied_text = card.readme_preview.clone());
                    }

                    ui.add_space(8.0);
                    let sync_button = theme::primary_button(
                        RichText::new("Sincronizar ahora")
                            .color(Color32::WHITE)
                            .strong(),
                        &state.theme,
                    )
                    .min_size(egui::vec2(150.0, 30.0));
                    if ui.add(sync_button).clicked() {
                        state.push_activity_log(
                            LogStatus::Running,
                            "Recursos",
                            format!("Sincronización solicitada para {}", card.name),
                        );
                        state.push_debug_event(
                            DebugLogLevel::Info,
                            "resources::sync",
                            format!("Marcado '{}' para sincronización manual", card.name),
                        );
                    }
                });
            });
        });
}

fn sync_health_color(health: SyncHealth) -> Color32 {
    match health {
        SyncHealth::Healthy => theme::color_success(),
        SyncHealth::Warning => Color32::from_rgb(255, 196, 0),
        SyncHealth::Error => theme::color_danger(),
    }
}

fn draw_remote_provider_catalog(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: RemoteProviderKind,
) {
    match provider {
        RemoteProviderKind::Anthropic => {
            let anthropic_key = state.config.anthropic.api_key.clone().unwrap_or_default();
            let trimmed = anthropic_key.trim().to_string();
            draw_claude_catalog(ui, state, trimmed.as_str());
            ui.add_space(18.0);
            draw_remote_catalog_explorer(ui, state, provider);
        }
        RemoteProviderKind::OpenAi | RemoteProviderKind::Groq => {
            draw_remote_catalog_explorer(ui, state, provider);
        }
    }
}

fn draw_remote_catalog_explorer(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: RemoteProviderKind,
) {
    let provider_label = provider.display_name();
    ui.heading(
        RichText::new(format!("{} · Galería enriquecida", provider_label))
            .color(theme::color_text_primary())
            .strong()
            .size(18.0),
    );
    ui.label(
        RichText::new(
            "Compara capacidades, costos y lanza pruebas rápidas directamente desde JungleMonkAI.",
        )
        .color(theme::color_text_weak())
        .size(12.0),
    );

    ui.add_space(10.0);
    let tags = state.resources.remote_catalog.all_tags(provider);
    let mut reset_status = false;

    {
        let filters = state.resources.remote_catalog.filters_mut(provider);

        ui.horizontal(|ui| {
            let search_width = (ui.available_width() - 140.0).max(200.0);
            let search_response = ui.add_sized(
                [search_width, 30.0],
                egui::TextEdit::singleline(&mut filters.search)
                    .hint_text("Buscar por nombre, tags o capacidades"),
            );
            if search_response.changed() {
                reset_status = true;
            }

            if ui
                .add_sized([120.0, 30.0], egui::Button::new("Limpiar filtros"))
                .clicked()
            {
                *filters = Default::default();
                reset_status = true;
            }
        });

        ui.add_space(6.0);
        ui.horizontal(|ui| {
            let mut cost_enabled = filters.max_cost.is_some();
            if ui
                .checkbox(&mut cost_enabled, "Coste ≤ USD / 1M tokens")
                .changed()
            {
                if cost_enabled {
                    filters.max_cost = Some(filters.max_cost.unwrap_or(15.0));
                } else {
                    filters.max_cost = None;
                }
            }

            if cost_enabled {
                let mut value = filters.max_cost.unwrap_or(15.0);
                if ui
                    .add(
                        egui::Slider::new(&mut value, 0.5..=120.0)
                            .logarithmic(true)
                            .text("USD / 1M"),
                    )
                    .changed()
                {
                    filters.max_cost = Some(value);
                }
            }

            let mut context_enabled = filters.min_context.is_some();
            if ui
                .checkbox(&mut context_enabled, "Contexto mínimo")
                .changed()
            {
                if context_enabled {
                    filters.min_context = Some(filters.min_context.unwrap_or(8192));
                } else {
                    filters.min_context = None;
                }
            }

            if context_enabled {
                let mut value = filters.min_context.unwrap_or(8192) as f32;
                if ui
                    .add(
                        egui::Slider::new(&mut value, 4096.0..=400_000.0)
                            .logarithmic(true)
                            .text("tokens"),
                    )
                    .changed()
                {
                    filters.min_context = Some(value.round() as u32);
                }
            }
        });

        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.checkbox(&mut filters.favorites_only, "Solo favoritos");
            ui.checkbox(&mut filters.multimodal_only, "Solo multimodal");
        });

        if !tags.is_empty() {
            ui.add_space(6.0);
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                ui.label(
                    RichText::new(format!("{} Tags", ICON_FILTER))
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
                for tag in &tags {
                    let selected = filters.tag_filters.contains(tag);
                    if selectable_chip(ui, tag, selected).clicked() {
                        if selected {
                            filters.tag_filters.remove(tag);
                        } else {
                            filters.tag_filters.insert(tag.clone());
                        }
                        reset_status = true;
                    }
                }
                if !filters.tag_filters.is_empty()
                    && ui
                        .button(RichText::new("Limpiar tags").size(11.0))
                        .clicked()
                {
                    filters.tag_filters.clear();
                    reset_status = true;
                }
            });
        }
    }

    if reset_status {
        state.resources.remote_catalog.update_status(None);
    }

    ui.add_space(10.0);
    ui.horizontal(|ui| {
        let prompt_width = (ui.available_width() - 140.0).max(200.0);
        ui.add_sized(
            [prompt_width, 30.0],
            egui::TextEdit::singleline(&mut state.resources.remote_catalog.quick_test_prompt)
                .hint_text("Prompt para 'Probar' (ej. Resume los últimos commits)"),
        );
        if ui
            .add_sized([120.0, 30.0], egui::Button::new("Limpiar prompt"))
            .clicked()
        {
            state.resources.remote_catalog.quick_test_prompt.clear();
        }
    });

    if let Some(status) = &state.resources.remote_catalog.last_status {
        ui.add_space(6.0);
        ui.colored_label(theme::color_text_weak(), status);
    }

    ui.add_space(8.0);
    let cards: Vec<RemoteModelCard> = {
        let refs = state.resources.remote_catalog.filtered_cards(provider);
        refs.into_iter().cloned().collect()
    };
    if cards.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Ajusta los filtros o actualiza tus credenciales para mostrar modelos disponibles.",
        );
    } else {
        ui.horizontal(|ui| {
            ui.heading(
                RichText::new(format!("{} resultados", cards.len()))
                    .color(theme::color_text_primary())
                    .size(16.0),
            );
            ui.add_space(ui.available_width());
            ui.label(
                RichText::new(
                    "Utiliza 'Probar' para lanzar una solicitud con el prompt configurado.",
                )
                .color(theme::color_text_weak())
                .size(11.0),
            );
        });
        ui.add_space(8.0);
        draw_remote_model_gallery(ui, state, &cards);
    }

    draw_remote_comparison(ui, state);
}

fn draw_remote_model_gallery(ui: &mut egui::Ui, state: &mut AppState, cards: &[RemoteModelCard]) {
    let spacing = 18.0;
    let min_card_width = 280.0;

    egui::ScrollArea::vertical()
        .id_source("remote_models_gallery")
        .max_height(420.0)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let available_width = ui.available_width().max(min_card_width);
            let mut columns =
                ((available_width + spacing) / (min_card_width + spacing)).floor() as usize;
            columns = columns.clamp(1, 3);
            let card_width = ((available_width - spacing * ((columns as f32) - 1.0))
                / columns as f32)
                .max(min_card_width);

            for chunk in cards.chunks(columns) {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = spacing;
                    for card in chunk {
                        let (rect, _) = ui
                            .allocate_at_least(egui::vec2(card_width, 240.0), egui::Sense::hover());
                        let mut card_ui =
                            ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                        draw_remote_model_card(&mut card_ui, state, card);
                    }

                    if chunk.len() < columns {
                        for _ in chunk.len()..columns {
                            ui.add_space(card_width);
                        }
                    }
                });
                ui.add_space(spacing);
            }
        });
}

fn draw_remote_model_card(ui: &mut egui::Ui, state: &mut AppState, card: &RemoteModelCard) {
    let is_favorite = state.resources.remote_catalog.is_favorite(&card.key);
    let in_comparison = state.resources.remote_catalog.in_comparison(&card.key);
    let fill = if is_favorite {
        Color32::from_rgb(44, 40, 60)
    } else {
        Color32::from_rgb(34, 38, 44)
    };

    egui::Frame::none()
        .fill(fill)
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(70, 80, 96)))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(16.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    ui.label(
                        RichText::new(&card.title)
                            .strong()
                            .color(theme::color_text_primary())
                            .size(16.0),
                    );
                    let star_color = if is_favorite {
                        Color32::from_rgb(255, 201, 71)
                    } else {
                        theme::color_text_weak()
                    };
                    let star = egui::Label::new(
                        RichText::new(ICON_STAR)
                            .font(theme::icon_font(14.0))
                            .color(star_color),
                    )
                    .sense(egui::Sense::click());
                    let star_response = ui.add(star).on_hover_text(if is_favorite {
                        "Quitar de favoritos"
                    } else {
                        "Marcar como favorito"
                    });
                    if star_response.clicked() {
                        let provider = card.key.provider;
                        let key_clone = card.key.clone();
                        let was_favorite = state.resources.remote_catalog.is_favorite(&key_clone);
                        state
                            .resources
                            .remote_catalog
                            .toggle_favorite(key_clone.clone());
                        let favorites_snapshot = state.resources.remote_catalog.favorites.clone();
                        {
                            let cards = state.resources.remote_catalog.cards_for_mut(provider);
                            cards.sort_by(|a, b| {
                                let a_fav = favorites_snapshot.contains(&a.key);
                                let b_fav = favorites_snapshot.contains(&b.key);
                                b_fav.cmp(&a_fav).then_with(|| {
                                    a.title.to_lowercase().cmp(&b.title.to_lowercase())
                                })
                            });
                        }
                        let message = if was_favorite {
                            format!("{} eliminado de favoritos", card.title)
                        } else {
                            format!("{} añadido a favoritos", card.title)
                        };
                        state
                            .resources
                            .remote_catalog
                            .update_status(Some(message.clone()));
                        state.push_debug_event(
                            DebugLogLevel::Info,
                            format!("catalog::{}", provider.short_code()),
                            message,
                        );
                    }
                    ui.add_space(ui.available_width());
                    if card.multimodal {
                        ui.label(
                            RichText::new("Multimodal")
                                .color(theme::color_primary())
                                .size(11.0),
                        );
                    }
                });

                ui.add_space(4.0);
                ui.label(
                    RichText::new(&card.description)
                        .color(theme::color_text_weak())
                        .size(12.0),
                );

                ui.add_space(8.0);
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(format!(
                            "Contexto: {} tokens · Salida máx: {} tokens",
                            card.context_tokens, card.max_output_tokens
                        ))
                        .color(theme::color_text_primary())
                        .size(11.0),
                    );
                    ui.label(
                        RichText::new(format!(
                            "Coste entrada: {} · salida: {} · Latencia ≈ {} ms",
                            format_cost_label(card.input_cost_per_million),
                            format_cost_label(card.output_cost_per_million),
                            card.latency_ms
                        ))
                        .color(theme::color_text_weak())
                        .size(11.0),
                    );
                });

                if !card.capabilities.is_empty() {
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing.x = 6.0;
                        for capability in &card.capabilities {
                            ui.label(
                                RichText::new(capability)
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        }
                    });
                }

                if !card.tags.is_empty() {
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing.x = 6.0;
                        for tag in &card.tags {
                            selectable_chip(ui, tag, false);
                        }
                    });
                }

                if !card.quick_actions.is_empty() {
                    ui.add_space(6.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing.x = 6.0;
                        for action in &card.quick_actions {
                            ui.label(
                                RichText::new(action)
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        }
                    });
                }

                ui.add_space(8.0);
                ui.label(
                    RichText::new(&card.favorite_hint)
                        .color(theme::color_text_weak())
                        .size(11.0),
                );

                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    let mut favorite_toggled = false;
                    if selectable_chip(ui, "Favorito", is_favorite).clicked() {
                        favorite_toggled = true;
                    }
                    if favorite_toggled {
                        state
                            .resources
                            .remote_catalog
                            .toggle_favorite(card.key.clone());
                        let now_favorite = !is_favorite;
                        let status = if now_favorite {
                            format!("{} marcado como favorito.", card.title)
                        } else {
                            format!("{} eliminado de favoritos.", card.title)
                        };
                        state.resources.remote_catalog.update_status(Some(status));
                    }

                    if selectable_chip(ui, "Comparar", in_comparison).clicked() {
                        state
                            .resources
                            .remote_catalog
                            .toggle_comparison(card.key.clone());
                        state.resources.remote_catalog.update_status(Some(format!(
                            "{} {} en la tabla comparativa.",
                            card.title,
                            if in_comparison {
                                "eliminado"
                            } else {
                                "añadido"
                            }
                        )));
                    }

                    ui.add_space(ui.available_width());

                    let test_label = RichText::new(format!("{} Probar", ICON_LIGHTNING))
                        .color(Color32::from_rgb(240, 240, 240));
                    if ui
                        .add(
                            theme::primary_button(test_label, &state.theme)
                                .min_size(egui::vec2(110.0, 32.0)),
                        )
                        .clicked()
                    {
                        let status = state.execute_remote_quick_test(card.key.clone());
                        if let Some(status) = status {
                            state.resources.remote_catalog.update_status(Some(status));
                        }
                    }
                });
            });
        });
}

fn draw_remote_comparison(ui: &mut egui::Ui, state: &mut AppState) {
    if state.resources.remote_catalog.comparison.is_empty() {
        return;
    }

    ui.add_space(12.0);
    ui.separator();
    ui.add_space(6.0);
    ui.heading(
        RichText::new("Comparativa rápida")
            .color(theme::color_text_primary())
            .size(16.0)
            .strong(),
    );
    ui.add_space(6.0);

    ui.push_id("remote_comparison_grid", |ui| {
        egui::Grid::new("remote_comparison")
            .striped(true)
            .spacing(egui::vec2(12.0, 6.0))
            .show(ui, |ui| {
                ui.label(RichText::new("Modelo").strong());
                ui.label(RichText::new("Contexto").strong());
                ui.label(RichText::new("Costos").strong());
                ui.label(RichText::new("Proveedor").strong());
                ui.label(RichText::new("Acciones").strong());
                ui.end_row();

                let mut removals = Vec::new();
                for key in &state.resources.remote_catalog.comparison {
                    if let Some(card) = remote_card_by_key(state, key) {
                        ui.label(
                            RichText::new(&card.title)
                                .color(theme::color_text_primary())
                                .size(12.0),
                        );
                        ui.label(
                            RichText::new(format!("{} tokens", card.context_tokens))
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        ui.label(
                            RichText::new(format!(
                                "{} / {}",
                                format_cost_label(card.input_cost_per_million),
                                format_cost_label(card.output_cost_per_million)
                            ))
                            .color(theme::color_text_weak())
                            .size(11.0),
                        );
                        ui.label(
                            RichText::new(card.key.provider.display_name())
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        if ui.button(RichText::new("Quitar").size(11.0)).clicked() {
                            removals.push(card.key.clone());
                        }
                        ui.end_row();
                    }
                }

                for key in removals {
                    state.resources.remote_catalog.toggle_comparison(key);
                }
            });
    });
}

fn format_cost_label(value: f32) -> String {
    if value < 1.0 {
        format!("${:.3}", value)
    } else {
        format!("${:.2}", value)
    }
}

fn remote_card_by_key<'a>(
    state: &'a AppState,
    key: &RemoteModelKey,
) -> Option<&'a RemoteModelCard> {
    state
        .resources
        .remote_catalog
        .cards_for(key.provider)
        .iter()
        .find(|card| card.key == *key)
}

fn draw_system_github(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Personal access token");
    if ui.text_edit_singleline(&mut state.github_token).changed() {
        state.persist_config();
    }

    if ui.button("Connect & sync").clicked() {
        if state.github_token.trim().is_empty() {
            state.github_username = None;
            state.github_repositories.clear();
            state.selected_github_repo = None;
            state.github_connection_status =
                Some("Please enter a valid GitHub token before syncing.".to_string());
            state.refresh_personalization_resources();
        } else {
            match github::fetch_user_and_repositories(&state.github_token) {
                Ok(data) => {
                    state.github_username = Some(data.username.clone());
                    state.github_repositories = data.repositories;
                    state.selected_github_repo = None;
                    state.github_connection_status =
                        Some(format!("GitHub data loaded for {}.", data.username));
                    state.refresh_personalization_resources();
                }
                Err(err) => {
                    state.github_username = None;
                    state.github_repositories.clear();
                    state.selected_github_repo = None;
                    state.github_connection_status =
                        Some(format!("Failed to sync GitHub: {}", err));
                    state.refresh_personalization_resources();
                }
            }
        }
    }

    if let Some(username) = &state.github_username {
        ui.colored_label(
            ui.visuals().weak_text_color(),
            format!("Authenticated as: {}", username),
        );
    }

    let combo_label = state
        .selected_github_repo
        .and_then(|idx| state.github_repositories.get(idx))
        .cloned()
        .unwrap_or_else(|| "Choose a repository".to_string());

    ui.add_enabled_ui(!state.github_repositories.is_empty(), |ui| {
        egui::ComboBox::from_label("Select repository")
            .selected_text(combo_label)
            .show_ui(ui, |ui| {
                for (idx, repo) in state.github_repositories.iter().enumerate() {
                    ui.selectable_value(&mut state.selected_github_repo, Some(idx), repo);
                }
            });
    });

    if state.github_repositories.is_empty() {
        ui.label("No repositories found yet. Connect with a token to load them.");
    }

    if ui.button("Sync repository").clicked() {
        let message = match (
            state.github_token.trim().is_empty(),
            state.selected_github_repo,
        ) {
            (true, _) => "Cannot sync without a GitHub token.".to_string(),
            (_, None) => "Please select a repository to sync.".to_string(),
            (_, Some(idx)) => {
                let repo = state.github_repositories[idx].clone();
                format!("Repository '{}' scheduled for synchronization.", repo)
            }
        };
        state.github_connection_status = Some(message);
        state.persist_config();
    }

    if let Some(status) = &state.github_connection_status {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_cache(ui: &mut egui::Ui, state: &mut AppState) {
    ui.horizontal(|ui| {
        ui.label("Cache directory");
        if ui
            .text_edit_singleline(&mut state.cache_directory)
            .changed()
        {
            state.persist_config();
        }
    });

    if ui
        .add(
            egui::Slider::new(&mut state.cache_size_limit_gb, 1.0..=256.0)
                .text("Cache size limit (GB)"),
        )
        .changed()
    {
        state.persist_config();
    }

    if ui
        .checkbox(&mut state.enable_auto_cleanup, "Enable automatic cleanup")
        .changed()
    {
        state.persist_config();
    }

    if ui
        .add(
            egui::Slider::new(&mut state.cache_cleanup_interval_hours, 1..=168)
                .text("Cleanup interval (hours)"),
        )
        .changed()
    {
        state.persist_config();
    }

    if ui.button("Run cleanup now").clicked() {
        state.last_cache_cleanup = Some(format!(
            "Manual cleanup triggered. Next automatic run in {} hours.",
            state.cache_cleanup_interval_hours
        ));
        state.persist_config();
    }

    if let Some(status) = &state.last_cache_cleanup {
        ui.add_space(8.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_system_resources(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Memory limit for cache");
    if ui
        .add(egui::Slider::new(&mut state.resource_memory_limit_gb, 1.0..=512.0).suffix(" GB"))
        .changed()
    {
        state.persist_config();
    }

    ui.label("Disk limit for cache");
    if ui
        .add(egui::Slider::new(&mut state.resource_disk_limit_gb, 8.0..=4096.0).suffix(" GB"))
        .changed()
    {
        state.persist_config();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        format!(
            "Current limits: {:.1} GB memory · {:.1} GB disk",
            state.resource_memory_limit_gb, state.resource_disk_limit_gb
        ),
    );
}

fn draw_custom_commands_section(ui: &mut egui::Ui, state: &mut AppState, tab_index: usize) {
    match tab_index {
        0 => draw_custom_commands_configuration(ui, state),
        1 => draw_custom_commands_documentation(ui, state),
        2 => draw_custom_commands_activity(ui, state),
        _ => draw_custom_commands_configuration(ui, state),
    }
}

fn draw_custom_commands_configuration(ui: &mut egui::Ui, state: &mut AppState) {
    ui.heading("Command palette");
    ui.label("Link slash commands with built-in automation functions.");

    let mut remove_index = None;
    for (idx, command) in state.chat.custom_commands.iter().enumerate() {
        ui.group(|ui| {
            ui.horizontal(|ui| {
                ui.strong(&command.trigger);
                ui.label(format!("→ {}", command.action.label()));
                if ui.button(egui::RichText::new("Remove").small()).clicked() {
                    remove_index = Some(idx);
                }
            });
            ui.colored_label(ui.visuals().weak_text_color(), command.action.description());
        });
        ui.add_space(4.0);
    }

    if let Some(idx) = remove_index {
        if let Some(command) = state.chat.custom_commands.get(idx).cloned() {
            state.chat.custom_commands.remove(idx);
            state.chat.command_feedback = Some(format!(
                "Removed custom command '{}' ({})",
                command.trigger,
                command.action.label()
            ));
            state.persist_config();
        }
    }

    ui.add_space(8.0);
    ui.label("Create a new command");
    ui.horizontal(|ui| {
        ui.add(
            egui::TextEdit::singleline(&mut state.chat.new_command)
                .hint_text("Trigger (e.g. /time)"),
        );

        egui::ComboBox::from_id_source("new_custom_command_action")
            .selected_text(state.chat.new_command_action.label())
            .show_ui(ui, |ui| {
                for action in state.command_registry.actions() {
                    ui.selectable_value(
                        &mut state.chat.new_command_action,
                        *action,
                        format!("{} — {}", action.label(), action.description()),
                    );
                }
            });

        if ui.button("Add").clicked() {
            let trimmed = state.chat.new_command.trim();
            if trimmed.is_empty() {
                state.chat.command_feedback = Some("Command cannot be empty.".to_string());
            } else {
                let normalized = if trimmed.starts_with('/') {
                    trimmed.to_string()
                } else {
                    format!("/{}", trimmed)
                };

                if state
                    .chat
                    .custom_commands
                    .iter()
                    .any(|cmd| cmd.trigger == normalized)
                {
                    state.chat.command_feedback =
                        Some(format!("Command '{}' already exists.", normalized));
                } else {
                    let action = state.chat.new_command_action;
                    state
                        .chat
                        .custom_commands
                        .push(crate::state::CustomCommand {
                            trigger: normalized.clone(),
                            action,
                        });
                    state.chat.command_feedback = Some(format!(
                        "Added '{}' linked to {}.",
                        normalized,
                        action.label()
                    ));
                    state.chat.new_command.clear();
                    state.persist_config();
                }
            }
        }
    });

    if let Some(feedback) = &state.chat.command_feedback {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), feedback);
    }

    ui.add_space(8.0);
    if ui
        .button("Available functions")
        .on_hover_text("Consulta documentación detallada y ejemplos")
        .clicked()
    {
        state.chat.show_functions_modal = true;
    }
}

fn draw_custom_commands_documentation(ui: &mut egui::Ui, state: &AppState) {
    ui.heading("Documentación de comandos personalizados");
    ui.label(
        RichText::new("Cada comando ejecuta una acción predefinida con parámetros opcionales.")
            .color(theme::color_text_weak()),
    );

    ui.add_space(12.0);
    for action in state.command_registry.actions() {
        let action = *action;
        let doc = action.documentation();
        egui::Frame::none()
            .fill(Color32::from_rgb(34, 36, 42))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::same(12.0))
            .inner_margin(egui::Margin::symmetric(14.0, 12.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(doc.signature)
                            .monospace()
                            .color(theme::color_text_primary())
                            .strong(),
                    );
                    ui.add_space(ui.available_width());
                    ui.label(
                        RichText::new(action.label())
                            .color(theme::color_text_weak())
                            .monospace()
                            .size(11.0),
                    );
                });
                ui.label(
                    RichText::new(doc.summary)
                        .color(theme::color_text_weak())
                        .size(12.0),
                );

                if !doc.parameters.is_empty() {
                    ui.add_space(6.0);
                    ui.label(
                        RichText::new("Parámetros disponibles")
                            .color(theme::color_text_primary())
                            .size(11.0)
                            .strong(),
                    );
                    for parameter in doc.parameters {
                        ui.label(
                            RichText::new(format!("• {parameter}"))
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                    }
                }

                if !doc.examples.is_empty() {
                    ui.add_space(6.0);
                    ui.label(
                        RichText::new("Ejemplos")
                            .color(theme::color_text_primary())
                            .size(11.0)
                            .strong(),
                    );
                    for example in doc.examples {
                        ui.label(
                            RichText::new(*example)
                                .color(theme::color_text_weak())
                                .monospace()
                                .size(11.0),
                        );
                    }
                }
            });
        ui.add_space(8.0);
    }

    if state.chat.custom_commands.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Aún no hay comandos personalizados definidos.",
        );
    }
}

fn draw_custom_commands_activity(ui: &mut egui::Ui, state: &AppState) {
    ui.heading("Actividad de comandos");
    if let Some(feedback) = &state.chat.command_feedback {
        ui.label(
            RichText::new(format!("Última acción: {feedback}"))
                .color(theme::color_text_primary())
                .size(12.0),
        );
    } else {
        ui.label(
            RichText::new("No hay actividad reciente registrada.")
                .color(theme::color_text_weak())
                .size(12.0),
        );
    }

    ui.add_space(10.0);
    if state.chat.custom_commands.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Agrega comandos personalizados para comenzar a registrar actividad.",
        );
        return;
    }

    ui.label(
        RichText::new("Comandos configurados actualmente")
            .color(theme::color_text_primary())
            .strong(),
    );

    for command in &state.chat.custom_commands {
        egui::Frame::none()
            .fill(Color32::from_rgb(34, 36, 42))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::same(10.0))
            .inner_margin(egui::Margin::symmetric(12.0, 10.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(&command.trigger)
                            .color(theme::color_text_primary())
                            .strong()
                            .size(13.0)
                            .monospace(),
                    );
                    ui.add_space(ui.available_width());
                    ui.label(
                        RichText::new(command.action.label())
                            .color(theme::color_text_weak())
                            .monospace()
                            .size(11.0),
                    );
                });
                ui.label(
                    RichText::new(command.action.description())
                        .color(theme::color_text_weak())
                        .size(11.0),
                );
            });
        ui.add_space(6.0);
    }
}

fn draw_customization_appearance(ui: &mut egui::Ui, state: &mut AppState) {
    let tokens = state.theme.clone();
    let info_frame = egui::Frame::none()
        .fill(tokens.palette.panel_background)
        .stroke(theme::subtle_border(&tokens))
        .rounding(tokens.rounding.widget)
        .inner_margin(egui::Margin {
            left: 20.0,
            right: 20.0,
            top: 16.0,
            bottom: 16.0,
        });

    info_frame.show(ui, |ui| {
        ui.vertical(|ui| {
            ui.label(
                RichText::new("Tema de la interfaz")
                    .color(tokens.palette.text_primary)
                    .strong()
                    .size(tokens.typography.title.size),
            );
            ui.add_space(tokens.spacing.item_spacing.y);
            ui.label(
                RichText::new(
                    "Alterna entre presets claro y oscuro inspirados en los esquemas de VSCode.",
                )
                .color(tokens.palette.text_weak)
                .size(tokens.typography.body.size),
            );
        });
    });

    ui.add_space(tokens.spacing.item_spacing.y * 2.0);

    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = tokens.spacing.item_spacing.x;
        let options = [
            (
                ThemePreset::Dark,
                "Tema oscuro",
                "Contraste alto con paneles profundos y resaltes eléctricos.",
            ),
            (
                ThemePreset::Light,
                "Tema claro",
                "Fondo luminoso con bordes suaves para entornos bien iluminados.",
            ),
        ];

        for (preset, title, description) in options {
            let selected = state.config.theme == preset;
            let response = theme_option_card(ui, &tokens, selected, title, description);
            if response.clicked() {
                state.set_theme_preset(preset);
            }
        }
    });
}

fn theme_option_card(
    ui: &mut egui::Ui,
    tokens: &ThemeTokens,
    selected: bool,
    title: &str,
    description: &str,
) -> egui::Response {
    let desired = egui::vec2(240.0, 132.0);
    let (rect, response) = ui.allocate_exact_size(desired, egui::Sense::click());

    let (fill, border_color) = if selected {
        (tokens.states.focus.background, tokens.states.focus.border)
    } else if response.hovered() {
        (tokens.states.hover.background, tokens.states.hover.border)
    } else {
        (tokens.palette.secondary_background, tokens.palette.border)
    };

    let painter = ui.painter_at(rect);
    painter.rect(
        rect,
        tokens.rounding.widget,
        fill,
        egui::Stroke::new(1.0, border_color),
    );

    let mut content = ui.child_ui(
        rect.shrink2(egui::vec2(18.0, 16.0)),
        egui::Layout::top_down(egui::Align::LEFT),
    );

    content.label(
        RichText::new(title)
            .color(if selected {
                tokens.states.focus.foreground
            } else {
                tokens.palette.text_primary
            })
            .size(tokens.typography.body.size)
            .strong(),
    );
    content.add_space(tokens.spacing.item_spacing.y * 0.5);
    content.label(
        RichText::new(description)
            .color(tokens.palette.text_weak)
            .size(tokens.typography.body_small.size),
    );

    response
}

fn draw_customization_memory(ui: &mut egui::Ui, state: &mut AppState) {
    if ui
        .checkbox(
            &mut state.enable_memory_tracking,
            "Enable contextual memory",
        )
        .changed()
    {
        state.persist_config();
    }

    if ui
        .add(egui::Slider::new(&mut state.memory_retention_days, 1..=365).text("Retention (days)"))
        .changed()
    {
        state.persist_config();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        format!(
            "Memories older than {} days will be archived.",
            state.memory_retention_days
        ),
    );

    ui.add_space(10.0);
    let memory_cards = state.resources.personalization_resources.memories.clone();
    draw_personalization_cards(
        ui,
        state,
        &memory_cards,
        "Aún no hay memorias configuradas.",
    );
}

fn draw_customization_profiles(ui: &mut egui::Ui, state: &mut AppState) {
    let mut selected_profile = state.selected_profile;
    egui::ComboBox::from_label("Active profile")
        .selected_text(
            state
                .selected_profile
                .and_then(|idx| state.profiles.get(idx))
                .cloned()
                .unwrap_or_else(|| "Choose a profile".to_string()),
        )
        .show_ui(ui, |ui| {
            for (idx, profile) in state.profiles.iter().enumerate() {
                ui.selectable_value(&mut selected_profile, Some(idx), profile);
            }
        });

    if selected_profile != state.selected_profile {
        state.selected_profile = selected_profile;
        state.persist_config();
    }

    ui.add_space(6.0);
    ui.horizontal(|ui| {
        if ui.button("Duplicate profile").clicked() {
            if let Some(idx) = state.selected_profile {
                let new_profile = format!("{} (copy)", state.profiles[idx]);
                state.profiles.push(new_profile);
                state.selected_profile = Some(state.profiles.len() - 1);
                state.persist_config();
                state.refresh_personalization_resources();
            }
        }
        if ui.button("Delete profile").clicked() {
            if let Some(idx) = state.selected_profile {
                if state.profiles.len() > 1 {
                    state.profiles.remove(idx);
                    if state.profiles.is_empty() {
                        state.selected_profile = None;
                    } else if idx >= state.profiles.len() {
                        state.selected_profile = Some(state.profiles.len() - 1);
                    }
                    state.persist_config();
                    state.refresh_personalization_resources();
                }
            }
        }
    });

    ui.colored_label(
        ui.visuals().weak_text_color(),
        "Profiles let you quickly change between workspace presets.",
    );

    ui.add_space(10.0);
    let profile_cards = state.resources.personalization_resources.profiles.clone();
    draw_personalization_cards(
        ui,
        state,
        &profile_cards,
        "Crea tu primer perfil para empezar a personalizar respuestas.",
    );
}

fn draw_customization_projects(ui: &mut egui::Ui, state: &mut AppState) {
    let mut selected_project = state.selected_project;
    egui::ComboBox::from_label("Active project")
        .selected_text(
            state
                .selected_project
                .and_then(|idx| state.projects.get(idx))
                .cloned()
                .unwrap_or_else(|| "Choose a project".to_string()),
        )
        .show_ui(ui, |ui| {
            for (idx, project) in state.projects.iter().enumerate() {
                ui.selectable_value(&mut selected_project, Some(idx), project);
            }
        });

    if selected_project != state.selected_project {
        state.selected_project = selected_project;
        state.persist_config();
    }

    ui.add_space(6.0);
    if ui.button("Create placeholder project").clicked() {
        let new_project = format!("New Project {}", state.projects.len() + 1);
        state.projects.push(new_project);
        state.selected_project = Some(state.projects.len() - 1);
        state.persist_config();
        state.refresh_personalization_resources();
    }

    ui.colored_label(
        ui.visuals().weak_text_color(),
        "Projects determine what repositories and documents are prioritised.",
    );

    ui.add_space(10.0);
    let context_cards = state.resources.personalization_resources.contexts.clone();
    draw_personalization_cards(
        ui,
        state,
        &context_cards,
        "Sin proyectos ni repos conectados. Sincroniza GitHub o agrega proyectos prioritarios.",
    );
}

fn draw_personalization_cards(
    ui: &mut egui::Ui,
    state: &mut AppState,
    cards: &[KnowledgeResourceCard],
    empty_message: &str,
) {
    if cards.is_empty() {
        ui.colored_label(theme::color_text_weak(), empty_message);
        return;
    }

    for card in cards {
        egui::Frame::none()
            .fill(Color32::from_rgb(34, 38, 44))
            .stroke(theme::subtle_border(&state.theme))
            .rounding(egui::Rounding::same(12.0))
            .inner_margin(egui::Margin::symmetric(14.0, 12.0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(&card.title)
                                .color(theme::color_text_primary())
                                .strong()
                                .size(14.0),
                        );
                        ui.add_space(ui.available_width());
                        ui.label(
                            RichText::new(&card.resource_type)
                                .color(theme::color_primary())
                                .size(11.0),
                        );
                    });
                    ui.label(
                        RichText::new(&card.subtitle)
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.label(
                        RichText::new(format!("Última sincronización: {}", card.last_synced))
                            .color(theme::color_text_weak())
                            .size(10.0),
                    );

                    if !card.tags.is_empty() {
                        ui.add_space(6.0);
                        ui.horizontal_wrapped(|ui| {
                            ui.spacing_mut().item_spacing.x = 6.0;
                            for tag in &card.tags {
                                selectable_chip(ui, tag, false);
                            }
                        });
                    }

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if let Some(link) = &card.link {
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new(format!("{} Copiar", ICON_LINK))
                                            .color(Color32::from_rgb(240, 240, 240))
                                            .size(11.0),
                                    )
                                    .min_size(egui::vec2(80.0, 26.0))
                                    .fill(Color32::from_rgb(44, 46, 54))
                                    .rounding(egui::Rounding::same(8.0)),
                                )
                                .clicked()
                            {
                                ui.output_mut(|out| out.copied_text = link.clone());
                                state.resources.personalization_feedback =
                                    Some(format!("Enlace copiado: {}", card.title));
                            }
                        }

                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new(format!("{} Sincronizar", ICON_LIGHTNING))
                                        .color(Color32::from_rgb(240, 240, 240))
                                        .size(11.0),
                                )
                                .min_size(egui::vec2(110.0, 26.0))
                                .fill(Color32::from_rgb(70, 80, 96))
                                .rounding(egui::Rounding::same(8.0)),
                            )
                            .clicked()
                        {
                            state.resources.personalization_feedback = Some(format!(
                                "{} marcado para sincronización contextual.",
                                card.title
                            ));
                        }
                    });
                });
            });

        ui.add_space(8.0);
    }

    if let Some(status) = &state.resources.personalization_feedback {
        ui.colored_label(theme::color_text_weak(), status);
    }
}

fn draw_local_provider(ui: &mut egui::Ui, state: &mut AppState, provider: LocalModelProvider) {
    let mut persist_changes = false;
    let mut search_request: Option<(String, Option<String>)> = None;
    let tokens = state.theme.clone();

    {
        let provider_state = state.provider_state_mut(provider);
        let token_label = provider.token_label();
        ui.label(format!("{}", token_label));
        ui.horizontal(|ui| {
            let response = ui.text_edit_singleline(&mut provider_state.token_input);
            if response.changed() {
                // Do not persist immediately; wait for the save button.
            }

            let save_label = RichText::new("Guardar").color(Color32::from_rgb(240, 240, 240));
            let button = theme::primary_button(save_label, &tokens).min_size(egui::vec2(0.0, 28.0));
            if ui.add_sized([110.0, 30.0], button).clicked() {
                let trimmed = provider_state.token_input.trim();
                if trimmed.is_empty() {
                    provider_state.access_token = None;
                    provider_state.token_input.clear();
                } else {
                    provider_state.access_token = Some(trimmed.to_string());
                    provider_state.token_input = trimmed.to_string();
                }
                persist_changes = true;
            }
        });

        if provider.requires_token() && provider_state.access_token.is_none() {
            ui.colored_label(
                Color32::from_rgb(255, 196, 96),
                "Este proveedor requiere un token válido para listar modelos.",
            );
        }

        ui.add_space(6.0);
        egui::Frame::none()
            .fill(Color32::from_rgb(30, 32, 36))
            .stroke(theme::subtle_border(&tokens))
            .rounding(egui::Rounding::same(12.0))
            .inner_margin(egui::Margin::symmetric(14.0, 12.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let button_width = 120.0;
                    let text_width = (ui.available_width() - button_width - 12.0).max(240.0);
                    let search_edit = egui::TextEdit::singleline(&mut provider_state.search_query)
                        .hint_text(provider.search_hint())
                        .desired_width(f32::INFINITY);
                    let response = ui.add_sized([text_width, 30.0], search_edit);
                    if response.changed() {
                        persist_changes = true;
                    }

                    let needs_token =
                        provider.requires_token() && provider_state.access_token.is_none();
                    let mut clicked = false;
                    let search_label =
                        RichText::new("Buscar").color(Color32::from_rgb(240, 240, 240));
                    ui.add_enabled_ui(!needs_token, |ui| {
                        if ui
                            .add_sized(
                                [button_width, 32.0],
                                theme::primary_button(search_label.clone(), &tokens),
                            )
                            .clicked()
                        {
                            clicked = true;
                        }
                    });

                    if clicked {
                        search_request = Some((
                            provider_state.search_query.clone(),
                            provider_state.access_token.clone(),
                        ));
                    }
                });
            });
    }

    if persist_changes {
        state.persist_config();
    }

    if let Some((query, token)) = search_request {
        match search_models_for_provider(provider, &query, token.as_deref()) {
            Ok(models) => {
                let count = models.len();
                let provider_state = state.provider_state_mut(provider);
                provider_state.models = models;
                provider_state.selected_model = None;
                provider_state.install_status = Some(format!(
                    "Se encontraron {} modelos para '{}'.",
                    count, query
                ));
                state.persist_config();
            }
            Err(err) => {
                let provider_state = state.provider_state_mut(provider);
                provider_state.install_status = Some(format!("Fallo al buscar modelos: {}", err));
            }
        }
    }

    ui.add_space(12.0);

    let (models, selected_model) = {
        let provider_state = state.provider_state(provider);
        (provider_state.models.clone(), provider_state.selected_model)
    };

    if models.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Busca un término para poblar la galería de modelos.",
        );
    } else {
        ui.horizontal(|ui| {
            ui.heading(
                RichText::new(format!("Galería de modelos ({} resultados)", models.len()))
                    .color(theme::color_text_primary()),
            );
            ui.add_space(ui.available_width());
            ui.label(
                RichText::new("Clic en una tarjeta para seleccionarla o instalarla.")
                    .color(theme::color_text_weak())
                    .size(12.0),
            );
        });
        ui.add_space(8.0);
        draw_provider_gallery(ui, state, provider, &models, selected_model);
    }

    ui.add_space(12.0);
    let installed: Vec<InstalledLocalModel> = state
        .resources
        .installed_local_models
        .iter()
        .cloned()
        .filter(|model| model.identifier.provider == provider)
        .collect();

    if installed.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Todavía no hay modelos instalados desde este proveedor.",
        );
    } else {
        ui.horizontal(|ui| {
            ui.heading(
                RichText::new("Modelos instalados")
                    .color(theme::color_text_primary())
                    .size(16.0),
            );
            ui.add_space(ui.available_width());
            ui.label(
                RichText::new("Gestiona tus descargas locales y actívalas para Jarvis.")
                    .color(theme::color_text_weak())
                    .size(11.0),
            );
        });
        ui.add_space(6.0);
        egui::ScrollArea::vertical()
            .id_source(("installed_models_scroll", provider.key()))
            .max_height(240.0)
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for record in installed {
                    draw_installed_model_card(ui, state, provider, &record);
                    ui.add_space(10.0);
                }
            });
    }

    if let Some(status) = state.provider_state(provider).install_status.clone() {
        ui.add_space(10.0);
        ui.colored_label(theme::color_text_weak(), status);
    }
}

fn draw_provider_gallery(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: LocalModelProvider,
    models: &[LocalModelCard],
    selected_model: Option<usize>,
) {
    let spacing = 16.0;
    let min_card_width = 280.0;

    egui::ScrollArea::vertical()
        .id_source(("provider_gallery_scroll", provider.key()))
        .max_height(380.0)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let available_width = ui.available_width().max(min_card_width);
            let mut columns =
                ((available_width + spacing) / (min_card_width + spacing)).floor() as usize;
            columns = columns.clamp(1, 3);
            let card_width = ((available_width - spacing * ((columns as f32) - 1.0))
                / columns as f32)
                .max(min_card_width);

            let mut base_index = 0usize;
            for chunk in models.chunks(columns) {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = spacing;
                    for (offset, model) in chunk.iter().enumerate() {
                        let index = base_index + offset;
                        let (rect, response) = ui
                            .allocate_at_least(egui::vec2(card_width, 190.0), egui::Sense::click());
                        let mut card_ui =
                            ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                        draw_model_card(
                            &mut card_ui,
                            state,
                            provider,
                            model,
                            index,
                            selected_model == Some(index),
                        );

                        if response.clicked() {
                            state.provider_state_mut(provider).selected_model = Some(index);
                        }

                        if response.double_clicked() {
                            install_local_model(state, provider, index);
                        }
                    }

                    if chunk.len() < columns {
                        for _ in chunk.len()..columns {
                            ui.add_space(card_width);
                        }
                    }
                });
                ui.add_space(spacing);
                base_index += chunk.len();
            }
        });
}

fn draw_model_card(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: LocalModelProvider,
    model: &LocalModelCard,
    index: usize,
    is_selected: bool,
) {
    let premium = model.requires_token;

    let fill = if premium {
        Color32::from_rgb(48, 36, 56)
    } else {
        Color32::from_rgb(34, 38, 44)
    };
    let incompatible = model.incompatible_reason.is_some();
    let border = if is_selected {
        theme::color_primary()
    } else if premium {
        Color32::from_rgb(182, 134, 242)
    } else if incompatible {
        theme::color_danger()
    } else {
        Color32::from_rgb(70, 80, 96)
    };

    egui::Frame::none()
        .fill(fill)
        .stroke(egui::Stroke::new(
            if is_selected { 2.0 } else { 1.0 },
            border,
        ))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    let badge_icon = if premium { ICON_PREMIUM } else { ICON_FREE };
                    let badge_color = if premium {
                        Color32::from_rgb(255, 214, 102)
                    } else {
                        Color32::from_rgb(108, 214, 148)
                    };
                    ui.label(
                        RichText::new(badge_icon)
                            .font(theme::icon_font(15.0))
                            .color(badge_color),
                    );
                    ui.label(
                        RichText::new(&model.id)
                            .strong()
                            .color(theme::color_text_primary()),
                    );
                });

                if let Some(author) = &model.author {
                    ui.label(
                        RichText::new(format!("Autor: {}", author))
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                }

                if let Some(pipeline) = &model.pipeline_tag {
                    ui.label(
                        RichText::new(format!("Pipeline: {}", pipeline))
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                }

                if !model.tags.is_empty() {
                    let tags: Vec<&str> =
                        model.tags.iter().take(3).map(|tag| tag.as_str()).collect();
                    ui.label(
                        RichText::new(format!("Etiquetas: {}", tags.join(", ")))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                }

                if let Some(description) = &model.description {
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new(description)
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                }

                if let Some(reason) = &model.incompatible_reason {
                    ui.add_space(6.0);
                    ui.label(
                        RichText::new(reason)
                            .color(theme::color_danger())
                            .italics()
                            .size(11.0),
                    );
                }

                let mut metrics = Vec::new();
                if let Some(likes) = model.likes {
                    metrics.push(format!("❤ {}", format_count(likes)));
                }
                if let Some(downloads) = model.downloads {
                    metrics.push(format!("⬇ {}", format_count(downloads)));
                }
                if !metrics.is_empty() {
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new(metrics.join("  · "))
                            .color(theme::color_text_primary())
                            .size(12.0),
                    );
                }

                ui.add_space(8.0);

                let button_label = if premium {
                    format!("{} Instalar (token)", ICON_DOWNLOAD)
                } else {
                    format!("{} Instalar", ICON_DOWNLOAD)
                };
                let button_width = ui.available_width();
                let response = ui.add_enabled(
                    !incompatible,
                    theme::primary_button(
                        RichText::new(button_label).color(Color32::from_rgb(240, 240, 240)),
                        &state.theme,
                    )
                    .min_size(egui::vec2(button_width, 30.0)),
                );

                if response.clicked() {
                    install_local_model(state, provider, index);
                }
            });
        });
}

fn draw_installed_model_card(
    ui: &mut egui::Ui,
    state: &mut AppState,
    provider: LocalModelProvider,
    record: &InstalledLocalModel,
) {
    let is_active = state
        .resources
        .jarvis_active_model
        .as_ref()
        .map(|model| model == &record.identifier)
        .unwrap_or(false);

    let install_path = if record.install_path.trim().is_empty() {
        Path::new(&state.resources.jarvis_install_dir)
            .join(record.identifier.sanitized_dir_name())
            .display()
            .to_string()
    } else {
        record.install_path.clone()
    };

    let path_display = truncate_middle(&install_path, 72);
    let subtitle = format!(
        "{} • Instalado el {}",
        format_bytes(record.size_bytes),
        format_timestamp(record.installed_at)
    );

    egui::Frame::none()
        .fill(Color32::from_rgb(30, 32, 36))
        .stroke(theme::subtle_border(&state.theme))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(16.0, 14.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(record.identifier.provider.display_name())
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                    ui.add_space(6.0);
                    ui.label(
                        RichText::new(&record.identifier.model_id)
                            .strong()
                            .color(theme::color_text_primary()),
                    );
                    if is_active {
                        ui.add_space(10.0);
                        ui.label(
                            RichText::new("Activo")
                                .color(theme::color_success())
                                .size(12.0),
                        );
                    }
                });

                ui.add_space(6.0);
                ui.label(
                    RichText::new(&subtitle)
                        .color(theme::color_text_weak())
                        .size(12.0),
                );

                ui.label(
                    RichText::new(&path_display)
                        .color(theme::color_text_weak())
                        .size(11.0),
                )
                .on_hover_text(&install_path);

                ui.add_space(10.0);

                if is_active {
                    ui.add_enabled_ui(false, |ui| {
                        ui.add_sized(
                            [ui.available_width(), 30.0],
                            theme::secondary_button(
                                RichText::new("Activo en Jarvis")
                                    .color(Color32::from_rgb(240, 240, 240)),
                                &state.theme,
                            ),
                        );
                    });
                } else {
                    let button = theme::primary_button(
                        RichText::new(format!("{} Activar en Jarvis", ICON_SEND))
                            .color(Color32::from_rgb(240, 240, 240)),
                        &state.theme,
                    );
                    if ui.add_sized([ui.available_width(), 30.0], button).clicked() {
                        let status = state.activate_jarvis_model(&record.identifier);
                        state.provider_state_mut(provider).install_status = Some(status);
                    }
                }
            });
        });
}

fn install_local_model(state: &mut AppState, provider: LocalModelProvider, index: usize) {
    let (model, token) = {
        let provider_state = state.provider_state(provider);
        if let Some(model) = provider_state.models.get(index).cloned() {
            (model, provider_state.access_token.clone())
        } else {
            return;
        }
    };

    debug_assert_eq!(model.provider, provider);

    if let Some(reason) = &model.incompatible_reason {
        let message = format!("'{}' no es compatible: {}", model.id, reason);
        state.provider_state_mut(provider).install_status = Some(message.clone());
        state.push_activity_log(LogStatus::Warning, "Jarvis", message);
        return;
    }

    if provider == LocalModelProvider::HuggingFace {
        let started = state.queue_huggingface_install(model.clone(), token);
        if started {
            state.provider_state_mut(provider).selected_model = Some(index);
        } else {
            let warning = format!(
                "Ya hay una descarga en curso para '{}'. Espera a que termine.",
                model.id
            );
            {
                let provider_state = state.provider_state_mut(provider);
                provider_state.selected_model = Some(index);
                provider_state.install_status = Some(warning.clone());
            }
            state.push_activity_log(LogStatus::Warning, "Jarvis", warning);
        }
        return;
    }

    let status = match provider {
        LocalModelProvider::Ollama => {
            match crate::api::ollama::pull_model(&model.id, token.as_deref()) {
                Ok(()) => format!(
                "Modelo '{}' preparado mediante Ollama. Usa el runtime de Ollama para servirlo.",
                model.id
            ),
                Err(err) => format!("No se pudo preparar '{}' con Ollama: {}", model.id, err),
            }
        }
        _ => format!(
            "La instalación automática aún no está disponible para {}.",
            provider.display_name()
        ),
    };

    let provider_state = state.provider_state_mut(provider);
    provider_state.selected_model = Some(index);
    provider_state.install_status = Some(status);
}

fn search_models_for_provider(
    provider: LocalModelProvider,
    query: &str,
    token: Option<&str>,
) -> Result<Vec<LocalModelCard>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    match provider {
        LocalModelProvider::HuggingFace => crate::api::huggingface::search_models(trimmed, token),
        LocalModelProvider::Ollama => crate::api::ollama::search_models(trimmed, token),
        LocalModelProvider::OpenRouter => crate::api::openrouter::search_models(trimmed),
        _ => {
            let lowercase = trimmed.to_lowercase();
            let catalog = sample_catalog(provider);
            let filtered = catalog
                .into_iter()
                .filter(|card| {
                    card.id.to_lowercase().contains(&lowercase)
                        || card
                            .description
                            .as_ref()
                            .map(|desc| desc.to_lowercase().contains(&lowercase))
                            .unwrap_or(false)
                })
                .collect();
            Ok(filtered)
        }
    }
}

fn sample_catalog(provider: LocalModelProvider) -> Vec<LocalModelCard> {
    match provider {
        LocalModelProvider::GithubModels => vec![
            LocalModelCard {
                provider,
                id: "github/CodeLlama-34b".to_string(),
                author: Some("GitHub".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["code".to_string(), "llama".to_string()],
                description: Some(
                    "Modelos experimentales de GitHub Models listos para desplegar en contenedores.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "github/Phi-3-mini".to_string(),
                author: Some("GitHub".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["chat".to_string(), "preview".to_string()],
                description: Some(
                    "Inferencia hospedada en GitHub Models compatible con la API de OpenAI.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Replicate => vec![
            LocalModelCard {
                provider,
                id: "replicate/flux-dev".to_string(),
                author: Some("Replicate".to_string()),
                pipeline_tag: Some("image-to-image".to_string()),
                tags: vec!["diffusion".to_string(), "vision".to_string()],
                description: Some(
                    "Modelos visuales populares de la comunidad de Replicate disponibles mediante API.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "replicate/llama-3-70b-instruct".to_string(),
                author: Some("Replicate".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["chat".to_string(), "meta".to_string()],
                description: Some(
                    "Versión alojada de Llama 3 para uso inmediato a través de Replicate API.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Ollama => vec![
            LocalModelCard {
                provider,
                id: "ollama/llama3".to_string(),
                author: Some("Ollama".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["local".to_string(), "chat".to_string()],
                description: Some(
                    "Modelos descargables mediante 'ollama pull' listos para ejecutarse en tu host.".
                        to_string(),
                ),
                requires_token: false,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "ollama/codellama".to_string(),
                author: Some("Ollama".to_string()),
                pipeline_tag: Some("code-generation".to_string()),
                tags: vec!["code".to_string(), "local".to_string()],
                description: Some(
                    "Ejemplos de modelos que Ollama expone como imágenes portables para contenedores.".
                        to_string(),
                ),
                requires_token: false,
                ..Default::default()
            },
        ],
        LocalModelProvider::OpenRouter => vec![
            LocalModelCard {
                provider,
                id: "openrouter/google/gemini-pro".to_string(),
                author: Some("OpenRouter".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["router".to_string(), "gemini".to_string()],
                description: Some(
                    "Agrega modelos de múltiples proveedores con una única API compatible con OpenAI.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "openrouter/mistral/mixtral-8x7b".to_string(),
                author: Some("OpenRouter".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["mixture-of-experts".to_string()],
                description: Some(
                    "Modelos orquestados por OpenRouter listos para su consumo mediante claves personales.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::Modelscope => vec![
            LocalModelCard {
                provider,
                id: "modelscope/Qwen1.5-14B-Chat".to_string(),
                author: Some("ModelScope".to_string()),
                pipeline_tag: Some("text-generation".to_string()),
                tags: vec!["qwen".to_string(), "chat".to_string()],
                description: Some(
                    "Modelos del ecosistema ModelScope listos para descarga mediante su SDK oficial.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
            LocalModelCard {
                provider,
                id: "modelscope/speech_paraformer".to_string(),
                author: Some("ModelScope".to_string()),
                pipeline_tag: Some("automatic-speech-recognition".to_string()),
                tags: vec!["audio".to_string(), "asr".to_string()],
                description: Some(
                    "Ejemplos de pipelines de voz disponibles a través del hub de ModelScope.".
                        to_string(),
                ),
                requires_token: true,
                ..Default::default()
            },
        ],
        LocalModelProvider::HuggingFace => Vec::new(),
    }
}

fn format_timestamp(timestamp: DateTime<Utc>) -> String {
    let local: DateTime<Local> = DateTime::from(timestamp);
    local.format("%Y-%m-%d %H:%M").to_string()
}

fn truncate_middle(value: &str, max_len: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= max_len {
        return value.to_string();
    }

    if max_len <= 3 {
        return "…".to_string();
    }

    let keep = max_len.saturating_sub(3);
    let front = keep / 2;
    let back = keep - front;
    let start: String = chars.iter().take(front).collect();
    let end: String = chars
        .iter()
        .rev()
        .take(back)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{}…{}", start, end)
}

fn format_count(value: u64) -> String {
    if value >= 1_000_000 {
        let short = value as f64 / 1_000_000.0;
        if short >= 10.0 {
            format!("{:.0}M", short)
        } else {
            format!("{:.1}M", short)
        }
    } else if value >= 1_000 {
        let short = value as f64 / 1_000.0;
        if short >= 10.0 {
            format!("{:.0}K", short)
        } else {
            format!("{:.1}K", short)
        }
    } else {
        value.to_string()
    }
}

fn quick_chip(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(label)
            .color(Color32::from_rgb(228, 228, 228))
            .strong(),
    )
    .min_size(egui::vec2(0.0, 28.0))
    .fill(Color32::from_rgb(36, 38, 46))
    .rounding(egui::Rounding::same(10.0));
    ui.add(button)
}

fn quick_chip_with_icon(ui: &mut egui::Ui, icon: &str, tooltip: &str) -> egui::Response {
    let button = egui::Button::new(
        RichText::new(icon)
            .font(theme::icon_font(14.0))
            .color(Color32::from_rgb(230, 230, 230)),
    )
    .min_size(egui::vec2(32.0, 28.0))
    .fill(Color32::from_rgb(36, 38, 46))
    .rounding(egui::Rounding::same(10.0));
    let response = ui.add(button);
    response.on_hover_text(tooltip)
}

fn selectable_chip(ui: &mut egui::Ui, label: &str, selected: bool) -> egui::Response {
    let fill = if selected {
        theme::color_primary()
    } else {
        Color32::from_rgb(44, 46, 54)
    };
    let text_color = if selected {
        Color32::from_rgb(24, 28, 34)
    } else {
        Color32::from_rgb(240, 240, 240)
    };

    let button = egui::Button::new(RichText::new(label).color(text_color).size(11.0))
        .min_size(egui::vec2(0.0, 24.0))
        .fill(fill)
        .rounding(egui::Rounding::same(10.0));

    ui.add(button)
}

fn insert_mention(state: &mut AppState, mention: &str) {
    let trimmed = state.chat.input.trim();
    if trimmed.starts_with(mention) {
        if !state.chat.input.ends_with(' ') {
            state.chat.input.push(' ');
        }
        return;
    }

    if trimmed.is_empty() {
        state.chat.input = format!("{} ", mention);
    } else {
        state.chat.input = format!("{} {}", mention, trimmed);
    }
}

fn insert_code_template(state: &mut AppState) {
    let template = "```language\n\n```";
    if state.chat.input.trim().is_empty() {
        state.chat.input = template.to_string();
    } else {
        if !state.chat.input.ends_with('\n') {
            state.chat.input.push('\n');
        }
        state.chat.input.push_str(template);
    }
}

fn draw_local_settings(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Alias para mencionar a Jarvis en el chat");
    if ui
        .text_edit_singleline(&mut state.resources.jarvis_alias)
        .changed()
    {
        state.persist_config();
    }

    ui.label("Model path");
    if ui
        .text_edit_singleline(&mut state.resources.jarvis_model_path)
        .changed()
    {
        state.persist_config();
    }

    ui.label("Model install directory");
    if ui
        .text_edit_singleline(&mut state.resources.jarvis_install_dir)
        .changed()
    {
        state.persist_config();
    }

    if state.resources.installed_local_models.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Instala un modelo desde Hugging Face para habilitar Jarvis.",
        );
    } else {
        let mut provider = state.resources.jarvis_selected_provider;
        let mut available_providers: Vec<LocalModelProvider> = state
            .resources
            .installed_local_models
            .iter()
            .map(|model| model.identifier.provider)
            .collect();
        available_providers.sort();
        available_providers.dedup();

        if !available_providers.contains(&provider) {
            provider = state
                .resources
                .installed_local_models
                .first()
                .map(|model| model.identifier.provider)
                .unwrap_or(LocalModelProvider::HuggingFace);
        }

        egui::ComboBox::from_label("Proveedor local")
            .selected_text(provider.display_name().to_string())
            .show_ui(ui, |ui| {
                for candidate in LocalModelProvider::ALL {
                    if available_providers.contains(&candidate) {
                        ui.selectable_value(&mut provider, candidate, candidate.display_name());
                    }
                }
            });

        if provider != state.resources.jarvis_selected_provider {
            state.resources.jarvis_selected_provider = provider;
            if state
                .resources
                .jarvis_active_model
                .as_ref()
                .map(|model| model.provider)
                != Some(provider)
            {
                state.resources.jarvis_active_model = None;
            }
            state.persist_config();
        }

        let available_models: Vec<LocalModelIdentifier> = state
            .resources
            .installed_local_models
            .iter()
            .filter(|model| model.identifier.provider == provider)
            .map(|model| model.identifier.clone())
            .collect();

        let mut selected_model = state
            .resources
            .jarvis_active_model
            .as_ref()
            .filter(|model| model.provider == provider)
            .cloned();

        let current_label = selected_model
            .as_ref()
            .map(|model| model.display_label())
            .unwrap_or_else(|| "Selecciona un modelo instalado".to_string());

        egui::ComboBox::from_label("Modelo local activo")
            .selected_text(current_label)
            .show_ui(ui, |ui| {
                ui.selectable_value(&mut selected_model, None, "— Sin modelo —");
                for model in &available_models {
                    ui.selectable_value(
                        &mut selected_model,
                        Some(model.clone()),
                        model.display_label(),
                    );
                }
            });

        if selected_model != state.resources.jarvis_active_model {
            if let Some(model) = selected_model.clone() {
                let status = state.activate_jarvis_model(&model);
                state.provider_state_mut(provider).install_status = Some(status);
            } else {
                let status = state.deactivate_jarvis_model();
                state.provider_state_mut(provider).install_status = Some(status);
            }
        }

        if let Some(active) = state.resources.jarvis_active_model.clone() {
            if let Some(record) = state.installed_model(&active) {
                ui.add_space(10.0);
                ui.heading(
                    RichText::new("Resumen del modelo activo")
                        .color(theme::color_text_primary())
                        .size(16.0),
                );
                ui.add_space(6.0);
                let install_path = if record.install_path.trim().is_empty() {
                    Path::new(&state.resources.jarvis_install_dir)
                        .join(record.identifier.sanitized_dir_name())
                        .display()
                        .to_string()
                } else {
                    record.install_path.clone()
                };
                let path_display = truncate_middle(&install_path, 80);

                egui::Frame::none()
                    .fill(Color32::from_rgb(34, 38, 44))
                    .stroke(theme::subtle_border(&state.theme))
                    .rounding(egui::Rounding::same(12.0))
                    .inner_margin(egui::Margin::symmetric(14.0, 12.0))
                    .show(ui, |ui| {
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(active.display_label())
                                    .strong()
                                    .color(theme::color_text_primary()),
                            );
                            ui.add_space(4.0);
                            ui.label(
                                RichText::new(format!(
                                    "{} · Instalado el {}",
                                    format_bytes(record.size_bytes),
                                    format_timestamp(record.installed_at)
                                ))
                                .color(theme::color_text_weak())
                                .size(12.0),
                            );
                            ui.label(
                                RichText::new(path_display)
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            )
                            .on_hover_text(install_path);
                        });
                    });
            }
        }
    }

    if ui
        .checkbox(
            &mut state.resources.jarvis_auto_start,
            "Start Jarvis automatically",
        )
        .changed()
    {
        state.persist_config();
        if state.resources.jarvis_auto_start {
            match state.ensure_jarvis_runtime() {
                Ok(runtime) => {
                    state.resources.jarvis_status = Some(format!(
                        "Jarvis se iniciará automáticamente con {}.",
                        runtime.model_label()
                    ));
                }
                Err(err) => {
                    state.resources.jarvis_status =
                        Some(format!("No se pudo preparar el autoarranque: {}", err));
                }
            }
        } else {
            state.resources.jarvis_status =
                Some("El autoarranque de Jarvis ha sido desactivado.".to_string());
            state.resources.jarvis_runtime = None;
        }
    }

    ui.horizontal(|ui| {
        if ui
            .checkbox(
                &mut state.resources.jarvis_respond_without_alias,
                "Responder automáticamente sin mención",
            )
            .changed()
        {
            state.persist_config();
        }
        ui.add_space(8.0);
        ui.label(
            RichText::new("Cuando está activo, Jarvis contestará todos los mensajes.")
                .color(theme::color_text_weak())
                .size(12.0),
        );
    });

    if ui.button("Apply settings").clicked() {
        state.resources.jarvis_status = Some(format!(
            "Jarvis will {} at startup with model at {}.",
            if state.resources.jarvis_auto_start {
                "start"
            } else {
                "remain stopped"
            },
            state.resources.jarvis_model_path
        ));
        state.persist_config();
    }

    if let Some(status) = &state.resources.jarvis_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_anthropic(ui: &mut egui::Ui, state: &mut AppState, tab_index: usize) {
    match tab_index {
        0 => draw_provider_anthropic_configuration(ui, state),
        1 => draw_claude_models_tab(ui, state),
        2 => draw_provider_usage_overview(ui, state, RemoteProviderKind::Anthropic),
        _ => draw_provider_anthropic_configuration(ui, state),
    }
}

fn draw_provider_anthropic_configuration(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui
        .text_edit_singleline(&mut state.resources.claude_alias)
        .changed()
    {
        state.persist_config();
    }

    ui.label("Anthropic API key");
    let mut key_changed = false;
    {
        let key = state
            .config
            .anthropic
            .api_key
            .get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default Claude model");
    if ui
        .text_edit_singleline(&mut state.resources.claude_default_model)
        .changed()
    {
        state.persist_config();
    }

    let anthropic_key = state.config.anthropic.api_key.clone().unwrap_or_default();
    let anthropic_key_trimmed = anthropic_key.trim().to_string();

    if ui.button("Test connection").clicked() {
        if anthropic_key_trimmed.is_empty() {
            state.resources.anthropic_test_status =
                Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::claude::send_message(
                anthropic_key_trimmed.as_str(),
                &state.resources.claude_default_model,
                "Responde únicamente con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.resources.anthropic_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.resources.anthropic_test_status =
                        Some(format!("Anthropic test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.resources.anthropic_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_claude_models_tab(ui: &mut egui::Ui, state: &mut AppState) {
    let anthropic_key = state.config.anthropic.api_key.clone().unwrap_or_default();
    let anthropic_key_trimmed = anthropic_key.trim().to_string();
    draw_claude_catalog(ui, state, anthropic_key_trimmed.as_str());
}

fn draw_claude_catalog(ui: &mut egui::Ui, state: &mut AppState, anthropic_key: &str) {
    ui.add_space(16.0);
    ui.separator();
    ui.add_space(10.0);

    ui.heading(
        RichText::new("Catálogo de modelos disponibles")
            .color(theme::color_text_primary())
            .strong(),
    );
    ui.label(
        RichText::new(
            "Consulta la API de Anthropic para descubrir los modelos compatibles con tu cuenta.",
        )
        .color(theme::color_text_weak())
        .size(12.0),
    );
    ui.add_space(10.0);

    let mut refresh_triggered = false;
    if ui
        .add_sized(
            [180.0, 32.0],
            theme::primary_button(
                RichText::new("Actualizar catálogo").color(Color32::from_rgb(240, 240, 240)),
                &state.theme,
            ),
        )
        .clicked()
    {
        refresh_triggered = true;
    }

    if refresh_triggered {
        if anthropic_key.is_empty() {
            state.resources.claude_models_status =
                Some("Ingresa una API key válida antes de solicitar el catálogo.".to_string());
        } else {
            match crate::api::claude::list_models(anthropic_key) {
                Ok(models) => {
                    let count = models.len();
                    state.resources.claude_available_models = models;
                    state.resources.claude_models_status = Some(if count == 0 {
                        "No se encontraron modelos disponibles para esta cuenta.".to_string()
                    } else {
                        format!("Se encontraron {count} modelos disponibles.")
                    });
                }
                Err(err) => {
                    state.resources.claude_models_status =
                        Some(format!("No se pudo obtener el listado de modelos: {}", err));
                }
            }
        }
    }

    if let Some(status) = &state.resources.claude_models_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }

    ui.add_space(12.0);

    if state.resources.claude_available_models.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Pulsa \"Actualizar catálogo\" para listar los modelos disponibles.",
        );
    } else {
        let models = state.resources.claude_available_models.clone();
        draw_claude_models_gallery(ui, state, &models);
    }
}

fn draw_local_library_overview(ui: &mut egui::Ui, state: &mut AppState) {
    if state.resources.installed_local_models.is_empty() {
        ui.colored_label(
            theme::color_text_weak(),
            "Aún no hay modelos instalados. Usa una galería local para descargar uno y aparecerá aquí.",
        );
        return;
    }

    {
        let library = &mut state.resources.local_library;
        ui.horizontal(|ui| {
            let filter_width = (ui.available_width() - 160.0).max(200.0);
            ui.add_sized(
                [filter_width, 28.0],
                egui::TextEdit::singleline(&mut library.filter)
                    .hint_text("Buscar modelo o proveedor"),
            );
            if ui
                .add_sized([140.0, 28.0], egui::Button::new("Limpiar búsqueda"))
                .clicked()
            {
                library.filter.clear();
            }
        });

        ui.add_space(4.0);
        if ui
            .checkbox(
                &mut library.show_only_ready,
                "Solo modelos con ruta disponible",
            )
            .changed()
        {
            // no-op, el filtro se aplica al refrescar la vista
        }

        if let Some(status) = &library.operation_feedback {
            ui.add_space(6.0);
            ui.colored_label(theme::color_text_weak(), status);
        }
    }

    ui.add_space(8.0);
    let filter_lower = state.resources.local_library.filter.to_lowercase();
    let show_only_ready = state.resources.local_library.show_only_ready;
    let installed = state.resources.installed_local_models.clone();
    let mut removals: Vec<LocalModelIdentifier> = Vec::new();
    let mut pending_feedback: Option<String> = None;

    for record in installed.iter() {
        let label = record.identifier.display_label();
        let provider_name = record.identifier.provider.display_name();
        let size_label = format_bytes(record.size_bytes);
        let installed_at = record
            .installed_at
            .with_timezone(&Local)
            .format("%Y-%m-%d %H:%M")
            .to_string();
        let is_active = state
            .resources
            .jarvis_active_model
            .as_ref()
            .map(|active| {
                active.provider == record.identifier.provider
                    && active.model_id == record.identifier.model_id
            })
            .unwrap_or(false);
        let is_ready = !record.install_path.trim().is_empty();
        let is_selected = state
            .resources
            .local_library
            .selection
            .as_ref()
            .map(|selected| selected == &record.identifier)
            .unwrap_or(false);

        if !filter_lower.is_empty()
            && !label.to_lowercase().contains(&filter_lower)
            && !provider_name.to_lowercase().contains(&filter_lower)
        {
            continue;
        }

        if show_only_ready && !is_ready {
            continue;
        }

        let mut border = theme::subtle_border(&state.theme);
        if is_selected {
            border = egui::Stroke::new(1.6, theme::color_primary());
        }

        egui::Frame::none()
            .fill(if is_selected {
                Color32::from_rgb(40, 44, 52)
            } else {
                Color32::from_rgb(34, 38, 44)
            })
            .stroke(border)
            .rounding(egui::Rounding::same(12.0))
            .inner_margin(egui::Margin::symmetric(14.0, 10.0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 8.0;
                        ui.label(
                            RichText::new(provider_name)
                                .color(theme::color_primary())
                                .strong(),
                        );
                        if is_active {
                            ui.label(
                                RichText::new("Activo")
                                    .color(theme::color_primary())
                                    .size(11.0)
                                    .italics(),
                            );
                        }
                        if is_selected {
                            ui.label(
                                RichText::new("Seleccionado")
                                    .color(theme::color_text_primary())
                                    .size(10.0),
                            );
                        }
                    });

                    ui.label(
                        RichText::new(label)
                            .color(theme::color_text_primary())
                            .size(13.0),
                    );

                    ui.add_space(4.0);
                    ui.label(
                        RichText::new(format!(
                            "Tamaño: {} · Instalado: {}",
                            size_label, installed_at
                        ))
                        .color(theme::color_text_weak())
                        .size(11.0),
                    );

                    if !record.install_path.trim().is_empty() {
                        ui.label(
                            RichText::new(format!("Ruta: {}", record.install_path))
                                .color(theme::color_text_weak())
                                .size(10.0),
                        );
                    }

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Activar").clicked() {
                            let status = state.activate_jarvis_model(&record.identifier);
                            pending_feedback = Some(status);
                            state.resources.local_library.selection =
                                Some(record.identifier.clone());
                        }

                        if ui.button("Actualizar").clicked() {
                            if let Some(status) = state.mark_local_model_updated(&record.identifier)
                            {
                                pending_feedback = Some(status);
                            }
                            state.resources.local_library.selection =
                                Some(record.identifier.clone());
                        }

                        if ui
                            .button(RichText::new("Eliminar").color(theme::color_danger()))
                            .clicked()
                        {
                            removals.push(record.identifier.clone());
                        }
                    });
                });
            });

        ui.add_space(10.0);
    }

    for identifier in removals {
        let removed_selected = state
            .resources
            .local_library
            .selection
            .as_ref()
            .map(|selected| selected == &identifier)
            .unwrap_or(false);
        if let Some(status) = state.uninstall_local_model(&identifier) {
            pending_feedback = Some(status);
        }
        if removed_selected {
            state.resources.local_library.selection = None;
        }
    }

    if let Some(feedback) = pending_feedback {
        state.resources.local_library.operation_feedback = Some(feedback);
    }
}

fn draw_claude_models_gallery(ui: &mut egui::Ui, state: &mut AppState, models: &[AnthropicModel]) {
    let columns = if ui.available_width() > 720.0 { 2 } else { 1 };
    let spacing = 16.0;

    egui::ScrollArea::vertical()
        .id_source("claude_models_scroll")
        .max_height(360.0)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            let available_width = ui.available_width();
            let card_width = ((available_width - spacing * ((columns as f32) - 1.0))
                / columns as f32)
                .max(260.0);

            for chunk in models.chunks(columns) {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = spacing;
                    for model in chunk {
                        let (rect, _) = ui
                            .allocate_at_least(egui::vec2(card_width, 200.0), egui::Sense::hover());
                        let mut card_ui =
                            ui.child_ui(rect, egui::Layout::top_down(egui::Align::LEFT));
                        draw_claude_model_card(&mut card_ui, state, model);
                    }

                    if chunk.len() < columns {
                        for _ in chunk.len()..columns {
                            ui.add_space(card_width);
                        }
                    }
                });
                ui.add_space(spacing);
            }
        });
}

fn draw_claude_model_card(ui: &mut egui::Ui, state: &mut AppState, model: &AnthropicModel) {
    let is_selected = state.resources.claude_default_model.trim() == model.id;
    let fill = Color32::from_rgb(34, 38, 44);
    let border = if is_selected {
        theme::color_primary()
    } else {
        Color32::from_rgb(70, 80, 96)
    };

    egui::Frame::none()
        .fill(fill)
        .stroke(egui::Stroke::new(
            if is_selected { 2.0 } else { 1.0 },
            border,
        ))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(14.0, 12.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.vertical(|ui| {
                let title = model
                    .display_name
                    .clone()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| model.id.clone());
                ui.label(
                    RichText::new(title)
                        .strong()
                        .color(theme::color_text_primary()),
                );

                if model
                    .display_name
                    .as_ref()
                    .map(|value| value.trim() != model.id)
                    .unwrap_or(false)
                {
                    ui.label(
                        RichText::new(&model.id)
                            .color(theme::color_text_weak())
                            .size(12.0),
                    );
                }

                let mut metrics = Vec::new();
                if let Some(context) = model.context_window {
                    metrics.push(format!("Contexto: {} tokens", context));
                }
                if let Some(limit) = model.input_token_limit {
                    metrics.push(format!("Entrada máx: {}", limit));
                }
                if let Some(limit) = model.output_token_limit {
                    metrics.push(format!("Salida máx: {}", limit));
                }
                if let Some(kind) = &model.r#type {
                    if !kind.trim().is_empty() {
                        metrics.push(format!("Tipo: {}", kind));
                    }
                }
                if !metrics.is_empty() {
                    ui.label(
                        RichText::new(metrics.join("  ·  "))
                            .color(theme::color_text_primary())
                            .size(12.0),
                    );
                }

                if !model.aliases.is_empty() {
                    let mut aliases: Vec<&str> =
                        model.aliases.iter().map(|alias| alias.as_str()).collect();
                    if aliases.len() > 3 {
                        aliases.truncate(3);
                    }
                    let suffix = if model.aliases.len() > aliases.len() {
                        format!(" (+{} más)", model.aliases.len() - aliases.len())
                    } else {
                        String::new()
                    };
                    ui.label(
                        RichText::new(format!("Aliases: {}{}", aliases.join(", "), suffix))
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                }

                if let Some(description) = &model.description {
                    if !description.trim().is_empty() {
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new(description)
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                    }
                }

                ui.add_space(10.0);

                if ui
                    .add_sized(
                        [ui.available_width(), 30.0],
                        theme::primary_button(
                            RichText::new("Use this model").color(Color32::from_rgb(240, 240, 240)),
                            &state.theme,
                        ),
                    )
                    .clicked()
                {
                    state.resources.claude_default_model = model.id.clone();
                    state.persist_config();
                    state.resources.claude_models_status = Some(format!(
                        "Modelo '{}' establecido como predeterminado.",
                        model.id
                    ));
                }
            });
        });
}

fn draw_provider_openai(ui: &mut egui::Ui, state: &mut AppState, tab_index: usize) {
    match tab_index {
        0 => draw_provider_openai_configuration(ui, state),
        1 => draw_provider_model_preview(ui, state, RemoteProviderKind::OpenAi),
        2 => draw_provider_usage_overview(ui, state, RemoteProviderKind::OpenAi),
        _ => draw_provider_openai_configuration(ui, state),
    }
}

fn draw_provider_openai_configuration(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui
        .text_edit_singleline(&mut state.resources.openai_alias)
        .changed()
    {
        state.persist_config();
    }

    ui.label("OpenAI API key");
    let mut key_changed = false;
    {
        let key = state.config.openai.api_key.get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default OpenAI model");
    if ui
        .text_edit_singleline(&mut state.resources.openai_default_model)
        .changed()
    {
        state.persist_config();
    }

    let openai_key = state.config.openai.api_key.clone().unwrap_or_default();

    if ui.button("Test connection").clicked() {
        if openai_key.trim().is_empty() {
            state.resources.openai_test_status =
                Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::openai::send_message(
                openai_key.trim(),
                &state.resources.openai_default_model,
                "Responde con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.resources.openai_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.resources.openai_test_status =
                        Some(format!("OpenAI test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.resources.openai_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_groq(ui: &mut egui::Ui, state: &mut AppState, tab_index: usize) {
    match tab_index {
        0 => draw_provider_groq_configuration(ui, state),
        1 => draw_provider_model_preview(ui, state, RemoteProviderKind::Groq),
        2 => draw_provider_usage_overview(ui, state, RemoteProviderKind::Groq),
        _ => draw_provider_groq_configuration(ui, state),
    }
}

fn draw_provider_groq_configuration(ui: &mut egui::Ui, state: &mut AppState) {
    ui.label("Chat alias");
    if ui
        .text_edit_singleline(&mut state.resources.groq_alias)
        .changed()
    {
        state.persist_config();
    }

    ui.label("Groq API key");
    let mut key_changed = false;
    {
        let key = state.config.groq.api_key.get_or_insert_with(String::new);
        if ui.text_edit_singleline(key).changed() {
            key_changed = true;
        }
    }
    if key_changed {
        state.persist_config();
    }

    ui.label("Default Groq model");
    if ui
        .text_edit_singleline(&mut state.resources.groq_default_model)
        .changed()
    {
        state.persist_config();
    }

    let groq_key = state.config.groq.api_key.clone().unwrap_or_default();

    if ui.button("Test connection").clicked() {
        if groq_key.trim().is_empty() {
            state.resources.groq_test_status = Some("Enter an API key before testing.".to_string());
        } else {
            match crate::api::groq::send_message(
                groq_key.trim(),
                &state.resources.groq_default_model,
                "Contesta con la palabra 'pong'.",
            ) {
                Ok(response) => {
                    let snippet: String = response.chars().take(60).collect();
                    state.resources.groq_test_status =
                        Some(format!("API reachable. Sample response: {}", snippet));
                }
                Err(err) => {
                    state.resources.groq_test_status = Some(format!("Groq test failed: {}", err));
                }
            }
            state.persist_config();
        }
    }

    if let Some(status) = &state.resources.groq_test_status {
        ui.add_space(6.0);
        ui.colored_label(ui.visuals().weak_text_color(), status);
    }
}

fn draw_provider_model_preview(ui: &mut egui::Ui, state: &AppState, provider: RemoteProviderKind) {
    let heading = format!("Modelos destacados de {}", provider.display_name());
    ui.heading(
        RichText::new(heading)
            .color(theme::color_text_primary())
            .strong(),
    );
    ui.label(
        RichText::new("Ajusta los modelos recomendados y su contexto disponible.")
            .color(theme::color_text_weak())
            .size(12.0),
    );

    ui.add_space(10.0);
    if let Some(cards) = state.resources.remote_catalog.provider_cards.get(&provider) {
        if cards.is_empty() {
            ui.colored_label(
                theme::color_text_weak(),
                "No hay modelos precargados para este proveedor.",
            );
            return;
        }

        for card in cards.iter().take(5) {
            egui::Frame::none()
                .fill(Color32::from_rgb(34, 36, 42))
                .stroke(theme::subtle_border(&state.theme))
                .rounding(egui::Rounding::same(12.0))
                .inner_margin(egui::Margin::symmetric(14.0, 12.0))
                .show(ui, |ui| {
                    ui.vertical(|ui| {
                        ui.horizontal(|ui| {
                            ui.label(
                                RichText::new(&card.title)
                                    .color(theme::color_text_primary())
                                    .strong()
                                    .size(14.0),
                            );
                            ui.add_space(ui.available_width());
                            ui.label(
                                RichText::new(format!("Contexto: {} tokens", card.context_tokens))
                                    .color(theme::color_text_weak())
                                    .size(11.0),
                            );
                        });
                        ui.label(
                            RichText::new(&card.description)
                                .color(theme::color_text_weak())
                                .size(11.0),
                        );
                        if !card.tags.is_empty() {
                            ui.add_space(6.0);
                            ui.horizontal_wrapped(|ui| {
                                ui.spacing_mut().item_spacing.x = 6.0;
                                for tag in &card.tags {
                                    selectable_chip(ui, tag, false);
                                }
                            });
                        }
                    });
                });
            ui.add_space(6.0);
        }
        if cards.len() > 5 {
            ui.colored_label(
                theme::color_text_weak(),
                "Explora el catálogo completo desde la sección de Recursos › Catálogos remotos.",
            );
        }
    } else {
        ui.colored_label(
            theme::color_text_weak(),
            "Aún no se ha consultado el catálogo remoto de este proveedor.",
        );
    }
}

fn draw_provider_usage_overview(ui: &mut egui::Ui, state: &AppState, provider: RemoteProviderKind) {
    let provider_name = provider.display_name();
    ui.heading(
        RichText::new(format!("Uso de {provider_name}"))
            .color(theme::color_text_primary())
            .strong(),
    );
    ui.label(
        RichText::new("Monitorea el consumo y mantén tus límites bajo control.")
            .color(theme::color_text_weak())
            .size(12.0),
    );

    ui.add_space(10.0);
    let total_models = state
        .resources
        .remote_catalog
        .provider_cards
        .get(&provider)
        .map(|cards| cards.len())
        .unwrap_or(0);
    let favorites = state
        .resources
        .remote_catalog
        .favorites
        .iter()
        .filter(|key| key.provider == provider)
        .count();
    let comparisons = state
        .resources
        .remote_catalog
        .comparison
        .iter()
        .filter(|key| key.provider == provider)
        .count();

    ui.horizontal(|ui| {
        usage_chip(
            ui,
            ICON_DATABASE,
            "Modelos cargados",
            total_models,
            &state.theme,
        );
        usage_chip(ui, ICON_STAR, "Favoritos", favorites, &state.theme);
        usage_chip(ui, ICON_COMPARE, "Comparador", comparisons, &state.theme);
    });

    ui.add_space(12.0);
    if let Some(status) = &state.resources.remote_catalog.last_status {
        ui.label(
            RichText::new(format!("Última actualización: {status}"))
                .color(theme::color_text_weak())
                .size(11.0),
        );
    } else {
        ui.label(
            RichText::new("Aún no se han sincronizado métricas para este proveedor.")
                .color(theme::color_text_weak())
                .size(11.0),
        );
    }

    ui.add_space(10.0);
    ui.colored_label(
        theme::color_text_weak(),
        "Próximamente podrás definir límites de consumo y alertas personalizadas desde aquí.",
    );
}

fn usage_chip(ui: &mut egui::Ui, icon: &str, label: &str, value: usize, tokens: &ThemeTokens) {
    egui::Frame::none()
        .fill(Color32::from_rgb(34, 36, 42))
        .stroke(theme::subtle_border(tokens))
        .rounding(egui::Rounding::same(12.0))
        .inner_margin(egui::Margin::symmetric(16.0, 12.0))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(icon)
                        .font(theme::icon_font(16.0))
                        .color(theme::color_primary()),
                );
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(label)
                            .color(theme::color_text_weak())
                            .size(11.0),
                    );
                    ui.label(
                        RichText::new(value.to_string())
                            .color(theme::color_text_primary())
                            .size(16.0)
                            .strong(),
                    );
                });
            });
        });
}
