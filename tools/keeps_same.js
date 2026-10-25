// v0.6.1: old keeps (orch: 0) must replay byte-identical to v0.6.0. node tools/keeps_same.js <v0.6.0 app/src folder>
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const NEW = path.join(__dirname, '..', 'app', 'src'), OLD = process.argv[2];
const list = d => ['core.js', 'blueprints.js', 'composer.js', 'm_orchestra.js', 'm_scenes.js', 'm_motion.js', 'm_bench.js', 'chip_common.js', 'chip_nes.js', 'chip_amiga.js', 'snes_inst.js', 'snes_lib.js', 'snes_hifi.js', 'snes_drums_synth.js', 'snes_drums.js', 'chip_snes.js', 'chip_lo1.js', 'chip_fm.js', 'chip_genesis.js', 'chip_neogeo.js', 'chip_la.js', 'atmos.js', 'sfx.js', 'crunch.js', 'mind.js', 'm_composer.js', 'm_emotion.js', 'm_imagination.js', 'm_chipkeeper.js', 'm_production.js', 'm_listener.js', 'engine.js'].filter(f => fs.existsSync(path.join(d, f)));
function load(d) { const ctx = { console, Buffer, Math, Date: { now: () => 0 } }; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx); for (const f of list(d)) vm.runInContext(fs.readFileSync(path.join(d, f), 'utf8'), ctx, { filename: f }); return ctx.LO; }
const A = load(OLD), B = load(NEW);
const h = r => crypto.createHash('md5').update(Buffer.from(r.L.buffer)).update(Buffer.from(r.R.buffer)).digest('hex');
let fails = 0, n = 0;
const cases = [];
for (const chip of ['SNES', 'NES', 'AMIGA', 'GENESIS', 'NEO GEO', 'ROLAND LA', 'LO-1']) for (const seed of [11, 2024]) cases.push({ chip, seed });
for (const bp of ['overworldJourney', 'finalBattle', 'sorrowfulTheme', 'ancientCastle', 'airship', 'nightField']) cases.push({ chip: 'SNES', seed: 777, bp });
cases.push({ chip: 'SNES', seed: 31, purpose: 'BOSS', genre: 'ORCHESTRAL' }, { chip: 'SNES', seed: 5, purpose: 'TOWN' }, { chip: 'SNES', seed: 99, groove: 0 });
for (const c of cases) {
  const run = LO => { const E = new LO.Engine(); const p = { seed: c.seed, chip: c.chip, purpose: c.purpose, genre: c.genre, orch: 0, groove: c.groove }; if (c.bp) p.blueprint = LO.blueprintById(c.bp); return h(E.generate(p)); };
  const a = run(A), b = run(B); n++;
  if (a !== b) { fails++; console.log('DIFFERENT', JSON.stringify(c)); } else console.log('same', JSON.stringify(c), a.slice(0, 8));
}
console.log(`${n - fails}/${n} identical`); if (fails) process.exit(1);
