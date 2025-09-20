import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar } from './components/chat/ChatTopBar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SidePanel } from './components/chat/SidePanel';
import { RepoStudio } from './components/repo/RepoStudio';
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
import { PluginSummary } from './components/settings/PluginSummary';
import { McpSummary } from './components/settings/McpSummary';
import { ProjectProvider } from './core/projects/ProjectContext';

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
  const [activeView, setActiveView] = useState<'chat' | 'repo'>('chat');
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isPluginsOpen, setPluginsOpen] = useState(false);
  const [isMcpOpen, setMcpOpen] = useState(false);

  const sidePanelPosition = settings.workspacePreferences.sidePanel.position;

  return (
    <div className="app-container">
      <ChatTopBar
        agents={agents}
        presenceSummary={presenceSummary}
        activeAgents={activeAgents.length}
        totalAgents={agents.length}
        pendingResponses={pendingResponses}
        activeFilter={actorFilter}
        onFilterChange={setActorFilter}
        onRefreshPresence={() => void refresh()}
        onOpenGlobalSettings={() => setSettingsOpen(true)}
        onOpenPlugins={() => setPluginsOpen(true)}
        onOpenMcp={() => setMcpOpen(true)}
        activeView={activeView}
        onChangeView={setActiveView}
      />

      {activeView === 'chat' ? (
        <div className={`app-body sidebar-${sidePanelPosition}`}>
          {sidePanelPosition === 'left' && (
            <aside className="app-sidebar">
              <SidePanel onOpenGlobalSettings={() => setSettingsOpen(true)} />
            </aside>
          )}

          <main className="chat-main">
            <ChatWorkspace actorFilter={actorFilter} />
          </main>

          {sidePanelPosition === 'right' && (
            <aside className="app-sidebar">
              <SidePanel onOpenGlobalSettings={() => setSettingsOpen(true)} />
            </aside>
          )}
        </div>
      ) : (
        <div className="app-body">
          <div className="repo-main">
            <RepoStudio />
          </div>
        </div>
      )}

      <GlobalSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        apiKeys={apiKeys}
        onApiKeyChange={onApiKeyChange}
        onSettingsChange={onSettingsChange}
      />

      <OverlayModal
        title="Plugins"
        isOpen={isPluginsOpen}
        onClose={() => setPluginsOpen(false)}
      >
        <PluginSummary settings={settings} onSettingsChange={onSettingsChange} />
      </OverlayModal>

      <OverlayModal title="Perfiles MCP" isOpen={isMcpOpen} onClose={() => setMcpOpen(false)}>
        <McpSummary settings={settings} />
      </OverlayModal>
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
        </AgentProvider>
      </ProjectProvider>
    </PluginHostProvider>
  );
};

export default App;
