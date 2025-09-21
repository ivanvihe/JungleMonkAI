import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConversationStatsModal } from '../ConversationStatsModal';
import type { JarvisCoreContextValue } from '../../../core/jarvis/JarvisCoreContext';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';

const useMessagesMock = vi.fn();
const useJarvisCoreMock = vi.fn<JarvisCoreContextValue, []>();

vi.mock('../../../core/messages/MessageContext', () => ({
  useMessages: () => useMessagesMock(),
}));

vi.mock('../../../core/jarvis/JarvisCoreContext', async () => {
  const actual = await vi.importActual<typeof import('../../../core/jarvis/JarvisCoreContext')>(
    '../../../core/jarvis/JarvisCoreContext',
  );
  return {
    ...actual,
    useJarvisCore: () => useJarvisCoreMock(),
  };
});

describe('ConversationStatsModal', () => {
  it('muestra el estado de Jarvis Core y permite reintentar la conexión', () => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    useMessagesMock.mockReturnValue({
      messages: [
        { id: '1', author: 'user', content: 'hola', timestamp: now, visibility: 'public' },
        { id: '2', author: 'agent', content: 'respuesta', timestamp: later, visibility: 'public' },
      ],
      pendingResponses: 1,
      formatTimestamp: (value: number) => new Date(value).toLocaleTimeString('es-ES'),
    });

    const ensureOnline = vi.fn().mockResolvedValue(undefined);
    useJarvisCoreMock.mockReturnValue({
      connected: true,
      lastError: null,
      activeModel: 'phi-2',
      downloads: {
        phi: { modelId: 'phi', status: 'downloading', downloaded: 512, total: 1024, percent: 50, error: null, errorCode: null },
      },
      models: [],
      runtimeStatus: 'ready',
      uptimeMs: 12_000,
      config: DEFAULT_GLOBAL_SETTINGS.jarvisCore,
      baseUrl: 'http://127.0.0.1:8000',
      lastHealthMessage: 'ok',
      ensureOnline,
      refreshModels: vi.fn(),
      downloadModel: vi.fn(),
      activateModel: vi.fn(),
      invokeChat: vi.fn(),
      launchAction: vi.fn(),
    });

    const { container } = render(<ConversationStatsModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('JarvisCore')).toBeInTheDocument();
    expect(screen.getByText(/phi-2/)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Reintentar conexión/i });
    button.click();
    expect(ensureOnline).toHaveBeenCalled();

    expect(container.querySelector('.conversation-stats__jarvis')).toMatchSnapshot('jarvis-section');
  });
});
