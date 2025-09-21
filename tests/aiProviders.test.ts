import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callAnthropicChat, callGroqChat, callOpenAIChat } from '../src/utils/aiProviders';

type MockFetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const createMockResponse = (status: number, body: unknown): MockFetchResponse => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(payload),
  };
};

const installFetchMock = (responses: Array<{ status: number; body: unknown }>) => {
  const queue = [...responses];
  const mock = vi.fn(async () => {
    const entry = queue.shift() ?? responses[responses.length - 1];
    return createMockResponse(entry.status, entry.body);
  });
  // @ts-expect-error: jsdom typings
  globalThis.fetch = mock;
  return mock;
};

const resetRuntime = () => {
  delete (globalThis as unknown as { window?: unknown }).window;
};

const setElectronRuntime = (callProviderChat: ReturnType<typeof vi.fn>) => {
  (globalThis as unknown as { window?: unknown }).window = {
    electronAPI: {
      callProviderChat,
    },
  };
};

const sanitizeGlobals = () => {
  delete (globalThis as { __anthropicLimiter__?: unknown }).__anthropicLimiter__;
};

let originalFetch: typeof fetch | undefined;
let originalWindow: typeof window | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  // @ts-expect-error: jsdom typings
  originalWindow = globalThis.window;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sanitizeGlobals();
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  }

  if (typeof originalWindow === 'undefined') {
    resetRuntime();
  } else {
    (globalThis as unknown as { window?: typeof window }).window = originalWindow;
  }

  sanitizeGlobals();
});

