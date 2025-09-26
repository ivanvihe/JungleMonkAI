use anyhow::{anyhow, bail, Context, Result};
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{
    BertModel, Config as BertConfig, HiddenAct, PositionEmbeddingType,
};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tokenizers::Tokenizer;
use tokenizers::{
    PaddingParams, PaddingStrategy, TruncationDirection, TruncationParams, TruncationStrategy,
};

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
    encoder: JarvisEncoder,
    knowledge: Vec<JarvisKnowledge>,
}

struct JarvisKnowledge {
    embedding: Vec<f32>,
    norm: f32,
    responder: fn(&JarvisRuntime, &str, f32) -> String,
}

struct JarvisPersonaBlueprint {
    label: &'static str,
    prompts: &'static [&'static str],
    responder: fn(&JarvisRuntime, &str, f32) -> String,
}

struct JarvisEncoder {
    tokenizer: Tokenizer,
    model: BertModel,
    device: Device,
    normalize: bool,
    mean_pooling: bool,
}

fn collect_safetensor_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let entries = fs::read_dir(dir)
        .with_context(|| format!("No se pudo listar el directorio del modelo {:?}", dir))?;
    let mut files: Vec<PathBuf> = Vec::new();

    for entry in entries {
        let entry = entry
            .with_context(|| format!("No se pudo acceder a un archivo dentro de {:?}", dir))?;
        let metadata = entry.file_type().with_context(|| {
            format!(
                "No se pudo determinar el tipo de archivo de {:?}",
                entry.path()
            )
        })?;
        if !metadata.is_file() {
            continue;
        }

        let path = entry.path();
        let is_safetensors = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("safetensors"))
            .unwrap_or(false);

        if is_safetensors {
            files.push(path);
        }
    }

    files.sort();
    Ok(files)
}

