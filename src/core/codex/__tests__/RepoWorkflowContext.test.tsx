import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { RepoWorkflowProvider, useRepoWorkflow } from '../RepoWorkflowContext';
import { ProjectProvider } from '../../projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { JarvisCoreContextValue } from '../../jarvis/JarvisCoreContext';

vi.mock('../../agents/AgentContext', () => ({
  useAgents: () => ({
    agents: [],
    activeAgents: [],
    agentMap: new Map(),
    toggleAgent: vi.fn(),
    updateLocalAgentState: vi.fn(),
    assignAgentRole: vi.fn(),
  }),
}));

const mockJarvisCore: JarvisCoreContextValue = {
  connected: false,
  lastError: null,
  activeModel: null,
  downloads: {},
  models: [],
  runtimeStatus: 'offline',
  uptimeMs: null,
  config: DEFAULT_GLOBAL_SETTINGS.jarvisCore,
  baseUrl: '',
  lastHealthMessage: null,
  ensureOnline: vi.fn().mockResolvedValue(undefined),
  refreshModels: vi.fn().mockResolvedValue([]),
  downloadModel: vi.fn().mockResolvedValue({} as unknown),
  activateModel: vi.fn().mockResolvedValue({} as unknown),
  invokeChat: vi.fn().mockResolvedValue({} as unknown),
  launchAction: vi.fn().mockResolvedValue({} as unknown),
};

vi.mock('../../jarvis/JarvisCoreContext', () => ({
  useJarvisCore: () => mockJarvisCore,
}));

const messageTimestamp = new Date().toISOString();

vi.mock('../../messages/MessageContext', () => ({
  useMessages: () => ({
    messages: [
      {
        id: 'msg-1',
        author: 'agent',
        content: 'Analiza la tarea pendiente',
        timestamp: messageTimestamp,
        agentId: 'jarvis',
      },
    ],
    pendingActions: [],
    triggerAction: vi.fn(),
    rejectAction: vi.fn(),
  }),
}));

const ProjectWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = React.useState(() => ({
    ...DEFAULT_GLOBAL_SETTINGS,
    projectProfiles: [
      {
        id: 'toolkit',
        name: 'Toolkit',
        repositoryPath: '/workbench/app',
        defaultBranch: 'develop',
        preferredProvider: 'openai',
        preferredModel: 'gpt-4',
      },
    ],
    activeProjectId: 'toolkit',
  }));

  return (
    <ProjectProvider settings={settings} onSettingsChange={setSettings}>
      <RepoWorkflowProvider>{children}</RepoWorkflowProvider>
    </ProjectProvider>
  );
};

describe('RepoWorkflowContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propaga la configuración del proyecto activo al generar solicitudes', () => {
    const { result } = renderHook(() => useRepoWorkflow(), { wrapper: ProjectWrapper });

    act(() => {
      result.current.queueRequest({ messageId: 'msg-1' });
    });

    const pending = result.current.pendingRequest;
    expect(pending).not.toBeNull();
    expect(pending?.request.context.repositoryPath).toBe('/workbench/app');
    expect(pending?.request.context.branch).toBe('develop');
    expect(pending?.request.context.actor).toBe('openai:gpt-4');
    expect(pending?.remoteName).toBe('origin');
    expect(pending?.status).toBe('error');
    expect(pending?.analysisErrors.length).toBeGreaterThan(0);
  });
});
