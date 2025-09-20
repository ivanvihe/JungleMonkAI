import { ApiKeySettings, GlobalSettings, SupportedProvider } from '../types/globalSettings';

const STORAGE_KEY = 'global-settings';

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  apiKeys: {
    openai: '',
    anthropic: '',
    groq: '',
  },
};

const SUPPORTED_PROVIDERS: SupportedProvider[] = ['openai', 'anthropic', 'groq'];

export const isSupportedProvider = (value: string): value is SupportedProvider =>
  SUPPORTED_PROVIDERS.includes(value as SupportedProvider);

const normalizeApiKeys = (input: Partial<ApiKeySettings> | undefined): ApiKeySettings => ({
  openai: input?.openai ?? '',
  anthropic: input?.anthropic ?? '',
  groq: input?.groq ?? '',
});

export const loadGlobalSettings = (): GlobalSettings => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<GlobalSettings>;
    return {
      apiKeys: normalizeApiKeys(parsed?.apiKeys),
    };
  } catch (error) {
    console.warn('Unable to load global settings from storage', error);
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }
};

export const saveGlobalSettings = (settings: GlobalSettings) => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const payload: GlobalSettings = {
      apiKeys: normalizeApiKeys(settings.apiKeys),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist global settings', error);
  }
};

