import { invoke } from '@tauri-apps/api/tauri';

export const storeProviderSecret = async (provider: string, token: string) => {
  await invoke('git_store_secret', { provider, token });
};

export const providerSecretExists = async (provider: string): Promise<boolean> => {
  return invoke<boolean>('git_has_secret', { provider });
};

export const revealProviderSecret = async (provider: string): Promise<string | null> => {
  const value = await invoke<string | null>('reveal_secret', { provider });
  return value;
};
