import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SidePanel } from '../SidePanel';
import { ChatTopBar } from '../ChatTopBar';
import { ProjectProvider, useProjects } from '../../../core/projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { AgentPresenceSummary } from '../../../core/agents/presence';
import type { AgentDefinition } from '../../../core/agents/agentRegistry';

vi.mock('../../../core/agents/AgentContext', () => ({
  useAgents: () => ({ agents: [], activeAgents: [], agentMap: new Map() }),
}));

vi.mock('../../../core/messages/MessageContext', () => ({
  useMessages: () => ({
    messages: [],
    quickCommands: [],
    appendToDraft: vi.fn(),
    pendingResponses: 0,
    agentResponses: [],
    formatTimestamp: (value: string) => value,
  }),
}));

vi.mock('../../../hooks/useLocalModels', () => ({
  useLocalModels: () => ({ models: [] }),
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

const emptyAgents: AgentDefinition[] = [];

describe('Project-aware UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('permite crear un proyecto desde el panel lateral y activarlo automáticamente', () => {
    renderWithProjects({
      children: (
        <SidePanel
          apiKeys={{ openai: '', anthropic: '', groq: '' }}
          presenceMap={new Map()}
          onRefreshAgentPresence={vi.fn()}
          onOpenGlobalSettings={vi.fn()}
        />
      ),
    });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Monorepo' } });
    fireEvent.change(screen.getByLabelText('Repositorio'), {
      target: { value: '/workspace/monorepo' },
    });
    fireEvent.change(screen.getByLabelText('Rama por defecto'), { target: { value: 'main' } });
    fireEvent.change(screen.getByLabelText('Proveedor preferido'), { target: { value: 'openai' } });
    fireEvent.change(screen.getByLabelText('Modelo preferido'), { target: { value: 'gpt-4' } });
    fireEvent.change(screen.getByLabelText('Instrucciones fijas'), {
      target: { value: 'Validar los tests antes de PR.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const states = screen.getAllByTestId('project-state');
    expect(states.at(-1)).toHaveTextContent('Monorepo|1');
    expect((screen.getByLabelText('Repositorio') as HTMLInputElement).value).toBe(
      '/workspace/monorepo',
    );
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
          agents={emptyAgents}
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
