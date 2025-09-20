import Ajv, { JSONSchemaType } from 'ajv';
import {
  ApiKeySettings,
  BUILTIN_PROVIDERS,
  CommandPreset,
  DefaultRoutingRules,
  GlobalSettings,
  RoutingRule,
  SupportedProvider,
} from '../types/globalSettings';

const STORAGE_KEY = 'global-settings';
const CURRENT_SCHEMA_VERSION = 2;

const ajv = new Ajv({ allErrors: true, removeAdditional: 'failing' });

const globalSettingsSchema: JSONSchemaType<GlobalSettings> = {
  type: 'object',
  properties: {
    version: { type: 'integer', minimum: 1 },
    apiKeys: {
      type: 'object',
      required: [],
      additionalProperties: { type: 'string' },
    } as unknown as JSONSchemaType<ApiKeySettings>,
    commandPresets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          prompt: { type: 'string' },
          description: { type: 'string', nullable: true },
          provider: { type: 'string', nullable: true },
          model: { type: 'string', nullable: true },
          settings: {
            type: 'object',
            nullable: true,
            properties: {
              temperature: { type: 'number', nullable: true },
              maxTokens: { type: 'integer', nullable: true },
            },
            required: [],
            additionalProperties: false,
          },
        },
        required: ['id', 'label', 'prompt'],
        additionalProperties: false,
      },
    },
    defaultRoutingRules: {
      type: 'object',
      required: [],
      additionalProperties: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
          model: { type: 'string' },
          commandPresetId: { type: 'string', nullable: true },
        },
        required: ['provider', 'model'],
        additionalProperties: false,
      },
    } as unknown as JSONSchemaType<DefaultRoutingRules>,
  },
  required: ['version', 'apiKeys', 'commandPresets', 'defaultRoutingRules'],
  additionalProperties: false,
};

const validateGlobalSettings = ajv.compile<GlobalSettings>(globalSettingsSchema);

const SUPPORTED_PROVIDERS: SupportedProvider[] = [...BUILTIN_PROVIDERS];

const normalizeApiKeys = (input: ApiKeySettings | undefined): ApiKeySettings => {
  const normalized: ApiKeySettings = {};

  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([provider, key]) => {
      if (typeof key === 'string') {
        const sanitized = key.trim();
        normalized[provider] = sanitized;
      }
    });
  }

  SUPPORTED_PROVIDERS.forEach((provider) => {
    if (!(provider in normalized)) {
      normalized[provider] = '';
    }
  });

  return normalized;
};

const normalizeCommandPresets = (presets: CommandPreset[] | undefined): CommandPreset[] => {
  if (!Array.isArray(presets)) {
    return [];
  }

  return presets
    .filter(
      (preset): preset is CommandPreset =>
        typeof preset === 'object' &&
        preset !== null &&
        typeof preset.id === 'string' &&
        typeof preset.label === 'string' &&
        typeof preset.prompt === 'string'
    )
    .map((preset) => {
      const rawSettings =
        preset.settings && typeof preset.settings === 'object'
          ? {
              temperature:
                typeof preset.settings.temperature === 'number'
                  ? preset.settings.temperature
                  : undefined,
              maxTokens:
                typeof preset.settings.maxTokens === 'number'
                  ? Math.round(preset.settings.maxTokens)
                  : undefined,
            }
          : undefined;

      const settings = rawSettings
        ? Object.fromEntries(
            Object.entries(rawSettings).filter(([, value]) => typeof value === 'number')
          )
        : undefined;

      return {
        id: preset.id,
        label: preset.label,
        prompt: preset.prompt,
        description: typeof preset.description === 'string' ? preset.description : undefined,
        provider:
          typeof preset.provider === 'string' && preset.provider.trim()
            ? preset.provider.trim()
            : undefined,
        model:
          typeof preset.model === 'string' && preset.model.trim()
            ? preset.model.trim()
            : undefined,
        settings: settings && Object.keys(settings).length > 0 ? (settings as CommandPreset['settings']) : undefined,
      };
    });
};

const normalizeRoutingRules = (
  rules: DefaultRoutingRules | undefined
): DefaultRoutingRules => {
  if (!rules || typeof rules !== 'object') {
    return {};
  }

  return Object.entries(rules).reduce<DefaultRoutingRules>((acc, [key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as RoutingRule).provider === 'string' &&
      typeof (value as RoutingRule).model === 'string'
    ) {
      const provider = (value as RoutingRule).provider.trim();
      const model = (value as RoutingRule).model.trim();
      if (!provider || !model) {
        return acc;
      }
      acc[key] = {
        provider,
        model,
        commandPresetId:
          typeof (value as RoutingRule).commandPresetId === 'string'
            ? (value as RoutingRule).commandPresetId.trim() || undefined
            : undefined,
      };
    }
    return acc;
  }, {});
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: CURRENT_SCHEMA_VERSION,
  apiKeys: normalizeApiKeys({}),
  commandPresets: [],
  defaultRoutingRules: {},
};

export const isSupportedProvider = (value: string): value is SupportedProvider =>
  SUPPORTED_PROVIDERS.includes(value as SupportedProvider);

type PersistedSettings = Partial<GlobalSettings> & { version?: number };

const migrateSettings = (raw: PersistedSettings | undefined): GlobalSettings => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }

  const version = typeof raw.version === 'number' ? raw.version : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      apiKeys: normalizeApiKeys(raw.apiKeys),
    };
  }

  if (version === 1) {
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      apiKeys: normalizeApiKeys(raw.apiKeys),
    };
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    const normalized: GlobalSettings = {
      version: CURRENT_SCHEMA_VERSION,
      apiKeys: normalizeApiKeys(raw.apiKeys),
      commandPresets: normalizeCommandPresets(raw.commandPresets),
      defaultRoutingRules: normalizeRoutingRules(raw.defaultRoutingRules),
    };

    if (validateGlobalSettings(normalized)) {
      return normalized;
    }
  }

  console.warn('Invalid global settings payload detected, using defaults');
  return { ...DEFAULT_GLOBAL_SETTINGS };
};

export const loadGlobalSettings = (): GlobalSettings => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }

    const parsed = JSON.parse(raw) as PersistedSettings;
    return migrateSettings(parsed);
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
      version: CURRENT_SCHEMA_VERSION,
      apiKeys: normalizeApiKeys(settings.apiKeys),
      commandPresets: normalizeCommandPresets(settings.commandPresets),
      defaultRoutingRules: normalizeRoutingRules(settings.defaultRoutingRules),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist global settings', error);
  }
};

export const getSupportedProviders = (): SupportedProvider[] => [...SUPPORTED_PROVIDERS];
