import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentManifest, AgentManifestCache } from '../../types/agents';
import { ApiKeySettings } from '../../types/globalSettings';
import { isSupportedProvider, registerExternalProviders } from '../../utils/globalSettings';
import { AgentDefinition, AgentStatus, syncAgentWithApiKeys } from './agentRegistry';
import { AgentRegistryService, agentRegistryService } from './AgentRegistryService';

interface AgentContextValue {
  agents: AgentDefinition[];
  activeAgents: AgentDefinition[];
  agentMap: Map<string, AgentDefinition>;
  toggleAgent: (agentId: string) => void;
  updateLocalAgentState: (agentId: string, status: AgentStatus, active?: boolean) => void;
  assignAgentRole: (agentId: string, updates: { role?: string; objective?: string }) => void;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

interface AgentProviderProps {
  apiKeys: ApiKeySettings;
  enabledPlugins: string[];
  approvedManifests: AgentManifestCache;
  children: React.ReactNode;
}

type PluginManifestModule = { default: AgentManifest | AgentManifest[] };

const pluginManifestModules = import.meta.glob<PluginManifestModule>(
  '../../plugins/**/manifest.{ts,js,json}',
);

const extractPluginId = (path: string): string | null => {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/plugins/');
  if (segments.length < 2) {
    return null;
  }
  const remainder = segments[1];
  const parts = remainder.split('/');
  if (!parts.length) {
    return null;
  }
  return parts[0];
};

const cloneManifestList = (manifests: AgentManifest[]): AgentManifest[] =>
  manifests.map(manifest => ({
    provider: manifest.provider,
    capabilities: [...manifest.capabilities],
    models: manifest.models.map(model => ({
      ...model,
      aliases: model.aliases ? [...model.aliases] : undefined,
    })),
  }));

export const AgentProvider: React.FC<AgentProviderProps> = ({
  apiKeys,
  enabledPlugins,
  approvedManifests,
  children,
}) => {
  const apiKeysRef = useRef<ApiKeySettings>(apiKeys);
  const [agents, setAgents] = useState<AgentDefinition[]>(() =>
    agentRegistryService
      .getAgents()
      .map(agent => syncAgentWithApiKeys({ ...agent }, apiKeys, agent.active)),
  );

  useEffect(() => {
    apiKeysRef.current = apiKeys;
    setAgents(prev => prev.map(agent => syncAgentWithApiKeys(agent, apiKeys)));
  }, [apiKeys]);

  useEffect(() => {
    const handleRegistryUpdate = (incoming: AgentDefinition[]) => {
      setAgents(prev => {
        const previousMap = new Map(prev.map(agent => [agent.id, agent]));
        return incoming.map(agent => {
          const existing = previousMap.get(agent.id);
          const base: AgentDefinition = existing
            ? {
                ...agent,
                active: existing.active,
                status: existing.status,
                apiKey: existing.apiKey,
                role: existing.role,
                objective: existing.objective,
              }
            : { ...agent };
          const shouldForce = !existing && base.active;
          return syncAgentWithApiKeys(base, apiKeysRef.current, shouldForce);
        });
      });
    };

    return agentRegistryService.subscribe(handleRegistryUpdate);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPluginAgents = async () => {
      const entries: { pluginId: string; manifests: AgentManifest[] }[] = [];
      const providers = new Set<string>();

      const pendingPluginIds = new Set(enabledPlugins);

      await Promise.all(
        Object.entries(pluginManifestModules).map(async ([path, loader]) => {
          const pluginId = extractPluginId(path);
          if (!pluginId || !pendingPluginIds.has(pluginId)) {
            return;
          }

          const approved = approvedManifests[pluginId];
          if (!approved) {
            return;
          }

          let manifests: AgentManifest[] | null = null;

          try {
            const module = await (loader as () => Promise<PluginManifestModule>)();
            const raw = module?.default ?? module;
            const manifestList = Array.isArray(raw) ? raw : [raw];
            manifests = cloneManifestList(manifestList);
          } catch (error) {
            console.warn(`No se pudo cargar el manifiesto del plugin «${pluginId}»`, error);
          }

          if (!manifests && approved.manifests?.length) {
            manifests = cloneManifestList(approved.manifests);
          }

          if (!manifests?.length) {
            return;
          }

          const checksum = AgentRegistryService.computeManifestsChecksum(manifests);
          if (checksum !== approved.checksum) {
            console.warn(
              `El manifiesto cargado para el plugin «${pluginId}» no coincide con la versión aprobada.`,
            );
            return;
          }

          entries.push({ pluginId, manifests });
          pendingPluginIds.delete(pluginId);
          manifests.forEach(manifest => {
            if (manifest.provider) {
              providers.add(manifest.provider);
            }
          });
        }),
      );

      pendingPluginIds.forEach(pluginId => {
        const approved = approvedManifests[pluginId];
        if (!approved?.manifests?.length) {
          return;
        }
        const manifests = cloneManifestList(approved.manifests);
        const checksum = AgentRegistryService.computeManifestsChecksum(manifests);
        if (checksum !== approved.checksum) {
          return;
        }
        entries.push({ pluginId, manifests });
        manifests.forEach(manifest => {
          if (manifest.provider) {
            providers.add(manifest.provider);
          }
        });
      });

      if (cancelled) {
        return;
      }

      if (providers.size) {
        registerExternalProviders(Array.from(providers));
      }

      agentRegistryService.applyPluginManifests(entries);
    };

    void loadPluginAgents();

    return () => {
      cancelled = true;
    };
  }, [enabledPlugins, approvedManifests]);

  const toggleAgent = useCallback(
    (agentId: string) => {
      setAgents(prev => {
        const target = prev.find(agent => agent.id === agentId);
        if (!target) {
          return prev;
        }

        if (target.kind === 'local') {
          const willBeActive = !target.active;
          return prev.map(agent => {
            if (agent.kind !== 'local') {
              return agent;
            }

            if (agent.id === agentId) {
              return {
                ...agent,
                active: willBeActive,
                status: willBeActive ? 'Disponible' : 'Inactivo',
              };
            }

            if (willBeActive && (agent.active || agent.status !== 'Inactivo')) {
              return {
                ...agent,
                active: false,
                status: 'Inactivo',
              };
            }

            return agent.active || agent.status !== 'Inactivo'
              ? {
                  ...agent,
                  active: false,
                  status: agent.status === 'Cargando' ? agent.status : 'Inactivo',
                }
              : agent;
          });
        }

        return prev.map(agent => {
          if (agent.id !== agentId) {
            return agent;
          }

          const willBeActive = !agent.active;
          const providerKey = agent.provider.toLowerCase();
          let nextStatus = agent.status;
          if (willBeActive && isSupportedProvider(providerKey)) {
            nextStatus = apiKeys[providerKey] ? 'Disponible' : 'Sin clave';
          } else if (!willBeActive) {
            nextStatus = 'Inactivo';
          }

          return {
            ...agent,
            active: willBeActive,
            status: nextStatus,
          };
        });
      });
    },
    [apiKeys],
  );

  const updateLocalAgentState = useCallback(
    (agentId: string, status: AgentStatus, active?: boolean) => {
      setAgents(prev =>
        prev.map(agent => {
          if (agent.id !== agentId || agent.kind !== 'local') {
            return agent;
          }

          const desiredActive = active ?? agent.active;
          if (agent.status === status && agent.active === desiredActive) {
            return agent;
          }

          return {
            ...agent,
            status,
            active: desiredActive,
          };
        }),
      );
    },
    [],
  );

  const assignAgentRole = useCallback((agentId: string, updates: { role?: string; objective?: string }) => {
    setAgents(prev =>
      prev.map(agent => {
        if (agent.id !== agentId) {
          return agent;
        }

        if (agent.role === updates.role && agent.objective === updates.objective) {
          return agent;
        }

        return {
          ...agent,
          role: updates.role,
          objective: updates.objective,
        };
      }),
    );
  }, []);

  const value = useMemo(() => {
    const activeAgents = agents.filter(agent => agent.active);
    const agentMap = new Map<string, AgentDefinition>();
    agents.forEach(agent => agentMap.set(agent.id, agent));

    return {
      agents,
      activeAgents,
      agentMap,
      toggleAgent,
      updateLocalAgentState,
      assignAgentRole,
    };
  }, [agents, toggleAgent, updateLocalAgentState, assignAgentRole]);

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
};

export const useAgents = (): AgentContextValue => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgents debe utilizarse dentro de un AgentProvider');
  }
  return context;
};
