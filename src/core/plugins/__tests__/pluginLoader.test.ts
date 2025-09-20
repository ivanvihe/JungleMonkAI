import { describe, expect, it } from 'vitest';
import { loadPluginManifest } from '../index';

const baseManifest = {
  id: 'acme-tools',
  name: 'Acme Tools',
  version: '1.0.0',
  capabilities: [
    {
      type: 'chat-action',
      id: 'share-snippet',
      label: 'Compartir con Acme',
      command: 'send-snippet',
    },
  ],
  commands: [
    {
      name: 'send-snippet',
      description: 'Envía el fragmento al servicio remoto.',
      signature: 'dummy-signature',
    },
  ],
};

describe('loadPluginManifest', () => {
  it('calcula la firma y valida la compatibilidad', async () => {
    const loaded = await loadPluginManifest({ source: baseManifest, currentVersion: '0.1.0' });
    expect(loaded.manifest.id).toBe('acme-tools');

    const verified = await loadPluginManifest({
      source: {
        ...baseManifest,
        integrity: {
          algorithm: 'sha256',
          hash: loaded.checksum,
        },
      },
      currentVersion: '0.1.0',
      expectedChecksum: loaded.checksum,
    });

    expect(verified.checksum).toBe(loaded.checksum);
  });

  it('rechaza manifiestos incompatibles', async () => {
    await expect(
      loadPluginManifest({
        source: {
          ...baseManifest,
          compatibility: { minVersion: '9.9.9' },
        },
        currentVersion: '0.1.0',
      }),
    ).rejects.toThrow(/requiere la versión 9\.9\.9/);
  });

  it('normaliza capacidades mcp-session y filtra endpoints inválidos', async () => {
    const loaded = await loadPluginManifest({
      source: {
        ...baseManifest,
        capabilities: [
          ...baseManifest.capabilities,
          {
            type: 'mcp-session',
            id: 'session-1',
            label: 'Sesión de prueba',
            endpoints: [
              { transport: 'ws', url: 'ws://localhost:17654' },
              { transport: 'invalid', url: 'ipc://socket' },
            ],
            permissions: [
              {
                id: 'perm',
                label: 'Permiso válido',
                command: 'send-snippet',
                scopes: ['test:scope', 42],
              },
              {
                id: 'invalid',
                label: 'Invalid',
                command: 123,
              } as unknown as Record<string, unknown>,
            ],
          },
        ],
      },
      currentVersion: '0.1.0',
    });

    const session = loaded.manifest.capabilities.find(
      capability => capability.type === 'mcp-session',
    ) as Extract<typeof loaded.manifest.capabilities[number], { type: 'mcp-session' }>;

    expect(session?.endpoints).toEqual([
      { transport: 'ws', url: 'ws://localhost:17654' },
    ]);
    expect(session?.permissions).toEqual([
      {
        id: 'perm',
        label: 'Permiso válido',
        description: undefined,
        command: 'send-snippet',
        scopes: ['test:scope'],
      },
    ]);
  });
});
