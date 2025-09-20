const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;
// Ventanas usadas para monitores secundarios en fullscreen
let fullscreenWindows = [];
let mirrorInterval = null;
const isDev = process.env.NODE_ENV === 'development';
const startUrl = isDev
  ? 'http://localhost:3000' // Cambiado de 5173 a 3000 (puerto de Vite por defecto)
  : `file://${path.join(__dirname, 'dist', 'index.html')}`;

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
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Console [${level}]:`, message);
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Para debugging
app.on('ready', () => {
  console.log('🚀 Electron app is ready');
  console.log('Environment:', process.env.NODE_ENV || 'production');
});
