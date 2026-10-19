const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', {
  on: (ch, fn) => ipcRenderer.on(ch, (_e, d) => fn(d)),
  ready: () => ipcRenderer.send('overlay:ready'),
  saveLayout: (l) => ipcRenderer.send('overlay:layout', l),
  done: () => ipcRenderer.send('overlay:edit-done'),
  match: (r) => ipcRenderer.send('overlay:match', r),
  undo: () => ipcRenderer.send('overlay:undo'),
});
