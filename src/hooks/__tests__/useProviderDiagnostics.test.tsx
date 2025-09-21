import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const aiProviderMocks = vi.hoisted(() => ({
  callOpenAIChat: vi.fn(),
  callAnthropicChat: vi.fn(),
  callGroqChat: vi.fn(),
}));

vi.mock('../../utils/aiProviders', () => ({
  callOpenAIChat: aiProviderMocks.callOpenAIChat,
  callAnthropicChat: aiProviderMocks.callAnthropicChat,
  callGroqChat: aiProviderMocks.callGroqChat,
}));

vi.mock('../../utils/globalSettings', () => ({
  getSupportedProviders: vi.fn(() => ['openai', 'anthropic', 'groq']),
  isSupportedProvider: vi.fn((provider: string) => ['openai', 'anthropic', 'groq'].includes(provider)),
}));

import { useProviderDiagnostics } from '../useProviderDiagnostics';

const ANTHROPIC_CONCURRENCY_MESSAGE =
  'Otra solicitud de Anthropic está en curso para esta API key. Intenta nuevamente en unos segundos.';

const successfulResponse = { content: 'OK', modalities: ['text'] as const };

describe('useProviderDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expone el modelo recomendado actualizado para Groq', () => {
    const { result } = renderHook(() => useProviderDiagnostics());
    expect(result.current.getDefaultModel('groq')).toBe('llama-3.2-90b-text');
  });

  it('utiliza el modelo recomendado de Groq al probar conectividad', async () => {
    aiProviderMocks.callGroqChat.mockResolvedValueOnce(successfulResponse);
    const { result } = renderHook(() => useProviderDiagnostics());

    let response: Awaited<ReturnType<ReturnType<typeof useProviderDiagnostics>['testConnection']>>;
    await act(async () => {
      response = await result.current.testConnection('groq', 'gsk_12345678901234567890');
    });

    expect(aiProviderMocks.callGroqChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.2-90b-text' }),
    );
    expect(response!.ok).toBe(true);
    expect(response!.modelUsed).toBe('llama-3.2-90b-text');
  });

  it('propaga el error de concurrencia de Anthropic', async () => {
    aiProviderMocks.callAnthropicChat.mockRejectedValueOnce(new Error(ANTHROPIC_CONCURRENCY_MESSAGE));
    const { result } = renderHook(() => useProviderDiagnostics());

    let response: Awaited<ReturnType<ReturnType<typeof useProviderDiagnostics>['testConnection']>>;
    await act(async () => {
      response = await result.current.testConnection('anthropic', 'sk-ant-12345678901234567890');
    });

    expect(aiProviderMocks.callAnthropicChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' }),
    );
    expect(response!.ok).toBe(false);
    expect(response!.message).toBe(ANTHROPIC_CONCURRENCY_MESSAGE);
  });
});
