# Sistema de Diseño UI - JungleMonkAI

> Guía completa del sistema de diseño inspirado en VSCode para aplicaciones basadas en `vscode_shell`

## 📐 Arquitectura de Layout

### Estructura Principal

```
┌─────────────────────────────────────────────────────────┐
│ Header (Title, Search, Actions)                         │
├──────┬──────────────────────────────────┬───────────────┤
│      │                                  │               │
│ Act- │                                  │   Resource    │
│ ivity│       Main Content Area          │   Panel       │
│ Bar  │       (Editor/Tabs)              │   (Optional)  │
│      │                                  │               │
│      │                                  │               │
├──────┴──────────────────────────────────┴───────────────┤
│ Status Bar (Info, Actions, Indicators)                  │
└─────────────────────────────────────────────────────────┘
```

### Contenedores Principales

1. **Header**: Barra superior con navegación global
2. **Activity Bar**: Navegación lateral principal (iconos)
3. **Primary Sidebar**: Panel lateral izquierdo expandible
4. **Main Content**: Área principal de trabajo
5. **Secondary Sidebar**: Panel lateral derecho (recursos)
6. **Panel**: Panel inferior para terminal/output
7. **Status Bar**: Barra inferior de estado

---

## 🎨 Sistema de Tokens de Diseño

### Paleta de Colores VSCode Dark (Oficial)

```rust
// Background colors
root_background: #1e1e1e        // Editor background
panel_background: #252526       // Sidebar background
active_background: #094771      // Selected item
secondary_background: #2d2d30   // Secondary panels
header_background: #323233      // Title bar

// Foreground colors
text_primary: #cccccc           // Main text
text_weak: #888888              // Muted text
border: #3c3c3c                 // Borders and dividers

// Accent colors
primary: #0e639c                // Links and primary actions
success: #4ec9b0                // Success indicators
danger: #f48771                 // Errors and warnings
hyperlink: #3794ff              // Hyperlinks

// Selection
selection_background: #264f78   // Text selection
selection_stroke: #0078d4       // Selection border
```

### Paleta VSCode Light

```rust
root_background: #ffffff
panel_background: #f3f3f3
active_background: #0060c0
secondary_background: #f3f3f3
text_primary: #000000
text_weak: #6c6c6c
border: #cccccc
primary: #0078d4
success: #16825d
danger: #a1260d
```

### Espaciado

```rust
item_spacing: Vec2::new(8.0, 6.0)
button_padding: Vec2::new(16.0, 6.0)
interact_size_y: 28.0
sidebar_width: 220.0
activity_bar_width: 48.0
header_height: 35.0
status_bar_height: 22.0
```

### Tipografía

```rust
heading: 18px, Semibold
title: 14px, Semibold
body: 13px, Regular
body_small: 12px, Regular
monospace: 13px, "Consolas", "Monaco"
icon: 16px, "Font Awesome"
```

### Redondeo

```rust
window: 0px              // Sin redondeo en ventana principal
menu: 5px                // Menús contextuales
widget: 3px              // Botones y controles
```

---

## 🧩 Componentes

### 1. Header

**Uso:**
```rust
use vscode_shell::components::{draw_header, HeaderModel, HeaderProps, HeaderAction};

impl HeaderModel for MyApp {
    fn props(&self) -> HeaderProps {
        HeaderProps {
            title: "App Name".into(),
            subtitle: Some("Current Context".into()),
            search_placeholder: Some("Search (Ctrl+K)".into()),
            actions: vec![
                HeaderAction::new("settings", "Settings"),
                HeaderAction::new("help", "Help"),
            ],
            logo_acronym: Some("AN".into()),
        }
    }
}
```

**Características:**
- Título y subtítulo dinámico
- Barra de búsqueda global
- Acciones rápidas con iconos
- Logo/acronym personalizable

---

### 2. Sidebar (Navegación)

**Uso:**
```rust
impl NavigationModel for MyApp {
    fn props(&self) -> SidebarProps {
        SidebarProps {
            title: Some("Explorer".into()),
            sections: vec![
                SidebarSection {
                    id: "main".into(),
                    title: "Main".into(),
                    items: vec![
                        SidebarItem::new("dashboard", "Dashboard", "📊"),
                        SidebarItem::new("files", "Files", "📁"),
                    ],
                }
            ],
            collapse_button_tooltip: Some("Hide sidebar".into()),
        }
    }
}
```

**Características:**
- Secciones colapsables
- Íconos por ítem
- Badges de notificación
- Tooltips
- Selección activa

---

### 3. Tabs System (NUEVO)

**Propósito:** Gestionar múltiples editores/vistas abiertas

**Estructura:**
```rust
pub struct TabsProps {
    pub tabs: Vec<Tab>,
    pub active_tab_id: String,
    pub closeable: bool,
    pub show_icons: bool,
}

pub struct Tab {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub modified: bool,  // Indicador de cambios sin guardar
    pub closeable: bool,
}
```

