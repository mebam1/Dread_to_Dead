/** Thin manual-play console: only executes explicit CLI commands; never chooses. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const save=path.resolve(here,request.save);
function run(input){
  const p=spawnSync(process.execPath,[path.join(here,'cli.mjs'),'--save',save,'--command-json','-'],{input:JSON.stringify(input),encoding:'utf8'});
  if(p.status!==0)throw new Error(p.stderr);
  return JSON.parse(p.stdout);
}
let out;
for(const command of request.commands||[])out=run(command);
if(!out)out=run({command:'show'});
if(request.roll!==false&&out.view.phase==='roll')out=run({command:'roll'});
const v=out.view;
const compact=p=>({slot:p.slot??p.selected?.slot,value:p.selected?.value,effective:p.selected?.effectiveValue,path:p.path,roll:p.requiresRoll,
  summary:p.summary,entities:p.after?.entities.map(e=>({id:e.id,c:e.c,p:e.p,uses:e.uses,seal:e.seal,fire:e.fire})),uncertainty:p.uncertainty});
const previews=v.phase==='choose'||v.phase==='prepare'?run({command:'preview'}).result:null;
const plans=[];
for(const plan of request.plans||[])plans.push({plan,result:compact(run({command:'preview',args:plan.slot===undefined?[]:[plan.slot],actions:plan.actions||[]}).result)});
const short=p=>({s:p.slot,n:p.value,eff:p.effective,path:p.path,F:p.summary.fear,H:p.summary.hearts,kill:p.summary.killed,loss:p.summary.losses.map(e=>[e.id,e.tokens,e.destroyed]),a:p.summary.anxietyAfter,g:p.summary.greedAfter,p:p.summary.prophecyAfter,after:p.entities?.map(e=>[e.id,e.c,e.p,e.uses,e.seal]),uncertain:p.uncertainty});
const pp=x=>{const p=short(compact(x));return [p.s,p.n,p.path.at(-1),p.F,p.H,p.loss,p.a,p.g,p.p,p.after?.filter(e=>{const b=v.entities.find(b=>b.id===e[0]);return !b||b.c!==e[1]||b.p!==e[2]||b.uses!==e[3]}).map(e=>e.slice(0,4))];};
console.log(JSON.stringify({save:request.save,phase:v.phase,at:[v.act,v.currentNode,v.visits,v.souls,v.floorCount],g:v.visitor?[v.guestIndex,v.visitor.turn,v.visitor.pos,v.visitor.f,v.visitor.t,v.visitor.h,v.visitor.a,v.visitor.greed,v.visitor.prophecy,v.visitor.pattern]:null,
  units:v.entities.map(e=>e.id+':'+e.type+'@'+(e.floor??'R')+'/'+e.c+'/'+e.p+(e.upgraded?'+':'')+(e.uses?'u'+e.uses:'')+(e.lure?'L':'')+(e.seal?'s'+e.seal:'')),
  dice:v.dice.map(d=>[d.slot,d.value,d.type]),available:v.availableNodes.map(n=>[n.id,n.kind,n.guests?.map(g=>[g.t,g.h,g.pattern])]),map:out.command==='map'?v.map.map(n=>[n.id,n.kind,n.next]):undefined,
  offer:v.node?.contents,reward:v.reward,reason:v.reason,result:out.result,
  events:out.events.filter(e=>['kill','destroy','lost','purchase','creature_reward','expand','upgrade','recovery','act_start'].includes(e.kind)).map(e=>e.text),
  previews:Array.isArray(previews)?previews.map(pp):previews?pp(previews):null,
  plans:plans.map(x=>({plan:x.plan,result:short(x.result)}))}));
