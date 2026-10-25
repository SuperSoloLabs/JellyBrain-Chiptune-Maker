const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('host', {
  bb: line => ipcRenderer.send('bb', line),
  saveFile: (name, data, sub) => inv('save-file', { name, data, sub }),
  openFolder: which => inv('open-folder', which),
  keepsList: () => inv('keeps-list'), keepsSave: rec => inv('keeps-save', rec), keepsDelete: id => inv('keeps-delete', id),
  libList: rel => inv('lib-list', rel), libMkdir: (rel, name) => inv('lib-mkdir', rel, name), libRename: (rel, name) => inv('lib-rename', rel, name),
  libMove: (rel, dest) => inv('lib-move', rel, dest), libTrash: rel => inv('lib-trash', rel), libRestore: name => inv('lib-restore', name),
  libEmptyTrash: () => inv('lib-empty-trash'), libTrashList: () => inv('lib-trash-list'), libRead: rel => inv('lib-read', rel), libExport: (rel, abs) => inv('lib-export', rel, abs),
  libImport: (abs, dest) => inv('lib-import', abs, dest), libSearch: q => inv('lib-search', q),
  fsRoots: () => inv('fs-roots'), fsList: (abs, mode) => inv('fs-list', abs, mode), fsRead: abs => inv('fs-read', abs), fsWalk: (abs, rec) => inv('fs-walk', abs, rec),
  libRecent: n => inv('lib-recent', n), bpList: () => inv('bp-list'), bpSave: bp => inv('bp-save', bp), bpDelete: id => inv('bp-delete', id),
  histList: () => inv('hist-list'), histAdd: rec => inv('hist-add', rec), histMark: (seed, mark) => inv('hist-mark', seed, mark), histLove: (seed, on) => inv('hist-love', seed, on),
  instList: () => inv('inst-list'), instSave: p => inv('inst-save', p), instDelete: id => inv('inst-delete', id),
  pathFor: file => { try { return webUtils.getPathForFile(file); } catch (_) { return null; } },
});
