import type { AgentManifest } from '../../types/agents';
import { AgentManifestCacheEntry } from '../../types/agents';
import type { AgentManifestModel } from '../../types/agents';
import { AgentDefinition, INITIAL_AGENTS } from './agentRegistry';

export interface PluginRegistryEntry {
  pluginId: string;
  manifests: AgentManifest[];
}

type AgentRegistrySubscriber = (agents: AgentDefinition[]) => void;

const DEFAULT_PLUGIN_ACCENT = '#6C5CE7';

const cloneAliases = (aliases: string[] | undefined): string[] | undefined =>
  aliases ? [...aliases] : undefined;

const cloneCapabilities = (capabilities: string[] | undefined): string[] | undefined =>
  capabilities ? [...capabilities] : undefined;

const cloneManifest = (manifest: AgentManifest): AgentManifest => ({
  provider: manifest.provider,
  capabilities: [...manifest.capabilities],
  models: manifest.models.map(model => ({
    ...model,
    aliases: cloneAliases(model.aliases),
  })),
});

const sanitizeChannel = (model: AgentManifestModel, provider: string): string | undefined => {
  if (typeof model.channel === 'string' && model.channel.trim()) {
    return model.channel.trim();
  }
  const normalizedProvider = provider.trim().toLowerCase();
  return normalizedProvider ? normalizedProvider : undefined;
};

const cloneAgentDefinition = (agent: AgentDefinition): AgentDefinition => ({
  ...agent,
  aliases: cloneAliases(agent.aliases),
  capabilities: cloneCapabilities(agent.capabilities),
});

export class AgentRegistryService {
  private readonly builtinAgents: AgentDefinition[];

  private readonly pluginAgents = new Map<string, AgentDefinition[]>();

  private readonly subscribers = new Set<AgentRegistrySubscriber>();

  constructor(initialAgents: AgentDefinition[] = INITIAL_AGENTS) {
    this.builtinAgents = initialAgents.map(agent => cloneAgentDefinition(agent));
  }

  public getAgents(): AgentDefinition[] {
    return this.buildSnapshot();
  }

  public subscribe(subscriber: AgentRegistrySubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.buildSnapshot());
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public applyPluginManifests(entries: PluginRegistryEntry[]): void {
    const activePluginIds = new Set(entries.map(entry => entry.pluginId));
    let changed = false;

    for (const pluginId of Array.from(this.pluginAgents.keys())) {
      if (!activePluginIds.has(pluginId)) {
        this.pluginAgents.delete(pluginId);
        changed = true;
      }
    }

    for (const entry of entries) {
      const manifests = entry.manifests.map(manifest => cloneManifest(manifest));
      const definitions = manifests.flatMap(manifest =>
        AgentRegistryService.createAgentsFromManifest(entry.pluginId, manifest),
      );
      const previous = this.pluginAgents.get(entry.pluginId);
      if (!previous || !AgentRegistryService.areAgentListsEqual(previous, definitions)) {
        this.pluginAgents.set(entry.pluginId, definitions);
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  public static computeManifestsChecksum(manifests: AgentManifest[]): string {
    const normalized = manifests
      .map(manifest => ({
        provider: manifest.provider.trim(),
        capabilities: [...manifest.capabilities].sort((a, b) => a.localeCompare(b)),
        models: [...manifest.models]
          .map(model => ({
            ...model,
            id: model.id.trim(),
            name: model.name.trim(),
            model: model.model.trim(),
            description: model.description.trim(),
            aliases: model.aliases ? [...model.aliases].sort((a, b) => a.localeCompare(b)) : undefined,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider));

    const payload = AgentRegistryService.stableStringify(normalized);
    let hash = 0;
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  public static isCacheEntryValid(entry: AgentManifestCacheEntry): boolean {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    if (typeof entry.checksum !== 'string' || !entry.checksum.trim()) {
      return false;
    }

    if (!Array.isArray(entry.manifests) || !entry.manifests.length) {
      return false;
    }

    const checksum = AgentRegistryService.computeManifestsChecksum(entry.manifests);
    return checksum === entry.checksum.trim();
  }

  private static createAgentsFromManifest(
    pluginId: string,
    manifest: AgentManifest,
  ): AgentDefinition[] {
    const baseCapabilities = cloneCapabilities(manifest.capabilities) ?? [];
    return manifest.models.map(model => {
      const active = Boolean(model.defaultActive);
      return {
        id: `${pluginId}-${model.id}`,
        model: model.model,
        name: model.name,
        provider: manifest.provider,
        description: model.description,
        kind: model.kind,
        accent: model.accent ?? DEFAULT_PLUGIN_ACCENT,
        active,
        status: active ? 'Disponible' : 'Inactivo',
        aliases: cloneAliases(model.aliases),
        channel: sanitizeChannel(model, manifest.provider),
        pluginId,
        capabilities: baseCapabilities,
      } satisfies AgentDefinition;
    });
  }

  private static areAgentListsEqual(a: AgentDefinition[], b: AgentDefinition[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const signature = (list: AgentDefinition[]) =>
      JSON.stringify(
        [...list]
          .map(agent => ({
            id: agent.id,
            model: agent.model,
            name: agent.name,
            provider: agent.provider,
            description: agent.description,
            kind: agent.kind,
            accent: agent.accent,
            active: agent.active,
            status: agent.status,
            aliases: agent.aliases ?? [],
            channel: agent.channel ?? null,
            pluginId: agent.pluginId ?? null,
            capabilities: agent.capabilities ?? [],
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      );

    return signature(a) === signature(b);
  }

  private notify() {
    const snapshot = this.buildSnapshot();
    this.subscribers.forEach(subscriber => subscriber(snapshot));
  }

  private buildSnapshot(): AgentDefinition[] {
    const pluginAgents = Array.from(this.pluginAgents.values()).flat();
    return [...this.builtinAgents, ...pluginAgents].map(agent => cloneAgentDefinition(agent));
  }

  private static stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map(item => AgentRegistryService.stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
        .map(([key, item]) => `${JSON.stringify(key)}:${AgentRegistryService.stableStringify(item)}`);
      return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
  }
}

export const agentRegistryService = new AgentRegistryService();
