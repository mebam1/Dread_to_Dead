// Fixed public-information policy: normal APIs, visible maps/offers/dice only.
// It never injects assets, edits the run, samples future dice, or retries a seed.
import {Game,CREATURES,creatureDef,RULE_VERSION} from './engine.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const count=(s,t)=>s.entities.filter(e=>e.type===t).length;
const living=s=>s.entities.filter(e=>e.floor!=null&&e.p>0);
const worth={gaze:70,footsteps:40,owner:90,mouse:40,portrait:25,safe:50,nepenthes:50,barnacle:65,collector:30,runes:65,roulette:60,prophet:35,samara:30};
const needs={gaze:2,footsteps:1,owner:2,mouse:1,portrait:1,safe:1,nepenthes:1,barnacle:1,collector:1,runes:2,roulette:1,prophet:1,samara:1};
function rank(s,type){return worth[type]+(count(s,type)===0?40:0)-(count(s,type)>=needs[type]?80:0);}

function arrange(g,policy){
  if(policy!=='compact'&&g.s.entities.length===4&&g.s.entities.every(e=>e.origin.kind==='start'&&e.floor!=null))return;
  const chosen=[...g.s.entities].sort((a,b)=>rank(g.s,b.type)+b.p*12+(b.upgraded?15:0)-(rank(g.s,a.type)+a.p*12+(a.upgraded?15:0))).slice(0,g.s.floorCount);
  for(const e of [...living(g.s)])g.store(e.id);
  const order=['gaze','footsteps','owner','barnacle','runes','safe','gaze','roulette','owner','nepenthes','mouse','prophet','samara','portrait','collector'];
  const sorted=[];
  for(const type of order){const i=chosen.findIndex(e=>e.type===type);if(i>=0)sorted.push(chosen.splice(i,1)[0]);}
  sorted.push(...chosen);
  sorted.forEach((e,i)=>g.place(e.id,policy!=='compact'&&sorted.length>1?Math.round(i*(g.s.floorCount-1)/(sorted.length-1))+1:i+1));
}
function node(g,policy){
  const missing=g.s.entities.reduce((n,e)=>n+creatureDef(e).maxP-e.p,0),specials=g.s.equipped.filter(t=>t!=='normal').length;
  const score={boss:100,recovery:missing>=2?110:65,discovery:specials<2?85:20,event:55,shop:g.s.money>=4?90:10,normal:30,elite:0};
  const threat=n=>(n.guests||[]).reduce((sum,v)=>sum+v.t*v.h+(v.pattern==='route'?18:0),0);
  return g.availableNodes().sort((a,b)=>score[b.kind]-score[a.kind]||(policy!=='compact'?threat(a)-threat(b):0)||a.column-b.column)[0];
}
function shop(g,policy){
  if(g.s.entities.length>g.s.floorCount&&g.s.floorCount<10&&g.s.money>=g.expansionCost()+4)g.expand();
  for(let i=0;i<8;i++){
    const items=g.view().node.contents.stock.filter(x=>!x.bought&&CREATURES[x.type].price<=g.s.money&&count(g.s,x.type)<needs[x.type]).sort((a,b)=>rank(g.s,b.type)-rank(g.s,a.type));
    if(!items.length)break;g.buy(items[0].slot);
  }
  arrange(g,policy);g.leave();
}
function recovery(g){
  const hurt=g.s.entities.filter(e=>e.p<creatureDef(e).maxP).sort((a,b)=>worth[b.type]-worth[a.type]);
  if(hurt.length){const plan={};let budget=2;for(const e of hurt){const n=Math.min(budget,creatureDef(e).maxP-e.p);if(n){plan[e.id]=n;budget-=n;}if(!budget)break;}g.recover(plan);return;}
  const rankUpgrade={owner:100,gaze:85,barnacle:65,footsteps:60,prophet:55,runes:50,roulette:45,nepenthes:40,mouse:35,safe:25,samara:20,portrait:15,collector:10};
  const e=g.s.entities.filter(e=>!e.upgraded).sort((a,b)=>rankUpgrade[b.type]-rankUpgrade[a.type])[0];if(e)g.upgrade(e.id);else g.skipRecovery();
}
function takeDie(g,type,event=false){
  let slot=g.s.equipped.indexOf('normal');
  if(slot<0&&type==='anxiety')slot=g.s.equipped.findIndex(t=>t!=='anxiety');
  if(slot>=0){if(event)g.eventChoose('die',slot);else g.claimDie(slot);}else if(event)g.eventChoose('souls');else g.skipDie();
}
function score(before,p,actions,policy){
  if(p.summary.lost)return -1e8;
  const b=before.visitor,a=p.state.visitor;
  const aggressive=policy==='aggressive';
  let n=(p.summary.hearts*b.t+(a?.f||0)-b.f)*(aggressive?9:3)+(p.summary.killed?130:0);
  n+=((a?.a||0)-b.a)*0.9+((a?.prophecy||0)-b.prophecy)*2+((a?.greed||0)-b.greed)*2;
  for(const e of living(before)){const after=p.state.entities.find(x=>x.id===e.id);n-=(e.p-(after?.p||0))*(worth[e.type]+25)*(aggressive?0.5:1);if(!after)n-=worth[e.type]*(aggressive?1:1.7);else n-=(after.c-e.c)*1.1;}
  n-=actions.length*0.2;
  for(const risk of p.uncertainty||[])n-=(risk.destroyed?worth[before.entities.find(e=>e.id===risk.id).type]*1.5:15)/(p.uncertainty.length||1);
  if(p.summary.escaped)n-=policy==='survival'?25:170;return n;
}
function possibleActions(prepared,policy){
  if(prepared.s.phase!=='prepare')return [];
  const out=[];
  for(const e of living(prepared.s)){
    if(e.type==='prophet'||prepared.activeReason(e.id))continue;
    if(creatureDef(e).targeted){for(const targetId of prepared.activeTargets(e.id))out.push({kind:'active',entityId:e.id,targetId});}
    else out.push({kind:'active',entityId:e.id});
  }
  if(policy==='survival'&&prepared._node().kind!=='boss'&&prepared.s.escape===null){
    for(let floor=1;floor<=prepared.s.floorCount;floor++)if(!prepared.entityAt(floor))out.push({kind:'escape',floor});
  }
  return out;
}
export function plan(g,policy){
  // Slim preview clones retain every gameplay value but omit past logs to bound cost.
  const source=g.clone();source.s.history=[];source.s.logs=[];
  let best=null;
  for(const {slot} of source.s.dice){
    const rate=actions=>{const p=source.preview(slot,actions);return {slot,actions,preview:p,score:score(source.s,p,actions,policy)};};
    let beam=[rate([])];
    for(let depth=0;depth<2;depth++){
      const next=[...beam];
      for(const current of beam){
        const c=source.clone();c._simulating=true;c.choose(slot);
        for(const action of current.actions){if(c.s.phase!=='prepare')break;if(action.kind==='escape')c.installEscape(action.floor);else c.active(action.entityId,action.targetId);}
        for(const action of possibleActions(c,policy)){
          // Do not spend extra actions solely to undo a free lure toggle.
          if(current.actions.some(a=>a.entityId===action.entityId)&&c.s.entities.find(e=>e.id===action.entityId)?.type==='safe')continue;
          try{next.push(rate([...current.actions,action]));}catch{/* A prior choice can already end this turn. */}
        }
      }
      beam=next.sort((a,b)=>b.score-a.score).slice(0,5);
    }
    if(!best||beam[0].score>best.score)best=beam[0];
  }
  return best;
}

