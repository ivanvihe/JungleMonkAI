use anyhow::{anyhow, Context, Result};
use dirs::{data_dir, home_dir};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlatformKind {
    Windows,
    MacOs,
    Linux,
}

impl PlatformKind {
    fn detect() -> Self {
        if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UserDataPathsInfo {
    pub base_dir: String,
    pub config_dir: String,
    pub data_dir: String,
    pub default_base_dir: String,
    pub is_using_default: bool,
    pub legacy_migration_performed: bool,
    pub last_migrated_from: Option<String>,
    pub last_migrated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedUserDataConfig {
    base_dir: PathBuf,
    #[serde(default)]
    last_migrated_from: Option<PathBuf>,
    #[serde(default)]
    last_migrated_at: Option<u64>,
}

pub struct UserDataPaths {
    base_dir: PathBuf,
    config_dir: PathBuf,
    data_dir: PathBuf,
    default_base_dir: PathBuf,
    legacy_config_dir: PathBuf,
    legacy_data_dir: PathBuf,
    metadata_path: PathBuf,
    last_migrated_from: Option<PathBuf>,
    last_migrated_at: Option<u64>,
    legacy_migration_performed: bool,
}

impl UserDataPaths {
    pub fn initialize(legacy_config_dir: PathBuf, legacy_data_dir: PathBuf) -> Result<Self> {
        let default_base_dir = Self::default_base_dir()?;
        if let Some(parent) = legacy_config_dir.parent() {
            fs::create_dir_all(parent).ok();
        }

        let metadata_path = legacy_config_dir.join("user-paths.json");
        let persisted = Self::load_metadata(&metadata_path)?;
        let base_dir = persisted
            .as_ref()
            .map(|config| config.base_dir.clone())
            .unwrap_or_else(|| default_base_dir.clone());

        let config_dir = base_dir.join("config");
        let data_dir = base_dir.join("data");

        fs::create_dir_all(&config_dir).context("failed to create user config directory")?;
        fs::create_dir_all(&data_dir).context("failed to create user data directory")?;

        let mut instance = Self {
            base_dir,
            config_dir,
            data_dir,
            default_base_dir,
            legacy_config_dir: legacy_config_dir.clone(),
            legacy_data_dir: legacy_data_dir.clone(),
            metadata_path,
            last_migrated_from: persisted.and_then(|config| config.last_migrated_from),
            last_migrated_at: persisted.and_then(|config| config.last_migrated_at),
            legacy_migration_performed: false,
        };

        instance.persist_metadata()?;
        instance.perform_initial_migration()?;

        Ok(instance)
    }

    pub fn config_dir(&self) -> PathBuf {
        self.config_dir.clone()
    }

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir.clone()
    }

    pub fn info(&self) -> UserDataPathsInfo {
        UserDataPathsInfo {
            base_dir: self.base_dir.to_string_lossy().into_owned(),
            config_dir: self.config_dir.to_string_lossy().into_owned(),
            data_dir: self.data_dir.to_string_lossy().into_owned(),
            default_base_dir: self.default_base_dir.to_string_lossy().into_owned(),
            is_using_default: self.base_dir == self.default_base_dir,
            legacy_migration_performed: self.legacy_migration_performed,
            last_migrated_from: self
                .last_migrated_from
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            last_migrated_at: self.last_migrated_at,
        }
    }

    pub fn set_base_dir(&mut self, candidate: PathBuf) -> Result<UserDataPathsInfo> {
        if candidate == self.base_dir {
            return Ok(self.info());
        }

        if candidate.as_os_str().is_empty() {
            return Err(anyhow!("La ruta proporcionada está vacía"));
        }

        fs::create_dir_all(&candidate)
            .with_context(|| format!("no se pudo crear el directorio {:?}", candidate))?;
        Self::validate_destination(&candidate)?;

        let new_config_dir = candidate.join("config");
        let new_data_dir = candidate.join("data");
        fs::create_dir_all(&new_config_dir)?;
        fs::create_dir_all(&new_data_dir)?;

        self.migrate_between(&self.config_dir, &new_config_dir, Some(&self.metadata_path))?;
        self.migrate_between(&self.data_dir, &new_data_dir, None)?;

        let previous = self.base_dir.clone();
        self.base_dir = candidate;
        self.config_dir = new_config_dir;
        self.data_dir = new_data_dir;
        self.last_migrated_from = Some(previous.clone());
        self.last_migrated_at = Some(Self::timestamp_now());

        self.persist_metadata()?;
        self.append_migration_log("user-change", &previous, &self.base_dir);

        Ok(self.info())
    }

    fn perform_initial_migration(&mut self) -> Result<()> {
        if self.legacy_config_dir == self.config_dir && self.legacy_data_dir == self.data_dir {
            return Ok(());
        }

        let metadata = self.metadata_path.clone();
        let had_config = self.legacy_config_dir.exists();
        let had_data = self.legacy_data_dir.exists();

        self.migrate_between(&self.legacy_config_dir, &self.config_dir, Some(&metadata))?;
        self.migrate_between(&self.legacy_data_dir, &self.data_dir, None)?;

        if had_config || had_data {
            self.legacy_migration_performed = true;
            self.last_migrated_from = Some(self.legacy_config_dir.clone());
            self.last_migrated_at = Some(Self::timestamp_now());
            self.persist_metadata()?;
            self.append_migration_log("initial-migration", &self.legacy_config_dir, &self.base_dir);
        }

        Ok(())
    }

    fn migrate_between(
        &self,
        source: &Path,
        destination: &Path,
        skip: Option<&Path>,
    ) -> Result<()> {
        if !source.exists() {
            return Ok(());
        }

        fs::create_dir_all(destination)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            let path = entry.path();

            if let Some(skip_path) = skip {
                if path == *skip_path {
                    continue;
                }
            }

            let file_name = match path.file_name() {
                Some(name) => name,
                None => continue,
            };

            let target = destination.join(file_name);
            if path.is_dir() {
                self.migrate_between(&path, &target, None)?;
                if let Err(error) = fs::remove_dir_all(&path) {
                    warn!(
                        "No se pudo eliminar el directorio antiguo {:?}: {error:?}",
                        path
                    );
                }
            } else {
                if target.exists() {
                    fs::remove_file(&target).ok();
                }
                match fs::rename(&path, &target) {
                    Ok(_) => {}
                    Err(_) => {
                        fs::copy(&path, &target)?;
                        fs::remove_file(&path).ok();
                    }
                }
            }
        }
        Ok(())
    }

    fn validate_destination(candidate: &Path) -> Result<()> {
        if candidate.exists() && !candidate.is_dir() {
            return Err(anyhow!(
                "La ruta seleccionada no es un directorio válido: {:?}",
                candidate
            ));
        }

        let probe_path = candidate.join(".__junglemonkai_probe");
        fs::create_dir_all(candidate)?;
        fs::write(&probe_path, b"probe").with_context(|| {
            format!(
                "no se pudo escribir en el directorio seleccionado {:?}",
                candidate
            )
        })?;
        fs::remove_file(probe_path).ok();
        Ok(())
    }

    fn persist_metadata(&self) -> Result<()> {
        if let Some(parent) = self.metadata_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let payload = PersistedUserDataConfig {
            base_dir: self.base_dir.clone(),
            last_migrated_from: self.last_migrated_from.clone(),
            last_migrated_at: self.last_migrated_at,
        };

        let json = serde_json::to_vec_pretty(&payload)?;
        fs::write(&self.metadata_path, json)?;
        Ok(())
    }

    fn load_metadata(path: &Path) -> Result<Option<PersistedUserDataConfig>> {
        if !path.exists() {
            return Ok(None);
        }

        let contents = fs::read_to_string(path)?;
        let data: PersistedUserDataConfig = serde_json::from_str(&contents)?;
        Ok(Some(data))
    }

    fn append_migration_log(&self, event: &str, from: &Path, to: &Path) {
        let log_path = self.base_dir.join("migration.log");
        if let Some(parent) = log_path.parent() {
            if fs::create_dir_all(parent).is_err() {
                return;
            }
        }

        let timestamp = Self::timestamp_now();
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
            let entry = serde_json::json!({
                "event": event,
                "from": from.to_string_lossy(),
                "to": to.to_string_lossy(),
                "timestamp": timestamp,
            });
            let _ = writeln!(file, "{}", entry);
        }

        info!(
            "User data migration event: {} -> {} ({event})",
            from.to_string_lossy(),
            to.to_string_lossy()
        );
    }

