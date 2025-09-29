# Plantilla VSCode Shell

Esta plantilla encapsula el arranque de una aplicación basada en `eframe`,
expone un `run` reutilizable que ejecuta cualquier estado que implemente el
rasgo [`AppShell`](src/lib.rs) y proporciona un conjunto de componentes
opinionados que reproducen un shell tipo VSCode.

## Uso básico

```rust
use vscode_shell::run;
use vscode_shell::AppShell;

struct MyShell;

impl AppShell for MyShell {
    fn init(&mut self, _cc: &eframe::CreationContext<'_>) {}

    fn update(&mut self, _ctx: &egui::Context) {}
}

fn main() {
    run(|| Box::new(MyShell)).unwrap();
}
```

## Componentes reutilizables

El módulo [`components`](src/components/mod.rs) define estructuras de _props_
y rasgos ligeros para renderizar encabezados, barras laterales, paneles de
recursos y la zona principal de contenido. Cada componente recibe una instancia
que implemente el rasgo correspondiente (`HeaderModel`, `NavigationModel`,
`ResourcePanelModel` o `MainContentModel`) y obtiene de él los datos a dibujar y
los _callbacks_ que debe invocar.

Por ejemplo, para dibujar el encabezado basta con exponer un modelo que devuelva
un [`HeaderProps`] con título, acciones y configuración de búsqueda:

```rust
use vscode_shell::components::{draw_header, HeaderAction, HeaderModel, HeaderProps};
use vscode_shell::layout::{LayoutConfig, ShellTheme};

struct HeaderState {
    layout: LayoutConfig,
}

impl HeaderModel for HeaderState {
    fn theme(&self) -> ShellTheme {
        ShellTheme::default()
    }

    fn props(&self) -> HeaderProps {
        HeaderProps {
            title: "Demo".into(),
            subtitle: Some("Shell mínimo".into()),
            search_placeholder: Some("Buscar".into()),
            actions: vec![HeaderAction::new("settings", "Ajustes")],
            logo_acronym: Some("DM".into()),
        }
    }

    fn search_value(&self) -> String { String::new() }
    fn set_search_value(&mut self, _value: String) {}
    fn search_palette(&self) -> Vec<_> { Vec::new() }
    fn on_search_result(&mut self, _result_id: &str) {}
    fn on_action(&mut self, _action_id: &str) {}
}

fn ui(ctx: &egui::Context, header: &mut HeaderState) {
    draw_header(ctx, &header.layout, header);
}
```

Los módulos de ejemplo del crate (`vscode_shell::examples`) incluyen un shell
completo que muestra cómo combinar los cuatro paneles.

## LayoutConfig y sidebars colapsables

[`LayoutConfig`](src/layout.rs) centraliza la visibilidad y el ancho de cada
panel. Los componentes laterales emiten señales mediante `emit_navigation_signal`
y `emit_resource_signal` para notificar cuando el usuario colapsa o expande un
sidebar. Puedes consultar dichas señales con `take_navigation_signal()` y
`take_resource_signal()` para sincronizar tu propio estado o persistir la
configuración.

## Personalizar tema y fuentes

El módulo [`ui::theme`](../../src/ui/theme.rs) expone la estructura
`ThemeTokens`, que agrupa paletas de color, escalas de espaciado, radios de
redondeo y tipografías. También incorpora niveles de elevación (`ThemeElevation`)
y estados de interacción (`ThemeInteractionStates`) para diferenciar fondos,
bordes y sombras de los componentes.

Al arrancar la aplicación puedes partir de un preset integrado e inspirarte en
los esquemas de VSCode (oscuro y claro), ajustando los tokens necesarios antes
de aplicarlos desde tu implementación de `AppShell`:

```rust
use jungle_monk_ai::ui::theme::{self, ThemePreset, ThemeTokens};

fn init(&mut self, cc: &eframe::CreationContext<'_>) {
    let mut tokens = ThemeTokens::from_preset(ThemePreset::Light);
    // Ajusta detalles adicionales tras cargar el preset.
    tokens.typography.title.size = 20.0;
    tokens.spacing.button_padding = egui::vec2(16.0, 8.0);

    // Instala las fuentes que utilizará el tema antes de aplicarlo.
    theme::install_fonts(&cc.egui_ctx, theme::default_font_sources());
    theme::apply(&cc.egui_ctx, &tokens);
}
```

Para variantes oscuras basta con utilizar el preset correspondiente y, si lo
deseas, modificar algunos valores puntuales de la paleta o los estados de
interacción:

```rust
let mut dark_tokens = ThemeTokens::from_preset(ThemePreset::Dark);
dark_tokens.palette.primary = egui::Color32::from_rgb(102, 126, 234); // azul frío
dark_tokens.states.hover.background = egui::Color32::from_rgb(48, 54, 70);
```

Además, `ThemeTokens` incluye niveles de sombra (`ThemeElevation`) pensados
para tarjetas y menús flotantes, junto con tipografías explícitas para
encabezados, cuerpo y texto monoespaciado. Puedes ajustar estos tokens para
alinearlos con la identidad visual de tu producto.

### Fuentes personalizadas e iconos

`install_fonts` acepta cualquier iterador de [`FontSource`], lo que permite
cargar tipografías desde bytes estáticos, vectores en memoria o cargadores
dinámicos. Para sustituir la fuente de iconos por un archivo local basta con
crear un `FontSource::from_loader` que devuelva los bytes en tiempo de ejecución
y lo asocie a la familia `"icons"` (la utilizada por `theme::icon_font`):

```rust
use std::fs;
use jungle_monk_ai::ui::theme::{self, FontFamily, FontSource};

let icon_loader = FontSource::from_loader(
    "custom-icons",
    FontFamily::Name("icons".into()),
    0,
    || fs::read("assets/icons.ttf").ok(),
);

theme::install_fonts(&cc.egui_ctx, [icon_loader]);
```

También puedes combinar varias fuentes (por ejemplo, tipografía principal e
iconos) concatenando iteradores. Si necesitas conservar la fuente de iconos por
defecto, añade `theme::default_font_sources()` a la colección antes de llamar a
`install_fonts`.
