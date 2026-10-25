// Drum analyzer (dev tool, v0.7.2): SoundFont drum hits measured into numbers (sinusoidal tracks + a noise spectrum over
// time), written to app/src/snes_drums.js. The audio itself is never kept: the game rebuilds every hit from the numbers.
// Generic names only. node tools/sfdrums.js <soundfont folder>
const fs = require('fs'), path = require('path'); global.self = global;
const dir = path.join(__dirname, '..', 'app', 'src');
for (const f of ['core.js', 'chip_common.js', 'snes_inst.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
eval(fs.readFileSync(path.join(dir, 'snes_drums_synth.js'), 'utf8'));
const D = LO.SNESD_SYNTH;
const SF = process.argv[2] || path.join(__dirname, '..', 'soundfonts_snes');
const files = fs.readdirSync(SF).filter(f => /\.sf2$/i.test(f)).sort();
// [file number, sample name, library name, kind]
const PICKS = [
  // [file number, sample name inside the .sf2, kit hit name, kind ('kick' | 'snare' | 'hat' | 'tom' | 'crash' ...)]
]
const loaded = {};
const load = i => { if (loaded[i]) return loaded[i]; const b = fs.readFileSync(path.join(SF, files[i - 1])); return (loaded[i] = LO.SNESI.parseSF2(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))); };
// ---- analysis
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function stft(x, N, H) { const fr = []; const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let s = -N / 2; s < x.length; s += H) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) { const k = s + i; re[i] = k >= 0 && k < x.length ? x[k] * w[i] : 0; } fft(re, im); const m = new Float64Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) m[k] = Math.hypot(re[k], im[k]); fr.push(m); } return fr; }
function sinTracks(x, sr, N) {
  const H = N / 8, F = stft(x, N, H), ws = N / 4;    // Hann sum = N/2; a sine of amplitude a peaks at a*N/4
  let gmx = 1e-12; for (const m of F) for (const v of m) gmx = Math.max(gmx, v);
  const peaks = F.map(m => { const out = []; const srt = Array.from(m).sort((a, b) => a - b), med = srt[srt.length >> 1] + 1e-12;
    for (let k = 2; k < m.length - 2; k++) { if (!(m[k] > m[k - 1] && m[k] >= m[k + 1])) continue; if (m[k] < gmx * 0.006 || m[k] < med * 8) continue;
      const a = Math.log(m[k - 1] + 1e-12), b = Math.log(m[k]), c = Math.log(m[k + 1] + 1e-12), p = 0.5 * (a - c) / (a - 2 * b + c);
      const f = (k + p) * sr / N; if (f < 25 || f > Math.min(sr * 0.45, 9000)) continue; out.push({ f, a: Math.exp(b - 0.25 * (a - c) * p) / ws }); }
    return out.sort((u, v) => v.a - u.a).slice(0, 10); });
  const tracks = [], live = [];
  for (let t = 0; t < peaks.length; t++) {
    const used = new Set();
    for (const tr of live.slice()) { const lf = tr.f[tr.f.length - 1]; let bi = -1, bd = 1e9; peaks[t].forEach((p, i) => { if (used.has(i)) return; const d = Math.abs(p.f - lf); if (d < Math.max(12, lf * 0.06) && d < bd) { bd = d; bi = i; } });
      if (bi >= 0) { used.add(bi); tr.f.push(peaks[t][bi].f); tr.a.push(peaks[t][bi].a); } else { live.splice(live.indexOf(tr), 1); } }
    peaks[t].forEach((p, i) => { if (!used.has(i)) { const tr = { t0: t, f: [p.f], a: [p.a] }; tracks.push(tr); live.push(tr); } });
  }
  const good = tracks.filter(tr => tr.f.length >= 5).map(tr => ({ ...tr, e: tr.a.reduce((s, v) => s + v * v, 0) })).sort((u, v) => v.e - u.e).slice(0, 8);
  return { H, tracks: good.map(tr => ({ t0: tr.t0, f: tr.f, a: tr.a })) };
}
function score(x, y, sr) {   // 1 - spectral convergence on sixth-octave bands (how the ear hears noise and tone alike), 2 resolutions
  let s = 0; for (const N of [256, 1024]) { const A = stft(x, N, N / 4), B = stft(y, N, N / 4); const edges = []; for (let f = 40; f < sr / 2; f *= Math.pow(2, 1 / 6)) edges.push(Math.max(1, Math.round(f * N / sr)));
    const bands = m => { const o = []; for (let b = 0; b + 1 < edges.length; b++) { let e = 0; const z = Math.max(edges[b] + 1, edges[b + 1]); for (let k = edges[b]; k < z && k < m.length; k++) e += m[k] * m[k]; o.push(Math.sqrt(e)); } return o; };
    let num = 0, den = 0; for (let t = 0; t < Math.min(A.length, B.length); t++) { const a = bands(A[t]), b = bands(B[t]); for (let k = 0; k < a.length; k++) { const d = a[k] - b[k]; num += d * d; den += a[k] * a[k]; } } s += 1 - Math.sqrt(num / den); } return s / 2; }
