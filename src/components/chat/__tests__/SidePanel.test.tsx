import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SidePanel } from '../SidePanel';
import { ChatTopBar } from '../ChatTopBar';
import { GlobalSettingsDialog } from '../../settings/GlobalSettingsDialog';
import { ProjectProvider, useProjects } from '../../../core/projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { AgentPresenceEntry, AgentPresenceSummary } from '../../../core/agents/presence';
import type { AgentDefinition } from '../../../core/agents/agentRegistry';

const mockUseAgents = vi.fn();
const mockUseAgentPresence = vi.fn();

vi.mock('../../../core/agents/AgentContext', () => ({
  useAgents: () => mockUseAgents(),
}));

vi.mock('../../../core/agents/presence', () => ({
  useAgentPresence: (...args: unknown[]) => mockUseAgentPresence(...args),
}));

vi.mock('../../../core/plugins/PluginHostProvider', () => ({
  usePluginHost: () => ({
    plugins: [],
    refresh: vi.fn(),
    messageActions: [],
    sidePanels: [],
    updatePluginSettings: vi.fn(),
  }),
}));

const ProjectProbe: React.FC = () => {
  const { activeProject, projects } = useProjects();
  return (
    <div data-testid="project-state">{`${activeProject?.name ?? 'none'}|${projects.length}`}</div>
  );
};

interface HarnessProps {
  initialProjects?: Array<{
    id: string;
    name: string;
    repositoryPath: string;
    defaultBranch?: string;
    preferredProvider?: string;
    preferredModel?: string;
  }>;
  children: React.ReactNode;
}

const renderWithProjects = ({ initialProjects = [], children }: HarnessProps) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children: nestedChildren }) => {
    const [settings, setSettings] = React.useState(() => ({
      ...DEFAULT_GLOBAL_SETTINGS,
      projectProfiles: initialProjects,
      activeProjectId: initialProjects[0]?.id ?? null,
    }));

    return (
      <ProjectProvider settings={settings} onSettingsChange={setSettings}>
        {nestedChildren}
        <ProjectProbe />
      </ProjectProvider>
    );
  };

  return render(<Wrapper>{children}</Wrapper>);
};

const presenceSummary: AgentPresenceSummary = {
  totals: { online: 0, offline: 0, loading: 0, error: 0 },
  byKind: {
    cloud: { total: 0, online: 0, loading: 0, offline: 0, error: 0 },
    local: { total: 0, online: 0, loading: 0, offline: 0, error: 0 },
  },
};

const buildAgent = (overrides: Partial<AgentDefinition>): AgentDefinition => ({
  id: 'agent-id',
  model: 'test-model',
  name: 'Agente de prueba',
  provider: 'OpenAI',
  description: 'Agente de prueba',
  kind: 'cloud',
  accent: '#ffffff',
  active: true,
  status: 'Disponible',
  channel: 'gpt',
  ...overrides,
});

const setupAgents = (agents: AgentDefinition[]) => {
  mockUseAgents.mockReturnValue({
    agents,
    activeAgents: agents.filter(agent => agent.active),
    agentMap: new Map(agents.map(agent => [agent.id, agent])),
    toggleAgent: vi.fn(),
    updateLocalAgentState: vi.fn(),
    assignAgentRole: vi.fn(),
  });
};

