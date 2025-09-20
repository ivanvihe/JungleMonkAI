import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { McpManagerModal } from '../McpManagerModal';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { GlobalSettings } from '../../../types/globalSettings';

type SettingsUpdater = (updater: (prev: GlobalSettings) => GlobalSettings) => void;

const createSettings = (): GlobalSettings => ({
  ...DEFAULT_GLOBAL_SETTINGS,
  pluginSettings: {},
  enabledPlugins: [],
  mcpProfiles: [],
  mcpCredentials: {},
});

const renderWithState = () => {
  const Wrapper: React.FC = () => {
    const [settings, setSettings] = useState<GlobalSettings>(createSettings());
    const handleUpdate: SettingsUpdater = updater => setSettings(prev => updater(prev));
    const activeProfiles = settings.mcpProfiles.map(profile => profile.id).join(',');
    const credentialKeys = Object.keys(settings.mcpCredentials.gmail ?? {}).join(',');

    return (
      <div>
        <McpManagerModal settings={settings} onSettingsChange={handleUpdate} />
        <output data-testid="active-profiles">{activeProfiles}</output>
        <output data-testid="gmail-credentials">{credentialKeys}</output>
      </div>
    );
  };

  return render(<Wrapper />);
};

describe('McpManagerModal', () => {
  it('activa perfiles predefinidos y prepara credenciales', () => {
    renderWithState();

    const toggle = screen.getByTestId('mcp-toggle-gmail');
    fireEvent.click(toggle);

    expect(screen.getByTestId('active-profiles').textContent).toContain('gmail');
    expect(screen.getByTestId('gmail-credentials').textContent).toContain('oauthToken');
  });
});
