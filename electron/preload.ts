import { ipcRenderer, contextBridge, IpcRendererEvent } from 'electron';

interface IpcRendererAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => () => void;
  send: (channel: string, ...args: unknown[]) => void;
}

// SECURITY: IPC Channel Allowlist
// Only explicitly allowed channels can be called from the renderer process
const ALLOWED_CHANNELS: Record<string, boolean> = {
  // Desktop capture
  'get-desktop-sources': true,
  'save-video': true,
  
  // File operations (validated in main process)
  'read-file-base64': true,
  'download-file': true,
  
  // Action observation
  'start-observing': true,
  'stop-observing': true,
  'action-captured': true,
  'set-generator-active': true,
  
  // Session memory
  'session-memory-clear': true,
  
  // API Key Management (secure in main process)
  'get-gemini-api-key': true,
  'get-claude-api-key': true,
  'set-gemini-api-key': true,
  'set-claude-api-key': true,
  'clear-api-keys': true,
  
  // Test case generation (main process)
  'generate-test-cases': true,
  // Automated test reporting channel
  'ipc-auto-test-result': true,
};

function validateChannel(channel: string): boolean {
  if (!ALLOWED_CHANNELS[channel]) {
    console.warn(`[SECURITY] Blocked unauthorized IPC channel: ${channel}`);
    return false;
  }
  return true;
}

try {
  contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: function(channel: string, ...args: unknown[]) {
      if (!validateChannel(channel)) {
        return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    on: function(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
      if (!validateChannel(channel)) {
        console.error(`IPC channel not allowed: ${channel}`);
        return function() {};
      }
      const subscription = function(event: IpcRendererEvent, ...args: unknown[]) {
        listener(event, ...args);
      };
      ipcRenderer.on(channel, subscription as unknown as (event: IpcRendererEvent, ...args: unknown[]) => void);
      return function() {
        ipcRenderer.removeListener(channel, subscription as unknown as (event: IpcRendererEvent, ...args: unknown[]) => void);
      };
    },
    send: function(channel: string, ...args: unknown[]) {
      if (!validateChannel(channel)) {
        console.error(`IPC channel not allowed: ${channel}`);
        return;
      }
      ipcRenderer.send(channel, ...args);
    }
  } as IpcRendererAPI);
  console.log('✓ ipcRenderer exposed to main world with security validation');
} catch (error: unknown) {
  console.error('✗ Failed to expose ipcRenderer:', error);
}

// Automated IPC test hook (used by CI / local harness)
// When RUN_IPC_TEST=1 is set in the environment, the preload will perform
// a small sequence of IPC calls to exercise main-process handlers and
// log results to stdout/stderr so the test harness can capture them.
try {
  if (process.env.RUN_IPC_TEST === '1') {
    (async () => {
      try {
        console.log('IPC auto-test: starting');

        // Prepare a small payload and call the save-video handler
        const payload = Buffer.from(`electron-ipc-test-${Date.now()}`);
        const savedPath = await ipcRenderer.invoke('save-video', payload as unknown as Uint8Array);
        console.log('IPC auto-test: savedPath', savedPath);

        // Read it back via read-file-base64
        const b64 = await ipcRenderer.invoke('read-file-base64', savedPath);
        console.log('IPC auto-test: read base64 length', typeof b64 === 'string' ? b64.length : 'invalid');

        // Check key storage availability (boolean responses)
        const hasGemini = await ipcRenderer.invoke('get-gemini-api-key');
        console.log('IPC auto-test: hasGeminiKey', hasGemini);

        // Clear keys (should be safe)
        const clearResult = await ipcRenderer.invoke('clear-api-keys');
        console.log('IPC auto-test: clear-api-keys', clearResult);

        console.log('IPC auto-test: success');
        try { ipcRenderer.send('ipc-auto-test-result', { status: 'success' }); } catch (e) { console.warn('Failed to send ipc-auto-test-result success', e); }

        // Close the window after a short delay so logs flush
        setTimeout(() => {
          try { (globalThis as any).window?.close?.(); } catch (e) { /* ignore */ }
        }, 800);
      } catch (err) {
        console.error('IPC auto-test: failed', err);
        try { ipcRenderer.send('ipc-auto-test-result', { status: 'failure', message: String(err) }); } catch (e) { console.warn('Failed to send ipc-auto-test-result failure', e); }
      }
    })();
  }
} catch (err) {
  console.error('IPC auto-test bootstrap failed:', err);
}