fn adapt_bert_config(value: &Value) -> Option<BertConfig> {
    let obj = value.as_object()?;

    fn extract_usize(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<usize> {
        keys.iter().find_map(|key| {
            obj.get(*key)
                .and_then(|value| {
                    value.as_u64().or_else(|| {
                        value.as_f64().and_then(|num| {
                            if num.is_finite() && num >= 0.0 {
                                Some(num.round() as u64)
                            } else {
                                None
                            }
                        })
                    })
                })
                .map(|num| num as usize)
        })
    }

    fn extract_f64(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<f64> {
        keys.iter().find_map(|key| {
            obj.get(*key)
                .and_then(|value| value.as_f64().or_else(|| value.as_u64().map(|n| n as f64)))
        })
    }

    fn extract_bool(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<bool> {
        keys.iter()
            .find_map(|key| obj.get(*key).and_then(|value| value.as_bool()))
    }

    fn extract_string<'a>(
        obj: &'a serde_json::Map<String, Value>,
        keys: &[&str],
    ) -> Option<&'a str> {
        keys.iter()
            .find_map(|key| obj.get(*key).and_then(|value| value.as_str()))
    }

    let mut config = BertConfig::default();

    config.vocab_size = extract_usize(obj, &["vocab_size", "n_vocab", "vocab"])?;
    config.hidden_size = extract_usize(obj, &["hidden_size", "n_embd", "d_model", "model_dim"])?;
    config.num_hidden_layers = extract_usize(obj, &["num_hidden_layers", "n_layer", "num_layers"])?;
    config.num_attention_heads = extract_usize(
        obj,
        &["num_attention_heads", "n_head", "num_attention_heads_train"],
    )?;
    config.intermediate_size = extract_usize(
        obj,
        &[
            "intermediate_size",
            "n_inner",
            "ffn_hidden_size",
            "mlp_hidden_size",
        ],
    )?;

    if let Some(act) = extract_string(obj, &["hidden_act", "activation", "activation_function"]) {
        config.hidden_act = match act.to_ascii_lowercase().as_str() {
            "relu" => HiddenAct::Relu,
            "gelu" | "gelu_new" | "gelu_pytorch_tanh" => HiddenAct::Gelu,
            "gelu_approximate" | "gelu_fast" => HiddenAct::GeluApproximate,
            _ => config.hidden_act,
        };
    }

    if let Some(dropout) = extract_f64(
        obj,
        &[
            "hidden_dropout_prob",
            "hidden_dropout",
            "resid_pdrop",
            "dropout_prob",
        ],
    ) {
        config.hidden_dropout_prob = dropout;
    }

    if let Some(max_pos) = extract_usize(
        obj,
        &[
            "max_position_embeddings",
            "n_positions",
            "max_seq_len",
            "seq_length",
        ],
    ) {
        config.max_position_embeddings = max_pos;
    }

    if let Some(type_vocab) = extract_usize(obj, &["type_vocab_size", "token_type_vocab_size"]) {
        config.type_vocab_size = type_vocab;
    }

    if let Some(init_range) =
        extract_f64(obj, &["initializer_range", "init_std", "weight_init_std"])
    {
        config.initializer_range = init_range;
    }

    if let Some(eps) = extract_f64(obj, &["layer_norm_eps", "layer_norm_epsilon", "norm_eps"]) {
        config.layer_norm_eps = eps;
    }

    if let Some(pad_id) = extract_usize(obj, &["pad_token_id", "padding_token_id", "pad_id"]) {
        config.pad_token_id = pad_id;
    }

    if let Some(position_type) = extract_string(obj, &["position_embedding_type"]) {
        config.position_embedding_type = match position_type.to_ascii_lowercase().as_str() {
            "absolute" => PositionEmbeddingType::Absolute,
            _ => config.position_embedding_type,
        };
    }

    if let Some(use_cache) = extract_bool(obj, &["use_cache"]) {
        config.use_cache = use_cache;
    }

    if let Some(dropout) = extract_f64(obj, &["classifier_dropout", "classifier_dropout_prob"]) {
        config.classifier_dropout = Some(dropout);
    }

    if let Some(model_type) = extract_string(obj, &["model_type", "architecture", "architect"]) {
        config.model_type = Some(model_type.to_string());
    }

    Some(config)
}

const JARVIS_BLUEPRINTS: &[JarvisPersonaBlueprint] = &[
    JarvisPersonaBlueprint {
        label: "greeting",
        prompts: &[
            "hola jarvis",
            "hey jarvis",
            "buenos días jarvis",
            "jarvis estás ahí",
        ],
        responder: JarvisRuntime::respond_greeting,
    },
    JarvisPersonaBlueprint {
        label: "status",
        prompts: &[
            "estado de jarvis",
            "qué modelo usas",
            "estás listo",
            "jarvis status",
        ],
        responder: JarvisRuntime::respond_status,
    },
    JarvisPersonaBlueprint {
        label: "planning",
        prompts: &[
            "necesito un plan",
            "ayúdame a planificar",
            "organiza esta tarea",
            "plan de acción",
        ],
        responder: JarvisRuntime::respond_planning,
    },
    JarvisPersonaBlueprint {
        label: "troubleshooting",
        prompts: &["tengo un error", "hay un bug", "fallo en", "stack trace"],
        responder: JarvisRuntime::respond_troubleshooting,
    },
    JarvisPersonaBlueprint {
        label: "collaboration",
        prompts: &[
            "ayúdame con",
            "puedes ayudarme",
            "qué recomiendas",
            "qué sugerencias tienes",
        ],
        responder: JarvisRuntime::respond_collaboration,
    },
];

impl JarvisEncoder {
    fn new(model_dir: &Path) -> Result<Self> {
        let tokenizer_path = model_dir.join("tokenizer.json");
        let mut tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|err| anyhow!("No se pudo cargar el tokenizer: {err}"))?;
        tokenizer
            .with_truncation(Some(TruncationParams {
                max_length: 256,
                strategy: TruncationStrategy::LongestFirst,
                stride: 0,
                direction: TruncationDirection::Right,
            }))
            .map_err(|err| anyhow!("No se pudo configurar la truncación del tokenizer: {err}"))?;
        tokenizer.with_padding(Some(PaddingParams {
            strategy: PaddingStrategy::BatchLongest,
            direction: tokenizers::PaddingDirection::Right,
            pad_to_multiple_of: None,
            pad_id: 0,
            pad_type_id: 0,
            pad_token: "[PAD]".to_string(),
        }));

        let config_path = model_dir.join("config.json");
        let config_data = fs::read_to_string(&config_path)
            .with_context(|| format!("No se pudo leer {:?}", config_path))?;
        let config: BertConfig = match serde_json::from_str(&config_data) {
            Ok(config) => config,
            Err(primary_err) => {
                let value: Value = serde_json::from_str(&config_data).with_context(|| {
                    format!("No se pudo interpretar {:?} como JSON", config_path)
                })?;
                adapt_bert_config(&value).ok_or_else(|| {
                    anyhow!("No se pudo parsear {:?}: {}", config_path, primary_err)
                })?
            }
        };

        let safetensor_files = collect_safetensor_files(model_dir)?;
        if safetensor_files.is_empty() {
            bail!(
                "No se encontró ningún archivo '.safetensors' en {:?}. Descarga el modelo completo.",
                model_dir
            );
        }

        let weight_refs: Vec<&Path> = safetensor_files.iter().map(|path| path.as_path()).collect();

        let device = Device::Cpu;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&weight_refs, DType::F32, &device)
                .context("No se pudo mapear los pesos del modelo local")?
        };
        let model = BertModel::load(vb, &config)
            .context("No se pudo inicializar el modelo BERT local para Jarvis")?;

        let modules_path = model_dir.join("modules.json");
        let normalize = if modules_path.exists() {
            let data = fs::read_to_string(&modules_path)
                .with_context(|| format!("No se pudo leer {:?}", modules_path))?;
            let modules: Vec<Value> = match serde_json::from_str(&data) {
                Ok(parsed) => parsed,
                Err(err) => {
                    eprintln!(
                        "modules.json inválido en {:?}: {}. Se omitirá la detección de módulos.",
                        modules_path, err
                    );
                    Vec::new()
                }
            };
            modules.iter().any(|module| {
                module
                    .get("type")
                    .and_then(|value| value.as_str())
                    .map(|ty| ty.to_lowercase().contains("normalize"))
                    .unwrap_or(false)
            })
        } else {
            true
        };

        let pooling_path = model_dir.join("1_Pooling/config.json");
        let mean_pooling = if pooling_path.exists() {
            #[derive(serde::Deserialize)]
            struct PoolingConfig {
                #[serde(default)]
                pooling_mode_mean_tokens: bool,
            }

            let config = fs::read_to_string(&pooling_path)
                .with_context(|| format!("No se pudo leer {:?}", pooling_path))?;
            let pooling: PoolingConfig = serde_json::from_str(&config)
                .with_context(|| format!("No se pudo parsear {:?}", pooling_path))?;
            pooling.pooling_mode_mean_tokens
        } else {
            true
        };

        Ok(Self {
            tokenizer,
            model,
            device,
            normalize,
            mean_pooling,
        })
    }

    fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|err| anyhow!("No se pudo tokenizar la entrada para Jarvis: {err}"))?;

        let ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let type_ids: Vec<i64> = encoding
            .get_type_ids()
            .iter()
            .map(|&id| id as i64)
            .collect();
        let mask: Vec<f32> = encoding
            .get_attention_mask()
            .iter()
            .map(|&value| value as f32)
            .collect();

        let seq_len = ids.len();
        if seq_len == 0 {
            return Ok(Vec::new());
        }

        let input_ids = Tensor::new(ids, &self.device)?.reshape((1, seq_len))?;
        let token_type_ids = if type_ids.is_empty() {
            Tensor::zeros((1, seq_len), DType::I64, &self.device)?
        } else {
            Tensor::new(type_ids, &self.device)?.reshape((1, seq_len))?
        };
        let attention_mask = if mask.is_empty() {
            Tensor::ones((1, seq_len), DType::F32, &self.device)?
        } else {
            Tensor::new(mask, &self.device)?.reshape((1, seq_len))?
        };

        let hidden_states = self
            .model
            .forward(&input_ids, &token_type_ids, Some(&attention_mask))?
            .squeeze(0)?
            .to_vec2::<f32>()?;
        let attention_mask = attention_mask.squeeze(0)?.to_vec1::<f32>()?;

        let mut embedding = if self.mean_pooling {
            if hidden_states.is_empty() {
                Vec::new()
            } else {
                let dimension = hidden_states[0].len();
                let mut accumulator = vec![0f32; dimension];
                let mut weight = 0f32;
                for (token_embedding, &mask_value) in
                    hidden_states.iter().zip(attention_mask.iter())
                {
                    if mask_value > 0.0 {
                        for (idx, value) in token_embedding.iter().enumerate() {
                            accumulator[idx] += *value;
                        }
                        weight += 1.0;
                    }
                }
                if weight > 0.0 {
                    let factor = 1.0 / weight;
                    for value in &mut accumulator {
                        *value *= factor;
                    }
                }
                accumulator
            }
        } else {
            hidden_states.first().cloned().unwrap_or_else(Vec::new)
        };
        if self.normalize {
            let norm = embedding
                .iter()
                .map(|value| value * value)
                .sum::<f32>()
                .sqrt();
            if norm > 0.0 {
                for value in &mut embedding {
                    *value /= norm;
                }
            }
        }

        Ok(embedding)
    }

    fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        texts.iter().map(|text| self.embed(text)).collect()
    }
}

