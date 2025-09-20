import React from 'react';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentProvider } from '../../../core/agents/AgentContext';
import { RepoWorkflowProvider } from '../../../core/codex';
import { MessageActions } from '../../chat/messages/MessageActions';
import { RepoStudio } from '../RepoStudio';
import type { ChatMessage } from '../../../core/messages/messageTypes';
import { PluginHostProvider } from '../../../core/plugins/PluginHostProvider';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import { ProjectProvider } from '../../../core/projects/ProjectContext';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: invokeMock,
}));

const messagesRef: { current: ChatMessage[] } = { current: [] };
let setMockMessages: ((messages: ChatMessage[]) => void) | undefined;

vi.mock('../../../core/messages/MessageContext', () => ({
  useMessages: () => ({ messages: messagesRef.current }),
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

describe('Repo workflow integration', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ url: 'https://example.com/pr/1' });
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

    fireEvent.click(screen.getByText('Enviar a Repo Studio'));

    const analysisField = await screen.findByPlaceholderText(
      'Describe qué cambios necesitas (usa `rutas/relativas` para guiar al motor).',
    );
    await waitFor(() => expect((analysisField as HTMLTextAreaElement).value).toBe(canonicalSnippet));

    fireEvent.change(screen.getByPlaceholderText('org'), { target: { value: 'acme' } });
    fireEvent.change(screen.getByPlaceholderText('repo'), { target: { value: 'wonder-project' } });
    fireEvent.change(screen.getByPlaceholderText('feature/rama'), {
      target: { value: 'feature/auto-pr' },
    });

    const planSection = await waitFor(() => container.querySelector('.repo-studio__plan'));
    expect(planSection).not.toBeNull();

    const stepCheckboxes = planSection?.querySelectorAll('input[type="checkbox"]') ?? [];
    expect(stepCheckboxes.length).toBeGreaterThan(0);
    stepCheckboxes.forEach(input => {
      const checkbox = input as HTMLInputElement;
      if (!checkbox.disabled && !checkbox.checked) {
        fireEvent.click(checkbox);
      }
    });

    fireEvent.click(screen.getByLabelText('Auto-PR al aprobar'));

    const approveButton = screen.getByRole('button', { name: 'Aprobar plan' });
    fireEvent.click(approveButton);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('git_create_pull_request', expect.anything()));

    const [, payload] = invokeMock.mock.calls.find(call => call[0] === 'git_create_pull_request') ?? [];
    expect(payload).toBeDefined();
    expect(payload.payload.title).toContain('Modificar src/core/example.ts');
    expect(payload.payload.body).toContain('```');
    expect(payload.payload.body).toContain('Etiquetas sugeridas: `feature` `automation`');

    await screen.findByText(/Auto PR\/MR creado:/);
  });
});
