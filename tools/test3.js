const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+'';
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const out=require('path').join(require('os').tmpdir(),'lo_out'); require('fs').mkdirSync(out,{recursive:true});
const E=new LO.Engine(); let fails=0;
for (const bp of LO.BLUEPRINTS) for (const chip of ['LO-1','SNES','NES','AMIGA']) {
  if (chip!=='LO-1' && !['downtempo','techno','hypnoprog96','dnb'].includes(bp.id)) continue;
  try {
    const t0=Date.now(); const r=E.generate({seed:4242+bp.id.length,chip,blueprint:bp,valence:6,arousal:7});
    let pk=0,nan=0; for(const x of r.L){ if(!isFinite(x)) nan++; pk=Math.max(pk,Math.abs(x)); }
    const m=E.song.meta; const P=E.song.parts;
    console.log(bp.id.padEnd(12),chip.padEnd(6),m.form.padEnd(7),m.bpm,m.mode.padEnd(10),'bars',E.song.bars.length,'len',(r.L.length/32000).toFixed(0)+'s','lead',P.lead.length,'arp',P.arp.length,'bass',P.bass.length,'drums',P.drums.length,'peak',pk.toFixed(2),'nan',nan,(Date.now()-t0)+'ms', m.emotion);
    if (chip==='LO-1' && ['downtempo','hypnoprog96','acid','dnb','ambient'].includes(bp.id)) fs.writeFileSync(`${out}/bp_${bp.id}.wav`,Buffer.from(LO.encodeWav(r.L,r.R,32000)));
    if (nan || pk<0.1) fails++;
  } catch(e){ fails++; console.log('FAIL',bp.id,chip,e.stack.split('\n').slice(0,3).join(' | ')); }
}
const bl=LO.blendBlueprints(LO.blueprintById('downtempo'),LO.blueprintById('techno'),0.5); const r=E.generate({seed:9,chip:'LO-1',blueprint:bl}); console.log('blend',bl.name,E.song.meta.bpm,E.song.meta.form,(r.L.length/32000).toFixed(0)+'s');
console.log('search underworld ->', LO.searchBlueprints('underworld').map(b=>b.name).join(', '), '| search house ->', LO.searchBlueprints('house').map(b=>b.name).join(', '));
console.log('fails',fails);
