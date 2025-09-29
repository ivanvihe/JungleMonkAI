use eframe::egui::{self, Align, Color32, Id, Layout, Margin, Order, RichText, Rounding, Sense};

use crate::layout::{LayoutConfig, ShellTheme};

#[derive(Clone, Debug)]
pub struct HeaderProps {
    pub title: String,
    pub subtitle: Option<String>,
    pub search_placeholder: Option<String>,
    pub actions: Vec<HeaderAction>,
    pub logo_acronym: Option<String>,
}

impl Default for HeaderProps {
    fn default() -> Self {
        Self {
            title: "Shell".to_string(),
            subtitle: None,
            search_placeholder: None,
            actions: Vec::new(),
            logo_acronym: Some("VS".to_string()),
        }
    }
}

#[derive(Clone, Debug)]
pub struct HeaderAction {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub shortcut: Option<String>,
    pub enabled: bool,
}

impl HeaderAction {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            icon: None,
            shortcut: None,
            enabled: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SearchGroup {
    pub id: String,
    pub title: String,
    pub results: Vec<SearchResult>,
}

#[derive(Clone, Debug)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub action_hint: Option<String>,
}

pub trait HeaderModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> HeaderProps;
    fn search_value(&self) -> String;
    fn set_search_value(&mut self, value: String);
    fn search_palette(&self) -> Vec<SearchGroup>;
    fn on_search_result(&mut self, result_id: &str);
    fn on_action(&mut self, action_id: &str);
}

pub fn draw_header(ctx: &egui::Context, layout: &LayoutConfig, model: &mut dyn HeaderModel) {
    if !layout.show_header {
        return;
    }

    let theme = model.theme();
    let props = model.props();

    egui::TopBottomPanel::top("shell_header")
        .exact_height(64.0)
        .frame(
            egui::Frame::none()
                .fill(theme.header_background)
                .stroke(egui::Stroke::new(1.0, theme.border))
                .inner_margin(Margin {
                    left: 16.0,
                    right: 16.0,
                    top: 10.0,
                    bottom: 10.0,
                }),
        )
        .show(ctx, |ui| {
            ui.set_height(44.0);
            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                ui.spacing_mut().item_spacing.x = 10.0;
                draw_logo(ui, &theme, props.logo_acronym.as_deref().unwrap_or("VS"));

                ui.vertical(|ui| {
                    ui.strong(
                        RichText::new(&props.title)
                            .color(theme.text_primary)
                            .size(18.0),
                    );
                    if let Some(subtitle) = props.subtitle.as_ref() {
                        ui.small(RichText::new(subtitle).color(theme.text_muted));
                    }
                });

                ui.add_space(12.0);
                ui.separator();
                ui.add_space(16.0);

                if let Some(search_placeholder) = props.search_placeholder {
                    draw_search(ui, model, &theme, &search_placeholder);
                }

                ui.add_space(ui.available_width());
                for action in props.actions.iter() {
                    let mut button = egui::Button::new(
                        match &action.icon {
                            Some(icon) => RichText::new(format!("{} {}", icon, action.label)),
                            None => RichText::new(action.label.clone()),
                        }
                        .color(theme.text_primary),
                    );
                    button = button.min_size(egui::vec2(0.0, 32.0));
                    if !action.enabled {
                        button = button.sense(Sense::hover());
                    }
                    let mut response = ui.add(button);
                    if let Some(shortcut) = &action.shortcut {
                        response = response.on_hover_text(shortcut);
                    }
                    if action.enabled && response.clicked() {
                        model.on_action(&action.id);
                    }
                }
            });
        });
}

fn draw_logo(ui: &mut egui::Ui, theme: &ShellTheme, acronym: &str) {
    let (rect, _) = ui.allocate_exact_size(egui::vec2(32.0, 32.0), Sense::hover());
    let painter = ui.painter_at(rect);

    painter.rect(
        rect,
        Rounding::same(6.0),
        theme.accent_soft,
        egui::Stroke::new(1.5, theme.accent),
    );

    painter.text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        acronym,
        egui::FontId::proportional(14.0),
        theme.text_primary,
    );
}

fn draw_search(
    ui: &mut egui::Ui,
    model: &mut dyn HeaderModel,
    theme: &ShellTheme,
    placeholder: &str,
) {
    let mut query = model.search_value();
    let mut search_rect = egui::Rect::NOTHING;

    egui::Frame::none()
        .fill(theme.surface_background)
        .stroke(egui::Stroke::new(1.0, theme.border))
        .rounding(Rounding::same(12.0))
        .inner_margin(Margin::symmetric(14.0, 10.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width().max(260.0));
            ui.set_height(36.0);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 8.0;
                ui.label(RichText::new("🔍").color(theme.text_muted));
                let response = ui.add_sized(
                    [ui.available_width().max(160.0), 24.0],
                    egui::TextEdit::singleline(&mut query)
                        .hint_text(placeholder)
                        .frame(false),
                );
                if response.changed() {
                    model.set_search_value(query.clone());
                }
                search_rect = response.rect;
            });
        });

    let groups = model.search_palette();
    if groups.is_empty() {
        return;
    }

    let palette_width = search_rect.width().max(320.0);
    let palette_pos = egui::pos2(search_rect.left(), search_rect.bottom() + 6.0);
    let ctx = ui.ctx().clone();

    egui::Area::new(Id::new("shell_header_palette"))
        .order(Order::Foreground)
        .fixed_pos(palette_pos)
        .show(&ctx, |ui| {
            egui::Frame::none()
                .fill(theme.surface_background)
                .stroke(egui::Stroke::new(1.0, theme.border))
                .rounding(Rounding::same(10.0))
                .inner_margin(Margin::symmetric(16.0, 12.0))
                .show(ui, |ui| {
                    ui.set_width(palette_width);
                    egui::ScrollArea::vertical()
                        .max_height(260.0)
                        .show(ui, |ui| {
                            for group in groups {
                                ui.label(
                                    RichText::new(&group.title)
                                        .color(theme.text_primary)
                                        .strong()
                                        .size(12.0),
                                );
                                ui.add_space(6.0);
                                for result in group.results {
                                    let response = egui::Frame::none()
                                        .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 6))
                                        .stroke(egui::Stroke::new(1.0, theme.border))
                                        .rounding(Rounding::same(8.0))
                                        .inner_margin(Margin::symmetric(12.0, 8.0))
                                        .show(ui, |ui| {
                                            ui.vertical(|ui| {
                                                ui.label(
                                                    RichText::new(&result.title)
                                                        .color(theme.text_primary)
                                                        .strong(),
                                                );
                                                ui.label(
                                                    RichText::new(&result.subtitle)
                                                        .color(theme.text_muted)
                                                        .size(11.0),
                                                );
                                                if let Some(hint) = result.action_hint.as_ref() {
                                                    ui.small(
                                                        RichText::new(hint)
                                                            .color(theme.text_muted)
                                                            .italics(),
                                                    );
                                                }
                                            });
                                        })
                                        .response;

                                    let mut response =
                                        ui.interact(response.rect, response.id, Sense::click());
                                    response = response.on_hover_text("Enter para abrir");
                                    if response.clicked() {
                                        model.on_search_result(&result.id);
                                    }
                                    response.context_menu(|ui| {
                                        if ui.button("Seleccionar").clicked() {
                                            model.on_search_result(&result.id);
                                            ui.close_menu();
                                        }
                                    });
                                }
                                ui.add_space(10.0);
                            }
                        });
                });
        });
}
