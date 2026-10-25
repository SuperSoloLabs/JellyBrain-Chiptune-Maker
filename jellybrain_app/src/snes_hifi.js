/* LowOrbit Chip Studio - SNES HI-DETAIL instrument library (v0.6.1)
   Each instrument is a set of measured numbers, never a recording: the attack is a list of harmonic
   partials (a complex amplitude for every harmonic, every few milliseconds) plus a shaped-noise layer for
   the breath, scrape or hammer that is not a harmonic, and the loop is the exact Fourier series of one loop
   (every partial's level and phase). From those numbers the sound is rebuilt here with additive synthesis,
   on 16-sample BRR blocks, at the rate the 64 KB budget allows. The numbers come from Tom's own SoundFonts
   (tools/sflib.js); the .sf2 files themselves are never shipped and no game names are used. */
(function (G) {
  const LO = G.LO;
  const TAU = Math.PI * 2;
  const DATA = G.LO_SNES_LIB || [];

  // base64 -> Int16Array (little endian)
  function i16(b64) {
    if (!b64) return new Int16Array(0);
    let bin;
    if (typeof atob === 'function') bin = atob(b64); else bin = Buffer.from(b64, 'base64').toString('binary');
    const n = bin.length >> 1, o = new Int16Array(n);
    for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); o[i] = v > 32767 ? v - 65536 : v; }
    return o;
  }
  function noiser(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; }; }
  const r16 = x => Math.max(16, Math.round(x / 16) * 16);
  // equivalent noise bandwidth of the RBJ band-pass (constant 0 dB peak) used for the noise layer
  const BQ_Q = 1.2;
  const enbw = fc => Math.PI / 2 * fc / BQ_Q;

  const decoded = new Map();
  function decode(p) {
    if (decoded.has(p.id)) return decoded.get(p.id);
    const d = { C: i16(p.C), N: i16(p.N), LB: i16(p.LB) };
    decoded.set(p.id, d); return d;
  }

  // rebuild one instrument. q: 0 best, 1 shorter attack, 2 half rate, 3 both (the 64 KB budget decides)
  // v0.7.2 true pitch: SoundFont root keys were often an octave or two off the sound itself. Measured with YIN
  // (harmonic sounds) or the principal partial (mallets, timpani); multiplies the playback base only (SOLID).
  const TUNE = {"PIANO":0.5,"PIANO 2":0.5,"HARPSICHORD 2":2,"CELESTA":2.00306,"GLOCK":12.00153,"GLOCK 2":2,"E.GUITAR":0.5,"E.GUITAR 2":2,"BASS":0.25198,"BASS 2":0.25,"SLAP BASS":0.25,"TIMPANI":0.50076,"STRINGS 2":2,"CHOIR 2":2,"BRASS 2":2,"UPRIGHT BASS":0.5,"BRASS 3":2,"OBOE 2":1.00745,"FLUTE 3":2,"HORN 2":2,"STRINGS 4":2.02364,"TIMPANI 2":1.01515,"BASS 3":0.5,"BASS 4":0.5,"STRINGS 5":2,"ROCK ORGAN":2,"GLOCK 3":4,"TIMPANI 3":0.51448,"PAD":0.50317,"BASS 5":0.25};
  // v0.7.2 pre-emphasis: the hardware Gaussian dulls a sample's top end (about -9 dB near its Nyquist). Measured from the
  // real 512-entry table, averaged over the fraction; boosting each partial by the inverse puts the brightness back (SOLID).
  let GH = null;
  function gaussTable() {   // the same published generator as snes_dsp.js (Chip Studio does not load the exact DSP)
    const c = new Float64Array(1024), fs = 0.16 / 256;
    for (let i = 0; i < 512; i++) { const k = 0.5 + i, ck = Math.sin(TAU * k * fs) / k, wk = 0.42 + 0.5 * Math.cos(TAU * k / 1023) + 0.08 * Math.cos(2 * TAU * k / 1023); c[512 + i] = c[511 - i] = ck * wk; }
    let sm = 0; for (const v of c) sm += v; const g = 2048 * 256 / sm, t = new Int32Array(512); for (let i = 0; i < 512; i++) t[i] = Math.floor(0.5 + c[512 + i] * g); return t.reverse();
  }
  function gaussGain(nu) {
    if (!GH) { const GT = (LO.SNESX && LO.SNESX.GT) || gaussTable(); GH = new Float64Array(257);
      for (let b = 0; b <= 256; b++) { const v = b / 512; let m = 0;
        for (let x = 0; x < 256; x += 8) { const g = GT ? [GT[255 - x], GT[511 - x], GT[256 + x], GT[x]] : [0, 1, 0, 0]; let re = 0, im = 0, sm = 0; for (let j = 0; j < 4; j++) { re += g[j] * Math.cos(TAU * v * j); im += g[j] * Math.sin(TAU * v * j); sm += g[j]; } m += Math.hypot(re, im) / sm; }
        GH[b] = m / 32; } }
    const b = Math.max(0, Math.min(256, Math.round(nu * 512))); return Math.min(2.8, 1 / Math.max(0.05, GH[b]));
  }
  // o: { v2: true pitch + pre-emphasis (lib 2 songs), div: 2^k rate divisor so high notes stay under the pitch ceiling }
  function synth(p, q, o) {
    q = q || 0; o = o || {};
    const D = decode(p), PE = o.v2 ? gaussGain : () => 1;
    let R = Math.min(32000, p.sr);
    if (q >= 2) R = Math.max(8000, Math.round(R / 2));
    const up = o.div > 1 ? o.div : 1;   // re-pitch: rebuild the sound 'up' octaves higher at the full rate (attack time kept)
    const atkF = (q === 1 || q === 3) ? 0.6 : 1;
    const Ldur = p.L ? p.L / p.sr / up : 0, Adur0 = p.A / p.sr;
    // keep the loop on whole BRR blocks: the loop sets the time scale s (pitch is corrected in baseF)
    let s = 1, Lt = 0;
    if (Ldur) { Lt = r16(Ldur * R); s = Lt / (Ldur * R); }
    let Adur = Adur0;
    // a held sound can lose part of its attack and still sound right; a plucked one keeps its whole strike
    if (atkF < 1 && p.kind === 'SUSTAIN' && Ldur) Adur = Math.max(0.02, Adur0 * atkF);
    const At = Adur > 0 ? r16(Adur * R * s) : 0;
    const out = new Float32Array(At + Lt);
    const tOf = i => i / (R * s);                      // the original time of output sample i
    // ---- the loop: the exact Fourier series of one loop
    const loopAt = new Float32Array(Lt);
    if (Lt) {
      const LB = D.LB, sc = p.lS;
      for (let b = 0; b + 2 < LB.length; b += 3) {
        const j = LB[b]; if (j <= 0 || j * 2 >= Lt) continue;  // above the new Nyquist: dropped
        const pe = PE(j / Lt), re = LB[b + 1] * sc * pe, im = LB[b + 2] * sc * pe, w = TAU * j / Lt;
        // rotate with a recurrence (fast, exact enough for a few thousand samples, re-anchored every 256)
        for (let i0 = 0; i0 < Lt; i0 += 256) {
          let c = Math.cos(w * i0), sn = Math.sin(w * i0); const cw = Math.cos(w), sw = Math.sin(w);
          const e = Math.min(Lt, i0 + 256);
          for (let i = i0; i < e; i++) { loopAt[i] += re * c - im * sn; const c2 = c * cw - sn * sw; sn = sn * cw + c * sw; c = c2; }
        }
      }
      out.set(loopAt, At);
    }
    // ---- the attack: harmonic partials with measured complex envelopes, plus the noise layer
    if (At) {
      const K = p.K, F = p.F, hop = p.hop, C = D.C, sc = p.cS, ny = R * 0.47;
      for (let k = 1; k <= K; k++) {
        const fk = (p.FR ? p.FR[k - 1] : k * p.f0) * up; if (fk / s >= ny) { if (p.FR) continue; break; }
        const w = TAU * fk, pe = PE(fk / s / R);
        for (let i = 0; i < At; i++) {
          const t = tOf(i), x = t / hop; let f = Math.floor(x); let u = x - f;
          if (f >= F - 1) { f = F - 2; u = 1; } if (f < 0) { f = 0; u = 0; }
          const a = ((f * K) + (k - 1)) * 2, b = (((f + 1) * K) + (k - 1)) * 2;
          const re = (C[a] * (1 - u) + C[b] * u) * sc * pe, im = (C[a + 1] * (1 - u) + C[b + 1] * u) * sc * pe;
          if (re === 0 && im === 0) continue;
          out[i] += re * Math.cos(w * t) - im * Math.sin(w * t);
        }
      }
      if (p.NB && p.NB.length && D.N.length) {
        const nz = noiser(p.seed || 77), NB = p.NB, nb = NB.length;
        const bp = NB.map(fc => fc < R * 0.45 ? new LO.Biquad('bp', fc, BQ_Q, R) : null);
        const norm = NB.map(fc => PE(fc / R) / Math.sqrt(Math.max(1e-9, enbw(fc) / (R / 2))));
        for (let i = 0; i < At; i++) {
          const t = tOf(i), x = t / hop; let f = Math.floor(x), u = x - f;
          if (f >= F - 1) { f = F - 2; u = 1; } if (f < 0) { f = 0; u = 0; }
          const w0 = nz();
          for (let j = 0; j < nb; j++) {
            if (!bp[j]) continue;
            const g0 = D.N[f * nb + j], g1 = D.N[(f + 1) * nb + j];
            const g = Math.pow(10, ((g0 * (1 - u) + g1 * u) / 100) / 20);
            if (g < 1e-5) { bp[j].run(w0); continue; }
            out[i] += bp[j].run(w0) * g * norm[j] * p.nS;
          }
        }
      }
      // the seam: fade the attack's last moments into the loop (read backwards around the loop)
      if (Lt) {
        const X = Math.min(96, Math.floor(At / 3), Lt * 2);
        for (let n = 0; n < X; n++) {
          const i = At - X + n, w = 0.5 - 0.5 * Math.cos(Math.PI * (n + 0.5) / X);
          const li = ((i - At) % Lt + Lt) % Lt;
          out[i] = out[i] * (1 - w) + loopAt[li] * w;
        }
      }
    }
    return { data: out, loop: Lt ? At : null, baseF: p.f0 * up / s * (o.v2 ? TUNE[p.id] || p.tn || 1 : 1), rate: R };
  }

  // v0.7 (Jelly Brain): the player's own SoundFont instruments play directly (their own samples on 16-sample blocks)
  function userInst(name, q, o) {
    const u = LO.SNESI_USER[name]; let d = u;
    if (o && o.div > 1) d = decim(u, o.div);
    if (q >= 2 && u.rate > 16000 && u.loop != null && (u.data.length - u.loop) % 32 === 0 && u.loop % 32 === 0) { const h = new Float32Array(u.data.length / 2); for (let i = 0; i < h.length; i++) h[i] = 0.5 * (u.data[2 * i] + u.data[2 * i + 1]); d = { ...u, data: h, loop: u.loop / 2, rate: u.rate / 2 }; }
    return { data: d.data, loop: d.loop, baseF: d.baseF, rate: d.rate, adsr: u.adsr.slice(), vib: u.vib, how: 'YOUR SOUNDFONT: ' + u.src, kind: u.kind, name };
  }
  const cache = new Map();
  const LIB = {};
  for (const p of DATA) LIB[p.id] = p;
  // a played sample decimated by 2^k (windowed-sinc low-pass first), loop kept on 16-sample blocks when it can be
  function decim(u, div) {
    let d = u;
    for (let k = div; k > 1 && d.rate > 4000; k >>= 1) {
      const x = d.data, n = Math.floor(x.length / 2), y = new Float32Array(n), H = 16;
      for (let i = 0; i < n; i++) { let a = 0, ws = 0; for (let j = -H; j <= H; j++) { let t = 2 * i + j; if (t < 0) continue; if (t >= x.length) { if (d.loop == null) continue; t = d.loop + (t - d.loop) % (x.length - d.loop); }
        const v = j === 0 ? 0.5 : Math.sin(Math.PI * j / 2) / (Math.PI * j), w = 0.5 + 0.5 * Math.cos(Math.PI * j / (H + 1)); a += x[t] * v * w; ws += v * w; } y[i] = a / ws; }
      let loop = d.loop == null ? null : Math.floor(d.loop / 2); if (loop != null) loop -= loop % 16;
      d = { ...d, data: y, loop, rate: d.rate / 2 };
    }
    return d;
  }
  function build(name, q, o) {
    const p = LIB[name]; if (!p) return null; o = o || {};
    const key = name + '|' + q + '|' + (o.v2 ? 2 : 1) + '|' + (o.div || 1);
    if (!cache.has(key)) cache.set(key, synth(p, q, o));
    const s = cache.get(key);
    return { ...s, adsr: p.adsr.slice(), vib: !!p.vib, how: `HI-DETAIL REBUILD: ${p.K} ${p.FR ? 'MEASURED' : 'HARMONIC'} PARTIALS + LOOP SERIES, ${p.fid}% MATCH`, kind: p.kind, name, fid: p.fid };
  }
  // ---- v0.6.1 picks: the right instruments for this song, from the tags, varied by the seed
  const FAMS = { BRASS: ['BRASS', 'HORN'], HORN: ['HORN', 'BRASS'], HARP: ['HARP'], STRINGS: ['STRINGS'], FLUTE: ['FLUTE', 'OBOE'], OBOE: ['OBOE', 'FLUTE'],
    GUITAR: ['GUITAR'], CHOIR: ['CHOIR'], ORGAN: ['ORGAN'], BELLS: ['GLOCK', 'CELESTA', 'VIBES'], MARIMBA: ['MARIMBA', 'VIBES'], SAX: ['SAX'], PIANO: ['PIANO'], PAD: ['PAD', 'STRINGS'] };
  const COUNTER_OF = { FLUTE: ['HARP', 'PIZZ', 'GUITAR'], OBOE: ['HARP', 'PIANO'], HARP: ['FLUTE', 'OBOE'], BRASS: ['STRINGS', 'HARP'], HORN: ['HARP', 'STRINGS'], STRINGS: ['HARP', 'HORN'],
    GLOCK: ['MARIMBA', 'HARP'], CELESTA: ['HARP', 'FLUTE'], VIBES: ['MARIMBA', 'HARP'], MARIMBA: ['FLUTE', 'VIBES'], GUITAR: ['FLUTE', 'PIANO', 'ORGAN'], CHOIR: ['HARP'], ORGAN: ['GUITAR', 'HARPSI'],
    SAX: ['PIANO', 'GUITAR', 'VIBES'], PIANO: ['STRINGS', 'FLUTE'], PAD: ['HARP', 'CELESTA'] };
  const WORDS = { TITLE: ['theme', 'title', 'heroic'], OVERWORLD: ['world map', 'field', 'heroic'], TOWN: ['town', 'calm'], DUNGEON: ['dungeon', 'dark', 'spooky'], BATTLE: ['battle', 'tense'], BOSS: ['boss', 'epic', 'dark'],
    CHASE: ['chase', 'tense'], STEALTH: ['stealth', 'mystery'], CUTSCENE: ['sad', 'romance'], VICTORY: ['victory', 'bright'], 'GAME OVER': ['sad', 'dark'], MENU: ['menu', 'calm'], CREDITS: ['credits', 'epilogue', 'warm'],
    overworldJourney: ['world map', 'heroic'], townMorning: ['town', 'bright'], sorrowfulTheme: ['sad'], finalBattle: ['final boss', 'boss', 'epic'], ancientCastle: ['castle', 'temple', 'dark'], nightField: ['field', 'peaceful', 'calm'], airship: ['heroic', 'playful'], mode7Racer: ['racing', 'tense'] };
  // v0.7.2: never auto-picked for new songs (the audit found them out of tune across the range, or clicking at the loop);
  // still playable, so older saves replay exactly
  const PULL = new Set(['PIZZICATO', 'SITAR', 'LEAD GUITAR', 'BRASS', 'E.GUITAR', 'GLOCK 3', 'ORGAN 2', 'GLOCK 2']);
  function familyOf(name) { const S = LO.SNESI; const u = LO.SNESI_USER && LO.SNESI_USER[name]; if (u) return u.tags.family; const t = S.TAGS && S.TAGS[name]; if (t && t.family) return t.family; return { BELLS: 'GLOCK' }[name] || name; }
  function autoPick(song, prev) {
    const S = LO.SNESI, m = song.meta, R = LO.rng((song.seed ^ 0x1A57 ^ 0x61) >>> 0);
    const words = new Set([...(WORDS[m.purpose] || []), ...(m.blueprint ? WORDS[m.blueprint.id] || [] : [])]);
    const dark = ['minor', 'phrygian'].includes(m.mode); words.add(dark ? 'dark' : 'bright');
    if (m.intense >= 6) words.add('tense'); if (m.intense <= 3) words.add('calm'); if (m.heroic >= 6) words.add('heroic');
    const v2 = (m.lib || 0) >= 2, v3 = (m.lib || 0) >= 3, ok = n => !(v2 && PULL.has(n)) && (v3 || !(LIB[n] && LIB[n].v >= 3));   // v0.7.3: the new remasters only for lib-3 songs, so older songs pick exactly what they picked
    const pool = S.NAMES.filter(n => ok(n) && (!LIB[n] || LIB[n].fid >= 90)), loose = S.NAMES.filter(n => ok(n) && (!LIB[n] || LIB[n].fid >= 80));
    const USER = (LO.SNESI_USER && Object.keys(LO.SNESI_USER)) || [];   // the player's own SoundFont instruments
    const score = (n, fams) => {
      const f = familyOf(n); if (!fams.includes(f)) return -1;
      const t = S.TAGS[n] || (LO.SNESI_USER && LO.SNESI_USER[n] && LO.SNESI_USER[n].tags) || {}; let sc = (fams.length - fams.indexOf(f)) * 0.4 + (LIB[n] ? 1.2 : 0) + (USER.includes(n) ? 1.6 : 0);
      for (const w of [...(t.moods || []), ...(t.genres || [])]) if (words.has(w)) sc += 0.6;
      if (t.tone === 'bright' && dark) sc -= 0.4; if (t.tone === 'dark' && !dark) sc -= 0.3;
      return sc + R.range(0, 0.9);
    };
    const best = (fams, not, ls) => { let b = null, bs = -1; for (const n of (ls ? loose : pool).concat(USER)) { if (not && not.includes(n)) continue; const sc = score(n, fams); if (sc > bs) { bs = sc; b = n; } } return b; };
    const bp = m.snes || {};
    const lt = m.leadTimbre, pt = m.padTimbre;
    const leadF = bp.lead ? FAMS[bp.lead] || [bp.lead] : ({ pulse: ['FLUTE', 'OBOE', 'HARP'], saw: ['BRASS', 'STRINGS', 'GUITAR'], sax: ['SAX', 'FLUTE', 'OBOE'], bell: ['GLOCK', 'CELESTA', 'VIBES', 'MARIMBA'], brass: ['BRASS', 'HORN'] }[lt] || ['FLUTE']);
    const lead = best(leadF, null, !!bp.lead) || 'FLUTE';
    const lf = familyOf(lead);
    const counterF = bp.counter ? FAMS[bp.counter] || [bp.counter] : (COUNTER_OF[lf] || ['HARP']);
    const counter = best(counterF, [lead], !!bp.counter) || 'HARP';
    const padF = bp.pad ? FAMS[bp.pad] || [bp.pad] : ({ strings: ['STRINGS'], saw: ['STRINGS', 'CHOIR', 'PAD'], rhodes: ['EPIANO', 'ORGAN'], none: ['STRINGS'] }[pt] || ['STRINGS']);
    const pad = best(padF, [lead, counter], !!bp.pad) || 'STRINGS';
    const bass = best(['BASS']) || 'CLASSIC';
    const timp = m.orch && m.orch.perc && m.orch.perc.timp ? best(['TIMPANI']) || 'CLASSIC' : 'CLASSIC';
    return { lead, counter, pad, bass, timp };
  }
  // YIN pitch (no hint, octave-true): [Hz, aperiodicity 0 = perfectly periodic]. Used to check imported SoundFonts' root keys.
  function yin(x, rate) {
    const W = Math.min(2048, x.length >> 1), tmax = Math.min(Math.floor(rate / 22), x.length - W - 1), tmin = Math.max(2, Math.floor(rate / 2500));
    if (tmax <= tmin + 2) return [0, 1];
    const d = new Float64Array(tmax + 1); for (let t = 1; t <= tmax; t++) { let a = 0; for (let i = 0; i < W; i++) { const v = x[i] - x[i + t]; a += v * v; } d[t] = a; }
    const c = new Float64Array(tmax + 1); c[0] = 1; let run = 0; for (let t = 1; t <= tmax; t++) { run += d[t]; c[t] = d[t] * t / (run || 1); }
    let tau = -1; for (let t = tmin; t < tmax; t++) if (c[t] < 0.12) { while (t + 1 < tmax && c[t + 1] < c[t]) t++; tau = t; break; }
    if (tau < 0) { let m = 1e9; for (let t = tmin; t < tmax; t++) if (c[t] < m) { m = c[t]; tau = t; } }
    const a = c[tau - 1], b = c[tau], g = c[tau + 1], pp = (a - 2 * b + g) ? 0.5 * (a - g) / (a - 2 * b + g) : 0;
    return [rate / (tau + pp), c[tau]];
  }
  LO.SNESI_HIFI = { yin, PULL, synth, build, decim, gaussGain, TUNE, LIB, NAMES: DATA.map(p => p.id), decode, autoPick, familyOf };
  // plug into the instrument library so every picker, the 64 KB trimmer and Instrument Scan see them
  if (LO.SNESI) {
    const S = LO.SNESI, fam0 = S.family;
    S.family = (name, q, o) => LIB[name] ? build(name, q, o) : (LO.SNESI_USER && LO.SNESI_USER[name]) ? userInst(name, q, o) : (o && o.div > 1 && fam0(name, q)) ? decim(fam0(name, q), o.div) : fam0(name, q);
    for (const p of DATA) { if (!S.NAMES.includes(p.id)) S.NAMES.push(p.id); if (!S.OPTIONS.includes(p.id)) S.OPTIONS.push(p.id); }
    S.TAGS = {};
    for (const [n, f] of Object.entries(S.FAM)) S.TAGS[n] = f.tags || null;
    for (const p of DATA) S.TAGS[p.id] = p.tags;
  }
})(typeof self !== 'undefined' ? self : globalThis);
