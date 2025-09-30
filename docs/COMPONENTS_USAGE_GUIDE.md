# Guía de Uso de Componentes VSCode Shell

> Ejemplos prácticos para implementar cada componente del sistema de diseño

## 📋 Tabla de Contenidos

1. [Tabs System](#tabs-system)
2. [Status Bar](#status-bar)
3. [Tree View](#tree-view)
4. [Layout Completo](#layout-completo)

---

## 🗂️ Tabs System

### Ejemplo Básico

```rust
use vscode_shell::components::{Tab, TabsModel, TabsProps, draw_tabs};

struct MyApp {
    tabs: Vec<Tab>,
    active_tab: String,
    layout: LayoutConfig,
}

impl TabsModel for MyApp {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn props(&self) -> TabsProps {
        TabsProps {
            tabs: self.tabs.clone(),
            active_tab_id: self.active_tab.clone(),
            closeable: true,
            show_icons: true,
        }
    }

    fn on_tab_selected(&mut self, tab_id: &str) {
        self.active_tab = tab_id.to_string();
    }

    fn on_tab_closed(&mut self, tab_id: &str) {
        self.tabs.retain(|t| t.id != tab_id);
        
        // Select previous tab if current was closed
        if self.active_tab == tab_id && !self.tabs.is_empty() {
            self.active_tab = self.tabs[0].id.clone();
        }
    }
}

// En tu función update():
fn update(&mut self, ctx: &egui::Context) {
    draw_tabs(ctx, &self.layout, self);
}
```

### Crear Tabs con Builder Pattern

```rust
let tabs = vec![
    Tab::new("file1", "main.rs")
        .with_icon("🦀")
        .modified(true)          // Muestra indicador ●
        .closeable(true),
    
    Tab::new("file2", "config.toml")
        .with_icon("⚙️")
        .modified(false)
        .closeable(true),
    
    Tab::new("welcome", "Welcome")
        .closeable(false),       // No se puede cerrar
];
```

### Casos de Uso

**Editor de código con múltiples archivos abiertos:**
```rust
impl MyApp {
    fn open_file(&mut self, path: &str) {
        let tab_id = format!("file:{}", path);
        
        // Evitar duplicados
        if !self.tabs.iter().any(|t| t.id == tab_id) {
            self.tabs.push(
                Tab::new(tab_id.clone(), path)
                    .with_icon(Self::icon_for_file(path))
                    .modified(false)
            );
        }
        
        self.active_tab = tab_id;
    }
    
    fn icon_for_file(path: &str) -> String {
        if path.ends_with(".rs") { "🦀" }
        else if path.ends_with(".md") { "📝" }
        else if path.ends_with(".json") { "📋" }
        else { "📄" }
        .to_string()
    }
}
```

---

## 📊 Status Bar

### Ejemplo Básico

```rust
use vscode_shell::components::{
    StatusBarItem, StatusBarModel, StatusBarProps, draw_status_bar,
    branch_item, errors_item, warnings_item, position_item,
};

struct MyApp {
    current_line: usize,
    current_column: usize,
    error_count: usize,
    warning_count: usize,
    git_branch: String,
}

impl StatusBarModel for MyApp {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn props(&self) -> StatusBarProps {
        StatusBarProps {
            left_items: vec![
                branch_item(&self.git_branch),
                errors_item(self.error_count),
                warnings_item(self.warning_count),
            ],
            right_items: vec![
                position_item(self.current_line, self.current_column),
                encoding_item("UTF-8"),
                eol_item("LF"),
                language_item("Rust"),
            ],
        }
    }

    fn on_item_clicked(&mut self, item_id: &str) {
        match item_id {
            "branch" => self.show_git_panel = true,
            "errors" => self.show_problems_panel = true,
            "warnings" => self.show_problems_panel = true,
            "position" => self.show_goto_line_dialog = true,
            "encoding" => self.show_encoding_selector = true,
            "language" => self.show_language_selector = true,
            _ => {}
        }
    }
}

// En tu función update():
fn update(&mut self, ctx: &egui::Context) {
    draw_status_bar(ctx, &self.layout, self);
}
```

### Items Personalizados

```rust
// Item con color personalizado
let custom_item = StatusBarItem::new("server", "● Server Running")
    .with_color(Color32::from_rgb(76, 201, 176))  // Verde
    .with_tooltip("Click to stop server")
    .clickable();

// Item con fondo resaltado
let notification_item = StatusBarItem::new("notif", "3 updates")
    .with_background(Color32::from_rgb(25, 118, 210))
    .with_color(Color32::WHITE)
    .with_tooltip("View updates")
    .clickable();

// Item solo informativo (no clickeable)
let readonly_item = StatusBarItem::info("time", "14:30:25");
```

### Casos de Uso

**Build status indicator:**
```rust
fn build_status_item(&self) -> StatusBarItem {
    match self.build_state {
        BuildState::Idle => StatusBarItem::info("build", "Ready"),
        BuildState::Building => StatusBarItem::warning("build", "● Building...")
            .with_tooltip("Build in progress"),
        BuildState::Success => StatusBarItem::success("build", "✓ Build succeeded")
            .clickable(),
        BuildState::Failed(ref errors) => StatusBarItem::error("build", format!("✗ Build failed ({})", errors))
            .clickable(),
    }
}
```

---

## 🌳 Tree View

### Ejemplo Básico

```rust
use vscode_shell::components::{
    TreeNode, TreeViewModel, TreeViewProps, draw_tree_view,
};

struct FileExplorer {
    nodes: Vec<TreeNode>,
    selected_path: Option<String>,
}

impl TreeViewModel for FileExplorer {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn props(&self) -> TreeViewProps {
        TreeViewProps {
            root_nodes: self.nodes.clone(),
            show_icons: true,
            allow_multiselect: false,
            indent_per_level: 16.0,
        }
    }

    fn on_node_clicked(&mut self, node_id: &str) {
        // Actualizar selección
        self.update_selection(node_id);
    }

    fn on_node_double_clicked(&mut self, node_id: &str) {
        // Abrir archivo o navegar a carpeta
        if let Some(node) = find_node_mut(&mut self.nodes, node_id) {
            if node.is_folder() {
                // Ya se expande automáticamente
            } else {
                // Abrir archivo en editor
                self.open_file(node_id);
            }
        }
    }

    fn on_node_expanded(&mut self, node_id: &str, expanded: bool) {
        if let Some(node) = find_node_mut(&mut self.nodes, node_id) {
            node.expanded = expanded;
            
            // Cargar hijos si es necesario (lazy loading)
            if expanded && node.children.is_empty() {
                node.children = self.load_folder_contents(node_id);
            }
        }
    }
}

// En tu panel lateral:
fn draw_sidebar(&mut self, ui: &mut egui::Ui) {
    draw_tree_view(ui, &self.layout, self);
}
```

### Construir Tree desde Paths

```rust
use vscode_shell::components::tree_from_paths;

let file_paths = vec![
    "src/main.rs".to_string(),
    "src/lib.rs".to_string(),
    "src/ui/mod.rs".to_string(),
    "src/ui/components.rs".to_string(),
    "Cargo.toml".to_string(),
    "README.md".to_string(),
];

let tree = tree_from_paths(&file_paths);
```

### Crear Tree Manualmente

```rust
let tree = vec![
    TreeNode::folder("src", "src")
        .with_children(vec![
            TreeNode::new("src/main.rs", "main.rs")
                .with_icon("🦀"),
            TreeNode::new("src/lib.rs", "lib.rs")
                .with_icon("🦀"),
            TreeNode::folder("src/ui", "ui")
                .expanded(true)
                .with_children(vec![
                    TreeNode::new("src/ui/mod.rs", "mod.rs"),
                    TreeNode::new("src/ui/theme.rs", "theme.rs"),
                ]),
        ])
        .expanded(true),
    
    TreeNode::new("Cargo.toml", "Cargo.toml")
        .with_icon("⚙️"),
    
    TreeNode::new("README.md", "README.md")
        .with_icon("📝"),
];
```

### Actualizar Selección

```rust
impl FileExplorer {
    fn update_selection(&mut self, node_id: &str) {
        // Deseleccionar todo
        Self::deselect_all(&mut self.nodes);
        
        // Seleccionar el nodo clickeado
        if let Some(node) = find_node_mut(&mut self.nodes, node_id) {
            node.selected = true;
            self.selected_path = Some(node_id.to_string());
        }
    }
    
    fn deselect_all(nodes: &mut [TreeNode]) {
        for node in nodes {
            node.selected = false;
            Self::deselect_all(&mut node.children);
        }
    }
}
```

---

## 🖥️ Layout Completo

### Aplicación Tipo IDE

```rust
use vscode_shell::components::*;

struct IDEApp {
    layout: LayoutConfig,
    theme: ShellTheme,
    
    // State
    tabs: Vec<Tab>,
    active_tab: String,
    tree_nodes: Vec<TreeNode>,
    
    // Panels
    sidebar_visible: bool,
    status_bar_visible: bool,
}

impl IDEApp {
    fn update(&mut self, ctx: &egui::Context) {
        // Header
        draw_header(ctx, &self.layout, self);
        
        // Activity Bar (opcional)
        egui::SidePanel::left("activity_bar")
            .resizable(false)
            .exact_width(48.0)
            .show(ctx, |ui| {
                self.draw_activity_bar(ui);
            });
        
        // Sidebar with Tree View
        if self.sidebar_visible {
            egui::SidePanel::left("sidebar")
                .resizable(true)
                .default_width(250.0)
                .show(ctx, |ui| {
                    draw_tree_view(ui, &self.layout, self);
                });
        }
        
        // Status Bar
        if self.status_bar_visible {
            draw_status_bar(ctx, &self.layout, self);
        }
        
        // Central Panel with Tabs + Content
        egui::CentralPanel::default().show(ctx, |ui| {
            // Tabs
            draw_tabs(ctx, &self.layout, self);
            
            // Main content area
            egui::ScrollArea::vertical().show(ui, |ui| {
                self.draw_active_tab_content(ui);
            });
        });
    }
    
    fn draw_activity_bar(&mut self, ui: &mut egui::Ui) {
        ui.vertical_centered(|ui| {
            if ui.button("📁").clicked() {
                self.sidebar_visible = !self.sidebar_visible;
            }
            if ui.button("🔍").clicked() {
                self.show_search_panel = true;
            }
            if ui.button("⚙️").clicked() {
                self.show_settings = true;
            }
        });
    }
}

// Implementar todos los traits necesarios
impl HeaderModel for IDEApp { /* ... */ }
impl TabsModel for IDEApp { /* ... */ }
impl TreeViewModel for IDEApp { /* ... */ }
impl StatusBarModel for IDEApp { /* ... */ }
```

### Layout Minimalista

```rust
struct MinimalApp {
    layout: LayoutConfig,
}

impl MinimalApp {
    fn update(&mut self, ctx: &egui::Context) {
        // Solo header y contenido
        draw_header(ctx, &self.layout, self);
        
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("Welcome");
            ui.label("Simple application without sidebars");
        });
    }
}
```

---

## 🎨 Personalización de Temas

### Aplicar Tema Personalizado

```rust
use vscode_shell::layout::ShellTheme;

fn apply_custom_theme(ctx: &egui::Context) {
    let theme = ShellTheme {
        root_background: Color32::from_rgb(24, 24, 27),
        panel_background: Color32::from_rgb(30, 30, 33),
        text_primary: Color32::from_rgb(240, 240, 240),
        text_weak: Color32::from_rgb(160, 160, 160),
        border: Color32::from_rgb(45, 45, 48),
        primary: Color32::from_rgb(102, 126, 234),
        // ... otros colores
    };
    
    // Aplicar mediante tu sistema de temas
}
```

---

## 💡 Tips y Mejores Prácticas

### 1. Gestión de Estado

```rust
// Usar un estado centralizado
struct AppState {
    tabs: TabManager,
    files: FileSystem,
    status: StatusManager,
}

struct TabManager {
    tabs: Vec<Tab>,
    active: String,
}

impl TabManager {
    fn add_tab(&mut self, tab: Tab) { /* ... */ }
    fn close_tab(&mut self, id: &str) { /* ... */ }
    fn switch_to(&mut self, id: &str) { /* ... */ }
}
```

### 2. Lazy Loading en Tree View

```rust
fn on_node_expanded(&mut self, node_id: &str, expanded: bool) {
    if expanded {
        if let Some(node) = find_node_mut(&mut self.nodes, node_id) {
            if node.children.is_empty() {
                // Cargar contenido solo cuando se expande
                node.children = self.load_directory(node_id);
            }
        }
    }
}
```

### 3. Persistir Layout

```rust
// Guardar estado del layout
fn save_layout_state(&self) {
    let state = LayoutState {
        sidebar_visible: self.sidebar_visible,
        sidebar_width: self.layout.sidebar_width,
        active_tab: self.active_tab.clone(),
    };
    
    // Serializar a JSON
    std::fs::write("layout.json", serde_json::to_string(&state).unwrap());
}
```

### 4. Keyboard Shortcuts

```rust
fn handle_shortcuts(&mut self, ctx: &egui::Context) {
    if ctx.input(|i| i.key_pressed(egui::Key::B) && i.modifiers.ctrl) {
        self.sidebar_visible = !self.sidebar_visible;
    }
    
    if ctx.input(|i| i.key_pressed(egui::Key::W) && i.modifiers.ctrl) {
        self.close_active_tab();
    }
}
```

---

## 🚀 Ejemplo Completo Funcional

Ver el archivo `templates/vscode_shell/src/examples.rs` para un ejemplo completo e integrado.

---

**Última actualización:** 2025-09-30
