import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentProvider } from '../../agents/AgentContext';
import { MessageProvider, useMessages } from '../MessageContext';
import { ProjectProvider } from '../../projects/ProjectContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = React.useState(() => ({ ...DEFAULT_GLOBAL_SETTINGS }));

  return (
    <ProjectProvider settings={settings} onSettingsChange={setSettings}>
      <AgentProvider apiKeys={{}}>
        <MessageProvider apiKeys={{}}>{children}</MessageProvider>
      </AgentProvider>
    </ProjectProvider>
  );
};

describe('MessageContext', () => {
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
});