describe('Resumen de proveedores en SidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const agents = [
      buildAgent({ id: 'openai-agent', name: 'GPT-4o mini', model: 'gpt-4o-mini', provider: 'OpenAI', apiKey: 'sk-openai' }),
      buildAgent({
        id: 'anthropic-agent',
        name: 'Claude 3.5 Sonnet',
        model: 'claude-3.5-sonnet',
        provider: 'Anthropic',
        channel: 'claude',
        apiKey: 'sk-anthropic',
      }),
      buildAgent({
        id: 'groq-agent',
        name: 'LLaMA 3.2 90B',
        model: 'llama-3.2-90b-text',
        provider: 'Groq',
        channel: 'groq',
        apiKey: 'sk-groq',
      }),
      buildAgent({
        id: 'jarvis-phi',
        name: 'Phi-3 Mini',
        model: 'phi-3-mini',
        provider: 'Local',
        kind: 'local',
        channel: 'jarvis',
        active: false,
        status: 'Inactivo',
      }),
    ];
    setupAgents(agents);
    mockUseAgentPresence.mockReturnValue({
      presenceMap: new Map<string, AgentPresenceEntry>(),
      summary: presenceSummary,
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra los cuatro proveedores principales con su estado resumido', () => {
    render(<SidePanel onOpenGlobalSettings={vi.fn()} onOpenModelManager={vi.fn()} />);

    const cards = screen.getAllByTestId(/provider-card-/);
    expect(cards).toHaveLength(4);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.getByText('Jarvis')).toBeInTheDocument();
  });

  it('ajusta el indicador de estado según la presencia reportada', () => {
    const agents = [
      buildAgent({ id: 'openai-agent', name: 'GPT-4o mini', model: 'gpt-4o-mini', provider: 'OpenAI', apiKey: 'sk-openai' }),
      buildAgent({
        id: 'anthropic-agent',
        name: 'Claude 3.5 Sonnet',
        model: 'claude-3.5-sonnet',
        provider: 'Anthropic',
        channel: 'claude',
        apiKey: 'sk-anthropic',
      }),
      buildAgent({
        id: 'groq-agent',
        name: 'LLaMA 3.2 90B',
        model: 'llama-3.2-90b-text',
        provider: 'Groq',
        channel: 'groq',
        apiKey: 'sk-groq',
      }),
      buildAgent({
        id: 'jarvis-phi',
        name: 'Phi-3 Mini',
        model: 'phi-3-mini',
        provider: 'Local',
        kind: 'local',
        channel: 'jarvis',
        active: false,
        status: 'Inactivo',
      }),
    ];
    setupAgents(agents);
    mockUseAgentPresence.mockReturnValue({
      presenceMap: new Map<string, AgentPresenceEntry>([
        ['openai-agent', { status: 'online', lastChecked: Date.now() }],
        ['anthropic-agent', { status: 'offline', lastChecked: Date.now() }],
        ['groq-agent', { status: 'error', lastChecked: Date.now(), message: 'Sin clave' }],
      ]),
      summary: presenceSummary,
      refresh: vi.fn(),
    });

    render(<SidePanel onOpenGlobalSettings={vi.fn()} onOpenModelManager={vi.fn()} />);

    expect(screen.getByTestId('provider-led-openai')).toHaveClass('is-online');
    expect(screen.getByTestId('provider-led-anthropic')).toHaveClass('is-warning');
    expect(screen.getByTestId('provider-led-groq')).toHaveClass('is-error');
    expect(screen.getByTestId('provider-led-jarvis')).toHaveClass('is-warning');
    expect(screen.getByRole('button', { name: 'Gestionar modelos' })).toBeInTheDocument();
  });

  it('informa sobre la nueva ubicación de la gestión de proyectos en los ajustes', () => {
    const TestHarness: React.FC = () => {
      const [settings, setSettings] = React.useState(() => ({
        ...DEFAULT_GLOBAL_SETTINGS,
      }));

      return (
        <ProjectProvider settings={settings} onSettingsChange={setSettings}>
          <GlobalSettingsDialog
            isOpen
            onClose={vi.fn()}
            settings={settings}
            apiKeys={settings.apiKeys}
            onApiKeyChange={vi.fn()}
            onSettingsChange={setSettings}
          />
          <ProjectProbe />
        </ProjectProvider>
      );
    };

    render(<TestHarness />);

    expect(
      screen.getByText('La administración de perfiles de proyecto ahora se realiza directamente desde Repo Studio.'),
    ).toBeInTheDocument();
  });

  it('permite cambiar el proyecto activo desde la barra superior', () => {
    renderWithProjects({
      initialProjects: [
        { id: 'p1', name: 'Proyecto A', repositoryPath: '/repo/a', defaultBranch: 'main' },
        {
          id: 'p2',
          name: 'Proyecto B',
          repositoryPath: '/repo/b',
          defaultBranch: 'release',
          preferredProvider: 'openai',
          preferredModel: 'o1',
        },
      ],
      children: (
        <ChatTopBar
          agents={[] as AgentDefinition[]}
          presenceSummary={presenceSummary}
          activeAgents={0}
          totalAgents={0}
          pendingResponses={0}
          activeFilter="all"
          onFilterChange={vi.fn()}
          onRefreshPresence={vi.fn()}
          onOpenGlobalSettings={vi.fn()}
          onOpenPlugins={vi.fn()}
          onOpenMcp={vi.fn()}
          onOpenModelManager={vi.fn()}
          activeView="chat"
          onChangeView={vi.fn()}
        />
      ),
    });

    fireEvent.change(screen.getByLabelText('Seleccionar proyecto activo'), {
      target: { value: 'p2' },
    });

    const states = screen.getAllByTestId('project-state');
    expect(states.at(-1)).toHaveTextContent('Proyecto B|2');
    expect(screen.getByText('/repo/b@release')).toBeInTheDocument();
  });
});
