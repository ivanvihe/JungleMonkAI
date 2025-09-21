import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatCodeComposer } from '../ChatCodeComposer';

vi.mock('../../../../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatCodeComposer', () => {
  it('renders composer with toolbar and textarea', () => {
    const { container } = render(
      <ChatCodeComposer
        value="Hola agentes"
        appendToDraft={vi.fn()}
        setDraft={vi.fn()}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it('wraps selected text with code fences using shortcut', () => {
    const setDraft = vi.fn();
    const appendToDraft = vi.fn();
    render(
      <ChatCodeComposer
        value="Seleccion"
        appendToDraft={appendToDraft}
        setDraft={setDraft}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true, shiftKey: true });
    expect(setDraft).toHaveBeenCalledWith('```\nSeleccion\n```\n');
    expect(appendToDraft).not.toHaveBeenCalled();
  });
});
