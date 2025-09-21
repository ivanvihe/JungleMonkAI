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
    expect(migrated.dataLocation.useCustomPath).toBe(false);
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
      dataLocation: {
        ...DEFAULT_GLOBAL_SETTINGS.dataLocation,
        useCustomPath: true,
        customPath: '/tmp/jungle',
        lastKnownBasePath: '/tmp/jungle',
        defaultPath: '/Users/me/Library/Application Support/JungleMonkAI',
      },
    };

    expect(validateGlobalSettingsPayload(candidate)).toBe(true);
  });

  it('normaliza proyectos y selecciona el activo más reciente al migrar', () => {
    const migrated = migratePersistedGlobalSettings({
      version: CURRENT_SCHEMA_VERSION - 1,
      projectProfiles: [
        {
          id: 'demo',
          name: ' Demo Workspace ',
          repositoryPath: ' /projects/demo ',
          defaultBranch: ' develop ',
          instructions: 'Revisar CI antes de desplegar.\n ',
          preferredProvider: ' OpenAI ',
          preferredModel: ' gpt-4 ',
        },
      ],
      activeProjectId: 'unknown',
    } as Partial<GlobalSettings>);

    expect(migrated.projectProfiles).toHaveLength(1);
    const [project] = migrated.projectProfiles;
    expect(project.repositoryPath).toBe('/projects/demo');
    expect(project.defaultBranch).toBe('develop');
    expect(project.preferredProvider).toBe('OpenAI');
    expect(project.preferredModel).toBe('gpt-4');
    expect(project.orchestrator?.primaryProvider).toBe('OpenAI');
    expect(project.orchestrator?.primaryModel).toBe('gpt-4');
    expect(project.orchestrator?.mode).toBe('cloud');
    expect(project.instructions).toBe('Revisar CI antes de desplegar.');
    expect(migrated.activeProjectId).toBe('demo');
  });
});
