use serde::{Deserialize, Serialize};
use std::fmt;

/// Proveedores soportados para instalar modelos locales en Jarvis.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum LocalModelProvider {
    HuggingFace,
    GithubModels,
    Replicate,
    Ollama,
    OpenRouter,
    Modelscope,
}

impl LocalModelProvider {
    pub const ALL: [LocalModelProvider; 6] = [
        LocalModelProvider::HuggingFace,
        LocalModelProvider::GithubModels,
        LocalModelProvider::Replicate,
        LocalModelProvider::Ollama,
        LocalModelProvider::OpenRouter,
        LocalModelProvider::Modelscope,
    ];

    /// Identificador estable utilizado para serializar el proveedor.
    pub fn key(self) -> &'static str {
        match self {
            LocalModelProvider::HuggingFace => "huggingface",
            LocalModelProvider::GithubModels => "github_models",
            LocalModelProvider::Replicate => "replicate",
            LocalModelProvider::Ollama => "ollama",
            LocalModelProvider::OpenRouter => "openrouter",
            LocalModelProvider::Modelscope => "modelscope",
        }
    }

    /// Nombre amigable mostrado en la interfaz.
    pub fn display_name(self) -> &'static str {
        match self {
            LocalModelProvider::HuggingFace => "Hugging Face",
            LocalModelProvider::GithubModels => "GitHub Models",
            LocalModelProvider::Replicate => "Replicate",
            LocalModelProvider::Ollama => "Ollama",
            LocalModelProvider::OpenRouter => "OpenRouter",
            LocalModelProvider::Modelscope => "ModelScope",
        }
    }

    /// Etiqueta del campo para configurar tokens o credenciales.
    pub fn token_label(self) -> &'static str {
        match self {
            LocalModelProvider::HuggingFace => "Token de acceso (opcional)",
            LocalModelProvider::GithubModels => "GitHub token (modelo)",
            LocalModelProvider::Replicate => "Replicate API token",
            LocalModelProvider::Ollama => "Host / token de Ollama",
            LocalModelProvider::OpenRouter => "OpenRouter API token",
            LocalModelProvider::Modelscope => "ModelScope access key",
        }
    }

    /// Mensaje de ayuda para el campo de búsqueda del catálogo.
    pub fn search_hint(self) -> &'static str {
        match self {
            LocalModelProvider::HuggingFace => "Busca modelos, ej. whisper, mistral, diffusion",
            LocalModelProvider::GithubModels => "Busca modelos alojados por GitHub",
            LocalModelProvider::Replicate => "Busca modelos públicos de Replicate",
            LocalModelProvider::Ollama => "Busca modelos disponibles en tu servidor Ollama",
            LocalModelProvider::OpenRouter => "Busca modelos disponibles en OpenRouter",
            LocalModelProvider::Modelscope => "Busca modelos publicados en ModelScope",
        }
    }

    /// Algunos proveedores requieren token para listar modelos incluso de forma pública.
    pub fn requires_token(self) -> bool {
        matches!(
            self,
            LocalModelProvider::GithubModels
                | LocalModelProvider::Replicate
                | LocalModelProvider::OpenRouter
                | LocalModelProvider::Modelscope
        )
    }
}

impl fmt::Display for LocalModelProvider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.display_name())
    }
}

/// Representa una tarjeta dentro de la galería de modelos.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalModelCard {
    pub provider: LocalModelProvider,
    pub id: String,
    pub author: Option<String>,
    pub pipeline_tag: Option<String>,
    pub tags: Vec<String>,
    pub likes: Option<u64>,
    pub downloads: Option<u64>,
    pub requires_token: bool,
    pub description: Option<String>,
}

impl LocalModelCard {
    pub fn placeholder(provider: LocalModelProvider, id: impl Into<String>) -> Self {
        Self {
            provider,
            id: id.into(),
            ..Default::default()
        }
    }
}

impl Default for LocalModelCard {
    fn default() -> Self {
        Self {
            provider: LocalModelProvider::HuggingFace,
            id: String::new(),
            author: None,
            pipeline_tag: None,
            tags: Vec::new(),
            likes: None,
            downloads: None,
            requires_token: false,
            description: None,
        }
    }
}

/// Identificador serializable de un modelo local instalado.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct LocalModelIdentifier {
    pub provider: LocalModelProvider,
    pub model_id: String,
}

impl LocalModelIdentifier {
    pub fn new(provider: LocalModelProvider, model_id: impl Into<String>) -> Self {
        Self {
            provider,
            model_id: model_id.into(),
        }
    }

    pub fn parse(value: &str) -> Self {
        if let Some((provider, model)) = value.split_once("::") {
            let provider = LocalModelProvider::ALL
                .into_iter()
                .find(|p| p.key() == provider)
                .unwrap_or(LocalModelProvider::HuggingFace);
            Self::new(provider, model.trim())
        } else {
            Self::new(LocalModelProvider::HuggingFace, value.trim())
        }
    }

    pub fn serialize(&self) -> String {
        format!("{}::{}", self.provider.key(), self.model_id)
    }

    pub fn display_label(&self) -> String {
        format!("{} · {}", self.provider.display_name(), self.model_id)
    }

    pub fn sanitized_dir_name(&self) -> String {
        let sanitized = self.model_id.replace('/', "_").replace(' ', "_");
        format!("{}__{}", self.provider.key(), sanitized)
    }
}
