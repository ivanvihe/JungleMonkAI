import type { AgentManifest } from '../../types/agents';

export type PluginCapability =
  | {
      type: 'agent-provider';
      agentManifests?: AgentManifest[];
    }
  | {
      type: 'chat-action';
      id: string;
      label: string;
      description?: string;
      command: string;
      icon?: string;
    }
  | {
      type: 'workspace-panel';
      id: string;
      label: string;
      slot: 'side-panel' | 'workspace';
      module: string;
      export?: string;
    }
  | {
      type: 'mcp-endpoint';
      id: string;
      transport: 'http' | 'ws';
      url: string;
    };

export interface PluginCredentialField {
  id: string;
  label: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
}

export interface PluginCommandDescriptor {
  name: string;
  description?: string;
  signature: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  capabilities: PluginCapability[];
  credentials?: PluginCredentialField[];
  commands?: PluginCommandDescriptor[];
  integrity?: PluginIntegrity;
  compatibility?: PluginCompatibility;
}

export interface PluginIntegrity {
  algorithm: 'sha256';
  hash: string;
}

export interface PluginCompatibility {
  minVersion?: string;
  maxVersion?: string;
}

export interface LoadedPluginManifest {
  manifest: PluginManifest;
  checksum: string;
}

export interface PluginManifestLoadOptions {
  source: string | LoadedPluginManifest | PluginManifest;
  currentVersion: string;
  expectedChecksum?: string;
}

const textEncoder = new TextEncoder();

const normalizeVersion = (value: string): number[] => {
  return value
    .split('.')
    .map(part => parseInt(part, 10))
    .map(part => (Number.isFinite(part) && part >= 0 ? part : 0));
};

const compareVersions = (a: string, b: string): number => {
  const av = normalizeVersion(a);
  const bv = normalizeVersion(b);
  const length = Math.max(av.length, bv.length);
  for (let i = 0; i < length; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai > bi) {
      return 1;
    }
    if (ai < bi) {
      return -1;
    }
  }
  return 0;
};

const canonicalize = (input: unknown): string => {
  if (Array.isArray(input)) {
    return `[${input.map(item => canonicalize(item)).join(',')}]`;
  }
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    const sorted = entries.sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0));
    return `{${sorted
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalize(value)}`)
      .join(',')}}`;
  }
  return JSON.stringify(input);
};

const computeSha256 = async (payload: string): Promise<string> => {
  const data = textEncoder.encode(payload);
  if (typeof globalThis.crypto !== 'undefined' && 'subtle' in globalThis.crypto) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const { createHash } = await import('crypto');
  return createHash('sha256').update(payload).digest('hex');
};

const prepareForChecksum = (manifest: PluginManifest): Omit<PluginManifest, 'integrity'> => {
  const { integrity: _integrity, ...rest } = manifest;
  return rest;
};

const isPluginManifest = (value: unknown): value is PluginManifest => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as PluginManifest;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.version === 'string' &&
    Array.isArray(candidate.capabilities)
  );
};

const validateCapabilities = (capabilities: PluginCapability[]): PluginCapability[] => {
  return capabilities.filter(capability => {
    if (!capability || typeof capability !== 'object') {
      return false;
    }
    switch (capability.type) {
      case 'agent-provider':
        return true;
      case 'chat-action':
        return (
          typeof capability.id === 'string' &&
          typeof capability.label === 'string' &&
          typeof capability.command === 'string'
        );
      case 'workspace-panel':
        return (
          typeof capability.id === 'string' &&
          typeof capability.label === 'string' &&
          (capability.slot === 'side-panel' || capability.slot === 'workspace') &&
          typeof capability.module === 'string'
        );
      case 'mcp-endpoint':
        return (
          typeof capability.id === 'string' &&
          (capability.transport === 'http' || capability.transport === 'ws') &&
          typeof capability.url === 'string'
        );
      default:
        return false;
    }
  });
};

const validateCredentials = (credentials: PluginCredentialField[] | undefined) => {
  if (!credentials) {
    return undefined;
  }
  return credentials.filter(field => typeof field.id === 'string' && typeof field.label === 'string');
};

const validateCommands = (commands: PluginCommandDescriptor[] | undefined) => {
  if (!commands) {
    return undefined;
  }
  const seen = new Set<string>();
  return commands.filter(command => {
    if (!command || typeof command.name !== 'string') {
      return false;
    }
    const normalized = command.name.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    if (typeof command.signature !== 'string' || !command.signature.trim()) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

export const loadPluginManifest = async (
  options: PluginManifestLoadOptions,
): Promise<LoadedPluginManifest> => {
  let rawManifest: PluginManifest | null = null;
  let checksum: string | undefined;

  if (typeof options.source === 'string') {
    const parsed = JSON.parse(options.source) as PluginManifest;
    rawManifest = parsed;
    checksum = await computeSha256(canonicalize(prepareForChecksum(parsed)));
  } else if (isPluginManifest(options.source)) {
    rawManifest = options.source;
  } else if (
    typeof options.source === 'object' &&
    options.source !== null &&
    'manifest' in options.source
  ) {
    const { manifest, checksum: providedChecksum } = options.source as LoadedPluginManifest;
    rawManifest = manifest;
    checksum = providedChecksum;
  }

  if (!rawManifest) {
    throw new Error('Invalid plugin manifest payload');
  }

  const manifest: PluginManifest = {
    ...rawManifest,
    capabilities: validateCapabilities(rawManifest.capabilities ?? []),
    credentials: validateCredentials(rawManifest.credentials),
    commands: validateCommands(rawManifest.commands),
  };

  if (!manifest.capabilities.length) {
    throw new Error(`El plugin «${manifest.id}» no declara capacidades válidas.`);
  }

  const { compatibility } = manifest;
  if (compatibility?.minVersion && compareVersions(options.currentVersion, compatibility.minVersion) < 0) {
    throw new Error(
      `El plugin «${manifest.name}» requiere la versión ${compatibility.minVersion} o superior.`,
    );
  }
  if (compatibility?.maxVersion && compareVersions(options.currentVersion, compatibility.maxVersion) > 0) {
    throw new Error(
      `El plugin «${manifest.name}» no es compatible con la versión actual de la aplicación.`,
    );
  }

  const serialized = canonicalize(prepareForChecksum(manifest));
  const computed = await computeSha256(serialized);
  const expected = manifest.integrity?.hash ?? checksum ?? options.expectedChecksum;

  if (expected && expected !== computed) {
    throw new Error(`La firma del manifiesto del plugin «${manifest.id}» no coincide.`);
  }

  return { manifest, checksum: computed };
};
