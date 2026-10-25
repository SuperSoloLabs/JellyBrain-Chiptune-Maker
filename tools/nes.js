const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+''; global.self=global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const E=new LO.Engine(); let fails=0;
const ids=LO.BLUEPRINTS.filter(b=>b.era==='NES').map(b=>b.id);
for (const chip of ['NES','GENESIS','SNES','ROLAND LA']) for (const id of ids) {
  try { const t0=Date.now(); const r=E.generate({seed:900+ids.indexOf(id)*31,chip,blueprint:LO.blueprintById(id)}); let nan=0,pk=0; for(const x of r.L){if(!isFinite(x))nan++; pk=Math.max(pk,Math.abs(x));}
   const m=E.song.meta; console.log(chip.padEnd(9),id.padEnd(16),m.meter.padEnd(7),m.displayBpm,'bars',E.song.bars.length,'score',r.mind.review.score,'fx',chip==='NES'?JSON.stringify({d1:E.fx.duty1,env:E.fx.leadEnv,tk:E.fx.triKick,ds:E.fx.dutySwitch,met:E.fx.metal,echo:E.fx.echoTrick}):'','pk',pk.toFixed(2),'nan',nan,(Date.now()-t0)+'ms');
   if(nan||pk<0.05||pk>0.9)fails++;
   if (chip==='NES') fs.writeFileSync(require('path').join(require('os').tmpdir(),'lo_out','nes_'+id+'.wav'), Buffer.from(LO.encodeWav(r.L,r.R,32000)));
  } catch(e){fails++;console.log('FAIL',chip,id,e.stack.split('\n').slice(0,3).join(' | '));}
}
console.log('fails',fails);
