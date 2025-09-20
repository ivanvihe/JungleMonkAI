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
});
