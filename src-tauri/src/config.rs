use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::RwLock};

#[derive(Serialize, Deserialize, Clone)]
pub struct LayerConfig {
    pub opacity: f32,
    pub fade_ms: u64,
    pub thumbnail: String,
    pub midi_channel: u8,
}

impl Default for LayerConfig {
    fn default() -> Self {
        Self {
            opacity: 1.0,
            fade_ms: 200,
            thumbnail: String::new(),
            midi_channel: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Config {
    pub layers: HashMap<String, LayerConfig>,
    pub midi_port: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        let mut layers = HashMap::new();
        layers.insert(
            "A".into(),
            LayerConfig {
                midi_channel: 14,
                ..Default::default()
            },
        );
        layers.insert(
            "B".into(),
            LayerConfig {
                midi_channel: 15,
                ..Default::default()
            },
        );
        layers.insert(
            "C".into(),
            LayerConfig {
                midi_channel: 16,
                ..Default::default()
            },
        );
        Self {
            layers,
            midi_port: None,
        }
    }
}

impl Config {
    pub fn load(path: &PathBuf) -> Self {
        if let Ok(text) = fs::read_to_string(path) {
            if let Ok(cfg) = serde_json::from_str(&text) {
                return cfg;
            }
        }
        Self::default()
    }

    pub fn save(&self, path: &PathBuf) -> anyhow::Result<()> {
        let text = serde_json::to_string_pretty(self)?;
        fs::write(path, text)?;
        Ok(())
    }
}

pub struct ConfigState {
    pub path: PathBuf,
    pub inner: RwLock<Config>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn concurrent_read_write() {
        let state = Arc::new(ConfigState {
            path: PathBuf::new(),
            inner: RwLock::new(Config::default()),
        });

        let writer_state = state.clone();
        let writer = thread::spawn(move || {
            let mut cfg = writer_state.inner.write().unwrap();
            cfg.layers.insert("Test".into(), LayerConfig::default());
        });

        let reader_state = state.clone();
        let reader = thread::spawn(move || {
            let cfg = reader_state.inner.read().unwrap();
            assert!(cfg.layers.contains_key("A"));
        });

        writer.join().unwrap();
        reader.join().unwrap();

        assert!(state.inner.read().unwrap().layers.contains_key("Test"));
    }
}
