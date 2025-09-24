import React, { useMemo } from 'react';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CloudServerOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import type { AgentPresenceSummary } from '../../core/agents/presence';
import type { AgentPresenceEntry } from '../../core/agents/presence';
import type { JarvisRuntimeStatus } from '../../core/jarvis/JarvisCoreContext';
import './ProviderStatus.css';

export interface ProviderStatusProps {
  summary: AgentPresenceSummary;
  presenceMap: Map<string, AgentPresenceEntry>;
  pendingResponses: number;
  runtimeStatus: JarvisRuntimeStatus;
  uptimeMs?: number | null;
  onRefresh: () => void;
}

const runtimeLabels: Record<JarvisRuntimeStatus, { label: string; tone: 'default' | 'success' | 'warning' | 'error' }> = {
  offline: { label: 'Desconectado', tone: 'default' },
  starting: { label: 'Iniciando…', tone: 'warning' },
  ready: { label: 'Operativo', tone: 'success' },
  error: { label: 'Con incidencias', tone: 'error' },
};

const toneColor: Record<'default' | 'success' | 'warning' | 'error', string> = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const formatUptime = (uptimeMs?: number | null): string | null => {
  if (!uptimeMs || uptimeMs <= 0) {
    return null;
  }
  const totalSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const countAverageLatency = (presenceMap: Map<string, AgentPresenceEntry>): number | null => {
  const values = Array.from(presenceMap.values())
    .map(entry => entry.latencyMs)
    .filter((latency): latency is number => typeof latency === 'number');
  if (!values.length) {
    return null;
  }
  const total = values.reduce((acc, latency) => acc + latency, 0);
  return Math.round(total / values.length);
};

export const ProviderStatus: React.FC<ProviderStatusProps> = ({
  summary,
  presenceMap,
  pendingResponses,
  runtimeStatus,
  uptimeMs,
  onRefresh,
}) => {
  const runtime = runtimeLabels[runtimeStatus];
  const uptimeLabel = formatUptime(uptimeMs);
  const latencyMs = useMemo(() => countAverageLatency(presenceMap), [presenceMap]);

  return (
    <section className="provider-status" aria-label="Estado de proveedores">
      <header className="provider-status__header">
        <Space size="small" align="center">
          <ThunderboltOutlined />
          <Typography.Text strong>Orquestación en vivo</Typography.Text>
        </Space>
        <Tooltip title="Actualizar presencia de agentes">
          <Button type="text" icon={<ReloadOutlined />} onClick={onRefresh} aria-label="Actualizar presencia" />
        </Tooltip>
      </header>

      <div className="provider-status__runtime">
        <Tag color={toneColor[runtime.tone]} icon={<ThunderboltOutlined />} bordered={false}>
          Jarvis Core · {runtime.label}
        </Tag>
        {uptimeLabel ? (
          <Tag icon={<FieldTimeOutlined />} color="geekblue" bordered={false}>
            Uptime {uptimeLabel}
          </Tag>
        ) : null}
        {typeof latencyMs === 'number' ? (
          <Tag icon={<ThunderboltOutlined />} color="purple" bordered={false}>
            Latencia media {latencyMs} ms
          </Tag>
        ) : null}
      </div>

      <div className="provider-status__grid" role="list">
        <div className="provider-status__metric" role="listitem">
          <Space size={4} align="center">
            <CloudServerOutlined />
            <Typography.Text type="secondary">Cloud</Typography.Text>
          </Space>
          <Typography.Title level={4}>
            {summary.byKind.cloud.online}/{summary.byKind.cloud.total}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {summary.byKind.cloud.loading} verificando · {summary.byKind.cloud.error} incidencias
          </Typography.Paragraph>
        </div>
        <div className="provider-status__metric" role="listitem">
          <Space size={4} align="center">
            <UsbOutlined />
            <Typography.Text type="secondary">Local</Typography.Text>
          </Space>
          <Typography.Title level={4}>
            {summary.byKind.local.online}/{summary.byKind.local.total}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {summary.byKind.local.loading} preparando · {summary.byKind.local.error} incidencias
          </Typography.Paragraph>
        </div>
        <div className="provider-status__metric" role="listitem">
          <Space size={4} align="center">
            <ThunderboltOutlined />
            <Typography.Text type="secondary">Tareas</Typography.Text>
          </Space>
          <Typography.Title level={4}>{pendingResponses}</Typography.Title>
          <Typography.Paragraph type="secondary">Respuestas pendientes en cola</Typography.Paragraph>
        </div>
      </div>
    </section>
  );
};

export default ProviderStatus;
