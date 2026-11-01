#!/usr/bin/env node
// Replay completed normal journals; never writes their source saves.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {Game, CREATURES, EXPANSION_COSTS} from './engine.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const canonical=x=>JSON.parse(JSON.stringify(x));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const sum=(items,fn)=>items.reduce((total,item)=>total+fn(item),0);
const marker=s=>({act:s.act,node:s.currentNode,phase:s.phase,floors:s.floorCount,souls:s.money,guestIndex:s.guestIndex,turn:s.visitor?.turn??null});
const reasonCommands=new Set(['visit','place','store','start','choose','play','active','exit','buy','expand','leave','reward','die','event','give-up']);

function dispatch(g,j) {
  const a=j.args??[];
  switch(j.command) {
    case 'new': case 'note': case 'checkpoint': return;
    case 'visit': g.visit(String(a[0])); return;
    case 'place': g.place(String(a[0]),Number(a[1])); return;
    case 'store': g.store(String(a[0])); return;
    case 'start': g.startService(); return;
    case 'roll': g.roll(); return;
    case 'choose': g.choose(Number(a[0])); return;
    case 'active': g.active(String(a[0]),a[1]==null?null:String(a[1])); return;
    case 'exit': g.installEscape(Number(a[0])); return;
    case 'move': g.move(); return;
    case 'play':
      g.choose(Number(a[0]));
      for(const action of j.actions??[]) {
        if(g.s.phase!=='prepare')break; // Same CLI behavior after an active kill.
        if(action.kind==='escape')g.installEscape(Number(action.floor));
        else if(action.kind==='active')g.active(action.entityId,action.targetId??null);
        else throw new Error(`Unsupported action ${action.kind}`);
      }
      if(g.s.phase==='prepare')g.move();
      return;
    case 'buy': g.buy(Number(a[0])); return;
    case 'expand': g.expand(); return;
    case 'leave': g.leave(); return;
    case 'reward': g.claimCreature(Number(a[0])); return;
    case 'die': a[0]==='skip'?g.skipDie():g.claimDie(Number(a[0])); return;
    case 'event': g.eventChoose(String(a[0]),a[0]==='die'?Number(a[1]):a[1]); return;
    case 'give-up': g.giveUp(); return;
    default: throw new Error(`Unsupported journal command ${j.command}`);
  }
}

function firstDiff(a,b,p='$') {
  if(isDeepStrictEqual(a,b))return null;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return {path:p,replayed:a,saved:b};
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const k of keys){const d=firstDiff(a[k],b[k],`${p}.${k}`);if(d)return d;}
  return {path:p,replayed:a,saved:b};
}