    fn timestamp_now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn default_base_dir() -> Result<PathBuf> {
        let platform = PlatformKind::detect();
        let home =
            home_dir().ok_or_else(|| anyhow!("no se pudo resolver el directorio de usuario"))?;
        let appdata = data_dir();
        Ok(Self::build_default_base_dir(platform, home, appdata))
    }

    fn build_default_base_dir(
        platform: PlatformKind,
        home: PathBuf,
        appdata: Option<PathBuf>,
    ) -> PathBuf {
        match platform {
            PlatformKind::Windows => appdata.unwrap_or(home).join("JungleMonkAI"),
            PlatformKind::MacOs => home
                .join("Library")
                .join("Application Support")
                .join("JungleMonkAI"),
            PlatformKind::Linux => home.join(".junglemonkai"),
        }
    }
}

pub struct UserDataPathsState {
    inner: RwLock<UserDataPaths>,
}

impl UserDataPathsState {
    pub fn new(inner: UserDataPaths) -> Self {
        Self {
            inner: RwLock::new(inner),
        }
    }

    pub fn info(&self) -> UserDataPathsInfo {
        self.inner.read().unwrap().info()
    }

    pub fn update_base_dir(&self, candidate: PathBuf) -> Result<UserDataPathsInfo> {
        let mut guard = self.inner.write().unwrap();
        guard.set_base_dir(candidate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_path_windows_uses_appdata() {
        let home = PathBuf::from("C:/Users/demo");
        let appdata = Some(PathBuf::from("C:/Users/demo/AppData/Roaming"));
        let path =
            UserDataPaths::build_default_base_dir(PlatformKind::Windows, home.clone(), appdata);
        assert_eq!(
            path,
            PathBuf::from("C:/Users/demo/AppData/Roaming/JungleMonkAI")
        );
    }

    #[test]
    fn default_path_macos_uses_application_support() {
        let home = PathBuf::from("/Users/demo");
        let path = UserDataPaths::build_default_base_dir(PlatformKind::MacOs, home.clone(), None);
        assert_eq!(
            path,
            PathBuf::from("/Users/demo/Library/Application Support/JungleMonkAI")
        );
    }

    #[test]
    fn default_path_linux_is_hidden_folder() {
        let home = PathBuf::from("/home/demo");
        let path = UserDataPaths::build_default_base_dir(PlatformKind::Linux, home.clone(), None);
        assert_eq!(path, PathBuf::from("/home/demo/.junglemonkai"));
    }

    #[test]
    fn migrates_legacy_directories() -> Result<()> {
        let legacy = tempfile::tempdir()?;
        let legacy_config = legacy.path().join("config_old");
        let legacy_data = legacy.path().join("data_old");
        fs::create_dir_all(&legacy_config)?;
        fs::create_dir_all(&legacy_data)?;
        fs::write(legacy_config.join("config.json"), b"{}")?;
        fs::write(legacy_data.join("models.json"), b"{}")?;

        let base = legacy.path().join("new_base");
        fs::create_dir_all(&base)?;

        let mut instance = UserDataPaths {
            base_dir: base.clone(),
            config_dir: base.join("config"),
            data_dir: base.join("data"),
            default_base_dir: base.clone(),
            legacy_config_dir: legacy_config.clone(),
            legacy_data_dir: legacy_data.clone(),
            metadata_path: legacy_config.join("user-paths.json"),
            last_migrated_from: None,
            last_migrated_at: None,
            legacy_migration_performed: false,
        };
        fs::create_dir_all(instance.config_dir.clone())?;
        fs::create_dir_all(instance.data_dir.clone())?;

        instance.perform_initial_migration()?;

        assert!(instance.config_dir.join("config.json").exists());
        assert!(instance.data_dir.join("models.json").exists());
        Ok(())
    }
}
