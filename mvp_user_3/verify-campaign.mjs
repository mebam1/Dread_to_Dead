// Legal automatic-play smoke check. Uses current public map, offers and rolled dice.
// No asset injection, forced dice, future roll() calls, or hidden-node contents.
// This policy is fixed across 31001, 31002, 31003; a failure remains a failure.
import {Game,CREATURES,DICE,creatureDef,ANXIETY_CAP} from './engine.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const value={U:38,Q:34,G:42,R:28,E:22,B:12};
const total=(s,t)=>s.entities.filter(e=>e.type===t&&e.p>0).length;
const living=s=>s.entities.filter(e=>e.floor!=null&&e.p>0);
const need=(s,t)=>Math.max(0,({U:2,Q:2,G:2,R:1,E:1,B:0}[t])-total(s,t));
const rankCreature=(s,t)=>({U:total(s,t)?30:120,Q:total(s,t)?35:115,G:total(s,t)?65:110,R:total(s,t)?8:65,E:total(s,t)?5:24,B:8}[t])+(need(s,t)>0?15:0);

function arrange(g){
  for(const e of [...living(g.s)])g.store(e.id);
  const used=new Set();
  const place=(type,floor)=>{
    const e=g.s.entities.filter(e=>e.type===type&&!used.has(e.id)).sort((a,b)=>(b.upgraded?2:0)+b.p-((a.upgraded?2:0)+a.p))[0];
    if(!e)return false;g.place(e.id,floor);used.add(e.id);return true;
  };
  place('U',1);place('G',2);place('Q',3);
  if(!place('U',4)&&!place('E',4))place('R',4);
  place('Q',5);
  if(!place('G',6)&&!place('R',6))place('B',6);
  for(let f=7;f<=g.s.floorCount;f++){
    if(!place('R',f)&&!place('E',f)&&!place('G',f)&&!place('Q',f))place('U',f);
  }
  for(let f=1;f<=g.s.floorCount;f++)if(!g.entityAt(f)){
    for(const type of ['U','Q','G','R','E','B'])if(place(type,f))break;
  }
}

function pickNode(g,policy){
  const missing=g.s.entities.reduce((n,e)=>n+CREATURES[e.type].maxP-e.p,0);
  const specials=g.s.equipped.filter(t=>t!=='normal').length;
  const scores={boss:100,recovery:missing>=2?100:65,discovery:specials<3?90:40,event:60,shop:g.s.money>=4?85:20,normal:10,elite:policy==='conservative'?-100:25};
  return g.availableNodes().map(n=>({n,score:scores[n.kind]-(n.guests?.reduce((x,v)=>x+v.t*v.h+(v.pattern==='route'?10:0),0)||0)/1000})).sort((a,b)=>b.score-a.score||a.n.column-b.n.column)[0].n;
}

function shop(g){
  if(g.s.entities.length>=6&&g.s.floorCount<8&&g.s.money>=g.expansionCost()+5)g.expand();
  const stock=g.view().node.contents.stock;
  for(let pass=0;pass<8;pass++){
    const choices=stock.filter(item=>!item.bought&&CREATURES[item.type].price<=g.s.money&&need(g.s,item.type)>0).sort((a,b)=>rankCreature(g.s,b.type)-rankCreature(g.s,a.type));
    if(!choices.length)break;
    g.buy(choices[0].slot);choices[0].bought=true;
  }
  arrange(g);g.leave();
}

function recover(g){
  const hurt=g.s.entities.filter(e=>e.p<CREATURES[e.type].maxP).sort((a,b)=>(value[b.type]+(b.upgraded?10:0))-(value[a.type]+(a.upgraded?10:0)));
  if(hurt.length>=2||(hurt.length&&['U','G'].includes(hurt[0].type))){
    let budget=2;const plan={};for(const e of hurt){const amount=Math.min(budget,CREATURES[e.type].maxP-e.p);if(amount){plan[e.id]=amount;budget-=amount;}if(!budget)break;}g.recover(plan);return;
  }
  const choice=g.s.entities.filter(e=>!e.upgraded).sort((a,b)=>({G:70,Q:60,U:50,R:35,B:20,E:15}[b.type])-({G:70,Q:60,U:50,R:35,B:20,E:15}[a.type]))[0];
  if(choice)g.upgrade(choice.id);else if(hurt.length)g.recover({[hurt[0].id]:1});else g.skipRecovery();
}