function audit(seed) {
  const file=path.join(here,'runs',`normal_${seed}.json`);
  const beforeBuffer=fs.readFileSync(file),source=JSON.parse(beforeBuffer);
  const beforeHash=hash(beforeBuffer),checks={},failures=[];
  const check=(name,pass,detail)=>{checks[name]=Boolean(pass);if(!pass)failures.push({check:name,detail});};
  let g=new Game(seed),replayCount=0;
  const initial=canonical(g.s),allEvents=source.journal.flatMap(j=>j.events??[]);
  check('normal_classification',source.classification==='normal',source.classification);
  check('seed_and_new',source.state.seed===seed&&source.journal[0]?.command==='new'&&Number(source.journal[0]?.args?.[0])===seed);
  let markerMismatches=0,eventMismatches=0,sequenceMismatches=0,missingReasons=0;
  const replayProblems=[];
  for(let index=0;index<source.journal.length;index++) {
    const j=source.journal[index],start=g.s.history.length;
    if(j.sequence!==index+1)sequenceMismatches++;
    if(reasonCommands.has(j.command)&&!(typeof j.reason==='string'&&j.reason.trim()))missingReasons++;
    if(!isDeepStrictEqual(canonical(marker(g.s)),j.before)){
      markerMismatches++;if(replayProblems.length<5)replayProblems.push({sequence:j.sequence,stage:'before',diff:firstDiff(canonical(marker(g.s)),j.before)});
    }
    try {dispatch(g,j);replayCount++;}
    catch(error){replayProblems.push({sequence:j.sequence,command:j.command,error:error.message});break;}
    if(!isDeepStrictEqual(canonical(g.s.history.slice(start)),j.events??[])){
      eventMismatches++;if(replayProblems.length<5)replayProblems.push({sequence:j.sequence,stage:'events',diff:firstDiff(canonical(g.s.history.slice(start)),j.events??[])});
    }
    if(!isDeepStrictEqual(canonical(marker(g.s)),j.after)){
      markerMismatches++;if(replayProblems.length<5)replayProblems.push({sequence:j.sequence,stage:'after',diff:firstDiff(canonical(marker(g.s)),j.after)});
    }
  }
  check('all_commands_legal',replayCount===source.journal.length,replayProblems);
  check('journal_sequence',sequenceMismatches===0,sequenceMismatches);
  check('decision_reasons',missingReasons===0,missingReasons);
  check('every_before_after_marker',markerMismatches===0,replayProblems);
  check('every_recorded_event',eventMismatches===0,replayProblems);
  const replayState=canonical(g.s);
  check('exact_final_state',isDeepStrictEqual(replayState,source.state),firstDiff(replayState,source.state));

  const byKind=kind=>allEvents.filter(e=>e.kind===kind);
  const kills=byKind('kill'),escaped=byKind('escape'),rewards=byKind('creature_reward'),buys=byKind('purchase'),eventBuys=byKind('event_buy'),destroyed=byKind('destroy'),sacrifices=byKind('event_remove'),expansions=byKind('expand');
  const earned=sum(kills,e=>e.reward)+sum(byKind('event_souls'),e=>e.amount)+sum(sacrifices,e=>e.amount);
  const shopSpent=sum(buys,e=>e.price),eventSpent=sum(eventBuys,e=>e.price),expansionSpent=sum(expansions,e=>e.cost),spent=shopSpent+eventSpent+expansionSpent;
  const money={initial:initial.money,killRewards:sum(kills,e=>e.reward),eventSouls:sum(byKind('event_souls'),e=>e.amount),sacrificeSouls:sum(sacrifices,e=>e.amount),earned,shopSpent,eventSpent,expansionSpent,spent,computed:initial.money+earned-spent,ending:source.state.money};
  check('money_equation',money.computed===money.ending,money);
  check('earned_spent_stats',earned===source.state.stats.earned&&spent===source.state.stats.spent,{earned,spent,stats:source.state.stats});
  const priceErrors=[...buys.filter(e=>e.price!==CREATURES[e.type]?.price),...eventBuys.filter(e=>e.price!==3),...expansions.filter(e=>e.cost!==EXPANSION_COSTS[e.before-6]||e.after!==e.before+1||e.moneyAfter!==e.moneyBefore-e.cost)];
  check('all_prices',priceErrors.length===0,priceErrors);
  check('expansion_count_cost_floors',expansions.length===source.state.stats.expansions&&expansionSpent===source.state.stats.expansionSpent&&initial.floorCount+expansions.length===source.state.floorCount);
  const ids=new Set(initial.entities.map(e=>e.id)),assetProblems=[];
  for(const e of allEvents){
    if(['creature_reward','purchase','event_buy'].includes(e.kind)){
      if(ids.has(e.entityId))assetProblems.push({kind:e.kind,id:e.entityId,error:'duplicate addition'});ids.add(e.entityId);
    }
    if(['destroy','event_remove'].includes(e.kind)){
      if(!ids.has(e.entityId))assetProblems.push({kind:e.kind,id:e.entityId,error:'missing removal'});ids.delete(e.entityId);
    }
  }
  const assets={initial:initial.entities.length,rewards:rewards.length,buys:buys.length,eventBuys:eventBuys.length,destroyed:destroyed.length,sacrificed:sacrifices.length,computed:initial.entities.length+rewards.length+buys.length+eventBuys.length-destroyed.length-sacrifices.length,ending:source.state.entities.length};
  check('asset_equation',assets.computed===assets.ending,assets);
  check('asset_identity_flow',assetProblems.length===0&&isDeepStrictEqual([...ids].sort(),source.state.entities.map(e=>e.id).sort()),assetProblems);
  check('destroy_sacrifice_stats',destroyed.length===source.state.stats.destroyed&&sacrifices.length===source.state.stats.eventRemoved);

  const choices=byKind('choose'),rolls=byKind('roll'),visits=byKind('visit'),completions=byKind('node_complete'),starts=byKind('service_start');
  const perNode=visits.map(v=>({node:v.nodeId,act:v.act,depth:v.depth,kind:v.kindName,turns:choices.filter(e=>e.nodeId===v.nodeId).length,rolls:rolls.filter(e=>e.nodeId===v.nodeId).length,guests:byKind('guest_start').filter(e=>e.nodeId===v.nodeId).length,kills:kills.filter(e=>e.nodeId===v.nodeId).length,escaped:escaped.filter(e=>e.nodeId===v.nodeId).length,completed:completions.filter(e=>e.nodeId===v.nodeId).length}));
  const perAct=[1,2,3].map(act=>({act,nodes:perNode.filter(n=>n.act===act).length,completed:completions.filter(e=>e.act===act).length,combatNodes:perNode.filter(n=>n.act===act&&['normal','elite','boss'].includes(n.kind)).length,turns:sum(perNode.filter(n=>n.act===act),n=>n.turns),kills:kills.filter(e=>e.act===act).length,escaped:escaped.filter(e=>e.act===act).length}));
  const guestTurns=new Map();
  for(const e of choices){const key=`${e.nodeId}/${e.guestIndex}`;if(!guestTurns.has(key))guestTurns.set(key,[]);guestTurns.get(key).push(e.turn);}
  const badGuestTurns=[...guestTurns].filter(([,turns])=>turns.some((turn,index)=>turn!==index+1));
  check('one_roll_per_chosen_turn',choices.length===rolls.length&&perNode.every(n=>n.turns===n.rolls));
  check('guest_turn_sequences',badGuestTurns.length===0,badGuestTurns);
  check('per_node_turn_sum',sum(perNode,n=>n.turns)===choices.length&&sum(perAct,a=>a.turns)===choices.length);
  check('progress_24_nodes',visits.length===24&&completions.length===24&&new Set(visits.map(e=>e.nodeId)).size===24&&perNode.every(n=>n.completed===1)&&perAct.every(a=>a.nodes===8&&a.completed===8)&&isDeepStrictEqual(source.state.completed,[8,8,8])&&source.state.stats.visits===24);
  check('combat_and_outcome_counts',starts.length===source.state.stats.combats&&kills.length===source.state.stats.kills&&escaped.length===source.state.stats.escaped&&sum(escaped,e=>e.skipped??0)===source.state.stats.skipped);
  check('won_after_final_reward',source.state.phase==='won'&&source.state.finalVictory===true&&byKind('won').length===1);
  const afterHash=hash(fs.readFileSync(file));
  check('source_unchanged',beforeHash===afterHash,{beforeHash,afterHash});
  return {seed,source:path.relative(here,file).replaceAll('\\','/'),sourceSha256Before:beforeHash,sourceSha256After:afterHash,passed:Object.values(checks).every(Boolean),checks,failures,replay:{commands:replayCount,totalCommands:source.journal.length,markerMismatches,eventMismatches,forcedDiceOrStateAssignmentsUsed:false,method:'new Game(seed), journal commands via legal APIs only; canonical JSON comparison, no source state injected'},money,assets,totals:{turns:choices.length,nodes:visits.length,combatNodes:starts.length,kills:kills.length,escaped:escaped.length,endingFloors:source.state.floorCount},perAct,perNode,prices:{shop:buys.map(({nodeId,type,price,entityId})=>({nodeId,type,price,entityId})),events:eventBuys.map(({nodeId,type,price,entityId})=>({nodeId,type,price,entityId})),expansion:expansions.map(({nodeId,before,after,cost})=>({nodeId,before,after,cost}))}};
}

