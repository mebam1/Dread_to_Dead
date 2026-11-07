import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, execute, publicView, previewBattle, report, RULE_VERSION } from './engine.mjs';
import { makePolicy, POLICY_DESCRIPTION } from './policy.mjs';
import { newEntity, maxHp, log } from './shared.mjs';

const OUTPUT = fileURLToPath(new URL('./validation/', import.meta.url));
const sumHp = floors => floors.filter(Boolean).reduce((n,e)=>n+e.hp,0);
function scoresDifferWithin(alternatives,key) {
  const firstScore=new Map();
  for(const a of alternatives) {
    const score=a.score.toFixed(4);
    if(firstScore.has(a[key]) && firstScore.get(a[key])!==score) return true;
    firstScore.set(a[key],score);
  }
  return false;
}
const csv = (rows,columns) => [columns.join(','),...rows.map(row=>columns.map(k=>{
  const value=row[k]??'';
  const text=typeof value==='object'?JSON.stringify(value):String(value);
  return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}).join(','))].join('\n')+'\n';

/** A completed defeat is a real result; the safety limit leaves the run intact. */
export function runCampaign(seed,{fixedCompanion=false,maxRounds=300,maxDecisions=5000}={}) {
  const state=createGame(seed),policy=makePolicy({fixedCompanion});
  const decisions=[],rounds=[],roundStarts=new Map();
  let status='incomplete',stopReason=null,moves=0;
  const start=performance.now();
  for(let index=0;index<maxDecisions;index++) {
    if(['won','lost'].includes(state.phase)) { status='completed'; break; }
    if(moves>=maxRounds) { stopReason=`safety limit: ${maxRounds} resolved rounds`; break; }
    const view=publicView(state);
    if(view.phase==='prepare' && view.battle.turn===1 && !roundStarts.has(`${view.node.id}:${view.battle.round}`)) roundStarts.set(`${view.node.id}:${view.battle.round}`,{
      allyHp:sumHp(view.floors),allies:view.floors.filter(Boolean).length,
      summary:structuredClone(view.battle.summary),coins:view.coins,
    });
    // The policy receives neither state nor journal, only an explicitly public
    // snapshot and the game's non-mutating current-round preview endpoint.
    const decision=policy.decide(view,(id,slot)=>previewBattle(state,id,slot));
    const before=state.battle?{
      act:state.act,node:state.node.id,kind:state.node.kind,round:state.battle.round,
      dice:[...state.battle.dice],turn:state.battle.turn,
      allyHp:sumHp(state.floors),allies:state.floors.filter(Boolean).length,
      enemies:state.battle.enemies.filter(e=>e.hp>0).length,
      summary:structuredClone(state.battle.summary),coins:state.coins,
    }:null;
    execute(state,decision.command,decision.args,decision.reason);
    decisions.push({index:index+1,node:view.node?.id??null,phase:view.phase,command:decision.command,args:decision.args,reason:decision.reason,...(decision.analysis?{analysis:decision.analysis}:{})});
    if(decision.command==='move' && (!state.battle || before.round !== state.battle.round)) {
      moves++;
      const after=state.battle?.summary??state.stats.battles.at(-1);
      const beginning=roundStarts.get(`${before.node}:${before.round}`)??before;
      rounds.push({seed,policy:policy.name,act:before.act,node:before.node,kind:before.kind,round:before.round,
        lastDice:before.dice,lastSlot:decision.args[1],lastDie:before.dice[decision.args[1]-1],lastMover:decision.args[0],
        allyHpBefore:beginning.allyHp,allyHpAfter:sumHp(state.floors),
        alliesBefore:beginning.allies,alliesAfter:state.floors.filter(Boolean).length,
        kills:after.kills-beginning.summary.kills,
        hpDamageDealt:after.hpDamageDealt-beginning.summary.hpDamageDealt,
        hpDamageTaken:after.hpDamageTaken-beginning.summary.hpDamageTaken,
        healing:after.healing-beginning.summary.healing,
        coinsEarned:state.coins-beginning.coins,outcome:state.battle?null:after.outcome});
    }
  }
  if(['won','lost'].includes(state.phase)) status='completed';
  if(status==='incomplete'&&!stopReason) stopReason=`safety limit: ${maxDecisions} decisions`;
  const events=state.journal;
  const recoveryEvents=events.filter(e=>e.type==='recovery');
  const choices=decisions.filter(d=>d.analysis?.phase==='drop');
  const completedBattles=state.stats.battles;
  const summary={
    seed,policy:policy.name,version:RULE_VERSION,status,stopReason,outcome:status==='completed'?state.phase:null,
    act:state.act,depth:state.node?.depth??0,visited:state.visited.length,
    decisions:decisions.length,resolvedRounds:moves,
    battles:completedBattles.length,wins:completedBattles.filter(b=>b.outcome==='win').length,
    defeats:completedBattles.filter(b=>b.outcome==='loss').length,escapes:completedBattles.filter(b=>b.outcome==='escape').length,
    roundsOver15:completedBattles.filter(b=>b.rounds>15).length,maxBattleRounds:Math.max(0,...completedBattles.map(b=>b.rounds)),
    companionsRemaining:state.floors.filter(Boolean).length,hpRemaining:sumHp(state.floors),
    battleLosses:completedBattles.reduce((n,b)=>n+(b.companionLosses??0),0),
    replacements:state.stats.losses.filter(e=>e.cause==='replacement').length,
    coinsEarned:events.filter(e=>e.type==='income').reduce((n,e)=>n+e.amount,0),coinsRemaining:state.coins,
    rewardsPlaced:state.stats.acquired.filter(e=>e.source==='reward').length,
    purchases:state.stats.purchases.length,purchasedPlaced:state.stats.acquired.filter(e=>e.source==='shop').length,
    fusions:state.stats.fusions.length,upgrades:state.stats.upgrades.length,
    recoveryVisits:recoveryEvents.length,recoveryHp:recoveryEvents.reduce((n,e)=>n+e.healed.reduce((m,h)=>m+h.amount,0),0),
    quickCasts:events.filter(e=>e.type==='quick-cost').length,
    randomTargetEvents:events.filter(e=>e.type==='random-target').length,
    inactivityPenalties:events.filter(e=>e.type==='inactivity-penalty').length,
    drops:choices.length,
    differingMoveStates:choices.filter(d=>scoresDifferWithin(d.analysis.alternatives,'slot')).length,
    differingDieStates:choices.filter(d=>scoresDifferWithin(d.analysis.alternatives,'order')).length,
    incompletePreviews:choices.filter(d=>d.analysis.alternatives.some(a=>!a.complete)).length,
    elapsedSeconds:Number(((performance.now()-start)/1000).toFixed(3)),
  };
  return {state,summary,decisions,rounds,report:report(state)};
}

