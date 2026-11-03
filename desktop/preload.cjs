const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowcutDesktop', {
  isDesktop: true,
  platform: process.platform,
  openExportsFolder: (batchId) => ipcRenderer.invoke('flowcut:open-exports', batchId || ''),
});
