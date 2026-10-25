/* LowOrbit Chip Studio - main process: window, black box flight recorder, in-house library + file access */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');

let win, logFile, bbDir;
const LIB = () => path.join(app.getPath('music'), 'LowOrbit Chip Studio');
const LIB_FOLDERS = ['MUSIC', 'SOUND FX', 'CRUNCHED', 'IMPORTED', 'ATMOSPHERICS', '.trash'];
const AUDIO_EXT = new Set(['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.m4a', '.opus', '.webm']);
const INST_EXT = new Set([...AUDIO_EXT, '.sf2']); // Instrument Scan also opens SoundFonts

function bbLine(cat, msg, data) {
  const line = `${new Date().toISOString()} [${cat}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}\n`;
  try { fs.appendFileSync(logFile, line); } catch (_) {}
}
function bbInit() {
  bbDir = path.join(app.getPath('userData'), 'blackbox');
  fs.mkdirSync(bbDir, { recursive: true });
  logFile = path.join(bbDir, `session-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const files = fs.readdirSync(bbDir).filter(f => f.startsWith('session-')).sort();
  while (files.length > 15) { try { fs.unlinkSync(path.join(bbDir, files.shift())); } catch (_) { break; } }
  bbLine('MAIN', 'START', {
    app: app.getVersion(), electron: process.versions.electron, os: `${process.platform} ${os.release()}`,
    cpus: os.cpus().length, ramGB: Math.round(os.totalmem() / 1e9), userData: app.getPath('userData'), library: LIB(),
  });
  for (const f of LIB_FOLDERS) fs.mkdirSync(path.join(LIB(), f), { recursive: true });
}
process.on('uncaughtException', e => bbLine('MAIN', 'UNCAUGHT', { msg: e.message, stack: e.stack }));

const clean = s => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'UNTITLED';
function uniquePath(dir, name) {
  const ext = path.extname(name), base = clean(name.slice(0, name.length - ext.length));
  let p = path.join(dir, base + ext), k = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${k++})${ext}`);
  return p;
}
// every library path is checked so nothing can escape the library folder
function inLib(rel) {
  const root = path.resolve(LIB());
  const p = path.resolve(root, rel || '.');
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error('OUTSIDE LIBRARY');
  return p;
}
const relOf = abs => path.relative(LIB(), abs).split(path.sep).join('/');
function entries(dir, audioOnly, exts) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return { error: e.code || e.message, items: [] }; }
  const items = [];
  for (const d of list) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(dir, d.name); let st = null;
    try { st = fs.statSync(full); } catch (_) { continue; }
    const isDir = st.isDirectory();
    if (!isDir && audioOnly && !(exts || AUDIO_EXT).has(path.extname(d.name).toLowerCase())) continue;
    items.push({ name: d.name, dir: isDir, size: st.size, mtime: st.mtimeMs });
  }
  items.sort((a, b) => (b.dir - a.dir) || (a.dir ? a.name.localeCompare(b.name) : b.mtime - a.mtime));
  return { items };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 940, minWidth: 1280, minHeight: 780, backgroundColor: '#000000',
    title: 'LowOrbit Chip Studio', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile('index.html');
  win.webContents.on('render-process-gone', (e, d) => bbLine('MAIN', 'RENDERER GONE', d));
  win.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) bbLine('CONSOLE', 'ERROR', { msg, line, src }); });
  win.webContents.on('will-navigate', e => e.preventDefault()); // dropped files never navigate away
  if (process.env.LO_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 800));
        if (process.env.LO_SHOT_JS) await win.webContents.executeJavaScript(process.env.LO_SHOT_JS);
        await new Promise(r => setTimeout(r, parseInt(process.env.LO_SHOT_WAIT || '9000', 10)));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.LO_SHOT, img.toPNG());
      } catch (e) { fs.writeFileSync(process.env.LO_SHOT + '.err', String(e.stack || e)); }
      app.quit();
    });
  }
}

const H = (name, fn) => ipcMain.handle(name, async (e, ...a) => {
  try { return await fn(...a); } catch (err) { bbLine('MAIN', 'IPC ERROR', { name, msg: err.message }); return { error: err.message }; }
});
ipcMain.on('bb', (e, line) => { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {} });

