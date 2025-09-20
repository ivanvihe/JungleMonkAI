import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import './AppLayout.css';
import './components/chat/ChatInterface.css';
import { ChatTopBar } from './components/chat/ChatTopBar';
import { ChatStatusBar } from './components/chat/ChatStatusBar';
import { ChatWorkspace } from './components/chat/ChatWorkspace';
import { SidePanel } from './components/chat/SidePanel';
import { AgentProvider, useAgents } from './core/agents/AgentContext';
import { MessageProvider, useMessages } from './core/messages/MessageContext';
import { ApiKeySettings, GlobalSettings, SupportedProvider } from './types/globalSettings';
import { DEFAULT_GLOBAL_SETTINGS, loadGlobalSettings, saveGlobalSettings } from './utils/globalSettings';

interface AppContentProps {
  apiKeys: ApiKeySettings;
  onApiKeyChange: (provider: SupportedProvider, value: string) => void;
}

const AppContent: React.FC<AppContentProps> = ({ apiKeys, onApiKeyChange }) => {
  const { agents, activeAgents } = useAgents();
  const { messages, pendingResponses } = useMessages();

  return (
    <div className="app-container">
      <ChatTopBar activeAgents={activeAgents.length} totalAgents={agents.length} pendingResponses={pendingResponses} />

      <div className="workspace">
        <div className="main-panel">
          <ChatWorkspace sidePanel={<SidePanel apiKeys={apiKeys} onApiKeyChange={onApiKeyChange} />} />
        </div>
      </div>

      <ChatStatusBar
        activeAgents={activeAgents.length}
        totalMessages={messages.length}
        pendingResponses={pendingResponses}
      />
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

  const handleApiKeyChange = (provider: SupportedProvider, value: string) => {
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
        <AppContent apiKeys={globalSettings.apiKeys} onApiKeyChange={handleApiKeyChange} />
      </MessageProvider>
    </AgentProvider>
  );
};

export default App;
