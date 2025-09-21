import React, { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSettingsDialog } from '../GlobalSettingsDialog';
import { DEFAULT_GLOBAL_SETTINGS } from '../../../utils/globalSettings';
import type { ApiKeySettings, GlobalSettings } from '../../../types/globalSettings';
import {
  providerSecretExists,
  revealProviderSecret,
  storeProviderSecret,
} from '../../../utils/secrets';

const pluginHostMock = {
  plugins: [] as Array<{
    pluginId: string;
    manifest: {
      id: string;
      name: string;
      version: string;
      description?: string;
      capabilities: unknown[];
      credentials?: Array<{ id: string; label: string; required?: boolean }>;
      commands?: unknown[];
    };
    checksum: string;
    commands: unknown[];
  }>,
  refresh: vi.fn(),
  messageActions: [] as unknown[],
  sidePanels: [] as unknown[],
  updatePluginSettings: vi.fn(),
};

vi.mock('../../../core/plugins/PluginHostProvider', () => ({
  usePluginHost: () => pluginHostMock,
}));

vi.mock('../../../utils/secrets', () => ({
  storeProviderSecret: vi.fn(),
  providerSecretExists: vi.fn(),
  revealProviderSecret: vi.fn(),
}));

const storeProviderSecretMock = vi.mocked(storeProviderSecret);
const providerSecretExistsMock = vi.mocked(providerSecretExists);
const revealProviderSecretMock = vi.mocked(revealProviderSecret);

const createSettings = (): GlobalSettings =>
  JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SETTINGS)) as GlobalSettings;

const renderDialog = (options?: { initialSettings?: GlobalSettings }) => {
  const baseSettings = options?.initialSettings ?? createSettings();

  const Wrapper: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [settings, setSettings] = useState<GlobalSettings>(
      () => JSON.parse(JSON.stringify(baseSettings)) as GlobalSettings,
    );
    const [apiKeys, setApiKeys] = useState<ApiKeySettings>({ ...baseSettings.apiKeys });

    const handleApiKeyChange = (provider: string, value: string) => {
      setApiKeys(prev => ({
        ...prev,
        [provider]: value,
      }));
    };

    return (
      <div>
        <GlobalSettingsDialog
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          settings={settings}
          apiKeys={apiKeys}
          onApiKeyChange={handleApiKeyChange}
          onSettingsChange={updater => setSettings(prev => updater(prev))}
        />
        <button type="button" data-testid="reopen" onClick={() => setIsOpen(true)}>
          Reabrir
        </button>
        <output data-testid="github-key">{apiKeys.github ?? ''}</output>
        <output data-testid="plugin-settings">{JSON.stringify(settings.pluginSettings)}</output>
      </div>
    );
  };

  return render(<Wrapper />);
};

