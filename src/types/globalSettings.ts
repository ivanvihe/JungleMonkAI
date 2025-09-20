export type SupportedProvider = 'openai' | 'anthropic' | 'groq';

export type ApiKeySettings = Record<SupportedProvider, string>;

export interface GlobalSettings {
  apiKeys: ApiKeySettings;
}
