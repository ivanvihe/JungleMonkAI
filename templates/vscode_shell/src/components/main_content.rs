use eframe::egui::{self, Align, Layout, Margin, RichText, Sense};

use crate::layout::{main_surface_frame, LayoutConfig, ShellTheme};

#[derive(Clone, Debug)]
pub struct MainContentProps {
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub actions: Vec<MainContentAction>,
    pub tabs: Vec<MainContentTab>,
    pub active_tab: Option<String>,
}

impl Default for MainContentProps {
    fn default() -> Self {
        Self {
            title: None,
            subtitle: None,
            actions: Vec::new(),
            tabs: Vec::new(),
            active_tab: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct MainContentAction {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub enabled: bool,
}

impl MainContentAction {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            icon: None,
            enabled: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct MainContentTab {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
}

pub trait MainContentModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> MainContentProps;
    fn on_action(&mut self, action_id: &str);
    fn on_tab_selected(&mut self, tab_id: &str);
    fn show_content(&mut self, ui: &mut egui::Ui);
}

pub fn draw_main_content(
    ctx: &egui::Context,
    layout: &LayoutConfig,
    model: &mut dyn MainContentModel,
) {
    let _ = layout;
    let theme = model.theme();
    let props = model.props();

    egui::CentralPanel::default()
        .frame(egui::Frame::none().fill(theme.root_background))
        .show(ctx, |ui| {
            egui::TopBottomPanel::top("main_toolbar")
                .resizable(false)
                .frame(egui::Frame::none().fill(theme.root_background))
                .show_separator_line(false)
                .show_inside(ui, |ui| {
                    ui.set_height(52.0);
                    ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                        if let Some(title) = props.title.as_ref() {
                            ui.strong(RichText::new(title).color(theme.text_primary).size(18.0));
                        }
                        if let Some(subtitle) = props.subtitle.as_ref() {
                            ui.add_space(12.0);
                            ui.label(RichText::new(subtitle).color(theme.text_muted));
                        }
                        ui.add_space(ui.available_width());
                        for action in props.actions.iter() {
                            let mut button = egui::Button::new(match &action.icon {
                                Some(icon) => RichText::new(format!("{} {}", icon, action.label))
                                    .color(theme.text_primary),
                                None => {
                                    RichText::new(action.label.clone()).color(theme.text_primary)
                                }
                            })
                            .min_size(egui::vec2(0.0, 30.0));
                            if !action.enabled {
                                button = button.sense(Sense::hover());
                            }
                            if ui.add(button).clicked() && action.enabled {
                                model.on_action(&action.id);
                            }
                        }
                    });
                });

            if !props.tabs.is_empty() {
                egui::TopBottomPanel::top("main_tabs")
                    .resizable(false)
                    .frame(
                        egui::Frame::none()
                            .fill(theme.root_background)
                            .inner_margin(Margin::symmetric(0.0, 6.0)),
                    )
                    .show_separator_line(false)
                    .show_inside(ui, |ui| {
                        ui.horizontal(|ui| {
                            for tab in props.tabs.iter() {
                                let is_active = props
                                    .active_tab
                                    .as_ref()
                                    .map(|id| id == &tab.id)
                                    .unwrap_or(false);
                                let button = egui::Button::new(match &tab.icon {
                                    Some(icon) => {
                                        let text = if is_active {
                                            RichText::new(format!("{} {}", icon, tab.label.clone()))
                                                .color(theme.text_primary)
                                                .strong()
                                        } else {
                                            RichText::new(format!("{} {}", icon, tab.label.clone()))
                                                .color(theme.text_primary)
                                        };
                                        text
                                    }
                                    None => {
                                        let mut text = RichText::new(tab.label.clone())
                                            .color(theme.text_primary);
                                        if is_active {
                                            text = text.strong();
                                        }
                                        text
                                    }
                                })
                                .fill(if is_active {
                                    theme.accent_soft
                                } else {
                                    theme.root_background
                                })
                                .min_size(egui::vec2(0.0, 28.0));
                                if ui.add(button).clicked() {
                                    model.on_tab_selected(&tab.id);
                                }
                            }
                        });
                    });
            }

            egui::CentralPanel::default()
                .frame(main_surface_frame(&theme))
                .show_inside(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.set_min_height(ui.available_height());
                    model.show_content(ui);
                });
        });
}
