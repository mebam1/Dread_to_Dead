// Feasibility QA: legal public actions and current revealed dice only.
// No state injection, forced dice, config edits, or future RNG inspection.
import {Game,CREATURES} from './engine.js';

const value={U:26,Q:23,G:22,R:17,E:10,B:7};
const total=(s,type)=>s.entities.filter(e=>e.type===type).length;
const floorEntities=s=>s.entities.filter(e=>e.floor!=null);

function setup(g){
  let guard=0;
  while(guard++<20){
    const desired={U:2,Q:2,G:1,R:1,E:total(g.s,'U')<2?1:0,B:0};
    const missing=t=>Math.max(0,desired[t]-total(g.s,t));
    let best=null;
    for(const node of g.s.web.nodes){
      if(node.bought||!missing(node.type))continue;
      const path=[];let n=node;
      while(n){if(!n.bought)path.unshift(n);n=g.s.web.nodes.find(x=>x.id===n.parent);}
      const cost=path.reduce((a,n)=>a+CREATURES[n.type].price,0);
      if(cost>g.s.money)continue;
      let priority=0;
      for(const n of path){
        const count=total(g.s,n.type);
        priority+=missing(n.type)*(n.type==='Q'&&count<1?90:n.type==='U'&&count<1?95:n.type==='G'?70:n.type==='R'?35:n.type==='U'?30:n.type==='Q'?40:8);
      }
      const score=priority/cost;
      if(!best||score>best.score)best={path,score};
    }
    if(best){for(const node of best.path)g.buy(node.id);continue;}
    if(g.s.resets&&g.s.money>=3&&['U','Q','G','R'].some(t=>missing(t))){g.resetWeb();continue;}
    break;
  }
  for(const e of [...floorEntities(g.s)])g.store(e.id);
  const used=new Set();
  const place=(type,floor)=>{const e=g.s.entities.find(e=>e.type===type&&!used.has(e.id));if(e){g.place(e.id,floor);used.add(e.id);return true;}return false;};
  place('U',1);place('Q',3);place('Q',5);place('G',2);
  if(!place('U',4))place('E',4);
  if(!place('R',6))place('B',6);
  // Fill unused rooms from extra supply/harvest/protection; keep at least one
  // occupant so the normal no-empty-start rule still applies.
  if(!floorEntities(g.s).length){const e=g.s.entities[0];if(e)g.place(e.id,1);}
  g.startService();
}

function score(before,after,actions){
  if(after.phase==='won')return 1e9;
  if(after.phase==='lost')return -1e9;
  const b=before.visitor,a=after.visitor;
  let result=((b.h-a.h)*b.t+a.f-b.f)*2+(after.stats.kills-before.stats.kills)*55;
  for(const e of floorEntities(before)){
    const n=after.entities.find(n=>n.id===e.id);
    result-=((e.p-(n?.p||0))*value[e.type]);
    if(!n)result-=value[e.type]*1.5;
    if(n&&after.phase==='roll')result-=(n.c-e.c)*0.38;
  }
  result+=a.a*1.4;
  result-=actions.filter(a=>a[0]==='active').length*1.7;
  if(after.phase==='service_end'&&after.stats.escaped>before.stats.escaped)result-=100;
  // The next distance is unknown. Publicly evaluate all six possible distances
  // only as a setup heuristic; never call roll() on a future-state clone.
  if(after.phase==='roll'){
    const opportunities=[];
    for(let d=1;d<=6;d++){
      let anxiety=a.a,fear=0;
      for(let i=1;i<=d;i++){
        const f=(a.pos+i-1)%6+1,e=after.entities.find(e=>e.floor===f);
        if(!e)continue;
        if(e.type==='U')anxiety=Math.min(9,anxiety+(i===d?4:2));
        if(e.type==='E')anxiety=Math.min(9,anxiety+(i===d?1:Math.min(2,anxiety)));
        if(i===d&&e.type==='Q')fear=4*Math.min(3,anxiety);
        if(i===d&&e.type==='B')fear=2;
      }
      opportunities.push(fear+(fear+a.f>=a.t?6:0));
    }
    opportunities.sort((a,b)=>a-b);
    result+=opportunities.reduce((sum,v,i)=>sum+v*((i+1)**3-i**3)/216,0)*0.6;
  }
  return result;
}

