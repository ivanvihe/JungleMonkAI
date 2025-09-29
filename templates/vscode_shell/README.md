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
