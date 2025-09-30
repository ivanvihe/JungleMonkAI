use eframe::egui::{self, Align, Color32, Key, Layout, RichText, ScrollArea, Stroke, TextEdit, Vec2};
use std::cmp::Ordering;

use crate::layout::{LayoutConfig, ShellTheme};

/// Command Palette component with fuzzy search
pub struct CommandPaletteProps {
    pub placeholder: String,
    pub commands: Vec<Command>,
    pub recent_commands: Vec<String>,
    pub show_icons: bool,
    pub show_keybindings: bool,
    pub max_results: usize,
}

impl Default for CommandPaletteProps {
    fn default() -> Self {
        Self {
            placeholder: "Type a command or search...".to_string(),
            commands: Vec::new(),
            recent_commands: Vec::new(),
            show_icons: true,
            show_keybindings: true,
            max_results: 50,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Command {
    pub id: String,
    pub title: String,
    pub category: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub keybinding: Option<String>,
    pub keywords: Vec<String>,
}

impl Command {
    pub fn new(id: impl Into<String>, title: impl Into<String>, category: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            category: category.into(),
            description: None,
            icon: None,
            keybinding: None,
            keywords: Vec::new(),
        }
    }

    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = Some(desc.into());
        self
    }

    pub fn with_icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = Some(icon.into());
        self
    }

    pub fn with_keybinding(mut self, kb: impl Into<String>) -> Self {
        self.keybinding = Some(kb.into());
        self
    }

    pub fn with_keywords(mut self, keywords: Vec<String>) -> Self {
        self.keywords = keywords;
        self
    }
}

#[derive(Clone, Debug)]
struct ScoredCommand {
    command: Command,
    score: i32,
    match_positions: Vec<usize>,
}

pub trait CommandPaletteModel {
    fn theme(&self) -> ShellTheme;
    fn props(&self) -> CommandPaletteProps;
    fn query(&self) -> &str;
    fn set_query(&mut self, query: String);
    fn selected_index(&self) -> usize;
    fn set_selected_index(&mut self, index: usize);
    fn on_command_selected(&mut self, command_id: &str);
    fn on_palette_closed(&mut self);
}

pub fn draw_command_palette<M: CommandPaletteModel>(
    ctx: &egui::Context,
    _layout: &LayoutConfig,
    model: &mut M,
) {
    let theme = model.theme();
    let props = model.props();
    
    // Modal overlay
    egui::Area::new(egui::Id::new("command_palette_overlay"))
        .fixed_pos(egui::pos2(0.0, 0.0))
        .show(ctx, |ui| {
            let screen_rect = ctx.screen_rect();
            
            // Semi-transparent background
            ui.painter().rect_filled(
                screen_rect,
                0.0,
                Color32::from_black_alpha(128),
            );
            
            // Close on click outside (handle in parent)
            if ui.input(|i| i.key_pressed(Key::Escape)) {
                model.on_palette_closed();
            }
        });
    
    // Command palette window
    egui::Window::new("command_palette")
        .title_bar(false)
        .resizable(false)
        .fixed_size(Vec2::new(600.0, 400.0))
        .anchor(egui::Align2::CENTER_TOP, Vec2::new(0.0, 100.0))
        .frame(egui::Frame::none()
            .fill(theme.panel_background)
            .stroke(Stroke::new(1.0, theme.border))
            .rounding(6.0)
            .shadow(egui::epaint::Shadow {
                offset: Vec2::new(0.0, 8.0),
                blur: 24.0,
                spread: 0.0,
                color: Color32::from_black_alpha(96),
            })
        )
        .show(ctx, |ui| {
            ui.vertical(|ui| {
                // Search input
                draw_search_input(ui, &theme, &props, model);
                
                ui.add_space(4.0);
                
                // Results
                draw_results(ui, &theme, &props, model);
            });
        });
}

fn draw_search_input<M: CommandPaletteModel>(
    ui: &mut egui::Ui,
    theme: &ShellTheme,
    props: &CommandPaletteProps,
    model: &mut M,
) {
    ui.horizontal(|ui| {
        ui.add_space(12.0);
        
        // Search icon
        ui.label(RichText::new("🔍").size(16.0));
        
        // Input field
        let mut query = model.query().to_string();
        let response = ui.add(
            TextEdit::singleline(&mut query)
                .desired_width(ui.available_width() - 12.0)
                .hint_text(&props.placeholder)
                .frame(false)
                .text_color(theme.text_primary)
        );
        
        if response.changed() {
            model.set_query(query);
            model.set_selected_index(0);
        }
        
        // Auto-focus on first frame
        if ui.input(|i| i.key_pressed(Key::Escape)) {
            model.on_palette_closed();
        }
        
        // Request focus
        response.request_focus();
        
        ui.add_space(12.0);
    });
    
    // Separator
    ui.painter().hline(
        ui.max_rect().x_range(),
        ui.cursor().y + 8.0,
        Stroke::new(1.0, theme.border),
    );
}

