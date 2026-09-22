import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nexusBrowser', {
  getState: () => ipcRenderer.invoke('nexus-browser:get-state'),
  command: (command: unknown) => ipcRenderer.invoke('nexus-browser:command', command),
  onState: (listener: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on('nexus-browser:state', handler);
    return () => ipcRenderer.removeListener('nexus-browser:state', handler);
  },
  onFocusAddress: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on('nexus-browser:focus-address', handler);
    return () => ipcRenderer.removeListener('nexus-browser:focus-address', handler);
  },
});
