import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Grid, Layout, Space, Typography, notification } from 'antd';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar, TopbarBreadcrumb, TopbarContextOption } from './components/chat/ChatTopBar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { ConversationStatsModal } from './components/chat/ConversationStatsModal';
import { RepoStudio } from './components/repo/RepoStudio';
import { CodeCanvas } from './components/code/CodeCanvas';
import { AgentProvider, useAgents } from './core/agents/AgentContext';
import { useAgentPresence } from './core/agents/presence';
import { MessageProvider, useMessages } from './core/messages/MessageContext';
import { RepoWorkflowProvider } from './core/codex';
import { ApiKeySettings, GlobalSettings, ModelPreferences } from './types/globalSettings';
import {
  DEFAULT_GLOBAL_SETTINGS,
  loadGlobalSettings,
  loadGlobalSettingsFromUserData,
  saveGlobalSettings,
} from './utils/globalSettings';
import { ChatActorFilter } from './types/chat';
import { PluginHostProvider } from './core/plugins/PluginHostProvider';
import { GlobalSettingsDialog } from './components/settings/GlobalSettingsDialog';
import { OverlayModal } from './components/common/OverlayModal';
import { PluginManagerModal } from './components/settings/PluginManagerModal';
import { McpManagerModal } from './components/settings/McpManagerModal';
import { ProjectProvider } from './core/projects/ProjectContext';
import { ModelManagerModal } from './components/models/ModelManagerModal';
import { JarvisCoreProvider } from './core/jarvis/JarvisCoreContext';
import { TaskActivityPanel } from './components/layout/TaskActivityPanel';
import { ResourceTree } from './components/layout/ResourceTree';
import { ProviderStatus } from './components/layout/ProviderStatus';
import { QuickActions } from './components/layout/QuickActions';
import { TaskDock } from './components/layout/TaskDock';
import { useJarvisCore } from './core/jarvis/JarvisCoreContext';
import { ProSectionCard } from './components/pro';
import { AgentQuickConfigDrawer } from './components/agents/AgentQuickConfigDrawer';
import { ModelQuickConfigDrawer } from './components/models/ModelQuickConfigDrawer';

const { Content, Footer, Sider } = Layout;

type WorkspaceTabKey = 'chat' | 'feed' | 'details';

const WORKSPACE_TAB_LABELS: Record<WorkspaceTabKey, string> = {
  chat: 'Conversación',
  feed: 'Actividad',
  details: 'Detalles',
};

interface AppContentProps {
  apiKeys: ApiKeySettings;
  settings: GlobalSettings;
  onApiKeyChange: (provider: string, value: string) => void;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
}

