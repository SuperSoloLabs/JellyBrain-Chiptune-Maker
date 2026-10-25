const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+''; global.self=global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const E=new LO.Engine(); const hist=[]; const bp=LO.blueprintById('techno');
for (let i=0;i<8;i++){ const r=E.generate({seed:100+i,chip:'NES',blueprint:bp,history:hist.slice()}); const m=E.song.meta; hist.push({...m.skeleton,title:E.song.title,seed:E.song.seed});
 const rv=r.mind.review; console.log(i, JSON.stringify(m.variety), m.skeleton.form, m.skeleton.prog, 'score',rv.score, rv.notes.map(n=>n.text).join(' | ')); }
// forced repeat: same seed with history containing itself
const r=E.generate({seed:100,chip:'NES',blueprint:bp,history:hist.slice()}); console.log('repeat', r.mind.log.filter(e=>/SKELETON|REPEAT|KEEPING/.test(e.msg)).map(e=>e.msg).join(' || '));
