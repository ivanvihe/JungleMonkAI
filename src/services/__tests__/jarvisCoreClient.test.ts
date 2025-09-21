import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createJarvisCoreClient,
  JarvisCoreError,
  type JarvisChatEvent,
} from '../jarvisCoreClient';

const buildResponse = (body: unknown, init?: ResponseInit): Response => {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
};

describe('jarvisCoreClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invoca el endpoint de salud e incluye encabezados de autenticación', async () => {
    fetchMock.mockResolvedValueOnce(buildResponse({ status: 'ok' }));

    const client = createJarvisCoreClient({
      baseUrl: 'http://localhost:9999',
      apiKey: 'secreta',
      fetchImpl: fetchMock as typeof fetch,
    });

    const response = await client.getHealth();

    expect(response.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9999/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      }),
    );

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer secreta');
  });

  it('agrega el progreso descargado al listar modelos', async () => {
    fetchMock
      .mockResolvedValueOnce(buildResponse([{ model_id: 'phi', state: 'downloading' }]))
      .mockResolvedValueOnce(buildResponse({ status: 'downloading', downloaded: 1024, total: 2048, percent: 50 }));

    const client = createJarvisCoreClient({ baseUrl: 'http://localhost:3000', fetchImpl: fetchMock as typeof fetch });

    const models = await client.listModels();

    expect(models).toHaveLength(1);
    expect(models[0].model_id).toBe('phi');
    expect(models[0].progress?.downloaded).toBe(1024);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/models/phi/progress',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('devuelve un generador asincrónico cuando el chat es en streaming', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"delta":"hola"}\n\n'));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const client = createJarvisCoreClient({ baseUrl: 'http://localhost:4400', fetchImpl: fetchMock as typeof fetch });

    const result = await client.sendChat({ prompt: 'hola', stream: true });

    const received: JarvisChatEvent[] = [];
    expect(result && typeof (result as AsyncIterable<JarvisChatEvent>)[Symbol.asyncIterator]).toBe('function');

    for await (const chunk of result as AsyncIterable<JarvisChatEvent>) {
      received.push(chunk);
    }

    expect(received).toEqual([{ delta: 'hola' }]);
  });

  it('lanza un error descriptivo cuando la respuesta es inválida', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const client = createJarvisCoreClient({ baseUrl: 'http://localhost:3001', fetchImpl: fetchMock as typeof fetch });

    await expect(client.getHealth()).rejects.toBeInstanceOf(JarvisCoreError);
  });
});
