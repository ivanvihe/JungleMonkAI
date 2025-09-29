# Plantilla VSCode Shell

Esta plantilla encapsula el arranque de una aplicación basada en `eframe` y
expone un `run` reutilizable que ejecuta cualquier estado que implemente el
rasgo [`AppShell`](src/lib.rs).

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

## Inyectar vistas personalizadas mediante _closures_

Puedes combinar un estado propio con _closures_ que reciban `&Context` y un
estado mutable para construir vistas especializadas. Por ejemplo:

```rust
use eframe::egui::Context;
use vscode_shell::AppShell;

struct CustomViewShell<State, View>
where
    View: FnMut(&Context, &mut State) + 'static,
    State: 'static,
{
    state: State,
    view: View,
}

impl<State, View> CustomViewShell<State, View>
where
    View: FnMut(&Context, &mut State) + 'static,
    State: 'static,
{
    fn new(state: State, view: View) -> Self {
        Self { state, view }
    }
}

impl<State, View> AppShell for CustomViewShell<State, View>
where
    View: FnMut(&Context, &mut State) + 'static,
    State: 'static,
{
    fn init(&mut self, _cc: &eframe::CreationContext<'_>) {
        // Configura el estado o el tema inicial si es necesario.
    }

    fn update(&mut self, ctx: &Context) {
        (self.view)(ctx, &mut self.state);
    }
}
```

Con este patrón puedes inyectar cualquier vista declarativa sin modificar la
plantilla: basta con encapsular el estado y la _closure_ dentro de un tipo que
implemente `AppShell` y pasarlo a `run`.

## Personalizar tema y fuentes

El módulo [`ui::theme`](../../src/ui/theme.rs) expone la estructura
`ThemeTokens`, que agrupa paletas de color, escalas de espaciado y radios de
redondeo. Al arrancar la aplicación puedes clonar el tema predeterminado,
ajustar sus valores y aplicarlo desde tu implementación de `AppShell`:

```rust
use jungle_monk_ai::ui::theme::{self, ThemeTokens};

fn init(&mut self, cc: &eframe::CreationContext<'_>) {
    let mut tokens = ThemeTokens::default();
    // Tema claro: mayor contraste en paneles y texto oscuro.
    tokens.palette.dark_mode = false;
    tokens.palette.root_background = egui::Color32::from_rgb(245, 247, 250);
    tokens.palette.panel_background = egui::Color32::from_rgb(255, 255, 255);
    tokens.palette.text_primary = egui::Color32::from_rgb(45, 55, 72);
    tokens.palette.text_weak = egui::Color32::from_rgb(113, 128, 150);
    tokens.palette.border = egui::Color32::from_rgb(226, 232, 240);

    // Instala las fuentes que utilizará el tema antes de aplicarlo.
    theme::install_fonts(&cc.egui_ctx, theme::default_font_sources());
    theme::apply(&cc.egui_ctx, &tokens);
}
```

Para variantes oscuras basta con modificar los campos `palette.*` apropiados:

```rust
let mut dark_tokens = ThemeTokens::default();
dark_tokens.palette.primary = egui::Color32::from_rgb(102, 126, 234); // azul frío
dark_tokens.palette.hover_background = egui::Color32::from_rgb(48, 54, 70);
dark_tokens.spacing.button_padding = egui::vec2(16.0, 8.0);
```

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
