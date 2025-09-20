import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar } from './components/chat/ChatTopBar';
import { ChatStatusBar } from './components/chat/ChatStatusBar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SidePanel } from './components/chat/SidePanel';
import { RepoStudio } from './components/repo/RepoStudio';
import { AgentProvider, useAgents } from './core/agents/AgentContext';
import { useAgentPresence } from './core/agents/presence';
import { MessageProvider, useMessages } from './core/messages/MessageContext';
import { RepoWorkflowProvider } from './core/codex';
import { ApiKeySettings, GlobalSettings, SidePanelPreferences } from './types/globalSettings';
import { DEFAULT_GLOBAL_SETTINGS, loadGlobalSettings, saveGlobalSettings } from './utils/globalSettings';
import { ChatActorFilter } from './types/chat';
import { PluginHostProvider } from './core/plugins/PluginHostProvider';

interface AppContentProps {
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
  panelPreferences: SidePanelPreferences;
  onPanelPreferencesChange: (
    updater: (previous: SidePanelPreferences) => SidePanelPreferences,
  ) => void;
}

const AppContent: React.FC<AppContentProps> = ({
  apiKeys,
  onApiKeyChange,
  panelPreferences,
  onPanelPreferencesChange,
}) => {
  const { agents, activeAgents } = useAgents();
  const { messages, pendingResponses } = useMessages();
  const { presenceMap, summary: presenceSummary, refresh } = useAgentPresence(agents, apiKeys);
  const [actorFilter, setActorFilter] = useState<ChatActorFilter>('all');
  const [activeView, setActiveView] = useState<'chat' | 'repo'>('chat');

  const handlePanelCollapse = useCallback(
    (collapsed: boolean) => {
      onPanelPreferencesChange(previous => ({ ...previous, collapsed }));
    },
    [onPanelPreferencesChange],
  );

  return (
    <div className="app-container">
      <div className="app-mode-switcher">
        <button
          type="button"
          className={activeView === 'chat' ? 'is-active' : ''}
          onClick={() => setActiveView('chat')}
        >
          Conversación
        </button>
        <button
          type="button"
          className={activeView === 'repo' ? 'is-active' : ''}
          onClick={() => setActiveView('repo')}
        >
          Repo Studio
        </button>
      </div>

      {activeView === 'chat' ? (
        <>
          <ChatTopBar
            agents={agents}
            presenceSummary={presenceSummary}
            activeAgents={activeAgents.length}
            totalAgents={agents.length}
            pendingResponses={pendingResponses}
            activeFilter={actorFilter}
            onFilterChange={setActorFilter}
            onRefreshPresence={() => void refresh()}
          />

          <div className="workspace">
            <div className="main-panel">
              <ChatWorkspace
                actorFilter={actorFilter}
                sidePanel={
                  <SidePanel
                    apiKeys={apiKeys}
                    onApiKeyChange={onApiKeyChange}
                    presenceMap={presenceMap}
                    onRefreshAgentPresence={refresh}
                    layout={panelPreferences}
                    onLayoutChange={onPanelPreferencesChange}
                  />
                }
                sidePanelPosition={panelPreferences.position}
                sidePanelWidth={panelPreferences.width}
                isSidePanelCollapsed={panelPreferences.collapsed}
                onSidePanelCollapse={handlePanelCollapse}
              />
            </div>
          </div>

          <ChatStatusBar
            activeAgents={activeAgents.length}
            totalMessages={messages.length}
            pendingResponses={pendingResponses}
          />
        </>
      ) : (
        <div className="workspace">
          <div className="main-panel">
            <RepoStudio />
          </div>
        </div>
      )}
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

  const handlePanelPreferencesChange = useCallback(
    (updater: (previous: SidePanelPreferences) => SidePanelPreferences) => {
      setGlobalSettings(prev => ({
        ...prev,
        workspacePreferences: {
          ...prev.workspacePreferences,
          sidePanel: updater(prev.workspacePreferences.sidePanel),
        },
      }));
    },
    [],
  );

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
      <AgentProvider
        apiKeys={globalSettings.apiKeys}
        enabledPlugins={globalSettings.enabledPlugins}
        approvedManifests={globalSettings.approvedManifests}
      >
        <MessageProvider apiKeys={globalSettings.apiKeys}>
          <RepoWorkflowProvider>
            <AppContent
              apiKeys={globalSettings.apiKeys}
              onApiKeyChange={handleApiKeyChange}
              panelPreferences={globalSettings.workspacePreferences.sidePanel}
              onPanelPreferencesChange={handlePanelPreferencesChange}
            />
          </RepoWorkflowProvider>
        </MessageProvider>
      </AgentProvider>
    </PluginHostProvider>
  );
};

export default App;
