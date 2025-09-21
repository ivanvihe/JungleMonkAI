export type GitCommand =
  | 'git_list_user_repos'
  | 'git_get_repository_context'
  | 'git_list_repository_files'
  | 'git_repository_status'
  | 'git_get_file_diff'
  | 'git_commit_changes'
  | 'git_push_changes'
  | 'git_create_pull_request'
  | 'git_apply_patch'
  | 'git_pull_repository'
  | 'git_pull_changes'
  | 'git_clone_repository'
  | 'git_store_secret'
  | 'git_has_secret'
  | 'reveal_secret';

const ELECTRON_CHANNEL_MAP: Record<GitCommand, string> = {
  git_list_user_repos: 'git:list-user-repos',
  git_get_repository_context: 'git:get-context',
  git_list_repository_files: 'git:list-files',
  git_repository_status: 'git:status',
  git_get_file_diff: 'git:file-diff',
  git_commit_changes: 'git:commit',
  git_push_changes: 'git:push',
  git_create_pull_request: 'git:create-pull-request',
  git_apply_patch: 'git:apply-patch',
  git_pull_repository: 'git:pull-repository',
  git_pull_changes: 'git:pull-changes',
  git_clone_repository: 'git:clone',
  git_store_secret: 'secrets:store',
  git_has_secret: 'secrets:has',
  reveal_secret: 'secrets:reveal',
};

let tauriInvokePromise: Promise<((command: string, args?: unknown) => Promise<any>) | null> | null = null;

export class GitBackendUnavailableError extends Error {
  constructor(message = 'El backend de Git no está disponible en este entorno.') {
    super(message);
    this.name = 'GitBackendUnavailableError';
  }
}

const isWindowDefined = typeof window !== 'undefined';

export const isElectronRuntime = (): boolean => {
  return isWindowDefined && typeof window.electronAPI !== 'undefined';
};

export const hasElectronGitBridge = (): boolean => {
  return isElectronRuntime() && typeof window.electronAPI?.gitInvoke === 'function';
};

export interface DesktopJarvisStatus {
  running: boolean;
  pid: number | null;
  lastExitCode: number | null;
  lastSignal: number | string | null;
  lastStdout: string | null;
  lastStderr: string | null;
  lastError: string | null;
}

export interface StartJarvisOptions {
  pythonPath?: string;
}

export const hasElectronJarvisBridge = (): boolean => {
  return isElectronRuntime() && typeof window.electronAPI?.jarvisStart === 'function';
};

export const isTauriRuntime = (): boolean => {
  return isWindowDefined && typeof window.__TAURI__ !== 'undefined';
};

const ensureTauriInvoke = async () => {
  if (!isTauriRuntime()) {
    return null;
  }
  if (!tauriInvokePromise) {
    tauriInvokePromise = import('@tauri-apps/api/tauri')
      .then(module => module.invoke)
      .catch(() => null);
  }
  return tauriInvokePromise;
};

export const canUseDesktopGit = (): boolean => {
  return hasElectronGitBridge() || isTauriRuntime();
};

export const isGitBackendUnavailableError = (error: unknown): error is GitBackendUnavailableError => {
  return error instanceof GitBackendUnavailableError;
};

export const startDesktopJarvis = async (
  options?: StartJarvisOptions,
): Promise<DesktopJarvisStatus | null> => {
  if (hasElectronJarvisBridge()) {
    try {
      return (await window.electronAPI!.jarvisStart?.(options)) ?? null;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const invokeLoader = await ensureTauriInvoke();
  if (invokeLoader) {
    return invokeLoader<DesktopJarvisStatus>('jarvis_start', options ?? {});
  }

  return null;
};

export const stopDesktopJarvis = async (): Promise<DesktopJarvisStatus | null> => {
  if (hasElectronJarvisBridge()) {
    try {
      return (await window.electronAPI!.jarvisStop?.()) ?? null;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const invokeLoader = await ensureTauriInvoke();
  if (invokeLoader) {
    return invokeLoader<DesktopJarvisStatus>('jarvis_stop');
  }

  return null;
};

export const getDesktopJarvisStatus = async (): Promise<DesktopJarvisStatus | null> => {
  if (hasElectronJarvisBridge()) {
    try {
      return (await window.electronAPI!.jarvisStatus?.()) ?? null;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const invokeLoader = await ensureTauriInvoke();
  if (invokeLoader) {
    return invokeLoader<DesktopJarvisStatus>('jarvis_status');
  }

  return null;
};

export const gitInvoke = async <T>(command: GitCommand, payload?: unknown): Promise<T> => {
  if (hasElectronGitBridge()) {
    const channel = ELECTRON_CHANNEL_MAP[command];
    if (!channel) {
      throw new Error(`Comando git no soportado en Electron: ${command}`);
    }
    const api = window.electronAPI!;
    if (command === 'git_list_user_repos' && typeof api.listGitRepos === 'function') {
      return api.listGitRepos(payload) as Promise<T>;
    }
    return api.gitInvoke<T>(channel, payload);
  }

  const invokeLoader = await ensureTauriInvoke();
  if (invokeLoader) {
    return invokeLoader<T>(command, payload);
  }

  throw new GitBackendUnavailableError();
};

