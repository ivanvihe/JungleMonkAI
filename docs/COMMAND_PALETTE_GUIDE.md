# Guía de Command Palette

> Sistema de paleta de comandos con búsqueda fuzzy estilo VSCode

## 🎯 Características

- ✅ Búsqueda fuzzy inteligente
- ✅ Scoring de resultados por relevancia
- ✅ Navegación con teclado (↑↓, Enter, Esc)
- ✅ Historial de comandos recientes
- ✅ Modal con overlay semi-transparente
- ✅ Categorías y descripciones
- ✅ Iconos y keybindings
- ✅ Auto-focus en input
- ✅ Scroll automático

---

## 🚀 Uso Básico

### 1. Definir Comandos

```rust
use vscode_shell::components::{Command, CommandPaletteProps};

let commands = vec![
    Command::new("file.save", "Save File", "File")
        .with_icon("💾")
        .with_keybinding("Ctrl+S")
        .with_description("Save the current file")
        .with_keywords(vec!["write".into(), "disk".into()]),
    
    Command::new("file.open", "Open File", "File")
        .with_icon("📂")
        .with_keybinding("Ctrl+O")
        .with_description("Open a file from disk"),
    
    Command::new("edit.undo", "Undo", "Edit")
        .with_icon("↶")
        .with_keybinding("Ctrl+Z"),
    
    Command::new("view.palette", "Show Command Palette", "View")
        .with_icon("⌘")
        .with_keybinding("Ctrl+Shift+P"),
];
```

### 2. State Management

```rust
struct MyApp {
    show_palette: bool,
    palette_query: String,
    selected_index: usize,
    commands: Vec<Command>,
    recent_commands: Vec<String>,
}

impl MyApp {
    fn toggle_palette(&mut self) {
        self.show_palette = !self.show_palette;
        if self.show_palette {
            self.palette_query.clear();
            self.selected_index = 0;
        }
    }
}
```

### 3. Implementar Trait

```rust
use vscode_shell::components::CommandPaletteModel;

impl CommandPaletteModel for MyApp {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn props(&self) -> CommandPaletteProps {
        CommandPaletteProps {
            placeholder: "Type a command or search...".to_string(),
            commands: self.commands.clone(),
            recent_commands: self.recent_commands.clone(),
            show_icons: true,
            show_keybindings: true,
            max_results: 50,
        }
    }

    fn query(&self) -> &str {
        &self.palette_query
    }

    fn set_query(&mut self, query: String) {
        self.palette_query = query;
    }

    fn selected_index(&self) -> usize {
        self.selected_index
    }

    fn set_selected_index(&mut self, index: usize) {
        self.selected_index = index;
    }

    fn on_command_selected(&mut self, command_id: &str) {
        // Ejecutar el comando
        self.execute_command(command_id);
        
        // Agregar a recientes
        self.recent_commands.retain(|id| id != command_id);
        self.recent_commands.insert(0, command_id.to_string());
        self.recent_commands.truncate(10);
        
        // Cerrar palette
        self.show_palette = false;
    }

    fn on_palette_closed(&mut self) {
        self.show_palette = false;
    }
}
```

### 4. Renderizar

```rust
fn update(&mut self, ctx: &egui::Context) {
    // Shortcut para abrir palette
    if ctx.input(|i| i.key_pressed(egui::Key::P) && i.modifiers.ctrl && i.modifiers.shift) {
        self.toggle_palette();
    }
    
    // Tu UI principal
    egui::CentralPanel::default().show(ctx, |ui| {
        ui.label("Press Ctrl+Shift+P to open command palette");
    });
    
    // Command Palette (modal)
    if self.show_palette {
        draw_command_palette(ctx, &self.layout, self);
    }
}
```

---

## 🔍 Algoritmo de Búsqueda Fuzzy

### Scoring System

El algoritmo de fuzzy matching calcula un score basado en:

**Puntos positivos:**
- **+100** por cada carácter que coincide
- **+50** adicional por coincidencias consecutivas (aumenta por cada consecutiva)
- **+30** si coincide al inicio de una palabra
- **+50** si coincide en el título (vs descripción/keywords)

**Penalizaciones:**
- **-2** por cada carácter de gap entre coincidencias

### Ejemplo de Scoring

Búsqueda: `"safi"`

```
Comando: "Save File"
         s a  v  e    F  i  l  e
         ↓ ↓     ↓    ↓  ↓
Query:   s a     f    i

Score calculation:
- 's' match at start: 100 + 30 (word start) + 50 (title) = 180
- 'a' consecutive: 100 + 50 (consecutive bonus) + 50 (title) = 200
- 'f' gap of 2: 100 + 30 (word start) + 50 (title) - 4 (gap) = 176
- 'i' consecutive: 100 + 100 (consecutive x2) + 50 (title) = 250

Total: 806 points
```

### Búsqueda en Múltiples Campos

El algoritmo busca en:
1. **Título** (mayor peso)
2. **Categoría**
3. **Descripción**
4. **Keywords**

---

## ⌨️ Atajos de Teclado

| Acción | Atajo |
|--------|-------|
| Abrir palette | `Ctrl+Shift+P` |
| Cerrar | `Esc` |
| Navegar abajo | `↓` |
| Navegar arriba | `↑` |
| Ejecutar comando | `Enter` |
| Click en resultado | Mouse |