const seeds=process.argv.slice(2).length?process.argv.slice(2).map(Number):[31001,31002,31003];
const results=seeds.map(audit);
for(const r of results)fs.writeFileSync(path.join(here,'runs',`audit-normal-${r.seed}.json`),JSON.stringify(r,null,2)+'\n');
const lines=['# 정상 3판 명령 재생 검산','', '`node audit.mjs`로 재생한다. 각 원본의 `new Game(seed)`부터 기록된 명령만 합법 API로 다시 실행한다. 강제 눈·자산 지급·원본 state 주입은 하지 않는다. 각 명령 전후 공개 마커와 발생 이벤트, 마지막 전체 state를 JSON 직렬화 기준으로 대조한다. `new`·`note`·`checkpoint`는 엔진 효과 없는 장부 명령이다. `play`는 CLI와 동일하게 선택→명시 행동→아직 prepare이면 이동하며 손님 전환은 엔진이 수행한다. 원본은 읽기만 하고 SHA256 전후 일치를 검사한다.','','| seed | 전체 검사 | 전체 state | 턴: 1막 / 2막 / 3막 | 영혼 검산 | 괴이 검산 |','|---|---|---|---|---|---|'];
for(const r of results)lines.push(`| ${r.seed} | ${r.passed?'PASS':'FAIL'} (${Object.values(r.checks).filter(Boolean).length}/${Object.keys(r.checks).length}) | ${r.checks.exact_final_state?'일치':'불일치'} | ${r.perAct.map(a=>a.turns).join(' / ')} = ${r.totals.turns} | ${r.money.initial}+${r.money.earned}−${r.money.spent}=${r.money.ending} | ${r.assets.initial}+${r.assets.rewards}+${r.assets.buys}+${r.assets.eventBuys}−${r.assets.destroyed}−${r.assets.sacrificed}=${r.assets.ending} |`);
lines.push('','괴이 식은 초기+전투보상+상점구매+이벤트구매−파괴−희생이다. 모든 상점 가격·증설 가격·증설 영혼 전후값을 규칙 표와 대조했다. 노드별 턴·방문·완료, 개별 손님 턴 번호 연속성, 처치·탈출·파괴 통계와 8/8/8 진행도도 대조했다. 원본 SHA256과 노드별 상세 수치는 다음 JSON에 있다.','');
for(const r of results)lines.push(`- [${r.seed} 상세](audit-normal-${r.seed}.json): ${r.replay.commands}개 명령, ${r.totals.combatNodes}개 전투 노드, 원본 해시 ${r.checks.source_unchanged?'불변':'변경'}.`);
lines.push('','이 검산은 기록된 선택이 현재 엔진의 합법 명령으로 재현되고 장부가 맞는다는 증거다. 플레이 중 숨김 정보를 보지 않았는지나 규칙 구현 자체가 의도와 완전히 같은지는 최종 상태 재생만으로 증명하지 않는다.');
fs.writeFileSync(path.join(here,'runs','audit-normal-summary.md'),lines.join('\n')+'\n');
console.log(JSON.stringify(results.map(({seed,passed,checks,failures,totals,perAct,money,assets})=>({seed,passed,checks,failures,totals,perAct,money,assets})),null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
