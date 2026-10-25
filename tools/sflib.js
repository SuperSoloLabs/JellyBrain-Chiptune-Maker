// v0.6.1 SOUNDFONT LIBRARY BUILDER (dev tool, never shipped with the app)
// Reads Tom's SNES-era SoundFonts, measures every chosen instrument into numbers (harmonic envelopes, a
// noise layer, the loop's Fourier series, plucked or held, decay time, tags), rebuilds it from the numbers
// with the app's own synth (snes_hifi.js) and scores the match. Writes app/src/snes_lib.js (numbers only).
//   node tools/sflib.js <sf2 folder> [--only NAME] [--wav outdir]
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'app', 'src'); global.self = global;
for (const f of ['core.js', 'snes_inst.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
const TAU = Math.PI * 2;
const args = process.argv.slice(2), SFDIR = args[0];
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const wavDir = args.includes('--wav') ? args[args.indexOf('--wav') + 1] : null;
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------- SF2: instruments, zones, samples
function parse(file) {
  const b = fs.readFileSync(file); const dv = new DataView(b.buffer, b.byteOffset, b.length);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = b[o + i]; if (!c) break; s += String.fromCharCode(c); } return s; };
  const ch = {}; const walk = (o, end) => { while (o + 8 <= end) { const id = str(o, 4), sz = dv.getUint32(o + 4, true); if (id === 'LIST') walk(o + 12, Math.min(end, o + 8 + sz)); else ch[id] = { o: o + 8, sz }; o += 8 + sz + (sz & 1); } }; walk(12, b.length);
  const recs = (c, size, f) => { const out = []; for (let o = ch[c].o; o + size <= ch[c].o + ch[c].sz; o += size) out.push(f(o)); return out; };
  const gen = c => recs(c, 4, o => [dv.getUint16(o, true), dv.getInt16(o + 2, true), b[o + 2], b[o + 3]]);
  const inst = recs('inst', 22, o => ({ name: str(o, 20), bag: dv.getUint16(o + 20, true) })), ibag = recs('ibag', 4, o => dv.getUint16(o, true)), igen = gen('igen');
  const shdr = recs('shdr', 46, o => ({ name: str(o, 20), start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), ls: dv.getUint32(o + 28, true), le: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), pitch: b[o + 40], corr: dv.getInt8(o + 41), type: dv.getUint16(o + 44, true) }));
  const insts = [];
  for (let i = 0; i < inst.length - 1; i++) {
    const zs = []; for (let z = inst[i].bag; z < inst[i + 1].bag; z++) { const g = {}; for (let k = ibag[z]; k < ibag[z + 1]; k++) { const [op, s, lo, hi] = igen[k]; g[op] = (op === 43 || op === 44) ? [lo, hi] : s; } zs.push(g); }
    const glob = zs.length && zs[0][53] === undefined ? zs.shift() : {};
    insts.push({ name: inst[i].name.trim().toUpperCase(), zones: zs.map(z => ({ ...glob, ...z })).filter(z => z[53] !== undefined) });
  }
  const read = id => { const h = shdr[id], n = h.end - h.start, d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = dv.getInt16(ch.smpl.o + (h.start + i) * 2, true) / 32768; return d; };
  return { insts, shdr, read };
}

// ------------------------------------------------------------- small linear algebra (normal equations)
function solve(A, y, n) { // A n*n (row major, symmetric PD + ridge), in place Gaussian elimination
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = y[c]; y[c] = y[p]; y[p] = t; }
    const d = A[c * n + c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r * n + c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; y[r] -= f * y[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = y[r]; for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k]; x[r] = s / (A[r * n + r] || 1e-12); }
  return x;
}

