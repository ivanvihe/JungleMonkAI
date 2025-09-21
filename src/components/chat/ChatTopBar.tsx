import React, { useCallback, useEffect, useMemo, useState, useId } from 'react';
import {
  Layout,
  Space,
  Avatar,
  Badge,
  Tooltip,
  Dropdown,
  Typography,
  Segmented,
  Button,
  Select,
  Tag,
} from 'antd';
import type { BadgeProps } from 'antd';
import { DownOutlined, ReloadOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { AgentDefinition, AgentKind } from '../../core/agents/agentRegistry';
import {
  AgentPresenceEntry,
  AgentPresenceSummary,
  AgentPresenceStatus,
} from '../../core/agents/presence';
import { ChatActorFilter } from '../../types/chat';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import { useProjects } from '../../core/projects/ProjectContext';
import { useJarvisCore, type JarvisRuntimeStatus } from '../../core/jarvis/JarvisCoreContext';

interface ChatTopBarProps {
  agents: AgentDefinition[];
  presenceSummary: AgentPresenceSummary;
  presenceMap: Map<string, AgentPresenceEntry>;
  activeAgents: number;
  totalAgents: number;
  pendingResponses: number;
  activeFilter: ChatActorFilter;
  onFilterChange: (filter: ChatActorFilter) => void;
  onRefreshPresence: () => void;
  onOpenStats: () => void;
  onOpenGlobalSettings: () => void;
  onOpenPlugins: () => void;
  onOpenMcp: () => void;
  onOpenModelManager: () => void;
  activeView: 'chat' | 'repo' | 'canvas';
  onChangeView: (view: 'chat' | 'repo' | 'canvas') => void;
}

const STATUS_LABELS: Record<AgentPresenceStatus, string> = {
  online: 'Operativo',
  offline: 'En espera',
  error: 'Con incidencias',
  loading: 'Verificando…',
};

const KIND_LABELS: Record<AgentKind, string> = {
  cloud: 'Agentes en nube',
  local: 'Agentes locales',
};

const STATUS_BADGE: Record<AgentPresenceStatus, { color: string; status: BadgeProps['status'] }> = {
  online: { color: '#52c41a', status: 'success' },
  offline: { color: '#bfbfbf', status: 'default' },
  error: { color: '#ff4d4f', status: 'error' },
  loading: { color: '#fa8c16', status: 'processing' },
};

const resolveStatus = (summary: AgentPresenceSummary): AgentPresenceStatus => {
  if (summary.totals.error > 0) {
    return 'error';
  }
  if (summary.totals.online > 0) {
    return 'online';
  }
  if (summary.totals.loading > 0) {
    return 'loading';
  }
  return 'offline';
};

export const ChatTopBar: React.FC<ChatTopBarProps> = ({
  agents,
  presenceSummary,
  presenceMap,
  activeAgents,
  totalAgents,
  pendingResponses,
  activeFilter,
  onFilterChange,
  onRefreshPresence,
  onOpenStats,
  onOpenGlobalSettings,
  onOpenPlugins,
  onOpenMcp,
  onOpenModelManager,
  activeView,
  onChangeView,
}) => {
  const hasPending = pendingResponses > 0;
  const overallStatus = resolveStatus(presenceSummary);
  const { projects, activeProjectId, activeProject, selectProject } = useProjects();
  const { runtimeStatus, ensureOnline, uptimeMs, lastError, lastHealthMessage } = useJarvisCore();
  const [isEnsuring, setEnsuring] = useState(false);
  const projectSelectLabelId = useId();
  const filterSelectLabelId = useId();
  const activeAgentsMessage = useMemo(() => {
    const base = `${activeAgents} agente${activeAgents === 1 ? '' : 's'}`;
    return `${base} coordinando la conversación`;
  }, [activeAgents]);

  const handleEnsureJarvis = useCallback(async () => {
    setEnsuring(true);
    try {
      await ensureOnline();
    } finally {
      setEnsuring(false);
    }
  }, [ensureOnline]);

  const projectOptions = useMemo(
    () =>
      projects.map(project => ({
        id: project.id,
        label: project.name,
      })),
    [projects],
  );

  const filterOptions = useMemo(() => {
    const options: { value: ChatActorFilter; label: React.ReactNode }[] = [
      { value: 'all', label: 'Todos los actores' },
      { value: 'user', label: 'Usuario' },
      { value: 'system', label: 'Control Hub' },
    ];

    (['cloud', 'local'] as AgentKind[]).forEach(kind => {
      const bucket = presenceSummary.byKind[kind];
      if (bucket.total > 0) {
        options.push({
          value: `kind:${kind}` as ChatActorFilter,
          label: (
            <Space size="small">
              <Tag color={kind === 'cloud' ? 'geekblue' : 'green'} bordered={false}>
                {KIND_LABELS[kind]}
              </Tag>
              <Typography.Text type="secondary">{bucket.total}</Typography.Text>
            </Space>
          ),
        });
      }
    });

    agents
      .filter(agent => agent.active)
      .forEach(agent => {
        const presence = presenceMap.get(agent.id);
        const badge = STATUS_BADGE[presence?.status ?? 'loading'];
        options.push({
          value: `agent:${agent.id}` as ChatActorFilter,
          label: (
            <Space size="small" align="center">
              <Badge color={badge.color} status={badge.status} />
              <Typography.Text>{getAgentDisplayName(agent)}</Typography.Text>
            </Space>
          ),
        });
      });

    return options;
  }, [agents, presenceMap, presenceSummary]);

  const filterValue = useMemo(() => {
    if (filterOptions.some(option => option.value === activeFilter)) {
      return activeFilter;
    }
    return 'all';
  }, [activeFilter, filterOptions]);

  useEffect(() => {
    if (filterValue !== activeFilter) {
      onFilterChange('all');
    }
  }, [filterValue, activeFilter, onFilterChange]);

  const jarvisStatusLabels: Record<JarvisRuntimeStatus, string> = useMemo(
    () => ({
      offline: 'Jarvis Core desconectado',
      starting: 'Jarvis Core iniciando…',
      ready: 'Jarvis Core operativo',
      error: 'Jarvis Core con incidencias',
    }),
    [],
  );

  const jarvisTooltip = useMemo(() => {
    const base = jarvisStatusLabels[runtimeStatus];
    const detail = lastError ?? lastHealthMessage;
    if (!detail) {
      return base;
    }
    return `${base} · ${detail}`;
  }, [jarvisStatusLabels, runtimeStatus, lastError, lastHealthMessage]);

  const jarvisAriaLabel = useMemo(() => {
    const base = jarvisStatusLabels[runtimeStatus];
    if (!uptimeMs || uptimeMs <= 0) {
      return base;
    }
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const uptimeDescription =
      hours > 0
        ? `${hours} hora${hours === 1 ? '' : 's'} y ${minutes} minuto${minutes === 1 ? '' : 's'}`
        : `${minutes} minuto${minutes === 1 ? '' : 's'} y ${seconds} segundo${seconds === 1 ? '' : 's'}`;
    return `${base}. Tiempo en línea: ${uptimeDescription}`;
  }, [jarvisStatusLabels, runtimeStatus, uptimeMs]);

  const uptimeLabel = useMemo(() => {
    if (!uptimeMs || uptimeMs <= 0) {
      return null;
    }
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `↑ ${days}d ${hours.toString().padStart(2, '0')}h`;
    }
    if (hours > 0) {
      return `↑ ${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `↑ ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }, [uptimeMs]);

  const presenceAvatars = useMemo(() => {
    const activeAgentsList = agents.filter(agent => agent.active);
    if (!activeAgentsList.length) {
      return null;
    }

    return (
      <Avatar.Group maxCount={6} size={28} maxStyle={{ color: '#1890ff', backgroundColor: '#e6f4ff' }}>
        {activeAgentsList.map(agent => {
          const entry = presenceMap.get(agent.id);
          const badge = STATUS_BADGE[entry?.status ?? 'loading'];
          const label = getAgentDisplayName(agent);
          const tooltipTitle = `${label} · ${STATUS_LABELS[entry?.status ?? 'loading']}`;
          return (
            <Tooltip key={agent.id} title={tooltipTitle} placement="bottom">
              <Badge dot status={badge.status} offset={[-2, 8]} color={badge.color}>
                <Avatar style={{ backgroundColor: agent.accent ?? '#2f54eb', color: '#fff' }}>
                  {label.slice(0, 1).toUpperCase()}
                </Avatar>
              </Badge>
            </Tooltip>
          );
        })}
      </Avatar.Group>
    );
  }, [agents, presenceMap]);

  const viewOptions = useMemo(
    () => [
      {
        label: (
          <Space size="small">
            <span role="img" aria-label="chat">
              💬
            </span>
            Chat
          </Space>
        ),
        value: 'chat' as const,
      },
      {
        label: (
          <Space size="small">
            <span role="img" aria-label="repo">
              🗂️
            </span>
            Repo
          </Space>
        ),
        value: 'repo' as const,
      },
      {
        label: (
          <Space size="small">
            <span role="img" aria-label="canvas">
              🧪
            </span>
            Canvas
          </Space>
        ),
        value: 'canvas' as const,
      },
    ],
    [],
  );

  const actionItems = useMemo(
    () => [
      { key: 'stats', label: 'Ver estadísticas de la conversación' },
      { key: 'plugins', label: 'Abrir plugins' },
      { key: 'mcp', label: 'Abrir perfiles MCP' },
      { key: 'models', label: 'Abrir gestor de modelos' },
      { key: 'settings', label: 'Ajustes globales' },
    ],
    [],
  );

  const handleMenuClick = useCallback(
    ({ key }: { key: string }) => {
      switch (key) {
        case 'stats':
          onOpenStats();
          break;
        case 'plugins':
          onOpenPlugins();
          break;
        case 'mcp':
          onOpenMcp();
          break;
        case 'models':
          onOpenModelManager();
          break;
        case 'settings':
          onOpenGlobalSettings();
          break;
        default:
          break;
      }
    },
    [onOpenGlobalSettings, onOpenMcp, onOpenModelManager, onOpenPlugins, onOpenStats],
  );

  return (
    <Layout.Header className="chat-top-bar">
      <Space className="topbar-left" align="center" size="large">
        <Space align="center" size="middle">
          <Avatar shape="square" size={40} style={{ backgroundColor: '#2b2b52', color: '#fff' }}>
            🌀
          </Avatar>
          <div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              JungleMonk.AI
            </Typography.Title>
            <Space size="small" align="center">
              <Badge color={STATUS_BADGE[overallStatus].color} status={STATUS_BADGE[overallStatus].status} />
              <Typography.Text type="secondary">{STATUS_LABELS[overallStatus]}</Typography.Text>
            </Space>
          </div>
        </Space>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            <Segmented
              options={viewOptions}
              value={activeView}
              onChange={value => onChangeView(value as 'chat' | 'repo' | 'canvas')}
            />
          </motion.div>
        </AnimatePresence>
      </Space>

      <Space className="topbar-center" align="center" size="large">
        <Space size="middle" align="center">
          <Tooltip title="Agentes activos en la sesión">
            <Tag color="blue" bordered={false}>
              Activos: {activeAgents}/{totalAgents}
            </Tag>
          </Tooltip>
          <Tooltip title="Respuestas pendientes">
            <Tag color={hasPending ? 'orange' : 'default'} bordered={false}>
              Pendientes: {pendingResponses}
            </Tag>
          </Tooltip>
          <Typography.Text type="secondary" aria-live="polite">
            {activeAgentsMessage}
          </Typography.Text>
          <Tooltip title="Refrescar presencia de agentes">
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={onRefreshPresence}
              aria-label="Actualizar estado de agentes"
            />
          </Tooltip>
          <Tooltip title={jarvisTooltip} placement="bottom">
            <Button
              type={runtimeStatus === 'ready' ? 'primary' : 'default'}
              loading={isEnsuring}
              icon={<RobotOutlined />}
              onClick={handleEnsureJarvis}
              aria-label={jarvisAriaLabel}
            >
              {uptimeLabel ?? 'Jarvis Core'}
            </Button>
          </Tooltip>
        </Space>

        <Space direction="vertical" size={2} className="project-select">
          <Typography.Text id={projectSelectLabelId} type="secondary">
            Proyecto activo
          </Typography.Text>
          <Select
            value={activeProjectId ?? undefined}
            onChange={value => selectProject((value as string | undefined) ?? null)}
            style={{ minWidth: 220 }}
            placeholder="Sin proyectos configurados"
            aria-label="Seleccionar proyecto activo"
            aria-labelledby={projectSelectLabelId}
            options={projectOptions.map(option => ({ label: option.label, value: option.id }))}
            allowClear
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {activeProject
              ? `${activeProject.repositoryPath}${
                  activeProject.defaultBranch ? `@${activeProject.defaultBranch}` : ''
                }`
              : 'Sin proyecto activo'}
          </Typography.Text>
        </Space>

        <Space direction="vertical" size={2} className="filter-select">
          <Typography.Text id={filterSelectLabelId} type="secondary">
            Filtro de actores
          </Typography.Text>
          <Select
            value={filterValue}
            onChange={value => onFilterChange(value as ChatActorFilter)}
            style={{ minWidth: 200 }}
            options={filterOptions}
            aria-label="Filtrar actores en la conversación"
            aria-labelledby={filterSelectLabelId}
          />
        </Space>

        {presenceAvatars}
      </Space>

      <Space className="topbar-actions" align="center">
        <Dropdown menu={{ items: actionItems, onClick: handleMenuClick }} trigger={['click']}>
          <Button type="text" icon={<DownOutlined />} aria-label="Más acciones" />
        </Dropdown>
        <Tooltip title="Ajustes globales">
          <Button type="text" icon={<SettingOutlined />} onClick={onOpenGlobalSettings} />
        </Tooltip>
      </Space>
    </Layout.Header>
  );
};

export default ChatTopBar;
