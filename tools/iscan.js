// v0.6 Instrument Scan: measure known synthetic instruments, rebuild them, and read a tiny SoundFont
const fs=require('fs'),path=require('path'); const dir=path.join(__dirname,'..','app','src'); global.self=global;
for (const f of ['core.js','chip_common.js','snes_inst.js','snes_lib.js','snes_hifi.js','chip_snes.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
let fails=0; const sr=44100, T=2.0, n=Math.round(sr*T);
const mk=fn=>{const x=new Float32Array(n); for(let i=0;i<n;i++) x[i]=fn(i/sr); return x;};
// A: sustained, 330 Hz, odd harmonics (clarinet-ish), 5.5 Hz vibrato of 20 cents, 60 ms attack
let ph=0; const A=mk(t=>{const f=330*Math.pow(2,20/1200*Math.sin(2*Math.PI*5.5*t)); ph+=2*Math.PI*f/sr; let s=0; for(let k=1;k<=15;k+=2) s+=Math.sin(k*ph)/k; return s*Math.min(1,t/0.06)*(t>1.8?Math.max(0,1-(t-1.8)/0.15):1)*0.5;});
// B: plucked 196 Hz, inharmonic (B=0.0008), tau 0.5 s, upper partials die faster
const B=mk(t=>{let s=0; for(let k=1;k<=12;k++){const f=196*k*Math.sqrt(1+0.0008*k*k); s+=Math.sin(2*Math.PI*f*t)/k*Math.exp(-t/(0.5/(1+0.4*(k-1))));} return s*0.4*Math.min(1,t/0.002);});
for (const [nm,x,exp] of [['SUSTAIN',A,{f0:330,kind:0}],['PLUCK',B,{f0:196,kind:1}]]) {
  const p=LO.SNESI.measure([{data:x,sr}]); p.name=nm;
  console.log(nm,'f0',p.f0.toFixed(1),'kind',p.kind,'atk',p.attackMs.toFixed(0)+'ms','sus',p.sustainLvl.toFixed(2),'tau',p.decayTau.toFixed(2),'B',p.B.toExponential(1),'vib',p.vibRate+'Hz',p.vibDepth.toFixed(1)+'c','oddEven',p.oddEven.toFixed(1),'tilt',p.tilt.toFixed(1),'noise',p.noiseAttack.toFixed(2),p.noiseSteady.toFixed(2),'F',p.F.join('/'),'count',p.count);
  console.log('   h',p.h.join(' '));
  if (Math.abs(1200*Math.log2(p.f0/exp.f0))>20 || p.kind!==exp.kind) { fails++; console.log('   MISMEASURED'); }
  for (const q of [0,2]) { const d=LO.SNESI.fromProfile(p,q,{}); const per=d.rate/d.baseF, L=d.data.length-d.loop; const ok=d.loop%16===0&&d.data.length%16===0&&Math.abs(L/per-Math.round(L/per))<1e-6&&d.data.every(Number.isFinite); if(!ok){fails++;console.log('   BAD REBUILD',q);} 
    const pv=LO.CHIPS.SNES.previewInst(d,[{s:0,e:32000,m:57}]); console.log('   rebuild q'+q,'brr',(pv.bytes/1024).toFixed(1)+'KB adsr',d.adsr.join(','),d.kind); if(q===0) fs.writeFileSync(path.join(require('os').tmpdir(),'lo_out','scan_'+nm+'.wav'),Buffer.from(LO.encodeWav(pv.out,pv.out,32000))); }
}
// a tiny SoundFont made right here: one instrument, two samples
function sf2(){ const smps=[new Int16Array(4000).map((_,i)=>Math.round(12000*Math.sin(2*Math.PI*440*i/22050))), new Int16Array(4000).map((_,i)=>Math.round(12000*Math.sin(2*Math.PI*220*i/22050)))];
  const chunk=(id,data)=>{const b=Buffer.alloc(8+data.length+(data.length&1)); b.write(id,0); b.writeUInt32LE(data.length,4); data.copy(b,8); return b;};
  const list=(type,parts)=>{const body=Buffer.concat([Buffer.from(type),...parts]); return chunk('LIST',body);};
  const smplData=Buffer.alloc((4000+46)*2*2); let off=0; const starts=[]; for(const s of smps){starts.push(off/2); for(const v of s){smplData.writeInt16LE(v,off); off+=2;} off+=92;}
  const shdr=Buffer.alloc(46*3); [['SINE A4',0,69],['SINE A3',1,57]].forEach(([nm,i,p],r)=>{const o=r*46; shdr.write(nm,o); shdr.writeUInt32LE(starts[i],o+20); shdr.writeUInt32LE(starts[i]+4000,o+24); shdr.writeUInt32LE(starts[i]+1000,o+28); shdr.writeUInt32LE(starts[i]+3000,o+32); shdr.writeUInt32LE(22050,o+36); shdr.writeUInt8(p,o+40);}); shdr.write('EOS',92);
  const inst=Buffer.alloc(44); inst.write('Test Flute',0); inst.writeUInt16LE(0,20); inst.write('EOI',22); inst.writeUInt16LE(2,42);
  const ibag=Buffer.alloc(12); ibag.writeUInt16LE(0,0); ibag.writeUInt16LE(1,4); ibag.writeUInt16LE(2,8);
  const igen=Buffer.alloc(12); igen.writeUInt16LE(53,0); igen.writeUInt16LE(0,2); igen.writeUInt16LE(53,4); igen.writeUInt16LE(1,6);
  const body=Buffer.concat([Buffer.from('sfbk'), list('INFO',[chunk('ifil',Buffer.from([2,0,1,0]))]), list('sdta',[chunk('smpl',smplData)]), list('pdta',[chunk('inst',inst),chunk('ibag',ibag),chunk('igen',igen),chunk('shdr',shdr)])]);
  const b=chunk('RIFF',body); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength); }
const S=LO.SNESI.parseSF2(sf2()); console.log('SF2 insts',S.insts.map(i=>i.name+' x'+i.samples.length).join(', '),'samples',S.samples.map(s=>s.name+'@'+s.rate).join(', '));
const fam=LO.SNESI.measure(S.insts[0].samples.map(S.read)); console.log('SF2 family f0',fam&&fam.f0.toFixed(1),'n',fam&&fam.n);
if (!S.insts.length || !fam || fam.n!==2) fails++;
console.log('fails',fails);
