import Ajv, { JSONSchemaType } from 'ajv';
import {
  ApiKeySettings,
  BUILTIN_PROVIDERS,
  CommandPreset,
  DefaultRoutingRules,
  GlobalSettings,
  McpProfile,
  McpProfileEndpoint,
  PluginSettingsEntry,
  PluginSettingsMap,
  RoutingRule,
  SidePanelPreferences,
  SupportedProvider,
  WorkspacePreferences,
} from '../types/globalSettings';
import type {
  AgentManifest,
  AgentManifestCache,
  AgentManifestCacheEntry,
  AgentManifestModel,
} from '../types/agents';

const STORAGE_KEY = 'global-settings';
export const CURRENT_SCHEMA_VERSION = 6;

const ajv = new Ajv({ allErrors: true, removeAdditional: 'failing' });

const supportedProviderSet = new Set<string>(BUILTIN_PROVIDERS);

const normalizeProviderId = (value: string): string => value.trim().toLowerCase();

export const registerExternalProviders = (providers: string[]) => {
  providers.forEach(provider => {
    if (typeof provider !== 'string') {
      return;
    }
    const normalized = normalizeProviderId(provider);
    if (normalized) {
      supportedProviderSet.add(normalized);
    }
  });
};

const getAllSupportedProviders = (): string[] => Array.from(supportedProviderSet);

const MIN_SIDE_PANEL_WIDTH = 240;
const MAX_SIDE_PANEL_WIDTH = 520;
const DEFAULT_SIDE_PANEL_WIDTH = 320;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const agentManifestModelSchema: JSONSchemaType<AgentManifestModel> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    model: { type: 'string' },
    description: { type: 'string' },
    kind: { type: 'string', enum: ['cloud', 'local'] },
    accent: { type: 'string', nullable: true },
    channel: { type: 'string', nullable: true },
    aliases: {
      type: 'array',
      nullable: true,
      items: { type: 'string' },
    },
    defaultActive: { type: 'boolean', nullable: true },
  },
  required: ['id', 'name', 'model', 'description', 'kind'],
  additionalProperties: false,
};

const agentManifestSchema: JSONSchemaType<AgentManifest> = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    models: {
      type: 'array',
      items: agentManifestModelSchema,
    },
    capabilities: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['provider', 'models', 'capabilities'],
  additionalProperties: false,
};

const agentManifestCacheEntrySchema: JSONSchemaType<AgentManifestCacheEntry> = {
  type: 'object',
  properties: {
    checksum: { type: 'string' },
    approvedAt: { type: 'string' },
    manifests: {
      type: 'array',
      items: agentManifestSchema,
    },
  },
  required: ['checksum', 'approvedAt', 'manifests'],
  additionalProperties: false,
};

const pluginSettingsEntrySchema: JSONSchemaType<PluginSettingsEntry> = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    credentials: {
      type: 'object',
      required: [],
      additionalProperties: { type: 'string' },
    } as unknown as JSONSchemaType<PluginSettingsEntry['credentials']>,
    lastApprovedChecksum: { type: 'string', nullable: true },
  },
  required: ['enabled', 'credentials'],
  additionalProperties: false,
};

const mcpProfileEndpointSchema: JSONSchemaType<McpProfileEndpoint> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    transport: { type: 'string', enum: ['ws', 'osc', 'rest'] },
    url: { type: 'string' },
  },
  required: ['id', 'transport', 'url'],
  additionalProperties: false,
};

const mcpProfileSchema: JSONSchemaType<McpProfile> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string', nullable: true },
    autoConnect: { type: 'boolean' },
    token: { type: 'string', nullable: true },
    endpoints: {
      type: 'array',
      items: mcpProfileEndpointSchema,
      minItems: 1,
    },
  },
  required: ['id', 'label', 'autoConnect', 'endpoints'],
  additionalProperties: false,
};

const sidePanelPreferencesSchema: JSONSchemaType<SidePanelPreferences> = {
  type: 'object',
  properties: {
    position: { type: 'string', enum: ['left', 'right'] },
    width: { type: 'number', minimum: MIN_SIDE_PANEL_WIDTH, maximum: MAX_SIDE_PANEL_WIDTH },
    collapsed: { type: 'boolean' },
    activeSectionId: { type: 'string', nullable: true },
  },
  required: ['position', 'width', 'collapsed', 'activeSectionId'],
  additionalProperties: false,
};

