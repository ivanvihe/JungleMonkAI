const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const compareVersions = (a, b) => {
  const parse = value =>
    String(value)
      .split('.')
      .map(part => {
        const parsed = Number.parseInt(part, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      });

  const av = parse(a);
  const bv = parse(b);
  const length = Math.max(av.length, bv.length);
  for (let index = 0; index < length; index += 1) {
    const ai = av[index] ?? 0;
    const bi = bv[index] ?? 0;
    if (ai > bi) {
      return 1;
    }
    if (ai < bi) {
      return -1;
    }
  }
  return 0;
};

const sanitizeValue = value => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'integrity') {
        continue;
      }
      sanitized[key] = sanitizeValue(entry);
    }
    return sanitized;
  }
  return value;
};

const canonicalString = value => {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalString(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => {
      if (a < b) {
        return -1;
      }
      if (a > b) {
        return 1;
      }
      return 0;
    });
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalString(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const computeChecksum = manifestValue => {
  const sanitized = sanitizeValue(manifestValue);
  const canonical = canonicalString(sanitized);
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

class PluginManager {
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.appVersion = options.appVersion ?? '0.0.0';
    this.plugins = new Map();
  }

  async refresh() {
    await fs.promises.mkdir(this.baseDir, { recursive: true });

    const registry = new Map();
    let entries = [];
    try {
      entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
    } catch (error) {
      console.warn('[plugin-manager] no se pudo leer el directorio de plugins', error);
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const pluginPath = path.join(this.baseDir, entry.name);
      try {
        const descriptor = await this.loadPlugin(pluginPath);
        registry.set(descriptor.plugin_id, descriptor);
      } catch (error) {
        console.warn(`[plugin-manager] no se pudo cargar el plugin en ${pluginPath}`, error);
      }
    }

    this.plugins = registry;
    return this.list();
  }

  list() {
    return Array.from(this.plugins.values()).map(entry => ({
      pluginId: entry.plugin_id,
      manifest: entry.manifest,
      checksum: entry.checksum,
    }));
  }

  async invokeCommand(pluginId, command, payload = {}) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`plugin «${pluginId}» no está registrado`);
    }

    const commands = Array.isArray(plugin.manifest.commands) ? plugin.manifest.commands : [];
    const exists = commands.some(descriptor => descriptor.name === command);

    if (!exists) {
      throw new Error(`el comando ${command} no está disponible en el plugin ${pluginId}`);
    }

    switch (pluginId) {
      case 'ableton-remote':
      case 'vscode-bridge':
        console.warn(
          `[plugin-manager] la invocación de comandos para ${pluginId} no está soportada en esta plataforma; se encola la solicitud`,
        );
        return {
          status: 'queued',
          plugin: pluginId,
          command,
          payload,
        };
      default:
        return {
          status: 'queued',
          plugin: pluginId,
          command,
          payload,
        };
    }
  }

  async loadPlugin(pluginDir) {
    const manifestPath = path.join(pluginDir, 'manifest.json');
    let raw;
    try {
      raw = await fs.promises.readFile(manifestPath, 'utf-8');
    } catch (error) {
      throw new Error(`manifest.json no encontrado en ${pluginDir}: ${error.message}`);
    }

    let manifestValue;
    try {
      manifestValue = JSON.parse(raw);
    } catch (error) {
      throw new Error(`no se pudo parsear el manifiesto ${manifestPath}: ${error.message}`);
    }

    if (!manifestValue || typeof manifestValue !== 'object') {
      throw new Error(`el manifiesto ${manifestPath} no es un objeto válido`);
    }

    if (typeof manifestValue.id !== 'string') {
      throw new Error(`el manifiesto ${manifestPath} debe incluir un identificador "id"`);
    }

    if (manifestValue.integrity && manifestValue.integrity.algorithm) {
      const algorithm = String(manifestValue.integrity.algorithm).toLowerCase();
      if (algorithm !== 'sha256') {
        throw new Error(`el plugin ${manifestValue.id} declara un algoritmo de integridad no soportado`);
      }
    }

    const checksum = computeChecksum(manifestValue);

    if (
      manifestValue.integrity &&
      typeof manifestValue.integrity.hash === 'string' &&
      manifestValue.integrity.hash.length > 0 &&
      manifestValue.integrity.algorithm &&
      String(manifestValue.integrity.algorithm).toLowerCase() === 'sha256' &&
      manifestValue.integrity.hash !== checksum
    ) {
      throw new Error(`el hash del manifiesto de ${manifestValue.id} no coincide con la integridad declarada`);
    }

    this.validateCompatibility(manifestValue);

    return {
      plugin_id: manifestValue.id,
      manifest: manifestValue,
      checksum,
    };
  }

  validateCompatibility(manifest) {
    const compatibility = manifest.compatibility;
    if (!compatibility) {
      return;
    }

    if (compatibility.minVersion && compareVersions(this.appVersion, compatibility.minVersion) < 0) {
      throw new Error(
        `el plugin ${manifest.name ?? manifest.id} requiere la versión ${compatibility.minVersion} o superior`,
      );
    }

    if (compatibility.maxVersion && compareVersions(this.appVersion, compatibility.maxVersion) > 0) {
      throw new Error(`el plugin ${manifest.name ?? manifest.id} no es compatible con la versión actual`);
    }
  }
}

module.exports = {
  PluginManager,
};
