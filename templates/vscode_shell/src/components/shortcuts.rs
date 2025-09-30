use eframe::egui::{self, Key, Modifiers};
use std::collections::HashMap;

/// Keyboard shortcut system for managing key bindings
#[derive(Clone, Debug)]
pub struct ShortcutManager {
    shortcuts: HashMap<String, Shortcut>,
    enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shortcut {
    pub id: String,
    pub key: Key,
    pub modifiers: ShortcutModifiers,
    pub description: String,
    pub category: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ShortcutModifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub command: bool, // Meta key on Mac
}

impl ShortcutModifiers {
    pub fn ctrl() -> Self {
        Self { ctrl: true, ..Default::default() }
    }

    pub fn ctrl_shift() -> Self {
        Self { ctrl: true, shift: true, ..Default::default() }
    }

    pub fn ctrl_alt() -> Self {
        Self { ctrl: true, alt: true, ..Default::default() }
    }

    pub fn alt() -> Self {
        Self { alt: true, ..Default::default() }
    }

    pub fn shift() -> Self {
        Self { shift: true, ..Default::default() }
    }

    pub fn matches(&self, mods: &Modifiers) -> bool {
        self.ctrl == mods.ctrl
            && self.shift == mods.shift
            && self.alt == mods.alt
            && self.command == mods.mac_cmd
    }

    pub fn to_string(&self) -> String {
        let mut parts = Vec::new();
        
        if self.ctrl || self.command {
            parts.push("Ctrl");
        }
        if self.shift {
            parts.push("Shift");
        }
        if self.alt {
            parts.push("Alt");
        }
        
        parts.join("+")
    }
}

impl Shortcut {
    pub fn new(
        id: impl Into<String>,
        key: Key,
        modifiers: ShortcutModifiers,
        description: impl Into<String>,
        category: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            key,
            modifiers,
            description: description.into(),
            category: category.into(),
        }
    }

    pub fn to_string(&self) -> String {
        let mods = self.modifiers.to_string();
        let key_name = format!("{:?}", self.key);
        
        if mods.is_empty() {
            key_name
        } else {
            format!("{}+{}", mods, key_name)
        }
    }

    /// Check if this shortcut matches the current input state
    pub fn matches(&self, ctx: &egui::Context) -> bool {
        ctx.input(|i| {
            i.key_pressed(self.key) && self.modifiers.matches(&i.modifiers)
        })
    }
}

impl Default for ShortcutManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ShortcutManager {
    pub fn new() -> Self {
        Self {
            shortcuts: HashMap::new(),
            enabled: true,
        }
    }

    /// Add a shortcut to the manager
    pub fn add(&mut self, shortcut: Shortcut) {
        self.shortcuts.insert(shortcut.id.clone(), shortcut);
    }

    /// Add multiple shortcuts at once
    pub fn add_many(&mut self, shortcuts: impl IntoIterator<Item = Shortcut>) {
        for shortcut in shortcuts {
            self.add(shortcut);
        }
    }

    /// Remove a shortcut by ID
    pub fn remove(&mut self, id: &str) {
        self.shortcuts.remove(id);
    }

    /// Check if a shortcut is pressed and return its ID
    pub fn check(&self, ctx: &egui::Context) -> Option<String> {
        if !self.enabled {
            return None;
        }

        for shortcut in self.shortcuts.values() {
            if shortcut.matches(ctx) {
                return Some(shortcut.id.clone());
            }
        }

        None
    }

    /// Check multiple shortcuts and return all that are pressed
    pub fn check_all(&self, ctx: &egui::Context) -> Vec<String> {
        if !self.enabled {
            return Vec::new();
        }

        self.shortcuts
            .values()
            .filter(|s| s.matches(ctx))
            .map(|s| s.id.clone())
            .collect()
    }

    /// Get a shortcut by ID
    pub fn get(&self, id: &str) -> Option<&Shortcut> {
        self.shortcuts.get(id)
    }

    /// Get all shortcuts
    pub fn all(&self) -> Vec<&Shortcut> {
        self.shortcuts.values().collect()
    }

    /// Get shortcuts by category
    pub fn by_category(&self, category: &str) -> Vec<&Shortcut> {
        self.shortcuts
            .values()
            .filter(|s| s.category == category)
            .collect()
    }

    /// Get all categories
    pub fn categories(&self) -> Vec<String> {
        let mut cats: Vec<_> = self
            .shortcuts
            .values()
            .map(|s| s.category.clone())
            .collect();
        cats.sort();
        cats.dedup();
        cats
    }

    /// Enable or disable the shortcut system
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Check if shortcuts are enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Clear all shortcuts
    pub fn clear(&mut self) {
        self.shortcuts.clear();
    }
}

/// Helper functions for common shortcuts
pub mod presets {
    use super::*;

