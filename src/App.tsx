import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flex, Grid, Layout } from 'antd';
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

interface AppContentProps {
  apiKeys: ApiKeySettings;
  settings: GlobalSettings;
  onApiKeyChange: (provider: string, value: string) => void;
  onSettingsChange: (updater: (previous: GlobalSettings) => GlobalSettings) => void;
}

const { Header, Content, Sider } = Layout;

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
    <Layout className={`app-container sidebar-${sidePanelPosition} ${showDesktopSidebar ? '' : 'is-mobile'}`}>
      <Header className="app-header" role="banner">
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
      </Header>

      <Content className="app-content" role="main">
        {activeView === 'chat' && (
          <>
            <Layout
              className={`app-body sidebar-${sidePanelPosition}`}
              hasSider={showDesktopSidebar}
            >
              {sidePanelPosition === 'left' && showDesktopSidebar && (
                <Sider
                  width={siderWidth}
                  className="app-sidebar"
                  role="complementary"
                  aria-label="Agent configuration"
                >
                  <SidePanel
                    onOpenGlobalSettings={() => setSettingsOpen(true)}
                    onOpenModelManager={() => setModelManagerOpen(true)}
                  />
                </Sider>
              )}

              <Content className="chat-main-container">
                <Flex vertical className="chat-main" gap="large">
                  <ChatWorkspace
                    actorFilter={actorFilter}
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                    presenceMap={presenceMap}
                    onActorFilterChange={setActorFilter}
                  />
                </Flex>
              </Content>

              {sidePanelPosition === 'right' && showDesktopSidebar && (
                <Sider
                  width={siderWidth}
                  className="app-sidebar"
                  role="complementary"
                  aria-label="Agent configuration"
                >
                  <SidePanel
                    onOpenGlobalSettings={() => setSettingsOpen(true)}
                    onOpenModelManager={() => setModelManagerOpen(true)}
                  />
                </Sider>
              )}
            </Layout>

            {!showDesktopSidebar && (
              <div className="app-sidebar-mobile" role="complementary" aria-label="Agent configuration">
                <SidePanel
                  onOpenGlobalSettings={() => setSettingsOpen(true)}
                  onOpenModelManager={() => setModelManagerOpen(true)}
                />
              </div>
            )}
          </>
        )}

        {activeView === 'repo' && (
          <div className="app-body">
            <Flex vertical className="repo-main" gap="large">
              <RepoStudio />
            </Flex>
          </div>
        )}

        {activeView === 'canvas' && (
          <div className="app-body">
            <Flex vertical className="canvas-main" gap="large">
              <CodeCanvas />
            </Flex>
          </div>
        )}
      </Content>

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
    </Layout>
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
