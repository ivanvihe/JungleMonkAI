use eframe::egui::{self, Margin, RichText, Rounding};

use crate::layout::{LayoutConfig, ShellTheme};

#[derive(Clone, Debug)]
pub struct SidebarProps {
    pub title: Option<String>,
    pub sections: Vec<SidebarSection>,
    pub collapse_button_tooltip: Option<String>,
}

impl Default for SidebarProps {
    fn default() -> Self {
        Self {
            title: None,
            sections: Vec::new(),
            collapse_button_tooltip: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SidebarSection {
    pub id: String,
    pub title: String,
    pub items: Vec<SidebarItem>,
}

#[derive(Clone, Debug)]
pub struct SidebarItem {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub badge: Option<String>,
    pub selected: bool,
}

pub trait NavigationModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> SidebarProps;
    fn on_item_selected(&mut self, item_id: &str);
}

pub fn draw_sidebar(
    ctx: &egui::Context,
    layout: &mut LayoutConfig,
    model: &mut dyn NavigationModel,
) {
    if !layout.show_navigation {
        return;
    }

    let theme = model.theme();
    let props = model.props();

    if layout.navigation_collapsed() {
        egui::SidePanel::left("navigation_panel_collapsed")
            .resizable(false)
            .exact_width(36.0)
            .frame(
                egui::Frame::none()
                    .fill(theme.surface_background)
                    .stroke(egui::Stroke::new(1.0, theme.border))
                    .inner_margin(Margin::same(6.0)),
            )
            .show(ctx, |ui| {
                if ui.button("▶").on_hover_text("Expandir panel").clicked() {
                    layout.emit_navigation_signal(false);
                }
            });
        return;
    }

    egui::SidePanel::left("navigation_panel")
        .resizable(false)
        .exact_width(layout.navigation_width)
        .frame(
            egui::Frame::none()
                .fill(theme.surface_background)
                .stroke(egui::Stroke::new(1.0, theme.border))
                .inner_margin(Margin {
                    left: 16.0,
                    right: 16.0,
                    top: 18.0,
                    bottom: 18.0,
                })
                .rounding(Rounding::same(12.0)),
        )
        .show(ctx, |ui| {
            ui.set_width(ui.available_width());

            ui.horizontal(|ui| {
                if let Some(title) = props.title.as_ref() {
                    ui.strong(RichText::new(title).color(theme.text_primary));
                }
                ui.add_space(ui.available_width());
                let button = egui::Button::new("◀").min_size(egui::vec2(24.0, 24.0));
                let mut response = ui.add(button);
                if let Some(tooltip) = props.collapse_button_tooltip.as_ref() {
                    response = response.on_hover_text(tooltip);
                }
                if response.clicked() {
                    layout.emit_navigation_signal(true);
                }
            });

            ui.add_space(12.0);
            egui::ScrollArea::vertical()
                .id_source("shell_sidebar_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for section in props.sections {
                        ui.label(
                            RichText::new(section.title)
                                .color(theme.text_muted)
                                .size(12.0),
                        );
                        ui.add_space(6.0);
                        for item in section.items {
                            let response = nav_entry(ui, &theme, &item);
                            if response.clicked() {
                                model.on_item_selected(&item.id);
                            }
                        }
                        ui.add_space(14.0);
                    }
                });
        });
}

fn nav_entry(ui: &mut egui::Ui, theme: &ShellTheme, item: &SidebarItem) -> egui::Response {
    let mut text = RichText::new(item.label.clone()).color(theme.text_primary);
    if item.selected {
        text = text.strong();
    }

    let button = egui::Button::new(match &item.icon {
        Some(icon) => RichText::new(format!("{} {}", icon, text.text())).color(theme.text_primary),
        None => text,
    })
    .fill(if item.selected {
        theme.accent_soft
    } else {
        theme.surface_background
    })
    .min_size(egui::vec2(0.0, 32.0));

    let mut response = ui.add(button);
    if let Some(description) = &item.description {
        response = response.on_hover_text(description);
    }
    if let Some(badge) = &item.badge {
        response = response.on_hover_text(format!("{}", badge));
    }
    response
}
