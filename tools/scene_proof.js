// The scene proof run (dev tool, v0.7.2): every scene, at its own dials and at the dial extremes, made through the real
// worker, checked against its character sheet. Prints the report card. node tools/scene_proof.js [scene numbers]
const fs = require('fs'), path = require('path'); global.self = global; const dir = path.join(__dirname, '..', 'jellybrain_app', 'src');
global.importScripts = (...f) => { for (const x of f) eval.call(global, fs.readFileSync(path.join(dir, x), 'utf8')); };
const msgs = []; global.postMessage = m => msgs.push(m); self.postMessage = global.postMessage;
eval.call(global, fs.readFileSync(path.join(dir, 'jb_worker.js'), 'utf8'));
const pick = process.argv[2] ? process.argv[2].split(',').map(Number) : LO.JB_SCENES.map((_, i) => i);
const rows = []; let pass = 0, n = 0;
for (const i of pick) { const sc = LO.JB_SCENES[i];
  for (const [tag, dials] of [['OWN', sc.dials], ['LOW', [1, 1, 1, sc.dials[3]]], ['HIGH', [6, 6, 6, sc.dials[3]]]]) {
    msgs.length = 0; const t0 = Date.now(); self.onmessage({ data: { type: 'make', id: 1, scene: i, dials, room: sc.room, seed: 4000 + i * 7 } }); const r = msgs[0];
    if (r.type === 'error') { rows.push(`${sc.name.padEnd(11)} ${tag.padEnd(4)} ERROR ${r.msg}`); n++; continue; }
    const I = r.info, c = r.check; n++; if (c.ok) pass++;
    rows.push(`${sc.name.padEnd(11)} ${tag.padEnd(4)} ${c.ok ? 'PASS' : 'MISS'} takes ${c.takes} | ${String(I.bpm).padStart(3)} BPM ${I.mode.padEnd(10)} | score ${I.score} | ${I.len.toFixed(0).padStart(3)}s | ${(I.tricks || []).join(', ')}${c.fails.length ? ' | ' + c.fails.join('; ') : ''} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } }
console.log(rows.join('\n')); console.log(`\nREPORT CARD: ${pass}/${n} PASS`);
