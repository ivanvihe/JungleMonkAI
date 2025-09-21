import React, { useEffect, useMemo, useState } from 'react';
import { GlobalSettings, McpCredentialEntry } from '../../types/globalSettings';
import {
  PREDEFINED_MCP_PROFILES,
  PredefinedMcpProfile,
  buildDefaultCredentialState,
  buildMcpProfileFromCatalog,
} from '../../core/mcp/predefinedProfiles';
import './McpManagerModal.css';

interface McpManagerModalProps {
  settings: GlobalSettings;
  onSettingsChange: (updater: (prev: GlobalSettings) => GlobalSettings) => void;
}

const ensureCredentialRecord = (
  entry: PredefinedMcpProfile,
  current: Record<string, McpCredentialEntry> | undefined,
): Record<string, McpCredentialEntry> => {
  const defaults = buildDefaultCredentialState(entry);
  if (!current) {
    return defaults;
  }
  const merged: Record<string, McpCredentialEntry> = { ...defaults, ...current };
  Object.keys(merged).forEach(key => {
    const value = merged[key];
    if (!value.id) {
      merged[key] = { ...value, id: key };
    }
  });
  return merged;
};

export const McpManagerModal: React.FC<McpManagerModalProps> = ({ settings, onSettingsChange }) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const catalog = useMemo(
    () => [...PREDEFINED_MCP_PROFILES].sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [],
  );

  useEffect(() => {
    if (!catalog.length) {
      setSelectedProfileId(null);
      return;
    }
    if (!selectedProfileId || !catalog.some(entry => entry.id === selectedProfileId)) {
      setSelectedProfileId(catalog[0]?.id ?? null);
    }
  }, [catalog, selectedProfileId]);

  const isProfileActive = (profileId: string) =>
    settings.mcpProfiles.some(profile => profile.id === profileId);

  const handleToggle = (entry: PredefinedMcpProfile, enabled: boolean) => {
    onSettingsChange(prev => {
      const active = prev.mcpProfiles.some(profile => profile.id === entry.id);
      if (enabled && active) {
        return prev;
      }
      if (!enabled && !active) {
        return prev;
      }

      const nextProfiles = enabled
        ? [...prev.mcpProfiles.filter(profile => profile.id !== entry.id), buildMcpProfileFromCatalog(entry)]
        : prev.mcpProfiles.filter(profile => profile.id !== entry.id);

      const currentCredentials = prev.mcpCredentials[entry.id];
      const mergedCredentials = ensureCredentialRecord(entry, currentCredentials);

      return {
        ...prev,
        mcpProfiles: nextProfiles,
        mcpCredentials: {
          ...prev.mcpCredentials,
          [entry.id]: mergedCredentials,
        },
      };
    });
  };

  const selectedProfile = catalog.find(entry => entry.id === selectedProfileId) ?? null;

  return (
    <div className="mcp-manager">
      <aside className="mcp-manager__list" aria-label="Catálogo de perfiles MCP">
        <h3>Perfiles disponibles</h3>
        <ul>
          {catalog.map(entry => {
            const active = isProfileActive(entry.id);
            const isActiveItem = entry.id === selectedProfileId;
            return (
              <li key={entry.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className={`mcp-manager__item${isActiveItem ? ' mcp-manager__item--active' : ''}`}
                  onClick={() => setSelectedProfileId(entry.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedProfileId(entry.id);
                    }
                  }}
                >
                  <div className="mcp-manager__item-header">
                    <div>
                      <strong>{entry.label}</strong>
                      {entry.description && (
                        <p className="mcp-manager__item-description">{entry.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      data-testid={`mcp-toggle-${entry.id}`}
                      className={`mcp-manager__toggle${active ? ' mcp-manager__toggle--on' : ''}`}
                      onClick={event => {
                        event.stopPropagation();
                        handleToggle(entry, !active);
                      }}
                      aria-pressed={active}
                      aria-label={`${active ? 'Desactivar' : 'Activar'} perfil ${entry.label}`}
                    >
                      {active ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="mcp-manager__details" aria-live="polite">
        {selectedProfile ? (
          <>
            <header>
              <h3>{selectedProfile.label}</h3>
              <span className="mcp-manager__badge">{isProfileActive(selectedProfile.id) ? 'Activo' : 'Disponible'}</span>
            </header>
            {selectedProfile.description && (
              <p className="mcp-manager__details-description">{selectedProfile.description}</p>
            )}

            <section className="mcp-manager__details-block">
              <h4>Endpoints</h4>
              <ul>
                {selectedProfile.endpoints.map(endpoint => (
                  <li key={endpoint.id}>
                    <span className="mcp-manager__endpoint-transport">{endpoint.transport.toUpperCase()}</span>
                    <span className="mcp-manager__endpoint-url">{endpoint.url}</span>
                  </li>
                ))}
              </ul>
            </section>

            {selectedProfile.scopes.length ? (
              <section className="mcp-manager__details-block">
                <h4>Scopes sugeridos</h4>
                <ul className="mcp-manager__scopes">
                  {selectedProfile.scopes.map(scope => (
                    <li key={scope}>{scope}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selectedProfile.credentialRequirements?.length ? (
              <section className="mcp-manager__details-block">
                <h4>Credenciales</h4>
                <p className="mcp-manager__credentials-empty">
                  Configura las credenciales desde Ajustes globales → {selectedProfile.label}.
                </p>
              </section>
            ) : (
              <p className="mcp-manager__credentials-empty">
                Este perfil no requiere credenciales adicionales para activarse.
              </p>
            )}
          </>
        ) : (
          <p className="mcp-manager__details-empty">Selecciona un conector para ver los detalles.</p>
        )}
      </section>
    </div>
  );
};

export default McpManagerModal;
