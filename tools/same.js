const fs=require('fs'),path=require('path'); const dir=''+require('path').join(__dirname,'..','app','src')+''; global.self=global;
for (const f of ['core.js','blueprints.js','composer.js']) eval(fs.readFileSync(path.join(dir,f),'utf8'));
function survey(label, mk){ const S={prog:new Set(),form:new Set(),drums:new Set(),lead:new Set(),bassStyle:new Set(),rhy:new Set(),bpm:[],secs:new Set()}; const N=40;
 for(let i=0;i<N;i++){ const s=LO.compose(mk(i)); const m=s.meta;
  const rel=s.bars.slice(0,16).map(b=>((b.chord[0]%12)+12)%12).join('-'); S.prog.add(rel);
  S.secs.add(s.sections.map(x=>x.name+x.bars).join(' ')); S.drums.add(m.drumStyle); S.lead.add(m.leadTimbre); S.bassStyle.add(m.vector.bassStyle); S.bpm.push(m.bpm);
  const r=s.parts.lead.filter(n=>n.t<16).map(n=>n.d).join(','); S.rhy.add(r); }
 console.log(label.padEnd(26),'chord-roots',S.prog.size+'/'+N,'| song shapes',S.secs.size,'| drum styles',S.drums.size,'| lead sounds',S.lead.size,'| bass styles',S.bassStyle.size,'| bpm',Math.min(...S.bpm)+'-'+Math.max(...S.bpm));
}
survey('AUTO game music', i=>({seed:1000+i*7919}));
survey('BATTLE', i=>({seed:1000+i*7919,purpose:'BATTLE'}));
survey('style DOWNTEMPO', i=>({seed:1000+i*7919,blueprint:LO.blueprintById('downtempo')}));
survey('style TECHNO', i=>({seed:1000+i*7919,blueprint:LO.blueprintById('techno')}));
