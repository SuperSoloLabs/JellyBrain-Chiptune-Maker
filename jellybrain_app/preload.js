const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('host', {
  bb: line => ipcRenderer.send('bb', line),
  dragStart: () => ipcRenderer.send('drag-start'), dragEnd: () => ipcRenderer.send('drag-end'),
  minimize: () => ipcRenderer.send('minimize'), close: () => ipcRenderer.send('close'),
  settingsGet: () => inv('settings-get'), settingsSet: (k, v) => inv('settings-set', k, v),
  songSave: (name, wav, rec, mp3) => inv('song-save', { name, wav, rec, mp3 }), markSave: (text, stamp) => inv('mark-save', { text, stamp }), savedList: () => inv('saved-list'), readFile: p => inv('read-file', p), openSongs: () => inv('open-songs'),
  sfImport: () => inv('sf-import'), sfList: () => inv('sf-list'), sfRemove: p => inv('sf-remove', p),
  sendBlackBox: () => inv('send-blackbox'),
});
