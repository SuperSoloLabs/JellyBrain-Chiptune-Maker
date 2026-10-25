/* LowOrbit Chip Studio - v0.7.3 THE BENCHMARK: the same 16 measurements run on real game music (a research corpus of
   game-music transcriptions, statistics only) and on our songs, so "great" is a number, not an opinion.
   Input: notes [start s, end s, midi pitch, velocity] (no drums), beats (seconds), beats per bar.
   The melody is the skyline (the top note at each onset) and the bass the lowline, for the corpus and for us alike. */
(function (G) {
  const LO = G.LO;
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const corr = (a, b) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db + 1e-12); };
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
  const entropy = c => { const t = c.reduce((a, b) => a + b, 0) || 1; let h = 0; for (const v of c) if (v) { const p = v / t; h -= p * Math.log2(p); } return h; };

  function metrics(notesIn, beats, bpb, maxBeats) {
    bpb = bpb || 4; maxBeats = maxBeats || 96;
    if (!beats || beats.length < 8) return null;
    const B = beats.slice(0, maxBeats + 1), tEnd = B[B.length - 1];
    const notes = notesIn.filter(n => n[0] < tEnd).sort((a, b) => a[0] - b[0] || b[2] - a[2]);
    if (notes.length < 24) return null;
    const dur = Math.max(1, tEnd - B[0]), spb = (B[B.length - 1] - B[0]) / (B.length - 1);
    const beatPos = t => { let i = 0, j = B.length - 1; if (t <= B[0]) return (t - B[0]) / spb; if (t >= B[j]) return j + (t - B[j]) / spb; while (j - i > 1) { const k = (i + j) >> 1; if (B[k] <= t) i = k; else j = k; } return i + (t - B[i]) / (B[j] - B[i]); };
    // onset clusters (notes starting within 30 ms are one onset)
    const ons = []; for (const n of notes) { const o = ons[ons.length - 1]; if (o && n[0] - o.t < 0.03) o.n.push(n); else ons.push({ t: n[0], n: [n] }); }
    // the melody is what a listener hears on top: an onset counts only if nothing higher is still sounding over it
    const sky = []; { let j0 = 0; for (const o of ons) { let top = o.n[0]; for (const n of o.n) if (n[2] > top[2]) top = n; let held = false;
      while (j0 < notes.length && notes[j0][1] <= o.t) j0++;
      for (let j = 0; j < notes.length && notes[j][0] < o.t - 0.03; j++) if (notes[j][1] > o.t + 0.03 && notes[j][2] > top[2]) { held = true; break; }
      if (!held) sky.push(top); } }
    const low = ons.map(o => { let lo = o.n[0]; for (const n of o.n) if (n[2] < lo[2]) lo = n; return lo; }).filter(n => n[2] < 57);
    const M = {};
    M.onsetRate = notes.length / dur;   // every note, all voices: how busy the whole texture is
    M.melNps = sky.length / dur;
    { const skyS = new Set(sky); M.accMotion = ons.filter(o => o.n.some(n => !skyS.has(n))).length / dur; }
    M.bassMotion = low.length / dur;
    // how many notes sound at once (sampled every 50 ms)
    { let s = 0, c = 0; for (let t = B[0]; t < tEnd; t += 0.05) { let k = 0; for (const n of notes) { if (n[0] > t) break; if (n[1] > t) k++; } s += k; c++; } M.poly = s / Math.max(1, c); }
    const mp = sky.map(n => n[2]); M.melRange = pct(mp, 0.95) - pct(mp, 0.05);
    const iv = []; for (let i = 1; i < sky.length; i++) iv.push(sky[i][2] - sky[i - 1][2]);
    const ai = iv.map(Math.abs); M.stepFrac = ai.filter(x => x >= 1 && x <= 2).length / Math.max(1, ai.length); M.leapFrac = ai.filter(x => x >= 5).length / Math.max(1, ai.length); M.repFrac = ai.filter(x => x === 0).length / Math.max(1, ai.length);
    // rhythm: how varied the melody's note lengths are (in sixteenths), and how much it lands off the beat
    { const c = new Array(17).fill(0); for (let i = 1; i < sky.length; i++) { const q = Math.round((beatPos(sky[i][0]) - beatPos(sky[i - 1][0])) * 4); if (q >= 1) c[Math.min(16, q)]++; } M.rhythmEntropy = entropy(c); }
    { let s = 0; for (const n of sky) { const f = ((beatPos(n[0]) % 1) + 1) % 1, on = f < 0.07 || f > 0.93, eighth = Math.abs(f - 0.5) < 0.07; s += on ? 0 : eighth ? 0.5 : 1; } M.sync = s / Math.max(1, sky.length); }
    // motif: bars whose melody rhythm or interval shape repeats an earlier bar
    const nb = Math.floor((B.length - 1) / bpb), barSig = [];
    for (let b = 0; b < nb; b++) { const t0 = B[b * bpb], t1 = B[Math.min(B.length - 1, (b + 1) * bpb)]; const ns = sky.filter(n => n[0] >= t0 - 0.02 && n[0] < t1 - 0.02); barSig.push(ns.length < 2 ? null : { r: ns.map(n => Math.round(((beatPos(n[0]) - b * bpb)) * 4)).join(','), i: ns.slice(1).map((n, k) => n[2] - ns[k][2]).join(',') }); }
    { let r = 0, c = 0; barSig.forEach((g, k) => { if (!g) return; c++; if (barSig.slice(0, k).some(h => h && (h.r === g.r || h.i === g.i))) r++; }); M.motifRep = r / Math.max(1, c); }
    // harmony: pitch-class sets per beat, how often they really change (per bar), and how far outside the key they wander
    const pcsAt = t => { const s = new Set(); for (const n of notes) { if (n[0] > t) break; if (n[1] > t) s.add(n[2] % 12); } return s; };
    // chord changes per bar: on every beat, the triad (12 roots x major/minor) that best fits what sounds there (each
    // note weighted by how long it sounds in the beat, the lowest note doubled), counted when the best fit changes
    { const TRI = []; for (let r = 0; r < 12; r++) for (const q3 of [3, 4]) TRI.push([r, (r + q3) % 12, (r + 7) % 12]);
      let ch = 0, prev = -1;
      for (let k = 0; k < B.length - 1; k++) { const t0 = B[k], t1 = B[k + 1], w = new Array(12).fill(0); let lo = 999, loPc = -1;
        for (const n of notes) { if (n[0] >= t1) break; const ov = Math.min(n[1], t1) - Math.max(n[0], t0); if (ov <= 0) continue; w[n[2] % 12] += ov; if (n[2] < lo) { lo = n[2]; loPc = n[2] % 12; } }
        if (loPc >= 0) w[loPc] += (t1 - t0) * 0.5; const tot = w.reduce((a, b) => a + b, 0); if (tot <= 0) continue;
        let best = -1, bs = -1e9; TRI.forEach((tr, ti) => { const inn = tr.reduce((a, x) => a + w[x], 0), sc = inn - 0.6 * (tot - inn); if (sc > bs) { bs = sc; best = ti; } });
        if (prev >= 0 && best !== prev) ch++; prev = best; }
      M.harmRate = ch / Math.max(1, (B.length - 1) / bpb); }
    { const h = new Array(12).fill(0); for (const n of notes) h[n[2] % 12] += n[1] - n[0]; let best = -2, key = 0, minor = false; for (let k = 0; k < 12; k++) for (const [P, mi] of [[KK_MAJ, false], [KK_MIN, true]]) { const r = corr(h, h.map((_, i) => P[(i - k + 12) % 12])); if (r > best) { best = r; key = k; minor = mi; } }
      const sc = (minor ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11]).map(x => (x + key) % 12); let out = 0, tot = 0; h.forEach((d, i) => { tot += d; if (!sc.includes(i)) out += d; }); M.chroma = out / Math.max(1e-9, tot); M.keyFit = best; }
    // structure: 4-bar windows. Contrast = how much density and register move between them; novelty = new bars
    { const win = [], W = 4 * bpb; for (let k = 0; k + W <= B.length - 1; k += W) { const t0 = B[k], t1 = B[k + W], ns = notes.filter(n => n[0] >= t0 && n[0] < t1); if (!ns.length) { win.push([0, 0]); continue; } win.push([ns.length / (t1 - t0), ns.reduce((a, n) => a + n[2], 0) / ns.length]); }
      if (win.length >= 2) { const d = win.map(w => w[0]), p = win.map(w => w[1]), md = d.reduce((a, b) => a + b) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - md) ** 2, 0) / d.length), mp2 = p.reduce((a, b) => a + b) / p.length, sp = Math.sqrt(p.reduce((a, b) => a + (b - mp2) ** 2, 0) / p.length); M.contrast = sd / Math.max(1e-6, md) + sp / 12; } else M.contrast = 0; }
    { const seen = new Set(); let nw = 0; for (let b = 0; b < nb; b++) { const t0 = B[b * bpb], t1 = B[Math.min(B.length - 1, (b + 1) * bpb)]; const sig = notes.filter(n => n[0] >= t0 - 0.02 && n[0] < t1 - 0.02).map(n => Math.round((beatPos(n[0]) - b * bpb) * 4) + ':' + n[2]).join(','); if (!seen.has(sig)) nw++; seen.add(sig); } M.novelty = nw / Math.max(1, nb); }
    M.tempo = 60 / spb;
    return M;
  }
  // the metrics that judge a song, and how much each one counts
  // texture density is down-weighted: the corpus is piano arrangements, a full 8-voice SNES texture is naturally denser
  const KEYS = { melNps: 1, accMotion: 0.6, bassMotion: 1, poly: 0.2, melRange: 1, stepFrac: 0.8, leapFrac: 0.8, repFrac: 0.5, rhythmEntropy: 1.2, sync: 1.2, motifRep: 1.4, harmRate: 1.2, chroma: 0.6, contrast: 1.2, novelty: 1.2, onsetRate: 0.5 };
  // a score 0-10: 10 inside the target's middle half (25th-75th percentile), losing 4 points per range-width outside it
  function score(M, T) {
    const per = {}; let s = 0, w = 0;
    for (const [k, wt] of Object.entries(KEYS)) { const t = T[k]; if (!t || M[k] == null) continue; const iqr = Math.max(1e-6, t[2] - t[0]); const d = M[k] < t[0] ? (t[0] - M[k]) / iqr : M[k] > t[2] ? (M[k] - t[2]) / iqr : 0; const sc = Math.max(0, 10 - 4 * d); per[k] = { v: +M[k].toFixed(3), lo: t[0], mid: t[1], hi: t[2], score: +sc.toFixed(1), dir: M[k] < t[0] ? 'LOW' : M[k] > t[2] ? 'HIGH' : 'OK' }; s += sc * wt; w += wt; }
    return { total: +(s / Math.max(1e-9, w)).toFixed(2), per };
  }
  // our song as the benchmark sees it: every pitched part (no drums), timed by the song's own clock
  function songNotes(song) {
    const T = LO.timing(song), sec = t => T.s(t) / LO.SR, notes = [], P = song.parts;
    const add = (ev, tr) => { for (const e of ev || []) { const m = tr ? tr(e) : e.m; if (m == null || e.ghost) continue; notes.push([sec(e.t), sec(e.t + Math.max(0.05, e.d)), m, Math.round(100 * (e.v == null ? 0.8 : e.v))]); } };
    add(P.lead); add(P.counter); add(P.bass); add(P.arp);
    for (const c of P.chords || []) for (const x of c.tones.slice(0, 3)) notes.push([sec(c.t), sec(c.t + c.d), song.meta.orch ? (x < 48 ? x + 12 : x) : x + 12, 60]);
    const beats = []; for (let b = 0; b <= song.totalBeats; b++) beats.push(sec(b));
    const bpb = 4;   // a 3/4 bar is stored as 4 units, so a bar is always 4 of our beats
    // start where the music starts (skip a silent or pad-only intro bar or two), like a transcription would
    return { notes, beats, bpb };
  }
  LO.Bench = { metrics, score, KEYS, songNotes, pct };
})(typeof self !== 'undefined' ? self : globalThis);
