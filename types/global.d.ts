// types/global.d.ts
interface JarvisProcessStatus {
  running: boolean;
  pid: number | null;
  lastExitCode: number | null;
  lastSignal: number | string | null;
  lastStdout: string | null;
  lastStderr: string | null;
  lastError: string | null;
}

interface Window {
  __TAURI__?: any;
  electronAPI?: {
    applySettings: (settings: { maximize?: boolean; monitorId?: string | number }) => void;
    getDisplays: () => Promise<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number; primary: boolean; }[]>;
    toggleFullscreen: (ids: string[]) => Promise<void>;
    readTextFile?: (path: string) => Promise<string>;
    writeTextFile?: (path: string, contents: string) => Promise<void>;
    createDir?: (dir: string) => Promise<void>;
    exists?: (path: string) => Promise<boolean>;
    tcpRequest: (command: object, port?: number, host?: string) => Promise<any>;
    listPlugins?: () => Promise<
      {
        pluginId: string;
        manifest: import('../src/core/plugins').PluginManifest;
        checksum: string;
      }[]
    >;
    invokePlugin?: (pluginId: string, command: string, payload: unknown) => Promise<unknown>;
    gitInvoke?: <T>(channel: string, payload?: unknown) => Promise<T>;
    listGitRepos?: (payload?: unknown) => Promise<unknown>;
    jarvisStart?: (options?: { pythonPath?: string }) => Promise<JarvisProcessStatus>;
    jarvisStop?: () => Promise<JarvisProcessStatus>;
    jarvisStatus?: () => Promise<JarvisProcessStatus>;
  };
}

// Module declaration to avoid TypeScript errors
declare module '@tauri-apps/api/event' {
  export function listen(event: string, handler: (event: any) => void): Promise<() => void>;
}
