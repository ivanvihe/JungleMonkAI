import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MessageContent } from '../MessageContent';

const noop = vi.fn();

describe('MessageContent', () => {
  it('renders plain text segments', () => {
    const { container } = render(<MessageContent content="Hola mundo" onAppendToComposer={noop} />);
    expect(container).toMatchSnapshot();
  });

  it('renders fenced code blocks with actions', () => {
    const codeMessage = `Respuesta:\n\n\`\`\`ts\nconst saludo: string = 'hola';\nconsole.log(saludo);\n\`\`\`\n\nFin.`;
    const { container } = render(<MessageContent content={codeMessage} onAppendToComposer={noop} />);
    expect(container).toMatchSnapshot();
  });
});
