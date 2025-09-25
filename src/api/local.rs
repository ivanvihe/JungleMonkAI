use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// Representa una instancia del runtime local "Jarvis".
///
/// En esta implementación inicial el runtime consume los metadatos
/// descargados desde Hugging Face para ofrecer respuestas coherentes
/// utilizando exclusivamente información local. El objetivo es simular
/// el arranque del modelo y preparar la estructura necesaria para
/// integrar inferencia real más adelante.
pub struct JarvisRuntime {
    model_dir: PathBuf,
    model_id: Option<String>,
    summary: Option<String>,
    pipeline_tag: Option<String>,
    tags: Vec<String>,
}

impl JarvisRuntime {
    /// Carga el runtime apuntando al directorio del modelo instalado.
    pub fn load(model_dir: impl Into<PathBuf>, model_id: Option<String>) -> Result<Self> {
        let model_dir = model_dir.into();
        if !model_dir.exists() {
            bail!(
                "El directorio del modelo local {:?} no existe. Instálalo desde Hugging Face.",
                model_dir
            );
        }

        let metadata_path = model_dir.join("metadata.json");
        let metadata = if metadata_path.exists() {
            let raw = fs::read_to_string(&metadata_path).with_context(|| {
                format!(
                    "No se pudo leer el archivo de metadatos {:?}",
                    metadata_path
                )
            })?;
            let value: Value = serde_json::from_str(&raw).with_context(|| {
                format!(
                    "El archivo de metadatos {:?} no contiene JSON válido",
                    metadata_path
                )
            })?;
            Some(value)
        } else {
            None
        };

        let summary = metadata
            .as_ref()
            .and_then(|value| value.get("cardData"))
            .and_then(|card| card.get("summary"))
            .and_then(|entry| entry.as_str())
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty());

        let pipeline_tag = metadata
            .as_ref()
            .and_then(|value| {
                value
                    .get("pipeline_tag")
                    .or_else(|| value.get("pipeline"))
                    .or_else(|| value.get("pipeline_tag"))
            })
            .and_then(|entry| entry.as_str())
            .map(|text| text.to_string())
            .or_else(|| {
                metadata
                    .as_ref()
                    .and_then(|value| value.get("cardData"))
                    .and_then(|card| card.get("pipeline_tag"))
                    .and_then(|entry| entry.as_str())
                    .map(|text| text.to_string())
            });

