import {
  ApiKeySettings,
  BUILTIN_PROVIDERS,
  CommandPreset,
  DefaultRoutingRules,
  DataLocationSettings,
  GitHostingProvider,
  GlobalSettings,
  McpProfile,
  McpProfileEndpoint,
  PluginSettingsEntry,
  PluginSettingsMap,
  ProjectProfile,
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
const USER_DATA_GLOBAL_SETTINGS_FILE = 'settings/global-settings.json';
export const CURRENT_SCHEMA_VERSION = 9;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(entry => typeof entry === 'string');

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isCommandPresetSettings = (value: unknown): value is CommandPreset['settings'] => {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(([key, entry]) => {
    if (key !== 'temperature' && key !== 'maxTokens') {
      return false;
    }

    return entry === undefined || isFiniteNumber(entry);
  });
};

const isCommandPreset = (value: unknown): value is CommandPreset =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  typeof value.prompt === 'string' &&
  isOptionalString(value.description) &&
  isOptionalString(value.provider) &&
  isOptionalString(value.model) &&
  isCommandPresetSettings(value.settings);

const isRoutingRule = (value: unknown): value is RoutingRule =>
  isRecord(value) &&
  typeof value.provider === 'string' &&
  typeof value.model === 'string' &&
  (value.commandPresetId === undefined || typeof value.commandPresetId === 'string');

const isDefaultRoutingRules = (value: unknown): value is DefaultRoutingRules =>
  isRecord(value) && Object.values(value).every(isRoutingRule);

const isPluginSettingsEntry = (value: unknown): value is PluginSettingsEntry =>
  isRecord(value) &&
  typeof value.enabled === 'boolean' &&
  isStringRecord(value.credentials) &&
  isOptionalString(value.lastApprovedChecksum);

const isPluginSettingsMap = (value: unknown): value is PluginSettingsMap =>
  isRecord(value) && Object.values(value).every(isPluginSettingsEntry);

const isAgentManifestModel = (value: unknown): value is AgentManifestModel =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.model === 'string' &&
  typeof value.description === 'string' &&
  (value.kind === 'cloud' || value.kind === 'local') &&
  (value.accent === undefined || typeof value.accent === 'string') &&
  (value.channel === undefined || typeof value.channel === 'string') &&
  (value.aliases === undefined || (Array.isArray(value.aliases) && value.aliases.every(item => typeof item === 'string'))) &&
  (value.defaultActive === undefined || typeof value.defaultActive === 'boolean');

const isAgentManifest = (value: unknown): value is AgentManifest =>
  isRecord(value) &&
  typeof value.provider === 'string' &&
  Array.isArray(value.models) &&
  value.models.every(isAgentManifestModel) &&
  Array.isArray(value.capabilities) &&
  value.capabilities.every(capability => typeof capability === 'string');

const isAgentManifestCacheEntry = (value: unknown): value is AgentManifestCacheEntry =>
  isRecord(value) &&
  typeof value.checksum === 'string' &&
  typeof value.approvedAt === 'string' &&
  Array.isArray(value.manifests) &&
  value.manifests.every(isAgentManifest);

const isAgentManifestCache = (value: unknown): value is AgentManifestCache =>
  isRecord(value) && Object.values(value).every(isAgentManifestCacheEntry);

const isMcpProfileEndpoint = (value: unknown): value is McpProfileEndpoint =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.transport === 'ws' || value.transport === 'osc' || value.transport === 'rest') &&
  typeof value.url === 'string';

const isMcpProfile = (value: unknown): value is McpProfile =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  (value.description === undefined || typeof value.description === 'string') &&
  typeof value.autoConnect === 'boolean' &&
  (value.token === undefined || typeof value.token === 'string') &&
  Array.isArray(value.endpoints) &&
  value.endpoints.every(isMcpProfileEndpoint) &&
  value.endpoints.length > 0;

const isSidePanelPreferences = (value: unknown): value is SidePanelPreferences =>
  isRecord(value) &&
  (value.position === 'left' || value.position === 'right') &&
  isFiniteNumber(value.width) &&
  typeof value.collapsed === 'boolean' &&
  (value.activeSectionId === null || typeof value.activeSectionId === 'string');

const isWorkspacePreferences = (value: unknown): value is WorkspacePreferences =>
  isRecord(value) && isSidePanelPreferences(value.sidePanel);

