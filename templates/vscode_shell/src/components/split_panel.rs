use eframe::egui::{self, CursorIcon, Id, Rect, Response, Sense, Stroke, Ui, Vec2};
use serde::{Deserialize, Serialize};

use crate::layout::{LayoutConfig, ShellTheme};

/// Split panel system for dividing workspace into multiple panes
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SplitPanelState {
    pub root: PanelNode,
}

impl Default for SplitPanelState {
    fn default() -> Self {
        Self {
            root: PanelNode::Leaf(PanelLeaf {
                id: "main".to_string(),
                content_id: "default".to_string(),
            }),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PanelNode {
    Leaf(PanelLeaf),
    Split(Box<PanelSplit>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PanelLeaf {
    pub id: String,
    pub content_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PanelSplit {
    pub id: String,
    pub direction: SplitDirection,
    pub ratio: f32, // 0.0 to 1.0, represents position of divider
    pub left: PanelNode,
    pub right: PanelNode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SplitDirection {
    Horizontal, // Left | Right
    Vertical,   // Top | Bottom
}

impl SplitPanelState {
    pub fn new(content_id: impl Into<String>) -> Self {
        Self {
            root: PanelNode::Leaf(PanelLeaf {
                id: "main".to_string(),
                content_id: content_id.into(),
            }),
        }
    }

    /// Split a panel horizontally (left | right)
    pub fn split_horizontal(&mut self, panel_id: &str, left_content: String, right_content: String, ratio: f32) -> bool {
        Self::split_node(&mut self.root, panel_id, SplitDirection::Horizontal, left_content, right_content, ratio)
    }

    /// Split a panel vertically (top / bottom)
    pub fn split_vertical(&mut self, panel_id: &str, top_content: String, bottom_content: String, ratio: f32) -> bool {
        Self::split_node(&mut self.root, panel_id, SplitDirection::Vertical, top_content, bottom_content, ratio)
    }

    /// Remove a split, keeping only one side
    pub fn remove_split(&mut self, split_id: &str, keep_left: bool) -> bool {
        Self::remove_split_node(&mut self.root, split_id, keep_left)
    }

    fn split_node(
        node: &mut PanelNode,
        target_id: &str,
        direction: SplitDirection,
        left_content: String,
        right_content: String,
        ratio: f32,
    ) -> bool {
        match node {
            PanelNode::Leaf(leaf) => {
                if leaf.id == target_id {
                    let split_id = format!("split_{}", uuid::Uuid::new_v4().to_string());
                    *node = PanelNode::Split(Box::new(PanelSplit {
                        id: split_id,
                        direction,
                        ratio: ratio.clamp(0.1, 0.9),
                        left: PanelNode::Leaf(PanelLeaf {
                            id: format!("panel_{}_l", uuid::Uuid::new_v4().to_string()),
                            content_id: left_content,
                        }),
                        right: PanelNode::Leaf(PanelLeaf {
                            id: format!("panel_{}_r", uuid::Uuid::new_v4().to_string()),
                            content_id: right_content,
                        }),
                    }));
                    true
                } else {
                    false
                }
            }
            PanelNode::Split(split) => {
                Self::split_node(&mut split.left, target_id, direction, left_content.clone(), right_content.clone(), ratio)
                    || Self::split_node(&mut split.right, target_id, direction, left_content, right_content, ratio)
            }
        }
    }

    fn remove_split_node(node: &mut PanelNode, split_id: &str, keep_left: bool) -> bool {
        match node {
            PanelNode::Split(split) => {
                if split.id == split_id {
                    *node = if keep_left {
                        split.left.clone()
                    } else {
                        split.right.clone()
                    };
                    true
                } else {
                    Self::remove_split_node(&mut split.left, split_id, keep_left)
                        || Self::remove_split_node(&mut split.right, split_id, keep_left)
                }
            }
            PanelNode::Leaf(_) => false,
        }
    }

    /// Find a panel leaf by ID
    pub fn find_panel(&self, panel_id: &str) -> Option<&PanelLeaf> {
        Self::find_panel_in_node(&self.root, panel_id)
    }

    fn find_panel_in_node(node: &PanelNode, panel_id: &str) -> Option<&PanelLeaf> {
        match node {
            PanelNode::Leaf(leaf) => {
                if leaf.id == panel_id {
                    Some(leaf)
                } else {
                    None
                }
            }
            PanelNode::Split(split) => {
                Self::find_panel_in_node(&split.left, panel_id)
                    .or_else(|| Self::find_panel_in_node(&split.right, panel_id))
            }
        }
    }
}

pub trait SplitPanelModel {
    fn theme(&self) -> ShellTheme;
    fn state(&self) -> &SplitPanelState;
    fn state_mut(&mut self) -> &mut SplitPanelState;
    fn draw_panel_content(&mut self, ui: &mut Ui, panel: &PanelLeaf);
}

pub fn draw_split_panel<M: SplitPanelModel>(
    ui: &mut Ui,
    _layout: &LayoutConfig,
    model: &mut M,
) {
    let theme = model.theme();
    let state = model.state().clone();
    
    draw_panel_node(ui, &state.root, &theme, model);
}

fn draw_panel_node<M: SplitPanelModel>(
    ui: &mut Ui,
    node: &PanelNode,
    theme: &ShellTheme,
    model: &mut M,
) {
    match node {
        PanelNode::Leaf(leaf) => {
            model.draw_panel_content(ui, leaf);
        }
        PanelNode::Split(split) => {
            let available_rect = ui.available_rect_before_wrap();
            let divider_thickness = 4.0;
            
            match split.direction {
                SplitDirection::Horizontal => {
                    let total_width = available_rect.width();
                    let split_pos = (total_width * split.ratio).round();
                    
                    // Left panel
                    let left_rect = Rect::from_min_size(
                        available_rect.min,
                        Vec2::new(split_pos - divider_thickness / 2.0, available_rect.height()),
                    );
                    
                    // Right panel
                    let right_rect = Rect::from_min_size(
                        available_rect.min + Vec2::new(split_pos + divider_thickness / 2.0, 0.0),
                        Vec2::new(total_width - split_pos - divider_thickness / 2.0, available_rect.height()),
                    );
                    
                    // Divider
                    let divider_rect = Rect::from_min_size(
                        available_rect.min + Vec2::new(split_pos - divider_thickness / 2.0, 0.0),
                        Vec2::new(divider_thickness, available_rect.height()),
                    );
                    
                    // Draw left
                    ui.allocate_ui_at_rect(left_rect, |ui| {
                        draw_panel_node(ui, &split.left, theme, model);
                    });
                    
                    // Draw divider
                    draw_resizable_divider(ui, divider_rect, true, theme, &split.id, model);
                    
                    // Draw right
                    ui.allocate_ui_at_rect(right_rect, |ui| {
                        draw_panel_node(ui, &split.right, theme, model);
                    });
                }
                SplitDirection::Vertical => {
                    let total_height = available_rect.height();
                    let split_pos = (total_height * split.ratio).round();
                    
                    // Top panel
                    let top_rect = Rect::from_min_size(
                        available_rect.min,
                        Vec2::new(available_rect.width(), split_pos - divider_thickness / 2.0),
                    );
                    
                    // Bottom panel
                    let bottom_rect = Rect::from_min_size(
                        available_rect.min + Vec2::new(0.0, split_pos + divider_thickness / 2.0),
                        Vec2::new(available_rect.width(), total_height - split_pos - divider_thickness / 2.0),
                    );
                    
                    // Divider
                    let divider_rect = Rect::from_min_size(
                        available_rect.min + Vec2::new(0.0, split_pos - divider_thickness / 2.0),
                        Vec2::new(available_rect.width(), divider_thickness),
                    );
                    
                    // Draw top
                    ui.allocate_ui_at_rect(top_rect, |ui| {
                        draw_panel_node(ui, &split.left, theme, model);
                    });
                    
                    // Draw divider
                    draw_resizable_divider(ui, divider_rect, false, theme, &split.id, model);
                    
                    // Draw bottom
                    ui.allocate_ui_at_rect(bottom_rect, |ui| {
                        draw_panel_node(ui, &split.right, theme, model);
                    });
                }
            }
        }
    }
}

fn draw_resizable_divider<M: SplitPanelModel>(
    ui: &mut Ui,
    rect: Rect,
    is_horizontal: bool,
    theme: &ShellTheme,
    split_id: &str,
    model: &mut M,
) {
    let response = ui.interact(
        rect,
        Id::new(format!("divider_{}", split_id)),
        Sense::click_and_drag(),
    );
    
    // Visual feedback
    let color = if response.hovered() || response.dragged() {
        theme.primary
    } else {
        theme.border
    };
    
    ui.painter().rect_filled(rect, 0.0, color);
    
    // Cursor
    if response.hovered() || response.dragged() {
        ui.ctx().set_cursor_icon(if is_horizontal {
            CursorIcon::ResizeHorizontal
        } else {
            CursorIcon::ResizeVertical
        });
    }
    
    // Handle dragging
    if response.dragged() {
        let drag_delta = response.drag_delta();
        let state = model.state_mut();
        
        if let Some(split) = find_split_mut(&mut state.root, split_id) {
            match split.direction {
                SplitDirection::Horizontal => {
                    let parent_width = ui.available_width();
                    let delta_ratio = drag_delta.x / parent_width;
                    split.ratio = (split.ratio + delta_ratio).clamp(0.1, 0.9);
                }
                SplitDirection::Vertical => {
                    let parent_height = ui.available_height();
                    let delta_ratio = drag_delta.y / parent_height;
                    split.ratio = (split.ratio + delta_ratio).clamp(0.1, 0.9);
                }
            }
        }
    }
}

fn find_split_mut(node: &mut PanelNode, split_id: &str) -> Option<&mut PanelSplit> {
    match node {
        PanelNode::Split(split) => {
            if split.id == split_id {
                Some(split)
            } else {
                find_split_mut(&mut split.left, split_id)
                    .or_else(|| find_split_mut(&mut split.right, split_id))
            }
        }
        PanelNode::Leaf(_) => None,
    }
}

// Note: This component requires the uuid crate
// Add to Cargo.toml: uuid = { version = "1.0", features = ["v4", "serde"] }
