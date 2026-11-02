// Normal starting assets and legal exposed choices, across all three first paths.
// No escape, rearrangement, future dice, injected damage or extra resources.
import {Game,creatureDef,RULE_VERSION} from './engine.js';
import {plan} from './verify-campaign.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

function simpleChoice(g){
 const source=g.clone();source.s.history=[];source.s.logs=[];
 return source.s.dice.map(({slot})=>{
  const p=source.preview(slot),v=source.s.visitor;
  let score=(p.summary.hearts*v.t+p.summary.fear)*5+(p.summary.killed?100:0)+(p.summary.anxietyAfter-v.a)+(p.summary.prophecyAfter-v.prophecy)*2;
  for(const e of source.s.entities){const after=p.state.entities.find(x=>x.id===e.id);score-=(e.p-(after?.p||0))*18+(after?after.c-e.c:12)*.4;}
  if(p.summary.lost)score-=1e6;
  return {slot,actions:[],score};
 }).sort((a,b)=>b.score-a.score)[0];
}
export function opening(seed,column,policy='simple'){
 const g=new Game(seed);g.visit(`a1-d1-c${column}`);const guests=structuredClone(g._node().guests);g.startService();let turns=0;
 while(['roll','choose','prepare'].includes(g.s.phase)&&turns<100){
  if(g.s.phase==='roll')g.roll();
  if(g.s.phase==='choose'){
   const choice=policy==='simple'?simpleChoice(g):plan(g,'spread');g.choose(choice.slot);
   for(const action of choice.actions){if(g.s.phase!=='prepare')break;g.active(action.entityId,action.targetId);}
  }
  if(g.s.phase==='prepare')g.move();turns++;
 }
 return {seed,column,policy,phase:g.s.phase,clear:g.s.phase==='anomaly_reward',turns,kills:g.s.stats.kills,destroyed:g.s.stats.destroyed,
  tokens:g.s.entities.reduce((n,e)=>n+e.p,0),guests:guests.map(g=>({id:g.id,name:g.name,t:g.t,h:g.h,power:g.power,attackText:g.attackText})),
  survivors:g.s.entities.map(e=>({name:creatureDef(e).name,tokens:e.p,progress:e.c})),
  history:seed===31001&&column===1?g.s.history:undefined};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const label=process.argv[2]||RULE_VERSION,count=Number(process.argv[3]||20),results=[];
 for(const policy of ['simple','cautious'])for(let seed=31001;seed<31001+count;seed++)for(let column=0;column<3;column++)results.push(opening(seed,column,policy));
 const summary={ruleVersion:RULE_VERSION,label,seeds:[31001,31000+count],columns:[0,1,2],startingLayout:'unchanged',escape:false,
  policies:['simple','cautious'].map(policy=>{const r=results.filter(x=>x.policy===policy),wins=r.filter(x=>x.clear);return {policy,runs:r.length,clears:wins.length,losses:r.filter(x=>x.phase==='lost').length,turnLimit:r.filter(x=>!x.clear&&x.phase!=='lost').length,
   averageTurns:Math.round(r.reduce((s,x)=>s+x.turns,0)/r.length*10)/10,averageDestroyed:Math.round(r.reduce((s,x)=>s+x.destroyed,0)/r.length*10)/10,
   minRemainingTokens:Math.min(...r.map(x=>x.tokens)),averageRemainingTokens:Math.round(r.reduce((s,x)=>s+x.tokens,0)/r.length*10)/10};})};
 await mkdir(new URL('./validation/balance-v1.2/',import.meta.url),{recursive:true});
 await writeFile(new URL('./validation/balance-v1.2/opening-'+label+'.json',import.meta.url),JSON.stringify({summary,results},null,2)+'\n');
 console.log(JSON.stringify(summary));
}
