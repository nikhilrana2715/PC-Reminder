const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  showNotification: (data) => ipcRenderer.send('show-native-notification', data),
  focusWindow: () => ipcRenderer.send('focus-window')
});