const workspacePreferencesSchema: JSONSchemaType<WorkspacePreferences> = {
  type: 'object',
  properties: {
    sidePanel: sidePanelPreferencesSchema,
  },
  required: ['sidePanel'],
  additionalProperties: false,
};

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
    enabledPlugins: {
      type: 'array',
      items: { type: 'string' },
    },
    approvedManifests: {
      type: 'object',
      required: [],
      additionalProperties: agentManifestCacheEntrySchema,
    } as unknown as JSONSchemaType<AgentManifestCache>,
    pluginSettings: {
      type: 'object',
      required: [],
      additionalProperties: pluginSettingsEntrySchema,
    } as unknown as JSONSchemaType<PluginSettingsMap>,
    mcpProfiles: {
      type: 'array',
      items: mcpProfileSchema,
    },
    workspacePreferences: workspacePreferencesSchema,
  },
  required: [
    'version',
    'apiKeys',
    'commandPresets',
    'defaultRoutingRules',
    'enabledPlugins',
    'approvedManifests',
    'pluginSettings',
    'mcpProfiles',
    'workspacePreferences',
  ],
  additionalProperties: false,
};

const validateGlobalSettings = ajv.compile<GlobalSettings>(globalSettingsSchema);

const normalizeApiKeys = (input: ApiKeySettings | undefined): ApiKeySettings => {
  const normalized: ApiKeySettings = {};

  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([provider, key]) => {
      if (typeof key === 'string') {
        normalized[provider] = key.trim();
      }
    });
  }

  getAllSupportedProviders().forEach(provider => {
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
        typeof preset.prompt === 'string',
    )
    .map(preset => {
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
            Object.entries(rawSettings).filter(([, value]) => typeof value === 'number'),
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
        settings:
          settings && Object.keys(settings).length > 0
            ? (settings as CommandPreset['settings'])
            : undefined,
      };
    });
};

const normalizeRoutingRules = (
  rules: DefaultRoutingRules | undefined,
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

const normalizeEnabledPlugins = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  input.forEach(value => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      normalized.push(trimmed);
      seen.add(trimmed);
    }
  });
  return normalized;
};

const normalizeManifestModel = (model: unknown): AgentManifestModel | undefined => {
  if (!model || typeof model !== 'object') {
    return undefined;
  }

  const candidate = model as AgentManifestModel;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.model !== 'string' ||
    typeof candidate.description !== 'string'
  ) {
    return undefined;
  }

  const kind = candidate.kind === 'local' ? 'local' : 'cloud';
  const normalized: AgentManifestModel = {
    id: candidate.id.trim(),
    name: candidate.name.trim(),
    model: candidate.model.trim(),
    description: candidate.description.trim(),
    kind,
  };

  if (typeof candidate.accent === 'string' && candidate.accent.trim()) {
    normalized.accent = candidate.accent.trim();
  }

  if (typeof candidate.channel === 'string' && candidate.channel.trim()) {
    normalized.channel = candidate.channel.trim();
  }

  if (Array.isArray(candidate.aliases)) {
    const aliases = candidate.aliases
      .filter(alias => typeof alias === 'string')
      .map(alias => alias.trim())
      .filter(Boolean);
    if (aliases.length) {
      normalized.aliases = aliases;
    }
  }

  if (typeof candidate.defaultActive === 'boolean') {
    normalized.defaultActive = candidate.defaultActive;
  }

  return normalized;
};

const normalizeManifest = (manifest: unknown): AgentManifest | undefined => {
  if (!manifest || typeof manifest !== 'object') {
    return undefined;
  }

  const candidate = manifest as AgentManifest;
  if (typeof candidate.provider !== 'string') {
    return undefined;
  }

  const provider = candidate.provider.trim();
  if (!provider) {
    return undefined;
  }

  const models = Array.isArray(candidate.models)
    ? candidate.models.map(normalizeManifestModel).filter((item): item is AgentManifestModel => Boolean(item))
    : [];

  if (!models.length) {
    return undefined;
  }

  const capabilities = Array.isArray(candidate.capabilities)
    ? candidate.capabilities
        .filter(capability => typeof capability === 'string')
        .map(capability => capability.trim())
        .filter(Boolean)
    : [];

  registerExternalProviders([provider]);

  return {
    provider,
    models,
    capabilities,
  };
};