fn draw_results<M: CommandPaletteModel>(
    ui: &mut egui::Ui,
    theme: &ShellTheme,
    props: &CommandPaletteProps,
    model: &mut M,
) {
    let query = model.query();
    let selected_index = model.selected_index();
    
    // Filter and score commands
    let mut scored_commands = if query.is_empty() {
        // Show recent commands
        props.recent_commands.iter()
            .filter_map(|cmd_id| {
                props.commands.iter()
                    .find(|c| &c.id == cmd_id)
                    .map(|c| ScoredCommand {
                        command: c.clone(),
                        score: 1000, // High score for recent
                        match_positions: Vec::new(),
                    })
            })
            .collect::<Vec<_>>()
    } else {
        // Fuzzy search
        props.commands.iter()
            .filter_map(|cmd| {
                fuzzy_match(query, cmd).map(|(score, positions)| {
                    ScoredCommand {
                        command: cmd.clone(),
                        score,
                        match_positions: positions,
                    }
                })
            })
            .collect::<Vec<_>>()
    };
    
    // Sort by score (higher is better)
    scored_commands.sort_by(|a, b| b.score.cmp(&a.score));
    
    // Limit results
    scored_commands.truncate(props.max_results);
    
    // Handle keyboard navigation
    let total_results = scored_commands.len();
    if ui.input(|i| i.key_pressed(Key::ArrowDown)) {
        model.set_selected_index((selected_index + 1).min(total_results.saturating_sub(1)));
    }
    if ui.input(|i| i.key_pressed(Key::ArrowUp)) {
        model.set_selected_index(selected_index.saturating_sub(1));
    }
    if ui.input(|i| i.key_pressed(Key::Enter)) {
        if let Some(cmd) = scored_commands.get(selected_index) {
            model.on_command_selected(&cmd.command.id);
        }
    }
    
    // Results list
    ScrollArea::vertical()
        .max_height(320.0)
        .show(ui, |ui| {
            if scored_commands.is_empty() {
                ui.vertical_centered(|ui| {
                    ui.add_space(40.0);
                    ui.label(RichText::new("No commands found").color(theme.text_weak));
                });
            } else {
                for (index, scored_cmd) in scored_commands.iter().enumerate() {
                    draw_command_item(ui, scored_cmd, index == selected_index, theme, props, model);
                }
            }
        });
}

fn draw_command_item<M: CommandPaletteModel>(
    ui: &mut egui::Ui,
    scored_cmd: &ScoredCommand,
    is_selected: bool,
    theme: &ShellTheme,
    props: &CommandPaletteProps,
    model: &mut M,
) {
    let cmd = &scored_cmd.command;
    let item_height = 40.0;
    
    let (rect, response) = ui.allocate_exact_size(
        Vec2::new(ui.available_width(), item_height),
        egui::Sense::click(),
    );
    
    // Background
    if is_selected {
        ui.painter().rect_filled(rect, 2.0, theme.active_background);
    } else if response.hovered() {
        ui.painter().rect_filled(rect, 2.0, Color32::from_white_alpha(10));
    }
    
    // Content
    ui.allocate_ui_at_rect(rect, |ui| {
        ui.horizontal(|ui| {
            ui.add_space(12.0);
            
            // Icon
            if props.show_icons {
                if let Some(icon) = &cmd.icon {
                    ui.label(RichText::new(icon).size(16.0));
                } else {
                    ui.label(RichText::new("▶").size(12.0).color(theme.text_weak));
                }
            }
            
            ui.add_space(8.0);
            
            // Text content
            ui.vertical(|ui| {
                ui.add_space(6.0);
                
                // Title with highlighting
                let title_text = if scored_cmd.match_positions.is_empty() {
                    RichText::new(&cmd.title).color(theme.text_primary)
                } else {
                    // TODO: Implement character-level highlighting
                    RichText::new(&cmd.title).color(theme.text_primary)
                };
                ui.label(title_text);
                
                // Category and description
                let subtitle = if let Some(desc) = &cmd.description {
                    format!("{} • {}", cmd.category, desc)
                } else {
                    cmd.category.clone()
                };
                ui.label(RichText::new(subtitle).size(11.0).color(theme.text_weak));
            });
            
            // Keybinding
            if props.show_keybindings {
                if let Some(kb) = &cmd.keybinding {
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.add_space(12.0);
                        ui.label(
                            RichText::new(kb)
                                .size(11.0)
                                .color(theme.text_weak)
                        );
                    });
                }
            }
        });
    });
    
    if response.clicked() {
        model.on_command_selected(&cmd.id);
    }
}

/// Fuzzy matching algorithm
/// Returns (score, match_positions) if matched, None otherwise
fn fuzzy_match(query: &str, command: &Command) -> Option<(i32, Vec<usize>)> {
    let query_lower = query.to_lowercase();
    let searchable = format!(
        "{} {} {} {}",
        command.title.to_lowercase(),
        command.category.to_lowercase(),
        command.description.as_deref().unwrap_or(""),
        command.keywords.join(" ")
    );
    
    // Simple scoring algorithm
    let mut score = 0;
    let mut last_match_index = 0;
    let mut match_positions = Vec::new();
    let mut consecutive_matches = 0;
    
    for (query_idx, query_char) in query_lower.chars().enumerate() {
        if let Some(found_idx) = searchable[last_match_index..].find(query_char) {
            let absolute_idx = last_match_index + found_idx;
            match_positions.push(absolute_idx);
            
            // Scoring logic
            score += 100; // Base score for match
            
            // Bonus for consecutive matches
            if query_idx > 0 && absolute_idx == last_match_index + 1 {
                consecutive_matches += 1;
                score += consecutive_matches * 50;
            } else {
                consecutive_matches = 0;
            }
            
            // Bonus for start of word
            if absolute_idx == 0 || searchable.chars().nth(absolute_idx - 1) == Some(' ') {
                score += 30;
            }
            
            // Bonus for title match
            if absolute_idx < command.title.len() {
                score += 50;
            }
            
            last_match_index = absolute_idx + 1;
        } else {
            return None; // Character not found, no match
        }
    }
    
    // Penalty for gaps
    score -= (last_match_index - query.len()) as i32 * 2;
    
    Some((score, match_positions))
}
