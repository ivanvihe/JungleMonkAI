import type { AgentManifestCache } from './agents';

export type BuiltinProvider = 'openai' | 'anthropic' | 'groq' | 'github' | 'gitlab';

export type SupportedProvider = BuiltinProvider | (string & {});

export const BUILTIN_PROVIDERS: BuiltinProvider[] = ['openai', 'anthropic', 'groq', 'github', 'gitlab'];

export type ApiKeySettings = Record<string, string>;

export type McpTransport = 'ws' | 'osc' | 'rest';

export interface McpProfileEndpoint {
  id: string;
  transport: McpTransport;
  url: string;
}

export interface McpProfile {
  id: string;
  label: string;
  description?: string;
  autoConnect: boolean;
  token?: string;
  endpoints: McpProfileEndpoint[];
}

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

export type SidePanelPosition = 'left' | 'right';

export interface SidePanelPreferences {
  position: SidePanelPosition;
  width: number;
  collapsed: boolean;
  activeSectionId: string | null;
}

export interface WorkspacePreferences {
  sidePanel: SidePanelPreferences;
}

export type GitHostingProvider = 'github' | 'gitlab' | (string & {});

export interface ProjectProfile {
  id: string;
  name: string;
  repositoryPath: string;
  gitProvider?: GitHostingProvider;
  gitOwner?: string;
  gitRepository?: string;
  defaultRemote?: string;
  defaultBranch?: string;
  instructions?: string;
  preferredProvider?: string;
  preferredModel?: string;
}

export interface DataLocationSettings {
  useCustomPath: boolean;
  customPath?: string;
  lastKnownBasePath?: string;
  defaultPath?: string;
  lastMigrationFrom?: string;
  lastMigrationAt?: string;
}

export interface HuggingFacePreferences {
  apiBaseUrl: string;
  maxResults: number;
  useStoredToken: boolean;
}

export interface ModelPreferences {
  storageDir: string | null;
  huggingFace: HuggingFacePreferences;
}

export interface GlobalSettings {
  version: number;
  apiKeys: ApiKeySettings;
  commandPresets: CommandPreset[];
  defaultRoutingRules: DefaultRoutingRules;
  enabledPlugins: string[];
  approvedManifests: AgentManifestCache;
  pluginSettings: PluginSettingsMap;
  mcpProfiles: McpProfile[];
  workspacePreferences: WorkspacePreferences;
  dataLocation: DataLocationSettings;
  modelPreferences: ModelPreferences;
  projectProfiles: ProjectProfile[];
  activeProjectId: string | null;
  githubDefaultOwner?: string;
}

export interface PluginSettingsEntry {
  enabled: boolean;
  credentials: Record<string, string>;
  lastApprovedChecksum?: string;
}

export type PluginSettingsMap = Record<string, PluginSettingsEntry>;
