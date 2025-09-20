import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiKeySettings } from '../../types/globalSettings';
import { isSupportedProvider } from '../../utils/globalSettings';
import { AgentDefinition, AgentStatus, initializeAgents, syncAgentWithApiKeys } from './agentRegistry';

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
  children: React.ReactNode;
}

export const AgentProvider: React.FC<AgentProviderProps> = ({ apiKeys, children }) => {
  const [agents, setAgents] = useState<AgentDefinition[]>(() => initializeAgents(apiKeys));

  useEffect(() => {
    setAgents(prev => {
      let changed = false;
      const updatedAgents = prev.map(agent => {
        const synced = syncAgentWithApiKeys(agent, apiKeys);
        if (synced !== agent) {
          changed = true;
        }
        return synced;
      });

      return changed ? updatedAgents : prev;
    });
  }, [apiKeys]);

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