function pick(g){
  const before=g.s;let best=null;
  for(const die of new Set(g.s.dice)){
    const start=g.clone();start.choose(die);
    let states=[{g:start,actions:[]}];
    // Enumerate Bell uses, including stopping before consuming all charges.
    for(const bell of start.s.entities.filter(e=>e.type==='B'&&e.floor!=null)){
      const expanded=[];
      for(const plan of states){
        expanded.push(plan);let current=plan;
        for(let i=0;i<bell.uses&&current.g.s.phase==='prepare';i++){
          const next=current.g.clone();next.active(bell.id);
          current={g:next,actions:[...current.actions,['active',bell.id]]};expanded.push(current);
        }
      }
      states=expanded;
    }
    // Try a useful repair or repeated repair of a damaged target.
    const repaired=[];
    for(const plan of states){
      repaired.push(plan);if(plan.g.s.phase!=='prepare')continue;
      const repair=plan.g.s.entities.find(e=>e.type==='R'&&e.floor!=null);
      if(!repair||plan.g.activeReason(repair.id))continue;
      for(const target of floorEntities(plan.g.s).filter(e=>e.c>0)){
        let current=plan;
        while(current.g.s.visitor.a>=2&&current.g.s.entities.find(e=>e.id===target.id)?.c>0){
          const next=current.g.clone();next.active(repair.id,target.id);
          current={g:next,actions:[...current.actions,['active',repair.id,target.id]]};repaired.push(current);
        }
      }
    }
    states=repaired;
    for(const guard of start.s.entities.filter(e=>e.type==='G'&&e.floor!=null)){
      const expanded=[];
      for(const plan of states){
        expanded.push(plan);if(plan.g.s.phase!=='prepare')continue;
        const floors=[...new Set(plan.g.attackList(plan.g.path()).map(x=>x.floor))];
        const targets=floorEntities(plan.g.s).filter(e=>floors.includes(e.floor));
        const visit=(current,left)=>{
          if(!left)return;
          for(const target of targets){
            const next=current.g.clone();next.active(guard.id,target.id);
            const candidate={g:next,actions:[...current.actions,['active',guard.id,target.id]]};
            expanded.push(candidate);visit(candidate,left-1);
          }
        };
        visit(plan,guard.uses);
      }
      states=expanded;
    }
    for(const plan of states){
      const after=plan.g.s.phase==='prepare'?plan.g.preview(die).state:plan.g.s;
      const rating=score(before,after,plan.actions);
      if(!best||rating>best.score)best={die,actions:plan.actions,score:rating};
    }
  }
  return best;
}

export function verify(seed,maxTurns=300){
  const g=new Game(seed);let turns=0;
  while(!['won','lost'].includes(g.s.phase)&&turns<maxTurns){
    if(g.s.phase==='management'){setup(g);continue;}
    if(['guest_end','service_end'].includes(g.s.phase)){g.advance();continue;}
    if(g.s.phase==='roll')g.roll();
    if(g.s.phase==='choose'){
      const plan=pick(g);g.choose(plan.die);
      for(const [,owner,target] of plan.actions){if(g.s.phase!=='prepare')break;g.active(owner,target);}
      if(g.s.phase==='prepare')g.move();
      turns++;
    }
  }
  return {seed,phase:g.s.phase,round:g.s.round+1,turns,...g.s.stats,money:g.s.money};
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-campaign.mjs')){
  const start=Number(process.argv[2]||1),count=Number(process.argv[3]||12);
  for(let seed=start;seed<start+count;seed++){
    const result=verify(seed);console.log(JSON.stringify(result));if(result.phase==='won')break;
  }
}