const isDataLocationSettings = (value: unknown): value is DataLocationSettings =>
  isRecord(value) &&
  typeof value.useCustomPath === 'boolean' &&
  isOptionalString(value.customPath) &&
  isOptionalString(value.lastKnownBasePath) &&
  isOptionalString(value.defaultPath) &&
  isOptionalString(value.lastMigrationFrom) &&
  isOptionalString(value.lastMigrationAt);

const isGitProvider = (value: unknown): value is GitHostingProvider =>
  value === 'github' || value === 'gitlab';

const isProjectProfile = (value: unknown): value is ProjectProfile =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.repositoryPath === 'string' &&
  (value.gitProvider === undefined || isGitProvider(value.gitProvider)) &&
  isOptionalString(value.gitOwner) &&
  isOptionalString(value.gitRepository) &&
  isOptionalString(value.defaultRemote) &&
  isOptionalString(value.defaultBranch) &&
  isOptionalString(value.instructions) &&
  isOptionalString(value.preferredProvider) &&
  isOptionalString(value.preferredModel);

const isGlobalSettings = (payload: unknown): payload is GlobalSettings =>
  isRecord(payload) &&
  typeof payload.version === 'number' &&
  isStringRecord(payload.apiKeys) &&
  Array.isArray(payload.commandPresets) &&
  payload.commandPresets.every(isCommandPreset) &&
  isDefaultRoutingRules(payload.defaultRoutingRules) &&
  Array.isArray(payload.enabledPlugins) &&
  payload.enabledPlugins.every(entry => typeof entry === 'string') &&
  isAgentManifestCache(payload.approvedManifests) &&
  isPluginSettingsMap(payload.pluginSettings) &&
  Array.isArray(payload.mcpProfiles) &&
  payload.mcpProfiles.every(isMcpProfile) &&
  isWorkspacePreferences(payload.workspacePreferences) &&
  isDataLocationSettings(payload.dataLocation) &&
  Array.isArray(payload.projectProfiles) &&
  payload.projectProfiles.every(isProjectProfile) &&
  (payload.activeProjectId === null || typeof payload.activeProjectId === 'string') &&
  (payload.githubDefaultOwner === undefined || typeof payload.githubDefaultOwner === 'string');

const validateGlobalSettings = (payload: unknown): payload is GlobalSettings =>
  isGlobalSettings(payload);

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

const normalizeDataLocation = (
  input: Partial<DataLocationSettings> | undefined,
): DataLocationSettings => {
  const customPath = typeof input?.customPath === 'string' && input.customPath.trim()
    ? input.customPath.trim()
    : undefined;
  const lastKnownBasePath =
    typeof input?.lastKnownBasePath === 'string' && input.lastKnownBasePath.trim()
      ? input.lastKnownBasePath.trim()
      : undefined;
  const defaultPath =
    typeof input?.defaultPath === 'string' && input.defaultPath.trim()
      ? input.defaultPath.trim()
      : undefined;
  const lastMigrationFrom =
    typeof input?.lastMigrationFrom === 'string' && input.lastMigrationFrom.trim()
      ? input.lastMigrationFrom.trim()
      : undefined;
  const lastMigrationAt =
    typeof input?.lastMigrationAt === 'string' && input.lastMigrationAt.trim()
      ? input.lastMigrationAt.trim()
      : undefined;

  const useCustomPath = Boolean(input?.useCustomPath && customPath);

  return {
    useCustomPath,
    customPath: useCustomPath ? customPath : undefined,
    lastKnownBasePath,
    defaultPath,
    lastMigrationFrom,
    lastMigrationAt,
  };
};

