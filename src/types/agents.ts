export type AgentKind = 'cloud' | 'local';

export interface AgentManifestModel {
  id: string;
  name: string;
  model: string;
  description: string;
  kind: AgentKind;
  accent?: string;
  channel?: string;
  aliases?: string[];
  defaultActive?: boolean;
}

export interface AgentManifest {
  provider: string;
  models: AgentManifestModel[];
  capabilities: string[];
}

export interface AgentManifestCacheEntry {
  checksum: string;
  manifests: AgentManifest[];
  approvedAt: string;
}

export type AgentManifestCache = Record<string, AgentManifestCacheEntry>;
