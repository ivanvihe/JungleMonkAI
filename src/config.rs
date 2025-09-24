use serde::{Deserialize, Serialize};

/// Estructura para la configuración de la aplicación, cargada desde un archivo.
#[derive(Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub openai_api_key: Option<String>,
    pub claude_api_key: Option<String>,
    pub groq_api_key: Option<String>,
    // ... otros campos de configuración
}
