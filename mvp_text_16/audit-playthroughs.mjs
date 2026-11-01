/** Replays recorded legal choices; never selects actions or changes game saves. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Game, RULE_VERSION} from './engine.js';
import {analyze} from './analysis.mjs';

const files=[31001,31002,31003].map(n=>`playthroughs/normal_${n}.json`);
files.push('playthroughs/control_31002_no_expand_a1.json');
files.push('playthroughs/control_31001_free_substitute_a3.json');
const sum=(a,fn)=>a.reduce((n,x)=>n+fn(x),0);
const json=x=>JSON.parse(JSON.stringify(x));
const marker=s=>({act:s.act,node:s.currentNode,phase:s.phase,floors:s.floorCount,souls:s.money,guestIndex:s.guestIndex,turn:s.visitor?.turn??null});

function execute(g,j){
  const a=j.args;
  switch(j.command){
    case 'new': case 'fork': case 'checkpoint': case 'note': return;
    case 'visit': g.visit(String(a[0])); break;
    case 'place': g.place(String(a[0]),Number(a[1])); break;
    case 'store': g.store(String(a[0])); break;
    case 'start': g.startService(); break;
    case 'roll': g.roll(); break;
    case 'choose': g.choose(Number(a[0])); break;
    case 'active': g.active(String(a[0]),a[1]==null?null:String(a[1])); break;
    case 'move': g.move(); break;
    case 'exit': g.installEscape(Number(a[0])); break;
    case 'play':
      g.choose(Number(a[0]));
      for(const action of j.actions||[]){
        assert.equal(g.s.phase,'prepare');
        if(action.kind==='escape')g.installEscape(Number(action.floor));
        else g.active(action.entityId,action.targetId??null);
      }
      if(g.s.phase==='prepare')g.move();
      break;
    case 'buy': g.buy(Number(a[0])); break;
    case 'expand': g.expand(); break;
    case 'leave': g.leave(); break;
    case 'recover': g.recover(typeof a[0]==='string'?JSON.parse(a[0]):a[0]); break;
    case 'upgrade': g.upgrade(String(a[0])); break;
    case 'recover-skip': g.skipRecovery(); break;
    case 'reward': g.claimCreature(Number(a[0])); break;
    case 'die': a[0]==='skip'?g.skipDie():g.claimDie(Number(a[0])); break;
    case 'event': g.eventChoose(String(a[0]),a[0]==='die'?Number(a[1]):a[1]); break;
    default: throw new Error(`Unreviewed command ${j.command}`);
  }
}

function metrics(s,report,starts){
  const h=s.history;
  const fearEvents=h.filter(e=>e.kind==='fear');
  const hits=h.filter(e=>e.kind==='hit');
  const fearFor=events=>({
    harvest:sum(events.filter(e=>e.sourceType==='owner'),e=>e.amount),
    prophecy:sum(events.filter(e=>e.source==='예언 자동 공포'),e=>e.amount),
    effectiveFear:sum(events,e=>Math.min(e.amount,Math.max(0,e.threshold-e.before))),
    overflow:sum(events,e=>Math.max(0,e.amount-Math.max(0,e.threshold-e.before)))
  });
  const acquired=[...report.goals.shop.acquired,...report.goals.freeReward.acquired];
  return {
    file:null,seed:s.seed,phase:s.phase,completed:s.completed,floors:s.floorCount,souls:s.money,
    stats:s.stats,fear:fearFor(fearEvents),
    fearByAct:[1,2,3].map(act=>({act,...fearFor(fearEvents.filter(e=>e.act===act))})),
    hits:{raw:sum(hits,e=>e.damage+e.absorbed),absorbed:sum(hits,e=>e.absorbed),damage:sum(hits,e=>e.damage),redirected:hits.filter(e=>e.redirected).length,tokensLost:sum(hits,e=>e.before.p-e.after.p)},
    expansions:h.filter(e=>e.kind==='expand').map(({nodeId,before,after,cost})=>({nodeId,before,after,cost})),
    acquisitions:acquired.map(({id,type,name,origin,nodeId,price,finalReward,firstEffect,effects,remaining})=>({id,type,name,origin,nodeId,price,finalReward,firstEffect,effects,survived:!!remaining})),
    combats:h.filter(e=>e.kind==='service_end'&&starts.some(x=>x.nodeId===e.nodeId)).map(e=>{
      const events=h.filter(x=>x.nodeId===e.nodeId),hits=events.filter(x=>x.kind==='hit');
      const start=starts.find(x=>x.nodeId===e.nodeId);
      return {...e.summary,floors:start.floors,formation:start.formation,
        turns:events.filter(x=>x.kind==='kill'||x.kind==='escape').map(x=>x.turn),
        fear:fearFor(events.filter(x=>x.kind==='fear')),tokensLost:sum(hits,x=>x.before.p-x.after.p),
        absorbed:sum(hits,x=>x.absorbed),rawDamage:sum(hits,x=>x.damage+x.absorbed),
        redirected:hits.filter(x=>x.redirected).length,
        chosenDice:events.filter(x=>x.kind==='choose').map(({turn,value,slot})=>({turn,value,slot}))};
    }),
    escapes:h.filter(e=>e.kind==='escape').map(({nodeId,turn,skipped})=>({nodeId,turn,skipped})),
    rerolls:h.filter(e=>e.kind==='reroll').map(({nodeId,turn,sourceId})=>({nodeId,turn,sourceId})),
    adjustments:h.filter(e=>e.kind==='die_adjust').length,
    maxHarvest:Math.max(0,...fearEvents.filter(e=>e.sourceType==='owner').map(e=>e.amount)),
    shopSpent:sum(report.goals.shop.acquired,e=>e.price),
    eligibleFree:report.goals.freeReward.combatEligible,
    freeWithObservedEffect:report.goals.freeReward.acquired.filter(e=>!e.finalReward&&e.firstEffect).length,
    freeWithoutObservedEffect:report.goals.freeReward.unobservedContribution,
    finalReward:report.goals.freeReward.acquired.filter(e=>e.finalReward).map(e=>e.id)
  };
}

const runs=[];
for(const file of files){
  const session=JSON.parse(fs.readFileSync(file,'utf8'));
  assert(!session.journal.some(j=>j.command==='diagnostic-status'));
  let g;
  if(session.classification==='control'){
    const fork=session.journal.find(j=>j.command==='fork');
    g=Game.fromState(JSON.parse(fs.readFileSync(String(fork.args[0]),'utf8')).state);
  }else g=new Game(session.state.seed);
  const starts=[];
  for(const j of session.journal){
    if(j.command==='start')starts.push({nodeId:g.s.currentNode,floors:g.s.floorCount,
      formation:g.s.entities.filter(e=>e.floor!=null).map(e=>({id:e.id,type:e.type,floor:e.floor,p:e.p,upgraded:e.upgraded})).sort((a,b)=>a.floor-b.floor)});
    execute(g,j);
    assert.deepEqual(json(marker(g.s)),j.after,`${file} decision ${j.sequence}`);
  }
  assert.deepEqual(json(g.s),session.state,`${file}: full replay state, history and hidden random state`);
  const report=analyze(session.state,session.classification,session.journal);
  fs.writeFileSync(file.replace('.json','_report.json'),JSON.stringify(report,null,2)+'\n');
  const m=metrics(session.state,report,starts);m.file=file;m.classification=session.classification;m.replay={passed:true,decisions:session.journal.length};
  runs.push(m);
}

const original=runs.find(r=>r.seed===31002&&r.classification==='normal').combats.find(c=>c.nodeId==='a1-d8-c1');
const alternate=runs.find(r=>r.file.endsWith('no_expand_a1.json')).combats.find(c=>c.nodeId==='a1-d8-c1');
const shopNormal=runs.find(r=>r.seed===31001&&r.classification==='normal');
const shopAlternate=runs.find(r=>r.file.endsWith('free_substitute_a3.json'));
const compact=c=>({floors:c.floors,outcome:c.outcome,turns:c.turns,tokensLost:c.tokensLost,destroyed:c.destroyed,rawDamage:c.rawDamage,absorbed:c.absorbed,formation:c.formation,chosenDice:c.chosenDice});
const output={ruleVersion:RULE_VERSION,date:'2026-11-02',method:'Manual choices from public CLI information; no injected state, automated policy, hidden future inspection, or normal-run reload. Control is post-hoc and ends after one boss.',
  normalRuns:3,wins:runs.filter(r=>r.classification==='normal'&&r.phase==='won').length,
  replayAudit:{passed:runs.every(r=>r.replay.passed),decisions:sum(runs,r=>r.replay.decisions)},
  expansionControl:{source:'playthroughs/checkpoints/normal_31002-shop-a1-second.json',savedSouls:4,normalSeven:compact(original),controlSix:compact(alternate),limit:'One boss; different legal layouts and manual choices. Not a campaign-wide causal estimate or exhaustive best-play search.'},
  shopSubstitutionControl:{source:'playthroughs/checkpoints/normal_31001-shop-a3-last.json',savedSouls:shopAlternate.souls-shopNormal.souls,
    change:'Skip the last four-soul prophet purchase; freely rearrange the already-owned act-1 shop Samara into its floor. Same recovery and boss actions. Samara is not a free reward.',
    normal:compact(shopNormal.combats.find(c=>c.nodeId==='a3-d8-c1')),alternate:compact(shopAlternate.combats.find(c=>c.nodeId==='a3-d8-c1')),
    limit:'One observed dice sequence and unused prophet active; no claim that reroll insurance is always worthless.'},runs};
fs.writeFileSync('validation/play-summary.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({normalRuns:output.normalRuns,wins:output.wins,audit:output.replayAudit,runs:runs.map(r=>({seed:r.seed,classification:r.classification,phase:r.phase,stats:r.stats,fear:r.fear,fearByAct:r.fearByAct,shopSpent:r.shopSpent,eligibleFree:r.eligibleFree,freeUsed:r.freeWithObservedEffect})),control:{normal:compact(original),alternate:compact(alternate)}},null,2));
