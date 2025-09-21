const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PluginManager } = require('./plugin-manager.cjs');
const { createGitService } = require('./services/git-service.cjs');
const { logConsoleMessage } = require('./console-message-handler.cjs');

const PROVIDER_CONFIG = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    displayName: 'Groq',
    headers: apiKey => ({
      Authorization: `Bearer ${apiKey}`
    })
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    displayName: 'Anthropic',
    headers: apiKey => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    })
  }
};

const maskApiKey = apiKey => {
  if (typeof apiKey !== 'string') {
    return '(vacía)';
  }
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return '(vacía)';
  }
  if (trimmed.length <= 8) {
    return '***';
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};

const ensureAnthropicLimiter = () => {
  if (!global.__anthropicLimiter__) {
    global.__anthropicLimiter__ = new Map();
  }
  return global.__anthropicLimiter__;
};

const withAnthropicConcurrency = async (apiKey, task) => {
  const limiter = ensureAnthropicLimiter();
  const key = (typeof apiKey === 'string' ? apiKey.trim() : '') || '__default__';

  if (limiter.has(key)) {
    console.warn('Solicitud de Anthropic rechazada por límite de concurrencia.', {
      apiKey: maskApiKey(apiKey)
    });
    throw new Error(
      'Otra solicitud de Anthropic está en curso para esta API key. Intenta nuevamente en unos segundos.'
    );
  }

  limiter.set(key, true);

  try {
    return await task();
  } finally {
    limiter.delete(key);
  }
};

const extractProviderErrorMessage = payload => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if (typeof payload.error === 'string') {
    return payload.error;
  }

  if (payload.error && typeof payload.error === 'object') {
    if (typeof payload.error.message === 'string') {
      return payload.error.message;
    }
    if (typeof payload.error.error === 'string') {
      return payload.error.error;
    }
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  return undefined;
};

const performProviderChatRequest = async (providerId, request = {}) => {
  const providerKey = typeof providerId === 'string' ? providerId.toLowerCase() : '';
  const config = PROVIDER_CONFIG[providerKey];

  if (!config) {
    throw new Error(`Proveedor no soportado: ${providerId}`);
  }

  const apiKey = typeof request.apiKey === 'string' ? request.apiKey.trim() : '';
  if (!apiKey) {
    throw new Error(`Falta la API key para ${config.displayName}.`);
  }

  const body = request.body ?? {};

  if (typeof fetch !== 'function') {
    throw new Error('fetch no está disponible en el proceso principal de Electron.');
  }

  const executeRequest = async () => {
    let response;
    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers(apiKey)
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      const reason = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
      throw new Error(`No se pudo contactar a ${config.displayName}: ${reason}`);
    }

    const rawText = await response.text();
    let payload;

    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch (error) {
        if (!response.ok) {
          const trimmed = rawText.trim();
          if (trimmed) {
            throw new Error(trimmed);
          }
        }
        throw new Error(`Respuesta inválida de ${config.displayName}.`);
      }
    } else {
      payload = {};
    }

    if (!response.ok) {
      const message = extractProviderErrorMessage(payload);
      if (message) {
        throw new Error(message);
      }

      throw new Error(`Solicitud falló con estado ${response.status}`);
    }

    return payload;
  };

  if (providerKey === 'anthropic') {
    return withAnthropicConcurrency(apiKey, executeRequest);
  }

  return executeRequest();
};

let mainWindow;
// Ventanas usadas para monitores secundarios en fullscreen
let fullscreenWindows = [];
let mirrorInterval = null;
const isDev = process.env.NODE_ENV === 'development';
const startUrl = isDev
  ? 'http://localhost:3000' // Cambiado de 5173 a 3000 (puerto de Vite por defecto)
  : `file://${path.join(__dirname, 'dist', 'index.html')}`;

let pluginManagerInstance = null;
let pluginManagerReadyPromise = null;
let gitService = null;

const ensureGitService = () => {
  if (!gitService) {
    gitService = createGitService(app);
  }
  return gitService;
};

