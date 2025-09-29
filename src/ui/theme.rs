use std::borrow::Cow;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

use eframe::egui::{
    self, epaint::Shadow, style::ScrollStyle, Color32, FontData, FontDefinitions, FontFamily,
    FontId, Rounding, Stroke, Vec2,
};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};

const ICON_FONT_URL: &str =
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.ttf";

const ICON_FONT_ID: &str = "fa-solid";
const ICON_FONT_FAMILY: &str = "icons";

static ICON_FONT_CACHE: OnceCell<Option<Vec<u8>>> = OnceCell::new();
static CURRENT_THEME: OnceLock<RwLock<ThemeTokens>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct ThemeTokens {
    pub palette: ThemePalette,
    pub spacing: ThemeSpacing,
    pub rounding: ThemeRounding,
    pub typography: ThemeTypography,
    pub elevation: ThemeElevation,
    pub states: ThemeInteractionStates,
}

impl Default for ThemeTokens {
    fn default() -> Self {
        Self::from_preset(ThemePreset::default())
    }
}

impl ThemeTokens {
    pub fn from_preset(preset: ThemePreset) -> Self {
        match preset {
            ThemePreset::Dark => Self {
                palette: ThemePalette::dark(),
                spacing: ThemeSpacing::default(),
                rounding: ThemeRounding::default(),
                typography: ThemeTypography::default(),
                elevation: ThemeElevation::dark(),
                states: ThemeInteractionStates::dark(),
            },
            ThemePreset::Light => Self {
                palette: ThemePalette::light(),
                spacing: ThemeSpacing::default(),
                rounding: ThemeRounding::default(),
                typography: ThemeTypography::light(),
                elevation: ThemeElevation::light(),
                states: ThemeInteractionStates::light(),
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreset {
    Dark,
    Light,
}

impl Default for ThemePreset {
    fn default() -> Self {
        ThemePreset::Dark
    }
}

#[derive(Clone, Debug)]
pub struct ThemePalette {
    pub dark_mode: bool,
    pub root_background: Color32,
    pub panel_background: Color32,
    pub active_background: Color32,
    pub secondary_background: Color32,
    pub text_primary: Color32,
    pub text_weak: Color32,
    pub border: Color32,
    pub extreme_background: Color32,
    pub faint_background: Color32,
    pub hyperlink: Color32,
    pub selection_background: Color32,
    pub selection_stroke: Stroke,
    pub success: Color32,
    pub danger: Color32,
    pub primary: Color32,
    pub header_background: Color32,
}

impl ThemePalette {
    fn dark() -> Self {
        Self {
            dark_mode: true,
            root_background: Color32::from_rgb(28, 28, 28),
            panel_background: Color32::from_rgb(32, 32, 32),
            active_background: Color32::from_rgb(25, 118, 210),
            secondary_background: Color32::from_rgb(38, 38, 38),
            text_primary: Color32::from_rgb(224, 224, 224),
            text_weak: Color32::from_rgb(170, 170, 170),
            border: Color32::from_rgb(48, 48, 48),
            extreme_background: Color32::from_rgb(18, 18, 18),
            faint_background: Color32::from_rgb(30, 30, 30),
            hyperlink: Color32::from_rgb(0, 102, 204),
            selection_background: Color32::from_rgb(42, 60, 88),
            selection_stroke: Stroke::new(1.0, Color32::from_rgb(64, 120, 180)),
            success: Color32::from_rgb(0, 204, 102),
            danger: Color32::from_rgb(204, 51, 51),
            primary: Color32::from_rgb(25, 118, 210),
            header_background: Color32::from_rgb(42, 42, 42),
        }
    }

    fn light() -> Self {
        Self {
            dark_mode: false,
            root_background: Color32::from_rgb(242, 243, 245),
            panel_background: Color32::from_rgb(248, 249, 251),
            active_background: Color32::from_rgb(0, 120, 212),
            secondary_background: Color32::from_rgb(232, 235, 241),
            text_primary: Color32::from_rgb(33, 37, 41),
            text_weak: Color32::from_rgb(95, 104, 115),
            border: Color32::from_rgb(205, 208, 213),
            extreme_background: Color32::from_rgb(255, 255, 255),
            faint_background: Color32::from_rgb(236, 239, 244),
            hyperlink: Color32::from_rgb(0, 102, 204),
            selection_background: Color32::from_rgb(204, 229, 255),
            selection_stroke: Stroke::new(1.0, Color32::from_rgb(0, 92, 170)),
            success: Color32::from_rgb(0, 138, 0),
            danger: Color32::from_rgb(184, 38, 61),
            primary: Color32::from_rgb(0, 120, 212),
            header_background: Color32::from_rgb(236, 239, 244),
        }
    }
}

impl Default for ThemePalette {
    fn default() -> Self {
        ThemePalette::dark()
    }
}

#[derive(Clone, Debug)]
pub struct ThemeSpacing {
    pub item_spacing: Vec2,
    pub button_padding: Vec2,
    pub interact_size_y: f32,
    pub scroll: ScrollTokens,
}

#[derive(Clone, Debug)]
pub struct ThemeTypography {
    pub heading: FontId,
    pub title: FontId,
    pub body: FontId,
    pub body_small: FontId,
    pub monospace: FontId,
}

impl ThemeTypography {
    fn default() -> Self {
        Self {
            heading: FontId::new(22.0, FontFamily::Proportional),
            title: FontId::new(18.0, FontFamily::Proportional),
            body: FontId::new(14.0, FontFamily::Proportional),
            body_small: FontId::new(12.0, FontFamily::Proportional),
            monospace: FontId::new(13.0, FontFamily::Monospace),
        }
    }

    fn light() -> Self {
        Self::default()
    }
}

#[derive(Clone, Debug)]
pub struct ThemeElevation {
    pub window: Shadow,
    pub overlay: Shadow,
}

impl ThemeElevation {
    fn dark() -> Self {
        Self {
            window: Shadow {
                offset: Vec2::new(0.0, 4.0),
                blur: 12.0,
                spread: 0.0,
                color: Color32::from_rgba_unmultiplied(0, 0, 0, 48),
            },
            overlay: Shadow {
                offset: Vec2::new(0.0, 8.0),
                blur: 28.0,
                spread: 2.0,
                color: Color32::from_rgba_unmultiplied(0, 0, 0, 96),
            },
        }
    }

    fn light() -> Self {
        Self {
            window: Shadow {
                offset: Vec2::new(0.0, 2.0),
                blur: 18.0,
                spread: 0.0,
                color: Color32::from_rgba_unmultiplied(15, 23, 42, 48),
            },
            overlay: Shadow {
                offset: Vec2::new(0.0, 6.0),
                blur: 32.0,
                spread: 2.0,
                color: Color32::from_rgba_unmultiplied(15, 23, 42, 120),
            },
        }
    }
}

#[derive(Clone, Debug)]
pub struct ThemeInteractionStates {
    pub hover: ThemeInteractionState,
    pub focus: ThemeInteractionState,
    pub disabled: ThemeInteractionState,
}

impl ThemeInteractionStates {
    fn dark() -> Self {
        Self {
            hover: ThemeInteractionState::new(
                Color32::from_rgb(44, 44, 44),
                Color32::from_rgb(224, 224, 224),
                Color32::from_rgb(70, 70, 70),
            ),
            focus: ThemeInteractionState::new(
                Color32::from_rgb(25, 118, 210),
                Color32::from_rgb(240, 240, 240),
                Color32::from_rgb(23, 105, 185),
            ),
            disabled: ThemeInteractionState::new(
                Color32::from_rgb(36, 36, 36),
                Color32::from_rgb(128, 128, 128),
                Color32::from_rgb(48, 48, 48),
            ),
        }
    }

    fn light() -> Self {
        Self {
            hover: ThemeInteractionState::new(
                Color32::from_rgb(228, 233, 243),
                Color32::from_rgb(33, 37, 41),
                Color32::from_rgb(175, 182, 196),
            ),
            focus: ThemeInteractionState::new(
                Color32::from_rgb(0, 120, 212),
                Color32::from_rgb(248, 249, 251),
                Color32::from_rgb(0, 92, 170),
            ),
            disabled: ThemeInteractionState::new(
                Color32::from_rgb(236, 239, 244),
                Color32::from_rgb(145, 152, 162),
                Color32::from_rgb(205, 208, 213),
            ),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ThemeInteractionState {
    pub background: Color32,
    pub foreground: Color32,
    pub border: Color32,
}

impl ThemeInteractionState {
    const fn new(background: Color32, foreground: Color32, border: Color32) -> Self {
        Self {
            background,
            foreground,
            border,
        }
    }
}

impl Default for ThemeSpacing {
    fn default() -> Self {
        Self {
            item_spacing: Vec2::new(12.0, 8.0),
            button_padding: Vec2::new(12.0, 6.0),
            interact_size_y: 28.0,
            scroll: ScrollTokens::default(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ScrollTokens {
    pub floating: bool,
    pub bar_width: f32,
    pub bar_inner_margin: f32,
    pub bar_outer_margin: f32,
    pub floating_width: f32,
    pub handle_min_length: f32,
    pub floating_allocated_width: f32,
    pub foreground_color: bool,
    pub dormant_background_opacity: f32,
    pub active_background_opacity: f32,
    pub interact_background_opacity: f32,
    pub dormant_handle_opacity: f32,
    pub active_handle_opacity: f32,
    pub interact_handle_opacity: f32,
}

impl ScrollTokens {
    fn to_scroll_style(&self) -> ScrollStyle {
        ScrollStyle {
            floating: self.floating,
            bar_width: self.bar_width,
            bar_inner_margin: self.bar_inner_margin,
            bar_outer_margin: self.bar_outer_margin,
            floating_width: self.floating_width,
            handle_min_length: self.handle_min_length,
            floating_allocated_width: self.floating_allocated_width,
            foreground_color: self.foreground_color,
            dormant_background_opacity: self.dormant_background_opacity,
            active_background_opacity: self.active_background_opacity,
            interact_background_opacity: self.interact_background_opacity,
            dormant_handle_opacity: self.dormant_handle_opacity,
            active_handle_opacity: self.active_handle_opacity,
            interact_handle_opacity: self.interact_handle_opacity,
        }
    }
}

impl Default for ScrollTokens {
    fn default() -> Self {
        Self {
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
        }
    }
}

#[derive(Clone, Debug)]
pub struct ThemeRounding {
    pub window: Rounding,
    pub menu: Rounding,
    pub widget: Rounding,
}

impl Default for ThemeRounding {
    fn default() -> Self {
        Self {
            window: Rounding::ZERO,
            menu: Rounding::ZERO,
            widget: Rounding::ZERO,
        }
    }
}

#[allow(dead_code)]
#[derive(Clone)]
pub enum FontDataSource {
    Static(&'static [u8]),
    Bytes(Vec<u8>),
    Loader(std::sync::Arc<dyn Fn() -> Option<Vec<u8>> + Send + Sync>),
}

#[derive(Clone)]
pub struct FontSource {
    pub id: Cow<'static, str>,
    pub family: FontFamily,
    pub priority: usize,
    pub data: FontDataSource,
}

#[allow(dead_code)]
impl FontSource {
    pub fn from_static(
        id: impl Into<Cow<'static, str>>,
        data: &'static [u8],
        family: FontFamily,
        priority: usize,
    ) -> Self {
        Self {
            id: id.into(),
            family,
            priority,
            data: FontDataSource::Static(data),
        }
    }

    pub fn from_bytes(
        id: impl Into<Cow<'static, str>>,
        data: Vec<u8>,
        family: FontFamily,
        priority: usize,
    ) -> Self {
        Self {
            id: id.into(),
            family,
            priority,
            data: FontDataSource::Bytes(data),
        }
    }

    pub fn from_loader(
        id: impl Into<Cow<'static, str>>,
        family: FontFamily,
        priority: usize,
        loader: impl Fn() -> Option<Vec<u8>> + Send + Sync + 'static,
    ) -> Self {
        Self {
            id: id.into(),
            family,
            priority,
            data: FontDataSource::Loader(std::sync::Arc::new(loader)),
        }
    }
}

pub fn apply(ctx: &egui::Context, tokens: &ThemeTokens) {
    set_current_theme(tokens.clone());

    let mut style = (*ctx.style()).clone();
    style.visuals = build_visuals(tokens);
    style.spacing.item_spacing = tokens.spacing.item_spacing;
    style.spacing.button_padding = tokens.spacing.button_padding;
    style.spacing.interact_size.y = tokens.spacing.interact_size_y;
    style.spacing.scroll = tokens.spacing.scroll.to_scroll_style();
    style
        .text_styles
        .insert(egui::TextStyle::Heading, tokens.typography.heading.clone());
    style.text_styles.insert(
        egui::TextStyle::Name("Title".into()),
        tokens.typography.title.clone(),
    );
    style
        .text_styles
        .insert(egui::TextStyle::Body, tokens.typography.body.clone());
    style
        .text_styles
        .insert(egui::TextStyle::Button, tokens.typography.body.clone());
    style
        .text_styles
        .insert(egui::TextStyle::Small, tokens.typography.body_small.clone());
    style.text_styles.insert(
        egui::TextStyle::Monospace,
        tokens.typography.monospace.clone(),
    );

    ctx.set_style(style);
}

pub fn install_fonts(ctx: &egui::Context, font_sources: impl IntoIterator<Item = FontSource>) {
    let mut fonts = FontDefinitions::default();

    for source in font_sources {
        let id = source.id.to_string();
        let font_data = match source.data {
            FontDataSource::Static(bytes) => FontData::from_static(bytes),
            FontDataSource::Bytes(bytes) => FontData::from_owned(bytes),
            FontDataSource::Loader(loader) => match loader() {
                Some(bytes) => FontData::from_owned(bytes),
                None => continue,
            },
        };

        fonts.font_data.insert(id.clone(), font_data);

        let family = fonts.families.entry(source.family).or_default();
        let index = source.priority.min(family.len());
        family.insert(index, id);
    }

    ctx.set_fonts(fonts);
}

pub fn default_font_sources() -> Vec<FontSource> {
    vec![FontSource::from_loader(
        ICON_FONT_ID.to_owned(),
        icon_family(),
        0,
        || icon_font_bytes().map(|bytes| bytes.clone()),
    )]
}

pub fn primary_button<'a>(
    text: impl Into<egui::WidgetText>,
    tokens: &ThemeTokens,
) -> egui::Button<'a> {
    egui::Button::new(text).fill(tokens.palette.primary)
}

pub fn secondary_button<'a>(
    text: impl Into<egui::WidgetText>,
    tokens: &ThemeTokens,
) -> egui::Button<'a> {
    egui::Button::new(text).fill(tokens.palette.secondary_background)
}

pub fn subtle_border(tokens: &ThemeTokens) -> Stroke {
    Stroke::new(1.0, tokens.palette.border)
}

pub fn color_text_weak() -> Color32 {
    theme_tokens().read().unwrap().palette.text_weak
}

pub fn color_text_primary() -> Color32 {
    theme_tokens().read().unwrap().palette.text_primary
}

pub fn color_success() -> Color32 {
    theme_tokens().read().unwrap().palette.success
}

pub fn color_danger() -> Color32 {
    theme_tokens().read().unwrap().palette.danger
}

pub fn color_primary() -> Color32 {
    theme_tokens().read().unwrap().palette.primary
}

#[allow(dead_code)]
pub fn color_panel() -> Color32 {
    theme_tokens().read().unwrap().palette.root_background
}

#[allow(dead_code)]
pub fn color_header() -> Color32 {
    theme_tokens().read().unwrap().palette.header_background
}

pub fn icon_font(size: f32) -> FontId {
    FontId::new(size, icon_family())
}

fn theme_tokens() -> &'static RwLock<ThemeTokens> {
    CURRENT_THEME.get_or_init(|| RwLock::new(ThemeTokens::default()))
}

fn set_current_theme(tokens: ThemeTokens) {
    if let Ok(mut guard) = theme_tokens().write() {
        *guard = tokens;
    }
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

fn build_visuals(tokens: &ThemeTokens) -> egui::Visuals {
    let mut visuals = if tokens.palette.dark_mode {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    };

    visuals.dark_mode = tokens.palette.dark_mode;
    visuals.override_text_color = Some(tokens.palette.text_primary);
    visuals.window_fill = tokens.palette.panel_background;
    visuals.panel_fill = tokens.palette.root_background;
    visuals.extreme_bg_color = tokens.palette.extreme_background;
    visuals.faint_bg_color = tokens.palette.faint_background;
    visuals.hyperlink_color = tokens.palette.hyperlink;
    visuals.selection.bg_fill = tokens.palette.selection_background;
    visuals.selection.stroke = tokens.palette.selection_stroke;
    visuals.window_rounding = tokens.rounding.window;
    visuals.menu_rounding = tokens.rounding.menu;
    visuals.widgets.noninteractive.rounding = tokens.rounding.widget;
    visuals.window_shadow = tokens.elevation.window;
    visuals.popup_shadow = tokens.elevation.overlay;

    let mut noninteractive = visuals.widgets.noninteractive.clone();
    noninteractive.bg_fill = tokens.palette.panel_background;
    noninteractive.bg_stroke = Stroke::new(1.0, tokens.palette.border);
    noninteractive.fg_stroke = Stroke::new(1.0, tokens.palette.text_primary);
    noninteractive.rounding = tokens.rounding.widget;

    let mut inactive = visuals.widgets.inactive.clone();
    inactive.bg_fill = tokens.states.disabled.background;
    inactive.weak_bg_fill = tokens.palette.root_background;
    inactive.bg_stroke = Stroke::new(1.0, tokens.states.disabled.border);
    inactive.fg_stroke = Stroke::new(1.0, tokens.states.disabled.foreground);
    inactive.rounding = tokens.rounding.widget;

    let mut hovered = visuals.widgets.hovered.clone();
    hovered.bg_fill = tokens.states.hover.background;
    hovered.weak_bg_fill = tokens.palette.secondary_background;
    hovered.bg_stroke = Stroke::new(1.0, tokens.states.hover.border);
    hovered.fg_stroke = Stroke::new(1.0, tokens.states.hover.foreground);
    hovered.rounding = tokens.rounding.widget;

    let mut active = visuals.widgets.active.clone();
    active.bg_fill = tokens.states.focus.background;
    active.weak_bg_fill = tokens.palette.active_background;
    active.bg_stroke = Stroke::new(1.0, tokens.states.focus.border);
    active.fg_stroke = Stroke::new(1.0, tokens.states.focus.foreground);
    active.rounding = tokens.rounding.widget;

    visuals.widgets.noninteractive = noninteractive;
    visuals.widgets.inactive = inactive;
    visuals.widgets.hovered = hovered;
    visuals.widgets.active = active.clone();
    visuals.widgets.open = active;

    visuals
}
