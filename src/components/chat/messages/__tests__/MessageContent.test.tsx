import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageContent } from '../MessageContent';
import { AgentProvider } from '../../../../core/agents/AgentContext';
import { MessageProvider } from '../../../../core/messages/MessageContext';
import { RepoWorkflowProvider } from '../../../../core/codex';
import { PluginHostProvider } from '../../../../core/plugins/PluginHostProvider';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../../utils/globalSettings';
import { ProjectProvider } from '../../../../core/projects/ProjectContext';
import { JarvisCoreProvider } from '../../../../core/jarvis/JarvisCoreContext';
import type { JarvisCoreClient } from '../../../../services/jarvisCoreClient';

const noop = vi.fn();

const ProviderHarness: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = React.useState(() => ({
    ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)),
  }));
  const jarvisClient = React.useMemo<JarvisCoreClient>(
    () => ({
      getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
      listModels: vi.fn().mockResolvedValue([]),
      downloadModel: vi.fn().mockResolvedValue({} as any),
      activateModel: vi.fn().mockResolvedValue({} as any),
      sendChat: vi.fn().mockResolvedValue({ message: 'demo', actions: [] }),
      triggerAction: vi.fn().mockResolvedValue(undefined),
    }),
    [],
  );

  return (
    <ProjectProvider settings={settings} onSettingsChange={setSettings}>
      <JarvisCoreProvider settings={settings} onSettingsChange={setSettings} clientOverride={jarvisClient}>
        <AgentProvider apiKeys={{}}>
          <PluginHostProvider settings={settings} onSettingsChange={setSettings}>
            <MessageProvider apiKeys={{}}>
              <RepoWorkflowProvider>{children}</RepoWorkflowProvider>
            </MessageProvider>
          </PluginHostProvider>
        </AgentProvider>
      </JarvisCoreProvider>
    </ProjectProvider>
  );
};

describe('MessageContent', () => {
  it('renders plain text segments', () => {
    const { container } = render(
      <ProviderHarness>
        <MessageContent messageId="message-1" content="Hola mundo" onAppendToComposer={noop} />
      </ProviderHarness>,
    );
    expect(container).toMatchSnapshot();
  });

  it('renders fenced code blocks with actions', () => {
    const codeMessage = `Respuesta:\n\n\`\`\`ts\nconst saludo: string = 'hola';\nconsole.log(saludo);\n\`\`\`\n\nFin.`;
    const { container } = render(
      <ProviderHarness>
        <MessageContent messageId="message-2" content={codeMessage} onAppendToComposer={noop} />
      </ProviderHarness>,
    );
    expect(container).toMatchSnapshot();
  });
});
