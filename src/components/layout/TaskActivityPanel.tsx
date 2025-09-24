import React from 'react';
import { ThunderboltOutlined, RadarChartOutlined } from '@ant-design/icons';
import { ProCard } from '@ant-design/pro-components';
import { Progress, Space, Tag, Typography } from 'antd';
import type { AgentPresenceSummary } from '../../core/agents/presence';
import './TaskActivityPanel.css';

const { Text, Title } = Typography;

export type TaskActivityPanelProps = {
  pendingResponses: number;
  presenceSummary: AgentPresenceSummary;
};

const statusTagTone: Record<string, string> = {
  online: 'success',
  loading: 'processing',
  offline: 'default',
  error: 'error',
};

export const TaskActivityPanel: React.FC<TaskActivityPanelProps> = ({
  pendingResponses,
  presenceSummary,
}) => {
  const totalAgents =
    presenceSummary.totals.online +
    presenceSummary.totals.offline +
    presenceSummary.totals.loading +
    presenceSummary.totals.error;
  const onlinePercentage = totalAgents > 0 ? Math.round((presenceSummary.totals.online / totalAgents) * 100) : 0;
  const hasPending = pendingResponses > 0;

  const statusEntries = [
    { key: 'online', label: 'Operativos', value: presenceSummary.totals.online },
    { key: 'loading', label: 'Verificando', value: presenceSummary.totals.loading },
    { key: 'offline', label: 'En espera', value: presenceSummary.totals.offline },
    { key: 'error', label: 'Incidencias', value: presenceSummary.totals.error },
  ].filter(entry => entry.value > 0);

  return (
    <ProCard ghost bordered={false} className="task-activity-panel">
      <div className="task-activity-panel__header">
        <Space size="middle" align="center">
          <ThunderboltOutlined style={{ color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>
            Monitor de tareas
          </Title>
        </Space>
        <Tag color={hasPending ? 'orange' : 'default'} bordered={false} icon={<RadarChartOutlined />}>
          Pendientes: {pendingResponses}
        </Tag>
      </div>

      <div className="task-activity-panel__metrics">
        <div>
          <Text type="secondary">Agentes operativos</Text>
          <Progress
            percent={onlinePercentage}
            status={onlinePercentage >= 90 ? 'success' : onlinePercentage <= 40 ? 'exception' : 'active'}
            format={percent => `${percent ?? 0}%`}
            strokeColor={{
              from: 'var(--color-primary)',
              to: 'var(--color-info)',
            }}
          />
        </div>
        <div>
          <Text type="secondary">Resumen de estado</Text>
          <Space className="task-activity-panel__status-list">
            {statusEntries.length === 0 && <Tag bordered={false}>Sin agentes activos</Tag>}
            {statusEntries.map(entry => (
              <Tag key={entry.key} color={statusTagTone[entry.key]} bordered>
                {entry.label}: {entry.value}
              </Tag>
            ))}
          </Space>
        </div>
      </div>

      <div className="task-activity-panel__footer">
        <Text type="secondary">Supervisa la ejecución de agentes y tareas en tiempo real.</Text>
        <Tag color="geekblue" bordered={false}>
          {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · Actualizado
        </Tag>
      </div>
    </ProCard>
  );
};

export default TaskActivityPanel;