**UX VSCode:**
- Tabs horizontales en la parte superior del editor
- Indicador de modificación (punto en el ícono de cerrar)
- Hover para preview
- Context menu (clic derecho)
- Drag to reorder

---

### 4. Status Bar (NUEVO)

**Propósito:** Mostrar información contextual y acciones rápidas

**Estructura:**
```rust
pub struct StatusBarProps {
    pub left_items: Vec<StatusBarItem>,
    pub right_items: Vec<StatusBarItem>,
}

pub struct StatusBarItem {
    pub id: String,
    pub text: String,
    pub icon: Option<String>,
    pub tooltip: Option<String>,
    pub color: Option<Color32>,  // Para indicadores (success, danger)
    pub clickable: bool,
}
```

**Ejemplos:**
- Izquierda: Branch info, errores/warnings, línea/columna
- Derecha: Encoding, EOL, lenguaje, notificaciones

---

### 5. Tree View (NUEVO)

**Propósito:** Explorador jerárquico de archivos/recursos

**Estructura:**
```rust
pub struct TreeViewProps {
    pub root_nodes: Vec<TreeNode>,
    pub show_icons: bool,
    pub allow_multiselect: bool,
}

pub struct TreeNode {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub children: Vec<TreeNode>,
    pub expanded: bool,
    pub selected: bool,
    pub file_type: FileType,  // File, Folder, etc.
}
```

**Interacciones:**
- Click para seleccionar
- Double-click para abrir
- Arrow keys para navegación
- Collapse/expand folders
- Context menu

---

### 6. Split Panels (NUEVO)

**Propósito:** Dividir el área de trabajo en múltiples editores

**Modos:**
- Horizontal split
- Vertical split
- Grid layout (2x2, etc.)

**Características:**
- Resizable con drag
- Minimizar/maximizar paneles
- Sincronizar scroll (opcional)

---

### 7. Command Palette

**Mejorar el sistema de búsqueda existente:**

```rust
pub struct CommandPaletteProps {
    pub placeholder: String,
    pub groups: Vec<CommandGroup>,
    pub recent_commands: Vec<String>,
    pub fuzzy_search: bool,
}

pub struct CommandGroup {
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    pub commands: Vec<Command>,
}

pub struct Command {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub keybinding: Option<String>,
    pub category: String,
}
```

---

## 🎯 Patrones de Uso

### Pattern 1: IDE Layout Completo

```rust
fn update(&mut self, ctx: &egui::Context) {
    draw_header(ctx, state);
    
    egui::SidePanel::left("activity_bar")
        .resizable(false)
        .exact_width(48.0)
        .show(ctx, |ui| {
            draw_activity_bar(ui, state);
        });
    
    egui::SidePanel::left("sidebar")
        .resizable(true)
        .show_animated(ctx, state.sidebar_visible, |ui| {
            draw_sidebar(ctx, state);
        });
    
    egui::TopBottomPanel::bottom("status_bar")
        .exact_height(22.0)
        .show(ctx, |ui| {
            draw_status_bar(ui, state);
        });
    
    egui::CentralPanel::default().show(ctx, |ui| {
        draw_tabs(ui, state);
        draw_main_content(ui, state);
    });
}
```

### Pattern 2: Minimal Layout

```rust
fn update(&mut self, ctx: &egui::Context) {
    draw_header(ctx, state);
    
    egui::CentralPanel::default().show(ctx, |ui| {
        draw_main_content(ui, state);
    });
}
```

---

## 🔌 Extensibilidad

### Custom Themes

```rust
let custom_theme = ThemeTokens {
    palette: ThemePalette {
        primary: Color32::from_rgb(138, 43, 226),  // Purple
        ..ThemePalette::dark()
    },
    ..ThemeTokens::default()
};

theme::apply(&ctx, &custom_theme);
```

### Custom Components

```rust
pub trait CustomComponent {
    fn draw(&mut self, ui: &mut egui::Ui, state: &mut AppState);
    fn on_event(&mut self, event: ComponentEvent);
}
```

---

## 📚 Recursos

### Documentación VSCode Oficial
- [UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)

### Herramientas
- [VSCode Theme Generator](https://themes.vscode.one/)
- [Figma VSCode Kit](https://www.figma.com/community/file/1260939392478898674)

### Inspiración
- Visual Studio Code
- Zed Editor
- JetBrains IDEs

---

## 🚀 Roadmap

- [x] Layout base con vscode_shell
- [x] Theme system con tokens
- [x] Header component
- [x] Sidebar component
- [ ] Tabs system
- [ ] Status bar
- [ ] Tree view
- [ ] Split panels
- [ ] Command palette mejorado
- [ ] Breadcrumbs
- [ ] Minimap
- [ ] Drag & drop
- [ ] Keyboard shortcuts system
- [ ] Context menus
- [ ] Notifications system

---

**Última actualización:** 2025-09-30
