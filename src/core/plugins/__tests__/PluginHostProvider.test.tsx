import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PluginHostProvider, usePluginHost } from '../PluginHostProvider';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import { loadPluginManifest } from '../index';

const manifestSource = {
  id: 'test-plugin',
  name: 'Plugin de pruebas',
  version: '1.0.0',
  capabilities: [
    {
      type: 'workspace-panel' as const,
      id: 'panel-extra',
      label: 'Panel de pruebas',
      slot: 'side-panel' as const,
      module: 'panels/TestPanel',
    },
    {
      type: 'chat-action' as const,
      id: 'notify',
      label: 'Notificar',
      command: 'notify',
    },
  ],
  commands: [
    {
      name: 'notify',
      description: 'Envía una notificación al backend.',
      signature: 'signature-notify',
    },
  ],
};

describe('PluginHostProvider', () => {
  it('inyecta paneles y acciones cuando el plugin está habilitado', async () => {
    const loaded = await loadPluginManifest({ source: manifestSource, currentVersion: '1.0.0' });
    const transport = {
      listPlugins: vi.fn(async () => [loaded]),
      invokeCommand: vi.fn(async () => undefined),
    };

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [settings, setSettings] = React.useState(() => {
        const base = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as typeof DEFAULT_GLOBAL_SETTINGS;
        return {
          ...base,
          enabledPlugins: ['test-plugin'],
          pluginSettings: {
            ...base.pluginSettings,
            'test-plugin': {
              enabled: true,
              credentials: {},
            },
          },
        };
      });

      return (
        <PluginHostProvider
          settings={settings}
          onSettingsChange={setSettings}
          transport={transport}
          appVersion="1.0.0"
        >
          {children}
        </PluginHostProvider>
      );
    };

    const Consumer: React.FC = () => {
      const { sidePanels, messageActions, plugins } = usePluginHost();
      const action = messageActions[0];

      return (
        <div>
          <span data-testid="plugin-count">{plugins.length}</span>
          {sidePanels.map(panel => (
            <panel.Component key={`${panel.pluginId}-${panel.id}`} />
          ))}
          <button
            type="button"
            data-testid="trigger-action"
            disabled={!action}
            onClick={() => action?.run({ messageId: 'msg-1', value: 'Hola' })}
          >
            Ejecutar acción
          </button>
        </div>
      );
    };

    render(
      <Wrapper>
        <Consumer />
      </Wrapper>,
    );

    await screen.findByTestId('test-plugin-panel');
    await waitFor(() =>
      expect(screen.getByTestId('trigger-action').hasAttribute('disabled')).toBe(false),
    );
    expect(screen.getByTestId('plugin-count').textContent).toBe('1');

    await act(async () => {
      screen.getByTestId('trigger-action').click();
    });

    expect(transport.invokeCommand).toHaveBeenCalledWith('test-plugin', 'notify', {
      messageId: 'msg-1',
      value: 'Hola',
    });
  });
});
