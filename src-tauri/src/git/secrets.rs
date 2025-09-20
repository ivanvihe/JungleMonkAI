use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("{0}")]
    Message(String),
}

#[derive(Default, Serialize, Deserialize)]
struct SecretStore(HashMap<String, String>);

pub struct SecretManager {
    service: String,
    store_path: PathBuf,
    key: [u8; 32],
    cache: Mutex<Option<HashMap<String, String>>>,
}

impl SecretManager {
    pub fn new(service: impl Into<String>, base_path: PathBuf) -> Result<Self, SecretError> {
        let service = service.into();
        let store_dir = base_path.join("secrets").join(&service);
        ensure_directory(&store_dir).map_err(map_io_error)?;

        let key_path = store_dir.join("master.key");
        let store_path = store_dir.join("credentials.enc");
        let key = load_or_create_key(&key_path).map_err(map_io_error)?;

        Ok(Self {
            service,
            store_path,
            key,
            cache: Mutex::new(None),
        })
    }

    pub fn store(&self, key: &str, value: &str) -> Result<(), SecretError> {
        let mut data = self.read_all()?;
        if value.is_empty() {
            data.remove(key);
        } else {
            data.insert(key.to_string(), value.to_string());
        }
        self.write_all(&data)
    }

    pub fn read(&self, key: &str) -> Result<Option<String>, SecretError> {
        let data = self.read_all()?;
        Ok(data.get(key).cloned())
    }

    pub fn delete(&self, key: &str) -> Result<(), SecretError> {
        let mut data = self.read_all()?;
        data.remove(key);
        self.write_all(&data)
    }

    pub fn contains(&self, key: &str) -> Result<bool, SecretError> {
        let data = self.read_all()?;
        Ok(data.contains_key(key))
    }

    fn cipher(&self) -> Result<Aes256Gcm, SecretError> {
        Aes256Gcm::new_from_slice(&self.key)
            .map_err(|err| SecretError::Message(format!("Error creando el cifrador: {err}")))
    }

    fn read_all(&self) -> Result<HashMap<String, String>, SecretError> {
        if let Some(cache) = self.cache.lock().unwrap().clone() {
            return Ok(cache);
        }

        if !self.store_path.exists() {
            return Ok(HashMap::new());
        }

        let bytes = fs::read(&self.store_path).map_err(map_io_error)?;
        if bytes.len() < 12 {
            return Ok(HashMap::new());
        }

        let (nonce_bytes, payload) = bytes.split_at(12);
        let cipher = self.cipher()?;
        let decrypted = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), payload)
            .map_err(|err| SecretError::Message(format!("No se pudo descifrar el almacén: {err}")))?;

        let store: SecretStore = serde_json::from_slice(&decrypted)
            .map_err(|err| SecretError::Message(format!("No se pudo parsear el almacén: {err}")))?;

        let mut guard = self.cache.lock().unwrap();
        *guard = Some(store.0.clone());
        Ok(store.0)
    }

    fn write_all(&self, data: &HashMap<String, String>) -> Result<(), SecretError> {
        let plaintext = serde_json::to_vec(&SecretStore(data.clone()))
            .map_err(|err| SecretError::Message(format!("No se pudo serializar el almacén: {err}")))?;

        let mut nonce_bytes = [0u8; 12];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let cipher = self.cipher()?;
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_ref())
            .map_err(|err| SecretError::Message(format!("No se pudo cifrar el almacén: {err}")))?;

        let mut output = Vec::with_capacity(12 + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        if let Some(parent) = self.store_path.parent() {
            ensure_directory(parent).map_err(map_io_error)?;
        }

        fs::write(&self.store_path, &output).map_err(map_io_error)?;
        secure_permissions(&self.store_path).ok();

        let mut guard = self.cache.lock().unwrap();
        *guard = Some(data.clone());
        Ok(())
    }
}

impl std::fmt::Debug for SecretManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecretManager")
            .field("service", &self.service)
            .finish()
    }
}

fn load_or_create_key(path: &Path) -> Result<[u8; 32], std::io::Error> {
    if path.exists() {
        let data = fs::read(path)?;
        if data.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&data);
            return Ok(key);
        }
    }

    if let Some(parent) = path.parent() {
        ensure_directory(parent)?;
    }

    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    fs::write(path, &key)?;
    secure_permissions(path).ok();
    Ok(key)
}

fn ensure_directory(path: &Path) -> Result<(), std::io::Error> {
    if !path.exists() {
        fs::create_dir_all(path)?;
        secure_permissions(path).ok();
    }
    Ok(())
}

fn secure_permissions(path: &Path) -> Result<(), std::io::Error> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(path)?;
        if metadata.is_dir() {
            fs::set_permissions(path, fs::Permissions::from_mode(0o700))?
        } else {
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))?
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn map_io_error(err: std::io::Error) -> SecretError {
    SecretError::Message(err.to_string())
}