describe('callOpenAIChat', () => {
  describe('browser runtime', () => {
    it('resuelve contenido cuando la API responde con éxito', async () => {
      resetRuntime();
      installFetchMock([
        {
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: [
                    {
                      type: 'text',
                      text: 'Hola desde OpenAI',
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);

      const response = await callOpenAIChat({
        apiKey: 'sk-browser-key',
        model: 'gpt-test',
        prompt: 'Hola',
      });

      expect(response.content).toBe('Hola desde OpenAI');
      expect(response.modalities).toEqual(['text']);
    });

    it('propaga el mensaje de error y registra la API key enmascarada', async () => {
      resetRuntime();
      const fetchMock = installFetchMock([
        {
          status: 500,
          body: { error: { message: 'OpenAI se rompió' } },
        },
        {
          status: 500,
          body: { error: { message: 'OpenAI se rompió' } },
        },
      ]);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        callOpenAIChat({
          apiKey: 'sk-openai-secret-key',
          model: 'gpt-test',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('OpenAI se rompió');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });

  describe('bridge runtime', () => {
    it('utiliza el bridge de Electron y devuelve el contenido', async () => {
      const callProviderChat = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Respuesta bridged',
                },
              ],
            },
          },
        ],
      });

      setElectronRuntime(callProviderChat);

      const response = await callOpenAIChat({
        apiKey: '  sk-bridge-openai  ',
        model: 'gpt-test',
        prompt: 'Hola',
      });

      expect(callProviderChat).toHaveBeenCalledWith(
        'openai',
        expect.objectContaining({
          apiKey: 'sk-bridge-openai',
        }),
      );
      expect(response.content).toBe('Respuesta bridged');
      expect(response.modalities).toEqual(['text']);
    });

    it('registra errores en el bridge con la API key enmascarada', async () => {
      const callProviderChat = vi.fn().mockRejectedValue(new Error('Bridge caído'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setElectronRuntime(callProviderChat);

      await expect(
        callOpenAIChat({
          apiKey: 'sk-bridge-error-openai',
          model: 'gpt-test',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('Bridge caído');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });
});

describe('callGroqChat', () => {
  describe('browser runtime', () => {
    it('retorna contenido en una respuesta exitosa', async () => {
      resetRuntime();
      installFetchMock([
        {
          status: 200,
          body: {
            choices: [
              {
                message: {
                  content: [
                    {
                      type: 'text',
                      text: 'Hola desde Groq',
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);

      const response = await callGroqChat({
        apiKey: 'sk-groq-browser',
        model: 'llama',
        prompt: 'Hola',
      });

      expect(response.content).toBe('Hola desde Groq');
      expect(response.modalities).toEqual(['text']);
    });

    it('lanza el mensaje de error devuelto por Groq', async () => {
      resetRuntime();
      const fetchMock = installFetchMock([
        {
          status: 500,
          body: { error: { message: 'Groq en mantenimiento' } },
        },
        {
          status: 500,
          body: { error: { message: 'Groq en mantenimiento' } },
        },
      ]);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        callGroqChat({
          apiKey: 'sk-groq-secret',
          model: 'llama',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('Groq en mantenimiento');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });

  describe('bridge runtime', () => {
    it('envía la solicitud mediante el bridge de Electron', async () => {
      const callProviderChat = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Groq vía bridge',
                },
              ],
            },
          },
        ],
      });

      setElectronRuntime(callProviderChat);

      const response = await callGroqChat({
        apiKey: 'sk-groq-bridge',
        model: 'llama',
        prompt: 'Hola',
      });

      expect(callProviderChat).toHaveBeenCalledWith(
        'groq',
        expect.objectContaining({ apiKey: 'sk-groq-bridge' }),
      );
      expect(response.content).toBe('Groq vía bridge');
    });

    it('registra los errores del bridge y los propaga', async () => {
      const callProviderChat = vi.fn().mockRejectedValue(new Error('Bridge Groq error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setElectronRuntime(callProviderChat);

      await expect(
        callGroqChat({
          apiKey: 'sk-groq-bridge-error',
          model: 'llama',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('Bridge Groq error');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });
});

describe('callAnthropicChat', () => {
  describe('browser runtime', () => {
    it('devuelve contenido textual cuando la respuesta es válida', async () => {
      resetRuntime();
      installFetchMock([
        {
          status: 200,
          body: {
            content: [
              {
                type: 'text',
                text: 'Hola desde Anthropic',
              },
            ],
          },
        },
      ]);

      const response = await callAnthropicChat({
        apiKey: 'sk-anthropic-browser',
        model: 'claude',
        prompt: 'Hola',
      });

      expect(response.content).toBe('Hola desde Anthropic');
      expect(response.modalities).toEqual(['text']);
    });

    it('propaga los errores de la API y reintenta la solicitud', async () => {
      resetRuntime();
      const fetchMock = installFetchMock([
        {
          status: 503,
          body: { error: { message: 'Anthropic saturado' } },
        },
        {
          status: 503,
          body: { error: { message: 'Anthropic saturado' } },
        },
      ]);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        callAnthropicChat({
          apiKey: 'sk-anthropic-error',
          model: 'claude',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('Anthropic saturado');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });

  describe('bridge runtime', () => {
    it('usa el bridge y devuelve el contenido en éxito', async () => {
      const callProviderChat = vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Anthropic bridge',
          },
        ],
      });

      setElectronRuntime(callProviderChat);

      const response = await callAnthropicChat({
        apiKey: 'sk-anthropic-bridge',
        model: 'claude',
        prompt: 'Hola',
      });

      expect(callProviderChat).toHaveBeenCalledWith(
        'anthropic',
        expect.objectContaining({ apiKey: 'sk-anthropic-bridge' }),
      );
      expect(response.content).toBe('Anthropic bridge');
    });

    it('registra los errores del bridge y lanza la excepción resultante', async () => {
      const callProviderChat = vi.fn().mockRejectedValue(new Error('Anthropic bridge caído'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      setElectronRuntime(callProviderChat);

      await expect(
        callAnthropicChat({
          apiKey: 'sk-anthropic-error',
          model: 'claude',
          prompt: 'Hola',
        }),
      ).rejects.toThrow('Anthropic bridge caído');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const [, context] = consoleErrorSpy.mock.calls.at(-1) ?? [];
      expect(context).toMatchObject({ apiKey: expect.stringContaining('…') });
    });
  });
});
