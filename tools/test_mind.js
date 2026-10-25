const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+'';
global.self=global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const E=new LO.Engine(); let fails=0; const verbose=process.argv[2]==='v';
const cases=[]; const only=process.argv[3];
for (const chip of (process.env.CHIPS||'LO-1,SNES,NES,AMIGA').split(',')) {
  cases.push({chip, blueprint:LO.blueprintById('downtempo'), color:'fairy dust'});
  cases.push({chip, blueprint:LO.blueprintById('synthpop80')});
  cases.push({chip, valence:2, arousal:8});
  cases.push({chip, purpose:'BOSS', color:'fire storm'});
  cases.push({chip, purpose:'VICTORY'});
  cases.push({chip, blueprint:LO.blueprintById('drone'), color:'deep space underwater'});
}
for (const c of cases.filter(c=>!only||(c.chip+':'+(c.blueprint?c.blueprint.id:c.purpose||'feeling'))===only)) {
  try {
    const t0=Date.now(); const r=E.generate({seed:777+cases.indexOf(c),master:true,minScore:+(process.env.MINS||72),...c});
    let pk=0,nan=0; for(const x of r.L){ if(!isFinite(x)) nan++; if(Math.abs(x)>pk)pk=Math.abs(x); }
    const mi=r.mind;
    console.log(c.chip.padEnd(6),(c.blueprint?c.blueprint.id:c.purpose||'feeling').padEnd(11),(c.color||'').padEnd(22),'score',mi.review.score,'notes',mi.review.notes.length,'ev',mi.log.length,'agree',mi.agreements,'lufs',mi.prod.lufs,'pk',mi.prod.peakDb,'lim',mi.prod.limitDb,'nan',nan,(Date.now()-t0)+'ms', mi.emotion&&mi.emotion.label, mi.job);
    if (verbose) for (const e of mi.log) console.log('   ',e.mod.padEnd(12),e.type.padEnd(6),e.area.padEnd(10),e.msg);
    if (nan||pk>0.9||pk<0.05) fails++;
  } catch(e){ fails++; console.log('FAIL',c.chip,c.blueprint&&c.blueprint.id,c.purpose,e.stack.split('\n').slice(0,4).join(' | ')); }
}
console.log('fails',fails);
