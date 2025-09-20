import { describe, expect, it } from 'vitest';
import type { AgentManifest } from '../../../types/agents';
import { AgentRegistryService } from '../AgentRegistryService';
import { syncAgentWithApiKeys } from '../agentRegistry';
import { registerExternalProviders } from '../../../utils/globalSettings';

const buildManifest = (overrides?: Partial<AgentManifest>): AgentManifest => ({
  provider: 'AcmeAI',
  capabilities: ['creative'],
  models: [
    {
      id: 'acme-pro',
      name: 'Acme Pro',
      model: 'acme-pro-v1',
      description: 'Agente de pruebas para validación de manifests.',
      kind: 'cloud',
      defaultActive: true,
      aliases: ['acme'],
      channel: 'acme',
    },
  ],
  ...overrides,
});

describe('AgentRegistryService', () => {
  it('combines builtin agents with plugin manifests', () => {
    const service = new AgentRegistryService([]);
    const manifest = buildManifest({
      capabilities: ['vision', 'analysis'],
      models: [
        {
          id: 'vision-pro',
          name: 'Vision Pro',
          model: 'vision-pro-1',
          description: 'Modelo especializado en análisis visual.',
          kind: 'cloud',
          defaultActive: false,
          accent: '#123456',
          aliases: ['vision'],
        },
      ],
    });

    service.applyPluginManifests([{ pluginId: 'acme', manifests: [manifest] }]);

    const agents = service.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: 'acme-vision-pro',
      name: 'Vision Pro',
      provider: 'AcmeAI',
      pluginId: 'acme',
      capabilities: ['vision', 'analysis'],
      active: false,
      status: 'Inactivo',
    });
  });

  it('synchronizes API keys for external providers loaded from manifests', () => {
    const service = new AgentRegistryService([]);
    const manifest = buildManifest({
      provider: 'Replicate',
      models: [
        {
          id: 'replicate-fast',
          name: 'Replicate Fast',
          model: 'replicate-fast-v1',
          description: 'Modelo de inferencia rápida.',
          kind: 'cloud',
          defaultActive: true,
        },
      ],
    });

    service.applyPluginManifests([{ pluginId: 'replicate', manifests: [manifest] }]);

    const [agent] = service.getAgents();
    registerExternalProviders([agent.provider]);

    const synced = syncAgentWithApiKeys(agent, { replicate: 'rk-test-key' });
    expect(synced.apiKey).toBe('rk-test-key');
    expect(synced.status).toBe('Disponible');

    const withoutKey = syncAgentWithApiKeys({ ...agent, active: true }, { replicate: '' });
    expect(withoutKey.status).toBe('Sin clave');
  });
});
