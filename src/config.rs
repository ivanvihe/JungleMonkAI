use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Datos de configuración específicos de un proveedor de modelos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// API key opcional (algunos proveedores permiten tokens vacíos para cuentas gratuitas).
    pub api_key: Option<String>,
    /// Modelo por defecto con el que se realizarán las peticiones.
    pub default_model: String,
    /// Alias que el usuario utilizará dentro del chat para invocar al proveedor.
    pub alias: String,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            default_model: String::new(),
            alias: String::new(),
        }
    }
}

/// Preferencias para gestionar el agente local "Jarvis".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JarvisConfig {
    pub model_path: String,
    pub install_dir: String,
    pub auto_start: bool,
    /// Modelos instalados codificados como `proveedor::identificador`.
    pub installed_models: Vec<String>,
    #[serde(default)]
    pub active_model: Option<String>,
    #[serde(default = "JarvisConfig::default_alias")]
    pub chat_alias: String,
    #[serde(default)]
    pub respond_without_alias: bool,
}

impl Default for JarvisConfig {
    fn default() -> Self {
        Self {
            model_path: "/models/jarvis/latest.bin".to_string(),
            install_dir: "models/jarvis".to_string(),
            auto_start: true,
            installed_models: Vec::new(),
            active_model: None,
            chat_alias: Self::default_alias(),
            respond_without_alias: false,
        }
    }
}

impl JarvisConfig {
    fn default_alias() -> String {
        "jarvis".to_string()
    }
}

/// Preferencias relacionadas con catálogos de modelos descargables.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelProviderConfig {
    pub access_token: Option<String>,
    pub last_search_query: String,
}

/// Estructura para la configuración persistente de la aplicación.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub anthropic: ProviderConfig,
    pub openai: ProviderConfig,
    pub groq: ProviderConfig,
    pub github_token: Option<String>,
    pub cache_directory: String,
    pub cache_size_limit_gb: f32,
    pub enable_auto_cleanup: bool,
    pub cache_cleanup_interval_hours: u32,
    pub resource_memory_limit_gb: f32,
    pub resource_disk_limit_gb: f32,
    pub custom_commands: Vec<crate::state::CustomCommand>,
    pub enable_memory_tracking: bool,
    pub memory_retention_days: u32,
    pub profiles: Vec<String>,
    pub selected_profile: Option<usize>,
    pub projects: Vec<String>,
    pub selected_project: Option<usize>,
    pub jarvis: JarvisConfig,
    pub huggingface: ModelProviderConfig,
    #[serde(default)]
    pub github_models: ModelProviderConfig,
    #[serde(default)]
    pub replicate: ModelProviderConfig,
    #[serde(default)]
    pub ollama: ModelProviderConfig,
    #[serde(default)]
    pub openrouter: ModelProviderConfig,
    #[serde(default)]
    pub modelscope: ModelProviderConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            anthropic: ProviderConfig {
                api_key: None,
                default_model: "claude-3-opus-20240229".to_string(),
                alias: "claude".to_string(),
            },
            openai: ProviderConfig {
                api_key: None,
                default_model: "gpt-4.1-mini".to_string(),
                alias: "gpt".to_string(),
            },
            groq: ProviderConfig {
                api_key: None,
                default_model: "llama3-70b-8192".to_string(),
                alias: "groq".to_string(),
            },
            github_token: None,
            cache_directory: "/var/tmp/jungle/cache".to_string(),
            cache_size_limit_gb: 8.0,
            enable_auto_cleanup: true,
            cache_cleanup_interval_hours: 24,
            resource_memory_limit_gb: 32.0,
            resource_disk_limit_gb: 128.0,
            custom_commands: crate::state::default_custom_commands(),
            enable_memory_tracking: true,
            memory_retention_days: 30,
            profiles: vec![
                "Default".to_string(),
                "Research".to_string(),
                "Operations".to_string(),
            ],
            selected_profile: Some(0),
            projects: vec!["Autonomous Agent".to_string(), "RAG Pipeline".to_string()],
            selected_project: Some(0),
            jarvis: JarvisConfig::default(),
            huggingface: ModelProviderConfig::default(),
            github_models: ModelProviderConfig::default(),
            replicate: ModelProviderConfig::default(),
            ollama: ModelProviderConfig::default(),
            openrouter: ModelProviderConfig::default(),
            modelscope: ModelProviderConfig::default(),
        }
    }
}

impl AppConfig {
    fn config_path() -> anyhow::Result<PathBuf> {
        let base = dirs::config_dir().unwrap_or_else(|| Path::new(".").to_path_buf());
        let dir = base.join("JungleMonkAI");
        fs::create_dir_all(&dir).with_context(|| format!("No se pudo crear {:?}", dir))?;
        Ok(dir.join("config.json"))
    }

    pub fn load_or_default() -> Self {
        let path = match Self::config_path() {
            Ok(path) => path,
            Err(_) => return Self::default(),
        };

        let data = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => return Self::default(),
        };

        serde_json::from_str(&data).unwrap_or_else(|_| Self::default())
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::config_path()?;
        let json = serde_json::to_string_pretty(self)?;
        fs::write(&path, json).with_context(|| format!("No se pudo guardar {:?}", path))
    }
}
