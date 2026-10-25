// The build check (v0.7.2): runs before every Jelly Brain package. Fails the build (exit 1) when:
// - an instrument the brain can pick by itself is out of tune or cannot reach its part's notes (pitch ceiling)
// - an FIR preset can overflow the 16-bit accumulator (sum of |taps| past 128) without being marked as an overdrive room
// - a library loop is off the 16-sample BRR blocks
// - the SFX hijack could ever take the melody or the bass
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = path.join(__dirname, '..', 'app', 'src'); global.self = global;
for (const f of ['core.js', 'chip_common.js', 'snes_inst.js', 'snes_lib.js', 'snes_hifi.js', 'snes_drums_synth.js', 'snes_drums.js', 'snes_dsp.js', 'chip_snes.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'));
const fails = [], notes = [];
// 1. the instrument audit (true pitch, ceiling, at full quality)
const audit = execFileSync('node', [path.join(__dirname, 'inst_audit.js')], { encoding: 'utf8', maxBuffer: 1 << 26 });
const PULL = LO.SNESI_HIFI.PULL, INH = /GLOCK|TIMPANI|BELLS|CELESTA/;
for (const line of audit.split('\n')) {
  const m = line.match(/^(.{14}) q0 /); if (!m) continue; const name = m[1].trim(); if (PULL.has(name)) continue;
  const off = (line.split('OFF: ')[1] || '').trim().split(' ').filter(Boolean), ceil = /PITCH CEILING ABOVE (\d+) \((\d+) notes\)/.exec(line);
  const bad = off.filter(x => /oct/.test(x) || Math.abs(parseInt(x.split(':')[1].replace(/[+-]\d+oct/, ''))) > (INH.test(name) ? 70 : 35));
  if (ceil && +ceil[2] > 1) fails.push(`${name}: PITCH CEILING (${ceil[2]} NOTES)`);
  if (bad.length > 2) fails.push(`${name}: OUT OF TUNE AT ${bad.length} NOTES (${bad.slice(0, 4).join(' ')})`); else if (bad.length) notes.push(`${name}: ${bad.join(' ')} (edge notes, meter)`);
}
// 2. FIR presets
const FIRS = LO.CHIPS.SNES.fxSchema.find(f => f.id === 'fir').options;
for (const k of FIRS) { const t = LO.CHIPS.SNES.FIR[k]; if (!t) continue; const pk = LO.SNESX.firPeak(t), ab = t.reduce((a, b) => a + Math.abs(b), 0);
  // Nintendo's own presets peak at 1.03-1.08 and ship; anything past 1.1 (+0.8 dB) is a mistake unless it is an overdrive room
  if (pk > 1.1 && !/OVERDRIVE|METAL/.test(k)) fails.push(`FIR ${k}: PEAK GAIN ${pk.toFixed(2)} (OVER UNITY)`); else if (ab > 128) notes.push(`FIR ${k}: |taps| sum ${ab} (peak gain ${pk.toFixed(2)}: safe for real signals)`); }
// 3. loops on BRR blocks
for (const n of LO.SNESI_HIFI.NAMES) { const d = LO.SNESI.family(n, 0, { v2: true }); if (d && d.loop != null && (d.loop % 16 || (d.data.length - d.loop) % 16)) fails.push(`${n}: LOOP OFF THE 16-SAMPLE BLOCKS`); }
// 4. the hijack's priority mask
const w = fs.readFileSync(path.join(__dirname, '..', 'jellybrain_app', 'src', 'jb_worker.js'), 'utf8'), st = /const STEAL = (\{[^}]*\})/.exec(w);
if (!st || /\blead\b|\bbass\b/.test(st[1])) fails.push('SFX HIJACK COULD TAKE THE MELODY OR THE BASS');
console.log(notes.map(x => 'note: ' + x).join('\n'));
if (fails.length) { console.log('BUILD CHECK FAILED:\n' + fails.join('\n')); process.exit(1); }
console.log('BUILD CHECK PASSED: instruments in tune and in range, FIR presets safe, loops on blocks, melody and bass protected');