const normalizeApprovedManifests = (
  input: AgentManifestCache | undefined,
): AgentManifestCache => {
  if (!input || typeof input !== 'object') {
    return {};
  }

  return Object.entries(input).reduce<AgentManifestCache>((acc, [pluginId, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }

    const checksum = typeof entry.checksum === 'string' ? entry.checksum.trim() : '';
    if (!checksum) {
      return acc;
    }

    const manifests = Array.isArray(entry.manifests)
      ? entry.manifests.map(normalizeManifest).filter((manifest): manifest is AgentManifest => Boolean(manifest))
      : [];

    if (!manifests.length) {
      return acc;
    }

    const approvedAt =
      typeof entry.approvedAt === 'string' && entry.approvedAt.trim()
        ? entry.approvedAt
        : '1970-01-01T00:00:00.000Z';

    registerExternalProviders(manifests.map(manifest => manifest.provider));

    acc[pluginId] = {
      checksum,
      approvedAt,
      manifests,
    };
    return acc;
  }, {});
};

const normalizePluginSettings = (
  input: PluginSettingsMap | undefined,
): PluginSettingsMap => {
  const normalized: PluginSettingsMap = {};

  if (!input || typeof input !== 'object') {
    return normalized;
  }

  Object.entries(input).forEach(([pluginId, value]) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const credentials: Record<string, string> = {};
    if (value.credentials && typeof value.credentials === 'object') {
      Object.entries(value.credentials).forEach(([key, credentialValue]) => {
        if (typeof credentialValue === 'string') {
          credentials[key] = credentialValue;
        }
      });
    }

    const entry: PluginSettingsEntry = {
      enabled: Boolean((value as PluginSettingsEntry).enabled),
      credentials,
    };

    const checksum = (value as PluginSettingsEntry).lastApprovedChecksum;
    if (typeof checksum === 'string' && checksum.trim()) {
      entry.lastApprovedChecksum = checksum.trim();
    }

    normalized[pluginId] = entry;
  });

  return normalized;
};

const normalizeMcpProfileEndpoints = (
  input: unknown,
  profileId: string,
): McpProfileEndpoint[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();

  return input.reduce<McpProfileEndpoint[]>((acc, entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }

    const candidate = entry as Partial<McpProfileEndpoint> & { url?: string; transport?: string };
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) {
      return acc;
    }

    const transport = candidate.transport === 'osc' || candidate.transport === 'rest' ? candidate.transport : 'ws';

    let endpointId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!endpointId) {
      endpointId = `${profileId}-endpoint-${index}`;
    }

    let uniqueId = endpointId;
    let counter = 1;
    while (seen.has(uniqueId)) {
      uniqueId = `${endpointId}-${counter}`;
      counter += 1;
    }

    seen.add(uniqueId);

    acc.push({
      id: uniqueId,
      transport,
      url,
    });

    return acc;
  }, []);
};

const normalizeMcpProfiles = (input: McpProfile[] | undefined): McpProfile[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();

  return input.reduce<McpProfile[]>((acc, entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }

    let id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) {
      id = `mcp-profile-${index}`;
    }

    let uniqueId = id;
    let counter = 1;
    while (seen.has(uniqueId)) {
      uniqueId = `${id}-${counter}`;
      counter += 1;
    }

    const endpoints = normalizeMcpProfileEndpoints(entry.endpoints, uniqueId);
    if (!endpoints.length) {
      return acc;
    }

    const label =
      typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : uniqueId;

    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : undefined;

    const token =
      typeof entry.token === 'string' && entry.token.trim() ? entry.token.trim() : undefined;

    const autoConnect = typeof entry.autoConnect === 'boolean' ? entry.autoConnect : false;

    seen.add(uniqueId);
    acc.push({
      id: uniqueId,
      label,
      description,
      autoConnect,
      token,
      endpoints,
    });
    return acc;
  }, []);
};

const mergeEnabledPluginList = (
  enabled: string[],
  pluginSettings: PluginSettingsMap,
): string[] => {
  const set = new Set(enabled.map(pluginId => pluginId.trim()).filter(Boolean));
  Object.entries(pluginSettings).forEach(([pluginId, entry]) => {
    if (entry.enabled) {
      set.add(pluginId);
    }
  });
  return Array.from(set);
};

