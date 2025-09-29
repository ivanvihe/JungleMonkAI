use vscode_shell::layout::ShellTheme;

use crate::ui::theme::ThemeTokens;

pub fn shell_theme(tokens: &ThemeTokens) -> ShellTheme {
    ShellTheme {
        root_background: tokens.palette.root_background,
        surface_background: tokens.palette.panel_background,
        header_background: tokens.palette.header_background,
        border: tokens.palette.border,
        text_primary: tokens.palette.text_primary,
        text_muted: tokens.palette.text_weak,
        accent: tokens.palette.primary,
        accent_soft: tokens.palette.hover_background,
    }
}