function takeDie(g,type,event=false){
  let slot=g.s.equipped.indexOf('normal');
  if(slot<0&&type==='anxiety')slot=g.s.equipped.findIndex(t=>t!=='anxiety');
  if(slot>=0){if(event)g.eventChoose('die',slot);else g.claimDie(slot);}
  else if(event)g.eventChoose('souls');else g.skipDie();
}

function expectedHarvest(s,v){
  const possible=s.equipped.map(type=>DICE[type].faces.map(d=>{
    let a=Math.min(ANXIETY_CAP,v.a+(type==='anxiety'&&d===3?1:0)),fear=0;
    for(let step=1;step<=d;step++){
      const floor=(v.pos+step-1)%s.floorCount+1,e=s.entities.find(e=>e.floor===floor);if(!e)continue;const def=creatureDef(e);
      if(e.type==='U')a=Math.min(ANXIETY_CAP,a+(step===d?def.arrivalAnxiety:def.passAnxiety));
      if(e.type==='E')a=Math.min(ANXIETY_CAP,a+(step===d?def.arrivalAnxiety:a));
      if(step===d&&e.type==='Q')fear=a;
      if(step===d&&e.type==='B')fear=3;
    }
    return fear+(fear+v.f>=v.t?6:0);
  }));
  let result=0;for(const a of possible[0])for(const b of possible[1])for(const c of possible[2])result+=Math.max(a,b,c)/216;
  return result;
}

function score(before,p,actions){
  const after=p.state,b=before.visitor,a=after.visitor;
  if(after.phase==='lost')return -1e8;
  let rating=((b.h-a.h)*b.t+a.f-b.f)*2.6+(after.stats.kills-before.stats.kills)*100;
  for(const e of living(before)){
    const n=after.entities.find(x=>x.id===e.id),worth=value[e.type]+(e.upgraded?15:0);
    rating-=(e.p-(n?.p||0))*worth;
    if(!n)rating-=worth*1.8;
    else if(!p.summary.killed)rating-=(n.c-e.c)*0.55;
  }
  rating+=(a?.a||0)*1.4-actions.length*1.8;
  if(!p.summary.killed&&!p.summary.escaped)rating+=expectedHarvest(after,a)*0.55;
  if(p.uncertainty?.length)rating-=p.uncertainty.reduce((sum,e)=>sum+value[before.entities.find(x=>x.id===e.id).type]*(e.destroyed?2.8:1),0)/p.uncertainty.length;
  if(p.summary.escaped)rating-=160;
  return rating;
}

function planTurn(g){
  let best=null;
  for(const {slot} of g.s.dice){
    const prepared=g.clone();prepared.choose(slot);
    const rating=actions=>{const preview=g.preview(slot,actions);return {actions,preview,score:score(g.s,preview,actions)};};
    let plans=[rating([])];
    const keep=items=>items.sort((a,b)=>b.score-a.score).slice(0,16);
    for(const bell of living(prepared.s).filter(e=>e.type==='B')){
      const next=[...plans];for(const plan of plans)for(let count=1;count<=bell.uses;count++)next.push(rating([...plan.actions,...Array.from({length:count},()=>({kind:'active',entityId:bell.id}))]));plans=keep(next);
    }
    const repair=living(prepared.s).find(e=>e.type==='R');
    if(repair&&prepared.s.visitor.a>=2){
      const next=[...plans];for(const plan of plans)for(const e of living(prepared.s).filter(e=>e.c>0)){
        for(let count=1;count<=Math.min(Math.floor(prepared.s.visitor.a/2),Math.ceil(e.c/creatureDef(repair).repairPower));count++)next.push(rating([...plan.actions,...Array.from({length:count},()=>({kind:'active',entityId:repair.id,targetId:e.id}))]));
      }plans=keep(next);
    }
    const targetFloors=new Set(prepared.attackList(prepared.path()).map(hit=>hit.floor));
    for(const guard of living(prepared.s).filter(e=>e.type==='G')){
      for(let charge=0;charge<guard.uses;charge++){
        const next=[...plans];for(const plan of plans){
          if(plan.actions.filter(a=>a.entityId===guard.id).length>=guard.uses)continue;
          for(const e of living(prepared.s).filter(e=>targetFloors.has(e.floor)))next.push(rating([...plan.actions,{kind:'active',entityId:guard.id,targetId:e.id}]));
        }plans=keep(next);
      }
    }
    const candidate=plans[0];if(!best||candidate.score>best.score)best={...candidate,slot};
  }
  return best;
}

