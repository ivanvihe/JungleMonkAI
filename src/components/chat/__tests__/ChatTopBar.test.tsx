import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatTopBar } from '../ChatTopBar';
import type { AgentDefinition } from '../../../core/agents/agentRegistry';
import type { AgentPresenceSummary } from '../../../core/agents/presence';
import type { ChatActorFilter } from '../../../types/chat';
import type { JarvisCoreContextValue, JarvisRuntimeStatus } from '../../../core/jarvis/JarvisCoreContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';

const useJarvisCoreMock = vi.fn<JarvisCoreContextValue, []>();
const useProjectsMock = vi.fn();

vi.mock('../../../core/jarvis/JarvisCoreContext', async () => {
  const actual = await vi.importActual<typeof import('../../../core/jarvis/JarvisCoreContext')>(
    '../../../core/jarvis/JarvisCoreContext',
  );
  return {
    ...actual,
    useJarvisCore: () => useJarvisCoreMock(),
  };
});

vi.mock('../../../core/projects/ProjectContext', () => ({
  useProjects: () => useProjectsMock(),
}));

const basePresence: AgentPresenceSummary = {
  totals: { online: 0, offline: 0, loading: 0, error: 0 },
  byKind: {
    cloud: { total: 0, active: 0, online: 0, offline: 0, loading: 0, error: 0 },
    local: { total: 0, active: 0, online: 0, offline: 0, loading: 0, error: 0 },
  },
};

const defaultJarvisState = (overrides: Partial<JarvisCoreContextValue> = {}): JarvisCoreContextValue => ({
  connected: false,
  lastError: null,
  activeModel: null,
  downloads: {},
  models: [],
  runtimeStatus: 'offline',
  uptimeMs: null,
  config: DEFAULT_GLOBAL_SETTINGS.jarvisCore,
  baseUrl: 'http://127.0.0.1:8000',
  lastHealthMessage: null,
  ensureOnline: vi.fn(),
  refreshModels: vi.fn(),
  downloadModel: vi.fn(),
  activateModel: vi.fn(),
  invokeChat: vi.fn(),
  launchAction: vi.fn(),
  ...overrides,
});

const renderComponent = (props?: Partial<{ filter: ChatActorFilter; presence: AgentPresenceSummary }>) => {
  return render(
    <ChatTopBar
      agents={[] as AgentDefinition[]}
      presenceSummary={props?.presence ?? basePresence}
      activeAgents={0}
      totalAgents={0}
      pendingResponses={0}
      activeFilter={props?.filter ?? 'all'}
      onFilterChange={vi.fn()}
      onRefreshPresence={vi.fn()}
      onOpenStats={vi.fn()}
      onOpenGlobalSettings={vi.fn()}
      onOpenPlugins={vi.fn()}
      onOpenMcp={vi.fn()}
      onOpenModelManager={vi.fn()}
      activeView="chat"
      onChangeView={vi.fn()}
    />,
  );
};

describe('ChatTopBar', () => {
  beforeEach(() => {
    useProjectsMock.mockReturnValue({
      projects: [],
      activeProjectId: null,
      activeProject: null,
      selectProject: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('permite relanzar la conexión de Jarvis Core', async () => {
    const ensureOnline = vi.fn().mockResolvedValue(undefined);
    useJarvisCoreMock.mockReturnValue(defaultJarvisState({ ensureOnline }));

    renderComponent();

    const jarvisButton = screen.getByRole('button', { name: /Jarvis Core desconectado/i });
    fireEvent.click(jarvisButton);

    expect(ensureOnline).toHaveBeenCalled();
  });

  const jarvisStates: Array<{ status: JarvisRuntimeStatus; uptimeMs: number | null; snapshot: string }>
    = [
      { status: 'ready', uptimeMs: 90 * 60 * 1000, snapshot: 'ready-state' },
      { status: 'starting', uptimeMs: null, snapshot: 'starting-state' },
      { status: 'error', uptimeMs: 5 * 1000, snapshot: 'error-state' },
    ];

  it.each(jarvisStates)(
    'renderiza el estado visual de Jarvis Core: %s',
    ({ status, uptimeMs, snapshot }) => {
      useJarvisCoreMock.mockReturnValue(
        defaultJarvisState({ runtimeStatus: status, uptimeMs, lastError: status === 'error' ? 'Fallo' : null }),
      );

      const { container } = renderComponent();
      const runtimeButton = container.querySelector('.jarvis-runtime-button');
      expect(runtimeButton).toBeInTheDocument();
      expect(runtimeButton).toMatchSnapshot(snapshot);
    },
  );

  it('muestra el contador de actividad cuando está disponible', () => {
    useJarvisCoreMock.mockReturnValue(defaultJarvisState({ runtimeStatus: 'ready', uptimeMs: 3_650_000 }));

    renderComponent();

    expect(screen.getByText(/↑ 1h 00m/i)).toBeInTheDocument();
  });
});