// ---- library
H('save-file', ({ name, data, sub }) => {
  const dir = inLib(sub || ''); fs.mkdirSync(dir, { recursive: true });
  const p = uniquePath(dir, name); fs.writeFileSync(p, Buffer.from(data));
  bbLine('MAIN', 'SAVED', { file: p, bytes: data.byteLength }); return relOf(p);
});
H('lib-list', rel => entries(inLib(rel), true));
H('lib-mkdir', (rel, name) => { const p = uniquePath(inLib(rel), clean(name)); fs.mkdirSync(p, { recursive: true }); bbLine('MAIN', 'MKDIR', { p }); return relOf(p); });
H('lib-rename', (rel, name) => {
  const src = inLib(rel); const ext = fs.statSync(src).isDirectory() ? '' : path.extname(src);
  let nn = clean(name); if (ext && !nn.toLowerCase().endsWith(ext.toLowerCase())) nn += ext;
  const dst = uniquePath(path.dirname(src), nn); fs.renameSync(src, dst); bbLine('MAIN', 'RENAME', { src, dst }); return relOf(dst);
});
H('lib-move', (rel, destRel) => { const src = inLib(rel); const dst = uniquePath(inLib(destRel), path.basename(src)); fs.renameSync(src, dst); bbLine('MAIN', 'MOVE', { src, dst }); return relOf(dst); });
H('lib-trash', rel => {
  const src = inLib(rel); const tdir = inLib('.trash'); fs.mkdirSync(tdir, { recursive: true });
  const dst = uniquePath(tdir, path.basename(src)); fs.renameSync(src, dst);
  const idxF = path.join(tdir, '.index.json'); let idx = {}; try { idx = JSON.parse(fs.readFileSync(idxF, 'utf8')); } catch (_) {}
  idx[path.basename(dst)] = rel; fs.writeFileSync(idxF, JSON.stringify(idx));
  bbLine('MAIN', 'TRASH', { src }); return relOf(dst);
});
H('lib-restore', name => {
  const tdir = inLib('.trash'), idxF = path.join(tdir, '.index.json'); let idx = {}; try { idx = JSON.parse(fs.readFileSync(idxF, 'utf8')); } catch (_) {}
  const orig = idx[name] || ('IMPORTED/' + name); const destDir = inLib(path.dirname(orig)); fs.mkdirSync(destDir, { recursive: true });
  const dst = uniquePath(destDir, path.basename(orig)); fs.renameSync(path.join(tdir, name), dst);
  delete idx[name]; fs.writeFileSync(idxF, JSON.stringify(idx)); bbLine('MAIN', 'RESTORE', { dst }); return relOf(dst);
});
H('lib-empty-trash', () => {
  const tdir = inLib('.trash'); let n = 0;
  for (const f of fs.readdirSync(tdir)) { if (f === '.index.json') continue; fs.rmSync(path.join(tdir, f), { recursive: true, force: true }); n++; }
  fs.writeFileSync(path.join(tdir, '.index.json'), '{}'); bbLine('MAIN', 'EMPTY TRASH', { n }); return n;
});
H('lib-trash-list', () => entries(inLib('.trash'), true));
H('lib-read', rel => { const b = fs.readFileSync(inLib(rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
H('lib-export', (rel, destAbs) => { const src = inLib(rel); const dst = uniquePath(destAbs, path.basename(src)); fs.copyFileSync(src, dst); bbLine('MAIN', 'EXPORT', { dst }); return dst; });
H('lib-import', (abs, destRel) => { const dir = inLib(destRel || 'IMPORTED'); fs.mkdirSync(dir, { recursive: true }); const dst = uniquePath(dir, path.basename(abs)); fs.copyFileSync(abs, dst); bbLine('MAIN', 'IMPORT', { abs }); return relOf(dst); });
H('lib-search', q => {
  q = String(q).toLowerCase(); const out = [];
  const walk = (d, depth) => {
    if (depth > 6 || out.length > 300) return; let l = []; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of l) {
      if (x.name.startsWith('.')) continue; const f = path.join(d, x.name);
      if (x.isDirectory()) walk(f, depth + 1);
      else if (x.name.toLowerCase().includes(q) && AUDIO_EXT.has(path.extname(x.name).toLowerCase())) { const st = fs.statSync(f); out.push({ rel: relOf(f), name: x.name, size: st.size, mtime: st.mtimeMs }); }
    }
  };
  walk(LIB(), 0); return out;
});
// ---- the user's own drives, browsed inside the app (read and copy only)
H('fs-roots', () => {
  const roots = [];
  for (const [label, key] of [['DESKTOP', 'desktop'], ['DOWNLOADS', 'downloads'], ['MUSIC', 'music'], ['DOCUMENTS', 'documents'], ['HOME', 'home']]) { try { roots.push({ label, path: app.getPath(key) }); } catch (_) {} }
  if (process.platform === 'win32') { for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (fs.existsSync(d)) roots.push({ label: 'DRIVE ' + String.fromCharCode(c), path: d }); } catch (_) {} } }
  else roots.push({ label: 'ROOT', path: '/' });
  return roots;
});
H('fs-list', (abs, mode) => ({ ...entries(abs, true, mode === 'inst' ? INST_EXT : null), path: path.resolve(abs), parent: path.dirname(path.resolve(abs)) }));
H('fs-read', abs => { const b = fs.readFileSync(abs); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
H('fs-walk', (abs, recursive) => {
  const out = []; const base = path.resolve(abs);
  const walk = (d, depth) => {
    if (out.length >= 5000 || depth > 12) return; let l = []; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of l) { const f = path.join(d, x.name); if (x.isDirectory()) { if (recursive) walk(f, depth + 1); } else if (AUDIO_EXT.has(path.extname(x.name).toLowerCase())) out.push({ abs: f, rel: path.relative(base, f).split(path.sep).join('/') }); }
  };
  walk(base, 0); return { files: out, base: path.basename(base) };
});
H('open-folder', which => shell.openPath(which === 'logs' ? bbDir : LIB()));
const keepsFile = () => path.join(app.getPath('userData'), 'keeps.json');
const readKeeps = () => { try { return JSON.parse(fs.readFileSync(keepsFile(), 'utf8')); } catch (_) { return []; } };
H('keeps-list', () => readKeeps());
H('keeps-save', rec => { const k = readKeeps(); k.unshift(rec); fs.writeFileSync(keepsFile(), JSON.stringify(k.slice(0, 200))); bbLine('MAIN', 'KEEP', { title: rec.title }); return k.slice(0, 200); });
H('keeps-delete', id => { const k = readKeeps().filter(r => r.id !== id); fs.writeFileSync(keepsFile(), JSON.stringify(k)); return k; });
// ---- the newest files across the whole library (for the home screen)
H('lib-recent', n => {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6 || out.length > 3000) return; let l = []; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of l) {
      if (x.name.startsWith('.')) continue; const f = path.join(d, x.name);
      if (x.isDirectory()) walk(f, depth + 1);
      else if (AUDIO_EXT.has(path.extname(x.name).toLowerCase())) { try { const st = fs.statSync(f); out.push({ rel: relOf(f), name: x.name, size: st.size, mtime: st.mtimeMs }); } catch (_) {} }
    }
  };
  walk(LIB(), 0); out.sort((a, b) => b.mtime - a.mtime); return out.slice(0, Math.max(1, Math.min(50, n || 12)));
});
// ---- song history: the skeleton of every song made (no audio), so the LISTENER can keep songs from repeating
const histFile = () => path.join(app.getPath('userData'), 'history.json');
const readHist = () => { try { const v = JSON.parse(fs.readFileSync(histFile(), 'utf8')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
H('hist-list', () => readHist());
H('hist-add', rec => { const h = readHist(); h.push(rec); const keep = h.slice(-200); fs.writeFileSync(histFile(), JSON.stringify(keep)); return keep.length; });
H('hist-love', (seed, on) => { const h = readHist(); for (let i = h.length - 1; i >= 0; i--) if (h[i].seed === seed) { h[i].love = !!on; if (on) delete h[i].mark; break; } fs.writeFileSync(histFile(), JSON.stringify(h)); bbLine('MAIN', 'LOVE', { seed, on: !!on }); return true; });
H('hist-mark', (seed, mark) => { const h = readHist(); for (let i = h.length - 1; i >= 0; i--) if (h[i].seed === seed) { h[i].mark = mark; if (mark) h[i].love = false; break; } fs.writeFileSync(histFile(), JSON.stringify(h)); bbLine('MAIN', 'MARK', { seed, mark }); return true; });
// ---- the user's own style blueprints
const bpFile = () => path.join(app.getPath('userData'), 'blueprints.json');
const readBps = () => { try { const v = JSON.parse(fs.readFileSync(bpFile(), 'utf8')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
H('bp-list', () => readBps());
H('bp-save', bp => { const k = readBps().filter(b => b.id !== bp.id); k.unshift(bp); fs.writeFileSync(bpFile(), JSON.stringify(k.slice(0, 300))); bbLine('MAIN', 'BLUEPRINT SAVED', { name: bp.name }); return k.slice(0, 300); });
H('bp-delete', id => { const k = readBps().filter(b => b.id !== id); fs.writeFileSync(bpFile(), JSON.stringify(k)); return k; });
// ---- the user's own scanned instruments (v0.6): only measured numbers, never audio
const instFile = () => path.join(app.getPath('userData'), 'instruments.json');
const readInst = () => { try { const v = JSON.parse(fs.readFileSync(instFile(), 'utf8')); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
H('inst-list', () => readInst());
H('inst-save', p => { const k = readInst().filter(b => b.id !== p.id && b.name !== p.name); k.unshift(p); fs.writeFileSync(instFile(), JSON.stringify(k.slice(0, 100))); bbLine('MAIN', 'INSTRUMENT SAVED', { name: p.name, numbers: p.count }); return k.slice(0, 100); });
H('inst-delete', id => { const k = readInst().filter(b => b.id !== id); fs.writeFileSync(instFile(), JSON.stringify(k)); bbLine('MAIN', 'INSTRUMENT DELETED', { id }); return k; });

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-component-update'); // fully offline: no background downloads
app.whenReady().then(() => { bbInit(); createWindow(); });
app.on('window-all-closed', () => { bbLine('MAIN', 'QUIT'); app.quit(); });
