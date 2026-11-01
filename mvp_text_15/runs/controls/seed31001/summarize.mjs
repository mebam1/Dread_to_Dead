/** Posthoc audit of committed actions. No action selection or future-state inspection. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Game} from '../../../engine.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));

function replayToAct2(session){
  const g=new Game(31001);
  for(const e of session.journal){
    const a=e.args||[];
    switch(e.command){
      case 'new':case 'note':case 'checkpoint':break;
      case 'visit':g.visit(a[0]);break;
      case 'place':g.place(a[0],Number(a[1]));break;
      case 'store':g.store(a[0]);break;
      case 'start':g.startService();break;
      case 'roll':g.roll();break;
      case 'choose':g.choose(Number(a[0]));break;
      case 'active':g.active(a[0],a[1]??null);break;
      case 'exit':g.installEscape(Number(a[0]));break;
      case 'move':g.move();break;
      case 'play':
        g.choose(Number(a[0]));
        for(const x of e.actions||[]){if(g.s.phase!=='prepare')break;if(x.kind==='escape')g.installEscape(x.floor);else g.active(x.entityId,x.targetId);}
        if(g.s.phase==='prepare')g.move();
        break;
      case 'buy':g.buy(Number(a[0]));break;
      case 'expand':g.expand();break;
      case 'leave':g.leave();break;
      case 'reward':g.claimCreature(Number(a[0]));break;
      case 'die':a[0]==='skip'?g.skipDie():g.claimDie(Number(a[0]));break;
      case 'event':g.eventChoose(a[0],a[0]==='die'?Number(a[1]):a[1]);break;
      case 'give-up':g.giveUp();break;
      default:throw new Error(`Unsupported recorded command ${e.command}`);
    }
    if(e.after&&(e.after.phase!==g.s.phase||e.after.act!==g.s.act||e.after.souls!==g.s.money||e.after.floors!==g.s.floorCount))throw new Error(`Replay mismatch after ${e.command}`);
    if(g.s.act===2&&g.s.phase==='map')return g.s;
  }
  throw new Error('Normal record has not completed act1');
}

function measure(s,nodeIds){
  const wanted=new Set(nodeIds);
  const h=s.history.filter(e=>wanted.has(e.nodeId));
  const hits=h.filter(e=>e.kind==='hit');
  return {turns:h.filter(e=>e.kind==='roll').length,kills:h.filter(e=>e.kind==='kill').length,
    damage:hits.reduce((n,e)=>n+(e.damage??e.power-e.absorbed),0),absorbed:hits.reduce((n,e)=>n+e.absorbed,0),
    tokens:hits.reduce((n,e)=>n+(e.tokenLoss??e.beforeP-e.afterP),0),destroyed:h.filter(e=>e.kind==='destroy').length,
    repairs:h.filter(e=>e.kind==='repair').length,repaired:h.filter(e=>e.kind==='repair').reduce((n,e)=>n+e.amount,0),
    hits:hits.length,misses:h.filter(e=>e.kind==='miss').length,floor7Contacts:h.filter(e=>e.kind==='move'&&e.floor===7).length};
}
const sources=[
  ['normal_paid_R','../../normal_31001.json',true],
  ['paid_empty','geometry/paid.json',false],
  ['skip_same_layout','geometry/skip.json',false],
  ['skip_rearranged','rearranged/skip.json',false],
  ['early_route_paid','route_early_expansion/early.json',false]
];
const rows=sources.map(([label,relative,normal])=>{
  const file=path.resolve(dir,relative),raw=fs.readFileSync(file);
  const s=normal?replayToAct2(JSON.parse(raw)):JSON.parse(raw).state;
  return {label,file:path.relative(root,file),fileSHA256:createHash('sha256').update(raw).digest('hex'),
    end:{act:s.act,phase:s.phase,floors:s.floorCount,souls:s.money,owned:s.entities.length,totalKills:s.stats.kills,totalEarned:s.stats.earned,totalSpent:s.stats.spent,totalDestroyed:s.stats.destroyed},
    act1:measure(s,Array.from({length:8},(_,i)=>`a1-d${i+1}-c${i===0?0:i===1?0:i===2?(label==='early_route_paid'?0:1):i===3?1:i===4?2:i===5?2:i===6?1:1}`)),
    normal7:measure(s,['a1-d7-c1']),boss:measure(s,['a1-d8-c1']),nextAndBoss:measure(s,['a1-d7-c1','a1-d8-c1']),
    finalAct1Inventory:s.entities.map(e=>({id:e.id,type:e.type,floor:e.floor,c:e.c,p:e.p,uses:e.uses}))};
});
const result={classification:'posthoc-direct-control-play-analysis',seed:31001,
  limits:['Branches were played sequentially, not independently blinded. Each command reason refers to its current public view; no raw future tables or lookahead rolls informed choices.',
    'A and B condition on the same expansion-node visit; they do not price an alternative node.',
    'Route C also changes battle count, rewards and replacement purchases; it is a combined route outcome, not a pure floor intervention.',
    'All control continuations stop at act2 map. Future spending and persistent floor value after act1 were not measured.'],rows};
fs.writeFileSync(path.join(dir,'summary-complete.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({label:r.label,end:r.end,nextAndBoss:r.nextAndBoss})),null,2));
