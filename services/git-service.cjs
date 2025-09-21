const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const { execFile } = require('child_process');
const simpleGit = require('simple-git');

const normalizePath = value => value.split(path.sep).join('/');

const ensureDir = async target => {
  await fsPromises.mkdir(target, { recursive: true });
};

const runGitCommand = (repoPath, args, input) => {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, { cwd: repoPath }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr && stderr.trim()) || error.message || 'Error al ejecutar git.';
        reject(new Error(message));
        return;
      }
      resolve(stdout);
    });

    if (child.stdin && input) {
      child.stdin.end(input);
    }
  });
};

const walkRepositoryEntries = async repoPath => {
  const results = [];
  const stack = [repoPath];

  while (stack.length > 0) {
    const current = stack.pop();
    let dirents;
    try {
      dirents = await fsPromises.readdir(current, { withFileTypes: true });
    } catch (error) {
      throw new Error(`No se pudo leer el directorio ${current}: ${error.message || error}`);
    }

    for (const entry of dirents) {
      if (entry.name === '.git') {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      const relative = normalizePath(path.relative(repoPath, fullPath));
      if (!relative) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push({ path: relative, kind: 'directory' });
        stack.push(fullPath);
      } else if (entry.isFile()) {
        results.push({ path: relative, kind: 'file' });
      }
    }
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
};

const buildStatusMap = status => {
  const map = new Map();
  for (const file of status.files || []) {
    map.set(normalizePath(file.path), {
      index: file.index || null,
      workdir: file.working_dir || null,
      is_conflicted: file.index === 'U' || file.working_dir === 'U',
    });
  }
  return map;
};

const createSecretsManager = secretsFile => {
  let cache = null;

  const load = async () => {
    if (cache) {
      return cache;
    }
    try {
      const raw = await fsPromises.readFile(secretsFile, 'utf-8');
      cache = JSON.parse(raw);
    } catch {
      cache = {};
    }
    return cache;
  };

  const save = async secrets => {
    cache = secrets;
    await ensureDir(path.dirname(secretsFile));
    await fsPromises.writeFile(secretsFile, JSON.stringify(secrets, null, 2), 'utf-8');
  };

  const store = async (provider, token) => {
    const secrets = await load();
    if (typeof token === 'string' && token.trim()) {
      secrets[provider] = token.trim();
    } else {
      delete secrets[provider];
    }
    await save(secrets);
  };

  const contains = async provider => {
    const secrets = await load();
    const value = secrets[provider];
    return typeof value === 'string' && value.trim().length > 0;
  };

  const reveal = async provider => {
    const secrets = await load();
    const value = secrets[provider];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return null;
  };

  return { store, contains, reveal };
};

const formatPullSummary = (result, remoteName, branchName) => {
  const changes = result?.summary?.changes || 0;
  const insertions = result?.summary?.insertions || 0;
  const deletions = result?.summary?.deletions || 0;
  const files = Array.isArray(result?.files) ? result.files.length : 0;

  if (changes === 0 && insertions === 0 && deletions === 0 && files === 0) {
    return 'El repositorio ya está sincronizado.';
  }

  const target = branchName ? `${remoteName}/${branchName}` : remoteName;
  return `Pull completado desde ${target}.`;
};

const ensureRepository = async repoPath => {
  const git = simpleGit({ baseDir: repoPath });
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`La ruta ${repoPath} no es un repositorio Git válido.`);
  }
  return git;
};

const buildRepoContext = async git => {
  const status = await git.status();
  const branch = status.current || null;

  let lastCommit = null;
  try {
    const log = await git.log({ n: 1 });
    if (log.latest) {
      const latest = log.latest;
      lastCommit = {
        id: latest.hash,
        message: latest.message || null,
        author: latest.author_name || null,
        time: latest.date ? Math.floor(new Date(latest.date).getTime() / 1000) : null,
      };
    }
  } catch {
    lastCommit = null;
  }

  let remoteSummary = null;
  try {
    const remotes = await git.getRemotes(true);
    if (remotes.length > 0) {
      const primary = remotes.find(remote => remote.refs?.push || remote.refs?.fetch) || remotes[0];
      remoteSummary = {
        name: primary.name,
        url: primary.refs?.push || primary.refs?.fetch || null,
        branch: null,
      };
    }
  } catch {
    remoteSummary = null;
  }

  return { branch, last_commit: lastCommit, remote: remoteSummary };
};

