import React, { useMemo, useState } from 'react';
import type { McpCredentialEntry, McpProfile } from '../../types/globalSettings';
import { getPredefinedMcpProfile } from '../../core/mcp/predefinedProfiles';

interface McpSettingsSectionProps {
  profile: McpProfile;
  credentials: Record<string, McpCredentialEntry> | undefined;
  onCredentialChange: (
    fieldId: string,
    type: McpCredentialEntry['type'],
    patch: Partial<Pick<McpCredentialEntry, 'value' | 'secretId'>>,
  ) => void;
}

export const McpSettingsSection: React.FC<McpSettingsSectionProps> = ({
  profile,
  credentials,
  onCredentialChange,
}) => {
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  const definition = useMemo(() => getPredefinedMcpProfile(profile.id), [profile.id]);
  const requirements = definition?.credentialRequirements ?? [];
  const knownIds = useMemo(() => new Set(requirements.map(requirement => requirement.id)), [requirements]);

  const orderedCredentials = useMemo(() => {
    const fromRequirements = requirements.map(requirement => ({
      requirement,
      entry:
        credentials?.[requirement.id] ?? {
          id: requirement.id,
          type: requirement.type,
          value: '',
          secretId: '',
        },
    }));

    const extras = Object.values(credentials ?? {}).filter(entry => !knownIds.has(entry.id));

    return { fromRequirements, extras };
  }, [credentials, knownIds, requirements]);

  const renderCredentialField = (
    entry: McpCredentialEntry,
    options?: { helperText?: string; label?: string; placeholder?: string },
  ) => {
    const fieldId = `mcp-${profile.id}-${entry.id}`;
    const isSecret = entry.type === 'oauth';
    const label = options?.label ?? entry.id;
    const helper = options?.helperText;
    const placeholder = options?.placeholder ?? (isSecret ? 'ID en SecretManager' : 'Introduce el valor');
    const currentValue = isSecret ? entry.secretId ?? '' : entry.value ?? '';
    const isTouched = touchedFields[entry.id];
    const showError = isTouched && !currentValue.trim();

    return (
      <div className="mcp-settings-field" key={entry.id}>
        <label htmlFor={fieldId}>
          <span>{label}</span>
          <input
            id={fieldId}
            type={isSecret ? 'text' : 'password'}
            value={currentValue}
            placeholder={placeholder}
            required
            aria-invalid={showError || undefined}
            onChange={event =>
              onCredentialChange(entry.id, entry.type, {
                [isSecret ? 'secretId' : 'value']: event.target.value,
              })
            }
            onBlur={() =>
              setTouchedFields(prev => ({
                ...prev,
                [entry.id]: true,
              }))
            }
          />
        </label>
        {helper && <p className="settings-hint">{helper}</p>}
        {showError && <p className="settings-error">Este campo es obligatorio.</p>}
      </div>
    );
  };

  return (
    <div className="settings-section mcp-settings-section">
      <header>
        <h3>{profile.label}</h3>
        {profile.description && <p>{profile.description}</p>}
      </header>

      {profile.endpoints.length ? (
        <section className="mcp-settings-endpoints" aria-label="Endpoints configurados">
          <h4>Endpoints activos</h4>
          <ul>
            {profile.endpoints.map(endpoint => (
              <li key={endpoint.id}>
                <span className="mcp-settings-endpoint-transport">{endpoint.transport.toUpperCase()}</span>
                <span className="mcp-settings-endpoint-url">{endpoint.url}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.scopes?.length ? (
        <section className="mcp-settings-scopes" aria-label="Scopes solicitados">
          <h4>Scopes sugeridos</h4>
          <ul>
            {profile.scopes.map(scope => (
              <li key={scope}>{scope}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mcp-settings-credentials" aria-label="Credenciales del perfil">
        <h4>Credenciales</h4>
        {orderedCredentials.fromRequirements.length ? (
          <div className="mcp-settings-fields">
            {orderedCredentials.fromRequirements.map(({ requirement, entry }) =>
              renderCredentialField(entry, {
                label: requirement.label,
                helperText: requirement.helperText,
                placeholder: requirement.placeholder,
              }),
            )}
            {orderedCredentials.extras.map(entry => renderCredentialField(entry))}
          </div>
        ) : orderedCredentials.extras.length ? (
          <div className="mcp-settings-fields">
            {orderedCredentials.extras.map(entry => renderCredentialField(entry))}
          </div>
        ) : (
          <p className="mcp-settings-empty">Este perfil no requiere credenciales adicionales.</p>
        )}
      </section>
    </div>
  );
};

export default McpSettingsSection;
