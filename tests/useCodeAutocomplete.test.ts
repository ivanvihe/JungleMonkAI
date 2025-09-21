import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodeAutocomplete } from '../src/hooks/useCodeAutocomplete';

const agentsMock = vi.fn();
const invokeChatMock = vi.fn();

vi.mock('../src/core/agents/AgentContext', () => ({
  useAgents: () => agentsMock(),
}));

vi.mock('../src/core/jarvis/JarvisCoreContext', () => ({
  useJarvisCore: () => ({ runtimeStatus: 'ready', invokeChat: invokeChatMock }),
}));

const providerMocks = vi.hoisted(() => ({
  callOpenAIChatMock: vi.fn(),
  callAnthropicChatMock: vi.fn(),
  callGroqChatMock: vi.fn(),
}));

vi.mock('../src/utils/aiProviders', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/utils/aiProviders')>();
  return {
    ...actual,
    callOpenAIChat: providerMocks.callOpenAIChatMock,
    callAnthropicChat: providerMocks.callAnthropicChatMock,
    callGroqChat: providerMocks.callGroqChatMock,
  };
});

const baseAgent = {
  id: 'openai-gpt-4o-mini',
  model: 'gpt-4o-mini',
  name: 'GPT',
  provider: 'OpenAI',
  description: 'test',
  kind: 'cloud',
  accent: '#fff',
  active: true,
  status: 'Disponible',
};

describe('useCodeAutocomplete', () => {
  beforeEach(() => {
    agentsMock.mockReturnValue({ agents: [{ ...baseAgent, apiKey: 'key-123' }] });
    providerMocks.callOpenAIChatMock.mockResolvedValue({ content: 'resultado', modalities: [] });
    providerMocks.callAnthropicChatMock.mockResolvedValue({ content: 'anthropic', modalities: [] });
    providerMocks.callGroqChatMock.mockResolvedValue({ content: 'groq', modalities: [] });
    invokeChatMock.mockResolvedValue({ message: 'jarvis' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('solicita autocompletado con OpenAI', async () => {
    const { result } = renderHook(() =>
      useCodeAutocomplete({ provider: 'openai', model: 'gpt-4o-mini' }),
    );

    await act(async () => {
      await result.current.requestAutocomplete({
        file: { id: 'f1', name: 'index.ts', language: 'typescript', content: 'const a = 1;' },
        cursor: { lineNumber: 1, column: 10 },
        files: [],
      });
    });

    expect(providerMocks.callOpenAIChatMock).toHaveBeenCalledOnce();
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].text).toBe('resultado');
  });

  it('usa Jarvis Core cuando se selecciona el proveedor local', async () => {
    const { result } = renderHook(() => useCodeAutocomplete({ provider: 'jarvis' }));

    await act(async () => {
      await result.current.requestAutocomplete({
        file: { id: 'f2', name: 'script.py', language: 'python', content: 'print("hola")' },
        files: [],
      });
    });

    expect(invokeChatMock).toHaveBeenCalledOnce();
    expect(result.current.suggestions[0].text).toBe('jarvis');
  });

  it('notifica error cuando falta la clave del proveedor', async () => {
    agentsMock.mockReturnValue({ agents: [{ ...baseAgent, apiKey: '' }] });
    const { result } = renderHook(() =>
      useCodeAutocomplete({ provider: 'openai', model: 'gpt-4o-mini' }),
    );

    await act(async () => {
      await result.current.requestAutocomplete({
        file: { id: 'f3', name: 'app.tsx', language: 'typescript', content: 'export {};' },
        files: [],
      });
    });

    expect(result.current.error).toMatch(/No hay credenciales/);
    expect(result.current.suggestions).toHaveLength(0);
  });
});
