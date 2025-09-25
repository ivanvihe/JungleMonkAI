use std::time::Duration;

use eframe::egui::{
    self, style::ScrollStyle, Color32, FontDefinitions, FontFamily, FontId, Stroke,
};
use once_cell::sync::OnceCell;

const ICON_FONT_URL: &str =
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.ttf";

const ICON_FONT_ID: &str = "fa-solid";
const ICON_FONT_FAMILY: &str = "icons";

static ICON_FONT_CACHE: OnceCell<Option<Vec<u8>>> = OnceCell::new();

const BG_ROOT: Color32 = Color32::from_rgb(28, 28, 28);
const BG_PANEL: Color32 = Color32::from_rgb(32, 32, 32);
const BG_HOVER: Color32 = Color32::from_rgb(44, 44, 44);
const BG_ACTIVE: Color32 = Color32::from_rgb(25, 118, 210);
const BG_SECONDARY: Color32 = Color32::from_rgb(38, 38, 38);
const TEXT_PRIMARY: Color32 = Color32::from_rgb(224, 224, 224);
const TEXT_WEAK: Color32 = Color32::from_rgb(170, 170, 170);
const BORDER: Color32 = Color32::from_rgb(48, 48, 48);

pub fn apply(ctx: &egui::Context) {
    install_fonts(ctx);

    let mut style = (*ctx.style()).clone();
    style.visuals = build_visuals();

    style.spacing.item_spacing = egui::vec2(12.0, 8.0);
    style.spacing.button_padding = egui::vec2(12.0, 6.0);
    style.spacing.interact_size.y = 28.0;
    style.spacing.scroll = ScrollStyle {
        floating: false,
        bar_width: 6.0,
        bar_inner_margin: 2.0,
        bar_outer_margin: 4.0,
        floating_width: 6.0,
        handle_min_length: 12.0,
        floating_allocated_width: 0.0,
        foreground_color: true,
        dormant_background_opacity: 0.0,
        active_background_opacity: 0.4,
        interact_background_opacity: 0.6,
        dormant_handle_opacity: 0.0,
        active_handle_opacity: 0.6,
        interact_handle_opacity: 0.9,
    };
    style.visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER);

    ctx.set_style(style);
}

fn build_visuals() -> egui::Visuals {
    let mut visuals = egui::Visuals::dark();
    visuals.dark_mode = true;
    visuals.override_text_color = Some(TEXT_PRIMARY);
    visuals.window_fill = BG_PANEL;
    visuals.panel_fill = BG_ROOT;
    visuals.extreme_bg_color = Color32::from_rgb(18, 18, 18);
    visuals.faint_bg_color = Color32::from_rgb(30, 30, 30);
    visuals.hyperlink_color = Color32::from_rgb(0, 102, 204);
    visuals.selection.bg_fill = Color32::from_rgb(42, 60, 88);
    visuals.selection.stroke = Stroke::new(1.0, Color32::from_rgb(64, 120, 180));
    visuals.window_rounding = egui::Rounding::ZERO;
    visuals.menu_rounding = egui::Rounding::ZERO;
    visuals.widgets.noninteractive.rounding = egui::Rounding::ZERO;

    let mut noninteractive = visuals.widgets.noninteractive.clone();
    noninteractive.bg_fill = BG_PANEL;
    noninteractive.bg_stroke = Stroke::new(1.0, BORDER);
    noninteractive.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    noninteractive.rounding = egui::Rounding::ZERO;

    let mut inactive = visuals.widgets.inactive.clone();
    inactive.bg_fill = BG_SECONDARY;
    inactive.weak_bg_fill = BG_ROOT;
    inactive.bg_stroke = Stroke::new(1.0, BORDER);
    inactive.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    inactive.rounding = egui::Rounding::ZERO;

    let mut hovered = visuals.widgets.hovered.clone();
    hovered.bg_fill = BG_HOVER;
    hovered.weak_bg_fill = BG_SECONDARY;
    hovered.bg_stroke = Stroke::new(1.0, Color32::from_rgb(70, 70, 70));
    hovered.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    hovered.rounding = egui::Rounding::ZERO;

    let mut active = visuals.widgets.active.clone();
    active.bg_fill = BG_ACTIVE;
    active.weak_bg_fill = BG_ACTIVE;
    active.bg_stroke = Stroke::new(1.0, Color32::from_rgb(23, 105, 185));
    active.fg_stroke = Stroke::new(1.0, Color32::from_rgb(240, 240, 240));
    active.rounding = egui::Rounding::ZERO;

    visuals.widgets.noninteractive = noninteractive;
    visuals.widgets.inactive = inactive;
    visuals.widgets.hovered = hovered;
    visuals.widgets.active = active.clone();
    visuals.widgets.open = active;

    visuals
}

fn install_fonts(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();

    if let Some(bytes) = icon_font_bytes() {
        fonts.font_data.insert(
            ICON_FONT_ID.to_owned(),
            egui::FontData::from_owned(bytes.clone()),
        );

        fonts
            .families
            .entry(icon_family())
            .or_default()
            .insert(0, ICON_FONT_ID.to_owned());
    }

    ctx.set_fonts(fonts);
}

pub fn primary_button<'a>(text: impl Into<egui::WidgetText>) -> egui::Button<'a> {
    egui::Button::new(text).fill(BG_ACTIVE)
}

pub fn secondary_button<'a>(text: impl Into<egui::WidgetText>) -> egui::Button<'a> {
    egui::Button::new(text).fill(BG_SECONDARY)
}

pub fn subtle_border() -> Stroke {
    Stroke::new(1.0, BORDER)
}

pub const COLOR_TEXT_WEAK: Color32 = TEXT_WEAK;
pub const COLOR_TEXT_PRIMARY: Color32 = TEXT_PRIMARY;
pub const COLOR_SUCCESS: Color32 = Color32::from_rgb(0, 204, 102);
pub const COLOR_DANGER: Color32 = Color32::from_rgb(204, 51, 51);
pub const COLOR_PRIMARY: Color32 = Color32::from_rgb(25, 118, 210);
pub const COLOR_PANEL: Color32 = BG_ROOT;
pub const COLOR_HEADER: Color32 = Color32::from_rgb(42, 42, 42);

pub fn icon_font(size: f32) -> FontId {
    FontId::new(size, icon_family())
}

fn icon_family() -> FontFamily {
    FontFamily::Name(ICON_FONT_FAMILY.into())
}

fn icon_font_bytes() -> Option<&'static Vec<u8>> {
    ICON_FONT_CACHE.get_or_init(|| fetch_icon_font()).as_ref()
}

fn fetch_icon_font() -> Option<Vec<u8>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|err| eprintln!("No se pudo crear el cliente HTTP para la fuente: {err}"))
        .ok()?;

    let response = client
        .get(ICON_FONT_URL)
        .send()
        .map_err(|err| eprintln!("No se pudo descargar la fuente de iconos: {err}"))
        .ok()?;

    if !response.status().is_success() {
        eprintln!(
            "Descarga de fuente de iconos fallida con estado {}",
            response.status()
        );
        return None;
    }

    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|err| eprintln!("No se pudo leer la fuente de iconos: {err}"))
        .ok()
}
