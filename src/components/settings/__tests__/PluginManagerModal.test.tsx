import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManagerModal } from '../PluginManagerModal';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { GlobalSettings } from '../../../types/globalSettings';

const refreshMock = vi.fn();

const mockPlugins = [
  {
    pluginId: 'ableton-mixer',
    manifest: {
      id: 'ableton-mixer',
      name: 'Ableton Mixer',
      version: '0.1.0',
      description: 'Panel de mezcla para Ableton.',
      capabilities: [],
      commands: [],
    },
    checksum: 'checksum',
    commands: [],
  },
];

vi.mock('../../../core/plugins/PluginHostProvider', () => ({
  usePluginHost: () => ({
    plugins: mockPlugins,
    refresh: refreshMock,
    messageActions: [],
    sidePanels: [],
    updatePluginSettings: vi.fn(),
  }),
}));

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
    return (
      <div>
        <PluginManagerModal settings={settings} onSettingsChange={updater => setSettings(prev => updater(prev))} />
        <output data-testid="enabled-plugins">{settings.enabledPlugins.join(',')}</output>
      </div>
    );
  };

  return render(<Wrapper />);
};

beforeEach(() => {
  refreshMock.mockClear();
});

describe('PluginManagerModal', () => {
  it('activates and desactiva plugins desde el panel', () => {
    renderWithState();

    const toggle = screen.getByTestId('plugin-toggle-ableton-mixer');
    fireEvent.click(toggle);

    expect(screen.getByTestId('enabled-plugins').textContent).toContain('ableton-mixer');
    expect(refreshMock).toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(screen.getByTestId('enabled-plugins').textContent).toBe('');
  });
});
