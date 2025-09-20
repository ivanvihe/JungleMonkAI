import React, { useEffect, useRef, useState } from 'react';
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
import { ApiKeySettings, GlobalSettings } from './types/globalSettings';
import { DEFAULT_GLOBAL_SETTINGS, loadGlobalSettings, saveGlobalSettings } from './utils/globalSettings';
import { ChatActorFilter } from './types/chat';

interface AppContentProps {
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: string, value: string) => void;
}

const AppContent: React.FC<AppContentProps> = ({ apiKeys, onApiKeyChange }) => {
  const { agents, activeAgents } = useAgents();
  const { messages, pendingResponses } = useMessages();
  const { presenceMap, summary: presenceSummary, refresh } = useAgentPresence(agents, apiKeys);
  const [actorFilter, setActorFilter] = useState<ChatActorFilter>('all');
  const [activeView, setActiveView] = useState<'chat' | 'repo'>('chat');

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
                  />
                }
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
    <AgentProvider apiKeys={globalSettings.apiKeys}>
      <MessageProvider apiKeys={globalSettings.apiKeys}>
        <RepoWorkflowProvider>
          <AppContent apiKeys={globalSettings.apiKeys} onApiKeyChange={handleApiKeyChange} />
        </RepoWorkflowProvider>
      </MessageProvider>
    </AgentProvider>
  );
};

export default App;