    pub fn file_shortcuts() -> Vec<Shortcut> {
        vec![
            Shortcut::new(
                "file.new",
                Key::N,
                ShortcutModifiers::ctrl(),
                "New File",
                "File",
            ),
            Shortcut::new(
                "file.open",
                Key::O,
                ShortcutModifiers::ctrl(),
                "Open File",
                "File",
            ),
            Shortcut::new(
                "file.save",
                Key::S,
                ShortcutModifiers::ctrl(),
                "Save File",
                "File",
            ),
            Shortcut::new(
                "file.save_as",
                Key::S,
                ShortcutModifiers::ctrl_shift(),
                "Save As",
                "File",
            ),
            Shortcut::new(
                "file.close",
                Key::W,
                ShortcutModifiers::ctrl(),
                "Close File",
                "File",
            ),
        ]
    }

    pub fn edit_shortcuts() -> Vec<Shortcut> {
        vec![
            Shortcut::new(
                "edit.undo",
                Key::Z,
                ShortcutModifiers::ctrl(),
                "Undo",
                "Edit",
            ),
            Shortcut::new(
                "edit.redo",
                Key::Y,
                ShortcutModifiers::ctrl(),
                "Redo",
                "Edit",
            ),
            Shortcut::new(
                "edit.cut",
                Key::X,
                ShortcutModifiers::ctrl(),
                "Cut",
                "Edit",
            ),
            Shortcut::new(
                "edit.copy",
                Key::C,
                ShortcutModifiers::ctrl(),
                "Copy",
                "Edit",
            ),
            Shortcut::new(
                "edit.paste",
                Key::V,
                ShortcutModifiers::ctrl(),
                "Paste",
                "Edit",
            ),
            Shortcut::new(
                "edit.find",
                Key::F,
                ShortcutModifiers::ctrl(),
                "Find",
                "Edit",
            ),
            Shortcut::new(
                "edit.replace",
                Key::H,
                ShortcutModifiers::ctrl(),
                "Replace",
                "Edit",
            ),
        ]
    }

    pub fn view_shortcuts() -> Vec<Shortcut> {
        vec![
            Shortcut::new(
                "view.command_palette",
                Key::P,
                ShortcutModifiers::ctrl_shift(),
                "Command Palette",
                "View",
            ),
            Shortcut::new(
                "view.toggle_sidebar",
                Key::B,
                ShortcutModifiers::ctrl(),
                "Toggle Sidebar",
                "View",
            ),
            Shortcut::new(
                "view.toggle_terminal",
                Key::J,
                ShortcutModifiers::ctrl(),
                "Toggle Terminal",
                "View",
            ),
            Shortcut::new(
                "view.zoom_in",
                Key::Equals,
                ShortcutModifiers::ctrl(),
                "Zoom In",
                "View",
            ),
            Shortcut::new(
                "view.zoom_out",
                Key::Minus,
                ShortcutModifiers::ctrl(),
                "Zoom Out",
                "View",
            ),
        ]
    }

    pub fn navigation_shortcuts() -> Vec<Shortcut> {
        vec![
            Shortcut::new(
                "nav.go_to_file",
                Key::P,
                ShortcutModifiers::ctrl(),
                "Go to File",
                "Navigation",
            ),
            Shortcut::new(
                "nav.go_to_line",
                Key::G,
                ShortcutModifiers::ctrl(),
                "Go to Line",
                "Navigation",
            ),
            Shortcut::new(
                "nav.next_tab",
                Key::Tab,
                ShortcutModifiers::ctrl(),
                "Next Tab",
                "Navigation",
            ),
            Shortcut::new(
                "nav.prev_tab",
                Key::Tab,
                ShortcutModifiers::ctrl_shift(),
                "Previous Tab",
                "Navigation",
            ),
        ]
    }

    /// Get all default shortcuts
    pub fn all_defaults() -> Vec<Shortcut> {
        let mut shortcuts = Vec::new();
        shortcuts.extend(file_shortcuts());
        shortcuts.extend(edit_shortcuts());
        shortcuts.extend(view_shortcuts());
        shortcuts.extend(navigation_shortcuts());
        shortcuts
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_manager() {
        let mut manager = ShortcutManager::new();
        
        manager.add(Shortcut::new(
            "test",
            Key::S,
            ShortcutModifiers::ctrl(),
            "Test shortcut",
            "Test",
        ));
        
        assert!(manager.get("test").is_some());
        assert_eq!(manager.all().len(), 1);
        
        manager.remove("test");
        assert!(manager.get("test").is_none());
    }

    #[test]
    fn test_categories() {
        let mut manager = ShortcutManager::new();
        manager.add_many(presets::file_shortcuts());
        manager.add_many(presets::edit_shortcuts());
        
        let categories = manager.categories();
        assert!(categories.contains(&"File".to_string()));
        assert!(categories.contains(&"Edit".to_string()));
    }
}
