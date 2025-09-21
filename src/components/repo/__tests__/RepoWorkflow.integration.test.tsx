import React from 'react';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AgentProvider } from '../../../core/agents/AgentContext';
import { RepoWorkflowProvider } from '../../../core/codex';
import { MessageActions } from '../../chat/messages/MessageActions';
import { RepoStudio } from '../RepoStudio';
import type { ChatMessage } from '../../../core/messages/messageTypes';
import { PluginHostProvider } from '../../../core/plugins/PluginHostProvider';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import { ProjectProvider } from '../../../core/projects/ProjectContext';
import type { JarvisCoreContextValue } from '../../../core/jarvis/JarvisCoreContext';

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

vi.mock('../../../core/jarvis/JarvisCoreContext', () => ({
  useJarvisCore: () => mockJarvisCore,
}));

const gitInvokeMock = vi.hoisted(() => vi.fn());
const runtimeMode = vi.hoisted(() => ({ current: 'tauri' as 'tauri' | 'electron' }));

vi.mock('../../../utils/runtimeBridge', () => {
  const GitBackendUnavailableError = class extends Error {};
  return {
    gitInvoke: gitInvokeMock,
    canUseDesktopGit: () => true,
    isTauriRuntime: () => runtimeMode.current === 'tauri',
    isElectronRuntime: () => runtimeMode.current === 'electron',
    hasElectronGitBridge: () => runtimeMode.current === 'electron',
    isGitBackendUnavailableError: (error: unknown) => error instanceof GitBackendUnavailableError,
    GitBackendUnavailableError,
  };
});

const messagesRef: { current: ChatMessage[] } = { current: [] };
let setMockMessages: ((messages: ChatMessage[]) => void) | undefined;

vi.mock('../../../core/messages/MessageContext', () => ({
  useMessages: () => ({
    messages: messagesRef.current,
    pendingActions: [],
    triggerAction: vi.fn(),
    rejectAction: vi.fn(),
  }),
  MessageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  __setMockMessages: (messages: ChatMessage[]) => {
    messagesRef.current = messages;
  },
}));

beforeAll(async () => {
  const module = (await import('../../../core/messages/MessageContext')) as {
    __setMockMessages?: (messages: ChatMessage[]) => void;
  };
  setMockMessages = module.__setMockMessages;
});

const canonicalSnippet = `Modificar src/core/example.ts para añadir nueva funcionalidad.\nAsegura pruebas y PR automático.`;

const buildStubMessage = (): ChatMessage => ({
  id: 'message-123',
  author: 'agent',
  content: canonicalSnippet,
  timestamp: new Date().toISOString(),
  canonicalCode: canonicalSnippet,
  feedback: {
    tags: ['feature', 'automation'],
  },
});