const AppContent: React.FC<AppContentProps> = ({
  apiKeys,
  settings,
  onApiKeyChange,
  onSettingsChange,
}) => {
  const { agents, activeAgents } = useAgents();
  const { pendingResponses, pendingActions, sharedMessageLog, orchestrationTraces } = useMessages();
  const { presenceMap, summary: presenceSummary, refresh } = useAgentPresence(agents, apiKeys);
  const { runtimeStatus, uptimeMs } = useJarvisCore();
  const [actorFilter, setActorFilter] = useState<ChatActorFilter>('all');
  const [activeView, setActiveView] = useState<'chat' | 'repo' | 'canvas'>('chat');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabKey>('chat');
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isPluginsOpen, setPluginsOpen] = useState(false);
  const [isMcpOpen, setMcpOpen] = useState(false);
  const [isStatsOpen, setStatsOpen] = useState(false);
  const [isModelManagerOpen, setModelManagerOpen] = useState(false);
  const [isAgentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [isModelQuickOpen, setModelQuickOpen] = useState(false);
  const [isNavDrawerOpen, setNavDrawerOpen] = useState(false);
  const [isSiderCollapsed, setSiderCollapsed] = useState(
    settings.workspacePreferences.sidePanel.collapsed,
  );
  const [activeContext, setActiveContext] = useState<string>('workspace');
  const [notificationApi, contextHolder] = notification.useNotification();
  const screens = Grid.useBreakpoint();

  const handleModelStorageDirChange = useCallback(
    (nextPath: string | null) => {
      onSettingsChange(prev => ({
        ...prev,
        modelPreferences: {
          ...prev.modelPreferences,
          storageDir: nextPath,
        },
      }));
    },
    [onSettingsChange],
  );

  useEffect(() => {
    setSiderCollapsed(settings.workspacePreferences.sidePanel.collapsed);
  }, [settings.workspacePreferences.sidePanel.collapsed]);

  const sidePanelPosition = settings.workspacePreferences.sidePanel.position;
  const showDesktopSidebar = Boolean(screens.xl);
  const siderWidth = Math.max(settings.workspacePreferences.sidePanel.width, 280);

  const shellClassName = useMemo(() => {
    const mode = showDesktopSidebar ? 'is-desktop' : 'is-mobile';
    const collapseState = isSiderCollapsed ? 'sider-collapsed' : 'sider-expanded';
    return `proxmox-shell sidebar-${sidePanelPosition} ${mode} ${collapseState}`;
  }, [showDesktopSidebar, sidePanelPosition, isSiderCollapsed]);

  useEffect(() => {
    if (showDesktopSidebar) {
      setNavDrawerOpen(false);
    }
  }, [showDesktopSidebar]);

  const contextOptions = useMemo<TopbarContextOption[]>(
    () => [
      {
        value: 'workspace',
        label: 'Workspace · Operaciones',
        description: 'Flujos de conversación y coordinación de tareas.',
      },
      {
        value: 'cluster',
        label: 'Cluster · JungleMonk',
        description: 'Supervisión del clúster y estado de agentes.',
      },
      {
        value: 'analytics',
        label: 'Insights · Observabilidad',
        description: 'Panel de métricas y registros de actividad.',
      },
    ],
    [],
  );

  const handleContextChange = useCallback(
    (value: string) => {
      setActiveContext(value);
      const selected = contextOptions.find(option => option.value === value);
      notificationApi.info({
        message: 'Contexto actualizado',
        description:
          selected?.description ?? `Contexto ${selected?.label ?? value} en uso`,
        placement: 'bottomRight',
      });
    },
    [contextOptions, notificationApi],
  );

  const breadcrumbs = useMemo<TopbarBreadcrumb[]>(() => {
    const contextLabel =
      contextOptions.find(option => option.value === activeContext)?.label ?? activeContext;
    const items: TopbarBreadcrumb[] = [
      { key: 'home', title: 'JungleMonk.AI' },
      { key: `context-${activeContext}`, title: contextLabel },
    ];

    switch (activeView) {
      case 'chat':
        items.push({ key: 'view-chat', title: 'Workspace colaborativo' });
        items.push({ key: `workspace-tab-${activeWorkspaceTab}`, title: WORKSPACE_TAB_LABELS[activeWorkspaceTab] });
        break;
      case 'repo':
        items.push({ key: 'view-repo', title: 'Repositorio' });
        break;
      case 'canvas':
        items.push({ key: 'view-canvas', title: 'Code canvas' });
        break;
      default:
        break;
    }

    return items;
  }, [activeContext, activeView, activeWorkspaceTab, contextOptions]);

  const handleSiderCollapse = useCallback(
    (collapsed: boolean, type: 'clickTrigger' | 'responsive' = 'clickTrigger') => {
      setSiderCollapsed(collapsed);
      onSettingsChange(prev => ({
        ...prev,
        workspacePreferences: {
          ...prev.workspacePreferences,
          sidePanel: {
            ...prev.workspacePreferences.sidePanel,
            collapsed,
          },
        },
      }));

      if (type !== 'responsive') {
        notificationApi.info({
          message: collapsed ? 'Panel de navegación colapsado' : 'Panel de navegación expandido',
          description: 'Puedes alternar con Ctrl+Shift+B en cualquier momento.',
          placement: 'bottomRight',
        });
      }
    },
    [notificationApi, onSettingsChange],
  );

  const handleToggleSider = useCallback(() => {
    handleSiderCollapse(!isSiderCollapsed);
  }, [handleSiderCollapse, isSiderCollapsed]);

  const handleOpenAgentDrawer = useCallback(
    (source: 'shortcut' | 'ui' = 'ui') => {
      setAgentDrawerOpen(true);
      notificationApi.success({
        message: 'Panel de agentes',
        description:
          source === 'shortcut'
            ? 'Atajo Ctrl+Shift+A ejecutado correctamente.'
            : 'Configuración rápida disponible.',
        placement: 'bottomRight',
      });
    },
    [notificationApi],
  );

  const handleOpenModelQuick = useCallback(
    (source: 'shortcut' | 'ui' = 'ui') => {
      setModelQuickOpen(true);
      notificationApi.success({
        message: 'Modelos disponibles',
        description:
          source === 'shortcut'
            ? 'Atajo Ctrl+Shift+M ejecutado correctamente.'
            : 'Acceso rápido al panel de modelos.',
        placement: 'bottomRight',
      });
    },
    [notificationApi],
  );

  const handleOpenSettingsModal = useCallback(
    (source: 'shortcut' | 'ui' = 'ui') => {
      setSettingsOpen(true);
      notificationApi.info({
        message: 'Ajustes globales',
        description:
          source === 'shortcut'
            ? 'Atajo Ctrl+Shift+S activado.'
            : 'Preferencias disponibles para ajustar.',
        placement: 'bottomRight',
      });
    },
    [notificationApi],
  );

  const handleOpenPluginsModal = useCallback(
    (source: 'shortcut' | 'ui' = 'ui') => {
      setPluginsOpen(true);
      notificationApi.info({
        message: 'Gestor de plugins',
        description:
          source === 'shortcut'
            ? 'Atajo Ctrl+Shift+P activado.'
            : 'Panel de plugins abierto.',
        placement: 'bottomRight',
      });
    },
    [notificationApi],
  );

  const handleModelPreferencesQuickUpdate = useCallback(
    (next: ModelPreferences) => {
      onSettingsChange(prev => ({
        ...prev,
        modelPreferences: next,
      }));
    },
    [onSettingsChange],
  );

  const handleKeyboardShortcuts = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();
      switch (key) {
        case 'a':
          event.preventDefault();
          handleOpenAgentDrawer('shortcut');
          break;
        case 'm':
          event.preventDefault();
          handleOpenModelQuick('shortcut');
          break;
        case 's':
          event.preventDefault();
          handleOpenSettingsModal('shortcut');
          break;
        case 'p':
          event.preventDefault();
          handleOpenPluginsModal('shortcut');
          break;
        case 'b':
          event.preventDefault();
          if (showDesktopSidebar) {
            handleToggleSider();
          } else {
            setNavDrawerOpen(prev => !prev);
          }
          notificationApi.info({
            message: 'Navegación',
            description: 'Menú lateral alternado (Ctrl+Shift+B).',
            placement: 'bottomRight',
          });
          break;
        default:
          break;
      }
    },
    [
      handleOpenAgentDrawer,
      handleOpenModelQuick,
      handleOpenPluginsModal,
      handleOpenSettingsModal,
      handleToggleSider,
      notificationApi,
      showDesktopSidebar,
    ],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => handleKeyboardShortcuts(event);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleKeyboardShortcuts]);

  const handleTreeSelection = useCallback(
    (key: string) => {
      if (!key) {
        return;
      }

      switch (key) {
        case 'workspace-chat':
          setActiveView('chat');
          setActiveWorkspaceTab('chat');
          break;
        case 'workspace-feed':
          setActiveView('chat');
          setActiveWorkspaceTab('feed');
          break;
        case 'workspace-details':
          setActiveView('chat');
          setActiveWorkspaceTab('details');
          break;
        case 'workspace-repo':
          setActiveView('repo');
          break;
        case 'workspace-canvas':
          setActiveView('canvas');
          break;
        case 'agents':
        case 'agents-active':
        case 'agents-archived':
          setSettingsOpen(true);
          break;
        case 'models':
        case 'models-local':
        case 'models-cloud':
          setModelManagerOpen(true);
          break;
        case 'projects':
        case 'projects-active':
        case 'projects-archive':
          setActiveView('repo');
          break;
        case 'preferences':
        case 'preferences-routing':
        case 'preferences-workspace':
        case 'settings':
          setSettingsOpen(true);
          break;
        case 'plugins':
          setPluginsOpen(true);
          break;
        case 'mcp':
          setMcpOpen(true);
          break;
        default:
          break;
      }
      if (!showDesktopSidebar) {
        setNavDrawerOpen(false);
      }
    },
    [setPluginsOpen, setSettingsOpen, setModelManagerOpen, setMcpOpen, showDesktopSidebar],
  );

  const handleTreeAction = useCallback(
    (key: string, action: string) => {
      if (action === 'open') {
        handleTreeSelection(key);
        return;
      }

      switch (key) {
        case 'agents':
        case 'agents-active':
        case 'agents-archived':
          if (action === 'refresh') {
            refresh().catch(() => undefined);
          }
          break;
        default:
          break;
      }
    },
    [handleTreeSelection, refresh],
  );

  const renderActiveSurface = useCallback(() => {
    if (activeView === 'repo') {
      return (
        <ProSectionCard
          className="proxmox-surface-card"
          title="Explorador de repositorio"
          aria-label="Explorador de repositorio"
        >
          <RepoStudio />
        </ProSectionCard>
      );
    }

    if (activeView === 'canvas') {
      return (
        <ProSectionCard className="proxmox-surface-card" title="Code canvas" aria-label="Code canvas">
          <CodeCanvas />
        </ProSectionCard>
      );
    }

    return (
      <ProSectionCard className="proxmox-surface-card" title="Área de conversación" aria-label="Área de conversación">
        <ChatWorkspace
          actorFilter={actorFilter}
          settings={settings}
          onSettingsChange={onSettingsChange}
          presenceMap={presenceMap}
          onActorFilterChange={setActorFilter}
          activeTab={activeWorkspaceTab}
          onTabChange={nextTab => setActiveWorkspaceTab(nextTab)}
        />
      </ProSectionCard>
    );
  }, [activeView, actorFilter, activeWorkspaceTab, onSettingsChange, presenceMap, settings]);

  const renderNavigationContent = (variant: 'default' | 'compact' = 'default') => (
    <div
      className={`proxmox-sider__content proxmox-sider__content--${variant}`}
      style={variant === 'compact' ? { maxHeight: '100%', overflowY: 'auto' } : undefined}
    >
      <ProviderStatus
        summary={presenceSummary}
        presenceMap={presenceMap}
        pendingResponses={pendingResponses}
        runtimeStatus={runtimeStatus}
        uptimeMs={uptimeMs}
        onRefresh={() => void refresh()}
      />
      <QuickActions
        onOpenSettings={() => handleOpenSettingsModal('ui')}
        onOpenPlugins={() => handleOpenPluginsModal('ui')}
        onOpenMcp={() => setMcpOpen(true)}
        onOpenModelManager={() => setModelManagerOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onRefreshPresence={() => void refresh()}
        onOpenAgentQuickConfig={() => handleOpenAgentDrawer('ui')}
        onOpenModelQuickConfig={() => handleOpenModelQuick('ui')}
      />
      <div className="proxmox-sider__tree">
        <ResourceTree
          activeView={activeView}
          activeWorkspaceTab={activeWorkspaceTab}
          onNodeSelect={handleTreeSelection}
          onNodeAction={handleTreeAction}
          variant={variant}
          presenceSummary={presenceSummary}
          pendingResponses={pendingResponses}
        />
      </div>
    </div>
  );

  const infoPanelContent = (
    <ProSectionCard className="proxmox-info-panel" title="Monitor de actividad" aria-label="Monitor de actividad">
      <TaskActivityPanel pendingResponses={pendingResponses} presenceSummary={presenceSummary} />
    </ProSectionCard>
  );

  const footerTimestamp = useMemo(() => {
    return new Date().toLocaleString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div className={shellClassName}>
      {contextHolder}
      <Layout hasSider className="proxmox-layout">
        {showDesktopSidebar ? (
          <Sider
            width={siderWidth}
            className="proxmox-sider"
            theme="dark"
            collapsible
            collapsed={isSiderCollapsed}
            collapsedWidth={0}
            breakpoint="xl"
            trigger={null}
            onCollapse={(collapsed, type) => handleSiderCollapse(collapsed, type)}
            onBreakpoint={broken => {
              if (broken) {
                handleSiderCollapse(true, 'responsive');
              }
            }}
            role="navigation"
            aria-label="Árbol de recursos"
          >
            <div className="proxmox-sider__brand">
              <Typography.Title level={4}>JungleMonk Cluster</Typography.Title>
              <Typography.Text type="secondary">Recursos coordinados</Typography.Text>
            </div>
            {renderNavigationContent()}
          </Sider>
        ) : (
          <Drawer
            placement="left"
            width={Math.max(280, Math.min(360, siderWidth))}
            open={isNavDrawerOpen}
            onClose={() => setNavDrawerOpen(false)}
            title="Recursos"
            className="proxmox-nav-drawer"
            destroyOnClose={false}
          >
            {renderNavigationContent('compact')}
          </Drawer>
        )}

        <Layout className="proxmox-main">
          <div className="app-header-shell" role="banner">
            <ChatTopBar
              agents={agents}
              presenceSummary={presenceSummary}
              presenceMap={presenceMap}
              activeAgents={activeAgents.length}
              totalAgents={agents.length}
              pendingResponses={pendingResponses}
              activeFilter={actorFilter}
              onFilterChange={setActorFilter}
              onRefreshPresence={() => void refresh()}
              onOpenStats={() => setStatsOpen(true)}
              onOpenGlobalSettings={() => setSettingsOpen(true)}
              onOpenPlugins={() => setPluginsOpen(true)}
              onOpenMcp={() => setMcpOpen(true)}
              onOpenModelManager={() => setModelManagerOpen(true)}
              activeView={activeView}
              onChangeView={view => {
                setActiveView(view);
                if (view === 'chat') {
                  setActiveWorkspaceTab('chat');
                }
              }}
              showNavigationToggle={!showDesktopSidebar}
              onToggleNavigation={() => setNavDrawerOpen(true)}
              breadcrumbs={breadcrumbs}
              contextOptions={contextOptions}
              activeContext={activeContext}
              onContextChange={handleContextChange}
              canToggleSider={showDesktopSidebar}
              isSiderCollapsed={isSiderCollapsed}
              onToggleSider={handleToggleSider}
            />
          </div>

          <Content className="proxmox-content" role="main">
            <div className="proxmox-content-inner">
              <div className="proxmox-workspace">{renderActiveSurface()}</div>
              {infoPanelContent}
            </div>
          </Content>

          <Footer className="proxmox-footer">
            <TaskDock
              pendingResponses={pendingResponses}
              pendingActions={pendingActions}
              sharedMessageLog={sharedMessageLog}
              orchestrationTraces={orchestrationTraces}
              presenceSummary={presenceSummary}
              agents={agents}
            />
            <div className="proxmox-footer__meta">
              <Space size="large">
                <span>JungleMonk.AI · Panel inspirado en Proxmox</span>
                <span>Sesión sincronizada · {footerTimestamp}</span>
              </Space>
            </div>
          </Footer>
        </Layout>
      </Layout>

      <GlobalSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        apiKeys={apiKeys}
        onApiKeyChange={onApiKeyChange}
        onSettingsChange={onSettingsChange}
      />

      <ModelManagerModal
        isOpen={isModelManagerOpen}
        onClose={() => setModelManagerOpen(false)}
        storageDir={settings.modelPreferences.storageDir}
        huggingFacePreferences={settings.modelPreferences.huggingFace}
        onStorageDirChange={handleModelStorageDirChange}
        huggingFaceToken={apiKeys['huggingface']}
      />

      <AgentQuickConfigDrawer open={isAgentDrawerOpen} onClose={() => setAgentDrawerOpen(false)} />

      <ModelQuickConfigDrawer
        open={isModelQuickOpen}
        onClose={() => setModelQuickOpen(false)}
        preferences={settings.modelPreferences}
        onPreferencesChange={handleModelPreferencesQuickUpdate}
      />

      <OverlayModal
        title="Plugins"
        isOpen={isPluginsOpen}
        onClose={() => setPluginsOpen(false)}
      >
        <PluginManagerModal settings={settings} onSettingsChange={onSettingsChange} />
      </OverlayModal>

      <OverlayModal
        title="Perfiles MCP"
        isOpen={isMcpOpen}
        onClose={() => setMcpOpen(false)}
      >
        <McpManagerModal settings={settings} onSettingsChange={onSettingsChange} />
      </OverlayModal>

      <ConversationStatsModal isOpen={isStatsOpen} onClose={() => setStatsOpen(false)} />
    </div>
  );
};

const App: React.FC = () => {
  const initialSettingsRef = useRef<GlobalSettings | null>(null);
  if (!initialSettingsRef.current) {
    initialSettingsRef.current = loadGlobalSettings();
  }

  const resolvedInitialSettings = initialSettingsRef.current ?? DEFAULT_GLOBAL_SETTINGS;

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(resolvedInitialSettings);

  useEffect(() => {
    let cancelled = false;

    const loadFromUserDir = async () => {
      try {
        const persisted = await loadGlobalSettingsFromUserData();
        if (persisted && !cancelled) {
          initialSettingsRef.current = persisted;
          setGlobalSettings(persisted);
        }
      } catch (error) {
        console.warn('No se pudo cargar la configuración global desde el directorio de usuario:', error);
      }
    };

    void loadFromUserDir();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveGlobalSettings(globalSettings);
  }, [globalSettings]);

  const handleApiKeyChange = (provider: string, value: string) => {
    setGlobalSettings(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value,
      },
    }));
  };

  return (
    <PluginHostProvider settings={globalSettings} onSettingsChange={setGlobalSettings}>
      <ProjectProvider settings={globalSettings} onSettingsChange={setGlobalSettings}>
        <AgentProvider
          apiKeys={globalSettings.apiKeys}
          enabledPlugins={globalSettings.enabledPlugins}
          approvedManifests={globalSettings.approvedManifests}
        >
          <JarvisCoreProvider settings={globalSettings} onSettingsChange={setGlobalSettings}>
            <MessageProvider apiKeys={globalSettings.apiKeys}>
              <RepoWorkflowProvider>
                <AppContent
                  apiKeys={globalSettings.apiKeys}
                  settings={globalSettings}
                  onApiKeyChange={handleApiKeyChange}
                  onSettingsChange={setGlobalSettings}
                />
              </RepoWorkflowProvider>
            </MessageProvider>
          </JarvisCoreProvider>
        </AgentProvider>
      </ProjectProvider>
    </PluginHostProvider>
  );
};

export default App;
