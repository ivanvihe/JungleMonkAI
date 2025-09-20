import React, { useMemo } from 'react';
import { useMessages } from '../../core/messages/MessageContext';
import { useAgents } from '../../core/agents/AgentContext';
import { getAgentDisplayName } from '../../utils/agentDisplay';

export const QualityDashboard: React.FC = () => {
  const { qualityMetrics, correctionHistory, formatTimestamp, sharedMessageLog } = useMessages();
  const { agentMap } = useAgents();

  const { totalAgentMessages, flaggedResponses, totalCorrections, correctionRate, tagRanking } = qualityMetrics;
  const recentShared = useMemo(() => [...sharedMessageLog].slice(-3).reverse(), [sharedMessageLog]);

  const resolveAgentName = (agentId?: string): string => {
    if (!agentId) {
      return 'usuario';
    }
    const agent = agentMap.get(agentId);
    return agent ? getAgentDisplayName(agent) : agentId;
  };

  return (
    <section className="panel-section">
      <header className="panel-section-header">
        <h2>Calidad de respuestas</h2>
        <p>Audita errores recurrentes y seguimiento de correcciones.</p>
      </header>
      <div className="quality-metrics">
        <div className="quality-card">
          <span className="quality-label">Respuestas de agentes</span>
          <strong className="quality-value">{totalAgentMessages}</strong>
        </div>
        <div className="quality-card">
          <span className="quality-label">Marcadas con error</span>
          <strong className="quality-value">{flaggedResponses}</strong>
        </div>
        <div className="quality-card">
          <span className="quality-label">Correcciones enviadas</span>
          <strong className="quality-value">{totalCorrections}</strong>
        </div>
        <div className="quality-card">
          <span className="quality-label">Ratio de corrección</span>
          <strong className="quality-value">{(correctionRate * 100).toFixed(1)}%</strong>
        </div>
      </div>
      <div className="quality-tags">
        <span className="quality-label">Etiquetas destacadas</span>
        <div className="quality-tag-cloud">
          {tagRanking.length === 0 && <span className="quality-tag-empty">Sin etiquetas registradas.</span>}
          {tagRanking.map(entry => (
            <span key={entry.tag} className="quality-tag-chip">
              {entry.tag}
              <small>{entry.count}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="quality-history">
        <span className="quality-label">Últimas correcciones</span>
        <ul>
          {correctionHistory.slice(0, 3).map(correction => (
            <li key={correction.id}>
              <strong>#{correction.id.split('-')[0]}</strong>
              <span>{formatTimestamp(correction.updatedAt)}</span>
              {correction.tags?.length ? <em>{correction.tags.join(', ')}</em> : <em>sin etiquetas</em>}
            </li>
          ))}
          {correctionHistory.length === 0 && <li className="quality-tag-empty">No hay correcciones registradas todavía.</li>}
        </ul>
      </div>
      <div className="quality-history quality-share-log">
        <span className="quality-label">Mensajes compartidos</span>
        <ul>
          {recentShared.map(entry => {
            const targetName = resolveAgentName(entry.agentId);
            const originName = entry.originAgentId ? resolveAgentName(entry.originAgentId) : 'usuario';
            const snippet = entry.canonicalCode?.trim();

            return (
              <li key={entry.id}>
                <strong>{targetName}</strong>
                <span>{formatTimestamp(entry.sharedAt)}</span>
                <em>{`desde ${originName}`}</em>
                {snippet ? <code className="quality-share-code">{`${snippet.slice(0, 40)}${snippet.length > 40 ? '…' : ''}`}</code> : null}
              </li>
            );
          })}
          {recentShared.length === 0 && (
            <li className="quality-tag-empty">Aún no has compartido mensajes entre agentes.</li>
          )}
        </ul>
      </div>
    </section>
  );
};
