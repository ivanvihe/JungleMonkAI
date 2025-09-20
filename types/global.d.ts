// types/global.d.ts
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
  };
}

// Module declaration to avoid TypeScript errors
declare module '@tauri-apps/api/event' {
  export function listen(event: string, handler: (event: any) => void): Promise<() => void>;
}
