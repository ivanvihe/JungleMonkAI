import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageContent } from '../MessageContent';
import { AgentProvider } from '../../../../core/agents/AgentContext';

const noop = vi.fn();

describe('MessageContent', () => {
  it('renders plain text segments', () => {
    const { container } = render(
      <AgentProvider apiKeys={{}}>
        <MessageContent messageId="message-1" content="Hola mundo" onAppendToComposer={noop} />
      </AgentProvider>,
    );
    expect(container).toMatchSnapshot();
  });

  it('renders fenced code blocks with actions', () => {
    const codeMessage = `Respuesta:\n\n\`\`\`ts\nconst saludo: string = 'hola';\nconsole.log(saludo);\n\`\`\`\n\nFin.`;
    const { container } = render(
      <AgentProvider apiKeys={{}}>
        <MessageContent messageId="message-2" content={codeMessage} onAppendToComposer={noop} />
      </AgentProvider>,
    );
    expect(container).toMatchSnapshot();
  });
});
