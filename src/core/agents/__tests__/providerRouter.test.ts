import { describe, expect, it, vi } from 'vitest';
import type { AgentDefinition } from '../agentRegistry';
import { fetchAgentReply } from '../providerRouter';
import { JarvisCoreError } from '../../../services/jarvisCoreClient';
import type { JarvisCoreClient } from '../../../services/jarvisCoreClient';

type Scenario = {
  status: number;
  detail: string;
  expectation: string;
};

const buildLocalAgent = (): AgentDefinition => ({
  id: 'local-test',
  model: 'local-test-model',
  name: 'Agente Local de Pruebas',
  provider: 'Local',
  description: 'Agente ficticio para pruebas unitarias.',
  kind: 'local',
  accent: '#000000',
  active: true,
  status: 'Disponible',
});

const scenarios: Scenario[] = [
  {
    status: 401,
    detail: 'Token inválido',
    expectation: 'Revisa el token configurado en los ajustes de Jarvis Core',
  },
  {
    status: 403,
    detail: 'Acceso denegado',
    expectation: 'Revisa el token configurado en los ajustes de Jarvis Core',
  },
  {
    status: 404,
    detail: 'No active model',
    expectation: 'Activa un modelo local desde la sección de modelos',
  },
  {
    status: 409,
    detail: 'Model download in progress',
    expectation: 'Espera a que termine la descarga o activación del modelo',
  },
  {
    status: 503,
    detail: 'Service unavailable',
    expectation: 'Comprueba que el servicio esté en ejecución o reinícialo',
  },
  {
    status: 500,
    detail: 'Internal server error',
    expectation: 'Revisa los logs del servicio para obtener más información',
  },
];

describe('fetchAgentReply - Jarvis Core error handling', () => {
  scenarios.forEach(({ status, detail, expectation }) => {
    it(`mapea el código ${status} a un mensaje enriquecido`, async () => {
      const agent = buildLocalAgent();
      const onTrace = vi.fn();
      const fallback = vi.fn().mockReturnValue('respuesta alternativa');
      const jarvisClient = {
        sendChat: vi.fn().mockRejectedValue(new JarvisCoreError(detail, status)),
      };

      const outcome = await fetchAgentReply({
        agent,
        prompt: 'Hola agente',
        apiKeys: {},
        fallback,
        jarvisClient: jarvisClient as unknown as Pick<JarvisCoreClient, 'sendChat'>,
        onTrace,
      });

      expect(outcome.status).toBe('fallback');
      expect(outcome.response.content).toBe('respuesta alternativa');
      expect(outcome.errorMessage).toContain(expectation);
      expect(outcome.errorMessage).toContain(detail);

      const fallbackTrace = onTrace.mock.calls.at(-1)?.[0];
      expect(fallbackTrace?.type).toBe('fallback');
      expect(fallbackTrace?.payload).toContain('Error:');
      expect(fallbackTrace?.payload).toContain('respuesta alternativa');
      expect(fallbackTrace?.payload).toContain(expectation);
      expect(fallbackTrace?.payload).toContain(detail);

      expect(fallback).toHaveBeenCalledWith(agent, 'Hola agente', undefined);
      expect(jarvisClient.sendChat).toHaveBeenCalledOnce();
    });
  });
});
