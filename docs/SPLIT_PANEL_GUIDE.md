# Guía de Split Panels

> Sistema de paneles divididos para crear layouts multi-editor estilo VSCode

## 🎯 Características

- ✅ Splits horizontales (izquierda | derecha)
- ✅ Splits verticales (arriba / abajo)
- ✅ Splits anidados (split dentro de split)
- ✅ Divisores redimensionables con drag
- ✅ Ratios ajustables (10% - 90%)
- ✅ Serialización de estado (save/restore)
- ✅ Arquitectura recursiva basada en árbol

---

## 📐 Arquitectura

### Estructura de Nodos

```rust
pub enum PanelNode {
    Leaf(PanelLeaf),      // Panel terminal con contenido
    Split(PanelSplit),    // División en dos sub-paneles
}

pub struct PanelLeaf {
    pub id: String,
    pub content_id: String,  // ID del contenido a mostrar
}

pub struct PanelSplit {
    pub id: String,
    pub direction: SplitDirection,  // Horizontal o Vertical
    pub ratio: f32,                 // Posición del divisor (0.0 - 1.0)
    pub left: PanelNode,            // Hijo izquierdo/superior
    pub right: PanelNode,           // Hijo derecho/inferior
}
```

### Ejemplo de Árbol

```
Root (Split Horizontal, ratio=0.5)
├─ Left: Leaf("editor1")
└─ Right: Split (Vertical, ratio=0.7)
   ├─ Top: Leaf("editor2")
   └─ Bottom: Leaf("terminal")
```

Resultado visual:
```
┌─────────────┬─────────────┐
│             │   editor2   │
│   editor1   ├─────────────┤
│             │  terminal   │
└─────────────┴─────────────┘
```

---

## 🚀 Uso Básico

### 1. Setup Inicial

```rust
use vscode_shell::components::{
    draw_split_panel, SplitPanelModel, SplitPanelState, 
    PanelLeaf, SplitDirection
};

struct MyApp {
    split_state: SplitPanelState,
    layout: LayoutConfig,
}

impl MyApp {
    fn new() -> Self {
        Self {
            split_state: SplitPanelState::new("main_editor"),
            layout: LayoutConfig::default(),
        }
    }
}
```

### 2. Implementar Trait

```rust
impl SplitPanelModel for MyApp {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn state(&self) -> &SplitPanelState {
        &self.split_state
    }

    fn state_mut(&mut self) -> &mut SplitPanelState {
        &mut self.split_state
    }

    fn draw_panel_content(&mut self, ui: &mut egui::Ui, panel: &PanelLeaf) {
        // Dibujar el contenido de cada panel
        match panel.content_id.as_str() {
            "editor1" => self.draw_editor(ui, "file1.rs"),
            "editor2" => self.draw_editor(ui, "file2.rs"),
            "terminal" => self.draw_terminal(ui),
            _ => {
                ui.label("Empty panel");
            }
        }
    }
}
```

### 3. Renderizar

```rust
fn update(&mut self, ctx: &egui::Context) {
    egui::CentralPanel::default().show(ctx, |ui| {
        draw_split_panel(ui, &self.layout, self);
    });
}
```

---

## 🔧 API Completa

### Crear Splits

```rust
// Split horizontal (left | right)
state.split_horizontal(
    "panel_id",           // ID del panel a dividir
    "left_content".into(),  // Content ID izquierdo
    "right_content".into(), // Content ID derecho
    0.5,                    // Ratio (50%)
);

// Split vertical (top / bottom)
state.split_vertical(
    "panel_id",
    "top_content".into(),
    "bottom_content".into(),
    0.7,  // 70% arriba, 30% abajo
);
```

### Eliminar Splits

```rust
// Cerrar un split manteniendo un lado
state.remove_split(
    "split_id",  // ID del split a cerrar
    true,        // true = mantener left/top, false = mantener right/bottom
);
```

### Buscar Paneles

```rust
if let Some(panel) = state.find_panel("panel_id") {
    println!("Panel content: {}", panel.content_id);
}
```

---

## 💡 Ejemplos Prácticos

### Ejemplo 1: Editor Simple con Terminal

```rust
struct CodeEditor {
    split_state: SplitPanelState,
    files: HashMap<String, String>,
}

impl CodeEditor {
    fn new() -> Self {
        let mut state = SplitPanelState::new("editor");
        
        // Dividir verticalmente: editor arriba, terminal abajo
        state.split_vertical(
            "main",
            "editor".into(),
            "terminal".into(),
            0.75,  // 75% editor, 25% terminal
        );
        
        Self {
            split_state: state,
            files: HashMap::new(),
        }
    }
}

impl SplitPanelModel for CodeEditor {
    fn draw_panel_content(&mut self, ui: &mut egui::Ui, panel: &PanelLeaf) {
        match panel.content_id.as_str() {
            "editor" => {
                egui::ScrollArea::vertical().show(ui, |ui| {
                    ui.text_edit_multiline(&mut self.files.get_mut("current").unwrap());
                });
            }
            "terminal" => {
                ui.label("Terminal output here...");
            }
            _ => {}
        }
    }
    
    // ... otros métodos
}
```

### Ejemplo 2: Layout Multi-Editor

