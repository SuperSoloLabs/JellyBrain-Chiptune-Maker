/* LowOrbit Chip Studio - the VDOT studio interface (v0.3: home hub, styles, scenes) */
(function () {
  const V = VDOT, C = V.C;
  const canvas = document.getElementById('screen');
  const g = canvas.getContext('2d');
  const SR = 32000;
  const TP = 1.6;
  const ZONES = ['HOME', 'MUSIC', 'LAB', 'SCENES'];
  const ZONE_LABEL = { HOME: 'HOME', MUSIC: 'MUSIC', LAB: 'THE LAB', SCENES: 'SCENES' };
  const SUBS = { MUSIC: [['MAKE MUSIC', 'MAKE'], ['STUDIO MIND', 'MIND'], ['STUDIO', 'MUSIC'], ['STYLE LAB', 'STYLES']], LAB: [['SOUND FX', 'SOUND FX'], ['ATMOSPHERICS', 'ATMOSPHERICS'], ['CRUNCH', 'CRUNCH'], ['INSTRUMENT SCAN', 'INSTRUMENTS'], ['LIBRARY', 'LIBRARY']] };
  const zoneOf = t => (t === 'HOME' || t === 'SCENES') ? t : (t === 'MUSIC' || t === 'STYLES' || t === 'MIND' || t === 'MAKE') ? 'MUSIC' : 'LAB';
  const emptyChain = () => ({ slots: [{ preset: 'NONE', amount: 100, size: 1 }, { preset: 'NONE', amount: 100, size: 1 }], distance: 0 });

  // ================================================================ state
  const S = {
    tab: 'HOME', lastSub: { MUSIC: 'MAKE', LAB: 'SOUND FX' }, hist: [],
    mk: { chip: 'NES', pick: 'bp:heroOverworld', all: false, scroll: 0, extras: false, peek: false }, lastExtra: null, myBps: [],
    home: { mode: 'STYLE', recent: [], rsel: null, rname: '', rscroll: 0, playing: null },
    sty: { sel: 'hypnoprog96', b: null, t: 50, pickB: false, filter: 'ALL', lscroll: 0, emo: { on: false, v: 5, a: 5 }, edits: {} },
    scene: { sel: 'CASTLE', hscroll: 0, sscroll: 0 },
    mind: { log: [], order: null, feed: [], act: {}, areaAct: {}, sparks: [], shownWork: {}, pos: {}, target: null, rp: null, live: false, progress: 0, review: null, job: '', emotion: null, colors: [], prod: null, score: null },
    params: { purpose: 'AUTO', genre: 'AUTO', chip: 'NES', bright: 5, intense: 5, complex: 5, heroic: 5, surprise: 5, loop: null },
    seed: randSeed(), lockSeed: false, seedText: '',
    master: true, song: null, fx: null, chState: null, budget: null, meters: null, mixL: null, mixR: null, dryL: null, dryR: null,
    busy: false, busyLabel: '', status: 'PRESS GENERATE OR SPACE TO START',
    keeps: [],
    sfx: { text: '', what: 'MACHINE GUN', era: null, place: null, weight: null, count: null, seed: randSeed(), L: null, R: null, parsed: null, info: '', usedPlace: '', ref: false },
    atmos: { SONG: emptyChain(), SFX: emptyChain(), FILE: emptyChain() },
    atm: { source: 'SONG', slot: 0, file: null, wetL: null, wetR: null, ab: 'WET', ms: 0 },
    lib: { path: 'MUSIC', items: [], sel: null, results: null, scroll: 0, decoded: null, kept: false, trash: false },
    inst: { src: [], aIdx: 0, sf2: null, instSel: null, profile: null, tune: { bright: 0, attack: 0, decay: 0, noise: 5 }, bL: null, bInfo: null, aL: null, libL: null, libPlaying: null, running: false, busyMsg: '', srcLabel: '', loadedMine: null },
    myInst: [],
    crunch: { files: [], base: 'SINGLES', profile: 'SNES BRR', fit: false, useAtmos: false, recursive: true, running: false, cancel: false, done: 0, skipped: 0, cur: '', results: [], t0: 0 },
    modal: null, focus: null, text: {}, hover: null, drag: null, mouse: { x: 0, y: 0 }, pendingUpdate: null,
  };
  function randSeed() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }
  const PURPOSES = ['AUTO'].concat(Object.keys(LO.PURPOSES));
  const GENRES = ['AUTO'].concat(Object.keys(LO.GENRES));
  const CHIPS = [{ id: 'NES', tier: '8-BIT', yr: '1983' }, { id: 'AMIGA', tier: '16-BIT', yr: '1985' }, { id: 'SNES', tier: '16-BIT', yr: '1990' }, { id: 'GENESIS', tier: '16-BIT', yr: '1988' }, { id: 'NEO GEO', tier: 'APEX', yr: '1990' }, { id: 'ROLAND LA', tier: '16-BIT', yr: '1987' }, { id: 'LO-1', tier: 'OURS', yr: '1991' }];
  const FMT = { edl: v => (v * 16) + ' MS', efb: v => v + '%', evol: v => v + '%', bits: v => v + '-BIT', echoFb: v => v + '%', echoMix: v => v + '%', hall: v => v + '%', pump: v => v + '%' };
  function go(t) { S.tab = t; S.focus = null; const z = zoneOf(t); if (SUBS[z]) S.lastSub[z] = t; BB.log('UI', 'TAB', t); if (t === 'LIBRARY') refreshLib(); if (t === 'HOME') refreshRecent(); }
  const setStatus = s => { S.status = String(s).toUpperCase(); };
  const safeName = s => String(s).replace(/[^A-Z0-9 _\-()&.,']/gi, '').trim();

  // ================================================================ worker
  const worker = new Worker('src/worker.js');
  let reqId = 0; const pending = new Map();
  worker.onmessage = e => { const m = e.data; if (m.type === 'mindev') { if (S.mind.live) { const now = performance.now(); for (const ev of m.evs) mindFeed(ev, now); } return; } const p = pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.type === 'error') p.rej(m); else p.res(m); };
  worker.onerror = e => BB.error('WORKER', e.message);
  const ask = (type, payload, transfer) => new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage({ id, type, ...payload }, transfer || []); });

  // ================================================================ audio
  const P = {
    ctx: null, buf: null, src: null, srcGain: null, playing: false, offset: 0, startAt: 0, loop: null, an: null, scope: new Float32Array(1024),
    shot: null, shotStart: 0, shotDur: 0, shotTag: null,
    ensure() {
      if (this.ctx) return;
      this.ctx = new AudioContext(); this.out = this.ctx.createGain(); this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048;
      this.out.connect(this.an); this.an.connect(this.ctx.destination);
    },
    mk(L, R) { const b = this.ctx.createBuffer(2, L.length, SR); b.copyToChannel(L, 0); b.copyToChannel(R, 1); return b; },
    setBuffer(L, R, keepPos) { this.ensure(); const pos = this.position(); this.buf = this.mk(L, R); if (this.playing) this.start(keepPos ? pos : 0, true); else if (!keepPos) this.offset = 0; },
    start(pos, xfade) {
      this.stopShot();
      const ctx = this.ctx, s = ctx.createBufferSource(), gn = ctx.createGain();
      s.buffer = this.buf; s.connect(gn); gn.connect(this.out);
      if (this.loop) { s.loop = true; s.loopStart = this.loop[0]; s.loopEnd = this.loop[1]; }
      const now = ctx.currentTime;
      if (xfade) { gn.gain.setValueAtTime(0, now); gn.gain.linearRampToValueAtTime(1, now + 0.03); }
      s.start(now, Math.max(0, Math.min(pos, this.buf.duration - 0.01)));
      if (this.src) { const os = this.src, og = this.srcGain; og.gain.setValueAtTime(og.gain.value, now); og.gain.linearRampToValueAtTime(0, now + 0.03); try { os.stop(now + 0.05); } catch (_) {} }
      this.src = s; this.srcGain = gn; this.startAt = now; this.offset = pos; this.playing = true;
      s.onended = () => { if (this.src === s) { this.playing = false; this.offset = 0; this.src = null; } };
    },
    play() { this.ensure(); if (this.ctx.state === 'suspended') this.ctx.resume(); if (!this.buf) return; this.start(this.offset >= this.buf.duration - 0.05 ? 0 : this.offset, false); },
    stop() { if (this.src) { try { this.src.stop(); } catch (_) {} this.src = null; } this.playing = false; this.offset = 0; },
    seek(sec) { if (!this.buf) return; if (this.playing) this.start(sec, true); else this.offset = sec; },
    position() {
      if (!this.ctx || !this.buf) return 0;
      if (!this.playing) return this.offset;
      let p = this.offset + (this.ctx.currentTime - this.startAt);
      if (this.loop && p > this.loop[1]) { const len = this.loop[1] - this.loop[0]; p = this.loop[0] + ((p - this.loop[0]) % len); }
      return Math.min(p, this.buf.duration);
    },
    oneShot(L, R, tag) {
      this.ensure(); if (this.ctx.state === 'suspended') this.ctx.resume();
      this.stop(); this.stopShot();
      const s = this.ctx.createBufferSource(); s.buffer = this.mk(L, R); s.connect(this.out); s.start();
      this.shot = s; this.shotStart = this.ctx.currentTime; this.shotDur = s.buffer.duration; this.shotTag = tag || null;
      s.onended = () => { if (this.shot === s) { this.shot = null; this.shotTag = null; } };
    },
    stopShot() { if (this.shot) { try { this.shot.stop(); } catch (_) {} this.shot = null; this.shotTag = null; } },
    shotFrac() { if (!this.shot || !this.ctx) return -1; const t = (this.ctx.currentTime - this.shotStart) / this.shotDur; return t >= 0 && t <= 1 ? t : -1; },
  };
  let decodeCtx = null;
  async function decode(arrayBuffer) {
    if (!decodeCtx) decodeCtx = new AudioContext({ sampleRate: SR });
    const ab = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    const L = Float32Array.from(ab.getChannelData(0)); const R = ab.numberOfChannels > 1 ? Float32Array.from(ab.getChannelData(1)) : Float32Array.from(L);
    return { L, R };
  }

  // ================================================================ music actions
  async function generate(opts = {}) {
    if (S.busy) return;
    if (!S.lockSeed && !opts.keepSeed) S.seed = randSeed();
    S.busy = true; S.busyLabel = 'COMPOSING';
    const params = { ...S.params, seed: S.seed, master: S.master, atmos: S.atmos.SONG, color: S.text.colorText || '', history: S.hist.slice(-50), loved: S.hist.filter(h => h.love).slice(-30), myInst: S.myInst, ...(opts.extra || {}) };
    S.mk.peek = false;
    mindReset(); S.mind.live = true; S.mind.rp = null; S.mind.log = []; S.mind.review = null;
    S.lastExtra = params.blueprint ? { blueprint: params.blueprint, purpose: params.purpose, valence: params.valence, arousal: params.arousal } : null;
    BB.log('GEN', 'REQUEST', { ...params, atmos: undefined, myInst: params.myInst.length || undefined, history: params.history.length, loved: params.loved.length, blueprint: params.blueprint ? params.blueprint.id : undefined });
    const t0 = performance.now();
    try {
      const m = await ask('generate', { params });
      takeMix(m); S.song = m.song; S.chState = m.chState;
      S.mind.live = false;
      if (m.mind) {
        Object.assign(S.mind, { log: m.mind.log, order: m.mind.order, job: m.mind.job, review: m.mind.review, emotion: m.mind.emotion, colors: m.mind.colors, prod: m.mind.prod });
        if (m.atmos && !LO.atmosActive(S.atmos.SONG) && LO.atmosActive(m.atmos)) S.atmos.SONG = m.atmos;
        BB.log('MIND', 'DONE', { job: m.mind.job, order: m.mind.order, score: m.mind.review && m.mind.review.score, notes: m.mind.review && m.mind.review.notes, colors: m.mind.colors, agreements: m.mind.agreements, prod: m.mind.prod, events: m.mind.log.length });
        startReplay();
      }
      if (S.song.meta.skeleton && !opts.keepSeed) { const hrec = { ...S.song.meta.skeleton, title: S.song.title, seed: S.song.seed, at: Date.now() }; S.hist.push(hrec); if (S.hist.length > 200) S.hist.shift(); host.histAdd && host.histAdd(hrec).catch(() => {}); }
      const spb = 60 / S.song.meta.bpm;
      P.loop = S.song.meta.loop ? [S.song.meta.loopStart * 4 * spb, S.song.totalBeats * spb] : null;
      P.stop(); P.setBuffer(S.mixL, S.mixR, false); P.play();
      const ms = Math.round(performance.now() - t0);
      BB.log('GEN', 'DONE', { seed: S.seed, title: S.song.title, chip: S.song.chip.id, vector: S.song.meta.vector, ms, timing: m.timing, budget: m.budget });
      setStatus(`${S.song.title}  /  MADE IN ${(ms / 1000).toFixed(1)} S`);
    } catch (e) { BB.error('GEN FAILED', e.message || e); setStatus('GENERATE FAILED, LOGGED TO BLACK BOX'); S.mind.live = false; }
    S.busy = false;
  }
  function takeMix(m) { S.fx = m.fx; S.budget = m.budget; S.meters = m.meters; S.mixL = m.L; S.mixR = m.R; S.dryL = m.dryL || null; S.dryR = m.dryR || null; }
  function moreLikeThis() { if (!S.song) return; S.lockSeed = false; BB.log('UI', 'MORE LIKE THIS', S.song.meta.vector); generate({ extra: { ...(S.lastExtra || {}), vector: S.song.meta.vector, chip: S.song.chip.id } }); }
  function surpriseMe() {
    const r = LO.rng(randSeed());
    S.params.purpose = r.pick(PURPOSES.slice(1)); S.params.genre = r.chance(0.5) ? 'AUTO' : r.pick(GENRES.slice(1));
    S.params.chip = r.pick(CHIPS).id;
    for (const k of ['bright', 'intense', 'complex', 'heroic', 'surprise']) S.params[k] = r.int(1, 9);
    S.lockSeed = false; BB.log('UI', 'SURPRISE ME', S.params); generate();
  }
  function queueUpdate() {
    if (!S.song) return;
    clearTimeout(S.pendingUpdate);
    S.pendingUpdate = setTimeout(async () => {
      S.busy = true; S.busyLabel = 'MIXING';
      try {
        const m = await ask('update', { fx: S.fx, chState: S.chState, master: S.master, atmos: S.atmos.SONG, myInst: S.myInst });
        takeMix(m);
        const dry = S.atm.ab === 'DRY' && S.dryL;
        P.setBuffer(dry ? S.dryL : S.mixL, dry ? S.dryR : S.mixR, true);
        BB.log('MIX', 'UPDATE', { fx: S.fx, ms: m.timing && m.timing.ms, rerender: m.timing && m.timing.rerender });
      } catch (e) { BB.error('MIX FAILED', e.message || e); setStatus('MIX FAILED, LOGGED TO BLACK BOX'); }
      S.busy = false;
    }, 180);
  }
  const songBase = () => `${safeName(S.song.title)} - ${S.song.chip.id} - ${S.song.seed}`;
  async function exportWav() {
    if (!S.song || !S.mixL) return;
    const rel = await host.saveFile(`${songBase()}.wav`, LO.encodeWav(S.mixL, S.mixR, SR), 'MUSIC');
    setStatus('SAVED TO LIBRARY / MUSIC'); BB.log('EXPORT', 'WAV', { rel }); refreshLib();
  }
  async function exportLoop() {
    if (!S.song || !S.song.meta.loop) return;
    S.busy = true; S.busyLabel = 'MAKING SEAMLESS LOOP';
    try { const m = await ask('loop', {}); await host.saveFile(`${songBase()} LOOP.wav`, LO.encodeWav(m.L, m.R, SR), 'MUSIC'); setStatus('SEAMLESS GAME LOOP SAVED TO LIBRARY / MUSIC'); refreshLib(); }
    catch (e) { BB.error('LOOP FAILED', e.message || e); }
    S.busy = false;
  }
  async function exportStems() {
    if (!S.song) return;
    S.busy = true; S.busyLabel = 'STEMS';
    try {
      const m = await ask('stems', {});
      const sub = `MUSIC/${songBase()} STEMS`;
      for (const st of m.stems) await host.saveFile(`${safeName(st.name)}.wav`, LO.encodeWav(st.L, st.R, SR), sub);
      setStatus(`${m.stems.length} STEMS SAVED TO LIBRARY / MUSIC`); BB.log('EXPORT', 'STEMS', { n: m.stems.length }); refreshLib();
    } catch (e) { BB.error('STEMS FAILED', e.message || e); }
    S.busy = false;
  }
  async function keep() {
    if (!S.song) return;
    const rec = {
      id: Date.now() + '-' + S.song.seed, title: S.song.title, chip: S.song.chip.id, genre: S.song.meta.genre, purpose: S.song.meta.purpose,
      params: { ...S.params, seed: S.song.seed }, extra: S.lastExtra, vector: S.song.meta.vector, fx: S.fx, chState: S.chState, master: S.master, atmos: S.atmos.SONG, color: S.text.colorText || '', variety: S.song.meta.variety, groove: S.song.meta.groove ? 1 : 0, orch: S.song.meta.orch ? 1 : 0, lib: S.song.meta.lib || 0, savedAt: new Date().toISOString(),
    };
    S.keeps = await host.keepsSave(rec); setStatus(`KEPT: ${S.song.title}  (LIBRARY / KEPT SONGS)`);
  }
  async function loadKeep(rec) {
    S.params = { ...S.params, ...rec.params }; S.seed = rec.params.seed; S.master = rec.master !== false;
    S.atmos.SONG = rec.atmos || emptyChain(); S.text.colorText = rec.color || ''; go('MUSIC');
    // keeps made before v0.6 have no instrument picks: they replay on the classic SNES sounds, exactly as before;
    // keeps made before v0.6.1 have no orch flag: they replay without the ORCHESTRA and the mix engineer
    const fx = rec.fx && rec.chip === 'SNES' && rec.fx.ilead === undefined ? { ...rec.fx, ilead: 'CLASSIC', icounter: 'CLASSIC', ipad: 'CLASSIC' } : rec.fx;
    await generate({ keepSeed: true, extra: { ...(rec.extra || {}), fx, chState: rec.chState, vector: rec.vector, chip: rec.chip, variety: rec.variety, history: [], loved: [], groove: rec.groove || 0, orch: rec.orch || 0, lib: rec.lib != null ? rec.lib : (rec.orch ? 1 : 0) } });
  }

  // ================================================================ sound fx actions
  async function makeSfx(vary) {
    if (S.busy) return;
    if (vary) S.sfx.seed = randSeed();
    S.busy = true; S.busyLabel = 'BUILDING SOUND'; S.sfx.ref = false;
    const chain = LO.atmosActive(S.atmos.SFX) ? S.atmos.SFX : null;
    const o = { what: S.sfx.what, era: S.sfx.era, place: S.sfx.place, weight: S.sfx.weight, count: S.sfx.count, seed: S.sfx.seed, chain, roll: S.sfx.roll || null, speed: S.sfx.speed || 1 };
    try {
      const m = await ask('sfx', { opts: o });
      S.sfx.L = m.L; S.sfx.R = m.R; S.sfx.usedPlace = chain ? 'ATMOSPHERICS: ' + chainSummary(chain) : m.place; P.oneShot(m.L, m.R, 'sfx');
      S.sfx.info = `${(m.L.length / SR).toFixed(2)} S  /  BUILT IN ${m.ms} MS`;
      BB.log('SFX', 'DONE', { ...o, chain: !!chain, ms: m.ms });
    } catch (e) { BB.error('SFX FAILED', e.message || e); }
    S.busy = false;
  }
  async function referenceTake() {
    try {
      const bin = atob(window.LO_REF_MG); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const d = await decode(u8.buffer);
      S.sfx.L = d.L; S.sfx.R = d.R; S.sfx.ref = true; S.sfx.what = 'MACHINE GUN'; S.sfx.usedPlace = 'MG FIELD (ORIGINAL)';
      S.sfx.info = `${(d.L.length / SR).toFixed(2)} S  /  THE ORIGINAL TAKE`; P.oneShot(d.L, d.R, 'sfx'); BB.log('SFX', 'REFERENCE TAKE');
    } catch (e) { BB.error('REF TAKE', e); }
  }
  function applySfxText() {
    const p = LO.parseSfx(S.sfx.text); S.sfx.parsed = p;
    if (p.what) S.sfx.what = p.what;
    S.sfx.era = p.era; S.sfx.place = p.place; S.sfx.weight = p.weight; S.sfx.count = p.count;
  }

  // ================================================================ atmospherics actions
  function chainSummary(ch) {
    const names = ch.slots.filter(s => s.preset !== 'NONE' && s.amount > 0).map(s => s.preset);
    if (ch.distance > 0) names.push(LO.DISTANCE_LABEL(ch.distance));
    return names.length ? names.join(' + ') : 'NONE';
  }
  let atmTimer = null;
  function atmosChanged() {
    clearTimeout(atmTimer);
    atmTimer = setTimeout(async () => {
      const src = S.atm.source;
      BB.log('ATMOS', 'CHANGE', { src, chain: S.atmos[src] });
      if (src === 'SONG') queueUpdate();
      else if (src === 'SFX') { if (S.sfx.L && !S.sfx.ref) makeSfx(false); }
      else if (src === 'FILE' && S.atm.file) await renderFileAtmos();
    }, 220);
  }
  async function renderFileAtmos() {
    const f = S.atm.file; if (!f) return;
    S.busy = true; S.busyLabel = 'ADDING ATMOSPHERICS';
    try {
      const m = await ask('atmos', { L: f.L.slice(), R: f.R.slice(), chain: S.atmos.FILE, seed: 11 });
      S.atm.wetL = m.L; S.atm.wetR = m.R; S.atm.ms = m.ms;
      P.oneShot(S.atm.ab === 'DRY' ? f.L : m.L, S.atm.ab === 'DRY' ? f.R : m.R, 'atm');
    } catch (e) { BB.error('ATMOS FAILED', e.message || e); }
    S.busy = false;
  }
  function atmPlay() {
    const src = S.atm.source;
    if (src === 'SONG') { if (!S.song) return; if (P.playing) P.stop(); else P.play(); }
    else if (src === 'SFX') { if (S.sfx.L) P.oneShot(S.sfx.L, S.sfx.R, 'sfx'); }
    else if (S.atm.file) { const dry = S.atm.ab === 'DRY' || !S.atm.wetL; P.oneShot(dry ? S.atm.file.L : S.atm.wetL, dry ? S.atm.file.R : S.atm.wetR, 'atm'); }
  }
  function atmToggleAB() {
    S.atm.ab = S.atm.ab === 'WET' ? 'DRY' : 'WET';
    const src = S.atm.source;
    if (src === 'SONG' && S.song && S.dryL) P.setBuffer(S.atm.ab === 'DRY' ? S.dryL : S.mixL, S.atm.ab === 'DRY' ? S.dryR : S.mixR, true);
    else if (src === 'FILE' && S.atm.file && S.atm.wetL) atmPlay();
    BB.log('ATMOS', 'A/B', S.atm.ab);
  }
  async function saveFileAtmos() {
    const f = S.atm.file; if (!f || !S.atm.wetL) return;
    const base = f.name.replace(/\.[^.]+$/, '');
    await host.saveFile(`${safeName(base)} - ${safeName(chainSummary(S.atmos.FILE)).slice(0, 40)}.wav`, LO.encodeWav(S.atm.wetL, S.atm.wetR, SR), 'ATMOSPHERICS');
    setStatus('SAVED TO LIBRARY / ATMOSPHERICS'); refreshLib();
  }
  async function loadAtmFile(rel, name) {
    try {
      const ab = await host.libRead(rel); if (ab && ab.error) throw new Error(ab.error);
      const d = await decode(ab); S.atm.file = { rel, name, L: d.L, R: d.R }; S.atm.wetL = null; S.atm.source = 'FILE'; go('ATMOSPHERICS');
      if (LO.atmosActive(S.atmos.FILE)) renderFileAtmos(); else P.oneShot(d.L, d.R, 'atm');
    } catch (e) { BB.error('LOAD FILE', e); setStatus('COULD NOT READ THAT FILE (LOGGED)'); }
  }

  // ================================================================ library actions
  async function refreshLib() {
    refreshRecent();
    const L = S.lib;
    if (L.kept) { L.items = []; return; }
    const r = L.trash ? await host.libTrashList() : await host.libList(L.path);
    L.items = (r && r.items) || [];
  }
  function libOpen(path) { S.lib.path = path; S.lib.kept = false; S.lib.trash = false; S.lib.sel = null; S.lib.scroll = 0; S.lib.results = null; S.text.libSearch = ''; refreshLib(); }
  const relJoin = (a, b) => (a ? a + '/' : '') + b;
  async function libPlay(item, rel) {
    try {
      const ab = await host.libRead(rel);
      if (!ab || ab.error) return;
      const d = await decode(ab); S.lib.decoded = { rel, L: d.L, R: d.R }; P.oneShot(d.L, d.R, 'lib');
    } catch (e) { BB.error('LIB PLAY', e); setStatus('COULD NOT PLAY THAT FILE (LOGGED)'); }
  }
  async function libPlayRel(rel) { try { const ab = await host.libRead(rel); if (!ab || ab.error) return; const d = await decode(ab); P.oneShot(d.L, d.R, 'lib'); } catch (e) { BB.error('PLAY', e); } }
  async function importPaths(paths, dest) {
    let n = 0;
    for (const p of paths) { const r = await host.libImport(p, dest || 'IMPORTED'); if (r && !r.error) n++; }
    setStatus(`${n} FILE${n === 1 ? '' : 'S'} IMPORTED TO LIBRARY / ${dest || 'IMPORTED'}`); BB.log('LIB', 'IMPORT', { n });
    if (S.tab === 'LIBRARY') libOpen(dest || 'IMPORTED');
  }

  // ================================================================ crunch actions
  async function crunchAddFolder(abs) {
    const r = await host.fsWalk(abs, S.crunch.recursive); if (!r || r.error) return;
    S.crunch.files = r.files.map(f => ({ abs: f.abs, rel: f.rel })); S.crunch.base = r.base;
    setStatus(`${S.crunch.files.length} AUDIO FILES QUEUED FROM ${r.base}`);
  }
  async function runCrunch() {
    const C2 = S.crunch; if (C2.running || !C2.files.length) return;
    C2.running = true; C2.cancel = false; C2.done = 0; C2.skipped = 0; C2.results = []; C2.t0 = performance.now();
    const chain = C2.useAtmos && LO.atmosActive(S.atmos.FILE) ? S.atmos.FILE : null;
    const tag = C2.profile === 'ATMOS ONLY' ? safeName(chainSummary(S.atmos.FILE)).slice(0, 30) : C2.profile;
    BB.log('CRUNCH', 'START', { n: C2.files.length, profile: C2.profile, fit: C2.fit, chain: !!chain });
    for (const f of C2.files) {
      if (C2.cancel) break;
      C2.cur = f.rel || f.name;
      try {
        const ab = f.lib ? await host.libRead(f.lib) : await host.fsRead(f.abs);
        if (!ab || ab.error) throw new Error(ab && ab.error || 'READ FAILED');
        const d = await decode(ab);
        if (d.L.length > SR * 600) throw new Error('LONGER THAN 10 MINUTES');
        let out;
        if (C2.profile === 'ATMOS ONLY') { const m = await ask('atmos', { L: d.L, R: d.R, chain: S.atmos.FILE, seed: 5 }); out = { L: m.L, R: m.R, info: {} }; }
        else out = await ask('crunch', { L: d.L, R: d.R, profile: C2.profile, fit: C2.fit, chain });
        const relDir = (f.rel || '').split('/').slice(0, -1).join('/');
        const base = (f.rel || 'FILE').split('/').pop().replace(/\.[^.]+$/, '');
        const sub = `CRUNCHED/${safeName(C2.base) || 'SINGLES'}${relDir ? '/' + relDir.split('/').map(safeName).join('/') : ''}`;
        const rel = await host.saveFile(`${safeName(base)} [${tag}].wav`, LO.encodeWav(out.L, out.R, SR), sub);
        C2.results.unshift({ rel, name: `${base} [${tag}]`, info: out.info }); C2.done++;
        if (out.info && out.info.fits === false) BB.log('CRUNCH', 'OVER REAL MEMORY', { file: f.rel, info: out.info });
      } catch (e) { C2.skipped++; BB.log('CRUNCH', 'SKIPPED', { file: f.rel || f.abs, why: String(e.message || e) }); }
    }
    BB.log('CRUNCH', 'END', { done: C2.done, skipped: C2.skipped, ms: Math.round(performance.now() - C2.t0) });
    setStatus(`${C2.done} CRUNCHED${C2.skipped ? `, ${C2.skipped} SKIPPED (SEE BLACK BOX)` : ''}  /  LIBRARY / CRUNCHED`);
    C2.running = false; refreshLib();
  }

  // ================================================================ widgets
  let hits = [];
  const hit = (id, x, y, w, h, fn, extra) => hits.push({ id, x, y, w, h, fn, ...(extra || {}) });
  function button(id, x, y, w, h, label, opt = {}) {
    const hov = S.hover === id && !opt.disabled; const lit = opt.on;
    if (opt.primary) { // the one big main action on a screen: a solid glowing amber panel
      const boxY = y + 9, boxH = h - 9, now = performance.now();
      V.led(g, x + w / 2, y + 4, 2.6, !opt.disabled);
      if (!opt.disabled) { g.fillStyle = C.on; g.globalAlpha = 0.18; g.fillRect(x - 3, boxY - 3, w + 6, boxH + 6); }
      g.fillStyle = opt.disabled ? C.dim : hov ? C.hot : C.on; g.globalAlpha = opt.disabled ? 0.5 : lit ? 0.62 + 0.3 * Math.sin(now / 160) : 0.95;
      g.fillRect(x + 1, boxY + 1, w - 2, boxH - 2); g.globalAlpha = 1;
      V.dotBox(g, x, boxY, w, boxH, opt.disabled ? C.dim : C.hot, 3.5, 1.6);
      const p = V.fitPitch(label, w - 16, opt.pitch || 2.2);
      V.text(g, label, x + w / 2, boxY + boxH / 2 - 3.5 * p, p, '#120a02', { align: 'center', glow: false });
      if (!opt.disabled && opt.onClick) hit(id, x, y, w, h, opt.onClick, { help: opt.help });
      return;
    }
    const col = opt.disabled ? C.dim : (lit || hov ? C.on : C.mid);
    const boxY = y + 9, boxH = h - 9;
    V.led(g, x + w / 2, y + 4, opt.big ? 2.6 : 2, !!lit && !opt.disabled, opt.ledColor);
    V.dotBox(g, x, boxY, w, boxH, opt.warn && !opt.disabled ? C.warn : col, opt.big ? 3.5 : 3, opt.big ? 1.6 : 1.3);
    const p = V.fitPitch(label, w - 10, opt.pitch || TP);
    V.text(g, label, x + w / 2, boxY + boxH / 2 - 3.5 * p, p, opt.disabled ? C.dim : (lit || hov ? C.on : C.mid), { align: 'center', glow: lit || hov });
    if (!opt.disabled && opt.onClick) hit(id, x, y, w, h, opt.onClick, { right: opt.onRight, help: opt.help });
  }
  function slider(id, x, y, w, label, value, min, max, step, onChange, opt = {}) {
    const lw = opt.labelW || 92, vw = opt.valueW || 56;
    V.text(g, label, x, y + 2, TP, opt.disabled ? C.dim : C.mid, { glow: false });
    const tx = x + lw, tw = w - lw - vw, ty = y + 7;
    const n = Math.max(6, Math.floor(tw / 5)); const frac = (value - min) / (max - min);
    for (let i = 0; i < n; i++) {
      const on = i / (n - 1) <= frac + 1e-6;
      g.fillStyle = opt.disabled ? C.off : on ? (S.drag && S.drag.id === id ? C.hot : C.on) : C.dim;
      g.fillRect(tx + i * 5, ty - 1.5, 2.6, 3);
    }
    V.text(g, opt.fmt ? opt.fmt(value) : String(value), x + w, y + 2, TP, opt.disabled ? C.dim : C.on, { align: 'right', glow: false });
    if (!opt.disabled) hit(id, tx - 4, y - 2, tw + 8, 18, null, { help: opt.help,
      drag: mx => { let v = min + LO.clamp((mx - tx) / tw, 0, 1) * (max - min); v = LO.clamp(+(Math.round(v / step) * step).toFixed(3), min, max); if (v !== value) { value = v; onChange(v); } },
      wheel: d => onChange(LO.clamp(+(value + (d < 0 ? step : -step)).toFixed(3), min, max)),
    });
  }
  function field(id, x, y, w, h, opt = {}) {
    const focused = S.focus === id; const val = S.text[id] || '';
    V.dotBox(g, x, y, w, h, focused ? C.on : C.mid, 3, 1.3);
    const p = opt.pitch || 1.6;
    const shown = (val || (focused ? '' : (opt.placeholder || ''))) + (focused && Math.floor(performance.now() / 500) % 2 ? '_' : '');
    const maxChars = Math.floor((w - 20) / (6 * p));
    V.text(g, shown.slice(-maxChars), x + 10, y + h / 2 - 3.5 * p, p, val ? C.hot : C.dim, { glow: !!val });
    hit(id, x, y, w, h, () => { S.focus = id; }, { field: opt });
  }
  function panel(x, y, w, h, title, right) {
    V.dotBox(g, x, y, w, h, C.dim, 4, 1.4);
    if (title) { g.fillStyle = C.bg; g.fillRect(x + 10, y - 6, V.textWidth(title, TP) + 12, 13); V.text(g, title, x + 16, y - 5.5, TP, C.on); }
    if (right) { g.fillStyle = C.bg; g.fillRect(x + w - V.textWidth(right, TP) - 24, y - 6, V.textWidth(right, TP) + 12, 13); V.text(g, right, x + w - 18, y - 5.5, TP, C.mid, { align: 'right', glow: false }); }
  }
  const label = (x, y, s, col, p) => V.text(g, s, x, y, Math.max(1.3, p || TP), col || C.mid, { glow: false });
  function grid(prefix, x, y, w, items, cols, cur, onPick, bh = 30, gap = 6, opt = {}) {
    const bw = (w - gap * (cols - 1)) / cols;
    items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      button(prefix + it, x + c * (bw + gap), y + r * (bh + gap), bw, bh, it, { on: cur === it, pitch: opt.pitch, onClick: () => onPick(it) });
    });
    return Math.ceil(items.length / cols) * (bh + gap);
  }
  function wave(L, x, y, w, h, frac, col) {
    V.dotBox(g, x, y, w, h, C.off, 4, 1.2);
    if (!L) return;
    const n = Math.floor(w / 3), per = Math.max(1, Math.floor(L.length / n)); const px = frac >= 0 ? x + frac * w : -1;
    for (let i = 0; i < n; i++) {
      let pk = 0; for (let k = i * per; k < (i + 1) * per && k < L.length; k += 8) pk = Math.max(pk, Math.abs(L[k]));
      const hh = pk * h * 0.46, xx = x + i * 3;
      g.fillStyle = px >= 0 && xx <= px ? C.on : (col || C.mid);
      for (let yy = -hh; yy <= hh; yy += 4) g.fillRect(xx, y + h / 2 + yy, 2, 2);
    }
    if (px >= 0) V.dotVLine(g, px, y, y + h, C.hot, 3, 2);
  }
  const fmtTime = s => { s = Math.max(0, s); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB';
  function chordName(bar, meta) {
    const ch = bar.chord; const root = ((meta.key + ch[0]) % 12 + 12) % 12;
    const t = ((ch[1] - ch[0]) % 12 + 12) % 12, f = ((ch[2] - ch[0]) % 12 + 12) % 12;
    let s = LO.NOTE_NAMES[root] + (t === 3 && f === 6 ? 'DIM' : t === 3 ? 'M' : f === 8 ? '+' : '');
    if (ch.length > 3) s += ((ch[3] - ch[0]) % 12 + 12) % 12 === 11 ? 'MAJ7' : '7';
    return s;
  }
  function activeNote(i, sample) {
    const ev = S.song.events[i]; if (!ev || !ev.length) return null;
    let lo = 0, hi = ev.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ev[mid][0] <= sample) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best >= 0 && sample < ev[best][1] ? ev[best] : null;
  }

  // ================================================================ frame
  function draw() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    hits = [];
    g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const M = 16;
    V.text(g, 'LOWORBIT', M, 14, 2.6, C.on);
    const lx = M + V.textWidth('LOWORBIT', 2.6) + 14;
    V.text(g, 'CHIP STUDIO', lx, 20, 1.6, C.mid, { glow: false });
    label(lx, 34, 'V' + LO.VERSION, C.dim);
    const nz = ZONES.length, tw = Math.round(LO.clamp((W - 760) / nz, 112, 150)), tabX = W - M - nz * (tw + 6) + 6, zone = zoneOf(S.tab);
    ZONES.forEach((z, i) => button('zone' + z, tabX + i * (tw + 6), 8, tw, 40, ZONE_LABEL[z], { on: zone === z, big: zone === z, pitch: 1.6, onClick: () => go(SUBS[z] ? S.lastSub[z] : z) }));
    const r0 = lx + V.textWidth('CHIP STUDIO', 1.6) + 20, r1 = tabX - 20, cx = (r0 + r1) / 2;
    if (zone === 'MUSIC') {
      const title = S.song ? S.song.title : 'NO SONG YET';
      V.text(g, title, cx, 12, V.fitPitch(title, r1 - r0, 2.4), S.song ? C.on : C.dim, { align: 'center' });
      const sub = S.tab === 'MAKE' ? (S.song ? `${S.song.chip.name}  /  ${S.song.meta.genre}` : 'PICK A CHIP, PICK A STYLE, GENERATE') : S.tab === 'MIND' ? 'SIX MODULES, ONE SONG: WATCH THEM WORK' : S.song ? `${S.song.chip.name}  /  ${S.song.meta.genre}  /  ${S.song.meta.purpose}` : (S.tab === 'STYLES' ? 'PICK A STYLE, SET A FEELING, GENERATE' : 'FLIP THE SWITCHES, THEN GENERATE');
      V.text(g, sub, cx, 36, V.fitPitch(sub, r1 - r0, TP), C.mid, { align: 'center', glow: false });
    } else {
      const head = { HOME: 'WELCOME BACK', SCENES: 'SCENES', INSTRUMENTS: 'INSTRUMENT SCAN' }[S.tab] || S.tab;
      const sub = { HOME: 'MUSIC  /  THE LAB  /  SCENES', SCENES: 'EVERY SOUND A PLACE NEEDS', 'SOUND FX': 'BUILD GAME SOUNDS FROM MATH', ATMOSPHERICS: 'THE WORLD THE SOUND PLAYS IN', CRUNCH: 'GIVE ANY SOUND A CLASSIC CHIP FORMAT', INSTRUMENTS: 'MEASURE AN INSTRUMENT, REBUILD IT FROM MATH', LIBRARY: 'EVERYTHING YOU MADE, RIGHT HERE' }[S.tab];
      V.text(g, head, cx, 12, V.fitPitch(head, r1 - r0, 2.4), C.on, { align: 'center' });
      V.text(g, sub, cx, 36, V.fitPitch(sub, r1 - r0, TP), C.mid, { align: 'center', glow: false });
    }
    let top = 64;
    if (SUBS[zone]) {
      const subs = SUBS[zone], sbw = Math.min(190, (W - M * 2 - 40) / subs.length - 6);
      subs.forEach(([lab, t], i) => button('sub' + t, M + i * (sbw + 6), 58, sbw, 34, lab, { on: S.tab === t, pitch: 1.45, onClick: () => go(t) }));
      V.dotLine(g, M + subs.length * (sbw + 6) + 8, W - M, 79, C.off, 4, 1.2);
      top = 98;
    }
    const bottom = H - 30;
    ({ HOME: drawHome, MAKE: drawMake, STYLES: drawStyles, MIND: drawMind, SCENES: drawScenes, MUSIC: drawMusic, 'SOUND FX': drawSfx, ATMOSPHERICS: drawAtmos, CRUNCH: drawCrunch, INSTRUMENTS: drawInstruments, LIBRARY: drawLibrary })[S.tab](M, top, W, bottom);
    V.dotLine(g, M, W - M, H - 24, C.off, 4, 1.2);
    const hh = S.hover && hits.find(h0 => h0.id === S.hover && h0.help);
    let st = hh ? hh.help : S.status; if (S.busy && !hh) st = S.busyLabel + '.'.repeat(1 + Math.floor(performance.now() / 300) % 3);
    if (S.crunch.running) st = `CRUNCHING ${Math.min(S.crunch.files.length, S.crunch.done + S.crunch.skipped + 1)} / ${S.crunch.files.length}: ${S.crunch.cur}`.slice(0, 90);
    label(M, H - 16, String(st).slice(0, Math.floor((W - 520) / 8.4)), hh ? C.hot : S.busy || S.crunch.running ? C.on : C.mid);
    const keys = { HOME: 'SPACE PLAY  G GENERATE  R SURPRISE', STYLES: 'SPACE PLAY  G GENERATE  K KEEP  W WATCH IT THINK', MAKE: 'SPACE PLAY  G GENERATE  R SURPRISE  W WATCH IT THINK', MIND: 'SPACE PLAY  G GENERATE  W WATCH IT THINK', SCENES: 'CLICK A LIT SOUND TO BUILD IT', MUSIC: 'SPACE PLAY  G GENERATE  R SURPRISE  K KEEP  E EXPORT', 'SOUND FX': 'SPACE PLAY  G BUILD  R VARY', INSTRUMENTS: 'A ORIGINAL  B REBUILD  SPACE STOP' }[S.tab] || 'SPACE PLAY';
    label(W - M - V.textWidth(keys, TP), H - 16, keys, C.dim);
    if (S.modal) drawModal(W, H);
  }

  // ---------------------------------------------------------------- MUSIC
  function drawMusic(M, top, W, bottom) {
    const H = bottom - top;
    const lw = Math.max(380, Math.min(470, W * 0.27)), rw = Math.max(380, Math.min(470, W * 0.27));
    const cx0 = M + lw + 16, cw = W - M * 2 - lw - rw - 32, rx = W - M - rw;
    let x = M, y = top + 12, w = lw;
    panel(x, y, w, H - 12, 'GENERATE');
    let iy = y + 16; const ix = x + 14, iw = w - 28;
    const spare = Math.max(0, H - 12 - 720), gbh = LO.clamp(28 + spare / 9, 28, 44), sGap = LO.clamp(17 + spare / 24, 17, 28);
    label(ix, iy, 'PURPOSE', C.dim); iy += 12;
    iy += grid('pu', ix, iy, iw, PURPOSES, 4, S.params.purpose, v => { S.params.purpose = v; }, gbh, 5);
    iy += 4; label(ix, iy, 'GENRE', C.dim); iy += 12;
    iy += grid('ge', ix, iy, iw, GENRES, 3, S.params.genre, v => { S.params.genre = v; }, gbh, 5);
    iy += 4; label(ix, iy, 'CHIP', C.dim); iy += 12;
    iy += grid('ch', ix, iy, iw, CHIPS.map(c => c.id), 4, S.params.chip, v => { S.params.chip = v; }, gbh + 2, 6);
    const tier = CHIPS.find(c => c.id === S.params.chip);
    label(ix, iy, tier.id === 'LO-1' ? 'OUR CHIP  /  1991  /  OUR WRITTEN SPEC' : `${tier.tier}  /  ${tier.yr}  /  HARDWARE-TRUE LIMITS`, C.mid); iy += 18;
    label(ix, iy, 'MOOD', C.dim); iy += 14;
    for (const [k, lab] of [['bright', 'BRIGHT'], ['intense', 'INTENSITY'], ['complex', 'COMPLEXITY'], ['heroic', 'HEROIC'], ['surprise', 'SURPRISE']]) { slider('sl' + k, ix, iy, iw, lab, S.params[k], 0, 10, 1, v => { S.params[k] = v; }, { labelW: 108 }); iy += sGap; }
    iy += 2;
    const lp = S.params.loop == null ? 'AUTO' : S.params.loop ? 'ON' : 'OFF';
    label(ix, iy + 13, 'LOOP', C.dim);
    ['AUTO', 'ON', 'OFF'].forEach((o, i) => button('loop' + o, ix + 60 + i * 62, iy, 56, 30, o, { on: lp === o, onClick: () => { S.params.loop = o === 'AUTO' ? null : o === 'ON'; } }));
    button('lock', ix + iw - 110, iy, 110, 30, S.lockSeed ? 'SEED LOCKED' : 'LOCK SEED', { on: S.lockSeed, onClick: () => { S.lockSeed = !S.lockSeed; } });
    iy += 38;
    const focused = S.focus === 'seed';
    V.dotBox(g, ix, iy, iw, 24, focused ? C.on : C.dim, 3, 1.2);
    label(ix + 8, iy + 8, 'SEED', C.dim);
    V.text(g, focused ? S.seedText + (Math.floor(performance.now() / 500) % 2 ? '_' : ' ') : String(S.seed), ix + 52, iy + 8, TP, focused ? C.hot : C.on, { glow: focused });
    hit('seed', ix, iy, iw, 24, () => { S.focus = 'seed'; S.seedText = ''; });
    iy += 32;
    const bh = Math.max(46, Math.min(84, y + H - 12 - iy - 14));
    iy = Math.max(iy, y + H - 12 - bh - 14);
    button('gen', ix, iy, iw * 0.62, bh, S.busy ? 'WORKING...' : 'GENERATE', { primary: true, on: S.busy, pitch: 2.4, onClick: () => generate(), help: 'MAKE A SONG FROM THE PURPOSE, GENRE, CHIP AND MOOD ABOVE' });
    button('surp', ix + iw * 0.62 + 8, iy, iw * 0.38 - 8, bh, 'SURPRISE ME', { big: true, pitch: 1.8, onClick: surpriseMe });

    // ---- SCREEN
    x = cx0; w = cw; const song = S.song;
    panel(x, y, w, H - 12, song ? `${song.chip.full}  ${song.chip.year}` : 'SCREEN', song ? `${song.chip.voices} VOICES  /  ${song.chip.rate}  /  ${song.chip.bits}` : '');
    if (!song) {
      ['NO SONG LOADED', '', 'PICK A PURPOSE, A GENRE AND A CHIP,', 'SET THE MOOD, THEN PRESS GENERATE.', '', 'OR LET THE DICE DECIDE: SURPRISE ME.']
        .forEach((l, i) => V.text(g, l, x + w / 2, y + H * 0.32 + i * 18, TP, i === 0 ? C.on : C.mid, { align: 'center', glow: i === 0 }));
    } else {
      const pos = P.position(); const sample = Math.floor(pos * SR);
      const spb = 60 / song.meta.bpm, beat = pos / spb, barI = Math.min(song.bars.length - 1, Math.floor(beat / 4));
      label(x + 16, y + 16, `KEY ${song.meta.keyName} ${song.meta.mode.toUpperCase()}   ${song.meta.displayBpm || song.meta.bpm} BPM${song.meta.meter && song.meta.meter !== '4/4' ? '  ' + (song.meta.meter === '3/4' ? '3/4 WALTZ' : 'SHUFFLE') : ''}   SEED ${song.seed}`, C.mid);
      const bar = song.bars[Math.max(0, barI)]; const cn = chordName(bar, song.meta);
      V.text(g, cn, x + w - 16, y + 12, 2.4, bar.surprise ? C.hot : C.on, { align: 'right' });
      if (bar.surprise) label(x + w - 16 - V.textWidth('SURPRISE: ' + song.meta.surpriseName, 1.4), y + 32, 'SURPRISE: ' + song.meta.surpriseName, C.hot, 1.4);
      const nch = song.chip.channels.length, cy0 = y + 44, chH = Math.min(260, H * 0.40), colW = (w - 32) / nch;
      song.chip.channels.forEach((c, i) => {
        const cx = x + 16 + i * colW, cwid = colW - 8;
        const audible = !S.chState[i].mute && (!S.chState.some(z => z.solo) || S.chState[i].solo);
        const m = S.meters && S.meters[i] ? S.meters[i][Math.floor(sample / 640)] || 0 : 0;
        const act = activeNote(i, sample);
        V.led(g, cx + cwid / 2, cy0 + 4, 2.4, !!act && audible && P.playing);
        V.text(g, c.name, cx + cwid / 2, cy0 + 14, V.fitPitch(c.name, cwid, 1.4), audible ? C.on : C.dim, { align: 'center', glow: false });
        const rows = Math.floor((chH - 70) / 5), lit = P.playing && audible ? Math.round(m * rows) : 0, across = Math.max(1, Math.min(6, Math.floor(cwid / 7)));
        for (let r = 0; r < rows; r++) {
          g.fillStyle = r < lit ? (r > rows * 0.85 ? C.hot : C.on) : C.off; const yy = cy0 + chH - 40 - r * 5;
          for (let d = 0; d < across; d++) g.fillRect(cx + cwid / 2 - (across * 7) / 2 + d * 7 + 2, yy, 3, 3);
        }
        const nn = act && act[2] && P.playing ? LO.noteName(act[2]) : (act && P.playing ? 'HIT' : '--');
        V.text(g, nn, cx + cwid / 2, cy0 + chH - 28, V.fitPitch('C#5', cwid, 1.6), act && P.playing ? C.on : C.dim, { align: 'center', glow: false });
        V.text(g, c.role, cx + cwid / 2, cy0 + chH - 12, V.fitPitch(c.role, cwid, 1.2), C.dim, { align: 'center', glow: false });
      });
      const my = cy0 + chH + 22, mh = 46, mx = x + 16 + 96, mw = w - 32 - 96, tb = song.totalBeats;
      button('play', x + 16, my - 8, 84, mh + 8, P.playing ? '\x02 STOP' : '\x01 PLAY', { on: P.playing, big: true, pitch: 1.6, onClick: () => { if (P.playing) P.stop(); else P.play(); } });
      song.sections.forEach(s => {
        const sx = mx + (s.start * 4 / tb) * mw, sw = (s.bars * 4 / tb) * mw, cur = barI >= s.start && barI < s.start + s.bars;
        V.dotBox(g, sx + 2, my, sw - 4, mh, cur ? C.on : C.dim, 3, 1.2);
        const nm = { intro: 'INTRO', A: 'A', B: 'B', A2: 'A RETURN', break: 'BREAK', outro: 'OUTRO' }[s.name] || s.name;
        V.text(g, nm, sx + sw / 2, my + mh / 2 - 6, V.fitPitch(nm, sw - 10, TP), cur ? C.on : C.mid, { align: 'center', glow: cur });
      });
      song.bars.forEach((b, i) => { if (b.surprise) V.led(g, mx + (i * 4 / tb) * mw + (4 / tb) * mw / 2, my + mh - 8, 2, true, C.hot); });
      if (song.meta.loop) label(mx + (song.meta.loopStart * 4 / tb) * mw + 4, my + mh + 6, 'LOOP \x01', C.mid);
      V.dotVLine(g, mx + Math.min(1, beat / tb) * mw, my - 6, my + mh + 4, C.hot, 3, 2);
      hit('seek', mx, my, mw, mh, null, { click: mx2 => P.seek(LO.clamp((mx2 - mx) / mw, 0, 1) * tb * spb) });
      const sy = my + mh + 26, sh = y + H - 12 - sy - 14, sx0 = x + 16, sw0 = w - 32;
      if (sh > 40) {
        V.dotBox(g, sx0, sy, sw0, sh, C.off, 4, 1.2); label(sx0 + 8, sy + 8, 'OUTPUT', C.dim);
        if (P.an && P.playing) P.an.getFloatTimeDomainData(P.scope);
        const n = Math.floor(sw0 / 3);
        for (let i = 0; i < n; i++) { const v = P.playing ? P.scope[Math.floor(i * P.scope.length / n)] : 0; g.fillStyle = P.playing ? C.on : C.dim; g.fillRect(sx0 + i * 3, sy + sh / 2 - v * sh * 0.45, 2, 2); }
        const t = `${fmtTime(pos)} / ${fmtTime(song.total / SR)}`; label(sx0 + sw0 - 8 - V.textWidth(t, TP), sy + 8, t, C.mid);
        if (LO.atmosActive(S.atmos.SONG)) label(sx0 + 8, sy + sh - 16, 'ATMOSPHERICS: ' + chainSummary(S.atmos.SONG) + (S.atm.ab === 'DRY' ? '  (A/B: ORIGINAL)' : ''), C.on, 1.4);
      }
    }

    // ---- STUDIO
    x = rx; w = rw;
    panel(x, y, w, H - 12, 'STUDIO', song ? song.chip.name : '');
    iy = y + 18; const sx = x + 14, sw = w - 28;
    if (!song) { label(sx, iy, 'GENERATE A SONG TO OPEN THE STUDIO', C.mid); return; }
    const compact0 = H - 12 < 760;
    if (compact0) { label(sx, iy, song.chip.blurb[0], C.mid, 1.4); iy += 8; } else song.chip.blurb.forEach(b => { label(sx, iy, b, C.mid, 1.4); iy += 14; });
    iy += 6; label(sx, iy, 'CHANNELS', C.dim); iy += 12;
    const compact = H - 12 < 760; // small windows: tighter rows, toggles share a row, long selects step with < >
    const nch = song.chip.channels.length, rowH = nch > 8 || compact ? 17 : 21;
    song.chip.channels.forEach((c, i) => {
      const st = S.chState[i], nmW = 150;
      label(sx, iy + 6, c.name, st.mute ? C.dim : C.on);
      if (c.role && c.role !== c.name) label(sx + V.textWidth(c.name, TP) + 8, iy + 7, c.role, C.dim, 1.3);
      button('m' + i, sx + nmW - 4, iy - 8, 26, rowH + 4, 'M', { on: st.mute, pitch: 1.3, onClick: () => { st.mute = !st.mute; queueUpdate(); } });
      button('s' + i, sx + nmW + 26, iy - 8, 26, rowH + 4, 'S', { on: st.solo, pitch: 1.3, onClick: () => { st.solo = !st.solo; queueUpdate(); } });
      if (c.vol) slider('v' + i, sx + nmW + 62, iy + 1, sw - nmW - 62, 'VOL', Math.round(st.vol * 100), 0, 100, 5, v => { st.vol = v / 100; queueUpdate(); }, { labelW: 30, valueW: 34 });
      else label(sx + nmW + 62, iy + 4, c.note || 'FIXED', C.dim, 1.3);
      iy += rowH + 4;
    });
    iy += 6; label(sx, iy, 'CHIP EFFECTS', C.dim); iy += 14;
    const fxs = song.chip.fxSchema;
    for (let fi = 0; fi < fxs.length; fi++) {
      const f = fxs[fi], v = S.fx[f.id];
      if (f.type === 'slider') {
        let max = f.max; if (f.id === 'edl' && S.budget && S.budget.maxEdl != null) max = Math.max(0, S.budget.maxEdl);
        slider('fx' + f.id, sx, iy, sw, f.label, Math.min(v, max), f.min, Math.max(max, f.min + 1), f.step, nv => { S.fx[f.id] = Math.min(nv, max); queueUpdate(); }, { fmt: FMT[f.id], labelW: 110 });
        iy += 19;
      } else if (f.type === 'toggle' && compact) {
        const run = []; while (fi < fxs.length && fxs[fi].type === 'toggle' && run.length < 3) run.push(fxs[fi++]); fi--;
        const tw = (sw - (run.length - 1) * 6) / run.length;
        run.forEach((t, k) => button('fx' + t.id, sx + k * (tw + 6), iy - 6, tw, 26, t.label, { on: !!S.fx[t.id], pitch: 1.25, onClick: () => { S.fx[t.id] = !S.fx[t.id]; queueUpdate(); }, help: t.note || null }));
        iy += 29;
      } else if (f.type === 'toggle') {
        button('fx' + f.id, sx, iy - 6, 150, 26, f.label, { on: !!v, pitch: 1.4, onClick: () => { S.fx[f.id] = !S.fx[f.id]; queueUpdate(); } });
        if (f.note) label(sx + 160, iy + 6, f.note, C.dim, 1.3);
        iy += 29;
      } else if (f.type === 'select' && (f.cycle || (compact && f.options.length > 2))) { // v0.6: long lists (SNES instruments) step with < and >
        const opts = f.inst ? f.options.concat(S.myInst.map(q => 'MY: ' + q.name)) : f.options;
        const i0 = Math.max(0, opts.indexOf(v)), step = d => { S.fx[f.id] = opts[(i0 + d + opts.length) % opts.length]; BB.log('MIX', 'INSTRUMENT', { slot: f.id, pick: S.fx[f.id] }); queueUpdate(); };
        const HL = LO.SNESI_HIFI && LO.SNESI_HIFI.LIB[v];
        const ih = f.inst && LO.SNESI ? (HL ? `HI-DETAIL REBUILD, ${HL.tags.sound.toUpperCase()} ${HL.tags.family}, ${HL.fid}% MATCH` : LO.SNESI.FAM[v] ? LO.SNESI.FAM[v].how : v === 'CLASSIC' ? 'THE CLASSIC CHIP WAVE FROM V0.5' : String(v || '').startsWith('MY: ') ? 'YOUR SCANNED INSTRUMENT, REBUILT FROM ITS NUMBERS' : '') : '';
        if (f.id === 'ilead' && !compact) { label(sx, iy - 2, 'INSTRUMENTS  (RIGHT-CLICK STEPS BACK)', C.dim, 1.3); iy += 12; }
        label(sx, iy + 7, f.label, C.mid);
        const bx = sx + 110, bw2 = sw - 110;
        button('fx' + f.id + '<', bx, iy - 6, 28, 26, '<', { pitch: 1.4, onClick: () => step(-1) });
        button('fx' + f.id, bx + 32, iy - 6, bw2 - 64, 26, String(v || 'CLASSIC'), { on: !!v && v !== 'CLASSIC', pitch: 1.3, onClick: () => step(1), onRight: () => step(-1), help: ih ? `${v}: ${ih}` : null });
        button('fx' + f.id + '>', bx + bw2 - 28, iy - 6, 28, 26, '>', { pitch: 1.4, onClick: () => step(1) });
        iy += 29;
      } else if (f.type === 'select') {
        label(sx, iy + 7, f.label, C.mid);
        const opts = f.options, perRow = opts.some(o => o.length > 8) ? 2 : opts.length, ow = Math.min(110, (sw - 110 - (perRow - 1) * 4) / perRow);
        opts.forEach((o, k) => button('fx' + f.id + o, sx + 110 + (k % perRow) * (ow + 4), iy - 6 + Math.floor(k / perRow) * 28, ow, 26, o, { on: v === o, pitch: 1.3, onClick: () => { S.fx[f.id] = o; queueUpdate(); } }));
        iy += 29 + (Math.ceil(opts.length / perRow) - 1) * 28;
      }
    }
    button('master', sx, iy - 6, 150, 26, 'MASTER STAGE', { on: S.master, pitch: 1.4, onClick: () => { S.master = !S.master; queueUpdate(); } });
    label(sx + 160, iy + 6, 'LOWORBIT DSP POLISH', C.dim, 1.3); iy += 30;
    if (S.budget) {
      const b = S.budget, frac = Math.min(1, b.used / b.limit);
      label(sx, iy, `${b.label}  ${(b.used / 1024).toFixed(1)} / ${(b.limit / 1024).toFixed(0)} KB`, frac > 0.97 ? C.hot : C.mid); iy += 12;
      const n = Math.floor(sw / 5); for (let i = 0; i < n; i++) { g.fillStyle = i / n < frac ? (frac > 0.97 ? C.warn : C.on) : C.off; g.fillRect(sx + i * 5, iy, 3, 6); }
      iy += 10; if (b.actions && b.actions.length) { label(sx, iy, b.actions.slice(0, 2).join('  /  ').slice(0, Math.floor(sw / 8.3)), C.dim, 1.3); iy += 11; }
      if (b.inst) { label(sx, iy, `SAMPLES ${(b.samples / 1024).toFixed(1)} KB  /  ECHO ${(b.echo / 1024).toFixed(0)} KB  /  MUSIC ${(b.seq / 1024).toFixed(1)} KB`.slice(0, Math.floor(sw / 8.3)), C.dim, 1.3); iy += 11; }
      iy += 4;
    }
    const v = song.meta.vector;
    iy = Math.max(iy + 8, y + H - 12 - 14 - 34 - 40 - 40);
    V.dotLine(g, sx, sx + sw, iy - 6, C.off, 4, 1.2);
    label(sx, iy, `RECIPE  ${v.genre} / ${v.mode.toUpperCase()} / LEAD ${v.leadScale.toUpperCase()} / ${v.bank.toUpperCase()}`.slice(0, Math.floor(sw / 8.4)), C.mid, 1.4);
    label(sx, iy + 13, (`KICK E(${v.kickK},16) / BASS ${v.bassStyle.toUpperCase()} / ATMOS ` + chainSummary(S.atmos.SONG)).slice(0, Math.floor(sw / 8.4)), C.dim, 1.4);
    iy += 32;
    const hb = (sw - 6) / 2;
    button('more', sx, iy, hb, 32, 'MORE LIKE THIS', { pitch: 1.4, onClick: moreLikeThis });
    button('toatm', sx + hb + 6, iy, hb, 32, 'ATMOSPHERICS', { pitch: 1.4, on: LO.atmosActive(S.atmos.SONG), onClick: () => { S.atm.source = 'SONG'; go('ATMOSPHERICS'); } });
    iy += 40;
    const acts = [['KEEP', keep], ['EXPORT WAV', exportWav], ['STEMS', exportStems]];
    if (song.meta.loop) acts.push(['GAME LOOP', exportLoop]);
    acts.push(['LIBRARY', () => { go('LIBRARY'); libOpen('MUSIC'); }]);
    const bw = (sw - (acts.length - 1) * 6) / acts.length;
    acts.forEach(([t, fn], i) => button('act' + t, sx + i * (bw + 6), iy, bw, 34, t, { onClick: fn, pitch: 1.35 }));
  }

  // ---------------------------------------------------------------- shared helpers for the v0.3 screens
  function wrapText(s, maxChars) {
    const out = []; let line = '';
    for (const w of String(s).split(' ')) { if ((line + ' ' + w).trim().length > maxChars && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
    if (line) out.push(line); return out;
  }
  function scrollList(id, x, y, w, h, n, rowH, key, holder) {
    const max = Math.max(1, Math.floor(h / rowH));
    holder[key] = LO.clamp(holder[key] || 0, 0, Math.max(0, n - max));
    hit(id, x, y, w, h, null, { passive: true, wheel: d => { holder[key] += d > 0 ? 2 : -2; } });
    if (n > max) { const th = h * max / n, ty = y + (h - th) * holder[key] / Math.max(1, n - max); for (let yy = ty; yy < ty + th; yy += 5) { g.fillStyle = C.mid; g.fillRect(x + w + 4, yy, 2, 3); } }
    return { from: holder[key], to: Math.min(n, holder[key] + max), max };
  }
  function markTooSimilar() {
    const song = S.song; if (!song) return;
    S.mind.marked = song.seed;
    if (S.mind.loved === song.seed) S.mind.loved = null;
    for (let i = S.hist.length - 1; i >= 0; i--) if (S.hist[i].seed === song.seed) { S.hist[i].mark = 'TOO SIMILAR'; S.hist[i].love = false; break; }
    if (host.histMark) host.histMark(song.seed, 'TOO SIMILAR').catch(() => {});
    BB.log('MARK', 'TOO SIMILAR', { seed: song.seed, title: song.title, skeleton: song.meta.skeleton });
    setStatus('MARKED: THE LISTENER WILL STEER AWAY FROM THIS SONG\'S SKELETON');
  }
  // LOVE IT: the opposite of TOO SIMILAR. Loved songs pull the groove of future songs toward your taste.
  function toggleLove() {
    const song = S.song; if (!song) return;
    const on = S.mind.loved !== song.seed;
    S.mind.loved = on ? song.seed : null; if (on && S.mind.marked === song.seed) S.mind.marked = null;
    for (let i = S.hist.length - 1; i >= 0; i--) if (S.hist[i].seed === song.seed) { S.hist[i].love = on; if (on) delete S.hist[i].mark; break; }
    if (host.histLove) host.histLove(song.seed, on).catch(() => {});
    BB.log('MARK', on ? 'LOVE IT' : 'LOVE IT OFF', { seed: song.seed, title: song.title, skeleton: song.meta.skeleton, groove: song.meta.groove ? { sync: song.meta.groove.sync, breath: song.meta.groove.breath, phrases: song.meta.groove.phrases, arcs: song.meta.groove.arcs } : null });
    setStatus(on ? 'LOVED: FUTURE SONGS WILL LEAN TOWARD THIS GROOVE' : 'LOVE REMOVED');
  }
  function nowPlaying(x, y, w) {
    const song = S.song;
    if (!song) { label(x, y + 12, 'NOTHING PLAYING YET', C.dim, 1.4); return; }
    button('npplay', x, y, 96, 36, P.playing ? '\x02 STOP' : '\x01 PLAY', { on: P.playing, pitch: 1.5, onClick: () => { if (P.playing) P.stop(); else P.play(); } });
    const loved = S.mind.loved === song.seed, marked = S.mind.marked === song.seed;
    const loveOpts = { pitch: 1.15, on: loved, onClick: () => toggleLove(), help: 'TELL THE STUDIO MIND YOU LOVE THIS ONE: FUTURE SONGS LEAN TOWARD ITS GROOVE' };
    const tooOpts = { pitch: 1.15, on: marked, onClick: () => markTooSimilar(), help: 'TELL THE LISTENER THIS SOUNDS LIKE ANOTHER SONG: IT WILL STEER AWAY FROM IT' };
    const pos = P.position(), tot = song.total / SR, tx = x + 108;
    if (w < 560) { // narrow panel: title on its own line, the two marks share the second line with the time
      const tw = w - 108;
      V.text(g, song.title, tx, y + 8, V.fitPitch(song.title, tw, 1.6), C.on, { glow: false });
      button('nptoo' + x, x + w - 92, y + 17, 92, 22, marked ? 'MARKED' : 'TOO SIMILAR', tooOpts);
      button('nplove' + x, x + w - 92 - 6 - 70, y + 17, 70, 22, loved ? 'LOVED' : 'LOVE IT', loveOpts);
      label(tx, y + 28, `${fmtTime(pos)} / ${fmtTime(tot)}`.slice(0, Math.max(4, Math.floor((tw - 176) / 8.4))), C.mid, 1.4);
      const n = Math.floor(tw / 5), fr = tot ? pos / tot : 0;
      for (let i = 0; i < n; i++) { g.fillStyle = i / n <= fr ? C.on : C.off; g.fillRect(tx + i * 5, y + 44, 3, 3); }
      return;
    }
    const tw = w - 108 - 96 - 84;
    button('nplove' + x, x + w - 90 - 84, y - 4, 76, 26, loved ? 'LOVED' : 'LOVE IT', loveOpts);
    button('nptoo' + x, x + w - 90, y - 4, 90, 26, marked ? 'MARKED' : 'TOO SIMILAR', tooOpts);
    V.text(g, song.title, tx, y + 10, V.fitPitch(song.title, tw, 1.6), C.on, { glow: false });
    const sub = `${song.chip.id}  /  ${song.meta.genre}  /  ${fmtTime(pos)} OF ${fmtTime(tot)}`;
    label(tx, y + 26, sub.slice(0, Math.floor((w - 108) / 8.4)), C.mid, 1.4);
    const n = Math.floor((w - 108) / 5), fr = tot ? pos / tot : 0;
    for (let i = 0; i < n; i++) { g.fillStyle = i / n <= fr ? C.on : C.off; g.fillRect(tx + i * 5, y + 40, 3, 3); }
  }

  // ---------------------------------------------------------------- style blueprints (state helpers)
  const allBps = () => LO.BLUEPRINTS.concat(S.myBps);
  const bpById = id => allBps().find(b => b.id === id) || null;
  function withEdits(bp) {
    const e = bp && S.sty.edits[bp.id]; if (!e) return bp;
    const o = { ...bp };
    if (e.tempo != null) o.bpm = [e.tempo - 2, e.tempo + 2];
    if (e.jazzy != null) o.jazzy = e.jazzy / 10;
    if (e.swing != null) o.swing = e.swing / 100;
    if (e.busy != null) o.leadDensity = e.busy / 10;
    if (e.pump != null) o.pump = e.pump;
    if (e.chordRate != null) o.chordRate = e.chordRate;
    if (e.length != null) o.length = e.length / 100;
    return o;
  }
  function effBp() {
    const a = withEdits(bpById(S.sty.sel) || LO.BLUEPRINTS[0]);
    const b = S.sty.b ? withEdits(bpById(S.sty.b)) : null;
    return b && b.id !== a.id ? LO.blendBlueprints(a, b, S.sty.t / 100) : a;
  }
  function pickStyle(id) { S.sty.sel = id; S.sty.b = null; S.home.mode = 'STYLE'; BB.log('UI', 'STYLE', id); }
  function generateStyle() {
    const bp = effBp(), e = S.sty.emo, extra = { blueprint: bp, purpose: 'STYLE' };
    if (e.on) { extra.valence = e.v; extra.arousal = e.a; }
    BB.log('STYLE', 'GENERATE', { id: bp.id, name: bp.name, emo: e.on ? [e.v, e.a] : 'AUTO', chip: S.params.chip });
    return generate({ extra });
  }
  function homeGenerate() {
    if (S.home.mode === 'STYLE') return generateStyle();
    S.params.genre = 'AUTO'; return generate();
  }
  function homeSurprise() {
    const r = LO.rng(randSeed());
    if (r.chance(0.6)) {
      const bp = r.pick(allBps()); S.sty.sel = bp.id; S.sty.b = null; S.home.mode = 'STYLE';
      S.params.chip = r.chance(0.5) ? 'LO-1' : r.pick(CHIPS).id;
      S.sty.emo = { on: true, v: r.int(1, 9), a: r.int(1, 9) }; S.lockSeed = false;
      BB.log('UI', 'HOME SURPRISE', { style: bp.id, chip: S.params.chip, emo: S.sty.emo }); generateStyle();
    } else { S.home.mode = 'GAME'; surpriseMe(); }
  }
  async function saveMine() {
    const bp = effBp();
    openPrompt('NAME YOUR STYLE', (bp.layer === 'MINE' ? bp.name : 'MY ' + bp.name).slice(0, 40), async v => {
      if (!v) return;
      const rec = JSON.parse(JSON.stringify({ ...bp, id: 'mine-' + Date.now(), name: v.slice(0, 40), layer: 'MINE', aliases: [v.toLowerCase()], from: bp.name }));
      S.myBps = await host.bpSave(rec); S.sty.sel = rec.id; S.sty.b = null; S.sty.filter = 'MINE'; setStatus('SAVED TO MY STYLES: ' + rec.name);
    });
  }

  // ---------------------------------------------------------------- HOME
  function drawHome(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, ph = H - 12;
    const sw = Math.round(Math.max(360, Math.min(470, W * 0.28))), gap = 16;
    const cx = M + sw + gap, cw = W - M * 2 - sw * 2 - gap * 2, rx = W - M - sw;
    homeMaker(M, y, sw, ph); homeLab(cx, y, cw, ph); homeScenes(rx, y, sw, ph, false);
  }
  function homeMusic(x, y, w, h) {
    panel(x, y, w, h, 'MUSIC', 'MAKE A SONG');
    const ix = x + 14, iw = w - 28; let iy = y + 18;
    label(ix, iy, 'STYLE: TYPE A GENRE OR AN ARTIST', C.dim); iy += 12;
    const list = LO.searchBlueprints(S.text.homeSearch || '', allBps());
    field('homeSearch', ix, iy, iw, 30, { placeholder: 'E.G. TECHNO, UNDERWORLD, LO-FI', onEnter: () => { if (list[0]) pickStyle(list[0].id); } });
    iy += 38;
    const spare = Math.max(0, h - 700), bh = LO.clamp(26 + spare / 14, 26, 36);
    const bottomBlock = 46 + 30 + 44 + 18 + 56 + 46 + 12 + 50 + 40;
    const gameH = 14 + Math.ceil((PURPOSES.length - 1) / 4) * (bh + 5) + 6, chipH = 14 + bh + 12;
    const room = y + h - bottomBlock - gameH - chipH - iy - 16, rows = Math.max(2, Math.floor(room / (bh + 5)));
    if (!list.length) { label(ix, iy + 6, 'NO STYLE BY THAT NAME YET', C.warn, 1.4); iy += 24; }
    const shown = list.slice(0, rows * 2), bw = (iw - 6) / 2;
    shown.forEach((b, i) => button('hs' + b.id, ix + (i % 2) * (bw + 6), iy + Math.floor(i / 2) * (bh + 5), bw, bh, b.name, { on: S.home.mode === 'STYLE' && S.sty.sel === b.id, pitch: 1.3, onClick: () => pickStyle(b.id) }));
    iy += Math.ceil(shown.length / 2) * (bh + 5);
    if (list.length > shown.length) { label(ix, iy, `+ ${list.length - shown.length} MORE IN STYLES`, C.dim, 1.3); }
    iy = Math.max(iy + 8, y + h - bottomBlock - gameH - chipH);
    label(ix, iy, 'GAME MUSIC', C.dim); iy += 12;
    iy += grid('hp', ix, iy, iw, PURPOSES.slice(1), 4, S.home.mode === 'GAME' ? S.params.purpose : null, v => { S.params.purpose = v; S.params.genre = 'AUTO'; S.home.mode = 'GAME'; }, bh, 5, { pitch: 1.3 });
    iy += 6; label(ix, iy, 'CHIP', C.dim); iy += 12;
    iy += grid('hc', ix, iy, iw, CHIPS.map(c => c.id), 4, S.params.chip, v => { S.params.chip = v; }, bh, 6);
    iy = y + h - bottomBlock + 6;
    iy += colorRow(ix, iy, iw) + 4;
    const bp = effBp();
    const cw0 = LO.Imagination.parse(S.text.colorText || ''); const next = (S.home.mode === 'STYLE' ? `NEXT: ${bp.name} ON ${S.params.chip}` : `NEXT: ${S.params.purpose === 'AUTO' ? 'ANY' : S.params.purpose} MUSIC ON ${S.params.chip}`) + (cw0.length ? ' + ' + cw0.join(' + ') : '');
    label(ix, iy, next.slice(0, Math.floor(iw / 8.4)), C.on, 1.4); iy += 14;
    const warn = S.home.mode === 'STYLE' && bp.sweep && S.params.chip !== 'LO-1' ? 'FILTER SWEEPS NEED LO-1, THIS CHIP PLAYS IT STRAIGHT' : (S.home.mode === 'STYLE' && S.sty.emo.on ? 'EMOTION: ' + LO.emotionLabel(S.sty.emo.v, S.sty.emo.a) : '');
    if (warn) label(ix, iy, warn.slice(0, Math.floor(iw / 7.8)), bp.sweep && S.params.chip !== 'LO-1' && S.home.mode === 'STYLE' ? C.warn : C.mid, 1.3);
    iy += 16;
    mindStrip(ix, iy, iw, 32); iy += 40;
    nowPlaying(ix, iy, iw); iy += 56;
    button('hgen', ix, iy, iw * 0.6, 50, S.busy ? 'WORKING...' : 'GENERATE', { big: true, on: S.busy, pitch: 2.2, onClick: homeGenerate });
    button('hsur', ix + iw * 0.6 + 6, iy, iw * 0.4 - 6, 50, 'SURPRISE ME', { big: true, pitch: 1.6, onClick: homeSurprise });
    iy += 56;
    const hb = (iw - 6) / 2;
    button('hstudio', ix, iy, hb, 34, 'OPEN STUDIO', { pitch: 1.4, onClick: () => go('MUSIC') });
    button('hstyles', ix + hb + 6, iy, hb, 34, 'ALL STYLES', { pitch: 1.4, onClick: () => go('STYLES') });
  }
  const LAB_TOOLS = () => [
    ['SOUND FX', ['BUILD GAME SOUNDS FROM MATH', 'TYPE: SIX SHOOTER 1800S CANYON', `${LO.SFX_RECIPES.length} RECIPES ON THE LO-1 CHIP`]],
    ['ATMOSPHERICS', ['THE WORLD THE SOUND PLAYS IN', 'ROOMS, CAVES, RADIOS, TUNNELS', `${Object.keys(LO.ATMOS).length} PLACES AND DEVICES`]],
    ['CRUNCH', ['GIVE ANY SOUND A CHIP FORMAT', 'NES, AMIGA, SNES, SP-1200, MPC', 'ONE FILE OR A WHOLE FOLDER']],
    ['LIBRARY', ['EVERYTHING YOU MADE', 'PLAY, RENAME, MOVE, EXPORT', 'NOTHING DELETED BY SURPRISE']],
  ];
  function homeLab(x, y, w, h) {
    panel(x, y, w, h, 'THE LAB', 'HANDS-ON CRAFTING');
    const ix = x + 16, iw = w - 32; let iy = y + 22;
    const cw = (iw - 12) / 2, ch = LO.clamp(h * 0.19, 118, 170);
    LAB_TOOLS().forEach(([name, lines], i) => {
      const cx = ix + (i % 2) * (cw + 12), cy = iy + Math.floor(i / 2) * (ch + 12), id = 'lab' + name, hov = S.hover === id;
      V.dotBox(g, cx, cy, cw, ch, hov ? C.on : C.mid, 4, hov ? 1.6 : 1.4);
      V.led(g, cx + 18, cy + 20, 3, hov);
      V.text(g, name, cx + 32, cy + 12, V.fitPitch(name, cw - 48, 2.6), hov ? C.hot : C.on);
      const lp = LO.clamp(ch / 110, 1.3, 1.6);
      lines.forEach((l, k) => V.text(g, l, cx + 18, cy + 12 + 7 * 2.6 + 18 + k * (lp * 7 + 9), Math.min(lp, V.fitPitch(l, cw - 36, lp)), k === 0 ? C.on : C.mid, { glow: false }));
      label(cx + cw - 18 - V.textWidth('OPEN >', 1.4), cy + ch - 20, 'OPEN >', hov ? C.on : C.dim, 1.4);
      hit(id, cx, cy, cw, ch, () => go(name));
    });
    iy += ch * 2 + 26;
    const b3 = (iw - 12) / 3;
    button('limp', ix, iy, b3, 40, 'IMPORT SAMPLES...', { pitch: 1.5, onClick: () => openBrowse('files', 'IMPORT AUDIO FILES', async paths => { await importPaths(paths, 'IMPORTED'); refreshRecent(); }) });
    button('lfold', ix + b3 + 6, iy, b3, 40, 'IMPORT A FOLDER...', { pitch: 1.5, onClick: () => openBrowse('folder', 'IMPORT EVERY SOUND IN WHICH FOLDER?', async dir => { const r = await host.fsWalk(dir, true); if (r && r.files) { await importPaths(r.files.map(f => f.abs), 'IMPORTED'); refreshRecent(); } }) });
    button('llib', ix + (b3 + 6) * 2, iy, b3, 40, 'OPEN LIBRARY', { pitch: 1.5, onClick: () => go('LIBRARY') });
    iy += 52;
    label(ix, iy, 'RECENT FILES', C.dim); label(ix + iw - V.textWidth('DRAG FILES ONTO THE WINDOW TO IMPORT', 1.3), iy, 'DRAG FILES ONTO THE WINDOW TO IMPORT', C.dim, 1.3); iy += 14;
    const actH = 40, listH = y + h - 14 - actH - 10 - iy;
    V.dotBox(g, ix, iy, iw, listH, C.off, 4, 1.2);
    const rows = S.home.recent, rh = 22;
    const sl = scrollList('hrec', ix, iy + 6, iw, listH - 12, rows.length, rh, 'rscroll', S.home);
    if (!rows.length) label(ix + 14, iy + 14, 'NOTHING YET. GENERATE A SONG, BUILD A SOUND OR IMPORT SOME SAMPLES.', C.dim, 1.4);
    for (let i = sl.from; i < sl.to; i++) {
      const r = rows[i], yy = iy + 10 + (i - sl.from) * rh, id = 'hr' + i, sel = S.home.rsel === r.rel, hov = S.hover === id;
      if (sel) V.dotBox(g, ix + 4, yy - 5, iw - 8, rh - 2, C.mid, 3, 1);
      V.led(g, ix + 14, yy + 5, 2, P.shotTag === 'home' && S.home.playing === r.rel && P.shotFrac() >= 0);
      const folder = r.rel.split('/').slice(0, -1).join(' / ');
      label(ix + 26, yy, r.name.slice(0, Math.floor((iw - 260) / 9)), sel || hov ? C.on : C.mid, 1.5);
      label(ix + iw - 10 - V.textWidth(folder.slice(0, 28), 1.3), yy + 1, folder.slice(0, 28), C.dim, 1.3);
      hit(id, ix + 4, yy - 5, iw - 8, rh - 2, () => { S.home.rsel = r.rel; S.home.rname = r.name; homePlay(r.rel); });
    }
    iy = y + h - 14 - actH;
    const sel = S.home.rsel, b4 = (iw - 18) / 4, playing = P.shotTag === 'home' && P.shotFrac() >= 0;
    button('hrp', ix, iy, b4, actH, playing ? '\x02 STOP' : '\x01 PLAY', { pitch: 1.5, on: playing, disabled: !sel, onClick: () => { if (playing) P.stopShot(); else homePlay(sel); } });
    button('hra', ix + (b4 + 6), iy, b4, actH, 'ATMOSPHERICS', { pitch: 1.4, disabled: !sel, onClick: () => loadAtmFile(sel, S.home.rname) });
    button('hrc', ix + (b4 + 6) * 2, iy, b4, actH, 'CRUNCH IT', { pitch: 1.4, disabled: !sel, onClick: () => { S.crunch.files = [{ lib: sel, rel: S.home.rname }]; S.crunch.base = 'FROM LIBRARY'; go('CRUNCH'); } });
    button('hre', ix + (b4 + 6) * 3, iy, b4, actH, 'EXPORT...', { pitch: 1.4, disabled: !sel, onClick: () => openBrowse('folder', 'EXPORT TO WHICH FOLDER?', async dir => { const r = await host.libExport(sel, dir); setStatus(r && !r.error ? 'EXPORTED TO ' + dir : 'EXPORT FAILED (LOGGED)'); }) });
  }
  async function homePlay(rel) {
    try { const ab = await host.libRead(rel); if (!ab || ab.error) return; const d = await decode(ab); S.home.playing = rel; P.oneShot(d.L, d.R, 'home'); }
    catch (e) { BB.error('HOME PLAY', e); setStatus('COULD NOT PLAY THAT FILE (LOGGED)'); }
  }
  function refreshRecent() { if (host.libRecent) host.libRecent(40).then(r => { S.home.recent = Array.isArray(r) ? r : []; }).catch(() => {}); }

  // ---------------------------------------------------------------- SCENES
  const sceneByName = n => LO.SCENES.find(s => s.name === n) || LO.SCENES[0];
  // RANDOM SOUND: a shuffle bag of every sound the app can build today, across every scene, so nothing repeats
  // until you've heard them all; each pull also rolls its own size, speed, place and notes (LO.rollSfx)
  function sceneBag() {
    const all = []; for (const sc of LO.SCENES) for (const n of sc.sounds) if (LO.parseSfx(n).what) all.push({ scene: sc.name, name: n });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all;
  }
  async function sceneRandom(goHome) {
    if (S.busy) return;
    const Sc = S.scene;
    if (!Sc.bag || !Sc.bag.length) {
      Sc.bag = sceneBag(); Sc.bagN = Sc.bag.length;
      if (Sc.pick && Sc.bag.length > 1 && Sc.bag[0].name === Sc.pick.name) Sc.bag.push(Sc.bag.shift());
    }
    const pk = Sc.bag.shift(), p = LO.parseSfx(pk.name), seed = randSeed(), ro = LO.rollSfx(p.what, seed);
    Object.assign(S.sfx, { text: pk.name, parsed: p, what: p.what, era: ro.era || p.era, place: ro.place || p.place, weight: ro.weight, count: ro.count || p.count, seed, roll: ro.roll, speed: ro.speed });
    const desc = [ro.weight, ro.era, ro.count > 1 ? ro.count + ' SHOTS' : null, ro.place, ro.speed + 'X SPEED', ro.roll.dir ? ro.roll.dir.toUpperCase() : null].filter(Boolean).join(', ');
    Object.assign(Sc, { pick: pk, sel: pk.scene, last: pk.name, desc, saved: false, rolls: (Sc.rolls || 0) + 1, sscroll: 0 });
    if (goHome) go('SCENES');
    await makeSfx(false);
    S.sfx.roll = null; S.sfx.speed = null;
    BB.log('SCENES', 'RANDOM', { scene: pk.scene, sound: pk.name, recipe: p.what, seed, roll: ro, left: Sc.bag.length });
  }
  async function saveSceneSound() {
    const Sc = S.scene; if (!S.sfx.L) return;
    const fromRoll = Sc.pick && Sc.last === Sc.pick.name;
    const nm = `${fromRoll ? Sc.pick.scene : Sc.sel} - ${fromRoll ? Sc.pick.name : (Sc.last || S.sfx.what)} ${S.sfx.seed}.wav`;
    try { await host.saveFile(nm, LO.encodeWav(S.sfx.L, S.sfx.R, SR), 'SOUND FX'); Sc.saved = true; setStatus('SAVED: LIBRARY / SOUND FX / ' + nm); refreshLib(); BB.log('SCENES', 'SAVE', { file: nm }); }
    catch (e) { BB.error('SCENE SAVE', e); setStatus('SAVE FAILED (LOGGED)'); }
  }
  function trySceneSound(name) {
    const p = LO.parseSfx(name); if (!p.what) return false;
    S.sfx.text = name; applySfxText(); go('SOUND FX'); makeSfx(true); return true;
  }
  function homeScenes(x, y, w, h) {
    panel(x, y, w, h, 'SCENES', `${LO.SCENES.length} PLACES`);
    const ix = x + 14, iw = w - 28; let iy = y + 18;
    label(ix, iy, 'PICK A PLACE. GET EVERY SOUND IT NEEDS.', C.mid, 1.4); iy += 18;
    const gh = Math.floor(h * 0.42), bh = 26, bw = (iw - 6) / 2;
    const rowsTotal = Math.ceil(LO.SCENES.length / 2);
    const sl = scrollList('hscn', ix, iy, iw, gh, rowsTotal, bh + 4, 'hscroll', S.scene);
    for (let r = sl.from; r < sl.to; r++) for (let c = 0; c < 2; c++) {
      const sc = LO.SCENES[r * 2 + c]; if (!sc) continue;
      button('hsc' + sc.name, ix + c * (bw + 6), iy + (r - sl.from) * (bh + 4), bw, bh, sc.name, { on: S.scene.sel === sc.name, pitch: 1.3, onClick: () => { S.scene.sel = sc.name; S.scene.sscroll = 0; } });
    }
    iy += sl.max * (bh + 4) + 10;
    V.dotLine(g, ix, ix + iw, iy, C.off, 4, 1.2); iy += 12;
    const sc = sceneByName(S.scene.sel);
    V.text(g, sc.name, ix, iy, V.fitPitch(sc.name, iw - 120, 2.2), C.on);
    label(ix + iw - V.textWidth(`${sc.sounds.length} SOUNDS`, 1.4), iy + 4, `${sc.sounds.length} SOUNDS`, C.mid, 1.4); iy += 24;
    const listBottom = y + h - 14 - 40 - 30, colW = (iw - 10) / 2, lh = 15;
    const perCol = Math.max(1, Math.floor((listBottom - iy) / lh)), cap = perCol * 2;
    const items = sc.sounds.slice(0, sc.sounds.length > cap ? cap - 1 : cap);
    items.forEach((s, i) => {
      const cx = ix + Math.floor(i / perCol) * (colW + 10), yy = iy + (i % perCol) * lh;
      const ok = !!LO.parseSfx(s).what;
      V.led(g, cx + 3, yy + 4, 1.6, ok);
      label(cx + 10, yy, s.slice(0, Math.floor((colW - 12) / 7.8)), ok ? C.on : C.mid, 1.3);
    });
    if (sc.sounds.length > items.length) label(ix + colW + 10 + 10, iy + (perCol - 1) * lh, `+ ${sc.sounds.length - items.length} MORE`, C.dim, 1.3);
    label(ix, y + h - 14 - 40 - 20, 'LIT = BUILDABLE NOW. FULL PACKS: SOUND LAB, V0.8', C.dim, 1.3);
    const hb = (iw - 6) / 2;
    button('hscgen', ix, y + h - 14 - 40, hb, 40, 'TRY A SOUND', { pitch: 1.4, onClick: () => sceneRandom(true), help: 'PULLS A RANDOM SOUND FROM A SCENE AND ROLLS A NEW VERSION OF IT' });
    button('hscopen', ix + hb + 6, y + h - 14 - 40, hb, 40, 'OPEN SCENES', { pitch: 1.4, onClick: () => go('SCENES') });
  }
  function drawScenes(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, ph = H - 12;
    const lw = Math.round(Math.max(520, W * 0.42)), x = M;
    panel(x, y, lw, ph, 'PICK A PLACE', `${LO.SCENES.length} SCENES`);
    const ix = x + 14, iw = lw - 28; let iy = y + 20;
    const groups = [...new Set(LO.SCENES.map(s => s.group))];
    const rowsN = groups.reduce((n, gname) => n + Math.ceil(LO.SCENES.filter(s => s.group === gname).length / 3), 0);
    const bh = LO.clamp(Math.floor((ph - 30 - groups.length * 16) / rowsN) - 5, 22, 36), bw = (iw - 12) / 3;
    for (const gname of groups) {
      label(ix, iy, gname, C.dim, 1.3); iy += 12;
      const list = LO.SCENES.filter(s => s.group === gname);
      list.forEach((sc, i) => button('sc' + sc.name, ix + (i % 3) * (bw + 6), iy + Math.floor(i / 3) * (bh + 5), bw, bh, sc.name, { on: S.scene.sel === sc.name, pitch: 1.35, onClick: () => { S.scene.sel = sc.name; S.scene.sscroll = 0; } }));
      iy += Math.ceil(list.length / 3) * (bh + 5) + 4;
    }
    const rx = M + lw + 16, rw = W - M - rx, sc = sceneByName(S.scene.sel);
    panel(rx, y, rw, ph, 'THE SOUND LIST', `${sc.group}  /  ${sc.sounds.length} SOUNDS`);
    const sx = rx + 18, sw = rw - 36; let sy = y + 20;
    V.text(g, sc.name, sx, sy, V.fitPitch(sc.name, sw, 3), C.on); sy += 34;
    label(sx, sy, 'EVERY SOUND THIS PLACE NEEDS, BUILT FROM MATH AS ONE PACK.', C.mid, 1.4); sy += 16;
    label(sx, sy, 'LIT SOUNDS CAN BE BUILT RIGHT NOW: CLICK ONE TO BUILD AND HEAR IT RIGHT HERE.', C.mid, 1.4); sy += 22;
    const footH = 110, listH = y + ph - footH - sy;
    const colW = 230, cols = Math.max(1, Math.floor(sw / colW)), lh = 19, perCol = Math.max(1, Math.floor(listH / lh));
    const pageN = cols * perCol, pages = Math.max(1, Math.ceil(sc.sounds.length / pageN));
    S.scene.sscroll = LO.clamp(S.scene.sscroll || 0, 0, pages - 1);
    const from = S.scene.sscroll * pageN;
    sc.sounds.slice(from, from + pageN).forEach((s, i) => {
      const cx = sx + Math.floor(i / perCol) * colW, yy = sy + (i % perCol) * lh, ok = !!LO.parseSfx(s).what, id = 'ss' + (from + i), hov = S.hover === id;
      V.led(g, cx + 4, yy + 5, 2, ok);
      label(cx + 14, yy, String(from + i + 1).padStart(3, '0'), C.dim, 1.3);
      label(cx + 46, yy, s.slice(0, Math.floor((colW - 54) / 8.4)), ok ? (hov ? C.hot : C.on) : C.mid, 1.4);
      if (ok) hit(id, cx, yy - 4, colW - 8, lh - 2, () => { S.sfx.text = s; applySfxText(); S.scene.last = s; S.scene.saved = false; makeSfx(true); }, { help: 'CLICK TO BUILD AND HEAR ' + s + ' RIGHT HERE' });
    });
    hit('sspage', sx, sy, sw, listH, null, { passive: true, wheel: d => { S.scene.sscroll += d > 0 ? 1 : -1; } });
    if (pages > 1) {
      const py = y + ph - footH + 4;
      button('ssprev', sx, py - 8, 90, 30, '< PREV', { pitch: 1.3, disabled: S.scene.sscroll === 0, onClick: () => { S.scene.sscroll--; } });
      label(sx + 104, py + 6, `PAGE ${S.scene.sscroll + 1} OF ${pages}`, C.mid, 1.4);
      button('ssnext', sx + 230, py - 8, 90, 30, 'NEXT >', { pitch: 1.3, disabled: S.scene.sscroll >= pages - 1, onClick: () => { S.scene.sscroll++; } });
    }
    const by = y + ph - 14 - 50;
    { // the last sound built here, so you can see and hear it before anything else
      const usedRows = Math.min(sc.sounds.length - from, pageN), ly = sy + Math.min(perCol, usedRows) * lh + 16, wh = by - 24 - ly;
      if (S.sfx.L && wh > 60) { label(sx, ly, 'LAST BUILT: ' + (S.scene.last || S.sfx.what), C.on, 1.4); wave(S.sfx.L, sx, ly + 16, sw, wh - 16, P.shotTag === 'sfx' ? P.shotFrac() : -1); }
    }
    const bw0 = Math.min(240, sw * 0.28), bx = sx + bw0 + 10, Sc = S.scene, fromRoll = !!(Sc.pick && Sc.last === Sc.pick.name);
    button('scgen', sx, by, bw0, 50, Sc.rolls ? 'NEXT SOUND' : 'RANDOM SOUND', { primary: true, pitch: 1.8, onClick: () => sceneRandom(false), help: 'PULLS A RANDOM SOUND FROM A SCENE, ROLLS A NEW VERSION OF IT AND PLAYS IT' });
    button('scplay', bx, by, 100, 50, '\x01 PLAY', { pitch: 1.5, disabled: !S.sfx.L, onClick: () => P.oneShot(S.sfx.L, S.sfx.R, 'sfx') });
    button('scsave', bx + 106, by, 100, 50, Sc.saved ? 'SAVED' : 'SAVE IT', { pitch: 1.5, on: !!Sc.saved, disabled: !S.sfx.L, onClick: saveSceneSound, help: 'SAVES THIS EXACT SOUND TO LIBRARY / SOUND FX' });
    const nx = bx + 222, nw = sx + sw - nx, ch = n => Math.max(8, Math.floor(nw / n));
    if (fromRoll) {
      label(nx, by + 4, `${Sc.pick.scene}: ${Sc.pick.name}`.slice(0, ch(8.4)), C.hot, 1.4);
      label(nx, by + 20, (Sc.desc || '').slice(0, ch(7.8)), C.on, 1.3);
      label(nx, by + 34, `${Sc.bagN} BUILDABLE TODAY, ${Sc.bag.length} LEFT BEFORE A REPEAT`.slice(0, ch(7.8)), C.mid, 1.3);
    } else {
      label(nx, by + 4, (S.scene.last ? 'LAST BUILT: ' + S.scene.last : 'RANDOM SOUND PULLS FROM EVERY SCENE.').slice(0, ch(8.4)), S.scene.last ? C.hot : C.on, 1.4);
      label(nx, by + 20, 'TRUTH: ONLY THE LIT SOUNDS CAN BE BUILT TODAY.'.slice(0, ch(7.8)), C.mid, 1.3);
      label(nx, by + 34, 'THE REST ARRIVE WITH THE SOUND LAB.'.slice(0, ch(7.8)), C.mid, 1.3);
    }
  }

  // ---------------------------------------------------------------- STYLES
  function drawStyles(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, ph = H - 12, T = S.sty;
    const lw = Math.round(Math.max(330, Math.min(420, W * 0.25))), rw = Math.round(Math.max(360, Math.min(440, W * 0.27)));
    const cx0 = M + lw + 16, cw = W - M * 2 - lw - rw - 32, rx = W - M - rw;
    // ---- list
    const base = allBps().filter(b => T.filter === 'ALL' || (T.filter === 'GENRES' && b.layer === 'GENRE') || (T.filter === 'ARTISTS' && b.layer === 'ARTIST') || (T.filter === 'MINE' && b.layer === 'MINE'));
    const list = LO.searchBlueprints(S.text.stySearch || '', base);
    panel(M, y, lw, ph, 'STYLES', `${list.length} SHOWN`);
    const ix = M + 14, iw = lw - 28; let iy = y + 18;
    field('stySearch', ix, iy, iw, 30, { placeholder: 'SEARCH: GENRE OR ARTIST', onEnter: () => { if (list[0]) { if (T.pickB) { T.b = list[0].id; T.pickB = false; } else T.sel = list[0].id; } } });
    iy += 36;
    const fw = (iw - 18) / 4;
    ['ALL', 'GENRES', 'ARTISTS', 'MINE'].forEach((f, i) => button('sf' + f, ix + i * (fw + 6), iy, fw, 30, f, { on: T.filter === f, pitch: 1.3, onClick: () => { T.filter = f; T.lscroll = 0; } }));
    iy += 40;
    if (T.pickB) { label(ix, iy, 'CLICK A SECOND STYLE TO BLEND WITH', C.hot, 1.3); iy += 14; }
    const rh = 30, listH = y + ph - iy - 48;
    const sl = scrollList('slist', ix, iy, iw, listH, list.length, rh, 'lscroll', T);
    if (!list.length) label(ix + 6, iy + 8, T.filter === 'MINE' ? 'NO STYLES OF YOUR OWN YET: SAVE ONE' : 'NOTHING MATCHES', C.dim, 1.4);
    for (let i = sl.from; i < sl.to; i++) {
      const b = list[i], yy = iy + (i - sl.from) * rh, id = 'sr' + b.id, sel = T.sel === b.id, isB = T.b === b.id, hov = S.hover === id;
      if (sel || isB) V.dotBox(g, ix, yy, iw, rh - 4, sel ? C.on : C.mid, 3, 1.1);
      V.led(g, ix + 12, yy + 13, 2.2, sel);
      const tag = isB ? 'B' : b.layer === 'GENRE' ? '' : b.layer;
      label(ix + 24, yy + 9, b.name.slice(0, Math.floor((iw - 40 - V.textWidth(tag, 1.2)) / 8.4)), sel || hov ? C.on : C.mid, 1.4);
      if (tag) label(ix + iw - 8 - V.textWidth(tag, 1.2), yy + 10, tag, isB ? C.hot : C.dim, 1.2);
      hit(id, ix, yy, iw, rh - 4, () => { if (T.pickB) { if (b.id !== T.sel) T.b = b.id; T.pickB = false; } else { T.sel = b.id; if (T.b === b.id) T.b = null; } BB.log('UI', 'STYLE', b.id); });
    }
    label(ix, y + ph - 36, 'ARTIST NAMES ARE SEARCH WORDS ONLY.', C.dim, 1.2);
    label(ix, y + ph - 22, 'BLUEPRINTS AND SONGS CARRY STYLE NAMES.', C.dim, 1.2);

    // ---- blueprint card
    const A = bpById(T.sel) || LO.BLUEPRINTS[0], Ae = withEdits(A), E = effBp(), edits = T.edits[A.id];
    panel(cx0, y, cw, ph, 'BLUEPRINT', E.layer === 'BLEND' ? 'BLEND' : `${A.layer} LAYER${edits ? '  /  ADJUSTED' : ''}`);
    const bx = cx0 + 18, bw = cw - 36; let by = y + 20;
    V.text(g, E.name, bx, by, V.fitPitch(E.name, bw, 2.8), C.on); by += 30;
    if (A.layer === 'MINE' && A.from) { label(bx, by, 'STARTED FROM ' + A.from, C.dim, 1.3); by += 14; }
    wrapText(E.desc, Math.floor(bw / 8.4)).slice(0, 3).forEach(l => { label(bx, by, l, C.mid, 1.4); by += 14; });
    by += 8;
    const cf = E.conf || {};
    const tag = k => cf[k] || '';
    const facts = [
      ['TEMPO', `${E.bpm[0]}-${E.bpm[1]} BPM`, tag('bpm')],
      ['MODES', E.modes.join(' / ').toUpperCase(), tag('harmony')],
      ['CHORDS', E.chordRate === 1 ? 'CHANGE EVERY BAR' : `CHANGE EVERY ${E.chordRate} BARS`, tag('harmony')],
      ['JAZZ', `${Math.round(E.jazzy * 10)} / 10`, tag('harmony')],
      ['DRUMS', String(E.drums).toUpperCase(), tag('groove')],
      ['SWING', `${Math.round(E.swing * 100)}%`, tag('groove')],
      ['BASS', String(E.bass).toUpperCase(), tag('sound')],
      ['LEAD / PAD', `${String(E.lead).toUpperCase()} / ${String(E.pad).toUpperCase()}`, tag('sound')],
      ['ARP', E.arp ? `${E.arp.pattern.toUpperCase()}, ${E.arp.rate} PER BEAT, ${E.arp.oct} OCT` : 'NONE', tag('sound')],
      ['FORM', E.form === 'evolve' ? 'LONG EVOLVING BUILD' : E.form === 'loop' ? 'GAME LOOP' : 'SONG', tag('form')],
      ['MIX', `PUMP ${E.pump || 0}%${E.echo ? ', DUB DELAY ' + E.echo.time : ''}${E.sp1200 ? ', SAMPLER CRUNCH' : ''}`, ''],
    ];
    const colW2 = bw > 560 ? (bw - 20) / 2 : bw, perCol = colW2 === bw ? facts.length : Math.ceil(facts.length / 2);
    const fh = LO.clamp(Math.floor((ph - 520) / perCol), 17, 24), fp = fh >= 21 ? 1.5 : 1.3, kw = fp * 6 * 11;
    facts.forEach(([k, v, c], i) => {
      const fx = bx + Math.floor(i / perCol) * (colW2 + 20), fy = by + (i % perCol) * fh;
      label(fx, fy, k, C.dim, fp);
      const cw2 = c ? V.textWidth(c, 1.2) + 10 : 0;
      label(fx + kw, fy, v, C.on, Math.min(fp, V.fitPitch(v, colW2 - kw - cw2, fp)));
      if (c) label(fx + colW2 - V.textWidth(c, 1.2), fy + 1, c, c === 'SOLID' ? C.mid : C.warn, 1.2);
    });
    by += perCol * fh + 10;
    if (E.layer === 'BLEND') {
      const Bb2 = bpById(T.b);
      for (const [tg, bpx] of [['A', A], ['B', Bb2]]) { if (!bpx) continue; label(bx, by, `${tg}: ${bpx.name}`, tg === 'A' ? C.on : C.hot, 1.4); by += 16; wrapText(bpx.desc, Math.floor(bw / 8.4)).forEach(l => { label(bx + 20, by, l, C.mid, 1.4); by += 15; }); by += 8; }
      label(bx, by, 'NUMBERS SLIDE WITH THE MIX. CHOICES SWITCH AT THE HALFWAY POINT.', C.dim, 1.3); by += 20;
    }
    if (E.notes && E.notes.length) {
      label(bx, by, 'WHERE THE NUMBERS COME FROM', C.dim, 1.3); by += 16;
      const np = ph > 760 ? 1.4 : 1.2, nl = np * 7 + 6;
      for (const n of E.notes) for (const l of wrapText(n, Math.floor(bw / (np * 6)))) { if (by > y + ph - 250) break; label(bx, by, l, /\(SOLID/.test(n) ? C.mid : C.warn, np); by += nl; }
      by += 6;
    }
    // ---- advanced
    let ay = Math.max(by + 6, y + ph - 14 - 40 - 8 * 20 - 24);
    V.dotLine(g, bx, bx + bw, ay - 8, C.off, 4, 1.2);
    label(bx, ay, `ADVANCED  (ADJUSTS ${A.name})`.slice(0, Math.floor(bw / 8.4)), C.dim, 1.3); ay += 16;
    const setE = (k, v) => { T.edits[A.id] = { ...(T.edits[A.id] || {}), [k]: v }; };
    const sl2 = (id, lab, val, min, max, step, k, fmt) => { slider('adv' + id, bx, ay, bw, lab, val, min, max, step, v => setE(k, v), { labelW: 120, valueW: 70, fmt }); ay += 20; };
    const mid = Math.round((Ae.bpm[0] + Ae.bpm[1]) / 2);
    sl2('t', 'TEMPO', mid, 60, 180, 1, 'tempo', v => v + ' BPM');
    sl2('j', 'JAZZ', Math.round(Ae.jazzy * 10), 0, 10, 1, 'jazzy');
    sl2('s', 'SWING', Math.round(Ae.swing * 100), 0, 8, 1, 'swing', v => v + '%');
    sl2('b', 'LEAD BUSY', Math.round(Ae.leadDensity * 10), 0, 10, 1, 'busy');
    sl2('p', 'PUMP', Ae.pump || 0, 0, 60, 5, 'pump', v => v + '%');
    sl2('c', 'CHORD SPEED', Ae.chordRate, 1, 4, 1, 'chordRate', v => v === 1 ? 'EVERY BAR' : v + ' BARS');
    sl2('l', 'LENGTH', Math.round((Ae.length || 1) * 100), 50, 150, 10, 'length', v => v + '%');
    ay += 6;
    const b3 = (bw - 12) / 3;
    button('sreset', bx, ay, b3, 34, 'RESET', { pitch: 1.4, disabled: !edits, onClick: () => { delete T.edits[A.id]; } });
    button('ssave', bx + b3 + 6, ay, b3, 34, 'SAVE AS MINE', { pitch: 1.4, onClick: saveMine });
    button('sdel', bx + (b3 + 6) * 2, ay, b3, 34, 'FORGET MINE', { pitch: 1.4, warn: A.layer === 'MINE', disabled: A.layer !== 'MINE', onClick: () => openConfirm(`FORGET ${A.name}?`, async () => { S.myBps = await host.bpDelete(A.id); T.sel = LO.BLUEPRINTS[0].id; }) });

    // ---- make it
    panel(rx, y, rw, ph, 'MAKE IT', S.params.chip);
    const mx = rx + 16, mw = rw - 32; let my = y + 20;
    label(mx, my, 'EMOTION', C.dim); label(mx + mw - V.textWidth(T.emo.on ? LO.emotionLabel(T.emo.v, T.emo.a) : 'AUTO', 1.8), my - 2, T.emo.on ? LO.emotionLabel(T.emo.v, T.emo.a) : 'AUTO', T.emo.on ? C.hot : C.mid, 1.8); my += 30;
    const padS = Math.round(LO.clamp(Math.min(mw - 90, ph - 515), 120, 290)), px = mx + 20 + (mw - 40 - padS) / 2, py = my + 4;
    V.dotBox(g, px, py, padS, padS, C.mid, 4, 1.3);
    for (let gx = 1; gx < 10; gx++) for (let gy = 1; gy < 10; gy++) { g.fillStyle = gx === 5 || gy === 5 ? C.dim : C.off; g.fillRect(px + gx * padS / 10 - 1, py + gy * padS / 10 - 1, 2, 2); }
    const vx = px + (T.emo.v / 10) * padS, vy = py + (1 - T.emo.a / 10) * padS;
    if (T.emo.on) { V.dotVLine(g, vx, py + 4, py + padS - 4, C.dim, 4, 1); V.dotLine(g, px + 4, px + padS - 4, vy, C.dim, 4, 1); V.led(g, vx, vy, 5, true, C.hot); }
    else V.text(g, 'CLICK TO SET A FEELING', px + padS / 2, py + padS / 2 - 5, V.fitPitch('CLICK TO SET A FEELING', padS - 20, 1.4), C.dim, { align: 'center', glow: false });
    V.text(g, 'INTENSE', px + padS / 2, py - 12, 1.2, C.dim, { align: 'center', glow: false });
    V.text(g, 'CALM', px + padS / 2, py + padS + 6, 1.2, C.dim, { align: 'center', glow: false });
    V.text(g, 'DARK', px - 8, py + padS / 2 - 4, 1.2, C.dim, { align: 'right', glow: false });
    V.text(g, 'BRIGHT', px + padS + 8, py + padS / 2 - 4, 1.2, C.dim, { glow: false });
    hit('emopad', px, py, padS, padS, null, { drag: (ex, ey) => { if (ey == null) return; T.emo.on = true; T.emo.v = +LO.clamp((ex - px) / padS * 10, 0, 10).toFixed(1); T.emo.a = +LO.clamp((1 - (ey - py) / padS) * 10, 0, 10).toFixed(1); } });
    my = py + padS + 24;
    button('emoauto', mx, my, mw, 28, T.emo.on ? 'BACK TO AUTO (THE STYLE DECIDES)' : 'AUTO: THE STYLE DECIDES', { on: !T.emo.on, pitch: 1.3, onClick: () => { T.emo.on = false; } });
    my += 38;
    label(mx, my, 'CHIP', C.dim); my += 12;
    my += grid('stc', mx, my, mw, CHIPS.map(c => c.id), 4, S.params.chip, v => { S.params.chip = v; }, 30, 6);
    if (E.sweep && S.params.chip !== 'LO-1') { label(mx, my, 'FILTER SWEEPS NEED LO-1', C.warn, 1.3); }
    else label(mx, my, S.params.chip === 'LO-1' ? 'OUR CHIP: SWEEPS, RISERS, DUB ECHO' : 'HARDWARE-TRUE LIMITS', C.dim, 1.3);
    my += 20;
    label(mx, my, 'BLEND', C.dim); my += 12;
    const Bb = T.b ? bpById(T.b) : null;
    if (!Bb) button('sblend', mx, my, mw, 32, T.pickB ? 'NOW CLICK A STYLE IN THE LIST' : 'BLEND WITH A SECOND STYLE...', { on: T.pickB, pitch: 1.3, onClick: () => { T.pickB = !T.pickB; } });
    else {
      label(mx, my + 2, ('B: ' + Bb.name).slice(0, Math.floor((mw - 80) / 8.4)), C.hot, 1.4);
      button('snoblend', mx + mw - 74, my - 8, 74, 26, 'NO BLEND', { pitch: 1.2, onClick: () => { T.b = null; } });
      my += 22;
      slider('sblendt', mx, my, mw, 'MIX', T.t, 0, 100, 5, v => { T.t = v; }, { labelW: 46, valueW: 110, fmt: v => `${100 - v}% A / ${v}% B` });
    }
    my += 40;
    my += colorRow(mx, my, mw) + 8;
    mindStrip(mx, my, mw, 30); my += 38;
    const gh = 54, gy = Math.max(my, y + ph - 14 - gh - 8 - 34 - 56);
    nowPlaying(mx, gy, mw);
    const gy2 = y + ph - 14 - gh - 8 - 34;
    button('sgo', mx, gy2, mw, gh, S.busy ? 'WORKING...' : 'GENERATE', { primary: true, on: S.busy, pitch: 2.4, onClick: generateStyle, help: 'MAKE A SONG FROM THIS BLUEPRINT, FEELING AND CHIP' });
    const hb = (mw - 6) / 2;
    button('smore', mx, gy2 + gh + 8, hb, 34, 'MORE LIKE THIS', { pitch: 1.3, disabled: !S.song || !S.lastExtra, onClick: moreLikeThis });
    button('sstudio', mx + hb + 6, gy2 + gh + 8, hb, 34, 'OPEN IN STUDIO', { pitch: 1.3, disabled: !S.song, onClick: () => go('MUSIC') });
  }

  // ---------------------------------------------------------------- THE STUDIO MIND (every flash is a real logged decision)
  const MODS = LO.MIND_MODULES.map(m => m.id);
  const SHORT = { COMPOSER: 'COMP', EMOTION: 'EMO', IMAGINATION: 'IMAG', 'CHIP KEEPER': 'CHIP', PRODUCTION: 'PROD', LISTENER: 'LIST' };
  function mindReset() {
    const Mi = S.mind; Mi.feed = []; Mi.act = {}; Mi.areaAct = {}; Mi.sparks = []; Mi.shownWork = {}; Mi.score = null; Mi.progress = 0;
    for (const m of MODS) { Mi.act[m] = 0; Mi.shownWork[m] = 0; }
  }
  function mindFeed(e, now) {
    const Mi = S.mind;
    Mi.act[e.mod] = Math.min(1, (Mi.act[e.mod] || 0) + 0.3 + Math.min(0.5, (e.work || 0) / 30));
    if (e.area) Mi.areaAct[e.mod + '|' + e.area] = 1;
    Mi.shownWork[e.mod] = (Mi.shownWork[e.mod] || 0) + (e.work || 0);
    if (e.to && MODS.includes(e.to)) { Mi.sparks.push({ from: e.mod, to: e.to, t0: now, type: e.type }); Mi.act[e.to] = Math.min(1, (Mi.act[e.to] || 0) + 0.2); }
    if (e.type === 'lead' && e.order) Mi.order = e.order;
    if (e.score != null) Mi.score = e.score;
    Mi.feed.unshift(e); if (Mi.feed.length > 80) Mi.feed.length = 80;
  }
  const MIND_DELAY = { lead: 1000, pass: 1100, ask: 750, offer: 750, agree: 650, note: 850, talk: 600, verdict: 1000, done: 700 };
  function startReplay() {
    const Mi = S.mind; if (!Mi.log || !Mi.log.length) return;
    mindReset(); Mi.rp = { on: true, idx: 0, next: performance.now() + 300 }; Mi.live = false;
    BB.log('MIND', 'REPLAY', { events: Mi.log.length });
  }
  function mindTick(now, dt) {
    const Mi = S.mind;
    const k1 = Math.exp(-dt / 0.9), k2 = Math.exp(-dt / 0.55);
    for (const m of MODS) Mi.act[m] = (Mi.act[m] || 0) * k1;
    for (const a in Mi.areaAct) Mi.areaAct[a] *= k2;
    if (Mi.rp && Mi.rp.on) {
      while (Mi.rp.idx < Mi.log.length && now >= Mi.rp.next) {
        const e = Mi.log[Mi.rp.idx++]; mindFeed(e, now);
        Mi.rp.next = now + (MIND_DELAY[e.type] || (170 + Math.min(330, (e.work || 0) * 7)));
      }
      Mi.progress = Mi.rp.idx / Mi.log.length;
      if (Mi.rp.idx >= Mi.log.length && now > Mi.rp.next) Mi.rp.on = false;
    } else if (Mi.live) Mi.progress = Math.min(0.95, Mi.feed.length / 70);
    Mi.sparks = Mi.sparks.filter(s => now - s.t0 < 700);
    // ovals drift toward their place in the current lead order
    for (const m of MODS) { const t = Mi.target && Mi.target[m]; if (!t) continue; const p = Mi.pos[m] || (Mi.pos[m] = { ...t }); p.x += (t.x - p.x) * Math.min(1, dt * 3); p.y += (t.y - p.y) * Math.min(1, dt * 3); p.s += (t.s - p.s) * Math.min(1, dt * 3); }
  }
  const mindState = () => S.mind.live ? 'LIVE' : (S.mind.rp && S.mind.rp.on) ? 'REPLAY' : S.mind.log && S.mind.log.length ? 'DONE' : 'IDLE';
  function actCol(a) { return a > 0.62 ? C.hot : a > 0.18 ? C.on : C.mid; }
  function drawOrganic(cx, cy, rw, rh, a, phase, ring) {
    const per = Math.PI * (3 * (rw + rh) - Math.sqrt((3 * rw + rh) * (rw + 3 * rh)));
    const n = Math.max(24, Math.round(per / (ring ? 9 : 7)));
    g.fillStyle = ring ? C.off : actCol(a);
    const sz = ring ? 1.6 : 2 + a * 1.4;
    for (let i = 0; i < n; i++) {
      const th = 2 * Math.PI * i / n;
      const wob = 1 + 0.05 * Math.sin(3 * th + phase) + 0.035 * Math.sin(5 * th - phase * 1.3) + a * 0.04 * Math.sin(7 * th + phase * 3);
      g.fillRect(cx + rw * wob * Math.cos(th) - sz / 2, cy + rh * wob * Math.sin(th) - sz / 2, sz, sz);
    }
  }
  function drawMindOval(mod, x, y, s, now) {
    const Mi = S.mind, a = Mi.act[mod] || 0, def = LO.MIND_MODULES.find(m => m.id === mod);
    const rw = 92 * s, rh = 60 * s, phase = now / 1400 + MODS.indexOf(mod) * 1.7;
    if (a > 0.35) { g.globalAlpha = 0.35 * a; drawOrganic(x, y, rw * 1.12, rh * 1.14, a, phase + 0.5, false); g.globalAlpha = 1; }
    drawOrganic(x, y, rw * 0.84, rh * 0.82, 0, -phase, true);
    drawOrganic(x, y, rw, rh, a, phase, false);
    def.areas.forEach((ar, i) => {
      const th = -Math.PI * 0.85 + i * (Math.PI * 1.7 / Math.max(1, def.areas.length - 1));
      const ax = x + Math.cos(th) * rw * 0.52, ay = y + Math.sin(th) * rh * 0.42 - 4 * s;
      const aa = Mi.areaAct[mod + '|' + ar] || 0;
      g.fillStyle = aa > 0.55 ? C.hot : aa > 0.12 ? C.on : C.dim;
      const d = 4.2 * s, z = 2 + aa * 1.5;
      for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [d / 2, d * 0.86], [-d / 2, d * 0.86], [d / 2, -d * 0.86], [-d / 2, -d * 0.86]]) g.fillRect(ax + ox - z / 2, ay + oy - z / 2, z, z);
      if (s >= 0.95) V.text(g, ar, ax, ay + d * 1.4 + 2, 1.05, aa > 0.12 ? C.on : C.dim, { align: 'center', glow: false });
    });
    V.text(g, mod, x, y + rh + 12, V.fitPitch(mod, rw * 2, 1.6 * Math.min(1.1, s)), actCol(a), { align: 'center', glow: a > 0.3 });
    const wk = `WORK ${Math.round(Mi.shownWork[mod] || 0)}`;
    V.text(g, wk, x, y + rh + 12 + 15 * Math.min(1.1, s), 1.2, C.dim, { align: 'center', glow: false });
  }
  // the six minds around the song: drawn on the Studio Mind tab, and live in the center of Make Music
  function drawMindCanvas(cx0, y, cw, ph, now) {
    const Mi = S.mind;
    panel(cx0, y, cw, ph, 'THE STUDIO MIND', mindState() === 'LIVE' ? 'LIVE: REAL SPEED' : mindState() === 'REPLAY' ? 'REPLAY AT HUMAN SPEED' : '');
    const ccx = cx0 + cw / 2, ccy = y + ph * 0.47, RX = cw * 0.34, RY = ph * 0.31;
    const s0 = LO.clamp(Math.min(cw / 640, ph / 640), 0.62, 1.15);
    Mi.target = {};
    (Mi.order || MODS).forEach((m, k) => { const th = -Math.PI / 2 + k * 2 * Math.PI / 6; Mi.target[m] = { x: ccx + Math.cos(th) * RX, y: ccy + Math.sin(th) * RY, s: s0 * (k === 0 ? 1.12 : 1) }; });
    for (const sp of Mi.sparks) {
      const a = Mi.pos[sp.from], b = Mi.pos[sp.to]; if (!a || !b) continue;
      const p = LO.clamp((now - sp.t0) / 650, 0, 1), mx = (a.x + b.x) / 2 + (ccx - (a.x + b.x) / 2) * 0.35, my = (a.y + b.y) / 2 + (ccy - (a.y + b.y) / 2) * 0.35;
      for (let k = 0; k < 7; k++) {
        const q = LO.clamp(p - k * 0.035, 0, 1); const u = 1 - q;
        const px = u * u * a.x + 2 * u * q * mx + q * q * b.x, py = u * u * a.y + 2 * u * q * my + q * q * b.y;
        g.fillStyle = sp.type === 'agree' ? C.hot : sp.type === 'note' ? C.warn : C.on; const z = 3.4 - k * 0.4; g.fillRect(px - z / 2, py - z / 2, z, z);
      }
    }
    for (const m of MODS) { const p = Mi.pos[m]; if (p) drawMindOval(m, p.x, p.y, p.s, now); }
    // the song taking shape in the middle
    const secs = S.song && !Mi.live ? S.song.sections : null, sw = Math.min(RX * 1.1, 300), sx = ccx - sw / 2;
    V.text(g, Mi.live ? 'BUILDING...' : S.song ? S.song.title : 'THE SONG', ccx, ccy - 22, V.fitPitch(S.song && !Mi.live ? S.song.title : 'THE SONG', sw, 1.8), C.on, { align: 'center' });
    if (secs) {
      const tot = secs.reduce((a, s) => a + s.bars, 0); let xx = sx; const upto = Mi.progress * tot;
      let acc = 0;
      for (const s of secs) { const wpx = sw * s.bars / tot; const fill = LO.clamp((upto - acc) / s.bars, 0, 1); V.dotBox(g, xx + 1, ccy - 4, wpx - 2, 20, fill >= 1 ? C.on : fill > 0 ? C.mid : C.off, 3, 1.1); if (fill > 0) { g.fillStyle = C.on; g.globalAlpha = 0.25; g.fillRect(xx + 3, ccy - 2, (wpx - 6) * fill, 16); g.globalAlpha = 1; } xx += wpx; acc += s.bars; }
      label(ccx - V.textWidth(`${Math.round(Mi.progress * 100)}% REVIEWED`, 1.2) / 2, ccy + 24, `${Math.round(Mi.progress * 100)}% ${Mi.progress >= 1 ? 'DONE' : 'THROUGH THE WORK'}`, C.dim, 1.2);
    } else { const n = 24; for (let i = 0; i < n; i++) { g.fillStyle = i / n < Mi.progress ? C.on : C.off; g.fillRect(sx + i * sw / n, ccy + 4, sw / n - 3, 4); } }
    if (!Mi.log || !Mi.log.length) if (!Mi.live) V.text(g, 'GENERATE A SONG AND WATCH THE TEAM WORK', ccx, y + ph - 30, 1.4, C.dim, { align: 'center', glow: false });
  }
  function drawMind(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, ph = H - 12, Mi = S.mind, now = performance.now();
    const lw = Math.round(Math.max(300, Math.min(380, W * 0.22))), rw = Math.round(Math.max(340, Math.min(440, W * 0.26)));
    const cx0 = M + lw + 16, cw = W - M * 2 - lw - rw - 32, rx = W - M - rw;
    // ---- left: the job and the report card
    panel(M, y, lw, ph, 'THE JOB', mindState());
    const ix = M + 14, iw = lw - 28; let iy = y + 18;
    label(ix, iy, (Mi.job || 'NOTHING MADE YET').slice(0, Math.floor(iw / 8.4)), C.on, 1.4); iy += 18;
    label(ix, iy, 'WHO LEADS, IN ORDER', C.dim, 1.2); iy += 14;
    (Mi.order || MODS).forEach((m, i) => {
      const a = Mi.act[m] || 0; V.led(g, ix + 6, iy + 5, 2.2, a > 0.2);
      label(ix + 16, iy, `${i + 1}. ${m}`, i === 0 ? C.hot : actCol(a), 1.4);
      label(ix + iw - V.textWidth(String(Math.round(Mi.shownWork[m] || 0)), 1.3), iy + 1, String(Math.round(Mi.shownWork[m] || 0)), C.dim, 1.3); iy += 17;
    });
    iy += 8; V.dotLine(g, ix, ix + iw, iy, C.off, 4, 1.2); iy += 10;
    const rv = Mi.review;
    label(ix, iy, 'LISTENER SCORE', C.dim, 1.2); iy += 16;
    const sc = Mi.score != null ? String(Mi.score) : (rv && Mi.progress >= 1 ? String(rv.score) : '--');
    V.text(g, sc, ix, iy, 4, Mi.score != null ? C.hot : C.dim); label(ix + V.textWidth(sc, 4) + 10, iy + 16, '/ 100', C.mid, 1.4); iy += 38;
    if (rv && rv.notes && rv.notes.length && !(Mi.rp && Mi.rp.on)) for (const nt of rv.notes.slice(0, 3)) for (const l of wrapText(`> ${nt.owner}: ${nt.text}`, Math.floor(iw / 7.2)).slice(0, 2)) { label(ix, iy, l, C.warn, 1.2); iy += 12; }
    iy += 6;
    const em = Mi.emotion;
    if (em) { label(ix, iy, 'FEELING', C.dim, 1.2); iy += 12; label(ix, iy, `${em.label}  /  ${em.arc}`.slice(0, Math.floor(iw / 8.4)), C.on, 1.4); iy += 15; for (const l of wrapText((em.moments || []).join(', '), Math.floor(iw / 7.2)).slice(0, 2)) { label(ix, iy, l, C.mid, 1.2); iy += 12; } iy += 6; }
    if (Mi.colors && Mi.colors.length) { label(ix, iy, 'COLORS', C.dim, 1.2); iy += 12; label(ix, iy, Mi.colors.join(' + ').slice(0, Math.floor(iw / 8.4)), C.hot, 1.4); iy += 20; }
    const pr = Mi.prod;
    if (pr && pr.on) { label(ix, iy, 'PRODUCTION', C.dim, 1.2); iy += 12; label(ix, iy, `${pr.lufs} LUFS  /  PEAK ${pr.peakDb} DB`, C.on, 1.3); iy += 13; label(ix, iy, `LIMITER ${pr.limitDb} DB  /  BASS MONO <120 HZ`, C.mid, 1.2); iy += 16; }
    const by = y + ph - 14 - 40;
    // what the Listener actually heard: loudness of every bar, revealed as the review plays
    if (rv && rv.bars && rv.bars.length && by - iy > 90) {
      iy += 4; label(ix, iy, 'WHAT THE LISTENER HEARD, BAR BY BAR', C.dim, 1.2); iy += 14;
      const gh = Math.min(140, by - 16 - iy), n = rv.bars.length, bw = iw / n, shown = Math.ceil(n * (Mi.progress >= 1 ? 1 : Math.max(0, (Mi.progress - 0.7) / 0.3)));
      V.dotBox(g, ix, iy, iw, gh, C.off, 4, 1);
      const a2 = S.song && S.song.sections.find(x => x.name === 'A2');
      for (let i = 0; i < shown; i++) {
        const hh = LO.clamp((rv.bars[i] + 24) / 24, 0.03, 1) * (gh - 10), x0 = ix + i * bw;
        g.fillStyle = a2 && i === a2.start ? C.hot : C.on;
        for (let yy = 0; yy < hh; yy += 4) g.fillRect(x0 + bw * 0.2, iy + gh - 5 - yy, Math.max(1.5, bw * 0.6), 2);
      }
      if (a2 && shown > a2.start) label(ix + a2.start * bw - 4, iy + 3, 'DROP', C.hot, 1.1);
    }
    const hb = (iw - 6) / 2;
    button('mwatch', ix, by, hb, 40, 'WATCH IT THINK', { pitch: 1.35, on: !!(Mi.rp && Mi.rp.on), disabled: !Mi.log || !Mi.log.length, onClick: startReplay });
    button('mskip', ix + hb + 6, by, hb, 40, Mi.rp && Mi.rp.on ? 'SKIP TO END' : 'MAKE ANOTHER', { pitch: 1.35, onClick: () => { if (Mi.rp && Mi.rp.on) { while (Mi.rp.idx < Mi.log.length) mindFeed(Mi.log[Mi.rp.idx++], performance.now() - 2000); Mi.rp.on = false; Mi.progress = 1; } else generate({ extra: S.lastExtra ? { ...S.lastExtra } : {} }); } });
    drawMindCanvas(cx0, y, cw, ph, now);
    // ---- right: studio notes, newest first
    panel(rx, y, rw, ph, 'STUDIO NOTES', `${Mi.feed.length ? (Mi.rp && Mi.rp.on ? Mi.rp.idx : Mi.feed.length) : 0} EVENTS`);
    const fx = rx + 14, fw = rw - 28; let fy = y + 18; const maxC = Math.floor((fw - 10) / 7.2);
    for (const e of Mi.feed) {
      if (fy > y + ph - 26) break;
      const tag = e.type === 'ask' || e.type === 'talk' ? `${e.mod} > ${e.to}` : e.type === 'offer' ? `${e.mod} > ${e.to}` : e.type === 'note' ? `${e.mod} NOTE > ${e.to}` : e.type === 'agree' ? `${e.mod} + ${e.to}` : e.mod;
      const col = e.type === 'agree' ? C.hot : e.type === 'note' ? C.warn : e.type === 'lead' || e.type === 'verdict' || e.type === 'done' || e.type === 'pass' ? C.on : C.mid;
      label(fx, fy, tag, C.dim, 1.15); fy += 12;
      for (const l of wrapText(e.msg, maxC).slice(0, 3)) { label(fx + 8, fy, l, col, 1.2); fy += 12; }
      fy += 5;
    }
    if (!Mi.feed.length) label(fx, fy, 'EVERY LINE HERE IS A REAL DECISION THE ENGINE MADE.', C.dim, 1.2);
  }
  // six tiny minds anywhere on screen, click to open the full view
  function mindStrip(x, y, w, h) {
    const Mi = S.mind, n = MODS.length, cw = w / n;
    MODS.forEach((m, i) => {
      const a = Mi.act[m] || 0, cx = x + cw * i + cw / 2, r = Math.min(h * 0.3, cw * 0.22);
      g.fillStyle = actCol(a);
      for (let k = 0; k < 14; k++) { const th = 2 * Math.PI * k / 14, wob = 1 + 0.12 * Math.sin(3 * th + performance.now() / 700 + i); g.fillRect(cx + Math.cos(th) * r * 1.3 * wob - 1, y + r + 2 + Math.sin(th) * r * wob - 1, 2 + a, 2 + a); }
      V.text(g, SHORT[m], cx, y + r * 2 + 8, 1.1, a > 0.18 ? C.on : C.dim, { align: 'center', glow: false });
    });
    hit('mstrip' + x, x, y, w, h, () => go('MIND'));
  }
  function colorRow(x, y, w) {
    label(x, y, 'COLOR WORDS (OPTIONAL)', C.dim, 1.2);
    const cols = LO.Imagination.parse(S.text.colorText || '');
    if (cols.length) label(x + w - V.textWidth(cols.join(' + '), 1.2), y, cols.join(' + '), C.hot, 1.2);
    field('colorText', x, y + 12, w - 76, 28, { placeholder: 'FAIRY DUST, DEEP SPACE, RAIN...' });
    button('croll', x + w - 70, y + 3, 70, 37, 'ROLL', { pitch: 1.3, onClick: () => { const r = LO.rng(randSeed()), a = r.pick(LO.COLORS), b = r.chance(0.4) ? r.pick(LO.COLORS) : null; S.text.colorText = (a.name + (b && b !== a ? ' ' + b.name : '')).toUpperCase(); } });
    return 46;
  }

  // ---------------------------------------------------------------- MAKE MUSIC: 1 pick a chip, 2 pick a style, 3 generate
  const CHIP_INFO = {
    NES: ['1983', '8-BIT', '2 PULSES, TRIANGLE, NOISE, DPCM'], AMIGA: ['1985', '16-BIT', '4 SAMPLE CHANNELS, 8-BIT'],
    SNES: ['1990', '16-BIT', '8 SAMPLE VOICES + REAL ECHO'], GENESIS: ['1988', '16-BIT', '6 FM VOICES + PSG + DRUM DAC'],
    'NEO GEO': ['1990', 'APEX', 'FM + 4-BIT ADPCM DRUMS + STRINGS'], 'ROLAND LA': ['1987', '16-BIT', 'SAMPLED ATTACKS + SYNTH SUSTAINS'],
    'LO-1': ['1991', 'OURS', '12 VOICES, FILTERS, ECHO, PUMP'],
  };
  const CHIP_ORDER = ['NES', 'SNES', 'GENESIS', 'NEO GEO', 'AMIGA', 'ROLAND LA', 'LO-1'];
  const CHIP_STYLES = {
    NES: ['bp:heroOverworld', 'bp:gothicCastle', 'bp:robotRock', 'bp:skyKingdom', 'bp:puzzleBounce', 'bp:townWaltz', 'bp:spaceShooter', 'bp:enchantedSpring'],
    SNES: ['bp:overworldJourney', 'bp:townMorning', 'bp:sorrowfulTheme', 'bp:finalBattle', 'bp:ancientCastle', 'bp:nightField', 'bp:airship', 'bp:mode7Racer', 'p:TITLE', 'p:CUTSCENE', 'p:DUNGEON', 'p:CREDITS'],
    GENESIS: ['bp:robotRock', 'bp:spaceShooter', 'bp:gothicCastle', 'bp:techno', 'bp:electro', 'bp:breakbeat', 'bp:dnb', 'bp:synthwave', 'bp:acid', 'p:BOSS'],
    'NEO GEO': ['bp:spaceShooter', 'bp:robotRock', 'p:BATTLE', 'p:BOSS', 'bp:trance', 'bp:dnb', 'bp:breakbeat', 'bp:heroOverworld', 'p:VICTORY'],
    'ROLAND LA': ['bp:synthpop80', 'bp:downtempo', 'bp:ambient', 'bp:drone', 'bp:triphop', 'bp:deephouse', 'bp:hypnoprog96', 'p:CUTSCENE', 'p:CREDITS', 'bp:townWaltz'],
    AMIGA: ['bp:lofi', 'bp:triphop', 'bp:breakbeat', 'bp:techno', 'bp:downtempo', 'bp:nudisco', 'bp:acid', 'p:TITLE', 'bp:hypnoprog96'],
    'LO-1': ['bp:downtempo', 'bp:techno', 'bp:trance', 'bp:synthwave', 'bp:deephouse', 'bp:ambient', 'bp:drone', 'bp:dnb', 'bp:idm', 'bp:synthpop80', 'bp:hypnoprog96', 'bp:lofi'],
  };
  const PURPOSE_DESC = {
    TITLE: 'THE TITLE SCREEN: BIG, PROUD AND MEMORABLE', OVERWORLD: 'THE MAIN ADVENTURE THEME, BRIGHT AND ON THE MOVE', TOWN: 'CALM, SAFE AND A LITTLE CHEERFUL',
    DUNGEON: 'DARK HALLS, SLOW AND UNEASY', BATTLE: 'FIGHT MUSIC: FAST AND DRIVING', BOSS: 'THE BIG FIGHT: HEAVY, TENSE, RELENTLESS', CHASE: 'RUN! URGENT AND BREATHLESS',
    STEALTH: 'QUIET, SNEAKY, HOLDING ITS BREATH', CUTSCENE: 'A STORY MOMENT: EMOTIONAL AND CINEMATIC', VICTORY: 'A SHORT WINNING FANFARE', 'GAME OVER': 'A SHORT SAD ENDING STING',
    MENU: 'A RELAXED LOOP FOR MENUS', CREDITS: 'THE ENDING: WARM AND LOOKING BACK',
  };
  const styleOf = key => {
    const [k, id] = key.split(':');
    if (k === 'bp') { const b = bpById(id); return b ? { key, name: b.name, desc: b.desc, tag: b.meter === '3/4' ? '3/4 WALTZ' : b.meter === 'shuffle' ? 'SHUFFLE' : b.layer === 'ARTIST' ? 'ARTIST STYLE' : b.layer === 'MINE' ? 'MINE' : b.era === 'SNES' ? 'SNES RPG' : b.era ? 'GAME STYLE' : 'ELECTRONICA' } : null; }
    return { key, name: id + ' MUSIC', desc: PURPOSE_DESC[id] || 'GAME MUSIC', tag: 'GAME MUSIC' };
  };
  function allStyleKeys() { return LO.BLUEPRINTS.concat(S.myBps).map(b => 'bp:' + b.id).concat(PURPOSES.slice(1).map(p => 'p:' + p)); }
  function mkSetChip(c) { S.mk.chip = c; S.params.chip = c; const l = CHIP_STYLES[c] || []; if (!l.includes(S.mk.pick) && !S.mk.all) S.mk.pick = l[0]; S.mk.scroll = 0; BB.log('UI', 'CHIP', c); }
  function makeGenerate() {
    const key = S.mk.pick || (CHIP_STYLES[S.mk.chip] || [])[0]; if (!key) return;
    S.params.chip = S.mk.chip;
    const [k, id] = key.split(':');
    BB.log('MAKE', 'GENERATE', { chip: S.mk.chip, style: key, color: S.text.colorText || '' });
    if (k === 'bp') {
      const bp = withEdits(bpById(id)); S.sty.sel = id; S.home.mode = 'STYLE';
      const extra = { blueprint: bp, purpose: 'STYLE' }; if (S.sty.emo.on) { extra.valence = S.sty.emo.v; extra.arousal = S.sty.emo.a; }
      return generate({ extra });
    }
    S.params.purpose = id; S.params.genre = 'AUTO'; S.home.mode = 'GAME';
    const extra = {}; if (S.sty.emo.on) { extra.valence = S.sty.emo.v; extra.arousal = S.sty.emo.a; }
    return generate({ extra });
  }
  function makeSurprise() {
    const r = LO.rng(randSeed());
    const chip = r.pick(CHIP_ORDER); mkSetChip(chip);
    S.mk.pick = r.pick(CHIP_STYLES[chip]);
    S.text.colorText = r.chance(0.45) ? r.pick(LO.COLORS).name : '';
    S.sty.emo = r.chance(0.4) ? { on: true, v: r.int(1, 9), a: r.int(1, 9) } : { on: false, v: 5, a: 5 };
    S.lockSeed = false; BB.log('MAKE', 'SURPRISE', { chip, style: S.mk.pick, color: S.text.colorText, emo: S.sty.emo });
    makeGenerate();
  }
  const mindBusy = () => S.mind.live || (S.mind.rp && S.mind.rp.on);
  function drawMake(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, ph = H - 12;
    const lw = Math.round(Math.max(300, Math.min(360, W * 0.22))), rw = Math.round(Math.max(340, Math.min(420, W * 0.26)));
    const cx0 = M + lw + 16, cw = W - M * 2 - lw - rw - 32, rx = W - M - rw;
    // ---- 1: the chip
    panel(M, y, lw, ph, '1  PICK A CHIP', '');
    const ix = M + 12, iw = lw - 24; let iy = y + 16;
    const chH = Math.min(96, (ph - 30) / CHIP_ORDER.length - 6);
    CHIP_ORDER.forEach(c => {
      const sel = S.mk.chip === c, id = 'mkc' + c, hov = S.hover === id, inf = CHIP_INFO[c];
      if (sel) { g.fillStyle = C.on; g.globalAlpha = 0.14; g.fillRect(ix, iy, iw, chH); g.globalAlpha = 1; }
      V.dotBox(g, ix, iy, iw, chH, sel ? C.on : hov ? C.mid : C.dim, 3, sel ? 1.5 : 1.2);
      V.led(g, ix + 14, iy + 14, 3, sel);
      V.text(g, c, ix + 28, iy + 8, V.fitPitch(c, iw - 120, 2.2), sel ? C.hot : hov ? C.on : C.mid, { glow: sel });
      label(ix + iw - 10 - V.textWidth(`${inf[1]}  ${inf[0]}`, 1.3), iy + 11, `${inf[1]}  ${inf[0]}`, sel ? C.on : C.dim, 1.3);
      if (chH > 44) label(ix + 28, iy + chH - 20, inf[2].slice(0, Math.floor((iw - 36) / 8)), sel ? C.on : C.mid, 1.3);
      if (chH > 70) { const fam = (CHIP_STYLES[c] || []).slice(0, 3).map(k => (styleOf(k) || {}).name).filter(Boolean).join(', '); wrapText('FAMOUS FOR: ' + fam, Math.floor((iw - 36) / 7.6)).slice(0, 2).forEach((l, k) => label(ix + 28, iy + 32 + k * 12, l, sel ? C.mid : C.dim, 1.3)); }
      hit(id, ix, iy, iw, chH, () => mkSetChip(c), { help: `${c}: ${inf[2]} (${inf[0]})` });
      iy += chH + 6;
    });
    // ---- 2: the style (or the team at work while a song is being made)
    if (mindBusy() && !S.mk.peek) {
      drawMindCanvas(cx0, y, cw, ph, performance.now());
      button('mkpeek', cx0 + cw - 170, y + ph - 46, 156, 34, 'SHOW STYLES', { pitch: 1.3, onClick: () => { S.mk.peek = true; } });
    } else {
      const list = S.mk.all ? allStyleKeys() : (CHIP_STYLES[S.mk.chip] || []);
      panel(cx0, y, cw, ph, S.mk.all ? '2  PICK A STYLE: EVERY STYLE' : `2  PICK A STYLE: FAMOUS ON ${S.mk.chip}`, `${list.length} STYLES`);
      const sx = cx0 + 14, sw = cw - 28; let sy = y + 18;
      const cols = sw > 760 ? 3 : 2, cardW = (sw - (cols - 1) * 10) / cols, area = ph - 18 - 56;
      const cardH = LO.clamp(Math.floor(area / Math.max(1, Math.ceil(list.length / cols))) - 10, 74, 118), rows = Math.max(1, Math.floor(area / (cardH + 10)));
      const per = rows * cols, pages = Math.max(1, Math.ceil(list.length / per));
      S.mk.scroll = LO.clamp(S.mk.scroll || 0, 0, pages - 1);
      list.slice(S.mk.scroll * per, S.mk.scroll * per + per).forEach((key, i) => {
        const st = styleOf(key); if (!st) return;
        const cx = sx + (i % cols) * (cardW + 10), cy = sy + Math.floor(i / cols) * (cardH + 10), id = 'mks' + key, sel = S.mk.pick === key, hov = S.hover === id;
        if (sel) { g.fillStyle = C.on; g.globalAlpha = 0.14; g.fillRect(cx, cy, cardW, cardH); g.globalAlpha = 1; }
        V.dotBox(g, cx, cy, cardW, cardH, sel ? C.on : hov ? C.mid : C.dim, 3, sel ? 1.5 : 1.2);
        V.led(g, cx + 12, cy + 13, 2.6, sel);
        V.text(g, st.name, cx + 24, cy + 8, V.fitPitch(st.name, cardW - 40 - V.textWidth(st.tag, 1.2), 1.8), sel ? C.hot : hov ? C.on : C.mid, { glow: sel });
        label(cx + cardW - 10 - V.textWidth(st.tag, 1.2), cy + 10, st.tag, sel ? C.on : C.dim, 1.2);
        const dp = cardH >= 100 ? 1.45 : 1.3;
        wrapText(st.desc, Math.floor((cardW - 30) / (dp * 6))).slice(0, cardH >= 100 ? 5 : 3).forEach((l, k) => label(cx + 14, cy + 32 + k * (dp * 7 + 6), l, sel ? C.on : C.mid, dp));
        hit(id, cx, cy, cardW, cardH, () => { S.mk.pick = key; BB.log('UI', 'MAKE STYLE', key); }, { help: st.desc });
      });
      hit('mkscroll', sx, sy, sw, area, null, { passive: true, wheel: d => { S.mk.scroll += d > 0 ? 1 : -1; } });
      const by = y + ph - 46;
      button('mkall', sx, by, 230, 34, S.mk.all ? `ONLY ${S.mk.chip} FAVORITES` : 'SHOW EVERY STYLE', { pitch: 1.3, on: S.mk.all, onClick: () => { S.mk.all = !S.mk.all; S.mk.scroll = 0; }, help: 'EVERY STYLE WORKS ON EVERY CHIP. THE FAVORITES ARE WHAT EACH CHIP WAS FAMOUS FOR.' });
      if (pages > 1) {
        button('mkprev', sx + 240, by, 90, 34, '< PREV', { pitch: 1.3, disabled: S.mk.scroll === 0, onClick: () => { S.mk.scroll--; } });
        label(sx + 342, by + 16, `PAGE ${S.mk.scroll + 1} / ${pages}`, C.mid, 1.3);
        button('mknext', sx + 450, by, 90, 34, 'NEXT >', { pitch: 1.3, disabled: S.mk.scroll >= pages - 1, onClick: () => { S.mk.scroll++; } });
      }
      if (S.mk.peek && mindBusy()) button('mkback', cx0 + cw - 190, by, 176, 34, 'WATCH THE TEAM', { pitch: 1.3, on: true, onClick: () => { S.mk.peek = false; } });
    }
    // ---- 3: make it
    panel(rx, y, rw, ph, '3  MAKE IT', S.mk.chip);
    const mx = rx + 14, mw = rw - 28; let my = y + 18;
    const st = styleOf(S.mk.pick || '') || { name: 'PICK A STYLE' };
    label(mx, my, 'NEXT SONG', C.dim); my += 14;
    V.text(g, st.name, mx, my, V.fitPitch(st.name, mw, 2), C.on); my += 22;
    const cols0 = LO.Imagination.parse(S.text.colorText || '');
    label(mx, my, (`ON ${S.mk.chip}` + (cols0.length ? '  +  ' + cols0.join(' + ') : '') + (S.sty.emo.on ? '  +  ' + LO.emotionLabel(S.sty.emo.v, S.sty.emo.a) : '')).slice(0, Math.floor(mw / 8.2)), C.mid, 1.35); my += 22;
    button('mkgen', mx, my, mw, 64, S.busy ? 'MAKING IT...' : 'GENERATE', { primary: true, on: S.busy, pitch: 2.6, onClick: makeGenerate, help: 'MAKE A BRAND-NEW SONG: CHIP + STYLE, PLUS ANY EXTRAS' });
    my += 72;
    const hb = (mw - 8) / 2;
    button('mksur', mx, my, hb, 38, 'SURPRISE ME', { pitch: 1.5, onClick: makeSurprise, help: 'ROLLS A CHIP, A STYLE AND MAYBE A COLOR, THEN GENERATES' });
    button('mkext', mx + hb + 8, my, hb, 38, S.mk.extras ? '- EXTRAS' : '+ EXTRAS', { pitch: 1.5, on: S.mk.extras || S.sty.emo.on || cols0.length > 0, onClick: () => { S.mk.extras = !S.mk.extras; }, help: 'OPTIONAL: SET A FEELING OR ADD COLOR WORDS' });
    my += 50;
    if (S.mk.extras) {
      label(mx, my, 'FEELING', C.dim); label(mx + mw - V.textWidth(S.sty.emo.on ? LO.emotionLabel(S.sty.emo.v, S.sty.emo.a) : 'AUTO', 1.5), my - 1, S.sty.emo.on ? LO.emotionLabel(S.sty.emo.v, S.sty.emo.a) : 'AUTO', S.sty.emo.on ? C.hot : C.mid, 1.5); my += 16;
      const pw = mw - 110, phh = 92, px = mx, py = my;
      V.dotBox(g, px, py, pw, phh, C.mid, 4, 1.2);
      for (let gx = 1; gx < 8; gx++) for (let gy = 1; gy < 5; gy++) { g.fillStyle = C.off; g.fillRect(px + gx * pw / 8 - 1, py + gy * phh / 5 - 1, 2, 2); }
      if (S.sty.emo.on) V.led(g, px + S.sty.emo.v / 10 * pw, py + (1 - S.sty.emo.a / 10) * phh, 4.5, true, C.hot);
      else V.text(g, 'CLICK A FEELING', px + pw / 2, py + phh / 2 - 5, 1.3, C.dim, { align: 'center', glow: false });
      label(px + 4, py + phh + 4, 'DARK', C.dim, 1.3); label(px + pw - V.textWidth('BRIGHT', 1.3) - 4, py + phh + 4, 'BRIGHT', C.dim, 1.3);
      hit('mkpad', px, py, pw, phh, null, { help: 'LEFT = DARK, RIGHT = BRIGHT, BOTTOM = CALM, TOP = INTENSE', drag: (ex, ey) => { if (ey == null) return; S.sty.emo.on = true; S.sty.emo.v = +LO.clamp((ex - px) / pw * 10, 0, 10).toFixed(1); S.sty.emo.a = +LO.clamp((1 - (ey - py) / phh) * 10, 0, 10).toFixed(1); } });
      button('mkauto', px + pw + 10, py - 9, 100, 46, 'AUTO', { pitch: 1.4, on: !S.sty.emo.on, onClick: () => { S.sty.emo.on = false; }, help: 'LET THE STYLE DECIDE THE FEELING' });
      my += phh + 22;
      my += colorRow(mx, my, mw) + 10;
    }
    mindStrip(mx, my, mw, 30); my += 40;
    nowPlaying(mx, my, mw); my += 60;
    const acts = [['KEEP', keep, 'SAVE THIS SONG\'S RECIPE TO KEPT SONGS'], ['EXPORT WAV', exportWav, 'SAVE A WAV TO LIBRARY / MUSIC'], ['MORE LIKE THIS', moreLikeThis, 'SAME RECIPE, NEW SONG'], ['STUDIO', () => go('MUSIC'), 'MIXER, CHANNELS AND CHIP EFFECTS FOR THIS SONG']];
    const aw = (mw - 8) / 2;
    acts.forEach(([t, fn, hp], i) => button('mka' + i, mx + (i % 2) * (aw + 8), my + Math.floor(i / 2) * 42, aw, 36, t, { pitch: 1.35, disabled: !S.song, onClick: fn, help: hp }));
    my += 92;
    if (S.song && S.mind.review && my < y + ph - 20) { label(mx, my, `LISTENER SCORE ${S.mind.score != null ? S.mind.score : S.mind.review.score} / 100`, C.on, 1.4); my += 22; }
    if (y + ph - my > 80) {
      V.dotLine(g, mx, mx + mw, my, C.off, 4, 1.2); my += 10;
      label(mx, my, 'STUDIO NOTES (LIVE)', C.dim, 1.3); my += 16;
      const maxC = Math.floor(mw / 7.8);
      for (const e of S.mind.feed) {
        if (my > y + ph - 30) break;
        label(mx, my, e.mod, C.dim, 1.3); my += 12;
        for (const l of wrapText(e.msg, maxC).slice(0, 2)) { label(mx + 8, my, l, e.type === 'agree' ? C.hot : e.type === 'note' ? C.warn : C.mid, 1.3); my += 12; }
        my += 4;
      }
      if (!S.mind.feed.length) label(mx, my, 'PRESS GENERATE TO WATCH THE TEAM WORK.', C.dim, 1.3);
    }
  }
  // the simple home version of the maker
  function homeMaker(x, y, w, h) {
    panel(x, y, w, h, 'MAKE MUSIC', 'PICK, PICK, GENERATE');
    const ix = x + 14, iw = w - 28; let iy = y + 18;
    label(ix, iy, '1  PICK A CHIP', C.on, 1.4); iy += 14;
    const cw4 = (iw - 18) / 4;
    CHIP_ORDER.forEach((c, i) => button('hmc' + c, ix + (i % 4) * (cw4 + 6), iy + Math.floor(i / 4) * 36, cw4, 32, c, { on: S.mk.chip === c, pitch: 1.3, onClick: () => mkSetChip(c), help: `${c}: ${CHIP_INFO[c][2]}` }));
    iy += 80;
    label(ix, iy, `2  PICK A STYLE  (FAMOUS ON ${S.mk.chip})`, C.on, 1.4); iy += 14;
    const bottomBlock = 46 + 40 + 60 + 62 + 40 + 16;
    const list = CHIP_STYLES[S.mk.chip] || [], bw = (iw - 6) / 2, avail = y + h - bottomBlock - iy - 8;
    const bh = LO.clamp(Math.floor(avail / Math.ceil(list.length / 2)) - 6, 28, 64), rows = Math.max(1, Math.floor(avail / (bh + 6)));
    list.slice(0, rows * 2).forEach((key, i) => {
      const st = styleOf(key); if (!st) return;
      const cx = ix + (i % 2) * (bw + 6), cy = iy + Math.floor(i / 2) * (bh + 6), id = 'hms' + key, sel = S.mk.pick === key, hov = S.hover === id;
      if (sel) { g.fillStyle = C.on; g.globalAlpha = 0.14; g.fillRect(cx, cy, bw, bh); g.globalAlpha = 1; }
      V.dotBox(g, cx, cy, bw, bh, sel ? C.on : hov ? C.mid : C.dim, 3, sel ? 1.4 : 1.1);
      V.led(g, cx + 10, cy + 11, 2.2, sel);
      V.text(g, st.name, cx + 20, cy + 6, V.fitPitch(st.name, bw - 28, 1.5), sel ? C.hot : hov ? C.on : C.mid, { glow: sel });
      if (bh >= 44) wrapText(st.desc, Math.floor((bw - 24) / 7.8)).slice(0, Math.floor((bh - 22) / 12)).forEach((l, k) => label(cx + 10, cy + 22 + k * 12, l, sel ? C.on : C.dim, 1.3));
      hit(id, cx, cy, bw, bh, () => { S.mk.pick = key; }, { help: st.desc });
    });
    iy = y + h - bottomBlock;
    iy += colorRow(ix, iy, iw);
    mindStrip(ix, iy, iw, 30); iy += 40;
    nowPlaying(ix, iy, iw); iy += 60;
    button('hgen', ix, iy, iw * 0.62, 54, S.busy ? 'MAKING IT...' : '3  GENERATE', { primary: true, on: S.busy, pitch: 2.1, onClick: makeGenerate, help: 'MAKE A BRAND-NEW SONG ON THE CHIP YOU PICKED' });
    button('hsur', ix + iw * 0.62 + 6, iy, iw * 0.38 - 6, 54, 'SURPRISE ME', { pitch: 1.5, onClick: makeSurprise, help: 'ROLLS A CHIP, A STYLE AND MAYBE A COLOR' });
    iy += 62;
    button('hopen', ix, iy, iw, 34, 'OPEN MAKE MUSIC (MORE STYLES AND EXTRAS)', { pitch: 1.3, onClick: () => go('MAKE') });
  }

  // ---------------------------------------------------------------- SOUND FX
  function drawSfx(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, lw = Math.max(460, W * 0.42);
    let x = M, w = lw;
    panel(x, y, w, H - 12, 'SOUND FX BUILDER', 'LO-1 CHIP');
    let iy = y + 18; const ix = x + 14, iw = w - 28;
    const spare = Math.max(0, H - 12 - 600), sb = LO.clamp(30 + spare / 9, 30, 50);
    label(ix, iy, 'TELL IT WHAT YOU NEED (UP TO ' + LO.SFX_MAX_WORDS + ' WORDS)', C.dim); iy += 14;
    const focused = S.focus === 'sfxText';
    V.dotBox(g, ix, iy, iw, 34, focused ? C.on : C.mid, 3, 1.3);
    const shown = (S.sfx.text || (focused ? '' : 'E.G. SIX SHOOTER 1800S CANYON')) + (focused && Math.floor(performance.now() / 500) % 2 ? '_' : '');
    V.text(g, shown.slice(-Math.floor((iw - 20) / (6 * 1.8))), ix + 10, iy + 11, 1.8, S.sfx.text ? C.hot : C.dim, { glow: !!S.sfx.text });
    hit('sfxText', ix, iy, iw, 34, () => { S.focus = 'sfxText'; });
    iy += 42;
    const p = S.sfx.parsed;
    if (p && p.unknown.length) { label(ix, iy, 'NOT IN MY DICTIONARY YET: ' + p.unknown.slice(0, 4).join(', '), C.warn); iy += 14; }
    if (p && p.tooLong) { label(ix, iy, 'KEEP IT SHORT: ONLY THE FIRST ' + LO.SFX_MAX_WORDS + ' WORDS COUNT', C.warn); iy += 14; }
    iy += 4; label(ix, iy, 'WHAT', C.dim); iy += 12;
    iy += grid('sw', ix, iy, iw, LO.SFX_RECIPES, 3, S.sfx.what, v => { S.sfx.what = v; }, sb, 6);
    const slotRow = (name, key, opts) => {
      label(ix, iy + 13, name, C.dim);
      const items = ['AUTO'].concat(opts), bw = (iw - 70 - (items.length - 1) * 5) / items.length;
      items.forEach((o, i) => button('s' + key + o, ix + 70 + i * (bw + 5), iy, bw, sb, o, { on: (S.sfx[key] || 'AUTO') === o, pitch: 1.4, onClick: () => { S.sfx[key] = o === 'AUTO' ? null : o; if (key === 'place') S.atmos.SFX = emptyChain(); } }));
      iy += sb + 8;
    };
    iy += 4; slotRow('ERA', 'era', LO.SFX_SLOTS.era); slotRow('PLACE', 'place', LO.SFX_SLOTS.place); slotRow('WEIGHT', 'weight', LO.SFX_SLOTS.weight);
    slider('sfxCount', ix, iy, iw, 'COUNT', S.sfx.count || 0, 0, 30, 1, v => { S.sfx.count = v || null; }, { labelW: 70, fmt: v => v ? String(v) : 'AUTO' });
    iy += 30;
    const bh = LO.clamp(56 + spare / 6, 56, 90), bw = (iw - 18) / 4;
    iy = Math.max(iy, y + H - 12 - bh - 64);
    button('sgen', ix, iy, bw * 2 + 6, bh, 'BUILD SOUND', { primary: true, pitch: 2.2, on: S.busy, onClick: () => makeSfx(false), help: 'BUILD THIS SOUND FROM MATH ON THE LO-1 CHIP' });
    button('svary', ix + (bw + 6) * 2, iy, bw, bh, 'VARY', { big: true, pitch: 1.8, onClick: () => makeSfx(true) });
    button('splay', ix + (bw + 6) * 3, iy, bw, bh, '\x01 PLAY', { big: true, pitch: 1.8, disabled: !S.sfx.L, onClick: () => P.oneShot(S.sfx.L, S.sfx.R, 'sfx') });
    iy += bh + 10;
    const bw3 = (iw - 12) / 3;
    button('sexp', ix, iy, bw3, 40, 'SAVE TO LIBRARY', { disabled: !S.sfx.L, pitch: 1.4, onClick: async () => {
      const nm = `${[S.sfx.what, S.sfx.era, S.sfx.place, S.sfx.weight].filter(Boolean).join(' ')}${S.sfx.ref ? ' REFERENCE' : ' ' + S.sfx.seed}.wav`;
      await host.saveFile(nm, LO.encodeWav(S.sfx.L, S.sfx.R, SR), 'SOUND FX'); setStatus('SAVED TO LIBRARY / SOUND FX'); refreshLib();
    } });
    button('sref', ix + bw3 + 6, iy, bw3, 40, 'REFERENCE TAKE', { pitch: 1.4, on: S.sfx.ref, onClick: referenceTake });
    button('satm', ix + (bw3 + 6) * 2, iy, bw3, 40, 'ATMOSPHERICS', { pitch: 1.4, on: LO.atmosActive(S.atmos.SFX), onClick: () => { S.atm.source = 'SFX'; go('ATMOSPHERICS'); } });

    x = M + lw + 16; w = W - M - x;
    panel(x, y, w, H - 12, 'SCREEN', S.sfx.info);
    const wx = x + 16, wy = y + 30, ww = w - 32, wh = Math.max(240, H - 12 - 30 - 210);
    if (S.sfx.L) wave(S.sfx.L, wx, wy, ww, wh, P.shotTag === 'sfx' ? P.shotFrac() : -1);
    else { V.dotBox(g, wx, wy, ww, wh, C.off, 4, 1.2); V.text(g, 'BUILD A SOUND TO SEE IT HERE', wx + ww / 2, wy + wh / 2 - 6, TP, C.dim, { align: 'center', glow: false }); }
    let ty = wy + wh + 24;
    [`RECIPE: ${S.sfx.what}${S.sfx.ref ? '  (ORIGINAL REFERENCE TAKE)' : ''}`,
      `ERA: ${S.sfx.era || 'AUTO'}   PLACE: ${S.sfx.usedPlace || LO.sfxDefaultPlace(S.sfx.what, S.sfx.place)}`,
      `WEIGHT: ${S.sfx.weight || 'AUTO'}   COUNT: ${S.sfx.count || 'AUTO'}   SEED: ${S.sfx.seed}`, '', 'EVERY SOUND IS BUILT FROM MATH ON THE LO-1 CHIP:', 'LAYERED SYNTHESIS, 15 KHZ SAMPLE GRAIN, 10-BIT CRUNCH.',
      'NO RECORDINGS, NO INTERNET. ROYALTY-FREE AND YOURS.', '', 'VARY = SAME RECIPE, NEW TAKE. ATMOSPHERICS = ANY PLACE YOU WANT.']
      .forEach((l, i) => { label(wx, ty, l.slice(0, Math.floor(ww / 9.6)), i < 3 ? C.on : C.mid); ty += 15; });
  }

  // ---------------------------------------------------------------- ATMOSPHERICS
  function drawAtmos(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, lw = Math.max(520, W * 0.46);
    let x = M, w = lw;
    const src = S.atm.source, chain = S.atmos[src];
    panel(x, y, w, H - 12, 'ATMOSPHERICS', 'AFTER THE CHIP');
    let iy = y + 18; const ix = x + 14, iw = w - 28;
    label(ix, iy, 'SOURCE', C.dim); iy += 12;
    const sw3 = (iw - 12) / 3;
    button('srcSONG', ix, iy, sw3, 34, 'CURRENT SONG', { on: src === 'SONG', disabled: !S.song, pitch: 1.4, onClick: () => { S.atm.source = 'SONG'; } });
    button('srcSFX', ix + sw3 + 6, iy, sw3, 34, 'CURRENT SOUND FX', { on: src === 'SFX', disabled: !S.sfx.L, pitch: 1.4, onClick: () => { S.atm.source = 'SFX'; } });
    button('srcFILE', ix + (sw3 + 6) * 2, iy, sw3, 34, S.atm.file ? 'FILE: ' + S.atm.file.name : 'PICK A FILE...', { on: src === 'FILE', pitch: 1.4, onClick: () => openLibPick('PICK A FILE FROM THE LIBRARY', (rel, name) => loadAtmFile(rel, name)) });
    iy += 46;
    const slotW = (iw - 10) / 2;
    chain.slots.forEach((s, k) => {
      const sx = ix + k * (slotW + 10), active = S.atm.slot === k;
      V.dotBox(g, sx, iy, slotW, 84, active ? C.on : C.dim, 3, 1.3);
      hit('slot' + k, sx, iy, slotW, 22, () => { S.atm.slot = k; });
      label(sx + 10, iy + 8, `SLOT ${k + 1}${active ? '  \x01 PICKING' : '  (CLICK TO PICK)'}`, active ? C.on : C.mid);
      V.text(g, s.preset, sx + 10, iy + 24, V.fitPitch(s.preset, slotW - 20, 2), s.preset === 'NONE' ? C.dim : C.hot);
      slider('amt' + k, sx + 10, iy + 46, slotW - 20, 'AMOUNT', s.amount, 0, 100, 5, v => { s.amount = v; atmosChanged(); }, { labelW: 70, valueW: 40, fmt: v => v + '%' });
      slider('siz' + k, sx + 10, iy + 64, slotW - 20, 'SIZE', Math.round(s.size * 100), 50, 160, 10, v => { s.size = v / 100; atmosChanged(); }, { labelW: 70, valueW: 40, fmt: v => v + '%', disabled: !LO.ATMOS[s.preset] || LO.ATMOS[s.preset].group !== 'SPACES' });
    });
    iy += 96;
    const pick = name => { chain.slots[S.atm.slot].preset = name; if (name !== 'NONE' && chain.slots[S.atm.slot].amount === 0) chain.slots[S.atm.slot].amount = 100; atmosChanged(); };
    const spare = Math.max(0, H - 12 - 580), pb = LO.clamp(28 + spare / 9, 28, 48);
    for (const grp of LO.ATMOS_GROUPS) {
      label(ix, iy, grp, C.dim); iy += 12;
      const names = Object.keys(LO.ATMOS).filter(n => LO.ATMOS[n].group === grp);
      iy += grid('ap', ix, iy, iw, names, 4, chain.slots[S.atm.slot].preset, pick, pb, 5, { pitch: 1.4 });
      iy += 2;
    }
    button('apNONE', ix, iy, 120, pb, 'NONE', { on: chain.slots[S.atm.slot].preset === 'NONE', pitch: 1.4, onClick: () => pick('NONE') });
    iy += pb + 12;
    slider('dist', ix, iy, iw, 'DISTANCE', chain.distance, 0, 100, 5, v => { chain.distance = v; atmosChanged(); }, { labelW: 92, valueW: 170, fmt: v => LO.DISTANCE_LABEL(v) });
    iy += 26;
    const bh = 48, bw = (iw - 18) / 4;
    iy = Math.max(iy, y + H - 12 - bh - 14);
    const playing = (src === 'SONG' && P.playing) || (P.shot && (P.shotTag === 'sfx' || P.shotTag === 'atm'));
    button('aplay', ix, iy, bw, bh, playing ? '\x02 STOP' : '\x01 PLAY', { big: true, on: playing, pitch: 1.6, onClick: () => { if (playing) { P.stop(); P.stopShot(); } else atmPlay(); } });
    button('aab', ix + bw + 6, iy, bw, bh, S.atm.ab === 'WET' ? 'A/B: WITH' : 'A/B: ORIGINAL', { big: true, on: S.atm.ab === 'DRY', pitch: 1.5, onClick: atmToggleAB });
    button('aclr', ix + (bw + 6) * 2, iy, bw, bh, 'CLEAR', { big: true, pitch: 1.6, onClick: () => { S.atmos[src] = emptyChain(); atmosChanged(); } });
    if (src === 'FILE') button('asave', ix + (bw + 6) * 3, iy, bw, bh, 'SAVE RESULT', { big: true, pitch: 1.5, disabled: !S.atm.wetL, onClick: saveFileAtmos });
    else button('abatch', ix + (bw + 6) * 3, iy, bw, bh, 'BATCH A FOLDER', { big: true, pitch: 1.4, onClick: () => { S.atmos.FILE = JSON.parse(JSON.stringify(chain)); S.crunch.profile = 'ATMOS ONLY'; go('CRUNCH'); } });

    x = M + lw + 16; w = W - M - x;
    panel(x, y, w, H - 12, 'SCREEN', src === 'FILE' && S.atm.ms ? `PROCESSED IN ${S.atm.ms} MS` : '');
    const wx = x + 16, wy = y + 30, ww = w - 32, wh = Math.max(200, H * 0.42);
    let L = null, frac = -1;
    if (src === 'SONG' && S.song) { L = S.atm.ab === 'DRY' && S.dryL ? S.dryL : S.mixL; frac = P.playing && P.buf ? P.position() / P.buf.duration : -1; }
    else if (src === 'SFX') { L = S.sfx.L; frac = P.shotTag === 'sfx' ? P.shotFrac() : -1; }
    else if (S.atm.file) { L = S.atm.ab === 'DRY' || !S.atm.wetL ? S.atm.file.L : S.atm.wetL; frac = P.shotTag === 'atm' ? P.shotFrac() : -1; }
    wave(L, wx, wy, ww, wh, frac);
    if (!L) V.text(g, src === 'FILE' ? 'PICK A FILE FROM THE LIBRARY' : 'NOTHING TO PROCESS YET', wx + ww / 2, wy + wh / 2 - 6, TP, C.dim, { align: 'center', glow: false });
    let ty = wy + wh + 24;
    label(wx, ty, ('CHAIN: ' + chainSummary(chain)).slice(0, Math.floor(ww / 9.6)), C.on); ty += 18;
    chain.slots.forEach((s, k) => { const d = LO.ATMOS[s.preset]; label(wx, ty, `SLOT ${k + 1}: ${s.preset}${d ? ' - ' + d.desc : ''}`.slice(0, Math.floor(ww / 8.4)), d ? C.mid : C.dim, 1.4); ty += 15; });
    ty += 10;
    ['THE CHIPS MAKE THE SOUND. ATMOSPHERICS IS THE WORLD IT PLAYS IN.', 'IT RUNS AFTER THE CHIP, SO HARDWARE-TRUE FILES CAN SKIP IT.', 'ECHOES GET EXTRA SECONDS TO RING OUT. LEVELS STAY FAIR FOR A/B.',
      src === 'SONG' ? 'THIS CHAIN IS NOW PART OF THE SONG: EXPORTS AND GAME LOOPS INCLUDE IT.' : src === 'SFX' ? 'THIS CHAIN REPLACES THE SOUND FX PLACE SWITCH.' : 'SAVE RESULT WRITES A NEW FILE. THE ORIGINAL IS NEVER TOUCHED.']
      .forEach(l => { label(wx, ty, l.slice(0, Math.floor(ww / 8.4)), C.dim, 1.4); ty += 14; });
  }

  // ---------------------------------------------------------------- CRUNCH
  function drawCrunch(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, lw = Math.max(520, W * 0.46);
    let x = M, w = lw; const C2 = S.crunch;
    const list = Object.keys(LO.CRUNCH_INFO).concat(['ATMOS ONLY']);
    panel(x, y, w, H - 12, 'CRUNCH', 'BATCH READY');
    let iy = y + 18; const ix = x + 14, iw = w - 28;
    label(ix, iy, 'SOURCE  (OR DRAG FILES / A FOLDER ONTO THE WINDOW)', C.dim); iy += 12;
    const b3 = (iw - 12) / 3;
    button('cfiles', ix, iy, b3, 36, 'PICK FILES...', { pitch: 1.4, disabled: C2.running, onClick: () => openBrowse('files', 'PICK AUDIO FILES', paths => { C2.files = paths.map(p => ({ abs: p, rel: p.split(/[\\/]/).pop() })); C2.base = 'SINGLES'; }) });
    button('cfolder', ix + b3 + 6, iy, b3, 36, 'PICK FOLDER...', { pitch: 1.4, disabled: C2.running, onClick: () => openBrowse('folder', 'PICK A FOLDER TO BATCH', p => crunchAddFolder(p)) });
    button('clib', ix + (b3 + 6) * 2, iy, b3, 36, 'FROM LIBRARY...', { pitch: 1.4, disabled: C2.running, onClick: () => openLibPick('PICK A LIBRARY FILE', (rel, name) => { C2.files = [{ lib: rel, rel: name }]; C2.base = 'FROM LIBRARY'; }) });
    iy += 46;
    button('crec', ix, iy, 190, 30, 'INCLUDE SUBFOLDERS', { on: C2.recursive, pitch: 1.4, onClick: () => { C2.recursive = !C2.recursive; } });
    label(ix + 200, iy + 13, C2.files.length ? `${C2.files.length} FILE${C2.files.length === 1 ? '' : 'S'} QUEUED  /  ${C2.base}` : 'NOTHING QUEUED YET', C2.files.length ? C.on : C.dim);
    iy += 42;
    label(ix, iy, 'TARGET SOUND', C.dim); iy += 12;
    const spare = Math.max(0, H - 12 - 520), pb = LO.clamp(34 + spare / 5, 34, 72);
    iy += grid('cp', ix, iy, iw, list, 4, C2.profile, v => { C2.profile = v; }, pb, 6, { pitch: 1.4 });
    const info = LO.CRUNCH_INFO[C2.profile];
    label(ix, iy + 2, info ? info.desc : 'NO CHIP FORMAT: JUST THE ATMOSPHERICS CHAIN ON EVERY FILE', C.mid, 1.4); iy += 16;
    if (info && info.limitSec) label(ix, iy + 2, `REAL HARDWARE HOLDS ABOUT ${info.limitSec.toFixed(1)} S PER SAMPLE`, C.dim, 1.4);
    iy += 26;
    button('cfit', ix, iy, 190, 30, 'FIT REAL MEMORY', { on: C2.fit, pitch: 1.4, disabled: !info || !info.limitSec, onClick: () => { C2.fit = !C2.fit; } });
    label(ix + 200, iy + 13, C2.fit ? 'LONG FILES ARE TRIMMED OR RESAMPLED TO FIT' : 'FULL LENGTH (OVER-BUDGET FILES ARE FLAGGED)', C.dim, 1.4);
    iy += 38;
    const atmOk = LO.atmosActive(S.atmos.FILE);
    button('catm', ix, iy, 190, 30, 'ADD ATMOSPHERICS', { on: C2.useAtmos && atmOk, pitch: 1.4, disabled: C2.profile === 'ATMOS ONLY', onClick: () => { if (!atmOk) { S.atm.source = 'FILE'; go('ATMOSPHERICS'); setStatus('SET UP A CHAIN, THEN COME BACK TO CRUNCH'); } else C2.useAtmos = !C2.useAtmos; } });
    label(ix + 200, iy + 13, ('CHAIN: ' + chainSummary(S.atmos.FILE)).slice(0, 34), atmOk ? C.on : C.dim, 1.4);
    iy += 40;
    const bh = 56; iy = Math.max(iy + 30, y + H - 12 - bh - 14);
    const done = C2.done + C2.skipped, total = C2.files.length || 1;
    const n = Math.floor(iw / 5); for (let i = 0; i < n; i++) { g.fillStyle = (C2.running || done) && i / n < done / total ? C.on : C.off; g.fillRect(ix + i * 5, iy - 16, 3, 6); }
    if (C2.running && done > 0) { const per = (performance.now() - C2.t0) / done; label(ix, iy - 30, `${done} / ${C2.files.length}   ABOUT ${Math.ceil(per * (C2.files.length - done) / 1000)} S LEFT`, C.on, 1.4); }
    if (!C2.running) button('cgo', ix, iy, iw * 0.66, bh, 'CRUNCH ' + (C2.files.length > 1 ? C2.files.length + ' FILES' : 'IT'), { primary: true, pitch: 2, disabled: !C2.files.length, onClick: runCrunch, help: 'WRITE NEW CRUNCHED COPIES. ORIGINALS ARE NEVER TOUCHED.' });
    else button('cstop', ix, iy, iw * 0.66, bh, 'CANCEL', { big: true, warn: true, pitch: 2, onClick: () => { C2.cancel = true; } });
    button('copen', ix + iw * 0.66 + 8, iy, iw * 0.34 - 8, bh, 'OPEN IN LIBRARY', { big: true, pitch: 1.5, onClick: () => { go('LIBRARY'); libOpen('CRUNCHED'); } });

    x = M + lw + 16; w = W - M - x;
    panel(x, y, w, H - 12, 'RESULTS', C2.results.length ? `${C2.done} DONE${C2.skipped ? ' / ' + C2.skipped + ' SKIPPED' : ''}` : '');
    const wx = x + 16, ww = w - 32; let ty = y + 22;
    label(wx, ty, 'ORIGINALS ARE NEVER TOUCHED. NEW FILES GO TO LIBRARY / CRUNCHED.', C.dim, 1.4); ty += 22;
    if (!C2.results.length) label(wx, ty, (C2.files.length ? 'QUEUED: ' + C2.files[0].rel + (C2.files.length > 1 ? ` + ${C2.files.length - 1} MORE` : '') : 'PICK FILES OR A FOLDER, CHOOSE A TARGET, PRESS CRUNCH.').slice(0, Math.floor(ww / 9.6)), C.mid);
    const rows = Math.floor((y + H - 12 - ty - 10) / 20);
    C2.results.slice(0, rows).forEach((r, i) => {
      const id = 'cres' + i, yy = ty + i * 20, hov = S.hover === id;
      label(wx, yy, r.name.slice(0, Math.floor((ww - 160) / 8.4)), hov ? C.on : C.mid, 1.4);
      if (r.info && r.info.fits === false) label(wx + ww - 4 - V.textWidth('OVER REAL MEMORY', 1.3), yy, 'OVER REAL MEMORY', C.warn, 1.3);
      hit(id, wx, yy - 4, ww, 18, () => libPlayRel(r.rel));
    });
  }

  // ---------------------------------------------------------------- INSTRUMENT SCAN (v0.6)
  // Bring a WAV or a SoundFont, measure it into about 50 numbers, rebuild it from math, A/B it, keep only the numbers.
  const IS = () => S.inst;
  const toMono = (L, R) => { const o = new Float32Array(L.length); for (let i = 0; i < L.length; i++) o[i] = (L[i] + R[i]) * 0.5; return o; };
  const to32k = (x, sr) => { if (sr === SR) return x; const n = Math.floor(x.length * SR / sr), o = new Float32Array(n), r = sr / SR; for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; o[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; } return o; };
  const midiOf = f => 69 + 12 * Math.log2(f / 440);
  function instReset(keepSf2) { const I = IS(); I.src = []; I.aIdx = 0; I.profile = null; I.bL = null; I.bInfo = null; I.aL = null; I.loadedMine = null; if (!keepSf2) { I.sf2 = null; I.instSel = null; } }
  async function instAddWavs(paths, fromLib) {
    const I = IS(); instReset(false); I.busyMsg = 'READING';
    for (const p of paths.slice(0, 12)) {
      try {
        const ab = fromLib ? await host.libRead(p) : await host.fsRead(p); if (!ab || ab.error) throw new Error(ab && ab.error || 'READ FAILED');
        const d = await decode(ab), n = Math.min(d.L.length, SR * 6);
        I.src.push({ name: String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toUpperCase(), data: toMono(d.L.subarray(0, n), d.R.subarray(0, n)), sr: SR });
      } catch (e) { BB.log('ISCAN', 'SKIPPED', { file: p, why: String(e.message || e) }); }
    }
    I.busyMsg = ''; I.srcLabel = I.src.length ? (I.src.length === 1 ? I.src[0].name : `${I.src.length} WAVS AS ONE FAMILY`) : '';
    S.text.instName = I.src[0] ? I.src[0].name.slice(0, 24) : '';
    setStatus(I.src.length ? `${I.src.length} SAMPLE${I.src.length === 1 ? '' : 'S'} READY: PRESS SCAN` : 'COULD NOT READ THOSE FILES (LOGGED)');
    BB.log('ISCAN', 'WAVS', { n: I.src.length });
  }
  async function instOpenSf2(path) {
    const I = IS(); instReset(false); I.busyMsg = 'OPENING SOUNDFONT';
    try {
      const ab = await host.fsRead(path); if (!ab || ab.error) throw new Error(ab && ab.error || 'READ FAILED');
      if (ab.byteLength > 400 * 1048576) throw new Error('BIGGER THAN 400 MB');
      const sf = LO.SNESI.parseSF2(ab);
      I.sf2 = { name: path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toUpperCase(), sf, scroll: 0 };
      setStatus(`${sf.insts.length} INSTRUMENTS IN ${I.sf2.name}: PICK ONE`); BB.log('ISCAN', 'SF2', { name: I.sf2.name, insts: sf.insts.length, samples: sf.samples.length, mb: +(ab.byteLength / 1048576).toFixed(1) });
    } catch (e) { BB.error('ISCAN SF2', e.message || e); setStatus('COULD NOT OPEN THAT SOUNDFONT: ' + String(e.message || e).toUpperCase().slice(0, 50)); }
    I.busyMsg = '';
  }
  function instPickSf2(i) {
    const I = IS(), sf = I.sf2.sf, ins = sf.insts[i]; instReset(true); I.instSel = i;
    // a family: up to 8 samples spread across the keyboard (right-channel twins skipped)
    let ids = ins.samples.filter(id => sf.samples[id].type !== 4);
    if (!ids.length) ids = ins.samples;
    ids.sort((a, b) => sf.samples[a].pitch - sf.samples[b].pitch);
    if (ids.length > 8) { const step = (ids.length - 1) / 7; ids = Array.from({ length: 8 }, (_, k) => ids[Math.round(k * step)]); }
    I.src = ids.map(id => { const r = sf.read(id); return { name: r.name.toUpperCase(), data: r.data, sr: r.sr, hint: r.hint }; });
    I.srcLabel = `${ins.name}: ${I.src.length} SAMPLE${I.src.length === 1 ? '' : 'S'}`;
    S.text.instName = ins.name.slice(0, 24);
    BB.log('ISCAN', 'SF2 INSTRUMENT', { name: ins.name, samples: I.src.length });
  }
  async function instScan() {
    const I = IS(); if (!I.src.length || I.running) return;
    I.running = true; I.busyMsg = 'MEASURING';
    try {
      const m = await ask('iscan', { samples: I.src.map(s => ({ data: s.data, sr: s.sr, hint: s.hint })) });
      if (!m.profile) throw new Error('NOTHING TO MEASURE (SILENT OR TOO SHORT)');
      I.profile = m.profile; I.loadedMine = null; I.tune = { bright: 0, attack: 0, decay: 0, noise: 5 };
      setStatus(`MEASURED ${m.profile.count} NUMBERS FROM ${m.profile.n} SAMPLE${m.profile.n === 1 ? '' : 'S'} IN ${m.ms} MS: PRESS B TO HEAR THE REBUILD`);
      BB.log('ISCAN', 'MEASURED', { src: I.srcLabel, ms: m.ms, f0: Math.round(m.profile.f0), kind: m.profile.kind, attackMs: Math.round(m.profile.attackMs), tau: +m.profile.decayTau.toFixed(2), B: m.profile.B, h: m.profile.h, F: m.profile.F });
      await instBuild(true);
    } catch (e) { BB.error('ISCAN', e.message || e); setStatus(String(e.message || e).toUpperCase().slice(0, 80)); }
    I.running = false; I.busyMsg = '';
  }
  function instNotes(phrase) {
    const I = IS(), p = I.profile;
    if (phrase || !p) { const seq = [60, 64, 67, 72, 67, 64, 60]; return seq.map((m, i) => ({ s: i * 9600, e: i * 9600 + 8400, m })); }
    const src = I.src[I.aIdx], dur = src ? Math.min(3, src.data.length / src.sr) : 1.5;
    const f = src && src.hint ? src.hint : p.f0, m = LO.clamp(midiOf(f), 36, 96);
    return [{ s: 0, e: Math.round(dur * SR * (p.kind === 0 ? 0.85 : 1)), m }];
  }
  async function instBuild(play, phrase, family) {
    const I = IS(); if (!I.profile && !family) return;
    try {
      const m = await ask('ibuild', family ? { family, notes: instNotes(true) } : { profile: I.profile, tune: I.tune, notes: instNotes(phrase) });
      if (family) { I.libL = m.L; I.libPlaying = family; P.oneShot(m.L, m.L, 'ilib'); BB.log('ISCAN', 'LIBRARY AUDITION', { family }); return; }
      I.bL = m.L; I.bInfo = m.info;
      if (play) P.oneShot(m.L, m.L, 'ib');
    } catch (e) { BB.error('ISCAN BUILD', e.message || e); }
  }
  let instTuneT = null;
  const instTuned = () => { clearTimeout(instTuneT); instTuneT = setTimeout(() => { BB.log('ISCAN', 'TUNE', IS().tune); instBuild(true); }, 260); };
  function instPlayA() {
    const I = IS(), s = I.src[I.aIdx]; if (!s) return;
    if (!s.p32) s.p32 = to32k(s.data, s.sr);
    I.aL = s.p32; P.oneShot(s.p32, s.p32, 'ia');
  }
  function instSave() {
    const I = IS(); if (!I.profile) return;
    openPrompt('NAME YOUR INSTRUMENT', (S.text.instName || 'MY INSTRUMENT').slice(0, 24), async v => {
      if (!v) return;
      const name = v.toUpperCase().slice(0, 24);
      const rec = JSON.parse(JSON.stringify({ ...I.profile, tune: { ...I.tune }, name, id: 'inst-' + Date.now(), from: I.srcLabel || '', savedAt: new Date().toISOString() }));
      S.myInst = await host.instSave(rec); I.loadedMine = rec.id;
      setStatus(`SAVED: MY: ${name}. PICK IT IN THE SNES STUDIO AS LEAD, COUNTER OR PAD SOUND`);
    });
  }
  function instLoadMine(rec) {
    const I = IS(); instReset(true); I.profile = JSON.parse(JSON.stringify(rec)); I.tune = { bright: 0, attack: 0, decay: 0, noise: 5, ...(rec.tune || {}) }; I.loadedMine = rec.id; I.srcLabel = 'MY: ' + rec.name + ' (NUMBERS ONLY)';
    S.text.instName = rec.name; instBuild(true, true);
  }
  const KIND = ['SUSTAINED', 'PLUCKED', 'STRUCK'];
  function drawInstruments(M, top, W, bottom) {
    const I = IS(), H = bottom - top, y = top + 12, ph = H - 12;
    const lw = Math.round(LO.clamp(W * 0.27, 340, 470)), rw = Math.round(LO.clamp(W * 0.27, 340, 460)), gap = 16;
    const cx = M + lw + gap, cw = W - M * 2 - lw - rw - gap * 2, rx = W - M - rw;
    // ---- 1. BRING AN INSTRUMENT
    panel(M, y, lw, ph, '1. BRING AN INSTRUMENT', I.src.length ? `${I.src.length} SAMPLE${I.src.length === 1 ? '' : 'S'}` : '');
    const ix = M + 14, iw = lw - 28; let iy = y + 18;
    const b3 = (iw - 12) / 3;
    button('iwav', ix, iy, b3, 36, 'WAVS...', { pitch: 1.4, disabled: I.running, onClick: () => openBrowse('files', 'PICK ONE WAV, OR SEVERAL NOTES OF ONE INSTRUMENT', paths => instAddWavs(paths)), help: 'ONE INSTRUMENT: ONE NOTE, OR SEVERAL NOTES THAT BECOME ONE FAMILY' });
    button('isf2', ix + b3 + 6, iy, b3, 36, 'SOUNDFONT...', { pitch: 1.4, disabled: I.running, onClick: () => openBrowse('files', 'PICK A SOUNDFONT (.SF2)', paths => { const p = paths.find(q => /\.sf2$/i.test(q)); if (p) instOpenSf2(p); else instAddWavs(paths); }, 'inst'), help: 'OPEN A FREE .SF2 SOUNDFONT AND PICK ONE OF ITS INSTRUMENTS' });
    button('ilib', ix + (b3 + 6) * 2, iy, b3, 36, 'LIBRARY...', { pitch: 1.4, disabled: I.running, onClick: () => openLibPick('PICK A SOUND FROM YOUR LIBRARY', rel => instAddWavs([rel], true)) });
    iy += 46;
    const listTop = iy, scanH = 64, listH = y + ph - 14 - scanH - 74 - listTop;
    V.dotBox(g, ix, listTop, iw, listH, C.off, 4, 1.2);
    if (I.sf2) {
      const sf = I.sf2.sf, rh = 22;
      label(ix + 10, listTop + 10, (I.sf2.name + `  /  ${sf.insts.length} INSTRUMENTS`).slice(0, Math.floor((iw - 20) / 8.4)), C.on, 1.4);
      const sl = scrollList('isfl', ix, listTop + 30, iw, listH - 36, sf.insts.length, rh, 'scroll', I.sf2);
      for (let i = sl.from; i < sl.to; i++) {
        const it = sf.insts[i], yy = listTop + 34 + (i - sl.from) * rh, id = 'isi' + i, sel = I.instSel === i, hov = S.hover === id;
        if (sel) V.dotBox(g, ix + 4, yy - 5, iw - 8, rh - 2, C.mid, 3, 1);
        label(ix + 12, yy, it.name.slice(0, Math.floor((iw - 90) / 9)), sel || hov ? C.on : C.mid, 1.45);
        const nn = it.samples.length + (it.samples.length === 1 ? ' SAMPLE' : ' SAMPLES'); label(ix + iw - 10 - V.textWidth(nn, 1.3), yy + 1, nn, C.dim, 1.3);
        hit(id, ix + 4, yy - 5, iw - 8, rh - 2, () => instPickSf2(i));
      }
    } else if (I.src.length) {
      I.src.forEach((s, i) => { const yy = listTop + 12 + i * 22; if (yy > listTop + listH - 20) return; label(ix + 12, yy, s.name.slice(0, Math.floor((iw - 110) / 9)), i === I.aIdx ? C.on : C.mid, 1.45); const t = `${(s.data.length / s.sr).toFixed(1)} S`; label(ix + iw - 10 - V.textWidth(t, 1.3), yy + 1, t, C.dim, 1.3); });
    } else {
      ['BRING ONE INSTRUMENT:', '', 'A WAV OF ONE NOTE, A FEW NOTES OF THE', 'SAME INSTRUMENT, OR A FREE SOUNDFONT.', '', 'IT IS MEASURED INTO ABOUT 50 NUMBERS', 'AND REBUILT FROM MATH. THE AUDIO IS', 'NEVER SAVED, ONLY THE NUMBERS.', '', 'AIM FOR A FAMILY (A WARM HARP), NOT', "ONE GAME'S SIGNATURE SAMPLE.", '', 'YOU CAN ALSO DRAG FILES ONTO THE WINDOW.']
        .forEach((l, i) => label(ix + 14, listTop + 14 + i * 15, l, i === 0 ? C.on : C.mid, 1.4));
    }
    iy = listTop + listH + 12;
    label(ix, iy, (I.busyMsg ? I.busyMsg + '...' : I.srcLabel ? 'READY: ' + I.srcLabel : 'NOTHING PICKED YET').slice(0, Math.floor(iw / 8.4)), I.src.length ? C.on : C.dim, 1.4); iy += 18;
    label(ix, iy, (I.sf2 && I.instSel != null ? 'SOUNDFONT HELD IN MEMORY, THIS SESSION ONLY' : 'SEVERAL SAMPLES BECOME ONE FAMILY').slice(0, Math.floor(iw / 7.8)), C.dim, 1.3);
    iy = y + ph - 14 - scanH;
    button('iscan', ix, iy, iw, scanH, I.running ? 'MEASURING...' : 'SCAN IT', { primary: true, on: I.running, pitch: 2.4, disabled: !I.src.length, onClick: instScan, help: 'MEASURE ABOUT 50 NUMBERS, THEN REBUILD THE INSTRUMENT FROM MATH' });

    // ---- 2. THE NUMBERS
    const p = I.profile;
    panel(cx, y, cw, ph, '2. THE NUMBERS', p ? `${p.count} KEPT  /  AUDIO DROPPED` : '');
    const nx = cx + 16, nw = cw - 32; let ny = y + 20;
    const numRows = Math.ceil(24 / (cw > 640 ? 3 : 2)), rowsBlock = numRows * 19 + 22, spareC = Math.max(0, ph - 20 - 150 - rowsBlock - 26);
    const chH = LO.clamp(spareC * 0.6, 110, 300);
    V.dotBox(g, nx, ny, nw, chH, C.off, 4, 1.2);
    label(nx + 10, ny + 8, 'HARMONICS 1-16  (STEADY, DIM = ATTACK)', C.dim, 1.3);
    if (p) {
      const bwid = (nw - 30) / 16, base = ny + chH - 22, top0 = ny + 26, hh = base - top0;
      for (let k = 0; k < 16; k++) {
        const bx = nx + 15 + k * bwid, s = LO.clamp(1 + p.h[k] / 60, 0, 1), a = LO.clamp(1 + (p.hA ? p.hA[k] : -80) / 60, 0, 1);
        for (let yy = 0; yy < hh * a; yy += 4) { g.fillStyle = C.dim; g.fillRect(bx + bwid * 0.55, base - yy, 2, 2); }
        for (let yy = 0; yy < hh * s; yy += 4) { g.fillStyle = s > 0.9 ? C.hot : C.on; g.fillRect(bx + bwid * 0.15, base - yy, Math.max(2, bwid * 0.35), 2.4); }
        if (bwid > 18 || k % 2 === 0) V.text(g, String(k + 1), bx + bwid * 0.35, base + 6, 1.1, C.dim, { align: 'center', glow: false });
      }
    } else V.text(g, 'SCAN SOMETHING TO SEE ITS SOUND HERE', nx + nw / 2, ny + chH / 2, 1.5, C.dim, { align: 'center', glow: false });
    ny += chH + 12;
    // envelope shape
    const ehH = LO.clamp(spareC - chH, 70, 200);
    V.dotBox(g, nx, ny, nw, ehH, C.off, 4, 1.2); label(nx + 10, ny + 8, 'LOUDNESS OVER TIME', C.dim, 1.3);
    if (p) {
      const ex = nx + 12, ew = nw - 24, eb = ny + ehH - 10, et = ny + 22, eh = eb - et, span = Math.max(0.3, Math.min(4, p.dur || 2));
      for (let i = 0; i < ew; i += 3) {
        const t = i / ew * span; let v;
        const at = Math.max(0.001, p.attackMs / 1000);
        if (t < at) v = t / at;
        else if (p.kind === 0) { const dt = t - at, dd = Math.max(0.01, p.decayMs / 1000); v = dt < dd ? 1 - (1 - p.sustainLvl) * dt / dd : p.sustainLvl; if (t > span * 0.85) v *= Math.max(0, 1 - (t - span * 0.85) / (span * 0.15)); }
        else v = Math.exp(-(t - at) / Math.max(0.02, p.decayTau));
        g.fillStyle = C.on; g.fillRect(ex + i, eb - v * eh, 2, 2);
      }
    }
    ny += ehH + 14;
    // the numbers themselves
    const rows = p ? [
      ['PITCH', `${p.f0.toFixed(1)} HZ (${LO.noteName(Math.round(midiOf(p.f0)))})`], ['KIND', KIND[p.kind] || '-'], ['SAMPLES', String(p.n)],
      ['ATTACK', `${Math.round(p.attackMs)} MS`], ['DECAY', `${Math.round(p.decayMs)} MS`], ['SUSTAIN', `${Math.round(p.sustainLvl * 100)}%`],
      ['RING (TAU)', p.decayTau > 20 ? 'HOLDS' : `${p.decayTau.toFixed(2)} S`], ['RELEASE', `${Math.round(p.releaseMs)} MS`], ['STIFFNESS B', p.B ? p.B.toExponential(1).toUpperCase() : '0'],
      ['BRIGHT ATTACK', `${p.cenA.toFixed(1)} X`], ['BRIGHT STEADY', `${p.cenS.toFixed(1)} X`], ['BRIGHT TAIL', `${p.cenR.toFixed(1)} X`],
      ['NOISE ATTACK', `${Math.round(p.noiseAttack * 100)}%`], ['NOISE STEADY', `${Math.round(p.noiseSteady * 100)}%`], ['TRANSIENT', `${Math.round(p.transientMs)} MS`],
      ['VIBRATO', p.vibDepth > 4 ? `${p.vibRate.toFixed(1)} HZ ${Math.round(p.vibDepth)} C` : 'NONE'], ['TREMOLO', p.tremDepth > 0.04 ? `${p.tremRate.toFixed(1)} HZ ${Math.round(p.tremDepth * 100)}%` : 'NONE'], ['PITCH BEND IN', `${Math.round(p.drift)} C`],
      ['FORMANTS', p.F.filter(Boolean).join(' / ') || 'NONE'], ['TILT', `${p.tilt.toFixed(1)} DB/OCT`], ['ODD / EVEN', p.oddEven >= 20 ? 'ODD ONLY' : p.oddEven.toFixed(1)],
      ['UPPERS DIE', `${p.hfDecay.toFixed(1)} X FASTER`], ['FLATNESS', p.flatness.toFixed(3)], ['SPREAD', `${Math.round(p.spread)} HZ`],
    ] : [];
    const cols = cw > 640 ? 3 : 2, colW = nw / cols, rowH = 19, maxRows = Math.floor((y + ph - 14 - 150 - ny) / rowH);
    rows.slice(0, maxRows * cols).forEach(([k, v], i) => { const c = i % cols, r = Math.floor(i / cols), xx = nx + c * colW, yy = ny + r * rowH; label(xx, yy, k, C.dim, 1.3); label(xx + colW - 10 - V.textWidth(v, 1.35), yy, v, C.on, 1.35); });
    if (p) label(nx, ny + Math.ceil(Math.min(rows.length, maxRows * cols) / cols) * rowH + 2, ('MEASURED = SOLID.  FORMANTS AND STIFFNESS = ESTIMATED.').slice(0, Math.floor(nw / 7.6)), C.dim, 1.25);
    // my instruments
    const my = S.myInst, myTop = y + ph - 14 - 130;
    V.dotLine(g, nx, nx + nw, myTop - 8, C.off, 4, 1.2);
    label(nx, myTop, `MY INSTRUMENTS (${my.length})`, C.dim); label(nx + nw - V.textWidth('USE THEM IN THE SNES STUDIO', 1.3), myTop, 'USE THEM IN THE SNES STUDIO', C.dim, 1.3);
    if (!my.length) label(nx, myTop + 22, 'NONE YET: SCAN AN INSTRUMENT, TUNE IT, PRESS SAVE.', C.mid, 1.4);
    const per = Math.max(1, Math.floor(nw / 230)), mbw = (nw - (per - 1) * 6) / per;
    my.slice(0, per * 3).forEach((r, i) => {
      const bx = nx + (i % per) * (mbw + 6), by = myTop + 14 + Math.floor(i / per) * 36;
      button('imy' + r.id, bx, by, mbw - 34, 32, r.name, { on: I.loadedMine === r.id, pitch: 1.3, onClick: () => instLoadMine(r), help: `${KIND[r.kind] || ''} / ${r.count || 50} NUMBERS / FROM ${(r.from || 'A SCAN').slice(0, 40)}` });
      button('imyx' + r.id, bx + mbw - 30, by, 30, 32, 'X', { pitch: 1.3, warn: true, onClick: () => openConfirm(`FORGET MY: ${r.name}?`, async () => { S.myInst = await host.instDelete(r.id); if (I.loadedMine === r.id) I.loadedMine = null; }), help: 'FORGET THIS INSTRUMENT (ITS NUMBERS ARE DELETED)' });
    });

    // ---- 3. A/B AND TUNE
    panel(rx, y, rw, ph, '3. A/B AND TUNE', I.bInfo ? `${(I.bInfo.bytes / 1024).toFixed(1)} KB OF BRR` : '');
    const ax = rx + 14, aw = rw - 28; let ay = y + 18;
    const hasA = !!I.src[I.aIdx], b2 = (aw - 6) / 2;
    button('ia', ax, ay, b2, 46, 'A: THE ORIGINAL', { big: true, pitch: 1.5, on: P.shotTag === 'ia', disabled: !hasA, onClick: instPlayA, help: 'PLAY WHAT YOU BROUGHT (KEPT IN MEMORY FOR THIS SESSION ONLY)' });
    button('ib', ax + b2 + 6, ay, b2, 46, 'B: THE REBUILD', { big: true, pitch: 1.5, on: P.shotTag === 'ib', disabled: !p, onClick: () => instBuild(true), help: 'THE SAME NOTE, REBUILT FROM THE NUMBERS AND PLAYED THROUGH THE REAL SNES PATH' });
    ay += 54;
    button('iph', ax, ay, b2, 30, 'B: PLAY A PHRASE', { pitch: 1.3, disabled: !p, onClick: () => instBuild(true, true) });
    button('inext', ax + b2 + 6, ay, b2, 30, I.src.length > 1 ? `A: SAMPLE ${I.aIdx + 1} OF ${I.src.length}` : 'A: ONE SAMPLE', { pitch: 1.3, disabled: I.src.length < 2, onClick: () => { I.aIdx = (I.aIdx + 1) % I.src.length; instPlayA(); }, help: 'STEP THROUGH THE SAMPLES IN THIS FAMILY' });
    ay += 40;
    const showL = P.shotTag === 'ia' ? I.aL : P.shotTag === 'ilib' ? I.libL : I.bL;
    const wh = LO.clamp(ph - 18 - 94 - 18 - 108 - 48 - 52 - 120 - 16, 60, 260);
    wave(showL, ax, ay, aw, wh, ['ia', 'ib', 'ilib'].includes(P.shotTag) ? P.shotFrac() : -1);
    ay += wh + 18;
    label(ax, ay, 'TUNE THE REBUILD', C.dim); ay += 16;
    const tn = I.tune;
    const tsl = (id, lab, k, min, max, fmt) => { slider('it' + id, ax, ay, aw, lab, tn[k], min, max, 1, v => { tn[k] = v; instTuned(); }, { labelW: 104, valueW: 118, disabled: !p, fmt }); ay += 22; };
    const sgn = v => (v > 0 ? '+' : '') + v;
    tsl('br', 'BRIGHTNESS', 'bright', -5, 5, sgn); tsl('at', 'ATTACK', 'attack', -4, 4, v => v ? (v > 0 ? 'SLOWER ' : 'FASTER ') + Math.abs(v) : 'AS MEASURED');
    tsl('de', 'DECAY', 'decay', -4, 4, v => v ? (v > 0 ? 'LONGER ' : 'SHORTER ') + Math.abs(v) : 'AS MEASURED'); tsl('no', 'NOISE', 'noise', 0, 10, v => v === 5 ? 'AS MEASURED' : String(v));
    ay += 4;
    if (I.bInfo) {
      const bi = I.bInfo;
      [`${bi.kind}  /  LOOP AT ${bi.loop}  /  ${bi.len} SAMPLES @ ${Math.round(bi.rate / 1000)} KHZ`, `HARDWARE ADSR  AR ${bi.adsr[0]}  DR ${bi.adsr[1]}  SL ${bi.adsr[2]}  SR ${bi.adsr[3]}`, bi.how]
        .forEach(l => { label(ax, ay, l.slice(0, Math.floor(aw / 7.8)), C.mid, 1.3); ay += 14; });
    }
    ay += 6;
    button('isave', ax, ay, aw, 40, I.loadedMine ? 'SAVE AGAIN (NEW NAME OR SAME)' : 'SAVE AS MY INSTRUMENT', { big: true, pitch: 1.5, disabled: !p, onClick: instSave, help: 'KEEP THE NUMBERS (NEVER THE AUDIO) AS A NEW SNES INSTRUMENT' });
    ay += 52;
    const libTop = Math.max(ay, y + ph - 14 - 112);
    V.dotLine(g, ax, ax + aw, libTop - 8, C.off, 4, 1.2);
    label(ax, libTop, 'HEAR THE BUILT-IN LIBRARY', C.dim); libTop;
    const fams = LO.SNESI.NAMES, lb = (aw - 12) / 3;
    fams.forEach((f, i) => button('ifam' + f, ax + (i % 3) * (lb + 6), libTop + 14 + Math.floor(i / 3) * 31, lb, 28, f, { pitch: 1.25, on: P.shotTag === 'ilib' && I.libPlaying === f, onClick: () => instBuild(true, true, f), help: LO.SNESI.FAM[f].how }));
  }

  // ---------------------------------------------------------------- LIBRARY
  const ROOTS = ['MUSIC', 'SOUND FX', 'CRUNCHED', 'IMPORTED', 'ATMOSPHERICS'];
  function drawLibrary(M, top, W, bottom) {
    const H = bottom - top, y = top + 12, L = S.lib;
    const lw = 300, rw = 340, cx = M + lw + 16, cw = W - M * 2 - lw - rw - 32, rx = W - M - rw;
    panel(M, y, lw, H - 12, 'FOLDERS');
    let iy = y + 18; const ix = M + 14, iw = lw - 28;
    for (const r of ROOTS) { const on = !L.kept && !L.trash && (L.path === r || L.path.startsWith(r + '/')); button('root' + r, ix, iy, iw, 32, r, { on, pitch: 1.5, onClick: () => libOpen(r) }); iy += 37; }
    button('rootKEPT', ix, iy, iw, 32, `KEPT SONGS (${S.keeps.length})`, { on: L.kept, pitch: 1.5, onClick: () => { L.kept = true; L.trash = false; L.sel = null; L.results = null; } }); iy += 37;
    button('rootTRASH', ix, iy, iw, 32, 'TRASH', { on: L.trash, pitch: 1.5, onClick: () => { L.trash = true; L.kept = false; L.sel = null; L.results = null; refreshLib(); } }); iy += 46;
    if (!L.kept && !L.trash) {
      const parts = L.path.split('/');
      label(ix, iy, 'INSIDE ' + parts[parts.length - 1], C.dim); iy += 14;
      if (parts.length > 1) { button('up', ix, iy, iw, 26, '^ UP ONE LEVEL', { pitch: 1.4, onClick: () => libOpen(parts.slice(0, -1).join('/')) }); iy += 30; }
      L.items.filter(i => i.dir).slice(0, Math.max(0, Math.floor((y + H - 12 - iy - 60) / 26))).forEach(d => { button('dir' + d.name, ix, iy, iw, 24, d.name, { pitch: 1.3, onClick: () => libOpen(relJoin(L.path, d.name)) }); iy += 26; });
      button('mkdir', ix, y + H - 12 - 50, iw, 36, '+ NEW FOLDER', { pitch: 1.5, onClick: () => openPrompt('NEW FOLDER NAME', '', async v => { if (v) { await host.libMkdir(L.path, v); refreshLib(); } }) });
    }
    panel(cx, y, cw, H - 12, L.kept ? 'KEPT SONGS' : L.trash ? 'TRASH' : 'LIBRARY / ' + L.path);
    let fy = y + 16;
    if (!L.kept && !L.trash) {
      field('libSearch', cx + 14, fy, cw - 28 - 130, 28, { placeholder: 'SEARCH THE WHOLE LIBRARY, PRESS ENTER', onEnter: async v => { L.results = v ? await host.libSearch(v) : null; L.scroll = 0; } });
      button('import', cx + cw - 14 - 120, fy - 8, 120, 36, 'IMPORT...', { pitch: 1.4, onClick: () => openBrowse('files', 'IMPORT AUDIO FILES', paths => importPaths(paths, L.path)) });
      fy += 40;
      if (L.results) { label(cx + 14, fy - 4, `${L.results.length} FOUND`, C.on, 1.4); button('clrs', cx + 120, fy - 14, 120, 24, 'CLEAR SEARCH', { pitch: 1.2, onClick: () => { L.results = null; S.text.libSearch = ''; } }); fy += 18; }
    }
    let rows;
    if (L.kept) rows = S.keeps.map(k => ({ name: k.title, sub: `${k.chip} / ${k.genre} / ${k.purpose}`, keep: k }));
    else if (L.results) rows = L.results.map(r => ({ name: r.name, sub: r.rel.split('/').slice(0, -1).join(' / '), rel: r.rel, size: r.size }));
    else rows = L.items.filter(i => !i.dir).map(i => ({ name: i.name, rel: L.trash ? null : relJoin(L.path, i.name), size: i.size, trashName: L.trash ? i.name : null }));
    const rh = 22, max = Math.floor((y + H - 12 - fy - 10) / rh);
    L.scroll = LO.clamp(L.scroll, 0, Math.max(0, rows.length - max));
    if (!rows.length) label(cx + 14, fy + 6, L.kept ? 'NO KEPT SONGS YET: PRESS KEEP IN THE MUSIC STUDIO' : L.results ? 'NOTHING MATCHES' : L.trash ? 'THE TRASH IS EMPTY' : 'EMPTY. GENERATE, BUILD, CRUNCH OR IMPORT SOMETHING.', C.dim);
    rows.slice(L.scroll, L.scroll + max).forEach((r, i) => {
      const yy = fy + i * rh, id = 'row' + (L.scroll + i), sel = L.sel && L.sel.name === r.name && L.sel.rel === r.rel, hov = S.hover === id;
      if (sel) V.dotBox(g, cx + 8, yy - 5, cw - 16, rh - 2, C.mid, 3, 1);
      const playingThis = P.shotTag === 'lib' && L.decoded && r.rel && L.decoded.rel === r.rel;
      V.led(g, cx + 18, yy + 5, 2, !!playingThis);
      label(cx + 28, yy, r.name.slice(0, Math.floor((cw - 240) / 9.6)), sel || hov ? C.on : C.mid, 1.5);
      const meta = r.sub || `${r.size ? fmtSize(r.size) : ''}${r.size && r.name.toLowerCase().endsWith('.wav') ? '  ' + fmtTime((r.size - 44) / (SR * 4)) : ''}`;
      label(cx + cw - 14 - V.textWidth(meta.slice(0, 30), 1.3), yy + 1, meta.slice(0, 30), C.dim, 1.3);
      hit(id, cx + 8, yy - 5, cw - 16, rh - 2, () => { L.sel = r; if (r.keep || !r.rel) return; libPlay(r, r.rel); });
    });
    hit('libscroll', cx, fy, cw, Math.max(0, max) * rh, null, { passive: true, wheel: d => { L.scroll += d > 0 ? 3 : -3; } });
    panel(rx, y, rw, H - 12, 'SELECTED');
    let ay = y + 18; const ax = rx + 14, aw = rw - 28;
    const sel = L.sel;
    if (!sel) {
      label(ax, ay, 'CLICK A FILE TO PLAY IT AND', C.mid); label(ax, ay + 14, 'SEE WHAT YOU CAN DO WITH IT.', C.mid);
      label(ax, ay + 40, 'DRAG FILES FROM YOUR DESKTOP', C.dim); label(ax, ay + 54, 'ONTO THIS WINDOW TO IMPORT THEM.', C.dim);
      if (L.trash && L.items.length) button('lempty0', ax, ay + 90, aw, 36, 'EMPTY TRASH FOREVER', { pitch: 1.4, warn: true, onClick: () => openConfirm('DELETE EVERYTHING IN THE TRASH FOREVER?', async () => { const n = await host.libEmptyTrash(); setStatus(`${n} ITEMS DELETED FOREVER`); refreshLib(); }) });
      return;
    }
    V.text(g, sel.name, ax, ay, V.fitPitch(sel.name, aw, 1.8), C.on); ay += 22;
    if (sel.keep) {
      label(ax, ay, sel.sub, C.mid); ay += 24;
      button('kload', ax, ay, aw, 40, 'OPEN IN MUSIC STUDIO', { pitch: 1.5, onClick: () => loadKeep(sel.keep) }); ay += 48;
      button('kdel', ax, ay, aw, 36, 'FORGET THIS KEEP', { pitch: 1.4, warn: true, onClick: () => openConfirm(`FORGET ${sel.name}?`, async () => { S.keeps = await host.keepsDelete(sel.keep.id); L.sel = null; }) });
      return;
    }
    if (L.decoded && L.decoded.rel === sel.rel) { wave(L.decoded.L, ax, ay, aw, 90, P.shotTag === 'lib' ? P.shotFrac() : -1); ay += 100; }
    const act = (id, t, fn, o = {}) => { button(id, ax, ay, aw, 36, t, { pitch: 1.4, onClick: fn, ...o }); ay += 42; };
    if (L.trash) {
      act('lrest', 'RESTORE', async () => { await host.libRestore(sel.trashName); L.sel = null; refreshLib(); setStatus('RESTORED'); });
      act('lempty', 'EMPTY TRASH FOREVER', () => openConfirm('DELETE EVERYTHING IN THE TRASH FOREVER?', async () => { const n = await host.libEmptyTrash(); setStatus(`${n} ITEMS DELETED FOREVER`); L.sel = null; refreshLib(); }), { warn: true });
      return;
    }
    const playingSel = P.shotTag === 'lib';
    act('lplay', playingSel ? '\x02 STOP' : '\x01 PLAY', () => { if (playingSel) P.stopShot(); else libPlay(sel, sel.rel); }, { on: playingSel });
    act('lren', 'RENAME', () => openPrompt('NEW NAME', sel.name.replace(/\.[^.]+$/, '').toUpperCase(), async v => { if (v) { await host.libRename(sel.rel, v); L.sel = null; L.results = null; refreshLib(); } }));
    act('lmove', 'MOVE TO...', () => openMove(async dest => { await host.libMove(sel.rel, dest); L.sel = null; L.results = null; refreshLib(); setStatus('MOVED TO LIBRARY / ' + dest); }));
    act('latm', 'ADD ATMOSPHERICS', () => loadAtmFile(sel.rel, sel.name));
    act('lcr', 'CRUNCH IT', () => { S.crunch.files = [{ lib: sel.rel, rel: sel.name }]; S.crunch.base = 'FROM LIBRARY'; go('CRUNCH'); });
    act('lexp', 'EXPORT TO A DRIVE...', () => openBrowse('folder', 'EXPORT TO WHICH FOLDER?', async dir => { const r = await host.libExport(sel.rel, dir); setStatus(r && !r.error ? 'EXPORTED TO ' + dir : 'EXPORT FAILED (LOGGED)'); }));
    act('ltrash', 'MOVE TO TRASH', async () => { await host.libTrash(sel.rel); L.sel = null; L.results = null; setStatus('MOVED TO TRASH (YOU CAN RESTORE IT)'); refreshLib(); }, { warn: true });
  }

  // ================================================================ modals (all inside the app, no Windows dialogs)
  function openPrompt(title, value, done) { S.text.modalField = value || ''; S.modal = { type: 'prompt', title, done }; S.focus = 'modalField'; }
  function openConfirm(title, yes) { S.modal = { type: 'confirm', title, yes }; }
  async function openBrowse(mode, title, done, list) {
    const roots = await host.fsRoots(); const start = (roots.find(r => r.label === (list === 'inst' ? 'DOWNLOADS' : 'MUSIC')) || roots[0]).path;
    S.modal = { type: 'browse', mode, title, done, roots, sel: new Set(), scroll: 0, items: [], list }; await browseTo(start);
  }
  async function browseTo(p) { const r = await host.fsList(p, S.modal && S.modal.list); if (!S.modal) return; S.modal.path = r.path || p; S.modal.parent = r.parent; S.modal.items = r.items || []; S.modal.err = r.error; S.modal.scroll = 0; S.modal.sel = new Set(); }
  async function openLibPick(title, done) { S.modal = { type: 'libpick', title, done, path: 'MUSIC', scroll: 0, items: [], sel: new Set() }; await libPickTo('MUSIC'); }
  async function libPickTo(p) { const r = await host.libList(p); if (!S.modal) return; S.modal.path = p; S.modal.items = (r && r.items) || []; S.modal.scroll = 0; }
  async function openMove(done) { S.modal = { type: 'move', title: 'MOVE TO WHICH FOLDER?', done, path: 'MUSIC', scroll: 0, items: [], sel: new Set() }; await libPickTo('MUSIC'); }
  function drawModal(W, H) {
    hits = [];
    g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
    hit('modalBlock', 0, 0, W, H, () => {});
    const m = S.modal;
    const small = m.type === 'prompt' || m.type === 'confirm';
    const w = small ? 560 : Math.min(980, W - 120), h = small ? 180 : Math.min(640, H - 120), x = (W - w) / 2, y = (H - h) / 2;
    g.fillStyle = C.panel; g.fillRect(x, y, w, h); panel(x, y, w, h, m.title);
    if (m.type === 'prompt') {
      field('modalField', x + 24, y + 40, w - 48, 36, { pitch: 1.8, onEnter: v => { const d = m.done; S.modal = null; S.focus = null; d(v.trim()); } });
      button('mok', x + w - 24 - 250, y + h - 64, 120, 44, 'OK', { big: true, onClick: () => { const d = m.done, v = (S.text.modalField || '').trim(); S.modal = null; S.focus = null; d(v); } });
      button('mcancel', x + w - 24 - 120, y + h - 64, 120, 44, 'CANCEL', { big: true, onClick: () => { S.modal = null; S.focus = null; } });
      return;
    }
    if (m.type === 'confirm') {
      label(x + 24, y + 50, 'THIS CANNOT BE UNDONE.', C.warn);
      button('myes', x + w - 24 - 250, y + h - 64, 120, 44, 'YES', { big: true, warn: true, onClick: () => { const f = m.yes; S.modal = null; f(); } });
      button('mno', x + w - 24 - 120, y + h - 64, 120, 44, 'NO', { big: true, onClick: () => { S.modal = null; } });
      return;
    }
    const lx = x + 16, lw = 200; let iy = y + 22;
    if (m.type === 'browse') { for (const r of m.roots) { button('mr' + r.label, lx, iy, lw, 30, r.label, { pitch: 1.4, onClick: () => browseTo(r.path) }); iy += 35; } }
    else { for (const r of ROOTS) { button('mr' + r, lx, iy, lw, 30, r, { on: m.path === r || (m.path || '').startsWith(r + '/'), pitch: 1.4, onClick: () => libPickTo(r) }); iy += 35; } }
    const fx = x + lw + 32, fw = w - lw - 48; let fy = y + 22;
    label(fx, fy, (m.path || '').slice(-Math.floor(fw / 9.6)).toUpperCase(), C.on); fy += 18;
    if (m.err) { label(fx, fy, 'CANNOT OPEN THIS FOLDER: ' + m.err, C.warn); fy += 16; }
    button('mup', fx, fy, 140, 28, '^ UP', { pitch: 1.4, onClick: () => { if (m.type === 'browse') browseTo(m.parent); else { const p = (m.path || '').split('/'); if (p.length > 1) libPickTo(p.slice(0, -1).join('/')); } } });
    fy += 36;
    const items = (m.items || []).filter(i => m.type === 'move' || m.mode === 'folder' ? i.dir : true);
    const rh = 22, max = Math.floor((y + h - 80 - fy) / rh);
    m.scroll = LO.clamp(m.scroll, 0, Math.max(0, items.length - max));
    if (!items.length) label(fx + 4, fy, m.type === 'move' || m.mode === 'folder' ? 'NO SUBFOLDERS HERE' : 'NO AUDIO FILES HERE', C.dim);
    const join = (a, b) => m.type === 'browse' ? (/[\\/]$/.test(a) ? a + b : a + (a.includes('\\') ? '\\' : '/') + b) : relJoin(a, b);
    items.slice(m.scroll, m.scroll + max).forEach((it, i) => {
      const yy = fy + i * rh, id = 'mi' + (m.scroll + i), hov = S.hover === id, picked = m.sel.has(it.name);
      if (picked) V.dotBox(g, fx - 4, yy - 5, fw, rh - 2, C.on, 3, 1);
      label(fx + 4, yy, (it.dir ? '[ ] ' : '    ') + it.name.slice(0, Math.floor((fw - 120) / 9.6)), hov || picked ? C.on : (it.dir ? C.mid : C.dim), 1.5);
      if (!it.dir) label(fx + fw - 10 - V.textWidth(fmtSize(it.size), 1.3), yy + 1, fmtSize(it.size), C.dim, 1.3);
      hit(id, fx - 4, yy - 5, fw, rh - 2, () => {
        if (it.dir) { if (m.type === 'browse') browseTo(join(m.path, it.name)); else libPickTo(join(m.path, it.name)); }
        else if (m.type === 'browse' && m.mode === 'files') { if (m.sel.has(it.name)) m.sel.delete(it.name); else m.sel.add(it.name); }
        else if (m.type === 'libpick') { const d = m.done, rel = join(m.path, it.name); S.modal = null; d(rel, it.name); }
      });
    });
    hit('mscroll', fx, fy, fw, Math.max(0, max) * rh, null, { passive: true, wheel: d => { m.scroll += d > 0 ? 3 : -3; } });
    const by = y + h - 60;
    let okText = null;
    if (m.type === 'browse' && m.mode === 'folder') okText = 'USE THIS FOLDER';
    if (m.type === 'browse' && m.mode === 'files') okText = m.sel.size ? `USE ${m.sel.size} FILE${m.sel.size === 1 ? '' : 'S'}` : 'CLICK FILES TO PICK';
    if (m.type === 'move') okText = 'MOVE HERE';
    if (m.type === 'browse' && m.mode === 'files') button('mall', x + w - 24 - 530, by, 190, 44, 'PICK ALL HERE', { big: true, pitch: 1.5, onClick: () => { for (const it of items) if (!it.dir) m.sel.add(it.name); } });
    if (okText) button('mok', x + w - 24 - 330, by, 190, 44, okText, { big: true, pitch: 1.5, disabled: m.mode === 'files' && !m.sel.size, onClick: () => {
      const d = m.done;
      const out = m.type === 'move' || m.mode === 'folder' ? m.path : [...m.sel].map(n => join(m.path, n));
      S.modal = null; d(out);
    } });
    button('mcancel', x + w - 24 - 130, by, 130, 44, 'CANCEL', { big: true, pitch: 1.5, onClick: () => { S.modal = null; } });
  }

  // ================================================================ input
  function at(x, y, passive) { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && (passive || !h.passive)) return h; } return null; }
  canvas.addEventListener('mousemove', e => { S.mouse = { x: e.offsetX, y: e.offsetY }; if (S.drag && S.drag.drag) S.drag.drag(e.offsetX, e.offsetY); const h = at(e.offsetX, e.offsetY); S.hover = h ? h.id : null; });
  canvas.addEventListener('mousedown', e => {
    const h = at(e.offsetX, e.offsetY);
    if (!h) { S.focus = null; return; }
    if (!h.field && h.id !== 'seed' && h.id !== 'sfxText' && h.id !== 'modalBlock') S.focus = null;
    if (e.button === 2 && h.right) { h.right(); return; }
    if (h.drag) { S.drag = h; h.drag(e.offsetX, e.offsetY); return; }
    if (h.click) { h.click(e.offsetX, e.offsetY); return; }
    if (h.fn) h.fn();
  });
  window.addEventListener('mouseup', () => { S.drag = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { const h = at(e.offsetX, e.offsetY, true); if (h && h.wheel) { h.wheel(e.deltaY); e.preventDefault(); } }, { passive: false });
  window.addEventListener('keydown', e => {
    const f = S.focus;
    if (f === 'seed') {
      if (/^[0-9]$/.test(e.key) && S.seedText.length < 10) S.seedText += e.key;
      else if (e.key === 'Backspace') S.seedText = S.seedText.slice(0, -1);
      else if (e.key === 'Enter') { const v = parseInt(S.seedText, 10); S.focus = null; if (v >= 0 && v <= 4294967295) { S.seed = v >>> 0; S.lockSeed = true; generate({ keepSeed: true }); } }
      else if (e.key === 'Escape') S.focus = null;
      e.preventDefault(); return;
    }
    if (f === 'sfxText') {
      if (e.key === 'Enter') { applySfxText(); S.focus = null; makeSfx(false); }
      else if (e.key === 'Escape') S.focus = null;
      else if (e.key === 'Backspace') { S.sfx.text = S.sfx.text.slice(0, -1); applySfxText(); }
      else if (e.key.length === 1 && /[a-zA-Z0-9 \-]/.test(e.key) && S.sfx.text.length < 64) { S.sfx.text += e.key.toUpperCase(); applySfxText(); }
      e.preventDefault(); return;
    }
    if (f) {
      const hf = hits.find(h => h.id === f); const opt = (hf && hf.field) || {};
      let v = S.text[f] || '';
      if (e.key === 'Enter') { if (opt.onEnter) opt.onEnter(v); if (S.focus === f) S.focus = null; }
      else if (e.key === 'Escape') { S.focus = null; if (S.modal) S.modal = null; }
      else if (e.key === 'Backspace') v = v.slice(0, -1);
      else if (e.key.length === 1 && /[a-zA-Z0-9 \-_().,!']/.test(e.key) && v.length < 60) v += e.key.toUpperCase();
      S.text[f] = v; e.preventDefault(); return;
    }
    if (S.modal) { if (e.key === 'Escape') S.modal = null; return; }
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (S.tab === 'HOME' || S.tab === 'STYLES' || S.tab === 'MIND' || S.tab === 'MAKE') { if (S.song) { if (P.playing) P.stop(); else P.play(); } else if (S.tab === 'HOME' || S.tab === 'MAKE') makeGenerate(); else generateStyle(); }
      else if (S.tab === 'SOUND FX') { if (S.sfx.L) P.oneShot(S.sfx.L, S.sfx.R, 'sfx'); }
      else if (S.tab === 'ATMOSPHERICS') atmPlay();
      else if (S.tab === 'MUSIC') { if (S.song) { if (P.playing) P.stop(); else P.play(); } else generate(); }
      else if (P.shot) P.stopShot();
    } else if (k === 'g') { if (S.tab === 'HOME' || S.tab === 'MAKE') makeGenerate(); else if (S.tab === 'STYLES') generateStyle(); else if (S.tab === 'MIND') generate({ extra: S.lastExtra ? { ...S.lastExtra } : {} }); else if (S.tab === 'MUSIC') generate(); else if (S.tab === 'SOUND FX') makeSfx(false); }
    else if (k === 'r') { if (S.tab === 'HOME' || S.tab === 'MAKE') makeSurprise(); else if (S.tab === 'MUSIC') surpriseMe(); else if (S.tab === 'SOUND FX') makeSfx(true); }
    else if (S.tab === 'INSTRUMENTS' && k === 'a') instPlayA();
    else if (S.tab === 'INSTRUMENTS' && k === 'b') instBuild(true);
    else if (k === 'k') keep();
    else if (k === 'w') startReplay();
    else if (k === 'e') { if (S.tab === 'MUSIC') exportWav(); }
  });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('drop', async e => {
    e.preventDefault();
    const paths = [...(e.dataTransfer.files || [])].map(f => host.pathFor(f)).filter(Boolean);
    if (!paths.length) return;
    BB.log('UI', 'DROP', { n: paths.length, tab: S.tab });
    if (S.tab === 'INSTRUMENTS') { const sf = paths.find(q => /\.sf2$/i.test(q)); if (sf) instOpenSf2(sf); else instAddWavs(paths); return; }
    if (S.tab === 'CRUNCH') {
      if (paths.length === 1) { const r = await host.fsWalk(paths[0], S.crunch.recursive); if (r && r.files && r.files.length) { S.crunch.files = r.files; S.crunch.base = r.base; setStatus(`${r.files.length} FILES QUEUED FROM ${r.base}`); return; } }
      S.crunch.files = paths.map(p => ({ abs: p, rel: p.split(/[\\/]/).pop() })); S.crunch.base = 'SINGLES'; setStatus(`${paths.length} FILES QUEUED`);
    } else { if (S.tab !== 'HOME') go('LIBRARY'); await importPaths(paths, 'IMPORTED'); }
  });

  // ================================================================ loop
  function resize() { V.dpr = window.devicePixelRatio || 1; V.cache.clear(); canvas.width = Math.floor(canvas.clientWidth * V.dpr); canvas.height = Math.floor(canvas.clientHeight * V.dpr); }
  window.addEventListener('resize', resize); resize();
  let lastFrame = performance.now();
  function frame() { const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now; try { mindTick(now, dt); draw(); } catch (e) { BB.error('DRAW', e); } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  host.keepsList().then(k => { S.keeps = k || []; }).catch(() => {});
  if (host.histList) host.histList().then(h => { S.hist = Array.isArray(h) ? h.slice(-200) : []; }).catch(() => {});
  if (host.instList) host.instList().then(k => { S.myInst = Array.isArray(k) ? k : []; }).catch(() => {});
  if (host.bpList) host.bpList().then(b => { S.myBps = Array.isArray(b) ? b : []; }).catch(() => {});
  refreshLib();
  BB.log('UI', 'READY', { w: canvas.clientWidth, h: canvas.clientHeight, dpr: V.dpr, version: LO.VERSION });
  window.__LO = { S, generate, surpriseMe, makeSfx, P, exportWav, exportStems, exportLoop, keep, referenceTake, loadAtmFile, libOpen, refreshLib, runCrunch, crunchAddFolder, openBrowse, moreLikeThis, startReplay, makeGenerate, makeSurprise, mkSetChip, go, generateStyle, homeGenerate, homeSurprise, pickStyle, effBp, trySceneSound, sceneRandom, saveSceneSound, instAddWavs, instOpenSf2, instPickSf2, instScan, instBuild, instPlayA, instLoadMine };
})();
