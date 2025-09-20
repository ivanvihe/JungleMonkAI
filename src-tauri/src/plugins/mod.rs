use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tauri::AppHandle;

use crate::{ableton, vscode};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentManifestModel {
    pub id: String,
    pub name: String,
    pub model: String,
    pub description: String,
    pub kind: String,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default)]
    pub default_active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentManifest {
    pub provider: String,
    pub models: Vec<AgentManifestModel>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PluginCapability {
    #[serde(rename_all = "camelCase")]
    AgentProvider {
        #[serde(default)]
        agent_manifests: Vec<AgentManifest>,
    },
    #[serde(rename_all = "camelCase")]
    ChatAction {
        id: String,
        label: String,
        #[serde(default)]
        description: Option<String>,
        command: String,
        #[serde(default)]
        icon: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    WorkspacePanel {
        id: String,
        label: String,
        slot: String,
        module: String,
        #[serde(rename = "export", default)]
        export_name: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    McpEndpoint {
        id: String,
        transport: String,
        url: String,
    },
    #[serde(rename_all = "camelCase")]
    McpSession {
        id: String,
        label: String,
        #[serde(default)]
        description: Option<String>,
        endpoints: Vec<McpSessionEndpoint>,
        permissions: Vec<McpSessionPermission>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSessionEndpoint {
    pub transport: String,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSessionPermission {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    pub command: String,
    #[serde(default)]
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCredentialField {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub secret: Option<bool>,
    #[serde(default)]
    pub required: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCommandDescriptor {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub signature: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginIntegrity {
    pub algorithm: String,
    pub hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCompatibility {
    #[serde(default)]
    pub min_version: Option<String>,
    #[serde(default)]
    pub max_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    pub capabilities: Vec<PluginCapability>,
    #[serde(default)]
    pub credentials: Vec<PluginCredentialField>,
    #[serde(default)]
    pub commands: Vec<PluginCommandDescriptor>,
    #[serde(default)]
    pub integrity: Option<PluginIntegrity>,
    #[serde(default)]
    pub compatibility: Option<PluginCompatibility>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeDescriptor {
    pub plugin_id: String,
    pub manifest: PluginManifest,
    pub checksum: String,
}

pub struct PluginManager {
    base_dir: PathBuf,
    plugins: RwLock<HashMap<String, PluginRuntimeDescriptor>>,
    app_version: String,
}

impl PluginManager {
    pub fn new(base_dir: PathBuf) -> Result<Self> {
        if !base_dir.exists() {
            fs::create_dir_all(&base_dir).context("no se pudo crear el directorio de plugins")?;
        }

        Ok(Self {
            base_dir,
            plugins: RwLock::new(HashMap::new()),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        })
    }

    pub fn refresh(&self) -> Result<Vec<PluginRuntimeDescriptor>> {
        let mut registry = HashMap::new();

        if self.base_dir.exists() {
            for entry in fs::read_dir(&self.base_dir)? {
                let entry = entry?;
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                match self.load_plugin(&path) {
                    Ok(descriptor) => {
                        registry.insert(descriptor.plugin_id.clone(), descriptor);
                    }
                    Err(error) => {
                        println!(
                            "[plugin-manager] no se pudo cargar el plugin en {:?}: {:?}",
                            path, error
                        );
                    }
                }
            }
        }

        let descriptors: Vec<PluginRuntimeDescriptor> = registry.values().cloned().collect();
        let mut guard = self.plugins.write().unwrap();
        *guard = registry;
        Ok(descriptors)
    }

    pub fn list(&self) -> Vec<PluginRuntimeDescriptor> {
        let guard = self.plugins.read().unwrap();
        guard.values().cloned().collect()
    }

    pub fn invoke_command(
        &self,
        plugin_id: &str,
        command: &str,
        payload: Value,
        app: &AppHandle,
    ) -> Result<Value> {
        let guard = self.plugins.read().unwrap();
        let plugin = guard
            .get(plugin_id)
            .with_context(|| format!("plugin «{}» no está registrado", plugin_id))?;

        let exists = plugin
            .manifest
            .commands
            .iter()
            .any(|descriptor| descriptor.name == command);

        if !exists {
            anyhow::bail!(
                "el comando {} no está disponible en el plugin {}",
                command,
                plugin_id
            );
        }

        let response = match plugin_id {
            "ableton-remote" => ableton::handle_plugin_command(app, command, payload.clone())?,
            "vscode-bridge" => vscode::handle_plugin_command(app, command, payload.clone())?,
            _ => serde_json::json!({
                "status": "queued",
                "plugin": plugin_id,
                "command": command,
            }),
        };

        Ok(response)
    }

    fn load_plugin(&self, dir: &Path) -> Result<PluginRuntimeDescriptor> {
        let manifest_path = dir.join("manifest.json");
        if !manifest_path.exists() {
            anyhow::bail!("manifest.json no encontrado en {:?}", dir);
        }

        let raw = fs::read_to_string(&manifest_path)
            .with_context(|| format!("no se pudo leer {:?}", manifest_path))?;
        let value: Value = serde_json::from_str(&raw)
            .with_context(|| format!("no se pudo parsear el manifiesto {:?}", manifest_path))?;
        let checksum = compute_checksum(&value);
        let manifest: PluginManifest = serde_json::from_value(value.clone())?;

        if let Some(integrity) = &manifest.integrity {
            if integrity.algorithm.to_lowercase() == "sha256" && integrity.hash != checksum {
                anyhow::bail!(
                    "el hash del manifiesto de {} no coincide con la integridad declarada",
                    manifest.id
                );
            }
        }

        self.validate_compatibility(&manifest)?;

        Ok(PluginRuntimeDescriptor {
            plugin_id: manifest.id.clone(),
            manifest,
            checksum,
        })
    }

    fn validate_compatibility(&self, manifest: &PluginManifest) -> Result<()> {
        if let Some(compat) = &manifest.compatibility {
            if let Some(min_version) = &compat.min_version {
                if compare_versions(&self.app_version, min_version) == std::cmp::Ordering::Less {
                    anyhow::bail!(
                        "el plugin {} requiere la versión {} o superior",
                        manifest.name,
                        min_version
                    );
                }
            }
            if let Some(max_version) = &compat.max_version {
                if compare_versions(&self.app_version, max_version) == std::cmp::Ordering::Greater {
                    anyhow::bail!(
                        "el plugin {} no es compatible con la versión actual",
                        manifest.name
                    );
                }
            }
        }
        Ok(())
    }
}

fn compute_checksum(value: &Value) -> String {
    let sanitized = sanitize_value(value);
    let canonical = canonical_string(&sanitized);
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn sanitize_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sanitized = serde_json::Map::new();
            for (key, val) in map {
                if key == "integrity" {
                    continue;
                }
                sanitized.insert(key.clone(), sanitize_value(val));
            }
            Value::Object(sanitized)
        }
        Value::Array(array) => Value::Array(array.iter().map(sanitize_value).collect()),
        _ => value.clone(),
    }
}

fn canonical_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string()),
        Value::Array(array) => {
            let items: Vec<String> = array.iter().map(canonical_string).collect();
            format!("[{}]", items.join(","))
        }
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            let serialized: Vec<String> = entries
                .into_iter()
                .map(|(key, value)| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(key).unwrap(),
                        canonical_string(value)
                    )
                })
                .collect();
            format!("{{{}}}", serialized.join(","))
        }
    }
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let mut a_parts = a.split('.').map(|part| part.parse::<u32>().unwrap_or(0));
    let mut b_parts = b.split('.').map(|part| part.parse::<u32>().unwrap_or(0));

    loop {
        match (a_parts.next(), b_parts.next()) {
            (Some(av), Some(bv)) => {
                if av > bv {
                    return std::cmp::Ordering::Greater;
                }
                if av < bv {
                    return std::cmp::Ordering::Less;
                }
            }
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (None, None) => return std::cmp::Ordering::Equal,
        }
    }
}

#[tauri::command]
pub async fn plugin_list(
    manager: tauri::State<'_, PluginManager>,
) -> Result<Vec<PluginRuntimeDescriptor>, String> {
    manager.refresh().map_err(|error| error.to_string())?;
    Ok(manager.list())
}

#[tauri::command]
pub async fn plugin_invoke(
    manager: tauri::State<'_, PluginManager>,
    app: tauri::AppHandle,
    plugin_id: String,
    command: String,
    payload: Value,
) -> Result<Value, String> {
    manager
        .invoke_command(&plugin_id, &command, payload, &app)
        .map_err(|error| error.to_string())
}