const JARVIS_EVENTS = {
  stdout: 'jarvis:stdout',
  stderr: 'jarvis:stderr',
  error: 'jarvis:error',
  status: 'jarvis:status',
};

let jarvisProcess = null;
let jarvisStatus = {
  running: false,
  pid: null,
  lastExitCode: null,
  lastSignal: null,
  lastStdout: null,
  lastStderr: null,
  lastError: null,
};
let jarvisRestartTimer = null;
let jarvisRestartOnExit = false;
let jarvisShuttingDown = false;
let jarvisLastPythonBinary = null;

const cloneJarvisStatus = () => ({ ...jarvisStatus });

const broadcastJarvisEvent = (channel, payload) => {
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
};

const broadcastJarvisStatus = () => {
  const snapshot = cloneJarvisStatus();
  broadcastJarvisEvent(JARVIS_EVENTS.status, snapshot);
  return snapshot;
};

const getPythonCandidates = pythonPath => {
  const unique = new Set();
  const pushCandidate = value => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    }
  };

  pushCandidate(pythonPath);
  pushCandidate(process.env.JARVISCORE_PYTHON);
  pushCandidate(process.env.PYTHON);

  unique.add('python3');
  unique.add('python');

  return Array.from(unique);
};

const computePythonPathEnv = jarvisDir => {
  const entries = [jarvisDir];
  const existing = process.env.PYTHONPATH;
  if (typeof existing === 'string' && existing.trim()) {
    entries.push(existing.trim());
  }
  return entries.join(path.delimiter);
};

const resolveJarvisCoreDir = () => {
  const candidates = [];
  const envDir = process.env.JARVISCORE_DIR;
  if (typeof envDir === 'string' && envDir.trim()) {
    candidates.push(envDir.trim());
  }

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'jarvis_core'));
  }

  candidates.push(path.join(__dirname, 'jarvis_core'));
  candidates.push(path.join(process.cwd(), 'jarvis_core'));
  candidates.push(path.join(__dirname, '..', 'jarvis_core'));

  for (const candidate of candidates) {
    try {
      if (
        candidate &&
        fs.existsSync(candidate) &&
        fs.existsSync(path.join(candidate, 'JarvisCore.py'))
      ) {
        return candidate;
      }
    } catch {
      // Ignorar errores de acceso y continuar con los siguientes candidatos.
    }
  }

  return null;
};

const spawnJarvis = (pythonBinary, jarvisDir) => {
  const scriptPath = path.join(jarvisDir, 'JarvisCore.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`No se encontró JarvisCore.py en ${jarvisDir}`);
  }

  const envVars = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: computePythonPathEnv(jarvisDir),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBinary, ['-u', scriptPath], {
      cwd: jarvisDir,
      env: envVars,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    child.once('spawn', () => {
      resolved = true;
      resolve(child);
    });

    child.once('error', error => {
      if (!resolved) {
        reject(error);
      } else {
        console.error('[JarvisCore] Error inesperado en el proceso', error);
      }
    });
  });
};

const attachJarvisProcessListeners = child => {
  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      jarvisStatus.lastStdout = text.trimEnd();
      console.log('[JarvisCore stdout]', jarvisStatus.lastStdout);
      broadcastJarvisEvent(JARVIS_EVENTS.stdout, text);
    });
  }

  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      jarvisStatus.lastStderr = text.trimEnd();
      console.error('[JarvisCore stderr]', jarvisStatus.lastStderr);
      broadcastJarvisEvent(JARVIS_EVENTS.stderr, text);
    });
  }

  child.on('error', error => {
    jarvisStatus.lastError = error instanceof Error ? error.message : String(error);
    jarvisStatus.running = false;
    jarvisStatus.pid = null;
    broadcastJarvisStatus();
    broadcastJarvisEvent(JARVIS_EVENTS.error, jarvisStatus.lastError);
  });

  child.on('exit', (code, signal) => {
    jarvisProcess = null;
    jarvisStatus.running = false;
    jarvisStatus.pid = null;
    jarvisStatus.lastExitCode = typeof code === 'number' ? code : null;
    jarvisStatus.lastSignal = signal ?? null;

    broadcastJarvisStatus();

    if (jarvisRestartTimer) {
      clearTimeout(jarvisRestartTimer);
      jarvisRestartTimer = null;
    }

    if (jarvisRestartOnExit && !jarvisShuttingDown) {
      jarvisRestartTimer = setTimeout(() => {
        jarvisRestartTimer = null;
        startJarvisProcess({ pythonPath: jarvisLastPythonBinary }).catch(error => {
          console.error('[JarvisCore] No se pudo reiniciar JarvisCore:', error);
        });
      }, 2000);
    }
  });
};

