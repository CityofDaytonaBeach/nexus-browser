import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nexusNativeBrowser', {
  getState: () => ipcRenderer.invoke('nexus-browser:get-active-state'),
  action: (action: unknown) => ipcRenderer.invoke('nexus-browser:active-action', action),
});