describe('GlobalSettingsDialog – tokens seguros', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    storeProviderSecretMock.mockReset();
    providerSecretExistsMock.mockReset();
    revealProviderSecretMock.mockReset();
    pluginHostMock.plugins = [];
    pluginHostMock.refresh.mockReset();
    pluginHostMock.updatePluginSettings.mockReset();
    pluginHostMock.messageActions.length = 0;
    pluginHostMock.sidePanels.length = 0;
  });

  it('precarga el token almacenado y conserva el marcador seguro al cerrar', async () => {
    revealProviderSecretMock.mockResolvedValue('ghp_existing');
    providerSecretExistsMock.mockImplementation(async provider => {
      if (provider === 'github') {
        return true;
      }
      return false;
    });

    renderDialog();

    const githubInput = await screen.findByLabelText(/GitHub/);
    await waitFor(() => expect(githubInput).toHaveValue('ghp_existing'));

    await waitFor(() => expect(screen.getByTestId('github-key').textContent).toBe('__secure__'));

    fireEvent.click(screen.getByLabelText('Cerrar'));

    expect(screen.getByTestId('github-key').textContent).toBe('__secure__');

    fireEvent.click(screen.getByTestId('reopen'));

    const reopenedGithubInput = await screen.findByLabelText(/GitHub/);
    await waitFor(() => expect(reopenedGithubInput).toHaveValue('ghp_existing'));
    expect(screen.getByTestId('github-key').textContent).toBe('__secure__');
    expect(revealProviderSecretMock).toHaveBeenCalledTimes(2);
  });

  it('almacena un nuevo token, actualiza el estado y lo recupera al reabrir', async () => {
    let storedGithubToken: string | null = null;

    storeProviderSecretMock.mockImplementation(async (_provider, token) => {
      storedGithubToken = token || null;
    });

    providerSecretExistsMock.mockImplementation(async provider => {
      if (provider === 'github') {
        return Boolean(storedGithubToken);
      }
      return false;
    });

    revealProviderSecretMock.mockImplementation(async provider => {
      if (provider === 'github') {
        return storedGithubToken;
      }
      return null;
    });

    renderDialog();

    const githubInput = await screen.findByLabelText(/GitHub/);
    expect(githubInput).toHaveValue('');

    fireEvent.change(githubInput, { target: { value: '  ghp_new   ' } });
    const githubSection = githubInput.closest('.secure-provider');
    if (!githubSection) {
      throw new Error('No se encontró la sección de GitHub');
    }
    const saveButton = within(githubSection).getByRole('button', { name: 'Guardar' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(storeProviderSecretMock).toHaveBeenCalledWith('github', 'ghp_new'));
    await waitFor(() => expect(screen.getByTestId('github-key').textContent).toBe('__secure__'));
    await waitFor(() => expect(githubInput).toHaveValue(''));

    fireEvent.click(screen.getByLabelText('Cerrar'));
    fireEvent.click(screen.getByTestId('reopen'));

    const reopenedGithubInput = await screen.findByLabelText(/GitHub/);
    await waitFor(() => expect(reopenedGithubInput).toHaveValue('ghp_new'));
    expect(screen.getByTestId('github-key').textContent).toBe('__secure__');
    expect(providerSecretExistsMock.mock.calls.filter(([provider]) => provider === 'github').length).toBeGreaterThanOrEqual(2);
  });

  it('elimina el token almacenado cuando se deja el campo vacío', async () => {
    let storedGithubToken: string | null = 'ghp_initial';

    storeProviderSecretMock.mockImplementation(async (_provider, token) => {
      storedGithubToken = token || null;
    });

    providerSecretExistsMock.mockImplementation(async provider => {
      if (provider === 'github') {
        return Boolean(storedGithubToken);
      }
      return false;
    });

    revealProviderSecretMock.mockImplementation(async provider => {
      if (provider === 'github') {
        return storedGithubToken;
      }
      return null;
    });

    renderDialog();

    const githubInput = await screen.findByLabelText(/GitHub/);
    await waitFor(() => expect(githubInput).toHaveValue('ghp_initial'));

    fireEvent.change(githubInput, { target: { value: '' } });
    const githubSection = githubInput.closest('.secure-provider');
    if (!githubSection) {
      throw new Error('No se encontró la sección de GitHub');
    }
    const deleteButton = within(githubSection).getByRole('button', { name: 'Eliminar' });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(storeProviderSecretMock).toHaveBeenCalledWith('github', ''));
    await waitFor(() => expect(providerSecretExistsMock.mock.calls.filter(([provider]) => provider === 'github').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByTestId('github-key').textContent).toBe('');
    expect(githubInput).toHaveValue('');
    expect(within(githubSection).getByText(/pendiente/)).toBeInTheDocument();
  });

  it('renderiza secciones dinámicas de plugins y valida credenciales requeridas', async () => {
    const settingsWithPlugin = createSettings();
    settingsWithPlugin.enabledPlugins = ['ableton-mixer'];
    settingsWithPlugin.pluginSettings = {
      ...settingsWithPlugin.pluginSettings,
      'ableton-mixer': { enabled: true, credentials: { token: '' } },
    };

    pluginHostMock.plugins = [
      {
        pluginId: 'ableton-mixer',
        manifest: {
          id: 'ableton-mixer',
          name: 'Ableton Mixer',
          version: '0.1.0',
          description: 'Control remoto de tu sesión.',
          capabilities: [],
          credentials: [{ id: 'token', label: 'Token API', required: true }],
          commands: [],
        },
        checksum: 'checksum',
        commands: [],
      },
    ];

    renderDialog({ initialSettings: settingsWithPlugin });

    const pluginTab = await screen.findByRole('tab', { name: 'Ableton Mixer' });
    fireEvent.click(pluginTab);

    const pluginSection = await screen.findByRole('heading', { name: 'Ableton Mixer' });
    const pluginSectionContainer = pluginSection.closest('.plugin-settings-section');
    if (!pluginSectionContainer) {
      throw new Error('No se encontró el contenedor de la sección del plugin');
    }
    const pluginWithin = within(pluginSectionContainer);

    const credentialInput = pluginWithin.getByLabelText('Token API');
    fireEvent.blur(credentialInput);

    await waitFor(() => {
      expect(pluginWithin.getByText('Este campo es obligatorio.')).toBeInTheDocument();
    });

    fireEvent.change(credentialInput, { target: { value: 'ableton-secret' } });

    await waitFor(() => {
      const snapshot = screen.getByTestId('plugin-settings').textContent ?? '{}';
      const parsed = JSON.parse(snapshot) as Record<string, { credentials: Record<string, string> }>;
      expect(parsed['ableton-mixer'].credentials.token).toBe('ableton-secret');
    });
  });
});