const startJarvisProcess = async (options = {}) => {
  if (jarvisProcess) {
    return cloneJarvisStatus();
  }

  const jarvisDir = resolveJarvisCoreDir();
  if (!jarvisDir) {
    const message =
      'No se encontró la carpeta jarvis_core. Copia JarvisCore junto a la aplicación o define JARVISCORE_DIR.';
    jarvisStatus.lastError = message;
    throw new Error(message);
  }

  if (jarvisRestartTimer) {
    clearTimeout(jarvisRestartTimer);
    jarvisRestartTimer = null;
  }

  const candidates = getPythonCandidates(options.pythonPath);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const child = await spawnJarvis(candidate, jarvisDir);
      jarvisProcess = child;
      jarvisStatus = {
        running: true,
        pid: typeof child.pid === 'number' ? child.pid : null,
        lastExitCode: null,
        lastSignal: null,
        lastStdout: null,
        lastStderr: null,
        lastError: null,
      };
      jarvisLastPythonBinary = candidate;
      jarvisShuttingDown = false;
      jarvisRestartOnExit = isDev;
      attachJarvisProcessListeners(child);
      return broadcastJarvisStatus();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const message =
    lastError ??
    'No se pudo iniciar JarvisCore. Comprueba la ruta de Python (JARVISCORE_PYTHON) y las dependencias.';
  jarvisStatus.lastError = message;
  throw new Error(message);
};

const stopJarvisProcess = async () => {
  jarvisRestartOnExit = false;
  jarvisShuttingDown = true;

  if (jarvisRestartTimer) {
    clearTimeout(jarvisRestartTimer);
    jarvisRestartTimer = null;
  }

  const child = jarvisProcess;
  if (!child) {
    return cloneJarvisStatus();
  }

  jarvisProcess = null;

  await new Promise(resolve => {
    const handleExit = () => {
      child.removeListener('exit', handleExit);
      resolve();
    };

    child.once('exit', handleExit);

    try {
      child.kill();
    } catch (error) {
      console.warn('[JarvisCore] Error al detener el proceso:', error);
      resolve();
    }
  });

  jarvisStatus.running = false;
  jarvisStatus.pid = null;
  return broadcastJarvisStatus();
};

const getJarvisStatus = () => cloneJarvisStatus();

const resolvePluginsDir = () => {
  if (isDev) {
    const localDir = path.join(process.cwd(), 'plugins');
    if (fs.existsSync(localDir)) {
      return localDir;
    }
  }
  const userDataDir = app.getPath('userData');
  return path.join(userDataDir, 'plugins');
};

