import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Grid,
  Layout,
  List,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DatabaseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import './SidePanel.css';
import type { AgentDefinition } from '../../core/agents/agentRegistry';
import { useAgents } from '../../core/agents/AgentContext';
import type { AgentPresenceEntry } from '../../core/agents/presence';
import { useAgentPresence } from '../../core/agents/presence';

interface SidePanelProps {
  onOpenGlobalSettings: () => void;
  onOpenModelManager: () => void;
  /**
   * Side of the layout where the panel is rendered.
   * Used to mirror gestures and placement.
   */
  position?: 'left' | 'right';
  /**
   * Total width of the expanded panel.
   * Defaults to 320px to keep parity with the legacy layout.
   */
  width?: number;
  /**
   * Force the rendering variant. By default the component adapts
   * to the responsive breakpoint, but consumers can override it.
   */
  variant?: 'auto' | 'desktop' | 'mobile';
}

type ProviderId = 'openai' | 'anthropic' | 'groq' | 'jarvis';

type ProviderTone = 'online' | 'warning' | 'error';

interface ProviderCardState {
  id: ProviderId;
  label: string;
  modelLabel: string;
  statusLabel: string;
  tone: ProviderTone;
  description?: string;
  showManageModels?: boolean;
}

interface ProviderConfigEntry {
  id: ProviderId;
  label: string;
  kind: 'cloud' | 'local';
}

const PROVIDERS: ProviderConfigEntry[] = [
  { id: 'openai', label: 'OpenAI', kind: 'cloud' },
  { id: 'anthropic', label: 'Anthropic', kind: 'cloud' },
  { id: 'groq', label: 'Groq', kind: 'cloud' },
  { id: 'jarvis', label: 'Jarvis', kind: 'local' },
];

const toneToBadgeStatus: Record<ProviderTone, 'success' | 'warning' | 'error'> = {
  online: 'success',
  warning: 'warning',
  error: 'error',
};

const toneToTagColor: Record<ProviderTone, string> = {
  online: 'success',
  warning: 'orange',
  error: 'volcano',
};

const toneToDescriptionTone: Record<ProviderTone, 'success' | 'secondary' | 'danger'> = {
  online: 'success',
  warning: 'secondary',
  error: 'danger',
};

const mapPresenceStatus = (
  presence?: AgentPresenceEntry,
): Pick<ProviderCardState, 'tone' | 'statusLabel' | 'description'> => {
  if (!presence) {
    return {
      tone: 'warning',
      statusLabel: 'Comprobando',
      description: 'Verificando disponibilidad del proveedor.',
    };
  }

  switch (presence.status) {
    case 'online':
      return {
        tone: 'online',
        statusLabel: 'Operativo',
        description: presence.message ?? 'Proveedor operativo.',
      };
    case 'loading':
      return {
        tone: 'warning',
        statusLabel: 'Inicializando',
        description: presence.message ?? 'Inicializando proveedor.',
      };
    case 'offline':
      return {
        tone: 'warning',
        statusLabel: 'Sin respuesta',
        description: presence.message ?? 'El proveedor no responde en este momento.',
      };
    case 'error':
      return {
        tone: 'error',
        statusLabel: 'Error',
        description: presence.message ?? 'Revisa la configuración del proveedor.',
      };
    default:
      return {
        tone: 'warning',
        statusLabel: 'Comprobando',
        description: presence.message,
      };
  }
};

const buildCloudProviderState = (
  config: ProviderConfigEntry,
  agents: AgentDefinition[],
  presenceMap: Map<string, AgentPresenceEntry>,
): ProviderCardState => {
  if (!agents.length) {
    return {
      id: config.id,
      label: config.label,
      modelLabel: 'Sin modelo configurado',
      tone: 'error',
      statusLabel: 'Sin agente',
      description: 'Añade este proveedor desde los ajustes globales.',
    };
  }

  const activeAgent = agents.find(agent => agent.active) ?? agents[0];
  const modelLabel = activeAgent.name ?? activeAgent.model ?? 'Sin modelo configurado';

  if (!activeAgent.active) {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'error',
      statusLabel: 'Desactivado',
      description: 'Activa el agente para utilizar este proveedor en las conversaciones.',
    };
  }

  if (activeAgent.status === 'Sin clave') {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'error',
      statusLabel: 'Sin credenciales',
      description: 'Añade tu API key en los ajustes globales para activar este proveedor.',
    };
  }

  if (activeAgent.status === 'Cargando') {
    return {
      id: config.id,
      label: config.label,
      modelLabel,
      tone: 'warning',
      statusLabel: 'Inicializando',
      description: 'El proveedor está completando su arranque.',
    };
  }

  const presenceState = mapPresenceStatus(presenceMap.get(activeAgent.id));

  return {
    id: config.id,
    label: config.label,
    modelLabel,
    tone: presenceState.tone,
    statusLabel: presenceState.statusLabel,
    description:
      presenceState.tone === 'online'
        ? presenceState.description ?? 'Proveedor operativo.'
        : presenceState.description,
  };
};

