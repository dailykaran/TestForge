/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/electron-env" />

interface Window {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
    send: (channel: string, ...args: unknown[]) => void;
  };
}