export function verify(seed,maxTurns=500,policy='spread'){
  const g=new Game(seed),started=Date.now();let turns=0,steps=0,rerolls=0;
  while(!['won','lost'].includes(g.s.phase)&&turns<maxTurns&&steps<10000){
    steps++;
    if(g.s.phase==='map'){g.visit(node(g,policy).id);continue;}
    if(g.s.phase==='management'){arrange(g,policy);g.startService();continue;}
    if(g.s.phase==='shop'){shop(g,policy);continue;}
    if(g.s.phase==='recovery'){recovery(g);continue;}
    if(['discovery','die_reward'].includes(g.s.phase)){takeDie(g,g.s.phase==='discovery'?g.view().node.contents.die:g.s.reward.die);continue;}
    if(g.s.phase==='anomaly_reward'){
      const options=g.s.reward.creatures.map((type,index)=>({index,score:rank(g.s,type)}));g.claimCreature(options.sort((a,b)=>b.score-a.score)[0].index);continue;
    }
    if(g.s.phase==='event'){
      const e=g.view().node.contents;
      if(e.event==='luggage')takeDie(g,e.die,true);
      else if(e.event==='sealed'&&g.s.money>=3&&count(g.s,e.creature)<needs[e.creature])g.eventChoose('buy');
      else g.leave();continue;
    }
    if(g.s.phase==='roll'){g.roll();continue;}
    if(g.s.phase==='choose'){
      const choice=plan(g,policy);g.choose(choice.slot);
      if(g.s.phase!=='prepare'){turns++;continue;}
      // Reroll based only on the present choice and affordability, never its hidden outcome.
      const prophet=living(g.s).find(e=>e.type==='prophet'&&!g.activeReason(e.id));
      if(prophet&&g.s.visitor.rollIndex<2&&(choice.preview.summary.lost||choice.score<-30)){
        g.active(prophet.id);rerolls++;continue;
      }
      for(const action of choice.actions){if(g.s.phase!=='prepare')break;if(action.kind==='escape')g.installEscape(action.floor);else g.active(action.entityId,action.targetId);}
      if(g.s.phase==='prepare')g.move();turns++;continue;
    }
    throw new Error('Unhandled campaign phase: '+g.s.phase);
  }
  const complete=['won','lost'].includes(g.s.phase);
  return {classification:'automatic legal public-information policy',ruleVersion:RULE_VERSION,policy,
    result:{seed,phase:g.s.phase,complete,stoppedByHarness:complete?null:turns>=maxTurns?'turn budget':'action budget',reason:g.s.reason,act:g.s.act,completed:g.s.completed,turns,rerolls,...g.s.stats,money:g.s.money,floorCount:g.s.floorCount,equipped:g.s.equipped,elapsedSeconds:Math.round((Date.now()-started)/1000),
      path:g.s.history.filter(e=>e.kind==='visit').map(e=>({id:e.nodeId,act:e.act,kind:e.kindName})),finalCreatures:g.s.entities.map(e=>({id:e.id,name:creatureDef(e).name,floor:e.floor,tokens:e.p,maxTokens:creatureDef(e).maxP,upgraded:e.upgraded,origin:e.origin}))},history:g.s.history};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const policy=process.argv.includes('--compact')?'compact':process.argv.includes('--aggressive')?'aggressive':process.argv.includes('--survival')?'survival':'spread',args=process.argv.slice(2).filter(x=>!x.startsWith('--'));
  const seeds=args.length?args.map(Number):[31001,31002,31003],results=[];
  const output=new URL('./validation/'+RULE_VERSION+'/',import.meta.url);
  await mkdir(output,{recursive:true});
  for(const seed of seeds){const run=verify(seed,500,policy);results.push(run.result);await writeFile(new URL('campaign-'+policy+'-'+seed+'.json',output),JSON.stringify(run,null,2)+'\n');console.log(JSON.stringify(run.result));}
  await writeFile(new URL('campaign-'+policy+'-summary.json',output),JSON.stringify({ruleVersion:RULE_VERSION,classification:'fixed legal automatic policy; not human play or balance proof',policy,description:'Public map and offers; two-action preview beam; at most two paid rerolls per turn without looking ahead; all requested seeds retained. Spread keeps the initial layout and compares public enemy rosters; compact packs floors and breaks node ties leftwards. Aggressive weights immediate fear more heavily. Survival also compares legal escape installations and accepts incomplete normal encounters.',results},null,2)+'\n');
}