describe.each(['tauri', 'electron'] as const)(
  'Repo workflow integration (%s)',
  runtime => {
    beforeEach(() => {
      runtimeMode.current = runtime;
      gitInvokeMock.mockReset();
      gitInvokeMock.mockImplementation((command, args) => {
        switch (command) {
          case 'git_list_repository_files':
            return Promise.resolve([]);
          case 'git_repository_status':
            return Promise.resolve({ entries: [] });
          case 'git_get_repository_context':
            return Promise.resolve({
              branch: 'main',
              last_commit: {
                id: 'abc123',
                message: 'Initial commit',
                author: 'Repo Bot',
                time: 1_700_000_000,
              },
              remote: {
                name: 'origin',
                url: 'https://github.com/acme/wonder-project.git',
                branch: 'main',
              },
            });
          case 'git_pull_repository':
            return Promise.resolve('Fast-forward completado desde origin/main hasta def456.');
          case 'git_create_pull_request':
            return Promise.resolve({ url: 'https://example.com/pr/1' });
          case 'git_commit_changes':
            return Promise.resolve('abc123');
          case 'git_push_changes':
            return Promise.resolve('ok');
          case 'git_pull_changes':
            return Promise.resolve('Already up to date.');
          case 'git_apply_patch':
            return Promise.resolve({});
          case 'git_list_user_repos':
            return Promise.resolve([
              {
                id: 42,
                name: 'wonder-project',
                full_name: 'acme/wonder-project',
                owner: 'acme',
                description: 'Proyecto remoto de ejemplo',
                default_branch: 'main',
                html_url: 'https://github.com/acme/wonder-project',
                clone_url: 'https://github.com/acme/wonder-project.git',
                ssh_url: 'git@github.com:acme/wonder-project.git',
                private: false,
                visibility: 'public',
              },
            ]);
          case 'git_clone_repository':
            return Promise.resolve({});
          default:
            return Promise.resolve({});
        }
      });
      setMockMessages?.([buildStubMessage()]);
    });

    it('propagates message content to Repo Studio and triggers auto-PR workflow', async () => {
      const PluginWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        const [settings, setSettings] = React.useState(() => ({
          ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)),
        }));
    return (
      <PluginHostProvider settings={settings} onSettingsChange={setSettings}>
        {children}
      </PluginHostProvider>
    );
  };

    const ProjectWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [settings, setSettings] = React.useState(() => ({
        ...DEFAULT_GLOBAL_SETTINGS,
        projectProfiles: [
          { id: 'proj-1', name: 'Demo', repositoryPath: '/tmp/demo', defaultBranch: 'main' },
        ],
        activeProjectId: 'proj-1',
      }));

      return (
        <ProjectProvider settings={settings} onSettingsChange={setSettings}>
          {children}
        </ProjectProvider>
      );
    };

    const { container } = render(
      <ProjectWrapper>
        <AgentProvider apiKeys={{}}>
          <RepoWorkflowProvider>
            <PluginWrapper>
              <div>
                <MessageActions messageId="message-123" value={canonicalSnippet} />
                <RepoStudio />
              </div>
            </PluginWrapper>
          </RepoWorkflowProvider>
        </AgentProvider>
      </ProjectWrapper>,
    );

    const sendButtons = screen.getAllByText('Enviar a Repo Studio');
    fireEvent.click(sendButtons[0]);

    const [analysisField] = await screen.findAllByPlaceholderText(
      'Describe qué cambios necesitas (usa `rutas/relativas` para guiar al motor).',
    );
    await waitFor(() => expect((analysisField as HTMLTextAreaElement).value).toBe(canonicalSnippet));

    await waitFor(() =>
      expect(gitInvokeMock).toHaveBeenCalledWith('git_pull_repository', {
        repoPath: '/tmp/demo',
        remote: 'origin',
        branch: 'main',
      }),
    );

    const syncMessages = await screen.findAllByText(/Sincronización completada:/);
    expect(syncMessages.length).toBeGreaterThan(0);

    const [orgInput] = screen.getAllByPlaceholderText('org');
    const [repoInput] = screen.getAllByPlaceholderText('repo');
    const [featureInput] = screen.getAllByPlaceholderText('feature/rama');
    fireEvent.change(orgInput, { target: { value: 'acme' } });
    fireEvent.change(repoInput, { target: { value: 'wonder-project' } });
    fireEvent.change(featureInput, {
      target: { value: 'feature/auto-pr' },
    });

    const planSection = await waitFor(() => container.querySelector('.repo-studio__plan'));
    if (runtime === 'tauri') {
      expect(planSection).not.toBeNull();
    }

    if (planSection) {
      const stepCheckboxes = planSection.querySelectorAll('input[type="checkbox"]');
      expect(stepCheckboxes.length).toBeGreaterThan(0);
      stepCheckboxes.forEach(input => {
        const checkbox = input as HTMLInputElement;
        if (!checkbox.disabled && !checkbox.checked) {
          fireEvent.click(checkbox);
        }
      });
    }

    const [autoPrCheckbox] = screen.getAllByLabelText('Auto-PR al aprobar');
    fireEvent.click(autoPrCheckbox);

    const approveButton = screen.getByRole('button', { name: 'Aprobar plan' });
    fireEvent.click(approveButton);

    if (runtime === 'tauri') {
      await waitFor(() =>
        expect(gitInvokeMock).toHaveBeenCalledWith('git_create_pull_request', expect.anything()),
      );

      const [, payload] =
        gitInvokeMock.mock.calls.find(call => call[0] === 'git_create_pull_request') ?? [];
      expect(payload).toBeDefined();
      expect(payload.payload.title).toContain('Modificar src/core/example.ts');
      expect(payload.payload.body).toContain('```');
      expect(payload.payload.body).toContain('Etiquetas sugeridas: `feature` `automation`');

      await screen.findByText(/Auto PR\/MR creado:/);
    }

    const remoteEntries = await screen.findAllByText('acme/wonder-project');
    expect(remoteEntries.length).toBeGreaterThan(0);
    const [remoteDescription] = screen.getAllByText('Proyecto remoto de ejemplo');
    expect(remoteDescription).toBeInTheDocument();
    expect(gitInvokeMock).toHaveBeenCalledWith(
      'git_list_user_repos',
      expect.objectContaining({ request: expect.any(Object) }),
    );
  });
});