const buildJarvisProviderState = (
  agents: AgentDefinition[],
  presenceMap: Map<string, AgentPresenceEntry>,
): ProviderCardState => {
  if (!agents.length) {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel: 'Sin modelo configurado',
      tone: 'error',
      statusLabel: 'Sin modelos',
      description: 'Instala un modelo local en el gestor para habilitar Jarvis.',
      showManageModels: true,
    };
  }

  const activeLocal = agents.find(agent => agent.active) ?? null;
  const fallback = activeLocal ?? agents[0];
  const modelLabel = fallback?.name ?? fallback?.model ?? 'Sin modelo configurado';

  if (!activeLocal) {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Sin modelo activo',
      description: 'Activa un modelo local desde el gestor para utilizar Jarvis.',
      showManageModels: true,
    };
  }

  if (activeLocal.status === 'Cargando') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Inicializando',
      description: 'Jarvis está preparando el runtime local.',
      showManageModels: true,
    };
  }

  if (activeLocal.status === 'Inactivo') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'warning',
      statusLabel: 'Runtime detenido',
      description: 'Inicia el runtime local para volver a usar Jarvis.',
      showManageModels: true,
    };
  }

  if (activeLocal.status !== 'Disponible') {
    return {
      id: 'jarvis',
      label: 'Jarvis',
      modelLabel,
      tone: 'error',
      statusLabel: activeLocal.status,
      description: 'Jarvis no está disponible. Revisa la configuración local.',
      showManageModels: true,
    };
  }

  const presenceState = mapPresenceStatus(presenceMap.get(activeLocal.id));

  return {
    id: 'jarvis',
    label: 'Jarvis',
    modelLabel,
    tone: presenceState.tone,
    statusLabel: presenceState.statusLabel,
    description:
      presenceState.tone === 'online'
        ? presenceState.description ?? 'Jarvis está listo para colaborar.'
        : presenceState.description ?? 'Revisa el runtime local si persisten los problemas.',
    showManageModels: presenceState.tone !== 'online',
  };
};

const { Sider } = Layout;
const { Title, Text } = Typography;

