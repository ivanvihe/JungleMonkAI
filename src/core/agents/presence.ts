import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiKeySettings } from '../../types/globalSettings';
import { AgentDefinition, AgentKind } from './agentRegistry';

export type AgentPresenceStatus = 'online' | 'offline' | 'error' | 'loading';

export interface AgentPresenceEntry {
  status: AgentPresenceStatus;
  lastChecked: number | null;
  latencyMs?: number;
  message?: string;
}

export interface AgentPresenceSummaryByKind {
  kind: AgentKind;
  total: number;
  active: number;
  online: number;
  offline: number;
  error: number;
  loading: number;
}

export interface AgentPresenceSummary {
  totals: Record<AgentPresenceStatus, number>;
  byKind: Record<AgentKind, AgentPresenceSummaryByKind>;
}

const simulateDelay = async (min = 80, max = 220): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));

const evaluateCloudPresence = async (
  agent: AgentDefinition,
  apiKeys: ApiKeySettings,
): Promise<AgentPresenceEntry> => {
  const providerKey = agent.provider.toLowerCase();
  const apiKey = apiKeys[providerKey];

  if (!apiKey) {
    return {
      status: 'error',
      lastChecked: Date.now(),
      message: 'Sin API key configurada',
    };
  }

  if (!agent.active) {
    return {
      status: 'offline',
      lastChecked: Date.now(),
      message: 'Agente desactivado',
    };
  }

  if (agent.status === 'Cargando') {
    return {
      status: 'loading',
      lastChecked: Date.now(),
      message: 'Inicializando proveedor',
    };
  }

  if (agent.status === 'Sin clave') {
    return {
      status: 'error',
      lastChecked: Date.now(),
      message: 'Proveedor requiere credenciales',
    };
  }

  await simulateDelay();

  const healthy = agent.status === 'Disponible';

  return {
    status: healthy ? 'online' : 'offline',
    lastChecked: Date.now(),
    latencyMs: Math.round(60 + Math.random() * 90),
    message: healthy ? 'Proveedor responde correctamente' : 'Proveedor no disponible',
  };
};

const evaluateLocalPresence = (agent: AgentDefinition): AgentPresenceEntry => {
  if (!agent.active) {
    return {
      status: 'offline',
      lastChecked: Date.now(),
      message: 'Runtime detenido',
    };
  }

  if (agent.status === 'Cargando') {
    return {
      status: 'loading',
      lastChecked: Date.now(),
      message: 'Inicializando runtime local',
    };
  }

  if (agent.status === 'Inactivo') {
    return {
      status: 'offline',
      lastChecked: Date.now(),
      message: 'Runtime en reposo',
    };
  }

  if (agent.status !== 'Disponible') {
    return {
      status: 'error',
      lastChecked: Date.now(),
      message: agent.status,
    };
  }

  return {
    status: 'online',
    lastChecked: Date.now(),
    latencyMs: Math.round(8 + Math.random() * 12),
    message: 'Runtime listo para recibir prompts',
  };
};

const ensureEntry = (entry: AgentPresenceEntry | undefined): AgentPresenceEntry =>
  entry ?? { status: 'loading', lastChecked: null };

const EMPTY_SUMMARY: AgentPresenceSummary = {
  totals: {
    online: 0,
    offline: 0,
    error: 0,
    loading: 0,
  },
  byKind: {
    cloud: {
      kind: 'cloud',
      total: 0,
      active: 0,
      online: 0,
      offline: 0,
      error: 0,
      loading: 0,
    },
    local: {
      kind: 'local',
      total: 0,
      active: 0,
      online: 0,
      offline: 0,
      error: 0,
      loading: 0,
    },
  },
};

export interface AgentPresenceMonitor {
  presenceMap: Map<string, AgentPresenceEntry>;
  summary: AgentPresenceSummary;
  refresh: (agentId?: string) => Promise<void>;
}

export const useAgentPresence = (
  agents: AgentDefinition[],
  apiKeys: ApiKeySettings,
): AgentPresenceMonitor => {
  const [presence, setPresence] = useState<Record<string, AgentPresenceEntry>>({});

  const evaluateAgents = useCallback(
    async (targets: AgentDefinition[]) => {
      if (!targets.length) {
        return;
      }

      setPresence(prev => {
        const next = { ...prev };
        targets.forEach(agent => {
          next[agent.id] = {
            status: 'loading',
            lastChecked: prev[agent.id]?.lastChecked ?? null,
          };
        });
        return next;
      });

      const results = await Promise.all(
        targets.map(async agent => ({
          agentId: agent.id,
          entry:
            agent.kind === 'cloud'
              ? await evaluateCloudPresence(agent, apiKeys)
              : evaluateLocalPresence(agent),
        })),
      );

      setPresence(prev => {
        const next = { ...prev };
        results.forEach(({ agentId, entry }) => {
          next[agentId] = entry;
        });
        return next;
      });
    },
    [apiKeys],
  );

  const refresh = useCallback(
    async (agentId?: string) => {
      if (agentId) {
        const target = agents.find(agent => agent.id === agentId);
        if (target) {
          await evaluateAgents([target]);
        }
        return;
      }

      await evaluateAgents(agents);
    },
    [agents, evaluateAgents],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const presenceMap = useMemo(() => {
    const map = new Map<string, AgentPresenceEntry>();
    agents.forEach(agent => {
      map.set(agent.id, ensureEntry(presence[agent.id]));
    });
    return map;
  }, [agents, presence]);

  const summary = useMemo(() => {
    if (!agents.length) {
      return EMPTY_SUMMARY;
    }

    const base: AgentPresenceSummary = {
      totals: { online: 0, offline: 0, error: 0, loading: 0 },
      byKind: {
        cloud: {
          kind: 'cloud',
          total: 0,
          active: 0,
          online: 0,
          offline: 0,
          error: 0,
          loading: 0,
        },
        local: {
          kind: 'local',
          total: 0,
          active: 0,
          online: 0,
          offline: 0,
          error: 0,
          loading: 0,
        },
      },
    };

    agents.forEach(agent => {
      const entry = ensureEntry(presence[agent.id]);
      const status = entry.status;
      base.totals[status] += 1;

      const bucket = base.byKind[agent.kind];
      bucket.total += 1;
      if (agent.active) {
        bucket.active += 1;
      }
      bucket[status] += 1;
    });

    return base;
  }, [agents, presence]);

  return {
    presenceMap,
    summary,
    refresh,
  };
};
