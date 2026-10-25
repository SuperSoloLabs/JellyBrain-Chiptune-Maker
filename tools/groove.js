// Groove + Freshness survey: generate N songs through the full Studio Mind (with history, like the app),
// and measure the lead melody: rest ratio, syncopation (Longuet-Higgins & Lee), IOI entropy,
// breath-delimited phrase lengths, and melodic n-gram reuse across 50 consecutive songs.
// usage: node tools/groove.js [N] [label]
const fs = require('fs'), path = require('path'); const dir = path.join(__dirname, '..', 'app', 'src'); global.self = global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
const N = +(process.argv[2] || 100), label = process.argv[3] || 'run';
const CHIPS = ['NES', 'AMIGA', 'SNES', 'GENESIS', 'NEO GEO', 'ROLAND LA', 'LO-1'];
const STYLES = LO.BLUEPRINTS.map(b => ({ blueprint: b })).concat(['OVERWORLD', 'TOWN', 'BATTLE', 'BOSS', 'DUNGEON', 'TITLE', 'CUTSCENE', 'CREDITS', 'MENU', 'CHASE'].map(p => ({ purpose: p })));
const E = new LO.Engine(); const hist = [];
const LHL = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];
const gt = n => n.tg != null ? n.tg : n.t;
function measure(song) {
  const m = song.meta; if (m.form.startsWith('jingle')) return null;
  const lead = song.parts.lead.map(n => ({ t: gt(n), d: n.dg != null ? n.dg : n.d, m: n.m })).sort((a, b) => a.t - b.t);
  if (lead.length < 8) return null;
  // rest ratio inside sections that have melody
  let span = 0, silent = 0;
  for (const s of song.sections) {
    const a = s.start * 4, b = (s.start + s.bars) * 4; const ns = lead.filter(n => n.t >= a - 1 && n.t < b);
    if (ns.length < 3) continue;
    const s0 = Math.max(a, ns[0].t), s1 = Math.min(b, Math.max(...ns.map(n => n.t + n.d)));
    span += s1 - s0; let cov = 0, cur = s0;
    for (const n of ns) { const x0 = Math.max(cur, n.t), x1 = Math.min(s1, n.t + n.d); if (x1 > x0) { cov += x1 - x0; cur = x1; } }
    silent += Math.max(0, (s1 - s0) - cov);
  }
  // syncopation (only on a 16th grid: 4/4 and shuffle)
  let sync = null;
  if (m.meter !== '3/4') {
    const NB = song.bars.length; let tot = 0, nb = 0;
    const on = new Set(lead.map(n => Math.round(n.t * 4)));
    const sounding = new Uint8Array(NB * 16 + 16); for (const n of lead) for (let k = Math.round(n.t * 4); k < Math.round((n.t + n.d) * 4); k++) if (k >= 0 && k < sounding.length) sounding[k] = 1;
    for (let b = 0; b < NB; b++) {
      let any = false, sb = 0;
      for (let i = 0; i < 16; i++) {
        const k = b * 16 + i; if (!on.has(k)) continue; any = true;
        // next onset
        let j = k + 1; while (j < k + 16 && !on.has(j)) j++;
        // strongest position strictly between k and j (exclusive) that has no onset
        let best = null; for (let q = k + 1; q < j; q++) { const w = LHL[q % 16]; if (best == null || w > best) best = w; }
        if (best != null && best > LHL[i]) sb += best - LHL[i];
      }
      if (any) { tot += sb; nb++; }
    }
    sync = nb ? tot / nb : 0;
  }
  // IOI entropy (in 16ths, capped at 16)
  const H = {}; let ni = 0;
  for (let i = 1; i < lead.length; i++) { const q = Math.min(16, Math.max(1, Math.round((lead[i].t - lead[i - 1].t) * 4))); H[q] = (H[q] || 0) + 1; ni++; }
  let ent = 0; for (const k in H) { const p = H[k] / ni; ent -= p * Math.log2(p); }
  // breath phrases: a new phrase starts after a rest of >= 0.75 beat, or at a section start
  const starts = []; const secStarts = new Set(song.sections.map(s => s.start * 4));
  for (let i = 0; i < lead.length; i++) {
    const gap = i ? lead[i].t - (lead[i - 1].t + lead[i - 1].d) : 99;
    const secB = [...secStarts].some(x => lead[i].t >= x - 1 && (i === 0 || lead[i - 1].t < x - 1));
    if (gap >= 0.75 || secB) starts.push(lead[i].t);
  }
  const plen = []; for (let i = 1; i < starts.length; i++) plen.push(Math.round((starts[i] - starts[i - 1]) / 4 * 2) / 2);
  // n-grams
  const iv = [], rh = [];
  for (let i = 4; i < lead.length; i++) {
    iv.push([1, 2, 3, 4].map(k => LO.clamp(lead[i - 4 + k].m - lead[i - 5 + k < 0 ? 0 : i - 5 + k].m, -12, 12)).join(','));
    rh.push([1, 2, 3, 4].map(k => Math.round((lead[i - 4 + k].t - lead[i - 5 + k].t) * 4)).join(','));
  }
  return { rest: span ? silent / span : 0, sync, ent, plen, iv: new Set(iv), rh: new Set(rh), ivAll: iv, meter: m.meter, form: m.form, chip: m.chip };
}
const res = []; const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const st = STYLES[(i * 7) % STYLES.length], chip = CHIPS[i % CHIPS.length];
  E.generate({ seed: 50000 + i * 7919, chip, ...st, history: hist.slice(-50) });
  const s = E.song; hist.push({ ...s.meta.skeleton, title: s.title, seed: s.seed });
  const r = measure(s); if (r) res.push(r);
}
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = a => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rest = res.map(r => r.rest), sync = res.filter(r => r.sync != null).map(r => r.sync), ent = res.map(r => r.ent);
const allP = res.flatMap(r => r.plen).filter(x => x > 0);
const pDist = {}; for (const p of allP) pDist[p] = (pDist[p] || 0) + 1;
const perSongDistinct = res.map(r => new Set(r.plen).size);
// reuse: for each song from #50 on, share of its distinct n-grams already used in the previous 50 songs
const reuse = (key) => { const out = []; for (let i = 50; i < res.length; i++) { const seen = new Set(); for (let j = i - 50; j < i; j++) for (const g of res[j][key]) seen.add(g); const mine = [...res[i][key]]; if (mine.length) out.push(mine.filter(g => seen.has(g)).length / mine.length); } return out; };
const rIv = reuse('iv'), rRh = reuse('rh');
// how concentrated: share of all interval grams taken by the 10 most common
const cnt = {}; let tot = 0; for (const r of res) for (const g of r.ivAll) { cnt[g] = (cnt[g] || 0) + 1; tot++; }
const top10 = Object.values(cnt).sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0) / tot;
const out = {
  label, songs: res.length, secs: ((Date.now() - t0) / 1000).toFixed(0),
  restRatio: { mean: +avg(rest).toFixed(3), p10: +pct(rest, 0.1).toFixed(3), p90: +pct(rest, 0.9).toFixed(3), inTarget10to30: +(rest.filter(x => x >= 0.1 && x <= 0.3).length / rest.length).toFixed(2) },
  syncopation: { mean: +avg(sync).toFixed(2), sd: +sd(sync).toFixed(2), p10: +pct(sync, 0.1).toFixed(2), p90: +pct(sync, 0.9).toFixed(2) },
  ioiEntropyBits: { mean: +avg(ent).toFixed(2), sd: +sd(ent).toFixed(2) },
  phraseLengths: { distinctAcrossAll: Object.keys(pDist).length, avgDistinctPerSong: +avg(perSongDistinct).toFixed(2), dist: pDist },
  ngramReuse50: { intervals: +avg(rIv).toFixed(3), rhythms: +avg(rRh).toFixed(3), top10IntervalShare: +top10.toFixed(3) },
};
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, `groove_${label}.json`), JSON.stringify(out, null, 1));
