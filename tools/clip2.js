const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+'';
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const E=new LO.Engine(); const om=LO.master; let st=null; LO.master=(L,R,on)=>{const t=Date.now();st=om(L,R,on);st.ms=Date.now()-t;return st;};
let bad=0;
for (const chip of ['NES','AMIGA','SNES','LO-1']) for (const id of [null,'techno','trance','dnb','drone','acid']) {
  const p={seed:4321,chip}; if(id) p.blueprint=LO.blueprintById(id);
  const r=E.generate(p); let pk=0,flat=0,nan=0;
  for(let i=1;i<r.L.length;i++){const a=Math.abs(r.L[i]); if(!isFinite(a))nan++; if(a>pk)pk=a; if(a>=0.889&&Math.abs(r.L[i-1])>=0.889)flat++;}
  const vs=E.R&&E.R.vstage?E.R.vstage.filter(x=>x<1).length:'-';
  console.log(chip.padEnd(6),(id||'game').padEnd(9),'peak',pk.toFixed(3),'flat',flat,'nan',nan,'limiter',st.limitDb?st.limitDb.toFixed(1)+'dB':'-','ms',st.ms,'hotVoicesTamed',vs);
  if(nan||flat>20) bad++;
}
console.log('bad',bad);
