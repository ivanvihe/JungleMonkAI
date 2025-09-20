import { McpCredentialEntry, McpCredentialType, McpProfile, McpProfileEndpoint } from '../../types/globalSettings';

export interface PredefinedMcpCredentialRequirement {
  id: string;
  type: McpCredentialType;
  label: string;
  helperText?: string;
  placeholder?: string;
}

export interface PredefinedMcpProfile {
  id: string;
  label: string;
  description?: string;
  autoConnect: boolean;
  endpoints: McpProfileEndpoint[];
  scopes: string[];
  credentialRequirements?: PredefinedMcpCredentialRequirement[];
}

export const PREDEFINED_MCP_PROFILES: PredefinedMcpProfile[] = [
  {
    id: 'jellyfin-media',
    label: 'Jellyfin',
    description: 'Sincroniza bibliotecas y estado de reproducción desde un servidor Jellyfin.',
    autoConnect: true,
    endpoints: [
      { id: 'jellyfin-rest', transport: 'rest', url: 'https://jellyfin.example.com' },
      { id: 'jellyfin-events', transport: 'ws', url: 'wss://jellyfin.example.com/socket' },
    ],
    scopes: ['jellyfin:libraries:read', 'jellyfin:playback:control'],
    credentialRequirements: [
      {
        id: 'apiKey',
        type: 'api-key',
        label: 'API key del servidor',
        helperText: 'Genera una API key desde el panel de administración de Jellyfin y pégala aquí.',
        placeholder: 'ej. c0ffee-babe-1234',
      },
    ],
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Accede a mensajes, etiquetas y acciones básicas en Gmail.',
    autoConnect: false,
    endpoints: [
      { id: 'gmail-rest', transport: 'rest', url: 'https://gmail.googleapis.com/gmail/v1' },
      { id: 'gmail-realtime', transport: 'ws', url: 'wss://gmail.googleapis.com/gmail/v1/stream' },
    ],
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    credentialRequirements: [
      {
        id: 'oauthToken',
        type: 'oauth',
        label: 'ID del token OAuth',
        helperText:
          'Referencia al token almacenado a través de SecretManager (por ejemplo "gmail-oauth").',
        placeholder: 'gmail-oauth',
      },
    ],
  },
  {
    id: 'google-calendar',
    label: 'Google Calendar',
    description: 'Sincroniza calendarios personales y empresariales, incluyendo recordatorios.',
    autoConnect: false,
    endpoints: [
      { id: 'calendar-rest', transport: 'rest', url: 'https://www.googleapis.com/calendar/v3' },
      {
        id: 'calendar-updates',
        transport: 'ws',
        url: 'wss://streaming.googleapis.com/calendar/v3/events',
      },
    ],
    scopes: [
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    credentialRequirements: [
      {
        id: 'oauthToken',
        type: 'oauth',
        label: 'ID del token OAuth',
        helperText:
          'Introduce el identificador del token gestionado por SecretManager para Calendar.',
        placeholder: 'calendar-oauth',
      },
    ],
  },
];

export const getPredefinedMcpProfile = (id: string): PredefinedMcpProfile | undefined =>
  PREDEFINED_MCP_PROFILES.find(profile => profile.id === id);

export const buildMcpProfileFromCatalog = (entry: PredefinedMcpProfile): McpProfile => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
  autoConnect: entry.autoConnect,
  endpoints: entry.endpoints,
  scopes: entry.scopes,
});

export const buildDefaultCredentialState = (
  entry: PredefinedMcpProfile,
): Record<string, McpCredentialEntry> => {
  if (!entry.credentialRequirements?.length) {
    return {};
  }

  return entry.credentialRequirements.reduce<Record<string, McpCredentialEntry>>(
    (acc, requirement) => {
      acc[requirement.id] = {
        id: requirement.id,
        type: requirement.type,
        value: undefined,
        secretId: undefined,
      };
      return acc;
    },
    {},
  );
};
