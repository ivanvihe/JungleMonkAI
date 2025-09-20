import { describe, expect, beforeEach, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_GLOBAL_SETTINGS,
  loadGlobalSettings,
  migratePersistedGlobalSettings,
} from '../src/utils/globalSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('globalSettings model preferences', () => {
  it('includes model preferences in default payload', () => {
    const settings = loadGlobalSettings();

    expect(settings.modelPreferences).toBeDefined();
    expect(settings.modelPreferences.storageDir).toBeNull();
    expect(settings.modelPreferences.huggingFace.apiBaseUrl).toBeTruthy();
    expect(typeof settings.modelPreferences.huggingFace.maxResults).toBe('number');
  });

  it('migrates legacy payloads without model preferences', () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as typeof DEFAULT_GLOBAL_SETTINGS;
    delete (legacy as any).modelPreferences;
    legacy.version = CURRENT_SCHEMA_VERSION - 1;

    const migrated = migratePersistedGlobalSettings(legacy);

    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.modelPreferences).toBeDefined();
    expect(migrated.modelPreferences.huggingFace.apiBaseUrl).toBeTruthy();
  });
});
