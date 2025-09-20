use std::collections::HashMap;
use std::path::{Path, PathBuf};

use git2::{self, BranchType, DiffFormat, Repository, Status};
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
pub fn get_repository_context(repo_path: String) -> Result<RepoContext, String> {
    let repo = Repository::open(&repo_path).map_err(map_git_err)?;
    let head = repo.head().ok();

    let branch = head
        .as_ref()
        .and_then(|reference| reference.shorthand().map(|value| value.to_string()));

    let last_commit = head
        .as_ref()
        .and_then(|reference| reference.peel_to_commit().ok())
        .map(|commit| RepoCommitSummary {
            id: commit.id().to_string(),
            message: commit.summary().map(|value| value.to_string()),
            author: commit.author().name().map(|value| value.to_string()),
            time: Some(commit.time().seconds()),
        });

    let mut remote_summary = None;

    if let Some(branch_name) = branch.clone() {
        if let Ok(local_branch) = repo.find_branch(&branch_name, BranchType::Local) {
            if let Ok(upstream) = local_branch.upstream() {
                if let Ok(Some(full_name)) = upstream.name() {
                    if let Some(stripped) = full_name.strip_prefix("refs/remotes/") {
                        let mut parts = stripped.splitn(2, '/');
                        if let Some(remote_name) = parts.next() {
                            let remote_branch = parts.next().map(|value| value.to_string());
                            let url = repo
                                .find_remote(remote_name)
                                .ok()
                                .and_then(|remote| remote.url().map(|value| value.to_string()));
                            remote_summary = Some(RepoRemoteSummary {
                                name: remote_name.to_string(),
                                url,
                                branch: remote_branch,
                            });
                        }
                    }
                }
            }
        }
    }

    if remote_summary.is_none() {
        let remote_name = repo
            .remotes()
            .ok()
            .and_then(|remotes| remotes.iter().flatten().next().map(|value| value.to_string()));

        if let Some(name) = remote_name {
            let url = repo
                .find_remote(&name)
                .ok()
                .and_then(|remote| remote.url().map(|value| value.to_string()));
            remote_summary = Some(RepoRemoteSummary {
                name,
                url,
                branch: None,
            });
        }
    }

    Ok(RepoContext {
        branch,
        last_commit,
        remote: remote_summary,
    })
}

#[tauri::command]
pub async fn list_user_repos(
    request: Option<ListReposRequest>,
    manager: State<'_, SecretManager>,
) -> Result<Vec<RemoteRepositorySummary>, String> {
    let request = request.unwrap_or(ListReposRequest {
        provider: None,
        owner: None,
    });

    let provider = request
        .provider
        .clone()
        .unwrap_or_else(|| "github".to_string());

    if provider.as_str() != "github" {
        return Err(format!(
            "El listado remoto solo está soportado para GitHub (recibido: {provider})"
        ));
    }

    let token = manager
        .read(&provider)
        .map_err(|error| error.to_string())?
        .flatten()
        .ok_or_else(|| "No se encontró un token almacenado para GitHub".to_string())?;

    let owner_filter = request.owner.clone();
    let mut collected = Vec::new();
    let client = reqwest::Client::new();
    let mut page = 1;

    loop {
        let url = format!(
            "https://api.github.com/user/repos?per_page=100&page={page}&affiliation=owner,collaborator,organization_member"
        );

        let response = client
            .get(url)
            .header("Authorization", format!("token {token}"))
            .header("User-Agent", "JungleMonkAI-Tauri")
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!(
                "Error al obtener repositorios desde GitHub ({status}): {text}"
            ));
        }

        let payload: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|error| error.to_string())?;

        let mut batch = Vec::new();

        for repo in payload.into_iter() {
            let owner_login = repo
                .get("owner")
                .and_then(|owner| owner.get("login"))
                .and_then(|value| value.as_str())
                .unwrap_or("");

            if let Some(filter) = owner_filter.as_ref() {
                if owner_login.to_lowercase() != filter.to_lowercase() {
                    continue;
                }
            }

            let summary = RemoteRepositorySummary {
                id: repo
                    .get("id")
                    .and_then(|value| value.as_u64())
                    .unwrap_or_default(),
                name: repo
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string(),
                full_name: repo
                    .get("full_name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string(),
                owner: owner_login.to_string(),
                description: repo
                    .get("description")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                default_branch: repo
                    .get("default_branch")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                html_url: repo
                    .get("html_url")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                clone_url: repo
                    .get("clone_url")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                ssh_url: repo
                    .get("ssh_url")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                private: repo
                    .get("private")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false),
                visibility: repo
                    .get("visibility")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
            };

            batch.push(summary);
        }

        let count = batch.len();
        collected.extend(batch);

        if count < 100 {
            break;
        }

        page += 1;
    }

    Ok(collected)
}

