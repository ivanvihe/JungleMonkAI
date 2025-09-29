use std::collections::HashMap;

use super::{CustomCommandAction, MainView, NavigationRegistry};
use crate::ui::workbench::WorkbenchView;

/// Registra comandos personalizados aportados por los módulos de estado.
#[derive(Default)]
pub struct CommandRegistry {
    actions: Vec<CustomCommandAction>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self {
            actions: Vec::new(),
        }
    }

    pub fn extend(&mut self, actions: impl IntoIterator<Item = CustomCommandAction>) {
        for action in actions {
            if !self.actions.contains(&action) {
                self.actions.push(action);
            }
        }
    }

    pub fn actions(&self) -> &[CustomCommandAction] {
        &self.actions
    }
}

pub struct WorkbenchRegistry<'a> {
    views: &'a mut HashMap<MainView, Box<dyn WorkbenchView>>,
}

impl<'a> WorkbenchRegistry<'a> {
    pub fn new(views: &'a mut HashMap<MainView, Box<dyn WorkbenchView>>) -> Self {
        Self { views }
    }

    pub fn register_view<V>(&mut self, view: MainView, view_impl: V)
    where
        V: WorkbenchView + 'static,
    {
        self.views.insert(view, Box::new(view_impl));
    }
}

pub trait FeatureModule {
    fn register_navigation(&self, _registry: &mut NavigationRegistry) {}

    fn register_commands(&self, _registry: &mut CommandRegistry) {}

    fn register_workbench_views(&self, _registry: &mut WorkbenchRegistry) {}
}