function saveRun(result,output) {
  const {state,summary,decisions,rounds}=result;
  const stem=`automated-${summary.seed}-${summary.policy}`;
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,`${stem}.save.json`),JSON.stringify({
    format:'dread-to-dead/text19-run/1',rule:RULE_VERSION,group:summary.policy==='fixed-companion'?'control':'normal',
    validation:{source:'automated public-information policy',status:summary.status,stopReason:summary.stopReason},state,
  })+'\n');
  fs.writeFileSync(path.join(output,`${stem}.decisions.jsonl`),decisions.map(d=>JSON.stringify(d)).join('\n')+'\n');
  fs.writeFileSync(path.join(output,`${stem}.rounds.csv`),csv(rounds,['seed','policy','act','node','kind','round','lastDice','lastSlot','lastDie','lastMover','allyHpBefore','allyHpAfter','alliesBefore','alliesAfter','kills','hpDamageDealt','hpDamageTaken','healing','coinsEarned','outcome']));
  fs.writeFileSync(path.join(output,`${stem}.report.json`),JSON.stringify({summary,report:result.report},null,2)+'\n');
}

function markdown(summaries) {
  const lines=[
    '# 설정 19 자동 플레이 검정', '',
    `규칙: \`${RULE_VERSION}\`. 각 판은 새 원정에서 정상 명령만 실행했습니다. 시작 동료·적 수치·체력·재화·난수를 변경하지 않았습니다.`, '',
    '정책은 공개 지도와 현재 보유 동료, 공개된 상점·보상, 세 주사위 각각을 동료에게 사용할 때의 미리보기를 사용합니다. 선택은 주사위 슬롯과 동료 ID로 기록합니다. 자세한 정책은 `policy.json`과 `../policy.mjs`에 있습니다.', '',
    '| 시드 | 정책 | 완료 상태 | 원정 결과 | 도달 막/깊이 | 완승/철수/패배 | 처리 라운드 | 전투 최대 라운드 | 전투 동료 상실 | 구매 | 회복 노드 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...summaries.map(s=>`| ${s.seed} | ${s.policy} | ${s.status} | ${s.outcome??s.stopReason} | ${s.act}/${s.depth} | ${s.wins}/${s.escapes}/${s.defeats} | ${s.resolvedRounds} | ${s.maxBattleRounds} | ${s.battleLosses} | ${s.purchases} | ${s.recoveryVisits} |`), '',
    '고정 동료 대조군도 매 차례 그 동료에게 쓸 주사위를 고릅니다. 앞 전투 결과에 따라 후속 동료·노드 선택도 달라질 수 있습니다. 결정 기록에 공개한 눈 세 개, 사용한 슬롯, 동료, 조합별 예고를 남겼습니다.', '',
    'differingMoveStates는 같은 주사위로 동료를 바꿨을 때 예고 점수가 달랐던 차례 수입니다. differingDieStates는 같은 동료에게 쓸 주사위를 바꿨을 때 점수가 달랐던 차례 수입니다.', '',
    '이는 결정론적 휴리스틱 플레이이며 사람의 재미·피로·숙련도를 검증하지 않습니다. 실패는 그대로 기록했습니다. 후반에 도달하지 못한 판은 해당 원정으로 후반 밸런스를 검증했다고 해석하지 않습니다. 안전 한도 도달은 `incomplete`이며 패배나 포기로 집계하지 않습니다.', '',
    '파일: `*.save.json` 전체 저장과 장부, `*.decisions.jsonl` 선택 이유·이동 대안, `*.rounds.csv` 라운드 결과, `*.report.json` 전투/획득/손실 상세. 저장은 CLI의 `--save`로 재열람할 수 있습니다.', '',
  ];
  return lines.join('\n');
}