```rust
fn setup_multi_editor() -> SplitPanelState {
    let mut state = SplitPanelState::new("main");
    
    // Paso 1: Split horizontal principal
    state.split_horizontal("main", "left_group".into(), "right".into(), 0.5);
    
    // Paso 2: Split vertical en el lado izquierdo
    state.split_vertical("left_group", "editor1".into(), "editor2".into(), 0.5);
    
    state
}

// Resultado:
// ┌──────────┬──────────┐
// │ editor1  │          │
// ├──────────┤  right   │
// │ editor2  │          │
// └──────────┴──────────┘
```

### Ejemplo 3: Layout Tipo IDE

```rust
fn setup_ide_layout() -> SplitPanelState {
    let mut state = SplitPanelState::new("main");
    
    // Split principal: editor | sidebar
    state.split_horizontal("main", "editor_area".into(), "sidebar".into(), 0.75);
    
    // Split editor: code / terminal
    state.split_vertical("editor_area", "code".into(), "terminal".into(), 0.7);
    
    state
}

// Resultado:
// ┌────────────────┬─────────┐
// │                │         │
// │     code       │ sidebar │
// │                │         │
// ├────────────────┤         │
// │   terminal     │         │
// └────────────────┴─────────┘
```

### Ejemplo 4: Split con Tabs

```rust
impl SplitPanelModel for IDEApp {
    fn draw_panel_content(&mut self, ui: &mut egui::Ui, panel: &PanelLeaf) {
        // Cada panel puede tener su propio sistema de tabs
        if let Some(tabs) = self.panel_tabs.get(&panel.id) {
            draw_tabs(ui.ctx(), &self.layout, self);
        }
        
        // Contenido del tab activo
        match panel.content_id.as_str() {
            "editor" => self.draw_active_editor(ui, &panel.id),
            _ => {}
        }
    }
}
```

---

## 🎨 Personalización

### Estilos de Divisores

Los divisores usan el tema actual:
- **Normal:** `theme.border`
- **Hover/Drag:** `theme.primary`

### Grosor del Divisor

Modificar en el código fuente:
```rust
let divider_thickness = 4.0;  // Cambiar este valor
```

### Límites de Ratio

Por defecto: 0.1 (10%) a 0.9 (90%)

Modificar en `split_horizontal/vertical`:
```rust
split.ratio = ratio.clamp(0.2, 0.8);  // Más restrictivo
```

---

## 💾 Serialización

El estado es serializable:

```rust
use serde::{Serialize, Deserialize};

// Guardar
let json = serde_json::to_string(&state).unwrap();
std::fs::write("layout.json", json).unwrap();

// Cargar
let json = std::fs::read_to_string("layout.json").unwrap();
let state: SplitPanelState = serde_json::from_str(&json).unwrap();
```

---

## ⌨️ Shortcuts Sugeridos

```rust
fn handle_split_shortcuts(&mut self, ctx: &egui::Context) {
    let input = ctx.input(|i| i.clone());
    
    // Ctrl+\ = Split horizontal
    if input.key_pressed(egui::Key::Backslash) && input.modifiers.ctrl {
        if let Some(active_panel) = &self.active_panel {
            self.split_state.split_horizontal(
                active_panel,
                format!("editor_{}", self.next_id()),
                format!("editor_{}", self.next_id() + 1),
                0.5,
            );
        }
    }
    
    // Ctrl+- = Split vertical
    if input.key_pressed(egui::Key::Minus) && input.modifiers.ctrl {
        if let Some(active_panel) = &self.active_panel {
            self.split_state.split_vertical(
                active_panel,
                format!("editor_{}", self.next_id()),
                format!("editor_{}", self.next_id() + 1),
                0.5,
            );
        }
    }
    
    // Ctrl+W = Cerrar panel activo
    if input.key_pressed(egui::Key::W) && input.modifiers.ctrl {
        if let Some(split_id) = &self.active_split {
            self.split_state.remove_split(split_id, true);
        }
    }
}
```

---

## 🐛 Troubleshooting

### Panel no se dibuja

- ✅ Verificar que `draw_panel_content` maneja el `content_id`
- ✅ Comprobar que el panel existe: `state.find_panel()`

### Divisor no responde

- ✅ Asegurar que `state_mut()` devuelve una referencia mutable
- ✅ Verificar que el `split_id` es correcto

### Ratios no se aplican

- ✅ Los ratios están clamped entre 0.1 y 0.9
- ✅ El drag delta se calcula relativo al tamaño del panel padre

---

## 📦 Dependencias

Agregar a `Cargo.toml`:

```toml
[dependencies]
uuid = { version = "1.0", features = ["v4", "serde"] }
serde = { version = "1.0", features = ["derive"] }
```

---

## 🎯 Casos de Uso

### ✅ IDE / Editor de código
- Split editors para ver múltiples archivos
- Terminal integrado en split inferior

### ✅ Dashboard
- Múltiples gráficas en diferentes paneles
- Comparación lado a lado

### ✅ Diff Viewer
- Split horizontal para before/after

### ✅ Herramienta de diseño
- Canvas principal + paneles de propiedades

---

## 🚀 Roadmap

- [ ] Comandos de teclado integrados
- [ ] Drag & drop entre paneles
- [ ] Grupos de tabs por panel
- [ ] Layouts predefinidos (IDE, 2-column, grid)
- [ ] Animaciones de transición
- [ ] Panel focus tracking
- [ ] Maximizar/minimizar paneles

---

**Creado:** 2025-09-30  
**Versión:** 1.0
