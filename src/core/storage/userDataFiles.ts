import {
  getUserDataPaths,
  isTauriEnvironment,
  refreshUserDataPaths,
  UserDataPathDescriptor,
} from './userDataPathsClient';

const normalizeErrorCode = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
};

export { isTauriEnvironment } from './userDataPathsClient';

export const ensureUserDataDirectory = async (): Promise<UserDataPathDescriptor | null> => {
  if (!isTauriEnvironment()) {
    return null;
  }

  const [{ createDir }, descriptor] = await Promise.all([
    import('@tauri-apps/api/fs'),
    getUserDataPaths(),
  ]);

  await createDir(descriptor.baseDir, { recursive: true });
  return descriptor;
};

export const readUserDataJson = async <T>(
  relativePath: string,
): Promise<T | undefined> => {
  if (!isTauriEnvironment()) {
    return undefined;
  }

  try {
    const [{ readTextFile }, { join }] = await Promise.all([
      import('@tauri-apps/api/fs'),
      import('@tauri-apps/api/path'),
    ]);
    const descriptor = await getUserDataPaths();
    const target = await join(descriptor.baseDir, relativePath);
    const raw = await readTextFile(target);
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = normalizeErrorCode(error);
    if (code === 'NotFound') {
      return undefined;
    }
    console.warn(`No se pudo leer el archivo de datos de usuario "${relativePath}"`, error);
    return undefined;
  }
};

export const writeUserDataJson = async (
  relativePath: string,
  payload: unknown,
): Promise<void> => {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    const [{ writeTextFile, createDir }, { join, dirname }] = await Promise.all([
      import('@tauri-apps/api/fs'),
      import('@tauri-apps/api/path'),
    ]);
    const descriptor = await getUserDataPaths();
    const target = await join(descriptor.baseDir, relativePath);
    const parent = await dirname(target);
    await createDir(parent, { recursive: true });
    await writeTextFile({ path: target, contents: JSON.stringify(payload, null, 2) });
  } catch (error) {
    console.warn(`No se pudo escribir el archivo de datos de usuario "${relativePath}"`, error);
  }
};

export const resetUserDataCache = () => {
  refreshUserDataPaths();
};
