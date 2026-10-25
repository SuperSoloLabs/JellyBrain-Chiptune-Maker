/* JELLY BRAIN - the game: screens, controller / keyboard / mouse, the player, COSMIC, the black box. */
(function () {
  const VERSION = '0.7.3';
  const host = window.host || { bb() {}, settingsGet: async () => ({}), settingsSet: async () => {}, dragStart() {}, dragEnd() {}, minimize() {}, close() {}, songSave: async () => ({}), savedList: async () => [], readFile: async () => null, openSongs: async () => {}, sfImport: async () => ({ files: [] }), sfList: async () => [], sfRemove: async () => {}, sendBlackBox: async () => ({}) };
  const BB = window.BB;
  const SC = window.JBScreen, ST = window.JBStage;
  const canvas = document.getElementById('c'), g = canvas.getContext('2d');
  const scr = document.createElement('canvas'); scr.width = 256; scr.height = 239; const sg = scr.getContext('2d');
  const ROOMS = LO.JB_ROOMS.map(r => r.name);
  const S = window.JB = {
    version: VERSION, mode: 'title', scenes: LO.JB_SCENES, scene: 0, listTop: 0, focus: 'list', row: 0, dials: LO.JB_SCENES[0].dials.slice(), room: LO.JB_SCENES[0].room, roomFlash: 0,
    viz: new Array(8).fill(0), song: null, pos: 0, playing: false, busy: false, toast: null, cosmic: false, pressed: {}, titleSel: 0, titleT0: 0, attract: false,
    options: { rows: [], sel: 0, info: '', remap: null }, settings: {}, sfNames: [],
  };
  const now = () => performance.now() / 1000;
  const toast = (msg, col, sec) => { S.toast = { msg, col, until: now() + (sec || 2.5) }; };

  // ------------------------------------------------------------ the brain's worker
  const worker = new Worker('src/jb_worker.js'); let reqId = 0; const waiting = new Map();
  worker.onmessage = e => { const m = e.data, w = waiting.get(m.id); if (w) { waiting.delete(m.id); m.type === 'error' ? w.rej(new Error(m.msg + ' | ' + m.stack)) : w.res(m); } };
  worker.onerror = e => BB.error('WORKER', e.message || e);
  const ask = (type, payload, transfer) => new Promise((res, rej) => { const id = ++reqId; waiting.set(id, { res, rej }); worker.postMessage({ id, type, ...payload }, transfer || []); });

  // ------------------------------------------------------------ audio: the song (dry + COSMIC, crossfaded), menu sounds
  const ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  const P = { dry: null, cos: null, stem: null, gS: null, srcs: [], t0: 0, off: 0, gD: null, gC: null, bars: null, barMax: null, title: null };
  const toBuf = (L, R) => { const b = ac.createBuffer(2, L.length, 32000); b.copyToChannel(L, 0); b.copyToChannel(R, 1); return b; };
  function songPos() { if (!S.song) return 0; let p = P.off + (S.playing ? ac.currentTime - P.t0 : 0); const s = S.song; if (s.loop && s.loopE > s.loopS && p > s.loopE) p = s.loopS + (p - s.loopS) % (s.loopE - s.loopS); return Math.min(p, s.len); }
  function stopSources() { for (const x of P.srcs) { try { x.stop(); } catch (_) {} } P.srcs = []; }
  function startAt(pos) {
    stopSources(); if (!P.dry) return;
    P.gD = ac.createGain(); P.gC = ac.createGain(); P.gD.connect(master); P.gC.connect(master);
    P.gD.gain.value = fxOn() && P.cos ? 0 : 1; P.gC.gain.value = fxOn() && P.cos ? 1 : 0;
    const mk = (buf, gain) => { const s = ac.createBufferSource(); s.buffer = buf; if (S.song.loop && S.song.loopE > S.song.loopS) { s.loop = true; s.loopStart = S.song.loopS; s.loopEnd = S.song.loopE; } s.connect(gain); s.start(ac.currentTime + 0.02, pos); s.onended = () => { if (P.srcs.includes(s) && !s.loop && S.playing) { S.playing = false; P.off = 0; } }; P.srcs.push(s); };
    mk(P.dry, P.gD); if (P.cos) mk(P.cos, P.gC);
    // v0.7.2 SFX hijack: the stolen voice's exact signal, inverted only while a menu sound has its voice
    P.gS = null; if (P.stem) { P.gS = ac.createGain(); P.gS.gain.value = 0; P.gS.connect(master); mk(P.stem, P.gS); }
    P.t0 = ac.currentTime + 0.02; P.off = pos; S.playing = true;
  }
  function play() { if (ac.state === 'suspended') ac.resume(); if (!P.dry) return; if (S.title) stopTitleMusic(); startAt(S.pos >= S.song.len - 0.05 ? 0 : S.pos); }
  function stop() { S.pos = songPos(); P.off = S.pos; stopSources(); S.playing = false; }
  function setSong(m, keepPos) {
    const pos = keepPos ? songPos() : 0, was = S.playing || !keepPos;
    P.dry = toBuf(m.L, m.R); P.cos = m.cL ? toBuf(m.cL, m.cR) : null;
    if (m.sL || !keepPos) { P.stem = m.sL ? toBuf(m.sL, m.sR) : null; P.steal = m.steal || null; }
    if (m.bars) { P.bars = m.bars; P.barMax = m.bars.map(b => { let x = 1e-6; for (const v of b) x = Math.max(x, v); return x; }); }
    S.song = { ...m.info, bench: m.bench || (S.song && S.song.bench) || null }; S.pos = pos;
    if (was) startAt(pos); else stopSources();
  }
  function setCosmicGains(on) { if (!P.gD) return; const t = ac.currentTime; for (const [gn, v] of [[P.gD, on && P.cos ? 0 : 1], [P.gC, on && P.cos ? 1 : 0]]) { gn.gain.cancelScheduledValues(t); gn.gain.setValueAtTime(gn.gain.value, t); gn.gain.linearRampToValueAtTime(v, t + 0.4); } }
  const SFX = {};
  async function loadSfx() { try { const m = await ask('menusfx', {}); for (const [k, x] of Object.entries(m.sfx)) { const b = ac.createBuffer(1, x.length, 32000); b.copyToChannel(x, 0); SFX[k] = b; } } catch (e) { BB.error('MENU SOUNDS', e); } }
  function sfx(k) {
    const b = SFX[k]; if (!b) return; if (ac.state === 'suspended') ac.resume();
    const s = ac.createBufferSource(), gn = ac.createGain(); gn.gain.value = 0.32; s.buffer = b; s.connect(gn); gn.connect(master); s.start();
    // the menu sound takes one real voice of the song for exactly its length (never the melody or the bass), then hands it back
    if (S.playing && P.gS && !fxOn()) { const t = ac.currentTime, g = P.gS.gain; g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(-1, t + 0.002); g.setValueAtTime(-1, t + b.duration); /* out in 2 ms, as GAIN $9F (linear decrease, rate 31) does it: no click */ g.linearRampToValueAtTime(0, t + b.duration + 0.012); }
  }

  // the title music: your newest saved THEME, looping under PRESS START
  async function startTitleMusic() {
    if (S.title || S.playing) return;
    try {
      const list = await host.savedList(); const th = (list || []).filter(r => r.scene === 'THEME').pop(); if (!th || S.mode !== 'title') return;
      const ab = await host.readFile(th.file); if (!ab || ab.error) return;
      const buf = await ac.decodeAudioData(ab); const s = ac.createBufferSource(), gn = ac.createGain(); gn.gain.value = 0.8; s.buffer = buf; s.loop = true; s.connect(gn); gn.connect(master); s.start();
      S.title = { s, gn }; BB.log('TITLE', 'THEME MUSIC', { file: th.file });
    } catch (e) { BB.error('TITLE MUSIC', e); }
  }
  function stopTitleMusic() { if (!S.title) return; const { s, gn } = S.title; S.title = null; try { gn.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3); s.stop(ac.currentTime + 0.32); } catch (_) {} }

  // ------------------------------------------------------------ the actions
  function sceneTo(k, quiet) {
    k = Math.max(0, Math.min(S.scenes.length - 1, k)); if (k === S.scene) return;
    S.scene = k; S.dials = S.scenes[k].dials.slice(); S.room = S.scenes[k].room;
    if (k < S.listTop) S.listTop = k; if (k >= S.listTop + 11) S.listTop = k - 10;
    if (!quiet) sfx('move'); BB.log('CHOICE', 'SCENE', { scene: S.scenes[k].name });
  }
  async function make(why) {
    if (S.busy) return;
    stopTitleMusic(); S.busy = true; ST.jiggle(); sfx('make'); rumble();
    const seed = (Math.random() * 4294967295) >>> 0, sc = S.scenes[S.scene];
    BB.log('MAKE', 'REQUEST', { why, scene: sc.name, dials: S.dials, room: S.room, seed, cosmic: S.cosmic });
    const t0 = performance.now();
    try {
      if (S.playing) stop();
      const m = await ask('make', { scene: S.scene, dials: S.dials.slice(), room: S.room, seed, post: fxFlags() });
      setSong(m, false); ST.face('happy', now(), 2.5);
      const ms = Math.round(performance.now() - t0);
      BB.log('MAKE', 'SONG', { scene: sc.name, title: m.info.title, seed, dials: S.dials, room: S.room, bpm: m.info.bpm, key: m.info.key, mode: m.info.mode, len: +m.info.len.toFixed(1), loop: m.info.loop, form: m.info.form, epic: m.info.epic, inst: m.info.inst, ram: m.info.ram, score: m.info.score, mind: m.mind, ms, cosmic: S.cosmic });
      if (ms > 10000) BB.log('PERF', 'SLOW MAKE', { ms });
    } catch (e) { BB.error('MAKE FAILED', e); toast('OOPS! THE BRAIN SNEEZED. TRY AGAIN.', SC.C.PINK); ST.face('frown', now(), 2.5); }
    S.busy = false;
  }
  function chest() {
    // the treasure chest: a surprise scene, dials and room, made at once (from any screen, even the title)
    sfx('chest'); ST.face('surprise', now(), 1.3); S.attract = false; if (S.mode !== 'main') { S.mode = 'main'; }
    const k = Math.floor(Math.random() * S.scenes.length); sceneTo(k, true);
    S.dials = S.dials.map(d => Math.max(1, Math.min(6, d + Math.round((Math.random() - 0.5) * 3))));
    S.room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
    BB.log('CHOICE', 'CHEST', { scene: S.scenes[k].name, dials: S.dials, room: S.room });
    make('chest');
  }
  async function roomStep(d) {
    const i = ROOMS.indexOf(S.room); S.room = ROOMS[(i + d + ROOMS.length) % ROOMS.length]; S.roomFlash = d; setTimeout(() => { S.roomFlash = 0; }, 120);
    sfx('dial'); BB.log('CHOICE', 'ROOM', { room: S.room });
    if (!S.song || S.busy) return;
    const want = S.room; clearTimeout(roomStep.t);
    roomStep.t = setTimeout(async () => { try { const m = await ask('room', { room: want, post: fxFlags() }); if (S.room === want) { setSong(m, true); } } catch (e) { BB.error('ROOM', e); } }, 140);
  }
  function dialStep(r, v, set) { const old = S.dials[r]; S.dials[r] = Math.max(1, Math.min(6, set ? v : S.dials[r] + v)); if (S.dials[r] !== old) { sfx('dial'); BB.log('CHOICE', 'DIAL', { dial: ['MOOD', 'ENERGY', 'EPIC', 'LENGTH'][r], value: S.dials[r] }); } }
  // v0.7.3 MARK (Tom's design): green MARK starts a marked stretch (it turns red); pressing it again ends the stretch (green)
  // and writes a text file into the black box folder: from where to where, which sections, and everything that made the song
  let marks = 0;
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function songFacts() { const sc = S.scenes[S.scene]; return { scene: sc.name, title: S.song.title, seed: S.song.seed, dials: S.dials.slice(), room: S.room, studio: fxFlags(), bpm: S.song.bpm, key: S.song.key, mode: S.song.mode, inst: S.song.inst, tricks: S.song.tricks, sheet: S.song.sheet, steal: P.steal || null, version: VERSION }; }
  async function mark(src) {
    if (!S.song) { sfx('back'); return; }
    const pos = songPos(), sec = (S.song.sections || []).filter(x => x.t <= pos + 1e-3).pop();
    if (!S.markOn) {
      S.markOn = { t0: pos, sec0: sec ? sec.name : null, wall: new Date(), src }; sfx('select');
      BB.log('MARK', 'START', { at: +pos.toFixed(2), section: S.markOn.sec0, src, ...songFacts() });
      toast(`MARKING FROM ${mmss(pos)}...`, SC.C.PINK, 1.6); return;
    }
    const m0 = S.markOn; S.markOn = null; marks++; sfx('dial');
    let t1 = pos; if (t1 < m0.t0) t1 = S.song.len;   // the song looped (or ended) while marking: up to the end
    const secs = (S.song.sections || []).filter(x => x.t < t1 && x.t + x.len > m0.t0).map(x => x.name);
    const f = songFacts(), stamp = m0.wall.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const text = [`JELLY BRAIN MARK ${marks} (${VERSION})`, `MARKED: ${mmss(m0.t0)} TO ${mmss(t1)} (${(t1 - m0.t0).toFixed(1)} S)`, `SECTIONS: ${secs.join(', ') || '-'}`,
      `SCENE: ${f.scene}   SONG: ${f.title}   SEED: ${f.seed}`, `DIALS (MOOD ENERGY EPIC LENGTH): ${f.dials.join(' ')}   ROOM: ${f.room}`,
      `STUDIO: COSMIC ${f.studio.cosmic ? 'ON' : 'OFF'}, ECHO ${f.studio.echo ? 'ON' : 'OFF'}, REVERB ${f.studio.reverb ? 'ON' : 'OFF'}`,
      `BPM ${f.bpm}   KEY ${f.key} ${String(f.mode || '').toUpperCase()}`, `INSTRUMENTS: ${JSON.stringify(f.inst)}`, `TRICKS: ${(f.tricks || []).join(', ') || '-'}`,
      `SHEET: ${(f.sheet || []).join(' | ') || '-'}`, `MARKED WITH: ${m0.src}, ${m0.wall.toISOString()}`].join('\r\n') + '\r\n';
    BB.log('MARK', 'END', { from: +m0.t0.toFixed(2), to: +t1.toFixed(2), sections: secs, ...f });
    try { const r = await host.markSave(text, stamp); toast(`MARK ${marks} SAVED (${mmss(m0.t0)}-${mmss(t1)})`, SC.C.MINT, 2); BB.log('MARK', 'FILE', { file: r && r.file }); }
    catch (e) { BB.error('MARK FILE', e); toast('MARK LOGGED (FILE FAILED)', SC.C.PINK, 2); }
  }
  // v0.7.3 YOUR EARS CALIBRATE THE BENCHMARK: + is LOVE IT, - is BORING, logged with the whole recipe and the song's score
  let ratings = 0;
  function rate(k, src) {
    if (!S.song) { sfx('back'); return; }
    ratings++; const pos = songPos(); sfx(k === 'LOVE' ? 'select' : 'back'); ST.face(k === 'LOVE' ? 'grin' : 'sad', now(), 1.5);
    BB.log('RATE', k, { src, at: +pos.toFixed(2), bench: S.song.bench || null, ...songFacts() });
    toast(k === 'LOVE' ? 'LOVE IT! NOTED.' : 'BORING. NOTED, THE BRAIN WILL LEARN.', k === 'LOVE' ? SC.C.MINT : SC.C.PINK, 1.8);
  }
  // v0.7.3 the studio layer: COSMIC, ECHO, REVERB in any combination (all OFF = the console's own sound)
  const fxFlags = () => ({ cosmic: !!S.cosmic, echo: !!S.echo, reverb: !!S.reverb });
  const fxOn = () => !!(S.cosmic || S.echo || S.reverb);
  async function save() {
    if (!S.song || S.busy) { sfx('back'); return; }
    sfx('select');
    const useC = fxOn() && P.cos, buf = useC ? P.cos : P.dry, L = buf.getChannelData(0), R = buf.getChannelData(1);
    const wav = LO.encodeWav(L, R, 32000), sc = S.scenes[S.scene];
    const rec = { scene: sc.name, dials: S.dials.slice(), room: S.room, title: S.song.title, seed: S.song.seed, studio: useC ? fxFlags() : null, cosmic: !!(useC && S.cosmic), inst: S.song.inst, version: VERSION };
    toast('SAVING WAV + MP3...', SC.C.DIM, 30);
    let mp3 = null; const t0 = performance.now();
    try { const m = await ask('mp3', { L: L.slice(), R: R.slice() }); mp3 = m.mp3; BB.log('SAVE', 'MP3 ENCODED', { ms: Math.round(performance.now() - t0), bytes: mp3 ? mp3.byteLength : 0 }); } catch (e) { BB.error('MP3 FAILED', e); }
    try { const r = await host.songSave(S.song.title, wav, rec, mp3); ST.face('grin', now(), 2); toast('SAVED! ' + (r.file || S.song.title).replace(/\.wav$/i, '').slice(0, 24) + (mp3 ? ' (+MP3)' : ''), SC.C.MINT); BB.log('SAVE', 'SONG', { ...rec, file: r.file, mp3: !!mp3 }); }
    catch (e) { BB.error('SAVE FAILED', e); toast('COULD NOT SAVE', SC.C.PINK); ST.face('frown', now(), 2); }
  }
  const FX_NAME = { cosmic: 'COSMIC: LOWORBIT LIFT-OFF', echo: 'ECHO', reverb: 'REVERB' };
  async function fxToggle(name, from) {
    S[name] = !S[name]; sfx(S[name] ? 'select' : 'back'); BB.log('STUDIO', name.toUpperCase() + (S[name] ? ' ON' : ' OFF'), { from, studio: fxFlags() });
    host.settingsSet(name, S[name]);
    toast(FX_NAME[name] + (S[name] ? ' ON' : ' OFF'), S[name] ? SC.C.PINK : SC.C.DIM, 2);
    P.cos = null;   // the processed copy no longer matches: make it again from the console mix
    if (fxOn() && S.song) { const want = JSON.stringify(fxFlags());
      try { const m = await ask('cosmic', { post: fxFlags() }); if (JSON.stringify(fxFlags()) === want && m.cL) { P.cos = toBuf(m.cL, m.cR); if (S.playing) startAt(songPos()); } } catch (e) { BB.error('STUDIO', e); } }
    setCosmicGains(fxOn());
  }
  const cosmicToggle = from => fxToggle('cosmic', from);

  // ------------------------------------------------------------ options
  async function sfLoadAll(files) {
    let n = 0; for (const f of files) { try { const ab = await host.readFile(f); if (!ab || ab.error) continue; const m = await ask('sf-add', { buf: ab, file: f.split(/[\\/]/).pop() }, [ab]); n += m.names.length; S.sfNames.push(...m.names); BB.log('SOUNDFONT', 'LOADED', { file: m.file, instruments: m.names.length }); } catch (e) { BB.error('SOUNDFONT', e); } }
    return n;
  }
  function buildOptions() {
    S.options.rows = [
      { label: 'ADD A SOUNDFONT', value: () => `${S.sfNames.length} SOUNDS`, act: async () => { const r = await host.sfImport(); if (r.files && r.files.length) { const n = await sfLoadAll(r.files); S.options.info = `ADDED ${n} INSTRUMENTS. THE BRAIN WILL USE THEM.`; } } },
      { label: 'CLEAR SOUNDFONTS', value: () => '', act: async () => { for (const f of await host.sfList()) await host.sfRemove(f); await ask('sf-clear', {}); S.sfNames = []; S.options.info = 'SOUNDFONTS CLEARED'; BB.log('SOUNDFONT', 'CLEARED'); } },
      { label: 'SOUND', value: () => S.settings.enhanced ? 'ENHANCED' : 'AUTHENTIC', act: async () => { S.settings.enhanced = !S.settings.enhanced; host.settingsSet('enhanced', S.settings.enhanced); await ask('enhanced', { on: S.settings.enhanced }); S.options.info = S.settings.enhanced ? 'ENHANCED: NO 64 KB LIMIT' : 'AUTHENTIC: THE REAL 64 KB'; BB.log('OPTION', 'SOUND', { enhanced: S.settings.enhanced }); }, lr: true },
      { label: 'RUMBLE', value: () => S.settings.rumble === false ? 'OFF' : 'ON', act: () => { S.settings.rumble = S.settings.rumble === false; host.settingsSet('rumble', S.settings.rumble); rumble(true); }, lr: true },
      { label: 'CONTROLLER', value: () => (pad.id ? 'REMAP' : 'NONE FOUND'), act: () => { if (!pad.id) { S.options.info = 'PLUG IN A CONTROLLER FIRST'; return; } S.options.remap = { i: 0, map: {}, label: REMAP[0] }; } },
      { label: 'SEND BLACK BOX', value: () => '', act: async () => { const r = await host.sendBlackBox(); S.options.info = r && r.file ? 'ON YOUR DESKTOP: ' + r.file.slice(0, 22) : 'COULD NOT MAKE IT'; } },
      { label: 'MY SONGS', value: () => 'OPEN', act: () => host.openSongs() },
      { label: 'BACK', value: () => '', act: () => { S.mode = 'title'; S.titleT0 = now() - 3; startTitleMusic(); } },
    ];
  }
  const REMAP = ['A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'];

  // ------------------------------------------------------------ input: one set of actions for pad, keys and mouse
  const held = {}; const rep = {};
  function press(k, src) {
    ST.press[k] = now(); S.pressed[{ START: 'make', Y: 'chest', X: 'play', A: 'save' }[k] || k] = now();
    idle = now(); BB.log('INPUT', k, { src, mode: S.mode });
    if (S.attract) { S.attract = false; stop(); S.song = null; S.mode = 'title'; S.titleT0 = now(); return; }
    if (k === 'MARK') return mark(src);
    if (k === 'LOVE' || k === 'BORING') return rate(k, src);
    if (k === 'ECHO') return fxToggle('echo', src);
    if (k === 'REVERB') return fxToggle('reverb', src);
    if (k === 'Y') return chest();
    if (S.mode === 'title') {
      if (k === 'UP' || k === 'DOWN') { S.titleSel = 1 - S.titleSel; sfx('move'); }
      else if (k === 'START' || k === 'A') { sfx('select'); if (S.titleSel === 0) { S.mode = 'main'; stopTitleMusic(); } else { S.mode = 'options'; S.options.sel = 0; S.options.info = ''; } }
      else if (k === 'SELECT') cosmicToggle('select');
      return;
    }
    if (S.mode === 'options') {
      const O = S.options;
      if (O.remap) return;
      if (k === 'UP') { O.sel = (O.sel + O.rows.length - 1) % O.rows.length; sfx('move'); }
      else if (k === 'DOWN') { O.sel = (O.sel + 1) % O.rows.length; sfx('move'); }
      else if (k === 'A' || k === 'START' || ((k === 'LEFT' || k === 'RIGHT') && O.rows[O.sel].lr)) { sfx('select'); O.rows[O.sel].act(); }
      else if (k === 'B') { sfx('back'); S.mode = 'title'; S.titleT0 = now() - 3; startTitleMusic(); }
      return;
    }
    // main
    if (k === 'START') return make('start');
    if (k === 'X') { if (S.playing) stop(); else play(); sfx('select'); return; }
    // v0.7.3 the studio row: down from ROOM, left/right to pick, A to toggle
    if (S.focus === 'fx') {
      const FX = ['cosmic', 'echo', 'reverb', 'mark'];
      if (k === 'LEFT' || k === 'RIGHT') { S.fxSel = (S.fxSel + (k === 'LEFT' ? 3 : 1)) % 4; sfx('move'); return; }
      if (k === 'UP' || k === 'B') { S.focus = 'dials'; S.row = 4; sfx('move'); return; }
      if (k === 'A') { const f = FX[S.fxSel]; return f === 'mark' ? mark('pad') : fxToggle(f, 'pad'); }
    }
    if (k === 'A') return save();
    if (k === 'SELECT') return cosmicToggle('select');
    if (k === 'L') return sceneTo(S.scene - 1);
    if (k === 'R') return sceneTo(S.scene + 1);
    if (S.focus === 'list') {
      if (k === 'UP') sceneTo(S.scene - 1); else if (k === 'DOWN') sceneTo(S.scene + 1);
      else if (k === 'RIGHT') { S.focus = 'dials'; sfx('move'); }
      else if (k === 'B') { sfx('back'); S.mode = 'title'; S.titleT0 = now() - 3; startTitleMusic(); }
    } else {
      if (k === 'UP') { if (S.row > 0) { S.row--; sfx('move'); } }
      else if (k === 'DOWN') { if (S.row < 4) { S.row++; sfx('move'); } else { S.focus = 'fx'; S.fxSel = S.fxSel || 0; sfx('move'); } }
      else if (k === 'LEFT' || k === 'RIGHT') { const d = k === 'LEFT' ? -1 : 1; if (S.row === 4) roomStep(d); else dialStep(S.row, d); }
      else if (k === 'B') { S.focus = 'list'; sfx('back'); }
    }
  }
  const REPEAT = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT', 'L', 'R']);
  function down(k, src) { if (held[k]) return; held[k] = true; press(k, src); if (REPEAT.has(k)) rep[k] = { next: now() + 0.32, n: 0 }; }
  function up(k) { held[k] = false; delete rep[k]; }
  function repeats(t) { for (const [k, r] of Object.entries(rep)) if (held[k] && t >= r.next) { press(k, 'repeat'); r.n++; r.next = t + Math.max(0.035, 0.12 - r.n * 0.012); } }   // hold to scroll, speeding up
  const KEYS = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Enter: 'START', ' ': 'X', Escape: 'B', Backspace: 'B', s: 'A', a: 'A', r: 'Y', y: 'Y', Tab: 'SELECT', q: 'L', e: 'R', PageUp: 'L', PageDown: 'R', m: 'START', x: 'X', b: 'B', k: 'MARK', z: 'ECHO', v: 'REVERB', '+': 'LOVE', '=': 'LOVE', '-': 'BORING', '_': 'BORING' };
  addEventListener('keydown', e => {
    if (S.options.remap && e.key === 'Escape') { S.options.remap = null; S.options.info = 'REMAP STOPPED'; e.preventDefault(); return; }
    const k = KEYS[e.key] || KEYS[e.key.toLowerCase()]; if (!k) return; e.preventDefault(); if (e.repeat) return; down(k, 'key');
  });
  addEventListener('keyup', e => { const k = KEYS[e.key] || KEYS[e.key.toLowerCase()]; if (k) up(k); });

  // the gamepad: plug and play (Xbox, PlayStation, 8BitDo, generic), read 60 times a second
  const pad = { id: null, prev: {} };
  const STD = { A: 0, B: 1, X: 2, Y: 3, L: 4, R: 5, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  addEventListener('gamepadconnected', e => { BB.log('PAD', 'CONNECTED', { id: e.gamepad.id, mapping: e.gamepad.mapping, buttons: e.gamepad.buttons.length }); toast('CONTROLLER READY!', SC.C.MINT); });
  addEventListener('gamepaddisconnected', e => { BB.log('PAD', 'DISCONNECTED', { id: e.gamepad.id }); toast('CONTROLLER UNPLUGGED', SC.C.PINK); });
  function pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; const gp = pads[0];
    if (!gp) { pad.id = null; return; } pad.id = gp.id; pad.gp = gp;
    const map = { ...STD, ...(S.settings.padMap || {}) }, st = {};
    for (const [k, i] of Object.entries(map)) st[k] = !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    st.LEFT = st.LEFT || ax < -0.55; st.RIGHT = st.RIGHT || ax > 0.55; st.UP = st.UP || ay < -0.55; st.DOWN = st.DOWN || ay > 0.55;
    if (S.options.remap) { const R = S.options.remap; for (let i = 0; i < gp.buttons.length; i++) if (gp.buttons[i].pressed && !pad.prev['b' + i]) { R.map[REMAP[R.i]] = i; R.i++; sfx('select'); if (R.i >= REMAP.length) { S.settings.padMap = R.map; host.settingsSet('padMap', R.map); BB.log('PAD', 'REMAPPED', R.map); S.options.remap = null; S.options.info = 'CONTROLLER REMAPPED'; } else R.label = REMAP[R.i]; } for (let i = 0; i < gp.buttons.length; i++) pad.prev['b' + i] = gp.buttons[i].pressed; return; }
    for (let i = 0; i < gp.buttons.length; i++) pad.prev['b' + i] = gp.buttons[i].pressed;
    // L+R together is MARK: a shoulder press waits 90 ms to see whether the other one joins it
    if (st.L && st.R && (!pad.prev.L || !pad.prev.R)) { clearTimeout(pad.lr); pad.lr = null; pad.lrHeld = true; press('MARK', 'pad'); }
    if (!st.L && !st.R) pad.lrHeld = false;
    for (const k of Object.keys(STD)) {
      if ((k === 'L' || k === 'R') && st[k] && !pad.prev[k]) { if (!pad.lrHeld) { clearTimeout(pad.lr); pad.lr = setTimeout(() => { pad.lr = null; if (!pad.lrHeld) down(k, 'pad'); }, 90); } pad.prev[k] = st[k]; continue; }
      if (st[k] && !pad.prev[k]) down(k, 'pad'); else if (!st[k] && pad.prev[k]) up(k); pad.prev[k] = st[k]; }
  }
  function rumble(test) { if (S.settings.rumble === false && !test) return; try { const a = pad.gp && pad.gp.vibrationActuator; if (a) a.playEffect('dual-rumble', { duration: 140, strongMagnitude: 0.35, weakMagnitude: 0.6 }); } catch (_) {} }

  // the mouse: click the screen, the jelly pad, the brain; drag the window by the frame or the logo
  let lastHits = [], hover = null, dragging = false;
  const toArt = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * ST.AW, (e.clientY - r.top) / r.height * ST.AH]; };
  const inR = (p, r) => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3];
  canvas.addEventListener('mousemove', e => { const p = toArt(e); hover = inR(p, ST.HIT.min) ? 'min' : inR(p, ST.HIT.close) ? 'close' : null; canvas.style.cursor = hover || inR(p, ST.HIT.screen) || inR(p, ST.HIT.controller) || inR(p, ST.HIT.brain) ? 'pointer' : 'default'; });
  canvas.addEventListener('mousedown', e => {
    if (ac.state === 'suspended') ac.resume();
    const p = toArt(e); idle = now();
    if (inR(p, ST.HIT.min)) return host.minimize();
    if (inR(p, ST.HIT.close)) { BB.log('UI', 'CLOSE'); return host.close(); }
    if (inR(p, ST.HIT.screen)) { const sx = (p[0] - ST.HIT.screen[0]) / (ST.HIT.screen[2] - ST.HIT.screen[0]) * 256, sy = (p[1] - ST.HIT.screen[1]) / (ST.HIT.screen[3] - ST.HIT.screen[1]) * 239; return screenClick(sx, sy, e.button); }
    for (const [k, r] of Object.entries(ST.HIT.pad)) if (inR(p, r)) { down(k, 'mouse'); const u = () => { up(k); removeEventListener('mouseup', u); }; addEventListener('mouseup', u); return; }
    if (inR(p, ST.HIT.brain)) return cosmicToggle('brain');
    if (inR(p, ST.HIT.controller)) return;
    dragging = true; host.dragStart(); const u = () => { dragging = false; host.dragEnd(); removeEventListener('mouseup', u); }; addEventListener('mouseup', u);
  });
  canvas.addEventListener('wheel', e => { if (S.mode === 'main') sceneTo(S.scene + Math.sign(e.deltaY)); });
  function screenClick(x, y, button) {
    const h = lastHits.slice().reverse().find(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h); if (!h) return;
    BB.log('INPUT', 'CLICK', { act: h.act, arg: h.arg, mode: S.mode });
    switch (h.act) {
      case 'scene': S.focus = 'list'; sceneTo(h.arg); break;
      case 'scrollUp': sceneTo(S.scene - 1); break; case 'scrollDn': sceneTo(S.scene + 1); break;
      case 'dial': S.focus = 'dials'; S.row = h.arg[0]; dialStep(h.arg[0], h.arg[1], true); break;
      case 'row': S.focus = 'dials'; S.row = h.arg; sfx('move'); break;
      case 'room': S.focus = 'dials'; S.row = 4; roomStep(h.arg); break;
      case 'make': ST.press.START = now(); S.pressed.make = now(); make('click'); break;
      case 'chest': ST.press.Y = now(); S.pressed.chest = now(); chest(); break;
      case 'play': ST.press.X = now(); S.pressed.play = now(); press('X', 'click'); break;
      case 'save': ST.press.A = now(); S.pressed.save = now(); save(); break;
      case 'cosmic': cosmicToggle('badge'); break;
      case 'fx': S.focus = 'fx'; S.fxSel = ['cosmic', 'echo', 'reverb', 'mark'].indexOf(h.arg); if (h.arg === 'mark') mark('click'); else fxToggle(h.arg, 'click'); break;
      case 'seek': if (S.song) { const f = Math.max(0, Math.min(1, (x - h.arg[0]) / h.arg[1])); S.pos = f * S.song.len; if (S.playing) startAt(S.pos); else P.off = S.pos; } break;
      case 'titleItem': S.titleSel = h.arg; press('A', 'click'); break;
      case 'option': S.options.sel = h.arg; press('A', 'click'); break;
    }
  }

  // ------------------------------------------------------------ the loop: 60 frames a second
  let idle = now(), dpr = 1;
  function resize() { dpr = window.devicePixelRatio || 1; canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr); BB.log('UI', 'SIZE', { w: innerWidth, h: innerHeight, dpr }); }
  addEventListener('resize', resize);
  async function attract() {
    // after a minute on the title: a demo song plays itself
    S.attract = true; stopTitleMusic(); BB.log('TITLE', 'ATTRACT');
    const k = Math.floor(Math.random() * S.scenes.length); S.scene = k; S.dials = S.scenes[k].dials.slice(); S.room = S.scenes[k].room;
    await make('attract'); if (!S.attract) { stop(); }
  }
  let lastT = now(), slow = 0;
  function frame() {
    const t = now(), dt = t - lastT; lastT = t;
    if (dt > 0.25 && t > 3) { slow++; if (slow % 5 === 1) BB.log('PERF', 'SLOW FRAME', { ms: Math.round(dt * 1000) }); }
    pollPad(); repeats(t);
    S.pos = songPos();
    if (S.playing && P.bars) { const f = Math.min(P.bars[0].length - 1, Math.floor(S.pos * 30)); for (let i = 0; i < 8; i++) { const v = P.bars[i][f] / P.barMax[i]; S.viz[i] += ((isFinite(v) ? v : 0) - S.viz[i]) * 0.5; } }
    else for (let i = 0; i < 8; i++) S.viz[i] *= S.busy ? 0.9 + 0.1 * Math.random() : 0.9;
    if (S.busy) for (let i = 0; i < 8; i++) S.viz[i] = Math.max(S.viz[i], 0.3 + 0.3 * Math.sin(t * 8 + i));
    if (S.mode === 'title' && !S.attract && !S.busy && t - idle > 60) attract();
    if (S.attract && S.song && !S.playing && !S.busy) { S.attract = false; S.song = null; idle = t; S.titleT0 = t; startTitleMusic(); }
    S.idleFor = now() - idle;
    lastHits = SC.draw(sg, S, t);
    ST.draw(g, canvas.width, canvas.height, t, S, scr, held, hover);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ start
  (async () => {
    resize();
    S.settings = (await host.settingsGet()) || {};
    S.cosmic = !!S.settings.cosmic; S.echo = !!S.settings.echo; S.reverb = !!S.settings.reverb;
    BB.log('LAUNCH', 'JELLY BRAIN', { version: VERSION, screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio, win: [innerWidth, innerHeight] }, audio: { rate: ac.sampleRate, state: ac.state, base: ac.baseLatency }, pads: (navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean).map(p => p.id) : []), settings: { cosmic: S.cosmic, enhanced: !!S.settings.enhanced } });
    await ST.load();
    buildOptions();
    S.titleT0 = now(); requestAnimationFrame(frame);
    loadSfx();
    if (S.settings.enhanced) ask('enhanced', { on: true });
    const sfs = await host.sfList(); if (sfs && sfs.length) sfLoadAll(sfs);
    startTitleMusic();
    window.__JB = { S, press, down, up, make, chest, save, cosmicToggle, fxToggle, mark, sceneTo, play, stop, P };
  })().catch(e => BB.error('START', e));
})();
