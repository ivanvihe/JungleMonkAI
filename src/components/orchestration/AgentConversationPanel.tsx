import React, { useMemo } from 'react';
import { AgentDefinition } from '../../core/agents/agentRegistry';
import {
  CoordinationStrategyId,
  OrchestrationTraceEntry,
  SharedConversationSnapshot,
  listCoordinationStrategies,
} from '../../core/orchestration';
import './AgentConversationPanel.css';

interface AgentConversationPanelProps {
  traces: OrchestrationTraceEntry[];
  sharedSnapshot: SharedConversationSnapshot;
  agents: AgentDefinition[];
  currentStrategy: CoordinationStrategyId;
  onChangeStrategy: (strategy: CoordinationStrategyId) => void;
}

const STRATEGIES = listCoordinationStrategies();

const formatTime = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const AgentConversationPanel: React.FC<AgentConversationPanelProps> = ({
  traces,
  sharedSnapshot,
  agents,
  currentStrategy,
  onChangeStrategy,
}) => {
  const agentLookup = useMemo(() => {
    const map = new Map<string, AgentDefinition>();
    agents.forEach(agent => map.set(agent.id, agent));
    return map;
  }, [agents]);

  const recentTraces = useMemo(() => traces.slice(-12).reverse(), [traces]);

  return (
    <div className="agent-conversation-panel">
      <div className="conversation-strategy">
        <label htmlFor="coordination-strategy">Estrategia de coordinación</label>
        <select
          id="coordination-strategy"
          value={currentStrategy}
          onChange={event => onChangeStrategy(event.target.value as CoordinationStrategyId)}
        >
          {STRATEGIES.map(strategy => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.label}
            </option>
          ))}
        </select>
        <p className="strategy-description">
          {STRATEGIES.find(strategy => strategy.id === currentStrategy)?.description}
        </p>
      </div>

      <div className="conversation-shared-state">
        <h3>Estado compartido</h3>
        <p className="shared-summary">{sharedSnapshot.sharedSummary}</p>
        {sharedSnapshot.lastConclusions.length > 0 && (
          <ul className="shared-conclusions">
            {sharedSnapshot.lastConclusions.slice(-4).reverse().map(entry => {
              const agent = entry.agentId ? agentLookup.get(entry.agentId) : undefined;
              return (
                <li key={`${entry.timestamp}-${entry.agentId ?? entry.author}`}>
                  <span className="conclusion-time">{formatTime(entry.timestamp)}</span>
                  <span className="conclusion-author">
                    {entry.author === 'system' ? 'Control' : agent?.name ?? 'Agente desconocido'}
                  </span>
                  <span className="conclusion-text">{entry.content}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="conversation-trace">
        <h3>Últimos intercambios</h3>
        {recentTraces.length === 0 ? (
          <p className="trace-empty">Aún no hay trazas registradas entre agentes.</p>
        ) : (
          <ul className="trace-list">
            {recentTraces.map(entry => {
              const agent = entry.agentId ? agentLookup.get(entry.agentId) : undefined;
              const actorLabel = entry.actor === 'system' ? 'Control' : agent?.name ?? 'Agente';
              return (
                <li key={entry.id} className={`trace-item trace-${entry.actor}`}>
                  <div className="trace-header">
                    <span className="trace-actor">{actorLabel}</span>
                    <span className="trace-time">{formatTime(entry.timestamp)}</span>
                  </div>
                  <p className="trace-description">{entry.description}</p>
                  {entry.details && <p className="trace-details">{entry.details}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