const getAppVersion = () => {
  try {
    if (typeof app.getVersion === 'function') {
      const version = app.getVersion();
      if (version) {
        return version;
      }
    }
  } catch (error) {
    console.warn('No se pudo obtener la versión de la aplicación desde Electron', error);
  }
  try {
    const pkg = require('./package.json');
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

const ensurePluginManager = async () => {
  if (pluginManagerInstance) {
    return pluginManagerInstance;
  }
  if (!pluginManagerReadyPromise) {
    pluginManagerReadyPromise = (async () => {
      if (!app.isReady()) {
        await app.whenReady();
      }
      const manager = new PluginManager(resolvePluginsDir(), { appVersion: getAppVersion() });
      try {
        await manager.refresh();
      } catch (error) {
        console.warn('No se pudo inicializar el gestor de plugins', error);
      }
      pluginManagerInstance = manager;
      return manager;
    })().catch(error => {
      pluginManagerReadyPromise = null;
      throw error;
    });
  }
  return pluginManagerReadyPromise;
};

function closeFullscreenWindows() {
  fullscreenWindows.forEach(win => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  fullscreenWindows = [];
  if (mirrorInterval) {
    clearInterval(mirrorInterval);
    mirrorInterval = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
      // Removido webSecurity: false
    },
  });

  console.log('Loading URL:', startUrl);

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Log when the page is ready
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Page loaded successfully');
  });

  // Log errores de carga
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Failed to load page:', errorCode, errorDescription);
  });

  // Log console errors from the page
  /**
   * Maneja los mensajes de consola emitidos por el renderer.
   * @param {Electron.ConsoleMessageEvent} details
   */
  mainWindow.webContents.on('console-message', details => {
    const params = details && typeof details === 'object' ? details.params : undefined;

    logConsoleMessage(console, params);
  });

  // Si el usuario sale del modo fullscreen manualmente, cerrar las ventanas
  // secundarias y notificar al renderer para que actualice su estado
  mainWindow.on('leave-full-screen', () => {
    closeFullscreenWindows();
    mainWindow.webContents.send('main-leave-fullscreen');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeFullscreenWindows();
  });
}

ipcMain.on('apply-settings', (event, settings) => {
  if (!mainWindow) return;
  if (settings.monitorId) {
    const displays = screen.getAllDisplays();
    // Allow monitor identifiers as strings to avoid precision issues
    const target = displays.find(d => d.id.toString() === settings.monitorId.toString());
    if (target) {
      mainWindow.setBounds(target.bounds);
    }
  }
  if (settings.maximize) {
    mainWindow.maximize();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
});

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: d.label || `Monitor ${d.id}`,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    primary: d.primary
  }));
});

ipcMain.handle('toggle-fullscreen', (event, ids = []) => {
  // Si ya hay ventanas de fullscreen abiertas, cerrar y restaurar principal
  if (fullscreenWindows.length) {
    closeFullscreenWindows();
    if (mainWindow) {
      mainWindow.setFullScreen(false);
      mainWindow.show();
    }
    return;
  }

  const displays = screen.getAllDisplays();

  ids.forEach((id, index) => {
    // Compare using string values to support large identifiers
    const display = displays.find(d => d.id.toString() === id.toString());
    if (!display) return;

    if (index === 0 && mainWindow) {
      // Usar la ventana principal para el primer monitor sin recargar
      mainWindow.setBounds(display.bounds);
      mainWindow.setFullScreen(true);
      mainWindow.show();
    } else {
      // Ventanas clon para monitores secundarios
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        fullscreen: true,
        skipTaskbar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.cjs')
        }
      });

      win.loadFile(path.join(__dirname, 'clone.html'));

      win.on('closed', () => {
        fullscreenWindows = fullscreenWindows.filter(w => w !== win);
        if (fullscreenWindows.length === 0 && mainWindow) {
          mainWindow.setFullScreen(false);
          mainWindow.show();
          if (mirrorInterval) {
            clearInterval(mirrorInterval);
            mirrorInterval = null;
          }
        }
      });

      fullscreenWindows.push(win);
    }
  });

  if (fullscreenWindows.length && !mirrorInterval && mainWindow) {
    mirrorInterval = setInterval(() => {
      mainWindow.webContents.capturePage().then(image => {
        const buffer = image.toJPEG(70);
        fullscreenWindows.forEach(win => {
          win.webContents.send('receive-frame', buffer);
        });
      }).catch(err => console.error('capturePage error:', err));
    }, 33);
  }
});

const net = require('net');

ipcMain.handle('providers:chat', async (event, provider, payload) => {
  try {
    return await performProviderChatRequest(provider, payload);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error
      ? error.message
      : String(error);
    console.error(`No se pudo completar la solicitud para ${provider}:`, message);
    throw error instanceof Error ? error : new Error(message);
  }
});

