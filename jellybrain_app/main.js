/* JELLY BRAIN - main process: the frameless window (Tom's art is the window), the black box flight recorder,
   saved songs, SoundFont import and SEND BLACK BOX. SuperSoloLabs. */
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');

const ART_W = 1792, ART_H = 2400, SCR_H = 1080;   // the art, and the SNES screen's height inside it (art pixels)
let win, logFile, bbDir, settings = {}, setFile, SIZE = null;
const DOCS = () => path.join(app.getPath('documents'), 'SuperSoloLabs', 'JellyBrain');
const SONGS = () => path.join(app.getPath('music'), 'Jelly Brain');

function bbLine(cat, msg, data) {
  const line = `${new Date().toISOString()} [${cat}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}\n`;
  try { fs.appendFileSync(logFile, line); } catch (_) {}
}
function bbInit() {
  bbDir = path.join(DOCS(), 'BlackBox');
  fs.mkdirSync(bbDir, { recursive: true });
  logFile = path.join(bbDir, `session-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const files = fs.readdirSync(bbDir).filter(f => f.startsWith('session-') || f.startsWith('MARK_')).sort();
  while (files.length > 15) { try { fs.unlinkSync(path.join(bbDir, files.shift())); } catch (_) { break; } }
  const d = screen.getPrimaryDisplay();
  bbLine('MAIN', 'START', { app: app.getVersion(), electron: process.versions.electron, os: `${process.platform} ${os.release()}`, cpus: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1e9), screen: { w: d.size.width, h: d.size.height, scale: d.scaleFactor, work: d.workAreaSize }, docs: DOCS(), songs: SONGS() });
}
process.on('uncaughtException', e => bbLine('MAIN', 'UNCAUGHT', { msg: e.message, stack: e.stack }));
const loadSettings = () => { setFile = path.join(DOCS(), 'settings.json'); try { settings = JSON.parse(fs.readFileSync(setFile, 'utf8')); } catch (_) { settings = {}; } };
const saveSettings = () => { try { fs.writeFileSync(setFile, JSON.stringify(settings, null, 1)); } catch (e) { bbLine('MAIN', 'SETTINGS SAVE FAILED', e.message); } };

// the biggest crisp size within about 85% of the screen height: whole-number SNES pixels once they reach 2x
function windowSize(display) {
  const wa = display.workAreaSize, maxH = Math.floor(wa.height * 0.85);
  let k = maxH * SCR_H / ART_H / 224;
  if (k >= 2) k = Math.floor(k);
  let H = Math.round(k * 224 * ART_H / SCR_H); if (H > maxH) H = maxH;
  const W = Math.round(H * ART_W / ART_H);
  return { W, H: Math.round(W * ART_H / ART_W), k };
}

function createWindow() {
  const saved = settings.win || null;
  let display = screen.getPrimaryDisplay();
  if (saved) { const m = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: 10, height: 10 }); if (m) display = m; }
  const sz = windowSize(display);
  let x, y;
  if (saved && saved.x != null) { x = saved.x; y = saved.y; }
  else { x = Math.round(display.workArea.x + (display.workArea.width - sz.W) / 2); y = Math.round(display.workArea.y + (display.workArea.height - sz.H) / 2); }
  // keep it on screen
  const wa = display.workArea; x = Math.max(wa.x - sz.W + 80, Math.min(x, wa.x + wa.width - 80)); y = Math.max(wa.y, Math.min(y, wa.y + wa.height - 80));
  win = new BrowserWindow({
    x, y, width: sz.W, height: sz.H, useContentSize: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#07051a', title: 'Jelly Brain', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  bbLine('MAIN', 'WINDOW', { w: sz.W, h: sz.H, snesScale: +sz.k.toFixed(2), x, y, scale: display.scaleFactor });
  // v0.7.1 (Tom): the box is LOCKED. Windows with display scaling can grow a frameless window a pixel at a time while it
  // is dragged; the size is pinned (min = max = the size), and every move puts it back at exactly that size.
  SIZE = { w: sz.W, h: sz.H };
  win.setMinimumSize(sz.W, sz.H); win.setMaximumSize(sz.W, sz.H);
  win.on('resize', () => { const b = win.getContentBounds(); if (b.width !== SIZE.w || b.height !== SIZE.h) { win.setContentBounds({ x: b.x, y: b.y, width: SIZE.w, height: SIZE.h }); bbLine('MAIN', 'SIZE HELD', { was: [b.width, b.height] }); } });
  win.on('will-resize', e => e.preventDefault());
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile('index.html');
  win.on('moved', () => { const b = win.getBounds(); settings.win = { x: b.x, y: b.y }; saveSettings(); });
  win.webContents.on('render-process-gone', (e, d) => bbLine('MAIN', 'RENDERER GONE', d));
  win.webContents.on('console-message', (e, level, msg, line, src) => { if (level >= 2) bbLine('CONSOLE', 'ERROR', { msg, line, src }); });
  win.webContents.on('will-navigate', e => e.preventDefault());
  if (process.env.JB_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 1200));
        if (process.env.JB_SHOT_JS) await win.webContents.executeJavaScript(process.env.JB_SHOT_JS);
        await new Promise(r => setTimeout(r, parseInt(process.env.JB_SHOT_WAIT || '6000', 10)));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.JB_SHOT, img.toPNG());
      } catch (e) { fs.writeFileSync(process.env.JB_SHOT + '.err', String(e.stack || e)); }
      app.quit();
    });
  }
}

const H = (name, fn) => ipcMain.handle(name, async (e, ...a) => {
  try { return await fn(...a); } catch (err) { bbLine('MAIN', 'IPC ERROR', { name, msg: err.message }); return { error: err.message }; }
});
ipcMain.on('bb', (e, line) => { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {} });

// ---- window: drag by the frame or the logo, minimize, close
let drag = null;
ipcMain.on('drag-start', (e, ox, oy) => {
  const b = win.getContentBounds(); const c = screen.getCursorScreenPoint(); drag = { dx: c.x - b.x, dy: c.y - b.y };
  if (drag.t) clearInterval(drag.t);
  drag.t = setInterval(() => { if (!drag) return; const p = screen.getCursorScreenPoint(); win.setContentBounds({ x: Math.round(p.x - drag.dx), y: Math.round(p.y - drag.dy), width: SIZE.w, height: SIZE.h }); }, 8);
});
ipcMain.on('drag-end', () => { if (drag) { clearInterval(drag.t); drag = null; const b = win.getBounds(); settings.win = { x: b.x, y: b.y }; saveSettings(); } });
ipcMain.on('minimize', () => win.minimize());
ipcMain.on('close', () => { bbLine('MAIN', 'CLOSE'); app.quit(); });

// ---- settings
H('settings-get', () => settings);
H('settings-set', (k, v) => { settings[k] = v; saveSettings(); return true; });

// ---- songs: SAVE writes the WAV to Music\Jelly Brain and keeps the recipe so it can be made again
const clean = s => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'UNTITLED';
function uniquePath(dir, name) { const ext = path.extname(name), base = clean(name.slice(0, name.length - ext.length)); let p = path.join(dir, base + ext), k = 2; while (fs.existsSync(p)) p = path.join(dir, `${base} (${k++})${ext}`); return p; }
H('song-save', ({ name, wav, mp3, rec }) => {
  fs.mkdirSync(SONGS(), { recursive: true });
  const p = uniquePath(SONGS(), name + '.wav'); fs.writeFileSync(p, Buffer.from(wav));
  // v0.7.3: the MP3 sits next to the WAV with the same name (the WAV stays: the title screen plays your THEME from it)
  if (mp3) { const m = p.replace(/\.wav$/i, '.mp3'); fs.writeFileSync(m, Buffer.from(mp3)); rec = { ...rec, mp3: path.basename(m) }; }
  const kf = path.join(DOCS(), 'saved.json'); let list = []; try { list = JSON.parse(fs.readFileSync(kf, 'utf8')); } catch (_) {}
  list.push({ ...rec, file: p, savedAt: new Date().toISOString() }); fs.writeFileSync(kf, JSON.stringify(list.slice(-500)));
  bbLine('MAIN', 'SONG SAVED', { file: p, bytes: wav.byteLength, scene: rec.scene }); return { file: path.basename(p) };
});
// v0.7.3 MARK: one text file per marked stretch, in the black box folder (SEND BLACK BOX zips them with the logs)
H('mark-save', ({ text, stamp }) => { const d = path.join(DOCS(), 'BlackBox'); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, `MARK_${stamp}.txt`); fs.writeFileSync(f, text); bbLine('MARK', 'FILE', { file: path.basename(f) }); return { file: path.basename(f) }; });
H('saved-list', () => { try { return JSON.parse(fs.readFileSync(path.join(DOCS(), 'saved.json'), 'utf8')); } catch (_) { return []; } });
H('read-file', p => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
H('open-songs', () => { fs.mkdirSync(SONGS(), { recursive: true }); return shell.openPath(SONGS()); });

// ---- SoundFonts: the player's own .sf2 files play as instruments (copied into Documents, never shipped)
H('sf-import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'ADD A SOUNDFONT', filters: [{ name: 'SoundFont', extensions: ['sf2'] }], properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return { files: [] };
  const dir = path.join(DOCS(), 'SoundFonts'); fs.mkdirSync(dir, { recursive: true }); const out = [];
  for (const f of r.filePaths) { const dst = path.join(dir, path.basename(f)); if (path.resolve(f) !== path.resolve(dst)) fs.copyFileSync(f, dst); out.push(dst); bbLine('MAIN', 'SOUNDFONT IMPORTED', { file: path.basename(f), bytes: fs.statSync(dst).size }); }
  return { files: out };
});
H('sf-list', () => { const dir = path.join(DOCS(), 'SoundFonts'); try { return fs.readdirSync(dir).filter(f => /\.sf2$/i.test(f)).map(f => path.join(dir, f)); } catch (_) { return []; } });
H('sf-remove', p => { const dir = path.resolve(path.join(DOCS(), 'SoundFonts')); if (path.resolve(path.dirname(p)) !== dir) throw new Error('NOT A JELLY BRAIN SOUNDFONT'); fs.unlinkSync(p); bbLine('MAIN', 'SOUNDFONT REMOVED', path.basename(p)); return true; });

// ---- SEND BLACK BOX: every session log in one zip on the Desktop, ready to attach
function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) { // [{name, data:Buffer}] stored (no compression): small, simple, opens everywhere
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const nm = Buffer.from(f.name, 'utf8'), crc = crc32(f.data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt32LE(0, 10);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, f.data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt32LE(0, 12);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm); off += 30 + nm.length + f.data.length;
  }
  const cs = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cs.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cs, e]);
}
H('send-blackbox', () => {
  bbLine('MAIN', 'SEND BLACK BOX');
  const date = new Date().toISOString().slice(0, 10), base = `SSL_JellyBrain_BlackBox_${date}`;
  const files = fs.readdirSync(bbDir).filter(f => f.startsWith('session-') || f.startsWith('MARK_')).sort().map(f => ({ name: `${base}/${f}`, data: fs.readFileSync(path.join(bbDir, f)) }));
  try { files.push({ name: `${base}/settings.json`, data: Buffer.from(JSON.stringify(settings, null, 1)) }); } catch (_) {}
  const p = uniquePath(app.getPath('desktop'), base + '.zip'); fs.writeFileSync(p, zipStore(files));
  shell.showItemInFolder(p); return { file: path.basename(p) };
});

app.whenReady().then(() => { loadSettings(); bbInit(); createWindow(); });
app.on('window-all-closed', () => { bbLine('MAIN', 'QUIT'); app.quit(); });
