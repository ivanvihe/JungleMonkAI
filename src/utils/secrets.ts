import { gitInvoke } from './runtimeBridge';

export const storeProviderSecret = async (provider: string, token: string) => {
  await gitInvoke('git_store_secret', { provider, token });
};

export const providerSecretExists = async (provider: string): Promise<boolean> => {
  return gitInvoke('git_has_secret', { provider });
};

export const revealProviderSecret = async (provider: string): Promise<string | null> => {
  const value = await gitInvoke<string | null>('reveal_secret', { provider });
  return value;
};