// ------------------------------------------------------------- analysis of one sample
// partial frequencies for an inharmonic sound: the strongest peaks of the attack's spectrum
function peakFreqs(x, sr, A, f0, maxN) {
  const len = Math.min(A, 16384); let N = 1; while (N < len * 4) N <<= 1; N = Math.min(N, 65536);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(TAU * i / len));
  fft(re, im); const m = new Float64Array(N / 2); let mx = 0; for (let k = 0; k < N / 2; k++) { m[k] = Math.hypot(re[k], im[k]); mx = Math.max(mx, m[k]); }
  const pk = [];
  for (let k = 2; k < N / 2 - 2; k++) if (m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] > mx * 1e-3) { const a = Math.log(m[k - 1] + 1e-12), b = Math.log(m[k] + 1e-12), c = Math.log(m[k + 1] + 1e-12); const d = 0.5 * (a - c) / (a - 2 * b + c || 1e-12); const f = (k + d) * sr / N; if (f > 30 && f < Math.min(sr * 0.47, 12500)) pk.push([f, m[k]]); }
  pk.sort((p, q) => q[1] - p[1]);
  const minSp = Math.max(8, f0 * 0.12), out = [];
  for (const [f] of pk) { if (out.every(g => Math.abs(g - f) > minSp)) out.push(f); if (out.length >= maxN) break; }
  return out.sort((a, b) => a - b);
}
function analyze(x, sr, f0, loop, FR) {
  const n = x.length;
  const A = loop ? loop[0] : n, Lp = loop ? loop[1] - loop[0] : 0;
  const per = sr / f0;
  const freqs = FR || []; if (!FR) for (let k = 1; k <= 48 && k * f0 < Math.min(sr * 0.47, 12500); k++) freqs.push(k * f0);
  const K = Math.max(1, freqs.length);
  let minSp = f0; for (let i = 1; i < freqs.length; i++) minSp = Math.min(minSp, freqs[i] - freqs[i - 1]);
  const W = Math.max(48, Math.min(Math.round(sr * 0.06), Math.round(Math.max(per * 3, 2.2 * sr / Math.max(1, minSp))))), hop = Math.max(8, Math.round(Math.min(W / 4, sr * 0.004)));
  const F = Math.max(2, Math.ceil((A + W / 2) / hop) + 2);
  const C = new Float64Array(F * K * 2);
  const N2 = 2 * K, M = new Float64Array(N2 * N2), y = new Float64Array(N2);
  const cosT = new Float64Array(N2 * W);
  // per frame: weighted least squares for all harmonics at once (no leakage between neighbors)
  for (let f = 0; f < F; f++) {
    const c = f * hop, s0 = Math.round(c - W / 2);
    M.fill(0); y.fill(0);
    let wsum = 0;
    for (let i = 0; i < W; i++) {
      const nI = s0 + i; if (nI < 0 || nI >= (loop ? A + Lp : n)) continue;
      const xi = nI < n ? x[nI] : 0, w = 0.5 - 0.5 * Math.cos(TAU * (i + 0.5) / W), t = nI / sr; wsum += w;
      for (let k = 1; k <= K; k++) { const ph = TAU * freqs[k - 1] * t; cosT[(2 * k - 2) * W + i] = Math.cos(ph); cosT[(2 * k - 1) * W + i] = -Math.sin(ph); }
      for (let a = 0; a < N2; a++) { const va = cosT[a * W + i] * w; y[a] += va * xi; for (let b2 = a; b2 < N2; b2++) M[a * N2 + b2] += va * cosT[b2 * W + i]; }
    }
    if (wsum < 1e-6) continue;
    for (let a = 0; a < N2; a++) { for (let b2 = 0; b2 < a; b2++) M[a * N2 + b2] = M[b2 * N2 + a]; M[a * N2 + a] += 1e-6 * wsum; }
    const sol = solve(M, y, N2);
    for (let k = 0; k < K; k++) { C[(f * K + k) * 2] = sol[2 * k]; C[(f * K + k) * 2 + 1] = sol[2 * k + 1]; }
  }
  // residual over the attack: what the harmonics don't explain becomes the noise layer
  const harm = new Float32Array(A);
  for (let i = 0; i < A; i++) {
    const t = i / sr, xf = i / hop; let f = Math.floor(xf), u = xf - f; if (f >= F - 1) { f = F - 2; u = 1; }
    let s = 0;
    for (let k = 1; k <= K; k++) { const a = (f * K + k - 1) * 2, b = ((f + 1) * K + k - 1) * 2; const re = C[a] * (1 - u) + C[b] * u, im = C[a + 1] * (1 - u) + C[b + 1] * u; s += re * Math.cos(TAU * freqs[k - 1] * t) - im * Math.sin(TAU * freqs[k - 1] * t); }
    harm[i] = s;
  }
  const NB = []; for (let fc = 180; fc < sr * 0.44; fc *= 1.75) NB.push(Math.round(fc));
  const NBn = NB.length, Nz = new Float64Array(F * NBn);
  for (let j = 0; j < NBn; j++) {
    const bq = new LO.Biquad('bp', NB[j], 1.2, sr), band = new Float32Array(A);
    for (let i = 0; i < A; i++) band[i] = bq.run(x[i] - harm[i]);
    for (let f = 0; f < F; f++) { const c = f * hop; let ss = 0, cnt = 0; for (let i = Math.max(0, c - hop); i < Math.min(A, c + hop); i++) { ss += band[i] * band[i]; cnt++; } Nz[f * NBn + j] = cnt ? Math.sqrt(ss / cnt) : 0; }
  }
  // the loop: exact Fourier series of one loop
  let LB = [];
  if (Lp) {
    const seg = x.subarray(A, A + Lp); const bins = [];
    let mx = 0;
    for (let j = 1; j <= Lp / 2; j++) {
      let re = 0, im = 0; const w = TAU * j / Lp;
      for (let i = 0; i < Lp; i++) { re += seg[i] * Math.cos(w * i); im += seg[i] * Math.sin(w * i); }
      const sc = j === Lp / 2 ? 1 / Lp : 2 / Lp; re *= sc; im *= sc; // x = sum re*cos - im*sin  (im sign below)
      bins.push([j, re, -im]); mx = Math.max(mx, Math.hypot(re, im));
    }
    // keep the bins that hold 99.995% of the loop's energy (and never more than 3000)
    const tot = bins.reduce((a, b) => a + b[1] * b[1] + b[2] * b[2], 0); const srt = bins.slice().sort((a, b) => (b[1] ** 2 + b[2] ** 2) - (a[1] ** 2 + a[2] ** 2));
    let acc = 0; LB = []; for (const b of srt) { if (acc >= tot * 0.99995 || LB.length >= 3000) break; acc += b[1] ** 2 + b[2] ** 2; LB.push(b); }
    LB.sort((a, b) => a[0] - b[0]);
  }
  // how well the partials alone explain the attack
  let e = 0, s2 = 0; for (let i = 0; i < A; i++) { e += (x[i] - harm[i]) ** 2; s2 += x[i] * x[i]; }
  return { K, W, hop, F, C, NB, Nz, LB, A, Lp, freqs, snr: 10 * Math.log10((s2 + 1e-12) / (e + 1e-12)) };
}