impl JarvisRuntime {
    /// Carga el runtime apuntando al directorio del modelo instalado.
    pub fn load(model_dir: impl Into<PathBuf>, model_id: Option<String>) -> Result<Self> {
        let mut model_dir = model_dir.into();
        if model_dir.is_file() {
            if let Some(parent) = model_dir.parent() {
                model_dir = parent.to_path_buf();
            }
        }

        if !model_dir.exists() {
            bail!(
                "El directorio del modelo local {:?} no existe. Instálalo desde Hugging Face.",
                model_dir
            );
        }

        if !model_dir.is_dir() {
            bail!(
                "La ruta del modelo local {:?} no es un directorio válido.",
                model_dir
            );
        }

        let required_files = ["config.json", "tokenizer.json"];
        for file in required_files {
            let path = model_dir.join(file);
            if !path.exists() {
                bail!(
                    "El modelo local en {:?} no contiene el archivo requerido '{}'. Reinstálalo.",
                    path,
                    file
                );
            }
        }

        if collect_safetensor_files(&model_dir)?.is_empty() {
            bail!(
                "El modelo local en {:?} no incluye archivos '.safetensors'. Reinstálalo o descarga una versión compatible.",
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

        let encoder = JarvisEncoder::new(&model_dir)?;
        let knowledge = Self::build_knowledge_base(&encoder)?;

        Ok(Self {
            model_dir,
            model_id,
            summary,
            pipeline_tag,
            tags,
            encoder,
            knowledge,
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
    pub fn generate_reply(&self, prompt: &str) -> Result<String> {
        let prompt_vector = self
            .encoder
            .embed(prompt)
            .context("No se pudo vectorizar la petición para Jarvis")?;
        if prompt_vector.is_empty() {
            bail!("El modelo de embeddings devolvió un vector vacío para Jarvis");
        }
        let prompt_norm = Self::vector_norm(&prompt_vector);

        let mut best_match: Option<(&JarvisKnowledge, f32)> = None;
        for entry in &self.knowledge {
            let score = Self::cosine_similarity(&prompt_vector, prompt_norm, entry);
            match best_match {
                Some((_, current)) if score <= current => {}
                _ => best_match = Some((entry, score)),
            }
        }

        let persona_segment = if let Some((entry, score)) = best_match {
            if score >= 0.18 {
                (entry.responder)(self, prompt, score)
            } else {
                Self::reflect_prompt(prompt)
            }
        } else {
            Self::reflect_prompt(prompt)
        };

        let mut sections = Vec::new();
        sections.push(self.runtime_overview());

        if let Some(summary) = &self.summary {
            sections.push(summary.clone());
        }

        if let Some(tags) = self.tags_preview() {
            sections.push(format!("Etiquetas destacadas: {}.", tags));
        }

        sections.push(persona_segment);

        if let Some(analysis) = Self::semantic_analysis(prompt) {
            sections.push(analysis);
        }

        Ok(sections.join("\n\n"))
    }

    fn runtime_overview(&self) -> String {
        let mut header = format!(
            "Jarvis está activo con el modelo local '{}' en tu entorno.",
            self.model_label()
        );
        if let Some(pipeline) = &self.pipeline_tag {
            header.push_str(&format!(" Está optimizado para la tarea '{}'.", pipeline));
        }
        header
    }

    fn tags_preview(&self) -> Option<String> {
        if self.tags.is_empty() {
            None
        } else {
            Some(
                self.tags
                    .iter()
                    .take(6)
                    .map(|tag| tag.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
            )
        }
    }

    fn build_knowledge_base(encoder: &JarvisEncoder) -> Result<Vec<JarvisKnowledge>> {
        let mut knowledge = Vec::with_capacity(JARVIS_BLUEPRINTS.len());
        for blueprint in JARVIS_BLUEPRINTS {
            let embeddings = encoder.embed_batch(blueprint.prompts).with_context(|| {
                format!(
                    "No se pudo crear la huella semántica para '{}'.",
                    blueprint.label
                )
            })?;
            let combined = Self::average_embedding(&embeddings);
            let norm = Self::vector_norm(&combined);
            knowledge.push(JarvisKnowledge {
                embedding: combined,
                norm,
                responder: blueprint.responder,
            });
        }
        Ok(knowledge)
    }

    fn average_embedding(vectors: &[Vec<f32>]) -> Vec<f32> {
        if vectors.is_empty() {
            return Vec::new();
        }

        let dimension = vectors[0].len();
        let mut accumulator = vec![0f32; dimension];
        for vector in vectors {
            for (idx, value) in vector.iter().enumerate() {
                accumulator[idx] += *value;
            }
        }

        let factor = 1f32 / vectors.len() as f32;
        for value in &mut accumulator {
            *value *= factor;
        }
        accumulator
    }

    fn vector_norm(values: &[f32]) -> f32 {
        let sum: f32 = values.iter().map(|v| v * v).sum();
        sum.sqrt().max(1e-6)
    }

    fn cosine_similarity(vector: &[f32], vector_norm: f32, entry: &JarvisKnowledge) -> f32 {
        if vector.is_empty() || entry.embedding.is_empty() {
            return 0.0;
        }

        let dot: f32 = vector
            .iter()
            .zip(entry.embedding.iter())
            .map(|(a, b)| a * b)
            .sum();

        dot / (vector_norm * entry.norm).max(1e-6)
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

    fn respond_greeting(&self, prompt: &str, _score: f32) -> String {
        let mut lines = vec![
            "¡Hola! Gracias por traerme a la conversación.".to_string(),
            "Soy tu agente local y puedo ayudarte a estructurar trabajo, revisar ideas o preparar acciones paso a paso.".to_string(),
        ];

        let keywords = Self::extract_keywords(prompt);
        if !keywords.is_empty() {
            lines.push(format!(
                "Ya tomé nota de que quieres hablar sobre {}.",
                keywords.join(", ")
            ));
        }

        if let Some(tags) = self.tags_preview() {
            lines.push(format!(
                "Este modelo destaca en: {}. Podemos apoyarnos en eso para avanzar rápido.",
                tags
            ));
        }

        lines.push("¿Cuál sería el primer paso que quieres que abordemos juntos?".to_string());
        lines.join("\n\n")
    }

    fn respond_status(&self, _prompt: &str, _score: f32) -> String {
        let mut lines = vec![format!("Modelo activo: {}.", self.model_label())];
        if let Some(pipeline) = &self.pipeline_tag {
            lines.push(format!("Especialización del modelo: {}.", pipeline));
        }
        lines.push(format!(
            "Directorio de trabajo: {}",
            self.model_dir.display()
        ));
        lines.push(
            "Estoy listo para recibir instrucciones. Mencióname con el alias configurado y reacciono al instante.".to_string(),
        );
        lines.join("\n\n")
    }

    fn respond_planning(&self, prompt: &str, score: f32) -> String {
        let keywords = Self::extract_keywords(prompt);
        let focus = if keywords.is_empty() {
            "la iniciativa mencionada".to_string()
        } else {
            keywords.join(", ")
        };

        let mut lines = vec![format!(
            "Vamos a transformar {} en un plan claro (similitud {:.0}%):",
            focus,
            score * 100.0
        )];
        lines.push("1. Aclaremos el resultado esperado y los indicadores de éxito.".to_string());
        lines.push(
            "2. Listemos recursos, dependencias y artefactos que ya tienes disponibles."
                .to_string(),
        );
        lines.push(
            "3. Organicemos las tareas en fases cortas con responsables y deadlines tentativos."
                .to_string(),
        );
        lines.push(
            "Si quieres podemos abrir una tabla de seguimiento o preparar comandos automáticos."
                .to_string(),
        );
        lines.join("\n")
    }

    fn respond_troubleshooting(&self, prompt: &str, _score: f32) -> String {
        let snippet = Self::prompt_snippet(prompt);
        let mut lines = vec![format!(
            "He leído {} y puedo ayudarte a investigar el problema paso a paso.",
            snippet
        )];
        lines.push(
            "• Primero revisemos logs o stack traces para ubicar el punto exacto de fallo."
                .to_string(),
        );
        lines.push(
            "• Después contrastemos con cambios recientes o dependencias nuevas que puedan estar involucradas.".to_string(),
        );
        lines.push(
            "• Finalmente, prepararé una lista de pruebas o parches sugeridos que puedas ejecutar localmente.".to_string(),
        );
        lines.push("Compárteme detalles adicionales cuando los tengas y lo iteramos.".to_string());
        lines.join("\n")
    }

    fn respond_collaboration(&self, prompt: &str, _score: f32) -> String {
        let keywords = Self::extract_keywords(prompt);
        let mut lines = Vec::new();

        if !keywords.is_empty() {
            lines.push(format!(
                "Detecté que quieres apoyo en: {}.",
                keywords.join(", ")
            ));
        } else {
            lines
                .push("Cuéntame qué resultado persigues y preparo opciones concretas.".to_string());
        }

        lines.push(
            "Puedo resumir información previa, generar pasos accionables o ayudarte a documentar decisiones.".to_string(),
        );
        lines.push(
            "Si necesitas ejecutar algo en particular, descríbelo y lo convertimos en comandos reproducibles.".to_string(),
        );
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
