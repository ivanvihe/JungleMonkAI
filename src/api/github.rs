use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct GitHubUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRepository {
    full_name: String,
    archived: bool,
}

pub struct GitHubData {
    pub username: String,
    pub repositories: Vec<String>,
}

/// Fetch the authenticated GitHub username and repositories using the provided token.
pub fn fetch_user_and_repositories(token: &str) -> Result<GitHubData> {
    if token.trim().is_empty() {
        return Err(anyhow!("GitHub token is empty"));
    }

    let client = Client::builder()
        .user_agent("JungleMonkAI/0.1")
        .build()
        .context("Failed to build HTTP client")?;

    let user: GitHubUser = client
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .send()
        .context("Failed to request GitHub user profile")?
        .error_for_status()
        .context("GitHub returned an error for the profile request")?
        .json()
        .context("Failed to deserialize GitHub user profile")?;

    let mut repositories: Vec<GitHubRepository> = client
        .get("https://api.github.com/user/repos")
        .query(&[("per_page", "100"), ("sort", "updated")])
        .bearer_auth(token)
        .send()
        .context("Failed to request GitHub repositories")?
        .error_for_status()
        .context("GitHub returned an error for the repositories request")?
        .json()
        .context("Failed to deserialize GitHub repositories")?;

    repositories.retain(|repo| !repo.archived);

    let repo_names = repositories
        .into_iter()
        .map(|repo| repo.full_name)
        .collect::<Vec<_>>();

    Ok(GitHubData {
        username: user.login,
        repositories: repo_names,
    })
}
