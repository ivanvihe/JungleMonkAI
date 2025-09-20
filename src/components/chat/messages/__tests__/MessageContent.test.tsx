import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageContent } from '../MessageContent';
import { AgentProvider } from '../../../../core/agents/AgentContext';
import { MessageProvider } from '../../../../core/messages/MessageContext';
import { RepoWorkflowProvider } from '../../../../core/codex';

const noop = vi.fn();

const withProviders = (node: React.ReactNode) => (
  <AgentProvider apiKeys={{}}>
    <MessageProvider apiKeys={{}}>
      <RepoWorkflowProvider>{node}</RepoWorkflowProvider>
    </MessageProvider>
  </AgentProvider>
);

describe('MessageContent', () => {
  it('renders plain text segments', () => {
    const { container } = render(
      withProviders(
        <MessageContent messageId="message-1" content="Hola mundo" onAppendToComposer={noop} />,
      ),
    );
    expect(container).toMatchSnapshot();
  });

  it('renders fenced code blocks with actions', () => {
    const codeMessage = `Respuesta:\n\n\`\`\`ts\nconst saludo: string = 'hola';\nconsole.log(saludo);\n\`\`\`\n\nFin.`;
    const { container } = render(
      withProviders(
        <MessageContent messageId="message-2" content={codeMessage} onAppendToComposer={noop} />,
      ),
    );
    expect(container).toMatchSnapshot();
  });
});
