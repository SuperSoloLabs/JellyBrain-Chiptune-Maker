// Instrument audit (dev tool): every library instrument played the way the game plays it (real BRR, Gaussian, ADSR,
// the 14-bit pitch register), at every note its part uses and at full and trimmed quality. Measures what you hear.
const fs = require('fs'), path = require('path'); const dir = path.join(__dirname, '..', 'app', 'src'); global.self = global;
for (const f of ['core.js', 'chip_common.js', 'snes_inst.js', 'snes_lib.js', 'snes_hifi.js', 'chip_snes.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
const out = process.argv[2]; if (out) fs.mkdirSync(out, { recursive: true });
// YIN (no hint, so it sees octave errors the old hinted meter could not)
function yinF(x, rate) { const W = Math.min(2048, x.length >> 1), tmax = Math.min(Math.floor(rate / 22), x.length - W - 1), tmin = Math.floor(rate / 2500);
  const d = new Float64Array(tmax + 1); for (let t = 1; t <= tmax; t++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[i] - x[i + t]; s += v * v; } d[t] = s; }
  const c = new Float64Array(tmax + 1); c[0] = 1; let run = 0; for (let t = 1; t <= tmax; t++) { run += d[t]; c[t] = d[t] * t / (run || 1); }
  let tau = -1; for (let t = tmin; t < tmax; t++) if (c[t] < 0.12) { while (t + 1 < tmax && c[t + 1] < c[t]) t++; tau = t; break; }
  if (tau < 0) { let m = 1e9; for (let t = tmin; t < tmax; t++) if (c[t] < m) { m = c[t]; tau = t; } }
  const a = c[tau - 1], b = c[tau], g = c[tau + 1]; const p = (a - 2 * b + g) ? 0.5 * (a - g) / (a - 2 * b + g) : 0; return c[tau] < 0.3 ? rate / (tau + p) : 0; }
const INHARM = /^(GLOCK|BELLS|TIMPANI.*)$/;
// a second opinion on an octave flag: the spectrum's energy at the expected fundamental against the one YIN claims
function goertzel(x, f, sr) { const w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - c * s1 * s2; }
function band(x, f, sr) { let m = 0; for (const k of [0.97, 0.985, 1, 1.015, 1.03]) m = Math.max(m, goertzel(x, f * k, sr)); return m; }
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
const fam = n => LO.SNESI_HIFI.familyOf(n);
const RANGE = n => { const f = fam(n); if (f === 'BASS') return [28, 55]; if (f === 'TIMPANI') return [40, 59]; if (['GLOCK', 'CELESTA'].includes(f)) return [60, 96]; return [43, 91]; };
const rows = [];
for (const n of LO.SNESI.NAMES) for (const q of [0, 2]) {
  const [lo, hi] = RANGE(n);
  // v0.7.2: audit what a lib-2 song plays: true pitch, pre-emphasis, octave-shifted rebuild for the part's top note
  let d = LO.SNESI.family(n, q, { v2: true }); if (!d) continue;
  if (d.baseF) { const r = (m2f(hi + 1) / d.baseF) * (d.rate / 32000); let div = 1; while (r / div > 3.99 && div < 8) div *= 2; if (div > 1) d = LO.SNESI.family(n, q, { v2: true, div }); } let clamp = [], errs = [], worst = 0, cents = [];
  for (let m = lo; m <= hi; m += 3) {
    const ratio = (m2f(m) / d.baseF) * (d.rate / 32000);
    if (ratio * 4096 > 0x3FFF) { clamp.push(m); continue; }
    const pv = LO.CHIPS.SNES.previewInst({ ...d, adsr: [15, 0, 7, 0] }, [{ s: 0, e: 16000, m }]);
    let meas = 0; try { meas = INHARM.test(n) ? LO.SNESI.measureOne(pv.out.subarray(3200, 16000), 32000, m2f(m)).f0 : yinF(pv.out.subarray(3200, 16000), 32000); } catch (e) {}
    if (meas > 0 && !INHARM.test(n)) { const oc0 = Math.round(1200 * Math.log2(meas / m2f(m)) / 1200);
      const ratio = meas / m2f(m), seg = pv.out.subarray(3200, 16000);
      for (const r of [1 / 2, 1 / 3, 1 / 4, 1 / 6]) if (Math.abs(1200 * Math.log2(ratio / r)) < 30) { const eE = band(seg, m2f(m), 32000), eY = band(seg, meas, 32000); if (eE > eY * 4) meas = m2f(m) * ratio / r; break; } }
    if (meas > 0) { let c = 1200 * Math.log2(meas / m2f(m)); c -= 1200 * Math.round(c / 1200); cents.push(c); const oc = Math.round(1200 * Math.log2(meas / m2f(m)) / 1200); if (Math.abs(c) > 35 || oc !== 0) errs.push(`${m}:${oc ? (oc > 0 ? '+' : '') + oc + 'oct' : ''}${Math.round(c)}c`); }
  }
  // loop seam after BRR: the wrap step against ordinary steps
  const rt = LO.brrRoundTrip(Float32Array.from(d.data, x => x), d.loop); let seam = 0;
  if (d.loop != null) { const p = rt.pcm, e = p.length - 1; let md = 1e-6, c = 0; for (let i = d.loop + 1; i < e; i++) { md += Math.abs(p[i] - p[i - 1]); c++; } md /= Math.max(1, c); seam = Math.abs(p[d.loop] - p[e]) / md; }
  const H = LO.SNESI_HIFI.LIB[n];
  rows.push({ n, q, fam: fam(n), fid: H ? H.fid : '-', base: d.baseF.toFixed(1), rate: Math.round(d.rate), lo, hi, clamp, errs, seam: +seam.toFixed(1), kind: d.kind, adsr: d.adsr.join(',') });
  if (out && q === 0) { const notes = []; let s = 0; for (const m of [lo + 5, Math.round((lo + hi) / 2), hi - 5]) { notes.push({ s, e: s + 20000, m }); s += 24000; } const pv = LO.CHIPS.SNES.previewInst(d, notes); fs.writeFileSync(path.join(out, n.replace(/[^A-Z0-9]+/g, '_') + '.wav'), Buffer.from(LO.encodeWav(pv.out, pv.out, 32000))); }
}
for (const r of rows) console.log(`${r.n.padEnd(14)} q${r.q} ${r.fam.padEnd(8)} fid ${String(r.fid).padEnd(5)} base ${r.base.padStart(7)}Hz @${String(r.rate).padStart(5)} ${r.kind.padEnd(7)} adsr ${r.adsr.padEnd(11)} seam ${String(r.seam).padStart(5)} | ${r.clamp.length ? 'PITCH CEILING ABOVE ' + r.clamp[0] + ' (' + r.clamp.length + ' notes)' : 'all notes reach'} | ${r.errs.length ? 'OFF: ' + r.errs.join(' ') : 'in tune'}`);