/** Synthetic coverage only: this roster was not earned in a normal expedition. */
function controlledLateCombat(publicActMap,kind,seed=31003) {
  const state=createGame(seed);
  state.act=3;
  state.map=structuredClone(publicActMap);
  state.node=state.map.find(n=>n.kind===kind);
  if(!state.node) throw Error(`3막 ${kind} 공개 템플릿이 없습니다.`);
  state.phase='management'; state.visited=[]; state.floors=Array(10).fill(null);
  state.sequence=0; state.rng={}; state.journal=[];
  state.stats={battles:[],purchases:[],acquired:[],losses:[],fusions:[],upgrades:[]};
  const types=['paladin','saint','choir','holyPriest','warPriest','squire','cardinal','sprayer','gourmet','toxicHealer'];
  for(const [i,type] of types.entries()) {
    const e=newEntity(state,type,'controlled-fixture'); e.upgraded=true; e.hp=maxHp(e);
    if(type==='paladin') e.fusion={bType:'crusader',bUpgraded:true,aId:'fixture-A',bId:'fixture-B'};
    state.floors[i]=e;
  }
  const setup={classification:'controlled fixture, not a normal campaign result',
    purpose:'Exercise actual act-3 elite/boss movement, protection/alternating counterattacks and end processing with all 11 companion effects.',
    modifications:'Ten full-health upgraded bodies are inserted; paladin A includes an upgraded crusader B. No normal reward/economy claim. Battle templates and combat rules are unchanged.',
    roster:structuredClone(state.floors),enemyTemplate:structuredClone(state.node.enemies)};
  log(state,'controlled-fixture',setup);
  const policy=makePolicy(),decisions=[];
  let moves=0;
  for(let i=0;i<500&&moves<100&&!state.stats.battles.length;i++) {
    const view=publicView(state);
    const decision=policy.decide(view,(id,slot)=>previewBattle(state,id,slot));
    execute(state,decision.command,decision.args,decision.reason);
    decisions.push({index:i+1,...decision});
    if(decision.command==='move') moves++;
  }
  const battle=state.stats.battles[0]??null;
  const summary={seed,kind,classification:'controlled-fixture',status:battle?'completed':'incomplete',
    stopReason:battle?null:'fixture safety limit',outcome:battle?.outcome??null,rounds:battle?.rounds??moves,
    companionLosses:battle?.companionLosses??null,hpDamageDealt:battle?.hpDamageDealt??null,
    hpDamageTaken:battle?.hpDamageTaken??null,healing:battle?.healing??null,
    survivors:state.floors.filter(Boolean).length,remainingHp:sumHp(state.floors),
    commands:decisions.length,randomTargets:state.journal.filter(e=>e.type==='random-target').length};
  const stem=`controlled-act3-${kind}-${seed}`;
  fs.writeFileSync(path.join(OUTPUT,`${stem}.save.json`),JSON.stringify({format:'dread-to-dead/text19-run/1',rule:RULE_VERSION,group:'control',validation:setup,state})+'\n');
  fs.writeFileSync(path.join(OUTPUT,`${stem}.report.json`),JSON.stringify({setup,summary,battle},null,2)+'\n');
  fs.writeFileSync(path.join(OUTPUT,`${stem}.decisions.jsonl`),decisions.map(d=>JSON.stringify(d)).join('\n')+'\n');
  return summary;
}