// ------------------------------------------------------------- envelope: plucked or held, and how long it rings
const PLUCK_WORDS = ['HARP', 'PIANO', 'GUITAR', 'PIZZ', 'HARPSI', 'CELESTA', 'GLOCK', 'MARIMBA', 'VIBE', 'BASS', 'SLAP', 'SITAR', 'TIMPANI', 'KOTO', 'MUTE', 'CHUG', 'BONGO', 'COWBELL', 'TI'];
const HELD_WORDS = ['STRING', 'CHOIR', 'VOICE', 'ORGAN', 'ORG', 'BRASS', 'HORN', 'TROMBONE', 'TUBA', 'SAX', 'OBOE', 'FLUTE', 'FLAUTA', 'PAD', 'LEAD', 'WAVE', 'OOOO', 'TROMP', 'POWERCHORD'];
function envelope(x, sr, loop, name) {
  const fr = Math.max(16, Math.round(sr * 0.005)), A = loop ? loop[0] : x.length;
  const db = []; for (let i = 0; i + fr <= A; i += fr) { let s = 0; for (let k = i; k < i + fr; k++) s += x[k] * x[k]; db.push(10 * Math.log10(s / fr + 1e-12)); }
  let loopDb = -120; if (loop) { let s = 0; for (let k = loop[0]; k < loop[1]; k++) s += x[k] * x[k]; loopDb = 10 * Math.log10(s / (loop[1] - loop[0]) + 1e-12); }
  const pk = db.length ? Math.max(...db) : loopDb, pkI = db.indexOf(pk);
  const attackMs = Math.max(0, pkI) * fr / sr * 1000;
  // decay slope after the peak (dB per second), measured over the attack tail
  let slope = 0;
  const tail = db.slice(Math.max(pkI, Math.floor(db.length * 0.4)));
  if (tail.length >= 6) { const n = tail.length, mt = (n - 1) / 2, md = tail.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0; tail.forEach((d, i) => { sxy += (i - mt) * (d - md); sxx += (i - mt) ** 2; }); slope = sxy / sxx / (fr / sr); }
  const drop = pk - (loop ? loopDb : (db[db.length - 1] || -120));
  const nm = ' ' + name + ' ';
  const wordP = PLUCK_WORDS.some(w => nm.includes(w)) && !/SYNTH BASS|SYNTHBASS/.test(name) || /BASS/.test(name) && !/SYNTH/.test(name);
  const wordH = HELD_WORDS.some(w => nm.includes(w)) && !wordP;
  const measuredPluck = attackMs < 25 && (slope < -14 || drop > 9);
  const pluck = wordP ? true : wordH ? false : measuredPluck || !loop;
  // ring time: from the measured tail if it is long enough, else a family value
  let tau = slope < -1 ? 8.686 / -slope : 3;
  const FT = { HARP: 1.4, PIANO: 1.8, GUITAR: 1.1, PIZZ: 0.35, HARPSI: 0.9, CELESTA: 1.3, GLOCK: 1.8, MARIMBA: 0.6, VIBE: 2.2, BASS: 1.6, SLAP: 0.8, SITAR: 1.5, TIMPANI: 1.4, MUTE: 0.25, CHUG: 0.3, BONGO: 0.25, COWBELL: 0.5 };
  const fk = Object.keys(FT).find(k => name.includes(k));
  if (fk) tau = tail.length >= 10 ? Math.sqrt(tau * FT[fk]) : FT[fk];
  tau = LO.clamp(tau, 0.15, 4);
  return { pluck, attackMs, slope, drop, tau, wordP, wordH, measuredPluck, loopDb, pk };
}

