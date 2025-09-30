use eframe::egui::{self, Align, Color32, Layout, RichText, Sense, Vec2};

use crate::layout::{LayoutConfig, ShellTheme};

/// Status bar component for displaying contextual information and quick actions
pub struct StatusBarProps {
    pub left_items: Vec<StatusBarItem>,
    pub right_items: Vec<StatusBarItem>,
}

#[derive(Clone, Debug)]
pub struct StatusBarItem {
    pub id: String,
    pub text: String,
    pub icon: Option<String>,
    pub tooltip: Option<String>,
    pub color: Option<Color32>,
    pub background: Option<Color32>,
    pub clickable: bool,
}

impl StatusBarItem {
    pub fn new(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            icon: None,
            tooltip: None,
            color: None,
            background: None,
            clickable: false,
        }
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn with_tooltip(mut self, tooltip: impl Into<String>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }

    pub fn with_color(mut self, color: Color32) -> Self {
        self.color = Some(color);
        self
    }

    pub fn with_background(mut self, bg: Color32) -> Self {
        self.background = Some(bg);
        self
    }

    pub fn clickable(mut self) -> Self {
        self.clickable = true;
        self
    }

    /// Helper: Create an info item (default style)
    pub fn info(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, text)
    }

    /// Helper: Create a success item (green)
    pub fn success(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, text).with_color(Color32::from_rgb(76, 201, 176))
    }

    /// Helper: Create a warning item (yellow/orange)
    pub fn warning(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, text).with_color(Color32::from_rgb(244, 135, 113))
    }

    /// Helper: Create an error item (red)
    pub fn error(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self::new(id, text).with_color(Color32::from_rgb(244, 135, 113))
    }
}

pub trait StatusBarModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> StatusBarProps;
    fn on_item_clicked(&mut self, item_id: &str);
}

pub fn draw_status_bar<M: StatusBarModel>(
    ctx: &egui::Context,
    _layout: &LayoutConfig,
    model: &mut M,
) {
    let theme = model.theme();
    let props = model.props();

    egui::TopBottomPanel::bottom("status_bar")
        .exact_height(22.0)
        .frame(
            egui::Frame::none()
                .fill(theme.panel_background)
                .inner_margin(egui::Margin::symmetric(8.0, 0.0)),
        )
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing = Vec2::new(12.0, 0.0);

                // Left side items
                for item in &props.left_items {
                    draw_status_item(ui, item, &theme, model);
                }

                // Spacer to push right items to the right
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    // Right side items (reversed order due to right-to-left layout)
                    for item in props.right_items.iter().rev() {
                        draw_status_item(ui, item, &theme, model);
                    }
                });
            });
        });
}

fn draw_status_item<M: StatusBarModel>(
    ui: &mut egui::Ui,
    item: &StatusBarItem,
    theme: &ShellTheme,
    model: &mut M,
) {
    let text_color = item.color.unwrap_or(theme.text_weak);
    let bg_color = item.background;

    // Build the display text
    let display_text = if let Some(icon) = &item.icon {
        format!("{} {}", icon, item.text)
    } else {
        item.text.clone()
    };

    let rich_text = RichText::new(display_text)
        .color(text_color)
        .size(12.0);

    // Create the label/button
    let response = if item.clickable {
        let button = egui::Button::new(rich_text)
            .frame(false)
            .fill(bg_color.unwrap_or(Color32::TRANSPARENT));
        
        ui.add(button)
    } else {
        if let Some(bg) = bg_color {
            let (rect, response) = ui.allocate_exact_size(
                Vec2::new(
                    ui.fonts(|f| f.layout_no_wrap(
                        display_text.clone(),
                        egui::FontId::proportional(12.0),
                        text_color,
                    ).size().x) + 12.0,
                    ui.available_height(),
                ),
                Sense::hover(),
            );
            ui.painter().rect_filled(rect, 0.0, bg);
            ui.painter().text(
                rect.left_center() + Vec2::new(6.0, 0.0),
                egui::Align2::LEFT_CENTER,
                display_text,
                egui::FontId::proportional(12.0),
                text_color,
            );
            response
        } else {
            ui.label(rich_text)
        }
    };

    // Handle click
    if response.clicked() && item.clickable {
        model.on_item_clicked(&item.id);
    }

    // Show tooltip if available
    if let Some(tooltip) = &item.tooltip {
        response.on_hover_text(tooltip);
    }

    // Hover effect for clickable items
    if item.clickable && response.hovered() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
}

/// Pre-built status bar item constructors for common use cases

/// Branch indicator (Git)
pub fn branch_item(branch_name: impl Into<String>) -> StatusBarItem {
    StatusBarItem::new("branch", branch_name)
        .with_icon("🔀")
        .with_tooltip("Current branch")
        .clickable()
}

/// Error count indicator
pub fn errors_item(count: usize) -> StatusBarItem {
    StatusBarItem::error("errors", format!("✗ {}", count))
        .with_tooltip(format!("{} error(s)", count))
        .clickable()
}

/// Warning count indicator
pub fn warnings_item(count: usize) -> StatusBarItem {
    StatusBarItem::warning("warnings", format!("⚠ {}", count))
        .with_tooltip(format!("{} warning(s)", count))
        .clickable()
}

/// Line and column position
pub fn position_item(line: usize, column: usize) -> StatusBarItem {
    StatusBarItem::info("position", format!("Ln {}, Col {}", line, column))
        .with_tooltip("Go to Line/Column")
        .clickable()
}

/// File encoding
pub fn encoding_item(encoding: impl Into<String>) -> StatusBarItem {
    StatusBarItem::info("encoding", encoding)
        .with_tooltip("Select Encoding")
        .clickable()
}

/// End of line sequence
pub fn eol_item(eol: impl Into<String>) -> StatusBarItem {
    StatusBarItem::info("eol", eol)
        .with_tooltip("Select End of Line Sequence")
        .clickable()
}

/// Language mode
pub fn language_item(language: impl Into<String>) -> StatusBarItem {
    StatusBarItem::info("language", language)
        .with_tooltip("Select Language Mode")
        .clickable()
}

/// Notifications count
pub fn notifications_item(count: usize) -> StatusBarItem {
    StatusBarItem::info("notifications", format!("🔔 {}", count))
        .with_tooltip("Notifications")
        .clickable()
}
