import React, { useMemo, useRef, useState } from 'react';
import { Badge, Button, Empty, List, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import {
  AlertOutlined,
  AreaChartOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  PicCenterOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import type { AgentPresenceSummary } from '../../core/agents/presence';
import type { OrchestrationTraceEntry } from '../../core/orchestration/types';
import type { ChatMessageAction } from '../../core/messages/messageTypes';
import type { SharedMessageLogEntry } from '../../core/messages/MessageContext';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import './TaskDock.css';

export interface TaskDockProps {
  pendingResponses: number;
  pendingActions: ChatMessageAction[];
  sharedMessageLog: SharedMessageLogEntry[];
  orchestrationTraces: OrchestrationTraceEntry[];
  presenceSummary: AgentPresenceSummary;
  agents: AgentDefinition[];
}

const STATUS_COLOR: Record<ChatMessageAction['status'], string> = {
  pending: 'default',
  accepted: 'processing',
  executing: 'blue',
  completed: 'success',
  rejected: 'default',
  failed: 'error',
};

const statusLabel: Record<ChatMessageAction['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  executing: 'Ejecutando',
  completed: 'Completada',
  rejected: 'Rechazada',
  failed: 'Fallida',
};

const formatTimestamp = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
};

const presenceOrder: Array<keyof AgentPresenceSummary['totals']> = ['online', 'loading', 'offline', 'error'];

export const TaskDock: React.FC<TaskDockProps> = ({
  pendingResponses,
  pendingActions,
  sharedMessageLog,
  orchestrationTraces,
  presenceSummary,
  agents,
}) => {
  const [activeKey, setActiveKey] = useState('queue');
  const [isCollapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(260);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const sortedActions = useMemo(
    () =>
      [...pendingActions]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 20),
    [pendingActions],
  );

  const recentLogs = useMemo(
    () =>
      [...sharedMessageLog]
        .sort((a, b) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime())
        .slice(0, 20),
    [sharedMessageLog],
  );

  const recentEvents = useMemo(
    () =>
      [...orchestrationTraces]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20),
    [orchestrationTraces],
  );

  const agentLookup = useMemo(() => {
    return new Map(agents.map(agent => [agent.id, getAgentDisplayName(agent)]));
  }, [agents]);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed) {
      return;
    }
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockRef.current?.offsetHeight ?? height;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const next = Math.min(480, Math.max(160, startHeight + delta));
      setHeight(next);
    };

    const handleStop = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleStop);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleStop);
  };

  const presenceSummaryItems = presenceOrder.map(key => ({
    key,
    value: presenceSummary.totals[key],
  }));

  const presenceMeta: Record<keyof AgentPresenceSummary['totals'], { label: string; color: string }> = {
    online: { label: 'Online', color: 'success' },
    loading: { label: 'Verificando', color: 'warning' },
    offline: { label: 'En espera', color: 'default' },
    error: { label: 'Incidencias', color: 'error' },
  };

  const tabItems = [
    {
      key: 'queue',
      label: (
        <Space size={4} align="center">
          <PicCenterOutlined />
          Cola ({pendingResponses + pendingActions.length})
        </Space>
      ),
      children: sortedActions.length === 0 && pendingResponses === 0 ? (
        <Empty description="Sin tareas pendientes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={sortedActions}
          renderItem={item => (
            <List.Item key={item.id}>
              <Space direction="vertical" size={0} className="task-dock__list-item">
                <Space size="small" align="center">
                  <Tag color={STATUS_COLOR[item.status]}>{statusLabel[item.status]}</Tag>
                  <Typography.Text>{item.label ?? item.kind}</Typography.Text>
                  <Typography.Text type="secondary">{formatTimestamp(item.updatedAt)}</Typography.Text>
                </Space>
                {item.description ? (
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                    {item.description}
                  </Typography.Paragraph>
                ) : null}
              </Space>
            </List.Item>
          )}
          footer={
            pendingResponses > 0 ? (
              <Typography.Text type="secondary">
                {pendingResponses} respuestas en cola de agentes.
              </Typography.Text>
            ) : null
          }
        />
      ),
    },
    {
      key: 'logs',
      label: (
        <Space size={4} align="center">
          <HistoryOutlined />
          Logs ({recentLogs.length})
        </Space>
      ),
      children: recentLogs.length === 0 ? (
        <Empty description="Sin actividad compartida" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={recentLogs}
          renderItem={log => (
            <List.Item key={log.id}>
              <Space direction="vertical" size={0} className="task-dock__list-item">
                <Space size={4} align="center">
                  <Badge color="geekblue" />
                  <Typography.Text strong>
                    {agentLookup.get(log.agentId ?? '') ?? 'Agente desconocido'}
                  </Typography.Text>
                  <Typography.Text type="secondary">{formatTimestamp(log.sharedAt)}</Typography.Text>
                </Space>
                {log.canonicalCode ? (
                  <Typography.Text type="secondary" ellipsis>
                    {log.canonicalCode}
                  </Typography.Text>
                ) : null}
              </Space>
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'events',
      label: (
        <Space size={4} align="center">
          <AreaChartOutlined />
          Eventos ({recentEvents.length})
        </Space>
      ),
      children: recentEvents.length === 0 ? (
        <Empty description="Sin eventos recientes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={recentEvents}
          renderItem={event => (
            <List.Item key={event.id}>
              <Space direction="vertical" size={0} className="task-dock__list-item">
                <Space size={4} align="center">
                  <Tag color="blue">{event.strategyId}</Tag>
                  <Typography.Text>{event.description}</Typography.Text>
                </Space>
                <Typography.Text type="secondary">
                  {event.agentId ? `${agentLookup.get(event.agentId) ?? event.agentId} · ` : ''}
                  {formatTimestamp(event.timestamp)}
                </Typography.Text>
                {event.details ? (
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                    {event.details}
                  </Typography.Paragraph>
                ) : null}
              </Space>
            </List.Item>
          )}
        />
      ),
    },
  ];

  return (
    <aside
      className={`task-dock ${isCollapsed ? 'task-dock--collapsed' : ''}`}
      style={{ height: isCollapsed ? 56 : height }}
      ref={dockRef}
    >
      <div className="task-dock__resize" onMouseDown={handleResizeStart} role="separator" aria-orientation="horizontal" />
      <header className="task-dock__header">
        <Space size="large" align="center">
          <Space size={6} align="center">
            <SwapOutlined />
            <Typography.Text strong>Task Log</Typography.Text>
          </Space>
          <Space size={4} align="center" className="task-dock__presence">
            {presenceSummaryItems.map(item => (
              <Tag
                key={item.key}
                icon={<AlertOutlined />}
                color={presenceMeta[item.key].color}
                bordered={false}
              >
                {presenceMeta[item.key].label}: {item.value}
              </Tag>
            ))}
          </Space>
        </Space>
        <Space align="center" size="small">
          <Tooltip title={isCollapsed ? 'Expandir panel' : 'Minimizar panel'}>
            <Button
              type="text"
              size="small"
              icon={isCollapsed ? <ClockCircleOutlined /> : <PicCenterOutlined />}
              onClick={() => setCollapsed(prev => !prev)}
              aria-label={isCollapsed ? 'Expandir panel' : 'Minimizar panel'}
            />
          </Tooltip>
        </Space>
      </header>
      {!isCollapsed ? (
        <Tabs activeKey={activeKey} onChange={setActiveKey} items={tabItems} className="task-dock__tabs" />
      ) : null}
    </aside>
  );
};

export default TaskDock;