// ------------------------------------------------------------- the match score
function stftMag(x, N, hop) {
  const fr = []; const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(TAU * i / N)); im[i] = 0; }
    fft(re, im); const m = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) m[k] = Math.hypot(re[k], im[k]); fr.push(m);
  }
  return fr;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -TAU / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
// play a sample (attack, then the loop repeating) for `sec` seconds
function playOut(d, loop, sr, sec) { const n = Math.round(sr * sec), o = new Float32Array(n); for (let i = 0; i < n; i++) { let k = i; if (k >= d.length) { if (loop == null) break; k = loop + ((k - loop) % (d.length - loop)); } o[i] = d[k]; } return o; }
// 1 - spectral convergence on a log-ish (power 0.5) magnitude scale: hears quiet partials too
function matchScore(a, b, sr) {
  const N = sr > 20000 ? 1024 : 512, hop = N / 4;
  const A = stftMag(a, N, hop), B = stftMag(b, N, hop); let num = 0, den = 0;
  // spectral convergence on the magnitude spectrogram (the standard resynthesis score), 1 = identical
  for (let f = 0; f < Math.min(A.length, B.length); f++) for (let k = 1; k < N / 2; k++) { const x = A[f][k], y = B[f][k]; num += (x - y) ** 2; den += x * x; }
  return 1 - Math.sqrt(num / (den + 1e-12));
}
function resample(d, from, to) { if (from === to) return d; const r = from / to, n = Math.floor(d.length / r), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; o[i] = (d[k] || 0) * (1 - f) + (d[k + 1] || 0) * f; } return o; }

