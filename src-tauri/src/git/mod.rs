use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{self, DiffFormat, Repository, Status};
use serde::{Deserialize, Serialize};
use tauri::State;
use walkdir::WalkDir;

mod secrets;

pub use secrets::SecretManager;

#[derive(Debug, Serialize)]
pub struct RepoEntry {
    pub path: String,
    pub kind: RepoEntryKind,
    pub status: Option<RepoFileStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoEntryKind {
    File,
    Directory,
}

#[derive(Debug, Serialize)]
pub struct RepoFileStatus {
    pub index: Option<String>,
    pub workdir: Option<String>,
    pub is_conflicted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitRequest {
    pub repo_path: String,
    pub message: String,
    pub files: Option<Vec<String>>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub allow_empty: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PushRequest {
    pub repo_path: String,
    pub remote: Option<String>,
    pub branch: Option<String>,
    pub provider: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequestPayload {
    pub provider: String,
    pub owner: String,
    pub repository: String,
    pub title: String,
    pub body: String,
    pub head: String,
    pub base: String,
    pub draft: Option<bool>,
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PullRequestResponse {
    pub url: String,
    pub number: Option<u64>,
    pub provider: String,
}

#[derive(Debug, Serialize)]
pub struct RepoStatus {
    pub entries: Vec<RepoEntry>,
}

#[tauri::command]
pub fn list_repository_files(repo_path: String) -> Result<Vec<RepoEntry>, String> {
    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "El repositorio no tiene un directorio de trabajo".to_string())?
        .to_path_buf();

    let statuses = collect_status_map(&repo)?;
    let mut entries = Vec::new();

    for entry in WalkDir::new(&workdir)
        .into_iter()
        .filter_entry(|e| !is_hidden(e.path(), &workdir))
    {
        let entry = entry.map_err(map_walkdir_err)?;
        if entry.path() == workdir {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(&workdir)
            .map_err(|_| "No se pudo calcular la ruta relativa".to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if entry.file_type().is_dir() {
            entries.push(RepoEntry {
                path: relative,
                kind: RepoEntryKind::Directory,
                status: None,
            });
        } else if entry.file_type().is_file() {
            let status = statuses.get(&relative).map(|status| RepoFileStatus {
                index: status_index_string(*status),
                workdir: status_workdir_string(*status),
                is_conflicted: status.is_conflicted(),
            });

            entries.push(RepoEntry {
                path: relative,
                kind: RepoEntryKind::File,
                status,
            });
        }
    }

    entries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(entries)
}

#[tauri::command]
pub fn apply_patch(repo_path: String, patch: String, dry_run: bool) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let diff = git2::Diff::from_buffer(&repo, patch.as_bytes()).map_err(map_git_err)?;

    let mut options = git2::ApplyOptions::new();
    options.update_index(true);
    if dry_run {
        options.check(true);
    }

    repo.apply(&diff, git2::ApplyLocation::WorkDir, Some(&mut options))
        .map_err(map_git_err)?;

    Ok(())
}

#[tauri::command]
pub fn repository_status(repo_path: String) -> Result<RepoStatus, String> {
    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let entries = collect_status_entries(&repo)?;
    Ok(RepoStatus { entries })
}

#[tauri::command]
pub fn commit_changes(payload: CommitRequest) -> Result<String, String> {
    let CommitRequest {
        repo_path,
        message,
        files,
        author_name,
        author_email,
        allow_empty,
    } = payload;

    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let mut index = repo.index().map_err(map_git_err)?;

    if let Some(files) = files {
        for file in files {
            index
                .add_path(Path::new(&file))
                .map_err(map_git_err)?;
        }
    } else {
        index
            .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
            .map_err(map_git_err)?;
    }

    index.write().map_err(map_git_err)?;
    let tree_id = index.write_tree().map_err(map_git_err)?;
    let tree = repo.find_tree(tree_id).map_err(map_git_err)?;

    let head_tree_id = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok())
        .map(|tree| tree.id());

    if Some(tree_id) == head_tree_id && !allow_empty.unwrap_or(false) {
        return Err("No hay cambios para commitear".into());
    }

    let signature = if let (Some(name), Some(email)) = (author_name, author_email) {
        git2::Signature::now(&name, &email).map_err(map_git_err)?
    } else {
        repo.signature().or_else(|_| repo.default_signature()).map_err(map_git_err)?
    };

    let parent_commit = repo
        .head()
        .ok()
        .and_then(|head| head.target())
        .and_then(|oid| repo.find_commit(oid).ok());

    if index.is_empty() && !allow_empty.unwrap_or(false) {
        return Err("No hay cambios para commitear".into());
    }

    let commit_id = match parent_commit {
        Some(parent) => repo
            .commit(Some("HEAD"), &signature, &signature, &message, &tree, &[&parent])
            .map_err(map_git_err)?,
        None => repo
            .commit(Some("HEAD"), &signature, &signature, &message, &tree, &[])
            .map_err(map_git_err)?,
    };

    Ok(commit_id.to_string())
}

#[tauri::command]
pub fn push_changes(payload: PushRequest, manager: State<'_, SecretManager>) -> Result<(), String> {
    let repo = Repository::open(&payload.repo_path).map_err(map_git_err)?;
    let mut remote = repo
        .find_remote(payload.remote.as_deref().unwrap_or("origin"))
        .map_err(map_git_err)?;

    let branch = payload
        .branch
        .or_else(|| repo.head().ok().and_then(|head| head.shorthand().map(|s| s.to_string())))
        .ok_or_else(|| "No se pudo determinar la rama a pushear".to_string())?;

    let token = match (&payload.token, &payload.provider) {
        (Some(token), _) => Some(token.clone()),
        (None, Some(provider)) => manager.read(provider).map_err(|e| e.to_string())?,
        _ => None,
    };

    let mut callbacks = git2::RemoteCallbacks::new();
    if let Some(token) = token {
        callbacks.credentials(move |url, username_from_url, _| {
            let username = username_from_url.unwrap_or("oauth2");
            git2::Cred::userpass_plaintext(username, &token)
                .or_else(|_| git2::Cred::userpass_plaintext("oauth2", &token))
        });
    }

    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote
        .push(&[refspec], Some(&mut push_options))
        .map_err(map_git_err)?;

    Ok(())
}

#[tauri::command]
pub async fn create_pull_request(
    payload: PullRequestPayload,
    manager: State<'_, SecretManager>,
) -> Result<PullRequestResponse, String> {
    let token = match (&payload.token, manager.read(&payload.provider)) {
        (Some(token), _) => token.clone(),
        (None, Ok(Some(stored))) => stored,
        (None, Ok(None)) => {
            return Err("No se encontró un token almacenado para el proveedor".into());
        }
        (None, Err(err)) => return Err(err.to_string()),
    };

    match payload.provider.as_str() {
        "github" => create_github_pr(&payload, &token).await,
        "gitlab" => create_gitlab_mr(&payload, &token).await,
        provider => Err(format!("Proveedor de PR no soportado: {provider}")),
    }
}

#[tauri::command]
pub fn get_file_diff(repo_path: String, pathspec: String) -> Result<String, String> {
    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.pathspec(Path::new(&pathspec));
    diff_opts.include_untracked(true);

    let head_tree = repo.head().ok().and_then(|reference| reference.peel_to_tree().ok());

    let diff = if let Some(tree) = head_tree {
        repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut diff_opts))
    } else {
        repo.diff_tree_to_workdir_with_index(None, Some(&mut diff_opts))
    }
    .map_err(map_git_err)?;

    let mut buffer = Vec::new();
    diff.print(DiffFormat::Patch, |_, _, line| {
        buffer.extend_from_slice(line.content());
        true
    })
    .map_err(map_git_err)?;

    String::from_utf8(buffer).map_err(|_| "El diff contiene datos inválidos".into())
}

#[tauri::command]
pub fn store_secret(provider: String, token: String, manager: State<'_, SecretManager>) -> Result<(), String> {
    if token.trim().is_empty() {
        manager.delete(&provider).map_err(|e| e.to_string())
    } else {
        manager.store(&provider, token.trim()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn has_secret(provider: String, manager: State<'_, SecretManager>) -> Result<bool, String> {
    manager.contains(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_secret(provider: String, manager: State<'_, SecretManager>) -> Result<Option<String>, String> {
    manager.read(&provider).map_err(|e| e.to_string())
}

fn collect_status_map(repo: &Repository) -> Result<HashMap<String, Status>, String> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.renames_head_to_index(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(map_git_err)?;
    let mut map = HashMap::new();

    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            map.insert(path.to_string(), entry.status());
        }
    }

    Ok(map)
}

fn collect_status_entries(repo: &Repository) -> Result<Vec<RepoEntry>, String> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| "El repositorio no tiene un directorio de trabajo".to_string())?;
    let statuses = collect_status_map(repo)?;

    let mut entries: Vec<RepoEntry> = statuses
        .into_iter()
        .map(|(path, status)| RepoEntry {
            path,
            kind: RepoEntryKind::File,
            status: Some(RepoFileStatus {
                index: status_index_string(status),
                workdir: status_workdir_string(status),
                is_conflicted: status.is_conflicted(),
            }),
        })
        .collect();

    let mut directories: HashMap<PathBuf, RepoEntry> = HashMap::new();

    for entry in &entries {
        let mut current = PathBuf::from(&entry.path);
        while let Some(parent) = current.parent() {
            if parent.as_os_str().is_empty() {
                break;
            }
            directories.entry(parent.to_path_buf()).or_insert_with(|| RepoEntry {
                path: parent.to_string_lossy().into_owned(),
                kind: RepoEntryKind::Directory,
                status: None,
            });
            current = parent.to_path_buf();
        }
    }

    entries.extend(directories.into_values());
    entries.sort_by(|a, b| a.path.cmp(&b.path));

    // Filter out directories representing the repo root
    Ok(entries
        .into_iter()
        .filter(|entry| entry.path != ".")
        .collect())
}

fn status_index_string(status: Status) -> Option<String> {
    let mut flags = Vec::new();
    if status.contains(Status::INDEX_NEW) {
        flags.push("NEW");
    }
    if status.contains(Status::INDEX_MODIFIED) {
        flags.push("MODIFIED");
    }
    if status.contains(Status::INDEX_DELETED) {
        flags.push("DELETED");
    }
    if status.contains(Status::INDEX_RENAMED) {
        flags.push("RENAMED");
    }
    if status.contains(Status::INDEX_TYPECHANGE) {
        flags.push("TYPECHANGE");
    }
    if flags.is_empty() {
        None
    } else {
        Some(flags.join("|"))
    }
}

fn status_workdir_string(status: Status) -> Option<String> {
    let mut flags = Vec::new();
    if status.contains(Status::WT_NEW) {
        flags.push("NEW");
    }
    if status.contains(Status::WT_MODIFIED) {
        flags.push("MODIFIED");
    }
    if status.contains(Status::WT_DELETED) {
        flags.push("DELETED");
    }
    if status.contains(Status::WT_TYPECHANGE) {
        flags.push("TYPECHANGE");
    }
    if status.contains(Status::WT_RENAMED) {
        flags.push("RENAMED");
    }
    if status.contains(Status::WT_UNREADABLE) {
        flags.push("UNREADABLE");
    }
    if flags.is_empty() {
        None
    } else {
        Some(flags.join("|"))
    }
}

fn is_hidden(path: &Path, repo_root: &Path) -> bool {
    if path == repo_root {
        return false;
    }

    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(os_str) => os_str.to_str(),
            _ => None,
        })
        .any(|segment| segment.starts_with('.') && segment != ".")
}

fn map_git_err(err: git2::Error) -> String {
    err.message().to_string()
}

fn map_walkdir_err(err: walkdir::Error) -> String {
    err.to_string()
}

async fn create_github_pr(payload: &PullRequestPayload, token: &str) -> Result<PullRequestResponse, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{owner}/{repo}/pulls",
        owner = payload.owner,
        repo = payload.repository
    );

    #[derive(Serialize)]
    struct GithubBody<'a> {
        title: &'a str,
        head: &'a str,
        base: &'a str,
        body: &'a str,
        draft: bool,
    }

    let body = GithubBody {
        title: &payload.title,
        head: &payload.head,
        base: &payload.base,
        body: &payload.body,
        draft: payload.draft.unwrap_or(false),
    };

    let response = client
        .post(url)
        .header("Authorization", format!("token {token}"))
        .header("User-Agent", "JungleMonkAI-Tauri")
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Error al crear el PR en GitHub ({status}): {text}"));
    }

    let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
    let url = json
        .get("html_url")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "La respuesta de GitHub no contiene la URL del PR".to_string())?;
    let number = json.get("number").and_then(|value| value.as_u64());

    Ok(PullRequestResponse {
        url: url.to_string(),
        number,
        provider: "github".into(),
    })
}

