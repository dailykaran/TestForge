const { ipcRenderer, contextBridge } = require('electron');

try {
  contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      const subscription = (event, ...args) => listener(event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    send: (channel, ...args) => ipcRenderer.send(channel, ...args)
  });
  console.log('✓ ipcRenderer exposed to main world');
} catch (error) {
  console.error('✗ Failed to expose ipcRenderer:', error);
}
