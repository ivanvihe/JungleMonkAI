import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flex, Grid } from 'antd';
import { PageContainer, ProLayout } from '@ant-design/pro-components';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar } from './components/chat/ChatTopBar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SidePanel } from './components/chat/SidePanel';
import { ConversationStatsModal } from './components/chat/ConversationStatsModal';
import { RepoStudio } from './components/repo/RepoStudio';
import { CodeCanvas } from './components/code/CodeCanvas';
import { AgentProvider, useAgents } from './core/agents/AgentContext';
import { useAgentPresence } from './core/agents/presence';
import { MessageProvider, useMessages } from './core/messages/MessageContext';
import { RepoWorkflowProvider } from './core/codex';
import { ApiKeySettings, GlobalSettings } from './types/globalSettings';
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
  const { pendingResponses } = useMessages();
  const { presenceMap, summary: presenceSummary, refresh } = useAgentPresence(agents, apiKeys);
  const [actorFilter, setActorFilter] = useState<ChatActorFilter>('all');
  const [activeView, setActiveView] = useState<'chat' | 'repo' | 'canvas'>('chat');
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isPluginsOpen, setPluginsOpen] = useState(false);
  const [isMcpOpen, setMcpOpen] = useState(false);
  const [isStatsOpen, setStatsOpen] = useState(false);
  const [isModelManagerOpen, setModelManagerOpen] = useState(false);
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

  const sidePanelPosition = settings.workspacePreferences.sidePanel.position;
  const showDesktopSidebar = Boolean(screens.lg);
  const siderWidth = Math.max(settings.workspacePreferences.sidePanel.width, 280);

  return (
    <div className={`app-pro-shell sidebar-${sidePanelPosition} ${showDesktopSidebar ? '' : 'is-mobile'}`}>
      <ProLayout
        className="app-pro-layout"
        layout="mix"
        contentWidth="Fluid"
        fixedHeader
        fixSiderbar
        siderWidth={showDesktopSidebar ? siderWidth : 0}
        logo={false}
        title={false}
        location={{ pathname: '/' }}
        route={{ routes: [] }}
        menuDataRender={() => []}
        menuFooterRender={false}
        menuHeaderRender={false}
        suppressSiderWhenMenuEmpty
        breadcrumbRender={false}
        footerRender={false}
        token={{
          header: {
            colorBgHeader: 'var(--shell-header-bg)',
            colorTextMenu: 'var(--color-text-base)',
            colorTextMenuSecondary: 'var(--color-text-muted)',
            colorBgMenuItemHover: 'transparent',
          },
          sider: {
            colorBgCollapsedButton: 'var(--shell-header-bg)',
            colorMenuBackground: 'transparent',
            colorBgMenuItemSelected: 'rgba(255, 255, 255, 0.08)',
            colorTextMenu: 'var(--color-text-muted)',
            colorTextMenuSelected: 'var(--color-primary)',
          },
          pageContainer: {
            colorBgPageContainer: 'transparent',
            paddingInlinePageContainerContent: 0,
            paddingBlockPageContainerContent: 0,
          },
        }}
        headerRender={() => (
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
              onChangeView={setActiveView}
            />
          </div>
        )}
        menuRender={() =>
          showDesktopSidebar ? (
            <div className="app-sider-shell" role="complementary" aria-label="Panel de agentes">
              <SidePanel
                position={sidePanelPosition}
                width={siderWidth}
                variant="desktop"
                onOpenGlobalSettings={() => setSettingsOpen(true)}
                onOpenModelManager={() => setModelManagerOpen(true)}
              />
            </div>
          ) : null
        }
      >
        <PageContainer className="app-page-container" header={false}>
          <div className="app-main-content" role="main">
            {activeView === 'chat' && (
              <div className="app-surface-card" role="region" aria-label="Área de conversación">
                <Flex vertical gap="large">
                  <ChatWorkspace
                    actorFilter={actorFilter}
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                    presenceMap={presenceMap}
                    onActorFilterChange={setActorFilter}
                  />
                </Flex>
              </div>
            )}

            {activeView === 'repo' && (
              <div className="app-surface-card" role="region" aria-label="Explorador de repositorio">
                <Flex vertical gap="large">
                  <RepoStudio />
                </Flex>
              </div>
            )}

            {activeView === 'canvas' && (
              <div className="app-surface-card" role="region" aria-label="Code canvas">
                <Flex vertical gap="large">
                  <CodeCanvas />
                </Flex>
              </div>
            )}
          </div>

          <div className="task-panel-wrapper">
            <TaskActivityPanel
              pendingResponses={pendingResponses}
              presenceSummary={presenceSummary}
            />
          </div>

          {!showDesktopSidebar && (
            <div
              className="app-mobile-sidebar-container"
              role="complementary"
              aria-label="Configuración de agentes"
            >
              <SidePanel
                position={sidePanelPosition}
                width={siderWidth}
                variant="mobile"
                onOpenGlobalSettings={() => setSettingsOpen(true)}
                onOpenModelManager={() => setModelManagerOpen(true)}
              />
            </div>
          )}
        </PageContainer>
      </ProLayout>

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