#[tauri::command]
pub async fn clone_repository(
    payload: CloneRepositoryRequest,
    manager: State<'_, SecretManager>,
) -> Result<(), String> {
    let CloneRepositoryRequest {
        url,
        directory,
        provider,
        token,
        reference,
    } = payload;

    let provider = provider.unwrap_or_else(|| "github".to_string());
    let stored_token = match token {
        Some(value) => Some(value),
        None => manager
            .read(&provider)
            .map_err(|error| error.to_string())?
            .flatten(),
    };

    let clone_reference = reference.clone();
    let auth_token = stored_token.clone();
    let task = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut callbacks = git2::RemoteCallbacks::new();
        if let Some(token) = auth_token.clone() {
            callbacks.credentials(move |_, username_from_url, _| {
                let username = username_from_url.unwrap_or("oauth2");
                git2::Cred::userpass_plaintext(username, &token)
                    .or_else(|_| git2::Cred::userpass_plaintext("oauth2", &token))
            });
        }

        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        if let Some(reference) = clone_reference.as_ref() {
            builder.branch(reference);
        }

        builder
            .clone(&url, Path::new(&directory))
            .map_err(map_git_err)?;

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?;

    task
}

#[tauri::command]
pub async fn pull_changes(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = std::process::Command::new("git");
        command.current_dir(&repo_path);
        command.arg("pull");

        if let Some(remote_name) = remote {
            command.arg(remote_name);
        }

        if let Some(branch_name) = branch {
            command.arg(branch_name);
        }

        let output = command.output().map_err(|error| error.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}


#[derive(Debug, Serialize)]
pub struct RepoContext {
    pub branch: Option<String>,
    pub last_commit: Option<RepoCommitSummary>,
    pub remote: Option<RepoRemoteSummary>,
}

#[derive(Debug, Serialize)]
pub struct RepoCommitSummary {
    pub id: String,
    pub message: Option<String>,
    pub author: Option<String>,
    pub time: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct RepoRemoteSummary {
    pub name: String,
    pub url: Option<String>,
    pub branch: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RemoteRepositorySummary {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub description: Option<String>,
    pub default_branch: Option<String>,
    pub html_url: Option<String>,
    pub clone_url: Option<String>,
    pub ssh_url: Option<String>,
    pub private: bool,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListReposRequest {
    pub provider: Option<String>,
    pub owner: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CloneRepositoryRequest {
    pub url: String,
    pub directory: String,
    pub provider: Option<String>,
    pub token: Option<String>,
    pub reference: Option<String>,
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
            index.add_path(Path::new(&file)).map_err(map_git_err)?;
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
        repo.signature()
            .or_else(|_| repo.default_signature())
            .map_err(map_git_err)?
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
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                &message,
                &tree,
                &[&parent],
            )
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
        .or_else(|| {
            repo.head()
                .ok()
                .and_then(|head| head.shorthand().map(|s| s.to_string()))
        })
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

    let head_tree = repo
        .head()
        .ok()
        .and_then(|reference| reference.peel_to_tree().ok());

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
pub fn store_secret(
    provider: String,
    token: String,
    manager: State<'_, SecretManager>,
) -> Result<(), String> {
    if token.trim().is_empty() {
        manager.delete(&provider).map_err(|e| e.to_string())
    } else {
        manager
            .store(&provider, token.trim())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn has_secret(provider: String, manager: State<'_, SecretManager>) -> Result<bool, String> {
    manager.contains(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_secret(
    provider: String,
    manager: State<'_, SecretManager>,
) -> Result<Option<String>, String> {
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
            directories
                .entry(parent.to_path_buf())
                .or_insert_with(|| RepoEntry {
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

async fn create_github_pr(
    payload: &PullRequestPayload,
    token: &str,
) -> Result<PullRequestResponse, String> {
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

async fn create_gitlab_mr(
    payload: &PullRequestPayload,
    token: &str,
) -> Result<PullRequestResponse, String> {
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
        return Err(format!(
            "Error al crear el Merge Request en GitLab ({status}): {text}"
        ));
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
