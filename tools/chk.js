const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+''; global.self=global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const E=new LO.Engine();
for (const chip of ['GENESIS','NEO GEO','ROLAND LA']) {
  const r=E.generate({seed:4242,chip,blueprint:LO.blueprintById('synthpop80')});
  const rms=E.R.raw.map(a=>{let s=0,p=0;for(const x of a){s+=x*x;p=Math.max(p,Math.abs(x));}return (Math.sqrt(s/a.length)).toFixed(3)+'/'+p.toFixed(2);});
  console.log(chip, E.chip.channelsDef.map((c,i)=>c.name+'='+rms[i]).join('  '));
  fs.writeFileSync(`out/${chip.replace(' ','_')}.wav`, Buffer.from(LO.encodeWav(r.L,r.R,32000)));
}
