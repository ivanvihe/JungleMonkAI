use eframe::egui;
use eframe::{App, CreationContext, Frame, NativeOptions};

/// Trait que abstrae el estado y comportamiento de una shell basada en egui.
pub trait AppShell: 'static {
    /// Inicializa el estado con el contexto de creación de eframe.
    fn init(&mut self, cc: &CreationContext<'_>);

    /// Renderiza la shell en cada frame con acceso al contexto global de egui.
    fn update(&mut self, ctx: &egui::Context);
}

struct MultimodalApp {
    shell: Box<dyn AppShell>,
}

impl MultimodalApp {
    fn new(mut shell: Box<dyn AppShell>, cc: &CreationContext<'_>) -> Self {
        shell.init(cc);
        Self { shell }
    }
}

impl App for MultimodalApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut Frame) {
        self.shell.update(ctx);
    }
}

/// Ejecuta una aplicación shell reutilizable basada en egui.
///
/// El `app_builder` se invoca una única vez para crear el estado concreto que
/// implementa [`AppShell`]. Este estado será inicializado con el
/// [`CreationContext`] y posteriormente recibirá llamadas a [`AppShell::update`]
/// en cada frame.
pub fn run(app_builder: impl FnOnce() -> Box<dyn AppShell> + 'static) -> Result<(), eframe::Error> {
    let options = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size(egui::vec2(1280.0, 800.0))
            .with_maximized(true),
        ..Default::default()
    };

    let mut builder = Some(app_builder);

    eframe::run_native(
        "Multimodal Agent",
        options,
        Box::new(move |cc| {
            let shell = builder
                .take()
                .expect("app_builder solo puede ejecutarse una vez")();
            Box::new(MultimodalApp::new(shell, cc))
        }),
    )
}
