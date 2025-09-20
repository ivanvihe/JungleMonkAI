import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { GlobalSettings, PluginSettingsEntry } from '../../types/globalSettings';
import type {
  LoadedPluginManifest,
  PluginCapability,
  PluginManifest,
  PluginCommandDescriptor,
  PluginMcpSessionPermission,
} from './index';
import { loadPluginManifest } from './index';

interface PluginManagerEntry extends LoadedPluginManifest {}

interface PluginHostTransport {
  listPlugins: () => Promise<PluginManagerEntry[]>;
  invokeCommand: (pluginId: string, command: string, payload: unknown) => Promise<unknown>;
}

interface PluginMessageActionContext {
  pluginId: string;
  id: string;
  label: string;
  description?: string;
  icon?: string;
  signature: string;
  command: string;
  type: 'chat-action' | 'mcp-session';
  capabilityId?: string;
  permissionId?: string;
  scopes?: string[];
  run: (input: { messageId: string; value: string }) => Promise<void>;
}

interface PluginSidePanelContribution {
  pluginId: string;
  id: string;
  label: string;
  Component: React.ComponentType;
}

interface RuntimePluginEntry {
  pluginId: string;
  manifest: PluginManifest;
  checksum: string;
  commands: PluginCommandDescriptor[];
}

interface PluginHostContextValue {
  plugins: RuntimePluginEntry[];
  messageActions: PluginMessageActionContext[];
  sidePanels: PluginSidePanelContribution[];
  updatePluginSettings: (
    pluginId: string,
    updater: (entry: PluginSettingsEntry | undefined) => PluginSettingsEntry,
  ) => void;
  refresh: () => void;
}

const PluginHostContext = createContext<PluginHostContextValue | undefined>(undefined);

const DEFAULT_TRANSPORT: PluginHostTransport = {
  listPlugins: async () => {
    if (typeof window !== 'undefined') {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        const response = await invoke<PluginManagerEntry[]>('plugin_list');
        return response;
      } catch (error) {
        console.warn('No se pudo consultar el listado de plugins', error);
      }
    }
    return [];
  },
  invokeCommand: async (pluginId, command, payload) => {
    if (typeof window !== 'undefined') {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri');
        await invoke('plugin_invoke', { pluginId, command, payload });
        return;
      } catch (error) {
        console.warn(`No se pudo invocar el comando ${command} del plugin ${pluginId}`, error);
        throw error;
      }
    }
    throw new Error('Plugin command transport is not disponible');
  },
};

const MODULE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];

const normalizeModulePath = (value: string): string => {
  const trimmed = value.replace(/^\.\/+/, '');
  return trimmed.replace(/\.(tsx|ts|jsx|js)$/i, '');
};

const buildLoaderIndex = (
  loaders: Record<string, () => Promise<{ default: React.ComponentType }>>,
) => {
  const index = new Map<string, Map<string, () => Promise<{ default: React.ComponentType }>>>();
  Object.entries(loaders).forEach(([path, loader]) => {
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/plugins\/(.+?)\/(.+)$/);
    if (!match) {
      return;
    }
    const [, pluginId, modulePath] = match;
    const withoutExtension = modulePath.replace(/\.(tsx|ts|jsx|js)$/i, '');
    if (!index.has(pluginId)) {
      index.set(pluginId, new Map());
    }
    const pluginMap = index.get(pluginId)!;
    pluginMap.set(withoutExtension, loader);
    pluginMap.set(modulePath, loader);
  });
  return index;
};

const moduleLoaders = buildLoaderIndex(
  import.meta.glob<{ default: React.ComponentType }>(
    '../../plugins/**/*.{ts,tsx,js,jsx}',
  ),
);

const resolvePanelComponent = async (
  pluginId: string,
  capability: Extract<PluginCapability, { type: 'workspace-panel' }>,
): Promise<React.ComponentType | null> => {
  if (capability.slot !== 'side-panel') {
    return null;
  }

  const loaderGroup = moduleLoaders.get(pluginId);
  if (!loaderGroup) {
    return null;
  }
  const normalized = normalizeModulePath(capability.module);
  const loader =
    loaderGroup.get(normalized) ??
    MODULE_EXTENSIONS.map(ext => `${normalized}.${ext}`)
      .map(candidate => loaderGroup.get(candidate))
      .find((candidate): candidate is (() => Promise<{ default: React.ComponentType }>) => !!candidate);

  if (!loader) {
    return null;
  }

  const module = await loader();
  return module.default ?? null;
};

