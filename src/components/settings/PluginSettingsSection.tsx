import React, { useMemo, useState } from 'react';
import type { PluginCredentialField, PluginManifest } from '../../core/plugins';

interface PluginSettingsSectionProps {
  pluginId: string;
  manifest: PluginManifest | null;
  credentials: Record<string, string | undefined>;
  onCredentialChange: (fieldId: string, value: string) => void;
}

interface FieldState {
  field: PluginCredentialField;
  value: string;
  helperId?: string;
}

export const PluginSettingsSection: React.FC<PluginSettingsSectionProps> = ({
  pluginId,
  manifest,
  credentials,
  onCredentialChange,
}) => {
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  const fields = useMemo(() => manifest?.credentials ?? [], [manifest]);

  const fieldStates = useMemo<FieldState[]>(
    () =>
      fields.map(field => ({
        field,
        value: credentials[field.id] ?? '',
        helperId: field.description ? `plugin-${pluginId}-${field.id}-helper` : undefined,
      })),
    [credentials, fields, pluginId],
  );

  if (!manifest) {
    return (
      <div className="settings-section plugin-settings-section">
        <h3>Plugin desconocido</h3>
        <p>
          No se pudo cargar la información del plugin <code>{pluginId}</code>. Asegúrate de que esté
          instalado correctamente.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section plugin-settings-section">
      <header>
        <h3>{manifest.name}</h3>
        {manifest.description && <p>{manifest.description}</p>}
      </header>

      {fieldStates.length ? (
        <div className="plugin-settings-fields">
          {fieldStates.map(({ field, value, helperId }) => {
            const inputId = `plugin-${pluginId}-${field.id}`;
            const isRequired = Boolean(field.required);
            const isTouched = touchedFields[field.id];
            const showError = isRequired && isTouched && !value.trim();

            return (
              <div className="plugin-settings-field" key={field.id}>
                <label htmlFor={inputId}>
                  <span>{field.label}</span>
                  <input
                    id={inputId}
                    type={field.secret ? 'password' : 'text'}
                    value={value}
                    onChange={event => onCredentialChange(field.id, event.target.value)}
                    onBlur={() =>
                      setTouchedFields(prev => ({
                        ...prev,
                        [field.id]: true,
                      }))
                    }
                    aria-describedby={helperId}
                    aria-invalid={showError || undefined}
                    required={isRequired}
                  />
                </label>
                {field.description && (
                  <p id={helperId} className="settings-hint">
                    {field.description}
                  </p>
                )}
                {showError && <p className="settings-error">Este campo es obligatorio.</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="plugin-settings-empty">
          Este plugin no declara credenciales configurables. Solo necesitas mantenerlo activado.
        </p>
      )}
    </div>
  );
};

export default PluginSettingsSection;