ipcMain.handle('plugin:list', async () => {
  const manager = await ensurePluginManager();
  try {
    return await manager.refresh();
  } catch (error) {
    console.error('No se pudo listar los plugins', error);
    throw error;
  }
});

ipcMain.handle('plugin:invoke', async (event, pluginId, command, payload = {}) => {
  const manager = await ensurePluginManager();
  try {
    return await manager.invokeCommand(pluginId, command, payload ?? {});
  } catch (error) {
    console.error(`No se pudo invocar el comando ${command} del plugin ${pluginId}`, error);
    throw error;
  }
});

ipcMain.handle('tcp-request', (event, command, port, host) => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';

    socket.connect(port, host, () => {
      socket.write(JSON.stringify(command));
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      try {
        const parsed = JSON.parse(buffer);
        if (parsed && parsed.status) {
          socket.destroy();
          if (parsed.status === 'ok') {
            resolve(parsed.result);
          } else {
            reject(new Error(parsed.message || 'Remote error'));
          }
        }
      } catch {
        // Wait for more data
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    setTimeout(() => {
      if (buffer.length === 0) {
        socket.destroy();
        reject(new Error('Remote timeout'));
      }
    }, 3000);
  });
});

ipcMain.handle('jarvis:start', async (_event, options = {}) => {
  try {
    return await startJarvisProcess(options || {});
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
    throw new Error(message);
  }
});

ipcMain.handle('jarvis:stop', async () => {
  try {
    return await stopJarvisProcess();
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
    throw new Error(message);
  }
});

ipcMain.handle('jarvis:status', () => getJarvisStatus());

const withGitService = handler => async (event, payload) => {
  try {
    const service = ensureGitService();
    return await handler(service, payload || {});
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error);
    throw new Error(message);
  }
};

ipcMain.handle(
  'git:list-user-repos',
  withGitService((service, payload) => service.listUserRepos(payload)),
);

ipcMain.handle(
  'git:get-context',
  withGitService((service, payload) => service.getRepositoryContext(payload)),
);

ipcMain.handle(
  'git:list-files',
  withGitService((service, payload) => service.listRepositoryFiles(payload)),
);

ipcMain.handle(
  'git:status',
  withGitService((service, payload) => service.getRepositoryStatus(payload)),
);

ipcMain.handle(
  'git:file-diff',
  withGitService((service, payload) => service.getFileDiff(payload)),
);

ipcMain.handle(
  'git:commit',
  withGitService((service, payload) => service.commitChanges(payload)),
);

ipcMain.handle(
  'git:push',
  withGitService((service, payload) => service.pushChanges(payload)),
);

ipcMain.handle(
  'git:pull-repository',
  withGitService((service, payload) => service.pullRepository(payload)),
);

ipcMain.handle(
  'git:pull-changes',
  withGitService((service, payload) => service.pullChanges(payload)),
);

ipcMain.handle(
  'git:create-pull-request',
  withGitService((service, payload) => service.createPullRequest(payload)),
);

ipcMain.handle(
  'git:apply-patch',
  withGitService((service, payload) => service.applyPatch(payload)),
);

ipcMain.handle(
  'git:clone',
  withGitService((service, payload) => service.cloneRepository(payload)),
);

ipcMain.handle(
  'secrets:store',
  withGitService((service, payload) => service.storeSecret(payload)),
);

ipcMain.handle(
  'secrets:has',
  withGitService((service, payload) => service.hasSecret(payload)),
);

ipcMain.handle(
  'secrets:reveal',
  withGitService((service, payload) => service.revealSecret(payload)),
);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  jarvisRestartOnExit = false;
  jarvisShuttingDown = true;
  void stopJarvisProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    jarvisRestartOnExit = false;
    jarvisShuttingDown = true;
    void stopJarvisProcess();
    app.quit();
  }
});

// Para debugging
app.on('ready', () => {
  console.log('🚀 Electron app is ready');
  console.log('Environment:', process.env.NODE_ENV || 'production');
});