function scoreBin(x, y, sr) {   // 1 - spectral convergence, averaged over two resolutions (what a listener hears)
  let s = 0; for (const N of [256, 1024]) { const A = stft(x, N, N / 4), B = stft(y, N, N / 4); let num = 0, den = 0; for (let t = 0; t < Math.min(A.length, B.length); t++) for (let k = 0; k < A[t].length; k++) { const d = A[t][k] - B[t][k]; num += d * d; den += A[t][k] * A[t][k]; } s += 1 - Math.sqrt(num / den); } return s / 2; }
module.exports = { PICKS, load, score, fft, stft, D };
// ---- run
if (require.main === module) {
const out = [], report = [];
for (const [fi, sname, id, kind] of PICKS) {
  const sf = load(fi); const hi = sf.samples.findIndex(s => s.name === sname); if (hi < 0) { report.push(id + ' MISSING ' + sname); continue; }
  const h = sf.samples[hi]; let x = sf.read(hi).data;
  let sr = h.rate; if (sr > 32000) { const r = 32000 / sr, n = Math.floor(x.length * r), y = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i / r, a = Math.floor(p), f = p - a; y[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f; } x = y; sr = 32000; }
  x = x.subarray(0, Math.min(x.length, Math.round(sr * 1.6)));
  let pk = 1e-9; for (const v of x) pk = Math.max(pk, Math.abs(v)); x = x.map(v => v / pk);
  let best = null;
  for (const N of [512, 1024]) {   // a fast pitch drop wants the short window, a ringing tone the long one: keep whichever matches
    const S = sinTracks(x, sr, N);
    const q = { id, kind, sr, n: x.length, H: S.H, tracks: S.tracks.map(t => ({ t0: t.t0, f: t.f.map(v => +v.toFixed(1)), a: t.a.map(v => +v.toFixed(4)) })), NH: 64, NB: D.BANDS(sr), nz: [] };
    q.nz = D.noiseEnv(x, D.sines(q, sr), sr, q.NH, q.NB, stft);
    const yy = D.synth(q, sr), sq = score(x, yy, sr);
    if (!best || sq > best.sc) best = { p0: q, y: yy, sc: sq };
  }
  const p0 = best.p0, y = best.y, sc = best.sc;
  p0.fid = +(100 * sc).toFixed(1);
  out.push(p0);
  const ex = x.reduce((a, v) => a + v * v, 0), ey = y.reduce((a, v) => a + v * v, 0);
  report.push(`${id.padEnd(11)} ${kind.padEnd(6)} <- ${fi}:${sname.padEnd(10)} ${String(x.length).padStart(6)} @${sr} | ${p0.tracks.length} tracks | MATCH ${p0.fid}% | level ${(10 * Math.log10(ey / ex)).toFixed(1)} dB`);
}
fs.writeFileSync(path.join(dir, 'snes_drums.js'), `/* LowOrbit Chip Studio - v0.7.2 sampled drum kits, as numbers only (sinusoidal tracks + a noise spectrum over time), measured
   from SoundFont hits by tools/sfdrums.js and rebuilt by snes_drums_synth.js. Generic names. */\n(function (G) { G.LO.SNESD_DATA = ${JSON.stringify(out)}; })(typeof self !== 'undefined' ? self : globalThis);\n`);
console.log(report.join('\n'));
}
