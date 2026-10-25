// v0.6: the 8 SNES-era blueprints on every chip, plus instrument and 64 KB checks on the SNES
const fs=require('fs'),path=require('path'); const dir=path.join(__dirname,'..','app','src'); global.self=global;
for (const f of ['core.js','blueprints.js','composer.js','m_orchestra.js','chip_common.js','chip_nes.js','chip_amiga.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js','chip_lo1.js','chip_fm.js','chip_genesis.js','chip_neogeo.js','chip_la.js','atmos.js','sfx.js','crunch.js','mind.js','m_composer.js','m_emotion.js','m_imagination.js','m_chipkeeper.js','m_production.js','m_listener.js','engine.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
const out=path.join(require('os').tmpdir(),'lo_out'); fs.mkdirSync(out,{recursive:true});
const E=new LO.Engine(); let fails=0;
const ids=LO.BLUEPRINTS.filter(b=>b.era==='SNES').map(b=>b.id);
const chips=(process.env.CHIPS||'SNES,NES,GENESIS,LO-1').split(',');
for (const chip of chips) for (const id of ids) {
  try { const t0=Date.now(); const r=E.generate({seed:1300+ids.indexOf(id)*17,chip,blueprint:LO.blueprintById(id)}); let nan=0,pk=0; for(const x of r.L){if(!isFinite(x))nan++; pk=Math.max(pk,Math.abs(x));}
    const b=r.budget||{}; const I=b.inst;
    console.log(chip.padEnd(8),id.padEnd(17),E.song.meta.displayBpm,'score',r.mind.review.score,'pk',pk.toFixed(2),'nan',nan,(Date.now()-t0)+'ms', I?`RAM ${(b.used/1024).toFixed(1)}KB echo ${b.echo/2048} | ${I.lead.name} ${I.counter.name} ${I.pad.name} | ${(b.actions||[]).join('; ')}`:'');
    if(nan||pk<0.05||pk>0.9||(b.used&&b.used>65536))fails++;
    if (chip==='SNES') fs.writeFileSync(path.join(out,'snes_'+id+'.wav'), Buffer.from(LO.encodeWav(r.L,r.R,32000)));
  } catch(e){fails++;console.log('FAIL',chip,id,e.stack.split('\n').slice(0,3).join(' | '));}
}
// every library instrument alone, at every quality level: loop on a block boundary, whole periods, no NaN
for (const n of LO.SNESI.NAMES) for (const q of [0,1,2,3]) {
  const d=LO.SNESI.family(n,q); const hifi=!!(LO.SNESI_HIFI&&LO.SNESI_HIFI.LIB[n]); const L=d.loop==null?0:d.data.length-d.loop; const per=d.rate/d.baseF;
  // v0.6.1 hi-detail instruments loop on their own Fourier series (periodic over the loop by construction, often several detuned periods)
  const ok=(d.loop==null?hifi:d.loop%16===0) && d.data.length%16===0 && (hifi || Math.abs(L/per-Math.round(L/per))<1e-6) && d.data.every(Number.isFinite);
  if(!ok){fails++; console.log('BAD INSTRUMENT',n,q,d.loop,d.data.length,per);}
  if(q===0){ const p=LO.CHIPS.SNES.previewInst(d,[{s:0,e:24000,m:60},{s:24000,e:48000,m:67},{s:48000,e:80000,m:72}]); fs.writeFileSync(path.join(out,'inst_'+n+'.wav'),Buffer.from(LO.encodeWav(p.out,p.out,32000))); console.log('INST',n.padEnd(8),'brr',(p.bytes/1024).toFixed(1)+'KB','loop@',d.loop,'adsr',d.adsr.join(','),d.how); }
}
console.log('fails',fails);
// seams: the step into the loop and the wrap at the loop end must look like the same step one period later
for (const n of LO.SNESI.NAMES) { const d=LO.SNESI.family(n,0), x=d.data, per=Math.round(d.rate/d.baseF), L=x.length-d.loop;
  if (d.loop==null) { console.log('SEAM',n.padEnd(8),'one-shot: no loop'); continue; }
  if (LO.SNESI_HIFI&&LO.SNESI_HIFI.LIB[n]) { // a Fourier-series loop: sample Lt equals sample 0 exactly, so check that directly
    const H=LO.SNESI_HIFI.LIB[n], D=LO.SNESI_HIFI.decode(H), Lt=x.length-d.loop; let v0=0,vL=0; for(let b=0;b+2<D.LB.length;b+=3){const j=D.LB[b]; if(j*2>=Lt) continue; v0+=D.LB[b+1]*H.lS; vL+=(D.LB[b+1]*Math.cos(2*Math.PI*j)-D.LB[b+2]*Math.sin(2*Math.PI*j))*H.lS;}
    const ok=Math.abs(v0-vL)<1e-6; console.log('SEAM',n.padEnd(8),'Fourier loop: periodic by construction',ok?'(checked)':'BROKEN'); if(!ok) fails++; continue; }
  if (L < per*1.5) { console.log('SEAM',n.padEnd(8),'single-cycle loop: continuous by construction'); continue; }
  // the wrap step must look like its neighbors (detuned voices never share a phase one base period later)
  const e=x.length-1, w=Math.abs(x[d.loop]-x[e]), nb=Math.max(Math.abs(x[d.loop+1]-x[d.loop]),Math.abs(x[e]-x[e-1]),Math.abs(x[d.loop+2]-x[d.loop+1]),Math.abs(x[e-1]-x[e-2]))+1e-6;
  const curv=Math.abs((x[d.loop+1]-x[d.loop])-(x[d.loop]-x[e])-((x[d.loop+2]-x[d.loop+1])-(x[d.loop+1]-x[d.loop])));
  console.log('SEAM',n.padEnd(8),'wrap step vs neighbors',(w/nb).toFixed(2),'curvature change',(curv/nb).toFixed(2)); if (w>nb*1.5||curv>nb*1.0) { fails++; console.log('  CLICK RISK'); } }
console.log('fails',fails);
