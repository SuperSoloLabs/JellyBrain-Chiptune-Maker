// v0.7.3 true pitch for new library instruments (dev tool): plays each one through the real chip path at notes across
// its part's range, measures the pitch with YIN, and stores the factor (tn) that puts it on the note.
//   node tools/sf_tune.js <in.json> <out.json>     (in: library entries; out: same entries with tn and the measured error)
const fs = require('fs'), path = require('path'); const dir = path.join(__dirname, '..', 'app', 'src'); global.self = global;
const IN = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
global.LO_SNES_LIB = IN; self.LO_SNES_LIB = IN;
for (const f of ['core.js', 'chip_common.js', 'snes_inst.js', 'snes_hifi.js', 'chip_snes.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
const RANGE = f => f === 'BASS' ? [31, 55] : f === 'TIMPANI' ? [40, 59] : ['GLOCK', 'CELESTA'].includes(f) ? [64, 91] : [50, 84];
const INHARM = /^(GLOCK|TIMPANI|BELLS)/;
const out = [];
for (const p of IN) {
  const [lo, hi] = RANGE(p.fam); const errs = [];
  let d = LO.SNESI.family(p.id, 0, { v2: true }); if (!d) { out.push({ ...p, tnErr: null }); continue; }
  const r = (m2f(hi + 1) / d.baseF) * (d.rate / 32000); let div = 1; while (r / div > 3.99 && div < 8) div *= 2; if (div > 1) d = LO.SNESI.family(p.id, 0, { v2: true, div });
  for (let m = lo; m <= hi; m += 4) {
    const ratio = (m2f(m) / d.baseF) * (d.rate / 32000); if (ratio * 4096 > 0x3FFF) continue;
    const pv = LO.CHIPS.SNES.previewInst({ ...d, adsr: [15, 0, 7, 0] }, [{ s: 0, e: 16000, m }]);
    const seg = pv.out.subarray(3200, 16000);
    let f = 0; try { f = INHARM.test(p.fam) ? LO.SNESI.measureOne(seg, 32000, m2f(m)).f0 : (() => { const [hz, ap] = LO.SNESI_HIFI.yin(seg, 32000); return ap < 0.3 ? hz : 0; })(); } catch (e) { }
    if (f > 0) errs.push(1200 * Math.log2(f / m2f(m)));
  }
  errs.sort((a, b) => a - b); const med = errs.length ? errs[errs.length >> 1] : 0;
  const spread = errs.length > 2 ? errs[Math.floor(errs.length * 0.8)] - errs[Math.floor(errs.length * 0.2)] : 0;
  // snap to whole octaves when it is an octave error; otherwise correct the fine tuning when it is consistent
  let tn = 1; const oct = Math.round(med / 1200), rest = med - oct * 1200;
  if (errs.length >= 3 && spread < 60) tn = Math.pow(2, med / 1200);
  else if (errs.length >= 3 && oct !== 0) tn = Math.pow(2, oct);
  if (Math.abs(1200 * Math.log2(tn)) < 6) tn = 1;
  out.push({ ...p, tn: tn !== 1 ? +tn.toFixed(5) : undefined, tnErr: +med.toFixed(1), tnSpread: +spread.toFixed(1), tnN: errs.length });
  console.log(p.id.padEnd(18), p.fam.padEnd(8), 'median', med.toFixed(1).padStart(7), 'c  spread', spread.toFixed(1).padStart(6), ' n', errs.length, ' tn', tn.toFixed(4), ' rest', rest.toFixed(1));
}
fs.writeFileSync(process.argv[3], JSON.stringify(out));
