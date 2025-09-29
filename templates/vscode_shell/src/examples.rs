//! Ejemplos de integración del shell reutilizable.
//!
//! ```no_run
//! use eframe::egui;
//! use vscode_shell::{
//!     components::{
//!         draw_header, draw_main_content, draw_resource_panel, draw_sidebar, HeaderAction,
//!         HeaderModel, HeaderProps, MainContentAction, MainContentModel, MainContentProps,
//!         MainContentTab, NavigationModel, ResourcePanelModel, ResourcePanelProps,
//!         ResourceSectionProps, SearchGroup, SearchResult, SidebarItem, SidebarProps,
//!         SidebarSection,
//!     },
//!     layout::{LayoutConfig, ShellTheme},
//!     AppShell,
//! };
//!
//! struct DemoShell {
//!     layout: LayoutConfig,
//! }
//!
//! impl DemoShell {
//!     fn new() -> Self {
//!         Self {
//!             layout: LayoutConfig::default(),
//!         }
//!     }
//! }
//!
//! impl HeaderModel for DemoShell {
//!     fn theme(&self) -> ShellTheme {
//!         ShellTheme::default()
//!     }
//!
//!     fn props(&self) -> HeaderProps {
//!         HeaderProps {
//!             title: "Demo".into(),
//!             subtitle: Some("Shell mínimo".into()),
//!             search_placeholder: Some("Buscar".into()),
//!             actions: vec![HeaderAction::new("settings", "Ajustes")],
//!             logo_acronym: Some("DM".into()),
//!         }
//!     }
//!
//!     fn search_value(&self) -> String {
//!         String::new()
//!     }
//!
//!     fn set_search_value(&mut self, _value: String) {}
//!
//!     fn search_palette(&self) -> Vec<SearchGroup> {
//!         vec![SearchGroup {
//!             id: "welcome".into(),
//!             title: "Recientes".into(),
//!             results: vec![SearchResult {
//!                 id: "first".into(),
//!                 title: "Abrir panel principal".into(),
//!                 subtitle: "Demostración".into(),
//!                 action_hint: Some("Enter para abrir".into()),
//!             }],
//!         }]
//!     }
//!
//!     fn on_search_result(&mut self, _result_id: &str) {}
//!
//!     fn on_action(&mut self, _action_id: &str) {}
//! }
//!
//! impl NavigationModel for DemoShell {
//!     fn theme(&self) -> ShellTheme {
//!         ShellTheme::default()
//!     }
//!
//!     fn props(&self) -> SidebarProps {
//!         SidebarProps {
//!             title: Some("Navegación".into()),
//!             sections: vec![SidebarSection {
//!                 id: "main".into(),
//!                 title: "General".into(),
//!                 items: vec![SidebarItem {
//!                     id: "chat".into(),
//!                     label: "Chat".into(),
//!                     description: None,
//!                     icon: Some("💬".into()),
//!                     badge: None,
//!                     selected: true,
//!                 }],
//!             }],
//!             collapse_button_tooltip: Some("Ocultar navegación".into()),
//!         }
//!     }
//!
//!     fn on_item_selected(&mut self, _item_id: &str) {}
//! }
//!
//! impl ResourcePanelModel for DemoShell {
//!     fn theme(&self) -> ShellTheme {
//!         ShellTheme::default()
//!     }
//!
//!     fn props(&self) -> ResourcePanelProps {
//!         ResourcePanelProps {
//!             title: Some("Recursos".into()),
//!             sections: vec![ResourceSectionProps {
//!                 id: "favorites".into(),
//!                 title: "Favoritos".into(),
//!                 description: None,
//!                 items: Vec::new(),
//!             }],
//!             collapse_button_tooltip: Some("Ocultar recursos".into()),
//!         }
//!     }
//!
//!     fn on_item_selected(&mut self, _item_id: &str) {}
//! }
//!
//! impl MainContentModel for DemoShell {
//!     fn theme(&self) -> ShellTheme {
//!         ShellTheme::default()
//!     }
//!
//!     fn props(&self) -> MainContentProps {
//!         MainContentProps {
//!             title: Some("Panel principal".into()),
//!             subtitle: Some("El contenido se inyecta como closure".into()),
//!             actions: vec![MainContentAction::new("refresh", "Actualizar")],
//!             tabs: vec![MainContentTab {
//!                 id: "chat".into(),
//!                 label: "Chat".into(),
//!                 icon: None,
//!             }],
//!             active_tab: Some("chat".into()),
//!         }
//!     }
//!
//!     fn on_action(&mut self, _action_id: &str) {}
//!
//!     fn on_tab_selected(&mut self, _tab_id: &str) {}
//!
//!     fn show_content(&mut self, ui: &mut egui::Ui) {
//!         ui.label("Contenido renderizado desde el consumidor");
//!     }
//! }
//!
//! impl AppShell for DemoShell {
//!     fn init(&mut self, _cc: &eframe::CreationContext<'_>) {}
//!
//!     fn update(&mut self, ctx: &egui::Context) {
//!         draw_header(ctx, &self.layout, self);
//!         let mut layout = self.layout.clone();
//!         draw_sidebar(ctx, &mut layout, self);
//!         draw_resource_panel(ctx, &mut layout, self);
//!         draw_main_content(ctx, &layout, self);
//!     }
//! }
//! ```
