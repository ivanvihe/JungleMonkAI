use eframe::egui::{self, Color32, Response, RichText, Sense, Vec2};
use std::collections::HashSet;

use crate::layout::{LayoutConfig, ShellTheme};

/// Tree view component for hierarchical file/resource exploration
pub struct TreeViewProps {
    pub root_nodes: Vec<TreeNode>,
    pub show_icons: bool,
    pub allow_multiselect: bool,
    pub indent_per_level: f32,
}

impl Default for TreeViewProps {
    fn default() -> Self {
        Self {
            root_nodes: Vec::new(),
            show_icons: true,
            allow_multiselect: false,
            indent_per_level: 16.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct TreeNode {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub children: Vec<TreeNode>,
    pub expanded: bool,
    pub selected: bool,
    pub node_type: TreeNodeType,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TreeNodeType {
    File,
    Folder,
    Custom,
}

impl TreeNode {
    pub fn new(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            icon: None,
            children: Vec::new(),
            expanded: false,
            selected: false,
            node_type: TreeNodeType::File,
        }
    }

    pub fn folder(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            node_type: TreeNodeType::Folder,
            ..Self::new(id, label)
        }
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn with_children(mut self, children: Vec<TreeNode>) -> Self {
        self.children = children;
        self
    }

    pub fn expanded(mut self, expanded: bool) -> Self {
        self.expanded = expanded;
        self
    }

    pub fn selected(mut self, selected: bool) -> Self {
        self.selected = selected;
        self
    }

    pub fn is_folder(&self) -> bool {
        self.node_type == TreeNodeType::Folder || !self.children.is_empty()
    }
}

pub trait TreeViewModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> TreeViewProps;
    fn on_node_clicked(&mut self, node_id: &str);
    fn on_node_double_clicked(&mut self, node_id: &str);
    fn on_node_expanded(&mut self, node_id: &str, expanded: bool);
}

pub fn draw_tree_view<M: TreeViewModel>(
    ui: &mut egui::Ui,
    _layout: &LayoutConfig,
    model: &mut M,
) {
    let theme = model.theme();
    let props = model.props();

    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            for node in &props.root_nodes {
                draw_tree_node(ui, node, 0, &props, &theme, model);
            }
        });
}

fn draw_tree_node<M: TreeViewModel>(
    ui: &mut egui::Ui,
    node: &TreeNode,
    depth: usize,
    props: &TreeViewProps,
    theme: &ShellTheme,
    model: &mut M,
) {
    let indent = depth as f32 * props.indent_per_level;
    let is_folder = node.is_folder();
    
    ui.horizontal(|ui| {
        // Indent
        ui.add_space(indent);

        // Expand/collapse arrow for folders
        if is_folder {
            let arrow = if node.expanded { "▼" } else { "▶" };
            let arrow_response = ui.add(
                egui::Label::new(
                    RichText::new(arrow)
                        .size(10.0)
                        .color(theme.text_weak)
                )
                .sense(Sense::click())
            );

            if arrow_response.clicked() {
                model.on_node_expanded(&node.id, !node.expanded);
            }
        } else {
            // Empty space for alignment
            ui.add_space(14.0);
        }

        // Icon
        if props.show_icons {
            let icon = node.icon.as_deref().unwrap_or(
                if is_folder {
                    if node.expanded { "📂" } else { "📁" }
                } else {
                    "📄"
                }
            );
            ui.label(RichText::new(icon).size(14.0));
        }

        // Label
        let label_text = RichText::new(&node.label)
            .size(13.0)
            .color(if node.selected {
                theme.text_primary
            } else {
                theme.text_weak
            });

        let (rect, response) = ui.allocate_exact_size(
            Vec2::new(
                ui.available_width().max(100.0),
                18.0,
            ),
            Sense::click(),
        );

        // Background for selected item
        if node.selected {
            ui.painter().rect_filled(
                rect,
                2.0,
                theme.active_background,
            );
        } else if response.hovered() {
            ui.painter().rect_filled(
                rect,
                2.0,
                Color32::from_white_alpha(10),
            );
        }

        // Draw label text
        ui.painter().text(
            rect.left_center() + Vec2::new(4.0, 0.0),
            egui::Align2::LEFT_CENTER,
            &node.label,
            egui::FontId::proportional(13.0),
            if node.selected {
                theme.text_primary
            } else {
                theme.text_weak
            },
        );

        // Handle clicks
        if response.clicked() {
            model.on_node_clicked(&node.id);
        }

        if response.double_clicked() {
            model.on_node_double_clicked(&node.id);
            
            // Auto-expand folders on double-click
            if is_folder && !node.expanded {
                model.on_node_expanded(&node.id, true);
            }
        }

        // Context menu
        response.context_menu(|ui| {
            if ui.button("Rename").clicked() {
                ui.close_menu();
            }
            if ui.button("Delete").clicked() {
                ui.close_menu();
            }
            ui.separator();
            if is_folder {
                if ui.button("New File").clicked() {
                    ui.close_menu();
                }
                if ui.button("New Folder").clicked() {
                    ui.close_menu();
                }
            }
        });
    });

    // Draw children if expanded
    if is_folder && node.expanded {
        for child in &node.children {
            draw_tree_node(ui, child, depth + 1, props, theme, model);
        }
    }
}

/// Helper: Build a tree from file paths
pub fn tree_from_paths(paths: &[String]) -> Vec<TreeNode> {
    let mut root_nodes: Vec<TreeNode> = Vec::new();
    let mut folder_map: std::collections::HashMap<String, Vec<TreeNode>> = std::collections::HashMap::new();

    for path in paths {
        let parts: Vec<&str> = path.split('/').collect();
        
        for (i, part) in parts.iter().enumerate() {
            let current_path = parts[..=i].join("/");
            let is_file = i == parts.len() - 1;
            
            if is_file {
                let node = TreeNode::new(current_path.clone(), part.to_string());
                
                if i == 0 {
                    root_nodes.push(node);
                } else {
                    let parent_path = parts[..i].join("/");
                    folder_map.entry(parent_path).or_default().push(node);
                }
            } else {
                // Folder
                if !folder_map.contains_key(&current_path) {
                    folder_map.insert(current_path.clone(), Vec::new());
                }
            }
        }
    }

    // Assemble tree structure
    fn build_tree(
        path: &str,
        parts: &[&str],
        folder_map: &std::collections::HashMap<String, Vec<TreeNode>>,
    ) -> Vec<TreeNode> {
        folder_map.get(path).cloned().unwrap_or_default()
            .into_iter()
            .map(|mut node| {
                if node.is_folder() {
                    let children = build_tree(&node.id, &[], folder_map);
                    node.children = children;
                }
                node
            })
            .collect()
    }

    root_nodes
}

/// Helper: Flatten tree to get all node IDs
pub fn collect_all_ids(nodes: &[TreeNode]) -> HashSet<String> {
    let mut ids = HashSet::new();
    
    fn collect(node: &TreeNode, ids: &mut HashSet<String>) {
        ids.insert(node.id.clone());
        for child in &node.children {
            collect(child, ids);
        }
    }
    
    for node in nodes {
        collect(node, &mut ids);
    }
    
    ids
}

/// Helper: Find a node by ID
pub fn find_node_mut<'a>(nodes: &'a mut [TreeNode], id: &str) -> Option<&'a mut TreeNode> {
    for node in nodes {
        if node.id == id {
            return Some(node);
        }
        if let Some(found) = find_node_mut(&mut node.children, id) {
            return Some(found);
        }
    }
    None
}