const normalizeProjectProfiles = (input: unknown): ProjectProfile[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: ProjectProfile[] = [];

  input.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const candidate = entry as ProjectProfile;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const repositoryPath =
      typeof candidate.repositoryPath === 'string' ? candidate.repositoryPath.trim() : '';

    if (!id || !name || !repositoryPath || seen.has(id)) {
      return;
    }

    const profile: ProjectProfile = {
      id,
      name,
      repositoryPath,
    };

    const gitProvider =
      typeof candidate.gitProvider === 'string'
        ? candidate.gitProvider.trim().toLowerCase()
        : '';
    if (gitProvider === 'github' || gitProvider === 'gitlab') {
      profile.gitProvider = gitProvider as GitHostingProvider;
    }

    const gitOwner = typeof candidate.gitOwner === 'string' ? candidate.gitOwner.trim() : '';
    if (gitOwner) {
      profile.gitOwner = gitOwner;
    }

    const gitRepository =
      typeof candidate.gitRepository === 'string' ? candidate.gitRepository.trim() : '';
    if (gitRepository) {
      profile.gitRepository = gitRepository;
    }

    const defaultRemote =
      typeof candidate.defaultRemote === 'string' ? candidate.defaultRemote.trim() : '';
    if (defaultRemote) {
      profile.defaultRemote = defaultRemote;
    }

    const defaultBranch =
      typeof candidate.defaultBranch === 'string' ? candidate.defaultBranch.trim() : '';
    if (defaultBranch) {
      profile.defaultBranch = defaultBranch;
    }

    const instructions =
      typeof candidate.instructions === 'string' ? candidate.instructions.trim() : '';
    if (instructions) {
      profile.instructions = instructions;
    }

    const preferredProvider =
      typeof candidate.preferredProvider === 'string' ? candidate.preferredProvider.trim() : '';
    if (preferredProvider) {
      profile.preferredProvider = preferredProvider;
      registerExternalProviders([preferredProvider]);
    }

    const preferredModel =
      typeof candidate.preferredModel === 'string' ? candidate.preferredModel.trim() : '';
    if (preferredModel) {
      profile.preferredModel = preferredModel;
    }

    normalized.push(profile);
    seen.add(id);
  });

  return normalized;
};

const normalizeActiveProjectId = (
  candidate: unknown,
  projects: ProjectProfile[],
): string | null => {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed && projects.some(project => project.id === trimmed)) {
      return trimmed;
    }
  }

  return projects.length > 0 ? projects[0].id : null;
};

const normalizeGithubDefaultOwner = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

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
  dataLocation: {
    useCustomPath: false,
    customPath: undefined,
    lastKnownBasePath: undefined,
    defaultPath: undefined,
    lastMigrationFrom: undefined,
    lastMigrationAt: undefined,
  },
  projectProfiles: [],
  activeProjectId: null,
  githubDefaultOwner: undefined,
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

  const projectProfiles = normalizeProjectProfiles(raw?.projectProfiles);

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
    dataLocation: normalizeDataLocation(raw?.dataLocation as DataLocationSettings),
    projectProfiles,
    activeProjectId: normalizeActiveProjectId(raw?.activeProjectId, projectProfiles),
    githubDefaultOwner: normalizeGithubDefaultOwner(raw?.githubDefaultOwner),
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
    const projectProfiles = normalizeProjectProfiles(settings.projectProfiles);

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
      dataLocation: normalizeDataLocation(settings.dataLocation),
      projectProfiles,
      activeProjectId: normalizeActiveProjectId(settings.activeProjectId, projectProfiles),
      githubDefaultOwner: normalizeGithubDefaultOwner(settings.githubDefaultOwner),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    void persistGlobalSettingsToUserDir(payload);
  } catch (error) {
    console.warn('Unable to persist global settings', error);
  }
};

export const getSupportedProviders = (): SupportedProvider[] =>
  getAllSupportedProviders() as SupportedProvider[];

const persistGlobalSettingsToUserDir = async (settings: GlobalSettings): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const module = await import('../core/storage/userDataFiles');
    if (!module.isTauriEnvironment()) {
      return;
    }

    await module.ensureUserDataDirectory();
    await module.writeUserDataJson(USER_DATA_GLOBAL_SETTINGS_FILE, settings);
  } catch (error) {
    console.warn('Unable to persist global settings in user directory', error);
  }
};

export const loadGlobalSettingsFromUserData = async (): Promise<GlobalSettings | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const module = await import('../core/storage/userDataFiles');
    if (!module.isTauriEnvironment()) {
      return null;
    }

    const persisted = await module.readUserDataJson<PersistedSettings>(
      USER_DATA_GLOBAL_SETTINGS_FILE,
    );
    if (!persisted) {
      return null;
    }

    return migrateSettings(persisted);
  } catch (error) {
    console.warn('Unable to load global settings from user directory', error);
    return null;
  }
};

export type { PersistedSettings as PersistedGlobalSettings };

export const validateGlobalSettingsPayload = (payload: unknown): payload is GlobalSettings =>
  validateGlobalSettings(payload);

export const migratePersistedGlobalSettings = (
  raw: PersistedSettings | undefined,
): GlobalSettings => migrateSettings(raw);
