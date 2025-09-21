import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const hoistedMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  enqueue: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('../../utils/runtimeBridge', () => {
  const GitBackendUnavailableError = class extends Error {};
  return {
    gitInvoke: hoistedMocks.invoke,
    canUseDesktopGit: () => true,
    isTauriRuntime: () => true,
    isElectronRuntime: () => false,
    hasElectronGitBridge: () => false,
    isGitBackendUnavailableError: (error: unknown) => error instanceof GitBackendUnavailableError,
    GitBackendUnavailableError,
  };
});

vi.mock('../../codex', () => ({
  enqueueRepoWorkflowRequest: hoistedMocks.enqueue,
  syncRepositoryViaWorkflow: hoistedMocks.sync,
}));

const invokeMock = hoistedMocks.invoke;
const enqueueRepoWorkflowRequestMock = hoistedMocks.enqueue;
const syncRepositoryViaWorkflowMock = hoistedMocks.sync;
import { AgentProvider } from '../../agents/AgentContext';
import { MessageProvider, useMessages } from '../MessageContext';
import { ProjectProvider } from '../../projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';

const createWrapper = (
  settingsFactory: () => typeof DEFAULT_GLOBAL_SETTINGS,
): React.FC<{ children: React.ReactNode }> => {
  return ({ children }) => {
    const [settings, setSettings] = React.useState(settingsFactory);

    return (
      <ProjectProvider settings={settings} onSettingsChange={setSettings}>
        <AgentProvider apiKeys={{}}>
          <MessageProvider apiKeys={{}}>{children}</MessageProvider>
        </AgentProvider>
      </ProjectProvider>
    );
  };
};

const baseSettingsFactory = () =>
  JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as typeof DEFAULT_GLOBAL_SETTINGS;

const projectSettingsFactory = () => {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as typeof DEFAULT_GLOBAL_SETTINGS;
  cloned.projectProfiles = [
    {
      id: 'toolkit',
      name: 'Toolkit',
      repositoryPath: '/workbench/app',
      defaultRemote: 'origin',
      defaultBranch: 'develop',
    },
  ];
  cloned.activeProjectId = 'toolkit';
  return cloned;
};

const Wrapper = createWrapper(baseSettingsFactory);
const ProjectWrapper = createWrapper(projectSettingsFactory);

describe('MessageContext', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    enqueueRepoWorkflowRequestMock.mockReset();
    syncRepositoryViaWorkflowMock.mockReset();
    syncRepositoryViaWorkflowMock.mockResolvedValue('Fast-forward completado.');
  });

  it('carga el contenido del mensaje en el borrador', () => {
    const { result } = renderHook(() => useMessages(), { wrapper: Wrapper });
    const initialMessage = result.current.messages[0];
    const expectedDraft =
      typeof initialMessage.content === 'string' ? initialMessage.content : 'Bienvenido a JungleMonk.AI Control Hub.';

    act(() => {
      result.current.setDraft('borrador previo');
      result.current.addAttachment({ id: 'temp', type: 'file', name: 'temp.txt' });
    });

    act(() => {
      result.current.loadMessageIntoDraft(initialMessage.id);
    });

    expect(result.current.draft).toBe(expectedDraft);
    expect(result.current.composerAttachments).toHaveLength(0);
  });

  it('sincroniza el repositorio activo al solicitar analizar el proyecto', async () => {
    invokeMock.mockImplementation(command => {
      if (command === 'git_get_repository_context') {
        return Promise.resolve({ branch: 'feature/research' });
      }
      return Promise.resolve({});
    });
    const { result } = renderHook(() => useMessages(), { wrapper: ProjectWrapper });

    act(() => {
      result.current.setDraft('¿Puedes analizar mi proyecto?');
    });

    act(() => {
      result.current.sendMessage();
    });

    await waitFor(() => expect(syncRepositoryViaWorkflowMock).toHaveBeenCalled());
    expect(syncRepositoryViaWorkflowMock).toHaveBeenCalledWith({
      repositoryPath: '/workbench/app',
      remote: 'origin',
      branch: 'develop',
    });

    await waitFor(() => expect(enqueueRepoWorkflowRequestMock).toHaveBeenCalled());
    expect(enqueueRepoWorkflowRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: '/workbench/app',
        branch: 'develop',
      }),
    );
    const lastMessages = result.current.messages.slice(-2).map(message => message.content);
    expect(lastMessages[1]).toContain('Sincronizando el proyecto activo');
  });

  it('avisa cuando no hay proyecto activo para analizar', () => {
    const { result } = renderHook(() => useMessages(), { wrapper: Wrapper });

    act(() => {
      result.current.setDraft('analiza mi proyecto ahora mismo');
    });

    act(() => {
      result.current.sendMessage();
    });

    const lastMessage = result.current.messages[result.current.messages.length - 1];
    expect(typeof lastMessage.content).toBe('string');
    expect(lastMessage.content).toContain('No hay ningún proyecto activo enlazado para analizar');
    expect(syncRepositoryViaWorkflowMock).not.toHaveBeenCalled();
    expect(enqueueRepoWorkflowRequestMock).not.toHaveBeenCalled();
  });

  it('orquesta automáticamente los agentes seleccionados aunque no haya menciones', () => {
    const { result } = renderHook(() => useMessages(), { wrapper: Wrapper });

    act(() => {
      result.current.setComposerTargetAgentIds([
        'openai-gpt-4o-mini',
        'anthropic-claude-35-sonnet',
      ]);
      result.current.setComposerTargetMode('independent');
      result.current.setDraft('Prepara un resumen ejecutivo de la conversación.');
    });

    act(() => {
      result.current.sendMessage();
    });

    const pending = result.current.messages.filter(
      message => message.author === 'agent' && message.status === 'pending',
    );
    const pendingIds = pending.map(message => message.agentId).filter(Boolean);

    expect(pendingIds).toEqual(
      expect.arrayContaining(['openai-gpt-4o-mini', 'anthropic-claude-35-sonnet']),
    );
    expect(pendingIds.some(id => id?.startsWith('local-'))).toBe(false);
  });
});
