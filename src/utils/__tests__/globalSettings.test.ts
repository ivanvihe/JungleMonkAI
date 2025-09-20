import { describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_GLOBAL_SETTINGS,
  migratePersistedGlobalSettings,
  validateGlobalSettingsPayload,
} from '../globalSettings';

import type { GlobalSettings } from '../../types/globalSettings';

describe('globalSettings schema validation', () => {
  it('acepta la configuración por defecto', () => {
    expect(validateGlobalSettingsPayload(DEFAULT_GLOBAL_SETTINGS)).toBe(true);
  });

  it('migra configuraciones legacy preservando API keys', () => {
    const legacy = {
      version: 3,
      apiKeys: {
        openai: 'sk-legacy-token ',
      },
    } as Partial<GlobalSettings>;

    const migrated = migratePersistedGlobalSettings(legacy);

    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.apiKeys.openai).toBe('sk-legacy-token');
    expect(migrated.mcpProfiles).toEqual([]);
  });

  it('valida configuraciones con perfiles MCP', () => {
    const candidate: GlobalSettings = {
      ...DEFAULT_GLOBAL_SETTINGS,
      mcpProfiles: [
        {
          id: 'studio',
          label: 'Servidor creativo',
          description: 'Sesión local para Ableton',
          autoConnect: true,
          token: 'secret-token',
          endpoints: [
            { id: 'ws-primary', transport: 'ws', url: 'ws://localhost:5005' },
            { id: 'status', transport: 'rest', url: 'http://localhost:5005/status' },
          ],
        },
      ],
    };

    expect(validateGlobalSettingsPayload(candidate)).toBe(true);
  });
});