const normalizeSidePanelPreferences = (
  input: Partial<SidePanelPreferences> | undefined,
): SidePanelPreferences => {
  const position = input?.position === 'left' ? 'left' : 'right';
  const width = clamp(
    typeof input?.width === 'number' && Number.isFinite(input.width)
      ? input.width
      : DEFAULT_SIDE_PANEL_WIDTH,
    MIN_SIDE_PANEL_WIDTH,
    MAX_SIDE_PANEL_WIDTH,
  );
  const collapsed = Boolean(input?.collapsed);
  const activeSectionId = typeof input?.activeSectionId === 'string' ? input.activeSectionId : null;

  return {
    position,
    width,
    collapsed,
    activeSectionId,
  };
};

const normalizeWorkspacePreferences = (
  input: WorkspacePreferences | undefined,
): WorkspacePreferences => ({
  sidePanel: normalizeSidePanelPreferences(input?.sidePanel),
});

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: CURRENT_SCHEMA_VERSION,
  apiKeys: normalizeApiKeys({}),
  commandPresets: [],
  defaultRoutingRules: {},
  enabledPlugins: [],
  approvedManifests: {},
  pluginSettings: {},
  mcpProfiles: [],
  workspacePreferences: {
    sidePanel: {
      position: 'right',
      width: DEFAULT_SIDE_PANEL_WIDTH,
      collapsed: false,
      activeSectionId: null,
    },
  },
};

export const isSupportedProvider = (value: string): value is SupportedProvider =>
  supportedProviderSet.has(normalizeProviderId(value));

type PersistedSettings = Partial<GlobalSettings> & { version?: number };

const buildNormalizedSettings = (raw: PersistedSettings | undefined): GlobalSettings => {
  const pluginSettings = normalizePluginSettings(raw?.pluginSettings as PluginSettingsMap);
  const enabledPlugins = mergeEnabledPluginList(
    normalizeEnabledPlugins(raw?.enabledPlugins),
    pluginSettings,
  );

  return {
    version: CURRENT_SCHEMA_VERSION,
    apiKeys: normalizeApiKeys(raw?.apiKeys as ApiKeySettings),
    commandPresets: normalizeCommandPresets(raw?.commandPresets as CommandPreset[]),
    defaultRoutingRules: normalizeRoutingRules(raw?.defaultRoutingRules as DefaultRoutingRules),
    enabledPlugins,
    approvedManifests: normalizeApprovedManifests(raw?.approvedManifests as AgentManifestCache),
    pluginSettings,
    mcpProfiles: normalizeMcpProfiles(raw?.mcpProfiles as McpProfile[]),
    workspacePreferences: normalizeWorkspacePreferences(
      raw?.workspacePreferences as WorkspacePreferences,
    ),
  };
};

const migrateSettings = (raw: PersistedSettings | undefined): GlobalSettings => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }

  const version = typeof raw.version === 'number' ? raw.version : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      apiKeys: normalizeApiKeys(raw.apiKeys as ApiKeySettings),
      enabledPlugins: normalizeEnabledPlugins(raw.enabledPlugins),
      approvedManifests: normalizeApprovedManifests(raw.approvedManifests as AgentManifestCache),
    };
  }

  if (version === 1) {
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      apiKeys: normalizeApiKeys(raw.apiKeys as ApiKeySettings),
    };
  }

  if (version >= 2) {
    const normalized = buildNormalizedSettings(raw);
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
      pluginSettings: normalizePluginSettings(settings.pluginSettings),
      mcpProfiles: normalizeMcpProfiles(settings.mcpProfiles),
      enabledPlugins: mergeEnabledPluginList(
        normalizeEnabledPlugins(settings.enabledPlugins),
        normalizePluginSettings(settings.pluginSettings),
      ),
      approvedManifests: normalizeApprovedManifests(settings.approvedManifests),
      workspacePreferences: normalizeWorkspacePreferences(settings.workspacePreferences),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist global settings', error);
  }
};

export const getSupportedProviders = (): SupportedProvider[] =>
  getAllSupportedProviders() as SupportedProvider[];

export type { PersistedSettings as PersistedGlobalSettings };

export const validateGlobalSettingsPayload = (payload: unknown): payload is GlobalSettings =>
  validateGlobalSettings(payload as GlobalSettings);

export const migratePersistedGlobalSettings = (
  raw: PersistedSettings | undefined,
): GlobalSettings => migrateSettings(raw);
