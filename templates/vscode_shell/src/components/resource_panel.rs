use eframe::egui::{self, Color32, Frame, Margin, RichText, Rounding, Sense, Stroke};

use crate::layout::{LayoutConfig, ShellTheme};

#[derive(Clone, Debug)]
pub struct ResourcePanelProps {
    pub title: Option<String>,
    pub sections: Vec<ResourceSectionProps>,
    pub collapse_button_tooltip: Option<String>,
}

impl Default for ResourcePanelProps {
    fn default() -> Self {
        Self {
            title: None,
            sections: Vec::new(),
            collapse_button_tooltip: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ResourceSectionProps {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub items: Vec<ResourceItem>,
}

#[derive(Clone, Debug)]
pub struct ResourceItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub selected: bool,
}

pub trait ResourcePanelModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> ResourcePanelProps;
    fn on_item_selected(&mut self, item_id: &str);
}

pub fn draw_resource_panel(
    ctx: &egui::Context,
    layout: &mut LayoutConfig,
    model: &mut dyn ResourcePanelModel,
) {
    if !layout.show_resource_panel {
        return;
    }

    let theme = model.theme();
    let props = model.props();

    if layout.resource_collapsed() {
        egui::SidePanel::right("resource_panel_collapsed")
            .resizable(false)
            .exact_width(36.0)
            .frame(
                Frame::none()
                    .fill(theme.surface_background)
                    .stroke(Stroke::new(1.0, theme.border))
                    .inner_margin(Margin::same(6.0)),
            )
            .show(ctx, |ui| {
                if ui.button("◀").on_hover_text("Expandir recursos").clicked() {
                    layout.emit_resource_signal(false);
                }
            });
        return;
    }

    egui::SidePanel::right("resource_panel")
        .resizable(false)
        .exact_width(layout.resource_width)
        .frame(
            Frame::none()
                .fill(theme.surface_background)
                .stroke(Stroke::new(1.0, theme.border))
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
                let button = egui::Button::new("▶").min_size(egui::vec2(24.0, 24.0));
                let mut response = ui.add(button);
                if let Some(tooltip) = props.collapse_button_tooltip.as_ref() {
                    response = response.on_hover_text(tooltip);
                }
                if response.clicked() {
                    layout.emit_resource_signal(true);
                }
            });

            ui.add_space(12.0);
            egui::ScrollArea::vertical()
                .id_source("shell_resource_panel_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for section in props.sections {
                        ui.label(
                            RichText::new(section.title)
                                .color(theme.text_muted)
                                .size(12.0),
                        );
                        if let Some(description) = section.description.as_ref() {
                            ui.small(RichText::new(description).color(theme.text_muted));
                        }
                        ui.add_space(6.0);
                        for item in section.items {
                            let response = resource_entry(ui, &theme, &item);
                            if response.clicked() {
                                model.on_item_selected(&item.id);
                            }
                        }
                        ui.add_space(16.0);
                    }
                });
        });
}

fn resource_entry(ui: &mut egui::Ui, theme: &ShellTheme, item: &ResourceItem) -> egui::Response {
    let frame = Frame::none()
        .fill(if item.selected {
            theme.accent_soft
        } else {
            Color32::from_rgba_unmultiplied(0, 0, 0, 0)
        })
        .stroke(Stroke::new(1.0, theme.border))
        .rounding(Rounding::same(10.0))
        .inner_margin(Margin::symmetric(12.0, 8.0));

    let response = frame.show(ui, |ui| {
        ui.vertical(|ui| {
            ui.label(
                RichText::new(&item.title)
                    .color(theme.text_primary)
                    .strong(),
            );
            if let Some(subtitle) = item.subtitle.as_ref() {
                ui.small(RichText::new(subtitle).color(theme.text_muted));
            }
        });
    });

    let response = ui.interact(response.response.rect, response.response.id, Sense::click());
    response
}