function runLateFixtures() {
  const source=path.join(OUTPUT,'automated-31003-preview-heuristic.save.json');
  if(!fs.existsSync(source)) return [];
  const data=JSON.parse(fs.readFileSync(source,'utf8'));
  if(data.rule!==RULE_VERSION||data.state.act!==3) return [];
  const publicActMap=publicView(data.state).map;
  const results=['elite','boss'].map(kind=>controlledLateCombat(publicActMap,kind));
  fs.writeFileSync(path.join(OUTPUT,'controlled-late-summary.json'),JSON.stringify({classification:'controlled fixtures only',runs:results},null,2)+'\n');
  for(const result of results) process.stdout.write(JSON.stringify(result)+'\n');
  return results;
}

function main() {
  const arg=Object.fromEntries(process.argv.slice(2).map(text=>{const [key,...rest]=text.replace(/^--/,'').split('=');return [key,rest.join('=')];}));
  if(Object.hasOwn(arg,'fixtures')) { runLateFixtures(); return; }
  const seeds=(arg.seeds??'31001,31002,31003').split(',').map(Number);
  if(seeds.some(seed=>!Number.isSafeInteger(seed))) throw Error('--seeds는 쉼표로 구분한 정수입니다.');
  const modes=arg.only==='heuristic'?[false]:arg.only==='fixed'?[true]:[false,true];
  const summaries=[];
  for(const seed of seeds) for(const fixedCompanion of modes) {
    const result=runCampaign(seed,{fixedCompanion});
    saveRun(result,OUTPUT);
    summaries.push(result.summary);
    process.stdout.write(JSON.stringify(result.summary)+'\n');
  }
  fs.writeFileSync(path.join(OUTPUT,'automated-summary.json'),JSON.stringify({version:RULE_VERSION,safetyLimits:{resolvedRounds:300,decisions:5000},runs:summaries},null,2)+'\n');
  fs.writeFileSync(path.join(OUTPUT,'automated-summary.csv'),csv(summaries,Object.keys(summaries[0])));
  fs.writeFileSync(path.join(OUTPUT,'policy.json'),JSON.stringify(POLICY_DESCRIPTION,null,2)+'\n');
  fs.writeFileSync(path.join(OUTPUT,'automated-report.md'),markdown(summaries));
  runLateFixtures();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