const getAppVersion = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_VERSION) {
    return String(import.meta.env.VITE_APP_VERSION);
  }
  if (typeof window !== 'undefined') {
    return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? '0.0.0';
  }
  return '0.0.0';
};

interface PluginHostProviderProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (prev: GlobalSettings) => GlobalSettings) => void;
  children: React.ReactNode;
  transport?: PluginHostTransport;
  appVersion?: string;
}

export const PluginHostProvider: React.FC<PluginHostProviderProps> = ({
  settings,
  onSettingsChange,
  children,
  transport = DEFAULT_TRANSPORT,
  appVersion = getAppVersion(),
}) => {
  const [runtimePlugins, setRuntimePlugins] = useState<RuntimePluginEntry[]>([]);
  const [messageActions, setMessageActions] = useState<PluginMessageActionContext[]>([]);
  const [sidePanels, setSidePanels] = useState<PluginSidePanelContribution[]>([]);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision(prev => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPlugins = async () => {
      try {
        const response = await transport.listPlugins();
        const pluginList = Array.isArray(response) ? response : [];
        const entries: RuntimePluginEntry[] = [];
        for (const entry of pluginList) {
          try {
            const loaded = await loadPluginManifest({
              source: entry,
              currentVersion: appVersion,
              expectedChecksum: entry.checksum,
            });
            entries.push({
              pluginId: loaded.manifest.id,
              manifest: loaded.manifest,
              checksum: loaded.checksum,
              commands: loaded.manifest.commands ?? [],
            });
          } catch (error) {
            console.warn('No se pudo validar el manifiesto del plugin', error);
          }
        }
        if (!cancelled) {
          setRuntimePlugins(entries);
        }
      } catch (error) {
        console.warn('No se pudo cargar el manifiesto de plugins', error);
        if (!cancelled) {
          setRuntimePlugins([]);
        }
      }
    };

    void loadPlugins();

    return () => {
      cancelled = true;
    };
  }, [appVersion, transport, revision]);

  useEffect(() => {
    onSettingsChange(prev => {
      let changed = false;
      const pluginSettings: GlobalSettings['pluginSettings'] = Object.entries(prev.pluginSettings).reduce(
        (acc, [pluginId, entry]) => {
          acc[pluginId] = {
            enabled: entry.enabled,
            credentials: { ...entry.credentials },
            lastApprovedChecksum: entry.lastApprovedChecksum,
          };
          return acc;
        },
        {} as GlobalSettings['pluginSettings'],
      );
      const approvedManifests = { ...prev.approvedManifests };
      const enabledSet = new Set(prev.enabledPlugins);

      runtimePlugins.forEach(plugin => {
        if (!pluginSettings[plugin.pluginId]) {
          pluginSettings[plugin.pluginId] = { enabled: false, credentials: {} };
          changed = true;
        }

        const entry = pluginSettings[plugin.pluginId];
        if (entry.enabled) {
          enabledSet.add(plugin.pluginId);
        } else {
          enabledSet.delete(plugin.pluginId);
        }

        const agentProvider = plugin.manifest.capabilities.find(
          capability => capability.type === 'agent-provider',
        ) as Extract<PluginCapability, { type: 'agent-provider' }> | undefined;

        if (agentProvider?.agentManifests?.length && entry.enabled) {
          if (entry.lastApprovedChecksum !== plugin.checksum) {
            entry.lastApprovedChecksum = plugin.checksum;
            changed = true;
          }

          const previous = approvedManifests[plugin.pluginId];
          const manifests = agentProvider.agentManifests;
          const manifestsChanged =
            !previous ||
            previous.checksum !== plugin.checksum ||
            previous.manifests.length !== manifests.length ||
            previous.manifests.some((manifest, index) => {
              const candidate = manifests[index];
              return JSON.stringify(manifest) !== JSON.stringify(candidate);
            });

          if (manifestsChanged) {
            approvedManifests[plugin.pluginId] = {
              checksum: plugin.checksum,
              approvedAt:
                previous && previous.checksum === plugin.checksum
                  ? previous.approvedAt
                  : new Date().toISOString(),
              manifests,
            };
            changed = true;
          }
        } else if (approvedManifests[plugin.pluginId]) {
          delete approvedManifests[plugin.pluginId];
          changed = true;
        }
      });

      const enabledPlugins = Array.from(enabledSet).sort();
      const previousEnabled = [...prev.enabledPlugins].sort();

      if (
        !changed &&
        enabledPlugins.length === previousEnabled.length &&
        enabledPlugins.every((value, index) => value === previousEnabled[index]) &&
        Object.keys(pluginSettings).length === Object.keys(prev.pluginSettings).length &&
        Object.keys(approvedManifests).length === Object.keys(prev.approvedManifests).length
      ) {
        return prev;
      }

      return {
        ...prev,
        pluginSettings,
        enabledPlugins,
        approvedManifests,
      };
    });
  }, [runtimePlugins, onSettingsChange]);

  useEffect(() => {
    const activePlugins = runtimePlugins.filter(plugin => {
      const entry = settings.pluginSettings[plugin.pluginId];
      if (!entry || !entry.enabled) {
        return false;
      }
      if (entry.lastApprovedChecksum && entry.lastApprovedChecksum !== plugin.checksum) {
        return false;
      }
      return true;
    });

    const actionEntries: PluginMessageActionContext[] = [];
    activePlugins.forEach(plugin => {
      const commandMap = new Map<string, string>();
      plugin.commands.forEach(command => {
        commandMap.set(command.name, command.signature);
      });

      plugin.manifest.capabilities
        .forEach(capability => {
          if (capability.type === 'chat-action') {
            const signature = commandMap.get(capability.command);
            if (!signature) {
              return;
            }
            actionEntries.push({
              pluginId: plugin.pluginId,
              id: capability.id,
              label: capability.label,
              description: capability.description,
              icon: capability.icon,
              signature,
              command: capability.command,
              type: 'chat-action',
              run: async ({ messageId, value }) => {
                await transport.invokeCommand(plugin.pluginId, capability.command, {
                  messageId,
                  value,
                });
              },
            });
          }

          if (capability.type === 'mcp-session') {
            const permissions = capability.permissions ?? [];
            permissions.forEach((permission: PluginMcpSessionPermission) => {
              const signature = commandMap.get(permission.command);
              if (!signature) {
                return;
              }
              actionEntries.push({
                pluginId: plugin.pluginId,
                id: `${capability.id}:${permission.id}`,
                label: permission.label,
                description: permission.description,
                signature,
                command: permission.command,
                type: 'mcp-session',
                capabilityId: capability.id,
                permissionId: permission.id,
                scopes: permission.scopes ?? [],
                run: async ({ messageId, value }) => {
                  await transport.invokeCommand(plugin.pluginId, permission.command, {
                    messageId,
                    value,
                    capabilityId: capability.id,
                    permissionId: permission.id,
                    scopes: permission.scopes ?? [],
                  });
                },
              });
            });
          }
        });
    });

    setMessageActions(actionEntries);

    let cancelled = false;
    const loadPanels = async () => {
      const panelPromises = activePlugins.flatMap(plugin =>
        plugin.manifest.capabilities
          .filter(capability => capability.type === 'workspace-panel')
          .map(async capability => {
            const Component = await resolvePanelComponent(
              plugin.pluginId,
              capability as Extract<PluginCapability, { type: 'workspace-panel' }>,
            );
            if (!Component) {
              return null;
            }
            return {
              pluginId: plugin.pluginId,
              id: capability.id,
              label: capability.label,
              Component,
            };
          }),
      );

      const resolved = (await Promise.all(panelPromises)).filter(
        (value): value is PluginSidePanelContribution => value !== null,
      );

      if (!cancelled) {
        setSidePanels(resolved);
      }
    };

    void loadPanels();

    return () => {
      cancelled = true;
    };
  }, [runtimePlugins, settings.pluginSettings, settings.enabledPlugins, settings.approvedManifests, transport]);

  const updatePluginSettings = useCallback(
    (pluginId: string, updater: (entry: PluginSettingsEntry | undefined) => PluginSettingsEntry) => {
      onSettingsChange(prev => {
        const current = prev.pluginSettings[pluginId];
        const nextEntry = updater(current);
        if (current === nextEntry) {
          return prev;
        }
        return {
          ...prev,
          pluginSettings: {
            ...prev.pluginSettings,
            [pluginId]: nextEntry,
          },
        };
      });
    },
    [onSettingsChange],
  );

  const value = useMemo<PluginHostContextValue>(() => ({
    plugins: runtimePlugins,
    messageActions,
    sidePanels,
    updatePluginSettings,
    refresh,
  }), [runtimePlugins, messageActions, sidePanels, updatePluginSettings, refresh]);

  return <PluginHostContext.Provider value={value}>{children}</PluginHostContext.Provider>;
};

export const usePluginHost = (): PluginHostContextValue => {
  const context = useContext(PluginHostContext);
  if (!context) {
    throw new Error('usePluginHost must be used within a PluginHostProvider');
  }
  return context;
};
