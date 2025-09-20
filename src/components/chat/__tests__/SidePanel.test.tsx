import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SidePanel } from '../SidePanel';
import { ChatTopBar } from '../ChatTopBar';
import { GlobalSettingsDialog } from '../../settings/GlobalSettingsDialog';
import { ProjectProvider, useProjects } from '../../../core/projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { AgentPresenceSummary } from '../../../core/agents/presence';
import type { AgentDefinition } from '../../../core/agents/agentRegistry';
import type { LocalModel } from '../../../hooks/useLocalModels';

const mockUseLocalModels = vi.fn();

vi.mock('../../../hooks/useLocalModels', () => ({
  useLocalModels: () => mockUseLocalModels(),
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

const buildModel = (overrides: Partial<LocalModel>): LocalModel => ({
  id: 'model',
  name: 'Modelo base',
  description: '',
  provider: 'Proveedor',
  tags: [],
  size: 0,
  checksum: '',
  status: 'ready',
  active: false,
  progress: 1,
  ...overrides,
});

describe('Gestión de proyectos y modelos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocalModels.mockReturnValue({
      models: [],
      isLoading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      activate: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra el resumen de modelos locales y permite abrir los ajustes', () => {
    const refreshSpy = vi.fn().mockResolvedValue(undefined);
    mockUseLocalModels.mockReturnValue({
      models: [
        buildModel({ id: 'm1', name: 'Llama 3', provider: 'Meta', status: 'ready', active: true }),
        buildModel({ id: 'm2', name: 'Phi 4', provider: 'Microsoft', status: 'downloading', progress: 0.42 }),
      ],
      isLoading: false,
      error: null,
      refresh: refreshSpy,
      download: vi.fn(),
      activate: vi.fn(),
    });

    const onOpenGlobalSettings = vi.fn();

    render(<SidePanel onOpenGlobalSettings={onOpenGlobalSettings} />);

    expect(screen.getAllByText('Llama 3')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Meta')[0]).toBeInTheDocument();
    expect(screen.getByText('Phi 4')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Gestionar descargas' }));
    expect(onOpenGlobalSettings).toHaveBeenCalledTimes(1);
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

    mockUseLocalModels.mockReturnValue({
      models: [],
      isLoading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      activate: vi.fn(),
    });

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