---

## 💡 Ejemplos Avanzados

### Ejemplo 1: Comandos con Contexto

```rust
impl MyApp {
    fn get_contextual_commands(&self) -> Vec<Command> {
        let mut cmds = self.base_commands.clone();
        
        // Agregar comandos según el contexto
        if let Some(file) = &self.active_file {
            if file.modified {
                cmds.push(
                    Command::new("file.save", "Save File", "File")
                        .with_icon("💾")
                        .with_keybinding("Ctrl+S")
                );
            }
            
            if file.path.ends_with(".rs") {
                cmds.push(
                    Command::new("rust.run", "Run Rust File", "Rust")
                        .with_icon("🦀")
                        .with_keybinding("Ctrl+F5")
                );
            }
        }
        
        cmds
    }
}
```

### Ejemplo 2: Comandos Dinámicos

```rust
fn props(&self) -> CommandPaletteProps {
    CommandPaletteProps {
        commands: self.get_contextual_commands(),
        recent_commands: self.recent_commands.clone(),
        placeholder: if self.palette_query.is_empty() {
            "Type a command...".into()
        } else {
            format!("Searching for '{}'...", self.palette_query)
        },
        ..Default::default()
    }
}
```

### Ejemplo 3: Categorías Personalizadas

```rust
let commands = vec![
    // File operations
    Command::new("file.new", "New File", "File").with_icon("📄"),
    Command::new("file.open", "Open File", "File").with_icon("📂"),
    Command::new("file.save", "Save", "File").with_icon("💾"),
    
    // Edit operations
    Command::new("edit.undo", "Undo", "Edit").with_icon("↶"),
    Command::new("edit.redo", "Redo", "Edit").with_icon("↷"),
    Command::new("edit.find", "Find", "Edit").with_icon("🔍"),
    
    // View operations
    Command::new("view.zoom_in", "Zoom In", "View").with_icon("🔍+"),
    Command::new("view.zoom_out", "Zoom Out", "View").with_icon("🔍-"),
    
    // Custom categories
    Command::new("git.commit", "Commit Changes", "Git").with_icon("📝"),
    Command::new("debug.start", "Start Debugging", "Debug").with_icon("🐛"),
];
```

---

## 🎨 Personalización

### Estilos

Los estilos se toman del `ShellTheme`:
- **Background:** `theme.panel_background`
- **Border:** `theme.border`
- **Text:** `theme.text_primary` / `theme.text_weak`
- **Selection:** `theme.active_background`
- **Overlay:** Semi-transparente negro (alpha 128)

### Tamaños

```rust
// Modificar en el código fuente
const PALETTE_WIDTH: f32 = 600.0;
const PALETTE_HEIGHT: f32 = 400.0;
const ITEM_HEIGHT: f32 = 40.0;
const MAX_RESULTS: usize = 50;
```

---

## 📊 Mejores Prácticas

### 1. Keywords Efectivos

```rust
Command::new("file.save", "Save File", "File")
    .with_keywords(vec![
        "write".into(),
        "disk".into(),
        "persist".into(),
        "store".into(),
    ])
```

### 2. Descripciones Claras

```rust
Command::new("edit.replace", "Find and Replace", "Edit")
    .with_description("Find text and replace it with another")
```

### 3. Iconos Consistentes

Usa emojis o caracteres Unicode:
- 📄 Archivos
- 📁 Carpetas
- ⚙️ Configuración
- 🔍 Búsqueda
- ✂️ Cortar
- 📋 Copiar
- 📌 Pegar

### 4. Historial Limitado

```rust
self.recent_commands.truncate(10); // Mantener solo 10
```

---

## 🐛 Troubleshooting

### Palette no se muestra
- ✅ Verificar que `show_palette` sea `true`
- ✅ Asegurar que se renderiza después del contenido principal
- ✅ Comprobar que el modal overlay no está bloqueando

### Búsqueda no encuentra resultados
- ✅ Verificar que los comandos tienen títulos/keywords
- ✅ El algoritmo es case-insensitive pero order-sensitive
- ✅ Agregar más keywords a los comandos

### Keyboard no funciona
- ✅ Verificar que el input tiene focus
- ✅ El componente auto-focus en el primer frame
- ✅ Comprobar que no hay otros shortcuts conflictivos

---

## 🎯 Casos de Uso

### ✅ Editor de Código
- Comandos de archivo (new, open, save)
- Comandos de edición (undo, redo, find)
- Comandos de lenguaje (format, lint, run)

### ✅ Herramienta de Diseño
- Comandos de shape (rectangle, circle, line)
- Comandos de transform (rotate, scale, flip)
- Comandos de layer (group, ungroup, lock)

### ✅ Dashboard
- Comandos de navegación (go to page)
- Comandos de datos (refresh, export, filter)
- Comandos de vista (zoom, layout)

---

## 🚀 Roadmap

- [ ] Highlighting de caracteres matched
- [ ] Subcategorías anidadas
- [ ] Comandos con parámetros
- [ ] Preview de comandos
- [ ] Temas personalizados
- [ ] Animaciones de transición
- [ ] Historial persistente

---

**Creado:** 2025-09-30  
**Versión:** 1.0