export const SidePanel: React.FC<SidePanelProps> = ({
  onOpenGlobalSettings,
  onOpenModelManager,
  position = 'right',
  width = 320,
  variant = 'auto',
}) => {
  const { agents } = useAgents();
  const apiKeys = useMemo(() => {
    const keys: Record<string, string> = {};
    agents.forEach(agent => {
      if (agent.kind === 'cloud' && agent.apiKey) {
        keys[agent.provider.toLowerCase()] = agent.apiKey;
      }
    });
    return keys;
  }, [agents]);

  const { presenceMap, refresh } = useAgentPresence(agents, apiKeys);
  const screens = Grid.useBreakpoint();
  const isMobileBreakpoint = !screens.lg;
  const isMobile = variant === 'mobile' ? true : variant === 'desktop' ? false : isMobileBreakpoint;

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    if (isMobile) {
      setCollapsed(false);
    } else {
      setDrawerOpen(false);
      setCollapsed(!screens.xl);
    }
  }, [isMobile, screens.xl]);

  const groupedAgents = useMemo(() => {
    const groups: Record<ProviderId, AgentDefinition[]> = {
      openai: [],
      anthropic: [],
      groq: [],
      jarvis: [],
    };

    agents.forEach(agent => {
      if (agent.kind === 'local') {
        groups.jarvis.push(agent);
        return;
      }

      const providerKey = agent.provider.toLowerCase();
      if (providerKey === 'openai') {
        groups.openai.push(agent);
      } else if (providerKey === 'anthropic') {
        groups.anthropic.push(agent);
      } else if (providerKey === 'groq') {
        groups.groq.push(agent);
      }
    });

    return groups;
  }, [agents]);

  const providerCards = useMemo<ProviderCardState[]>(
    () =>
      PROVIDERS.map(config =>
        config.kind === 'local'
          ? buildJarvisProviderState(groupedAgents[config.id], presenceMap)
          : buildCloudProviderState(config, groupedAgents[config.id], presenceMap),
      ),
    [groupedAgents, presenceMap],
  );

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchDeltaX.current = 0;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) {
      return;
    }

    const currentX = event.touches[0]?.clientX ?? touchStartX.current;
    const delta = currentX - touchStartX.current;
    touchDeltaX.current = delta;

    const openGesture = position === 'left' ? delta > 60 : delta < -60;
    const closeGesture = position === 'left' ? delta < -60 : delta > 60;

    if (!drawerOpen && openGesture) {
      setDrawerOpen(true);
    }

    if (drawerOpen && closeGesture) {
      setDrawerOpen(false);
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  const handleToggleCollapsed = () => {
    setCollapsed(previous => !previous);
  };

  const panelContent = (
    <div className="sidepanel-content" role="region" aria-labelledby="agent-status-heading">
      <header className="sidepanel-header">
        <div className="sidepanel-heading">
          <Title level={4} id="agent-status-heading">
            Estado de agentes
          </Title>
          <Text type="secondary">
            Monitoriza la disponibilidad de tus proveedores conectados y del runtime local.
          </Text>
        </div>
        <Tooltip title="Gestionar credenciales">
          <Button
            aria-label="Abrir ajustes globales"
            icon={<SettingOutlined />}
            onClick={onOpenGlobalSettings}
            type="text"
            shape="circle"
          />
        </Tooltip>
      </header>

      <List
        className="sidepanel-provider-list"
        itemLayout="vertical"
        dataSource={providerCards}
        renderItem={entry => (
          <List.Item key={entry.id} className={`sidepanel-provider-item tone-${entry.tone}`} role="listitem">
            <article
              className="sidepanel-provider-card"
              aria-label={`${entry.label}: ${entry.statusLabel} · ${entry.modelLabel}`}
              data-testid={`provider-card-${entry.id}`}
            >
              <Space align="start" className="sidepanel-provider-card__header" direction="horizontal">
                <Badge status={toneToBadgeStatus[entry.tone]} />
                <div className="sidepanel-provider-card__identity">
                  <Title level={5} className="sidepanel-provider-card__name">
                    {entry.label}
                  </Title>
                  <Tag color="default" bordered={false} icon={<DatabaseOutlined />}>
                    {entry.modelLabel}
                  </Tag>
                </div>
                <Tag color={toneToTagColor[entry.tone]} className="sidepanel-provider-card__state">
                  {entry.statusLabel}
                </Tag>
              </Space>
              {entry.description && (
                <Text className={`sidepanel-provider-card__description is-${toneToDescriptionTone[entry.tone]}`}>
                  {entry.description}
                </Text>
              )}
              {entry.showManageModels && (
                <div className="sidepanel-provider-card__actions">
                  <Button type="link" onClick={onOpenModelManager} size="small">
                    Gestionar modelos
                  </Button>
                </div>
              )}
            </article>
          </List.Item>
        )}
      />

      <Space className="sidepanel-actions" wrap>
        <Button
          type="default"
          icon={<ReloadOutlined />}
          onClick={() => void refresh()}
          aria-label="Actualizar estado de agentes"
        >
          Actualizar estado
        </Button>
        <Button type="primary" onClick={onOpenGlobalSettings} icon={<SettingOutlined />}>
          Gestionar credenciales
        </Button>
      </Space>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Button
          className={`sidepanel-mobile-trigger sidepanel-mobile-trigger--${position}`}
          type="primary"
          shape="circle"
          icon={<MenuUnfoldOutlined />}
          aria-label="Abrir panel de agentes"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        />
        <Drawer
          placement={position}
          width={Math.max(width, 280)}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          className="sidepanel-drawer"
          destroyOnClose={false}
          maskClosable
          contentWrapperStyle={{ touchAction: 'pan-y' }}
        >
          <div
            className="sidepanel-drawer__content"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="sidepanel-drawer__header">
              <Button
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar panel de agentes"
              />
              <Title level={4} className="sidepanel-drawer__title">
                Panel de agentes
              </Title>
            </div>
            {panelContent}
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <Sider
      width={Math.max(width, 280)}
      collapsedWidth={72}
      collapsed={collapsed}
      onCollapse={setCollapsed}
      trigger={null}
      theme="dark"
      className={`sidepanel-sider sidepanel-sider--${position} ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
      role="complementary"
      aria-label="Panel de agentes"
    >
      <div className="sidepanel-sider__inner">
        <div className="sidepanel-sider__toolbar">
          <Tooltip title={collapsed ? 'Expandir panel' : 'Colapsar panel'}>
            <Button
              type="text"
              shape="circle"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={handleToggleCollapsed}
              aria-label={collapsed ? 'Expandir panel de agentes' : 'Colapsar panel de agentes'}
              aria-expanded={!collapsed}
            />
          </Tooltip>
        </div>
        <div className="sidepanel-sider__scroll" data-collapsed={collapsed}>
          {panelContent}
        </div>
      </div>
    </Sider>
  );
};

export default SidePanel;