const ensureGithubToken = async (manager, provided) => {
  if (typeof provided === 'string' && provided.trim()) {
    return provided.trim();
  }
  const stored = await manager.reveal('github');
  if (stored) {
    return stored;
  }
  throw new Error('No se encontró un token almacenado para GitHub.');
};

const fetchGithub = async (token, url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${token}`,
      'User-Agent': 'JungleMonkAI-Electron',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Solicitud a GitHub falló (${response.status}): ${text}`);
  }

  return response.json();
};

const mapGithubRepo = repo => ({
  id: repo.id,
  name: repo.name,
  full_name: repo.full_name,
  owner: repo.owner?.login || '',
  description: repo.description,
  default_branch: repo.default_branch,
  html_url: repo.html_url,
  clone_url: repo.clone_url,
  ssh_url: repo.ssh_url,
  private: !!repo.private,
  visibility: repo.visibility,
});

const createGitService = app => {
  const userDataDir = app.getPath('userData');
  const secretsFile = path.join(userDataDir, 'runtime-bridge', 'secrets.json');
  const secretsManager = createSecretsManager(secretsFile);

  const listUserRepos = async payload => {
    const request = payload?.request || {};
    const provider = (request.provider || 'github').toLowerCase();
    if (provider !== 'github') {
      throw new Error(`El proveedor ${provider} no está soportado para listar repos en Electron.`);
    }
    const token = await ensureGithubToken(secretsManager, request.token);
    const ownerFilter = request.owner ? request.owner.toLowerCase() : null;

    const results = [];
    for (let page = 1; page <= 10; page += 1) {
      const url = `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`;
      const response = await fetchGithub(token, url);
      if (!Array.isArray(response) || response.length === 0) {
        break;
      }
      for (const repo of response) {
        if (ownerFilter && repo.owner?.login?.toLowerCase() !== ownerFilter) {
          continue;
        }
        results.push(mapGithubRepo(repo));
      }
      if (response.length < 100) {
        break;
      }
    }

    return results;
  };

  const getRepositoryContext = async payload => {
    const { repoPath } = payload || {};
    if (!repoPath) {
      throw new Error('Falta repoPath para obtener el contexto.');
    }
    const git = await ensureRepository(repoPath);
    return buildRepoContext(git);
  };

  const listRepositoryFiles = async payload => {
    const { repoPath } = payload || {};
    if (!repoPath) {
      throw new Error('Falta repoPath para listar archivos.');
    }
    const git = await ensureRepository(repoPath);
    const status = await git.status();
    const statusMap = buildStatusMap(status);
    const entries = await walkRepositoryEntries(repoPath);
    return entries.map(entry => {
      if (entry.kind === 'file' && statusMap.has(entry.path)) {
        return { ...entry, status: statusMap.get(entry.path) };
      }
      return entry;
    });
  };

  const getRepositoryStatus = async payload => {
    const { repoPath } = payload || {};
    if (!repoPath) {
      throw new Error('Falta repoPath para obtener el estado.');
    }
    const git = await ensureRepository(repoPath);
    const status = await git.status();
    const entries = (status.files || []).map(file => ({
      path: normalizePath(file.path),
      kind: 'file',
      status: {
        index: file.index || null,
        workdir: file.working_dir || null,
        is_conflicted: file.index === 'U' || file.working_dir === 'U',
      },
    }));
    return { entries };
  };

  const getFileDiff = async payload => {
    const { repoPath, pathspec } = payload || {};
    if (!repoPath || !pathspec) {
      throw new Error('Faltan parámetros para obtener el diff.');
    }
    const git = await ensureRepository(repoPath);
    const unstaged = await git.diff(['--', pathspec]);
    const staged = await git.diff(['--cached', '--', pathspec]);
    if (staged && unstaged) {
      return `${staged}\n${unstaged}`.trim();
    }
    return (staged || unstaged || '').trim();
  };

  const commitChanges = async payload => {
    const request = payload?.payload || payload || {};
    const { repoPath, message, files, author_name, author_email, allow_empty } = request;
    if (!repoPath || !message) {
      throw new Error('Faltan parámetros para crear el commit.');
    }
    const git = await ensureRepository(repoPath);
    if (Array.isArray(files) && files.length > 0) {
      await git.add(files);
    } else {
      await git.add(['-A']);
    }
    const args = ['commit', '-m', message];
    if (allow_empty) {
      args.push('--allow-empty');
    }
    if (author_name && author_email) {
      args.push('--author', `${author_name} <${author_email}>`);
    }
    await git.raw(args);
    const head = await git.revparse(['HEAD']);
    return head.trim();
  };

  const pushChanges = async payload => {
    const request = payload?.payload || payload || {};
    const { repoPath, remote, branch } = request;
    if (!repoPath) {
      throw new Error('Falta repoPath para ejecutar git push.');
    }
    const git = await ensureRepository(repoPath);
    const remoteName = remote || 'origin';
    if (branch) {
      await git.push(remoteName, branch);
    } else {
      await git.push(remoteName);
    }
    return 'ok';
  };

  const pullRepository = async payload => {
    const { repoPath, remote, branch } = payload || {};
    if (!repoPath) {
      throw new Error('Falta repoPath para ejecutar git pull.');
    }
    const git = await ensureRepository(repoPath);
    const remoteName = remote || 'origin';
    const result = await git.pull(remoteName, branch || undefined);
    return formatPullSummary(result, remoteName, branch || null);
  };

  const pullChanges = async payload => {
    const { repoPath, remote, branch } = payload || {};
    return pullRepository({ repoPath, remote, branch });
  };

  const createPullRequest = async payload => {
    const request = payload?.payload || payload || {};
    const { provider, owner, repository, title, body, head, base, draft, token } = request;
    if (!provider || !owner || !repository || !title || !head || !base) {
      throw new Error('Faltan parámetros para crear el PR/MR.');
    }
    const normalizedProvider = provider.toLowerCase();
    switch (normalizedProvider) {
      case 'github': {
        const githubToken = await ensureGithubToken(secretsManager, token);
        const url = `https://api.github.com/repos/${owner}/${repository}/pulls`;
        const response = await fetchGithub(githubToken, url, {
          method: 'POST',
          body: JSON.stringify({ title, body, head, base, draft: !!draft }),
        });
        return {
          url: response.html_url || response.url,
          number: response.number,
          provider: 'github',
        };
      }
      case 'gitlab':
        throw new Error('La creación de Merge Requests para GitLab no está implementada en Electron.');
      default:
        throw new Error(`Proveedor de PR no soportado: ${provider}`);
    }
  };

  const applyPatch = async payload => {
    const { repoPath, patch, dryRun } = payload || {};
    if (!repoPath || typeof patch !== 'string') {
      throw new Error('Faltan parámetros para aplicar el parche.');
    }
    const args = ['apply', '--whitespace=nowarn'];
    if (dryRun) {
      args.push('--check');
    }
    await runGitCommand(repoPath, args, patch);
    return {};
  };

  const cloneRepository = async payload => {
    const request = payload?.payload || payload || {};
    const { url, directory, reference } = request;
    if (!url || !directory) {
      throw new Error('Faltan parámetros para clonar el repositorio.');
    }
    await ensureDir(path.dirname(directory));
    const git = simpleGit();
    const options = [];
    if (reference) {
      options.push('--branch', reference, '--single-branch');
    }
    await git.clone(url, directory, options);
    return { directory };
  };

  const storeSecret = async payload => {
    const { provider, token } = payload || {};
    if (!provider) {
      throw new Error('Falta el proveedor para almacenar el secreto.');
    }
    await secretsManager.store(provider, token);
    return {};
  };

  const hasSecret = async payload => {
    const { provider } = payload || {};
    if (!provider) {
      throw new Error('Falta el proveedor para consultar el secreto.');
    }
    return secretsManager.contains(provider);
  };

  const revealSecret = async payload => {
    const { provider } = payload || {};
    if (!provider) {
      throw new Error('Falta el proveedor para revelar el secreto.');
    }
    return secretsManager.reveal(provider);
  };

  return {
    listUserRepos,
    getRepositoryContext,
    listRepositoryFiles,
    getRepositoryStatus,
    getFileDiff,
    commitChanges,
    pushChanges,
    pullRepository,
    pullChanges,
    createPullRequest,
    applyPatch,
    cloneRepository,
    storeSecret,
    hasSecret,
    revealSecret,
  };
};

module.exports = {
  createGitService,
};