// ------------------------------------------------------------- encode
const b64 = a => Buffer.from(new Int16Array(a).buffer).toString('base64');
function q16(arr) { let mx = 1e-12; for (const v of arr) mx = Math.max(mx, Math.abs(v)); const sc = mx / 32000; return { sc, q: Array.from(arr, v => Math.round(v / sc)) }; }

module.exports = { parse, analyze, envelope, matchScore, playOut, resample, q16, b64, m2f };
if (require.main !== module) return;

// ------------------------------------------------------------- the picks: generic names, families, tags
// [file index, SF2 instrument name, library name, family, moods, genres]
const PICKS = require(args.includes('--picks') ? path.resolve(args[args.indexOf('--picks') + 1]) : './sflib_picks.js');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const files = fs.readdirSync(SFDIR).filter(f => /\.sf2$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b)); // numbered files: 1_..42_
files.forEach((f, i) => { if (parseInt(f) !== i + 1) throw new Error('soundfont numbering gap at ' + f); });
const SF = files.map(f => parse(path.join(SFDIR, f)));
const out = [], report = [];
eval(fs.readFileSync(path.join(dir, 'snes_hifi.js'), 'utf8').replace('const DATA = G.LO_SNES_LIB || [];', 'const DATA = [];'));
for (const pk of PICKS) { try {
  const [fi, sfName, id, fam, moods, genres, over] = pk;
  if (only && id !== only) continue;
  const S = SF[fi - 1]; const I = S.insts.find(i => i.name === sfName.toUpperCase()); if (!I) { console.log('MISSING', fi, sfName); continue; }
  // the zone nearest middle C
  const zones = I.zones.slice().sort((a, b) => { const r = z => z[58] != null && z[58] >= 0 ? z[58] : S.shdr[z[53]].pitch; return Math.abs(r(a) - 60) - Math.abs(r(b) - 60); });
  const z = zones[0], h = S.shdr[z[53]], x = S.read(z[53]), sr = h.rate;
  let loop = null; const mode = (z[54] || 0) & 3;
  if (mode === 1 || mode === 3) {
    let ls = h.ls - h.start, le = h.le - h.start;
    if ((ls + 1) % 16 === 0 && le + 1 === x.length) { ls++; le++; }
    else {
      // rippers disagree on whether the loop end is inclusive: pick the reading where the wrap is seamless
      const err = (a, b) => { let e = 0; for (let k = -3; k <= 3; k++) { const i = a + k, j = b + k; if (i < 0 || j < 0 || i >= x.length || j >= x.length) return 1e9; e += (x[i] - x[j]) ** 2; } return e; };
      let best = [ls, le], be = err(ls, le);
      for (const [da, db] of [[0, 1], [1, 1], [0, -1], [-1, 0], [1, 0]]) { const e = err(ls + da, le + db); if (e < be * 0.7 && le + db <= x.length) { be = e; best = [ls + da, le + db]; } }
      [ls, le] = best;
    }
    if (le > ls + 4 && le <= x.length) loop = [ls, le];
  }
  // (a) tuning lives in generators 51 / 52 (and the header's correction); then an octave check by ear
  const root = z[58] != null && z[58] >= 0 ? z[58] : (h.pitch > 127 ? 60 : h.pitch);
  const tune = (z[51] || 0) * 100 + (z[52] || 0) + h.corr;
  let f0 = m2f(root - tune / 100);
  let meas = 0; try { const seg = loop ? playOut(x.subarray(0, loop[1]), loop[0], sr, Math.max(0.25, x.length / sr)) : x; meas = LO.SNESI.measureOne(seg, sr, f0).f0; } catch (e) { }
  let oct = 0; if (meas > 0 && !(over && over.noOct)) { oct = Math.round(Math.log2(meas / f0)); if (Math.abs(1200 * Math.log2(meas / (f0 * Math.pow(2, oct)))) > 150) oct = 0; f0 *= Math.pow(2, oct); }
  if (over && over.f0mul) f0 *= over.f0mul;
  // (b)(c) plucked or held, from the sample itself (the game's envelope isn't in the file); attack and loop apart
  const E = envelope(x, sr, loop, sfName.toUpperCase());
  if (over && over.pluck != null) E.pluck = over.pluck;
  // the analysis grid follows the pitch you can hear when the tuning tables and the ear disagree a little
  const fa = meas > 0 && Math.abs(1200 * Math.log2(meas / f0)) > 25 && Math.abs(1200 * Math.log2(meas / f0)) < 150 && E.pluck !== undefined && !/(PIANO|GLOCK|CELESTA|VIBE|MARIMBA|TIMPANI)/.test(sfName.toUpperCase()) ? meas : f0;
  const grid = fa !== f0 ? (() => { const g = []; for (let k = 1; k <= 48 && k * fa < Math.min(sr * 0.47, 12500); k++) g.push(k * fa); return g; })() : null;
  let an = analyze(x, sr, fa, loop, grid); let model = grid ? 'HARMONIC*' : 'HARMONIC';
  if (an.A > 64 && an.snr < 24) { const pf = peakFreqs(x, sr, an.A, f0, 48); if (pf.length >= 3) { const a2 = analyze(x, sr, f0, loop, pf); if (a2.snr > an.snr + 1) { an = a2; model = 'PARTIALS'; } } }
  // still noisy (a distorted guitar, a short pizzicato): add the strongest leftover peaks to the partial list
  if (an.A > 64 && an.snr < 18) {
    const res = new Float32Array(an.A); { const T2 = an; for (let i = 0; i < T2.A; i++) { const t = i / sr, xf = i / T2.hop; let f = Math.floor(xf), u = xf - f; if (f >= T2.F - 1) { f = T2.F - 2; u = 1; } let v = 0; for (let k = 1; k <= T2.K; k++) { const a = (f * T2.K + k - 1) * 2, b = ((f + 1) * T2.K + k - 1) * 2; v += (T2.C[a] * (1 - u) + T2.C[b] * u) * Math.cos(TAU * T2.freqs[k - 1] * t) - (T2.C[a + 1] * (1 - u) + T2.C[b + 1] * u) * Math.sin(TAU * T2.freqs[k - 1] * t); } res[i] = x[i] - v; } }
    const extra = peakFreqs(res, sr, an.A, f0 * 0.5, 40).filter(f => an.freqs.every(g => Math.abs(g - f) > Math.max(6, f0 * 0.06)));
    if (extra.length) { const fr2 = an.freqs.concat(extra).sort((a, b) => a - b).slice(0, 88); const a3 = analyze(x, sr, f0, loop, fr2); if (a3.snr > an.snr + 1) { an = a3; model = 'HYBRID'; } }
  }
  const Cq = q16(an.C), LBf = []; for (const b of an.LB) LBf.push(b[1], b[2]); const Lq = q16(LBf.length ? LBf : [0]);
  const LBi = []; an.LB.forEach((b, i) => LBi.push(b[0], Lq.q[2 * i], Lq.q[2 * i + 1]));
  // noise layer stored in centi-dB
  let nmx = 1e-12; for (const v of an.Nz) nmx = Math.max(nmx, v);
  const Nq = Array.from(an.Nz, v => Math.max(-9000, Math.round(2000 * Math.log10(Math.max(1e-9, v / nmx)))));
  const kind = E.pluck ? (/(GLOCK|MARIMBA|VIBE|CELESTA|TIMPANI|BELL|PIANO|BONGO|COWBELL)/.test(sfName.toUpperCase()) ? 'STRUCK' : 'PLUCK') : 'SUSTAIN';
  const srReg = LO.SNESI.srFor(E.tau);
  const adsr = E.pluck ? [15, 7, 7, srReg] : [15, 0, 7, 0];
  const vib = !E.pluck && !/(ORGAN|ORG|CHOIR|VOICE|PAD|WAVE|POWERCHORD)/.test(sfName.toUpperCase());
  // brightness: spectral centroid of the loop (or attack) in harmonics
  let cs = 0, cw = 0; for (const b of an.LB) { const a = Math.hypot(b[1], b[2]); const hk = b[0] / (an.Lp / (sr / f0)); cs += a * hk; cw += a; }
  const cen = cw ? cs / cw : 3;
  const p = { id, fam, sr, f0: +f0.toFixed(4), FR: model !== 'HARMONIC' ? an.freqs.map(f => +f.toFixed(3)) : undefined, A: an.A, L: an.Lp, K: an.K, F: an.F, hop: an.hop / sr, cS: Cq.sc, C: b64(Cq.q), NB: an.NB, nS: nmx, N: b64(Nq), lS: Lq.sc, LB: b64(LBi), adsr, vib, kind, seed: (id.length * 7919) & 0xffff,
    tags: { family: fam, sound: E.pluck ? (kind === 'STRUCK' ? 'struck' : 'plucked') : 'held', tone: cen > 5 ? 'bright' : cen < 2.2 ? 'dark' : 'warm', moods, genres, tau: +E.tau.toFixed(2) } };
  // rebuild with the app's own synth and score it against the original
  const rb = LO.SNESI_HIFI.synth(p, 0);
  const sec = Math.min(2.5, Math.max(0.6, an.A / sr + 0.5));
  const orig = playOut(loop ? x.subarray(0, loop[1]) : x, loop ? loop[0] : null, sr, sec);
  // the rebuild sits on whole BRR blocks, so its time runs s times slower (the chip corrects the pitch with baseF)
  const sc = f0 / rb.baseF;
  const reb = resample(playOut(rb.data, rb.loop, rb.rate, sec * sc + 0.05), rb.rate * sc, sr);
  // pitch scale: rebuild plays baseF; play both at their own natural pitch: compare as-is (s close to 1)
  const fid = Math.round(1000 * matchScore(orig, reb.subarray(0, orig.length), sr)) / 10;
  p.fid = fid;
  if (over && over.v) p.v = over.v;      // v0.7.3: library generation (lib-3 songs only)
  if (over && over.tn) p.tn = over.tn;    // true-pitch factor measured by tools/sf_tune.js
  const bytes = JSON.stringify(p).length;
  report.push(`${id.padEnd(14)} ${fam.padEnd(9)} <- ${String(fi)}:${sfName.padEnd(16)} f0 ${f0.toFixed(1).padStart(7)} (oct ${oct >= 0 ? '+' : ''}${oct}, meas ${meas.toFixed(1)}) ${p.kind.padEnd(7)} tau ${E.tau.toFixed(2)} atk ${E.attackMs.toFixed(0)}ms slope ${E.slope.toFixed(0)}dB/s drop ${E.drop.toFixed(1)} | ${model} SNR ${an.snr.toFixed(1)}dB A ${an.A} L ${an.Lp} K ${an.K} F ${an.F} bins ${an.LB.length} | MATCH ${fid}% | ${(bytes / 1024).toFixed(1)}KB`);
  console.log(report[report.length - 1]);
  if (wavDir) { fs.mkdirSync(wavDir, { recursive: true }); fs.writeFileSync(path.join(wavDir, id.replace(/\s/g, '_') + '_orig.wav'), Buffer.from(LO.encodeWav(orig, orig, sr))); fs.writeFileSync(path.join(wavDir, id.replace(/\s/g, '_') + '_rebuild.wav'), Buffer.from(LO.encodeWav(reb, reb, sr))); }
  out.push(p);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out));
} catch (e) { console.log('SKIP', pk[0], pk[1], e.message); } }
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(out)); console.log('wrote', out.length, 'to', OUT); }
else if (!only) {
  const js = '/* LowOrbit Chip Studio - SNES hi-detail instrument numbers (v0.6.1). Generated by tools/sflib.js.\n   Measured numbers only (harmonic envelopes, noise bands, loop Fourier series, envelope); no audio, no game names. */\n'
    + '(function (G) { G.LO_SNES_LIB = ' + JSON.stringify(out) + '; })(typeof self !== \'undefined\' ? self : globalThis);\n';
  fs.writeFileSync(path.join(dir, 'snes_lib.js'), js);
  console.log('wrote', out.length, 'instruments,', (js.length / 1024).toFixed(0), 'KB; mean match', (out.reduce((a, p) => a + p.fid, 0) / out.length).toFixed(1) + '%');
}