export function verify(seed,maxTurns=500,policy='mixed'){
  if(!['mixed','conservative'].includes(policy))throw new Error('Unknown fixed policy '+policy);
  const g=new Game(seed);let turns=0,specialChoices=0;const started=Date.now();
  while(!['won','lost'].includes(g.s.phase)&&turns<maxTurns){
    const phase=g.s.phase;
    if(phase==='map'){g.visit(pickNode(g,policy).id);continue;}
    if(phase==='management'){arrange(g);g.startService();continue;}
    if(phase==='shop'){shop(g);continue;}
    if(phase==='recovery'){recover(g);continue;}
    if(phase==='discovery'||phase==='die_reward'){takeDie(g,phase==='discovery'?g.view().node.contents.die:g.s.reward.die);continue;}
    if(phase==='anomaly_reward'){
      const choice=g.s.reward.creatures.map((type,index)=>({index,score:rankCreature(g.s,type)})).sort((a,b)=>b.score-a.score)[0];g.claimCreature(choice.index);continue;
    }
    if(phase==='event'){
      const event=g.view().node.contents;
      if(event.event==='luggage')takeDie(g,event.die,true);
      else if(event.event==='sealed'&&g.s.money>=3&&need(g.s,event.creature)>0)g.eventChoose('buy');
      else if(event.event==='contract'){
        const redundant=g.s.entities.find(e=>e.type==='B'&&!e.upgraded&&g.s.entities.length>=6);
        if(redundant)g.eventChoose('sacrifice',redundant.id);else g.leave();
      }else g.leave();continue;
    }
    if(phase==='roll'){g.roll();continue;}
    if(phase==='choose'){
      const plan=planTurn(g);if(g.s.dice[plan.slot].type!=='normal')specialChoices++;g.choose(plan.slot);
      for(const action of plan.actions){if(g.s.phase!=='prepare')break;g.active(action.entityId,action.targetId);}
      if(g.s.phase==='prepare')g.move();turns++;continue;
    }
    throw new Error('Unhandled campaign phase '+phase);
  }
  const history=g.s.history;
  const result={seed,policy,phase:['won','lost'].includes(g.s.phase)?g.s.phase:'turn-limit',reason:g.s.reason,act:g.s.act,completed:g.s.completed,turns,...g.s.stats,souls:g.s.money,floorCount:g.s.floorCount,equipped:g.s.equipped,specialChoices,elapsedSeconds:Math.round((Date.now()-started)/1000),
    perAct:[1,2,3].map(act=>({act,visits:history.filter(e=>e.act===act&&e.kind==='node_complete').length,turns:history.filter(e=>e.act===act&&e.kind==='choose').length,kills:history.filter(e=>e.act===act&&e.kind==='kill').length})),
    path:history.filter(e=>e.kind==='visit').map(e=>({node:e.nodeId,kind:e.kindName,act:e.act,depth:e.depth})),finalCreatures:g.s.entities.map(e=>({name:creatureDef(e).name,id:e.id,tokens:e.p,maxTokens:creatureDef(e).maxP,floor:e.floor,upgraded:e.upgraded}))};
  return {result,history};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),policy=args.includes('--conservative')?'conservative':'mixed';
  const seedArgs=args.filter(arg=>arg!=='--conservative');
  const seeds=seedArgs.length?seedArgs.map(Number):[31001,31002,31003];
  await mkdir(new URL('./validation/',import.meta.url),{recursive:true});
  for(const seed of seeds){
    const run=verify(seed,500,policy);await writeFile(new URL('./validation/campaign-'+(policy==='conservative'?'conservative-':'')+seed+'.json',import.meta.url),JSON.stringify({classification:'automatic legal play',policy:policy==='conservative'?'fixed public-information heuristic; avoids elites':'fixed public-information heuristic; mixed route',...run},null,2)+'\n');
    console.log(JSON.stringify(run.result));
  }
}
