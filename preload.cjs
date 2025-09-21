const { contextBridge, ipcRenderer } = require('electron');

let fs;
try {
  fs = require('fs');
} catch {
  fs = null;
}

contextBridge.exposeInMainWorld('electronAPI', {
  applySettings: (settings) => ipcRenderer.send('apply-settings', settings),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  toggleFullscreen: (ids) => ipcRenderer.invoke('toggle-fullscreen', ids),
  // Frame reception in cloned windows
  onReceiveFrame: (callback) => ipcRenderer.on('receive-frame', callback),
  removeFrameListener: () => ipcRenderer.removeAllListeners('receive-frame'),

  // Notification when the main window exits fullscreen
  onMainLeaveFullscreen: (callback) => ipcRenderer.on('main-leave-fullscreen', callback),
  removeMainLeaveFullscreenListener: () => ipcRenderer.removeAllListeners('main-leave-fullscreen'),
  tcpRequest: (command, port, host) => ipcRenderer.invoke('tcp-request', command, port, host),
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  invokePlugin: (pluginId, command, payload) =>
    ipcRenderer.invoke('plugin:invoke', pluginId, command, payload),
  gitInvoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  listGitRepos: payload => ipcRenderer.invoke('git:list-user-repos', payload),
  // Basic filesystem helpers for renderer. These will be undefined if the fs
  // module is not available in the preload context (e.g. in sandboxed
  // environments). Callers should check for their presence before use.
  readTextFile: fs ? (path) => fs.promises.readFile(path, 'utf-8') : undefined,
  writeTextFile: fs ? (path, contents) => fs.promises.writeFile(path, contents) : undefined,
  createDir: fs ? (dir) => fs.promises.mkdir(dir, { recursive: true }) : undefined,
  exists: fs ? (path) => Promise.resolve(fs.existsSync(path)) : undefined,
  callProviderChat: (provider, payload) =>
    ipcRenderer.invoke('providers:chat', provider, payload)
});
