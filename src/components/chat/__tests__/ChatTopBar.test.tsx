import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatTopBar } from '../ChatTopBar';
import type { AgentDefinition } from '../../../core/agents/agentRegistry';
import type { AgentPresenceSummary, AgentPresenceEntry } from '../../../core/agents/presence';
import type { ChatActorFilter } from '../../../types/chat';
import type { JarvisCoreContextValue } from '../../../core/jarvis/JarvisCoreContext';
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

const renderComponent = (
  props?: Partial<{
    filter: ChatActorFilter;
    presence: AgentPresenceSummary;
    presenceMap: Map<string, AgentPresenceEntry>;
  }>,
) => {
  return render(
    <ChatTopBar
      agents={[] as AgentDefinition[]}
      presenceSummary={props?.presence ?? basePresence}
      presenceMap={props?.presenceMap ?? new Map()}
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
      breadcrumbs={[{ key: 'home', title: 'Inicio' }]}
      contextOptions={[{ value: 'workspace', label: 'Workspace' }]}
      activeContext="workspace"
      onContextChange={vi.fn()}
      canToggleSider
      isSiderCollapsed={false}
      onToggleSider={vi.fn()}
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

    const jarvisButtons = screen.getAllByRole('button', { name: /Jarvis Core desconectado/i });
    fireEvent.click(jarvisButtons[0]);

    expect(ensureOnline).toHaveBeenCalled();
  });

  it('marca el botón de Jarvis Core como ocupado mientras se reconecta', async () => {
    let resolveEnsure: (() => void) | null = null;
    const ensureOnline = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveEnsure = resolve;
        }),
    );
    useJarvisCoreMock.mockReturnValue(defaultJarvisState({ ensureOnline }));

    renderComponent();

    fireEvent.click(screen.getAllByRole('button', { name: /Jarvis Core desconectado/i })[0]);

    const isAnyLoading = () =>
      screen
        .getAllByRole('button', { name: /Jarvis Core desconectado/i })
        .some(button => button.classList.contains('ant-btn-loading'));

    expect(isAnyLoading()).toBe(true);

    resolveEnsure?.();
    await waitFor(() => expect(isAnyLoading()).toBe(false));
  });

  it('muestra el contador de actividad cuando está disponible', () => {
    useJarvisCoreMock.mockReturnValue(defaultJarvisState({ runtimeStatus: 'ready', uptimeMs: 3_650_000 }));

    renderComponent();

    expect(screen.getByText(/↑ 1h 00m/i)).toBeInTheDocument();
  });
});
