export interface UserDataPathDescriptor {
  baseDir: string;
  configDir: string;
  dataDir: string;
  defaultBaseDir: string;
  isUsingDefault: boolean;
  legacyMigrationPerformed: boolean;
  lastMigratedFrom?: string;
  lastMigratedAt?: number;
}

const FALLBACK_BASE_DIR = '~/.junglemonkai';

let cachedDescriptor: Promise<UserDataPathDescriptor> | null = null;

export const isTauriEnvironment = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as any).__TAURI__);

const fetchDescriptor = async (): Promise<UserDataPathDescriptor> => {
  if (!isTauriEnvironment()) {
    return {
      baseDir: FALLBACK_BASE_DIR,
      configDir: `${FALLBACK_BASE_DIR}/config`,
      dataDir: `${FALLBACK_BASE_DIR}/data`,
      defaultBaseDir: FALLBACK_BASE_DIR,
      isUsingDefault: true,
      legacyMigrationPerformed: false,
      lastMigratedFrom: undefined,
      lastMigratedAt: undefined,
    };
  }

  const { invoke } = await import('@tauri-apps/api/tauri');
  return invoke<UserDataPathDescriptor>('get_user_data_paths');
};

export const getUserDataPaths = async (): Promise<UserDataPathDescriptor> => {
  if (!cachedDescriptor) {
    cachedDescriptor = fetchDescriptor().catch(error => {
      cachedDescriptor = null;
      throw error;
    });
  }

  return cachedDescriptor;
};

export const refreshUserDataPaths = () => {
  cachedDescriptor = null;
};

export const setUserDataBaseDir = async (path: string): Promise<UserDataPathDescriptor> => {
  if (!isTauriEnvironment()) {
    throw new Error(
      'La personalización de la ruta de datos solo está disponible en la versión de escritorio.',
    );
  }

  const { invoke } = await import('@tauri-apps/api/tauri');
  const descriptor = await invoke<UserDataPathDescriptor>('set_user_data_base_dir', { path });
  cachedDescriptor = Promise.resolve(descriptor);
  return descriptor;
};

export const openUserDataDirectoryDialog = async (
  defaultPath?: string,
): Promise<string | null> => {
  if (!isTauriEnvironment()) {
    return null;
  }

  const { open } = await import('@tauri-apps/api/dialog');
  const selection = await open({ directory: true, defaultPath });
  if (typeof selection === 'string') {
    return selection;
  }
  return null;
};
