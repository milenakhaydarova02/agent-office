const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('officeAPI', {
  onEvent: (fn) => ipcRenderer.on('office-event', (_e, ev) => fn(ev)),
  setScale: (s) => ipcRenderer.send('set-scale', s),
  togglePin: () => ipcRenderer.invoke('toggle-pin'),
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  onSaver: (fn) => ipcRenderer.on('saver', (_e, on) => fn(on)),
  onSaverStatus: (fn) => ipcRenderer.on('saver-status', (_e, st) => fn(st)),
  setSaverMinutes: (m) => ipcRenderer.send('saver-minutes', m),
  enterSaver: () => ipcRenderer.send('saver-enter'),
  exitSaver: () => ipcRenderer.send('saver-exit'),
});
