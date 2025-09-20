export type SupportedProvider = 'openai' | 'anthropic' | 'groq' | 'github' | 'gitlab';

export const BUILTIN_PROVIDERS: SupportedProvider[] = ['openai', 'anthropic', 'groq', 'github', 'gitlab'];

export type ApiKeySettings = Record<string, string>;

export interface CommandPresetSettings {
  temperature?: number;
  maxTokens?: number;
}

export interface CommandPreset {
  id: string;
  label: string;
  prompt: string;
  description?: string;
  provider?: string;
  model?: string;
  settings?: CommandPresetSettings;
}

export interface RoutingRule {
  provider: string;
  model: string;
  commandPresetId?: string;
}

export type DefaultRoutingRules = Record<string, RoutingRule>;

export interface GlobalSettings {
  version: number;
  apiKeys: ApiKeySettings;
  commandPresets: CommandPreset[];
  defaultRoutingRules: DefaultRoutingRules;
}
