use super::{CustomCommandAction, NavigationRegistry};

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

pub trait FeatureModule {
    fn register_navigation(&self, _registry: &mut NavigationRegistry) {}

    fn register_commands(&self, _registry: &mut CommandRegistry) {}
}