async fn create_gitlab_mr(payload: &PullRequestPayload, token: &str) -> Result<PullRequestResponse, String> {
    let client = reqwest::Client::new();
    let project = format!("{}/{}", payload.owner, payload.repository);
    let encoded = urlencoding::encode(&project);
    let url = format!("https://gitlab.com/api/v4/projects/{encoded}/merge_requests");

    #[derive(Serialize)]
    struct GitlabBody<'a> {
        id: &'a str,
        title: &'a str,
        description: &'a str,
        source_branch: &'a str,
        target_branch: &'a str,
        draft: bool,
    }

    let body = GitlabBody {
        id: &project,
        title: &payload.title,
        description: &payload.body,
        source_branch: &payload.head,
        target_branch: &payload.base,
        draft: payload.draft.unwrap_or(false),
    };

    let response = client
        .post(url)
        .bearer_auth(token)
        .header("User-Agent", "JungleMonkAI-Tauri")
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Error al crear el Merge Request en GitLab ({status}): {text}"));
    }

    let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
    let url = json
        .get("web_url")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "La respuesta de GitLab no contiene la URL del MR".to_string())?;
    let number = json.get("iid").and_then(|value| value.as_u64());

    Ok(PullRequestResponse {
        url: url.to_string(),
        number,
        provider: "gitlab".into(),
    })
}
*** End
