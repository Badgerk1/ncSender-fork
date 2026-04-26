const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniBar', {
  restore: () => ipcRenderer.invoke('minibar:restore'),
});
