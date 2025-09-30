use eframe::egui::{self, Color32, Sense, Stroke, Vec2};

use crate::layout::{LayoutConfig, ShellTheme};

/// Tabs system component for managing multiple open editors/views
pub struct TabsProps {
    pub tabs: Vec<Tab>,
    pub active_tab_id: String,
    pub closeable: bool,
    pub show_icons: bool,
}

#[derive(Clone, Debug)]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub modified: bool, // Shows dot indicator for unsaved changes
    pub closeable: bool,
}

impl Tab {
    pub fn new(id: impl Into<String>, title: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            icon: None,
            modified: false,
            closeable: true,
        }
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn modified(mut self, modified: bool) -> Self {
        self.modified = modified;
        self
    }

    pub fn closeable(mut self, closeable: bool) -> Self {
        self.closeable = closeable;
        self
    }
}

pub trait TabsModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> TabsProps;
    fn on_tab_selected(&mut self, tab_id: &str);
    fn on_tab_closed(&mut self, tab_id: &str);
}

pub fn draw_tabs<M: TabsModel>(
    ctx: &egui::Context,
    _layout: &LayoutConfig,
    model: &mut M,
) {
    let theme = model.theme();
    let props = model.props();

    egui::TopBottomPanel::top("tabs_bar")
        .exact_height(35.0)
        .frame(
            egui::Frame::none()
                .fill(theme.panel_background)
                .inner_margin(egui::Margin::same(0.0)),
        )
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing = Vec2::new(0.0, 0.0);

                for tab in &props.tabs {
                    let is_active = tab.id == props.active_tab_id;
                    draw_tab(ui, tab, is_active, &theme, model);
                }
            });
        });
}

fn draw_tab<M: TabsModel>(
    ui: &mut egui::Ui,
    tab: &Tab,
    is_active: bool,
    theme: &ShellTheme,
    model: &mut M,
) {
    let tab_width = 120.0;
    let tab_height = ui.available_height();

    let bg_color = if is_active {
        theme.root_background
    } else {
        theme.panel_background
    };

    let border_color = if is_active {
        theme.primary
    } else {
        theme.border
    };

    let (rect, response) = ui.allocate_exact_size(
        Vec2::new(tab_width, tab_height),
        Sense::click(),
    );

    if response.clicked() {
        model.on_tab_selected(&tab.id);
    }

    // Background
    ui.painter().rect_filled(rect, 0.0, bg_color);

    // Top border for active tab
    if is_active {
        ui.painter().line_segment(
            [rect.left_top(), rect.right_top()],
            Stroke::new(2.0, theme.primary),
        );
    }

    // Right border separator
    ui.painter().line_segment(
        [rect.right_top(), rect.right_bottom()],
        Stroke::new(1.0, border_color),
    );

    // Hover effect
    if response.hovered() && !is_active {
        ui.painter().rect_filled(
            rect,
            0.0,
            Color32::from_black_alpha(10),
        );
    }

    // Content layout
    let mut content_rect = rect.shrink2(Vec2::new(8.0, 0.0));
    
    // Icon
    if let Some(icon) = &tab.icon {
        let icon_rect = egui::Rect::from_min_size(
            content_rect.min,
            Vec2::new(16.0, content_rect.height()),
        );
        ui.painter().text(
            icon_rect.center(),
            egui::Align2::CENTER_CENTER,
            icon,
            egui::FontId::proportional(14.0),
            theme.text_primary,
        );
        content_rect.min.x += 20.0;
    }

    // Close button width reservation
    if tab.closeable {
        content_rect.max.x -= 20.0;
    }

    // Title
    let title_text = if tab.modified {
        format!("● {}", tab.title)
    } else {
        tab.title.clone()
    };

    ui.painter().text(
        content_rect.left_center() + Vec2::new(0.0, 0.0),
        egui::Align2::LEFT_CENTER,
        title_text,
        egui::FontId::proportional(13.0),
        if is_active {
            theme.text_primary
        } else {
            theme.text_weak
        },
    );

    // Close button
    if tab.closeable {
        let close_rect = egui::Rect::from_min_size(
            egui::pos2(rect.max.x - 24.0, rect.min.y),
            Vec2::new(20.0, tab_height),
        );
        
        let close_response = ui.interact(
            close_rect,
            ui.id().with(&tab.id).with("close"),
            Sense::click(),
        );

        if close_response.hovered() {
            ui.painter().circle_filled(
                close_rect.center(),
                8.0,
                Color32::from_white_alpha(30),
            );
        }

        if close_response.clicked() {
            model.on_tab_closed(&tab.id);
        }

        ui.painter().text(
            close_rect.center(),
            egui::Align2::CENTER_CENTER,
            "×",
            egui::FontId::proportional(16.0),
            if close_response.hovered() {
                theme.text_primary
            } else {
                theme.text_weak
            },
        );
    }
}