        let tags = metadata
            .as_ref()
            .and_then(|value| value.get("tags"))
            .or_else(|| metadata.as_ref().and_then(|value| value.get("cardData")))
            .and_then(|entry| entry.get("tags"))
            .and_then(|entry| entry.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|value| value.as_str().map(|text| text.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(Self {
            model_dir,
            model_id,
            summary,
            pipeline_tag,
            tags,
        })
    }

    /// Comprueba si el runtime apunta al mismo directorio indicado.
    pub fn matches(&self, dir: &Path) -> bool {
        self.model_dir == dir
    }

    /// Nombre descriptivo del modelo activo.
    pub fn model_label(&self) -> String {
        if let Some(id) = &self.model_id {
            id.clone()
        } else {
            self.model_dir
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("modelo local")
                .to_string()
        }
    }

    /// Genera una respuesta sintética a partir del mensaje recibido.
    ///
    /// La respuesta aprovecha los metadatos para proporcionar contexto
    /// del modelo que está ejecutando Jarvis y analiza palabras clave
    /// del prompt del usuario para ofrecer próximos pasos.
    pub fn generate_reply(&self, prompt: &str) -> String {
        let mut sections = Vec::new();

        let mut header = format!(
            "Jarvis está activo con el modelo local '{}' en tu entorno.",
            self.model_label()
        );
        if let Some(pipeline) = &self.pipeline_tag {
            header.push_str(&format!(" Está optimizado para la tarea '{}'.", pipeline));
        }
        sections.push(header);

        if let Some(summary) = &self.summary {
            sections.push(summary.clone());
        }

        if !self.tags.is_empty() {
            let preview: Vec<&str> = self.tags.iter().take(6).map(|tag| tag.as_str()).collect();
            sections.push(format!("Etiquetas destacadas: {}.", preview.join(", ")));
        }

        let reflection = Self::reflect_prompt(prompt);
        sections.push(reflection);

        if let Some(analysis) = Self::semantic_analysis(prompt) {
            sections.push(analysis);
        }

        sections.join("\n\n")
    }

    fn reflect_prompt(prompt: &str) -> String {
        let trimmed = prompt.trim();
        if trimmed.is_empty() {
            return "No detecté instrucciones. ¿Puedes detallar qué necesitas que haga?"
                .to_string();
        }

        let snippet = Self::prompt_snippet(trimmed);
        let mut lines = vec![format!("Mensaje recibido: {}", snippet)];

        let keywords = Self::extract_keywords(trimmed);
        if keywords.is_empty() {
            lines.push(
                "Analicemos la petición paso a paso y dime si quieres que ejecute algún comando."
                    .to_string(),
            );
        } else {
            lines.push(format!(
                "Temas principales identificados: {}.",
                keywords.join(", ")
            ));
        }

        if trimmed.ends_with('?') {
            lines.push(
                "Prepararé una respuesta concreta basándome en el conocimiento disponible en el modelo local.".to_string(),
            );
        } else {
            lines.push(
                "Puedo proponerte un plan de acción o ayudarte a desgranar el trabajo en pasos claros.".to_string(),
            );
        }

        lines.join("\n\n")
    }

    fn prompt_snippet(prompt: &str) -> String {
        let mut snippet: String = prompt.chars().take(160).collect();
        if snippet.len() < prompt.len() {
            snippet.push_str("…");
        }
        format!("\"{}\"", snippet)
    }

    fn extract_keywords(text: &str) -> Vec<String> {
        let mut keywords: Vec<String> = text
            .split_whitespace()
            .map(|token| token.trim_matches(|c: char| !c.is_alphanumeric()))
            .filter(|token| token.len() > 4)
            .map(|token| token.to_lowercase())
            .collect();
        keywords.sort();
        keywords.dedup();
        keywords.into_iter().take(5).collect()
    }

    fn semantic_analysis(prompt: &str) -> Option<String> {
        let normalized = prompt.to_lowercase();
        let mut findings = Vec::new();

        for entry in SEMANTIC_RULES.iter() {
            if entry
                .keywords
                .iter()
                .any(|keyword| normalized.contains(keyword))
            {
                findings.push(format!("- {} → {}", entry.label, entry.hint));
            }
        }

        if findings.is_empty() {
            None
        } else {
            let mut report = Vec::with_capacity(findings.len() + 1);
            report.push("Análisis semántico local:".to_string());
            report.extend(findings);
            Some(report.join("\n"))
        }
    }
}

struct SemanticRule {
    keywords: &'static [&'static str],
    label: &'static str,
    hint: &'static str,
}

const SEMANTIC_RULES: &[SemanticRule] = &[
    SemanticRule {
        keywords: &["error", "bug", "fallo", "stack", "trace"],
        label: "Diagnóstico",
        hint: "Puedo ayudarte a aislar el problema y proponer pruebas específicas.",
    },
    SemanticRule {
        keywords: &["plan", "estrategia", "roadmap", "pasos", "organizar"],
        label: "Planificación",
        hint: "Te propongo estructurar los siguientes pasos y dependencias clave.",
    },
    SemanticRule {
        keywords: &["deploy", "despliegue", "infra", "servidor", "docker"],
        label: "Operaciones",
        hint: "Podemos revisar el estado del entorno local y preparar comandos.",
    },
    SemanticRule {
        keywords: &["datos", "dataset", "csv", "analizar", "consulta"],
        label: "Datos",
        hint: "Te ayudo a definir transformaciones y métricas para explorar la información.",
    },
    SemanticRule {
        keywords: &["documentación", "doc", "manual", "resumen"],
        label: "Documentación",
        hint: "Generemos un esquema y redactemos los apartados esenciales.",
    },
    SemanticRule {
        keywords: &["investigar", "research", "comparar", "benchmark"],
        label: "Investigación",
        hint: "Recolecto fuentes relevantes y sintetizo conclusiones preliminares.",
    },
];
