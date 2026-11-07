#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { COMMAND_ARGS, RULE_VERSION, catalog, createGame, execute, previewBattle, previewFusion,
  publicJournal, publicMap, publicView, report, upgradeSave } from './engine.mjs';
import { combatEventText } from '../mvp_user_7/combat-feedback.js';

const FORMAT = 'dread-to-dead/text21-run/1';
const DEFAULT_SAVE = fileURLToPath(new URL('./runs/my_game.json', import.meta.url));
const positions = Array.from({length:10}, (_,i) => i+1);
const {companions:cards, enemyPatterns} = catalog();
const patternName = key => enemyPatterns[key]?.name ?? key;
const labels = {normal:'일반 전투', elite:'엘리트', boss:'보스', recovery:'회복', shop:'상점', fusion:'융합', upgrade:'강화'};
const phases = {map:'지도', management:'전투 준비', prepare:'플레이어 차례', reward:'전투 보상', place:'동료 배치', shop:'상점', fusion:'융합', upgrade:'강화', won:'원정 승리', lost:'원정 패배'};
const outcomes = {win:'완승', loss:'패배', escape:'철수'};
const aliases = {
  '플레이':'play', '이어하기':'play', '새게임':'new', '분기':'fork', '도움말':'help',
  '상태':'show', '지도':'map', '도감':'catalog', '규칙':'rules', '기록':'journal', '보고':'report',
  '방문':'visit', '교환':'swap', '재배치':'swap', '시작':'start', '검토':'preview', '이동':'move',
  '속공':'active', '철수':'exit', '보상':'reward', '배치':'place', '버리기':'discard',
  '구매':'buy', '나가기':'leave', '강화':'upgrade', '융합':'fuse', '융합검토':'preview-fusion',
  '건너뛰기':'skip', '원정포기':'give-up', giveup:'give-up', '종료':'quit', q:'quit', 'exit-game':'quit',
};
const hints = {
  map:'방문 번호/지점ID (visit) · 재배치 칸 칸 (swap) · 지도 (map)',
  management:'재배치 칸 칸 (swap) · 시작 (start)',
  prepare:'검토 [동료ID [목적지]] (preview) · 이동 동료ID 목적지 (move) · 속공 주체ID A/B 대상ID (active) · 철수 빈칸 (exit)',
  reward:'보상 후보번호 (reward) · 건너뛰기 (skip)', place:'배치 칸 (place) · 버리기 (discard)',
  shop:'구매 상품번호 (buy) · 나가기 (leave)', fusion:'융합검토 A_ID B_ID (preview-fusion) · 융합 A_ID B_ID (fuse) · 건너뛰기 (skip)',
  upgrade:'강화 동료ID (upgrade) · 건너뛰기 (skip)', won:'보고 (report) · 기록 (journal)', lost:'보고 (report) · 기록 (journal)',
};
function help() {
  return [
    'Dread to Dead · 텍스트 21 · '+RULE_VERSION,
    'node cli.mjs [--save 저장파일] [play [판번호] | 명령 [인자]]',
    '플레이 (play)로 이어서 진행합니다. 새게임 [판번호] (new)는 새 저장을 만듭니다.',
    '상태 show · 지도 map · 도감 catalog · 규칙 rules · 기록 [개수] journal · 보고 report',
    ...new Set(Object.values(hints)),
    '분기 새파일 (fork) · 원정포기 (give-up) · 종료 (quit)',
    '예시  검토 #C3 8  /  이동 #C3 8  /  move c3 8',
    '선택 이유는 --reason "이유"로 덧붙일 수 있습니다. 단발 명령은 --text로 읽거나 --json으로 저장할 수 있습니다.',
  ].join('\n');
}
function parse(tokens) {
  const options = {save:DEFAULT_SAVE, reason:'', revision:null, format:null};
  const words = [];
  for (let i=0; i<tokens.length; i++) {
    const token = tokens[i];
    if (['--save','--reason','--revision'].includes(token)) {
      const value = tokens[++i];
      if (!value?.trim() || value.startsWith('--')) throw Error(token+' 값을 지정하세요.');
      if (token==='--save') options.save=path.resolve(value);
      if (token==='--reason') options.reason=value;
      if (token==='--revision') options.revision=integer(value);
    } else if (token==='--text' || token==='--json') options.format=token.slice(2);
    else if (token==='--help' || token==='-h') words.push('help');
    else if (token.startsWith('--')) throw Error('알 수 없는 옵션 '+token);
    else words.push(token);
  }
  if (words[0]==='전투' && words[1]==='시작') words.splice(0,2,'start');
  const [first='play', ...args] = words;
  const command = Object.hasOwn(aliases,first) ? aliases[first] : first;
  if (['move','preview','upgrade','fuse','preview-fusion','active'].includes(command)) {
    for (let i=0;i<args.length;i++) if (/^#?c\d+$/i.test(args[i])) args[i]=args[i].replace(/^#/,'').toLowerCase();
    if (command==='active' && args[1]) args[1]=args[1].toUpperCase();
  }
  return {...options, command, args};
}
function arity(args,min,max=min) {
  if (args.length<min || args.length>max) throw Error('인자 개수가 맞지 않습니다. 도움말을 확인하세요.');
}
function integer(value,min=0) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<min) throw Error(min+' 이상의 정수가 필요합니다.');
  return Number(value);
}
function exists(file) { return fs.existsSync(file)||fs.existsSync(file+'.commit'); }
function lock(file,fn) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  let fd;
  try { fd=fs.openSync(file+'.lock','wx'); }
  catch (error) {
    if (error.code!=='EEXIST') throw error;
    let owner;
    try { owner=Number(fs.readFileSync(file+'.lock','utf8').trim()); }
    catch (readError) { if (readError.code!=='ENOENT') throw readError; }
    if (Number.isSafeInteger(owner) && owner>0) {
      try { process.kill(owner,0); }
      catch (check) {
        if (check.code==='ESRCH') throw Error(`종료된 프로세스 PID ${owner}의 저장 잠금이 남았습니다. README의 ‘중단된 저장 복구’ 절차를 확인하세요. ${file}.lock`);
      }
      throw Error(`저장 잠금 소유자는 PID ${owner}입니다. 다른 진행 명령이 끝난 뒤 다시 시도하세요.`);
    }
    throw Error('다른 진행 명령이 저장 잠금을 변경 중입니다. 잠시 뒤 다시 시도하세요.');
  }
  try { fs.writeFileSync(fd,String(process.pid)); return fn(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file+'.lock'); }
}
function read(file) {
  let data;
  try { data=JSON.parse(fs.readFileSync(fs.existsSync(file+'.commit')?file+'.next':file,'utf8')); }
  catch(e) { if(e.code==='ENOENT') throw Error('저장이 없습니다. new 또는 play로 시작하세요.'); throw e; }
  if(data?.format!==FORMAT||!data.state||data.rule!==RULE_VERSION||data.rule!==data.state.version||!Number.isSafeInteger(data.revision)||data.revision<0||!['normal','control'].includes(data.group)) throw Error('이 규칙 버전의 저장 파일이 아닙니다.');
  data.state=upgradeSave(data.state);
  data.rule=data.state.version;
  return data;
}
function finishCopy(file) { fs.copyFileSync(file+'.next',file); fs.unlinkSync(file+'.commit'); fs.unlinkSync(file+'.next'); }
function transaction(file,create,fn) {
  return lock(file,()=>{
    if(create&&exists(file)) throw Error('이미 존재하는 저장입니다. 다른 파일명을 사용하세요.');
    if(fs.existsSync(file+'.commit')) finishCopy(file);
    const {session,output}=fn(create?undefined:read(file));
    const temp=file+'.tmp-'+randomUUID();
    try {
      fs.writeFileSync(temp,JSON.stringify(session)+'\n',{encoding:'utf8',flag:'wx'});
      try { fs.renameSync(temp,file); }
      catch(e) {
        if(!['EPERM','EACCES','EEXIST'].includes(e.code)) throw e;
        fs.copyFileSync(temp,file+'.next'); fs.writeFileSync(file+'.commit','',{flag:'wx'});
        try { finishCopy(file); } catch(e) { process.stderr.write('저장 완료. 다음 명령에서 주 파일을 복구합니다: '+e.code+'\n'); }
      }
      return output;
    } finally { fs.rmSync(temp,{force:true}); }
  });
}

function snapshot(session, view=publicView(session.state)) {
  const {map,...rest} = view;
  return {revision:session.revision, classification:session.group, view:{...rest, reachable:map.filter(n=>n.reachable)}};
}
function run({command,args,save,reason,revision}) {
  if (['help','catalog','rules'].includes(command)) {
    arity(args,0);
    if (command==='help') return {help:help()};
    if (command==='catalog') return catalog();
    return {rules:[
      '양 끝이 막힌 1~10번 전장. 동료 한 명과 같은 행의 다른 목적지를 골라 한 번에 1~9칸 이동합니다.',
      '점유 동료는 매 걸음 직전 칸으로 밀립니다. 중간 칸의 통과 기술, 마지막 칸에서 도착 기술과 새 이웃의 반응을 처리합니다.',
      '이동 하나를 확정하면 행동 수가 1 증가하고 각 적의 카운터가 줄어듭니다. 함께 만료되는 적은 편성 순서대로 행동합니다.',
      '성기사 방어와 대신 받기 한도, 속공은 전투 시작과 개인 재충전 시점마다 갱신됩니다. 재충전 주기는 3행동입니다.',
      '독·가스·탈진은 확정한 행동마다 정산합니다. 처음 연속 9행동, 그 뒤 연속 6행동마다 비활동 피해가 발생합니다.',
      '추격 타격은 가장 가까운 동료의 정면에 가서 한 번, 추격 광역 공격은 정면 중심과 양옆을 칩니다.',
      '반사 경로 공격은 양 끝에서 방향을 돌려 실제로 걸은 세 칸을 칩니다. 이동 치유는 가장 먼 다른 적의 칸으로 가서 인접한 적을 회복합니다.',
    ]};
  }
  if (command==='new') {
    arity(args,0,1);
    return transaction(save,true,()=>{
      const session={format:FORMAT,rule:RULE_VERSION,revision:0,group:'normal',state:createGame(integer(args[0]??31001))};
      return {session,output:snapshot(session)};
    });
  }
  if (command==='fork') {
    arity(args,1);
    const source=lock(save,()=>read(save));
    const destination=path.resolve(args[0]);
    return transaction(destination,true,()=>{
      const session={...source,group:'control',parent:save};
      return {session,output:{...snapshot(session),destination}};
    });
  }
  if (Object.hasOwn(COMMAND_ARGS,command)) {
    arity(args,...COMMAND_ARGS[command]);
    return transaction(save,false,session=>{
      if (revision!==null && session.revision!==revision) throw Error('다른 입력으로 원정이 진행되었습니다. 상태 (show)를 확인하고 다시 고르세요.');
      const before=session.state.journal.length;
      const view=execute(session.state,command,args,reason || [command,...args].join(' '));
      session.revision++;
      return {session,output:{...snapshot(session,view),events:publicJournal(session.state,session.state.journal.length-before)}};
    });
  }
  const session=lock(save,()=>read(save)), s=session.state;
  if (['preview','preview-fusion'].includes(command) && revision!==null && revision!==session.revision)
    throw Error('예고를 계산할 배치가 달라졌습니다. 상태 (show)를 확인하세요.');
  switch (command) {
    case 'show': case 'view': arity(args,0); return snapshot(session);
    case 'map': arity(args,0); return {revision:session.revision,map:publicMap(s)};
    case 'journal': arity(args,0,1); return {revision:session.revision,journal:publicJournal(s,integer(args[0]??20))};
    case 'report': arity(args,0); return {revision:session.revision,classification:session.group,report:report(s)};
    case 'preview-fusion': arity(args,2); return {revision:session.revision,preview:previewFusion(s,...args)};
    case 'preview': {
      arity(args,0,2);
      if (s.phase!=='prepare') throw Error('전투의 플레이어 차례에 미리보기를 사용할 수 있습니다.');
      if (args.length===2) return {revision:session.revision,preview:previewBattle(s,args[0],integer(args[1],1))};
      const movers=s.floors.filter(e=>e && (!args.length || e.id===args[0]));
      if (!movers.length) throw Error('생존 동료 ID를 지정하세요.');
      const preview=movers.flatMap(e=>positions.filter(x=>s.floors[x-1]?.id!==e.id).map(x=>previewBattle(s,e.id,x)));
      return {revision:session.revision,preview};
    }
    default: throw Error('알 수 없는 명령 '+command);
  }
}

const direction = value => ({left:'왼쪽',right:'오른쪽'}[value] ?? '제자리');
const pathText = tiles => tiles?.length ? tiles.join('→') : '없음';
const cardName = type => cards[type]?.name ?? type;
const idNames = {unit:(id,event,part)=>id ? id+(part?'['+part+']':'') : '', card:cardName};
const range = values => {
  if (!values.length) return '—';
  const min=Math.min(...values), max=Math.max(...values);
  return min===max ? String(min) : `${min}~${max}`;
};

function enemyAction(a,detail=true) {
  const pieces=[patternName(a.pattern)];
  if (a.interrupted) return pieces.join(' ')+' · 이 적의 행동 전에 처치·철수 또는 전투 종료 예상';
  if (a.targetId) pieces.push(`목표 ${a.targetId} ${a.to}번`);
  if (a.pattern==='medic' && !a.targetId) pieces.push('이동 목표 없음');
  const from=a.from ?? a.x;
  pieces.push(`${direction(a.direction)} · 경로 ${pathText([from,...(a.path || [])])}`);
  if (a.actualTo!==a.to) pieces.push(`실제 정지 ${a.actualTo}번`);
  if (a.nextDirection) pieces.push('다음 방향 '+direction(a.nextDirection));
  if (a.exitAt) pieces.push(`${a.exitAt}번 철수 접촉`);
  if (a.pattern==='medic') {
    pieces.push('치유력 '+a.healing);
    const heals=(a.heals || []).map(h=>`${h.target}@${h.x} 실제 회복 ${h.amount} (${h.hpBefore}→${h.hpAfter})`);
    pieces.push(heals.length ? heals.join(' / ') : '회복 대상 없음');
  } else {
    pieces.push(`타격당 ${a.power ?? a.attack}${a.firstHitBonus?' · 첫 타격 지원 +'+a.firstHitBonus:''}`);
    pieces.push('타격 칸 '+pathText(a.positions));
    if (detail) for (const hit of a.hits || []) {
      const losses=(hit.damage || []).map(d=>`${d.target}${d.redirected?' 대신 받기':''} 체력 피해 ${d.hpLoss}${d.absorbed?' · 흡수 '+d.absorbed:''} (${d.hpBefore}→${d.hpAfter})`);
      pieces.push(`${hit.x}번 ${hit.targetId ?? '빈칸'}${losses.length?' / '+losses.join(' / '):''}`);
    }
  }
  return pieces.join(' · ');
}
function eventLine(e) {
  switch(e.type) {
    case 'drop': return `${e.source} ${e.from}→${e.to}번 · ${direction(e.direction)} ${e.distance}칸 · 실제 정지 ${e.actualTo}번`;
    case 'visit': return `${e.source} ${e.from}→${e.x}번 ${e.kind==='arrival'?'도착':'통과'}${e.neighbors?.length?' · 도착 후 이웃 '+e.neighbors.join(', '):''}`+
      (e.bridge?.length?' · 추기경 연결 자리 '+e.bridge.map(end=>`${end.x}번 ${end.id || '빈칸'}`).join(' ↔ '):'');
    case 'counters-ticked': return '적 카운터 '+e.counters.map(c=>`${c.id} ${c.before}→${c.after}`).join(' · ');
    case 'counterattack': return `${e.source} 행동 · ${enemyAction(e,false)}${e.resetTo!=null?' · 카운터 재설정 '+e.resetTo:''}`;
    case 'decision': {
      const command=[e.command,...e.args].join(' ');
      return e.reason && e.reason!==command ? `${command} · ${e.reason}` : command;
    }
    case 'campaign-start': return `${e.seed}번 원정 시작`;
    case 'battle-start': return `${e.node} 전투 시작`;
    case 'battle-finished': return `${e.node} ${outcomes[e.outcome] ?? e.outcome} · ${e.actions}행동`;
    case 'action-end': return `${e.action}번째 행동 정산 · 비활동 ${e.inactiveCount}/${e.inactiveThreshold}`;
    case 'ability-ready': return `${e.source} 능력 재충전 · 다음 충전 ${e.nextRefreshAction}번째 이동`;
    case 'node-visited': return `${e.node} ${labels[e.kind]} 방문`;
    case 'node-completed': return `${e.node ?? ''} 지점 완료`;
    case 'reward-offered': return '영입 후보 '+e.offers.map(cardName).join(' / ');
    case 'recovery': return '회복 지점 방문 · 생존 동료 완치';
    case 'rearranged': return '편성 교환 '+e.positions.join(' ↔ ');
    case 'companion-created': return `${e.id} ${cardName(e.companionType)} 영입`;
    case 'companion-placed': return `${e.id} ${e.position}번에 배치`;
    case 'companion-removed': return `${e.id} 교체`;
    case 'purchased': return `${e.slot}번 상품 ${cardName(e.subjectType)} 구매 · ${e.price}재화`;
    case 'upgraded': return `${e.id} 원본 ${e.part} 강화 · 최대 체력 ${e.maxHpBefore}→${e.maxHpAfter}`;
    case 'fused': return `${e.parts.map(p=>cardName(p.type)).join(' + ')} 융합 · 새 동료 ${e.id}`;
    case 'reward-chosen': return `영입 후보 ${e.choice}번 ${cardName(e.companionType)} 선택`;
    case 'acquisition-discarded': return `${e.id} 영입 포기`;
    case 'node-skipped': return `${phases[e.phase]} 건너뛰기`;
    case 'income': return `재화 +${e.amount} · 보유 ${e.coins}`;
    case 'act-start': return `${e.act}막 시작 · 보유 ${e.coins}재화`;
    case 'shop-opened': return '상점에 도착';
    case 'random-target': return `${e.purpose} · 선택 ${e.target}`;
    case 'campaign-won': return '원정 승리';
    case 'campaign-lost': return '원정 패배';
    default: return combatEventText(e,idNames) || `기록 ${e.type}`;
  }
}

function summary(events) {
  const totals={dealt:0,taken:0,allyHeal:0,enemyHeal:0,absorbed:0};
  for (const e of events) {
    if (e.type==='damage') {
      totals[e.side==='enemy'?'dealt':'taken']+=e.hpLoss;
      totals.absorbed+=e.absorbed;
    } else if (e.type==='heal') totals[e.side==='enemy'?'enemyHeal':'allyHeal']+=e.amount;
  }
  return totals;
}
function amounts(scenarios) {
  const totals=scenarios.map(s=>summary(s.events));
  const fields={dealt:'적 체력 피해',taken:'동료 체력 피해',allyHeal:'동료 실제 회복',enemyHeal:'적 실제 회복',absorbed:'흡수'};
  return Object.entries(fields).map(([key,label])=>label+' '+range(totals.map(t=>t[key]))).join(' · ');
}
function renderPreview(p,brief=false) {
  const scenarios=p.scenarios;
  const header=`${p.companion} ${p.from}→${p.to}번 · ${direction(p.direction)} ${p.distance}칸 · ${amounts(scenarios)}`;
  if (brief) return header+(p.complete?'':' · 계산된 분기');
  const lines=[header,`가능한 결과 ${scenarios.length}가지${p.complete?'':' (일부 분기만 계산)'}`];
  for (const s of scenarios) {
    if (s.conditions.length) lines.push(s.conditions.map(c=>`${c.purpose} ${c.targetId}`).join(' · '));
    lines.push(...s.events.map(e=>'  '+eventLine(e)));
    lines.push('  결과 '+(outcomes[s.outcome] ?? '전투 계속'));
    if (!s.outcome) for (const e of s.enemies.filter(e=>e.intent)) {
      lines.push(`  이동 후 다음 예고 ${e.id} · ${timing(e.intent)} · ${enemyAction(e.intent)}`);
    }
  }
  return lines.join('\n');
}

function timing(intent) {
  return `${intent.action}번째 이동 직후 (${intent.counter===1?'이번 수':intent.counter+'수 뒤'}) · 처리 순서 ${intent.order}`;
}
function enemyTemplate(e) {
  const stat=e.pattern==='medic'?'치유 '+e.healing:'타격당 '+e.attack;
  return `${e.type} ${patternName(e.pattern)} · 체력 ${e.maxHp} · ${stat} · 첫 카운터 ${e.firstCounter} / 반복 ${e.period}`;
}
function renderNode(n) {
  return `${n.id} ${labels[n.kind]}${n.reachable?' [이동 가능]':''}${n.completed?' [방문 완료]':''}`
    +(n.enemies?.length?'\n    '+n.enemies.map(enemyTemplate).join('\n    '):'');
}
function renderBoard(b,floors) {
  const row=(label,values)=>label+' '+values.map(v=>String(v ?? '·').padStart(4)).join('');
  return [row('칸  ',positions),row('적  ',positions.map(x=>b.enemies.find(e=>e.hp>0 && e.pos===x)?.id)),
    row('동료',floors.map(e=>e?.id))].join('\n');
}
function renderView(v,revision) {
  const lines=[`${v.act}막 · ${phases[v.phase]} · 재화 ${v.coins} · 방문 ${v.visited.length}/54 · 진행 번호 ${revision}`];
  const tokens = {quick:'속공',poison:'독',exhaustion:'탈진',rage:'분노'};
  for (const [i,e] of v.floors.entries()) if (e) {
    const status=Object.entries(e.tokens).filter(([,n])=>n>0).map(([k,n])=>`${tokens[k]} ${n}`);
    lines.push(`  ${i+1}번 ${e.id} ${e.name}${e.upgraded?' A강화':''}${e.fusion?.bUpgraded?' B강화':''} · 체력 ${e.hp}/${e.maxHp} · 방어 ${e.defense}`+
      (status.length?' · '+status.join(' · '):'')+(v.battle && e.nextRefreshAction ? ` · 재충전 ${e.nextRefreshAction}번째 이동`:''));
  }
  if (v.battle) {
    const b=v.battle;
    lines.push(`확정 행동 ${b.actionCount}회 · 다음 이동 ${b.actionCount+1}번째`,renderBoard(b,v.floors),'적 행동 예고 (현재 배치 유지 · 이후 비활동 피해 제외)');
    for (const e of b.enemies.filter(e=>e.hp>0)) {
      const protection=e.protection.reduce((sum,p)=>sum+p.amount,0);
      lines.push(`  ${e.id} ${e.type} @${e.pos} · 체력 ${e.hp}/${e.maxHp} · 보호 ${protection} · 지원 ${e.support.length*2} · 독 ${e.tokens.poison}`);
      const i=e.intent;
      if (i) lines.push(`    카운터 ${i.counter} · ${timing(i)} · ${enemyAction(i)}`);
    }
    const gas=b.gas.flatMap((row,y)=>row.flatMap((n,x)=>n?[`${y?'적':'동료'} ${x+1}번 ${n}`]:[]));
    lines.push(`가스 ${gas.join(' / ') || '없음'} · 비활동 ${b.inactiveCount}/${b.inactiveThreshold} · 철수 ${b.exit ? b.exit+'번':'미설치'}`);
    for (const a of v.quickActions) lines.push(`가능 속공 ${a.id} ${a.part} ${a.targetId} · 독 ${a.poison} / 회복력 ${a.heal}`);
  }
  if (v.phase==='management') lines.push('전투 편성',...v.node.enemies.map((e,i)=>`  ${[2,5,8][i]}번 ${enemyTemplate(e)}`));
  if (v.phase==='map') lines.push(...v.reachable.map((n,i)=>`${i+1}. ${renderNode(n)}`));
  if (v.phase==='shop') lines.push(...v.shop.map(e=>`${e.slot}. ${e.name} · ${e.price}재화${e.purchased?' [구매 완료]':''} · ${e.baseText}`));
  if (v.phase==='reward') lines.push(...v.rewards.map(e=>`${e.slot}. ${e.name} · ${e.baseText}`));
  if (v.pending) lines.push(`배치할 동료 ${v.pending.entity.name}`);
  lines.push(hints[v.phase]);
  return lines.join('\n');
}
function human(output) {
  if (output.help) return output.help;
  if (output.rules) return output.rules.join('\n');
  if (output.map) return output.map.map(n=>renderNode(n)+' → '+(n.next.join(', ') || '막 종료')).join('\n');
  if (output.companions) return [
    ...Object.entries(output.companions).map(([k,c])=>`${k} ${c.name} · 체력 ${c.hp} · ${c.price}재화\n  ${c.baseText}\n  강화 ${c.upgradeText}`),
    ...Object.values(output.enemyPatterns).map(p=>`${p.name} · ${p.healing?'치유':'타격당 피해'} (1·2·3막) ${(p.healing || p.damage).join(' / ')}`),
  ].join('\n');
  if (output.preview) {
    if (Array.isArray(output.preview)) return output.preview.map(p=>renderPreview(p,true)).join('\n');
    if (output.preview.scenarios) return renderPreview(output.preview);
    const p=output.preview;
    return [`융합 후 ${p.position}번 · 체력 ${p.hp}/${p.maxHp} · ${p.emptiedPosition}번 빈칸`,...p.parts.map(a=>`${a.key} ${a.id} ${cardName(a.type)} · ${a.effect}`)].join('\n');
  }
  if (output.journal) return output.journal.map(e=>`#${e.index} ${e.node ?? e.act+'막'}${e.action?' '+e.action+'번째 행동':''} · ${eventLine(e)}`).join('\n') || '기록 없음';
  if (output.report) {
    const r=output.report;
    return [`판 ${r.seed} · ${phases[r.phase]} · ${r.act}막 · 방문 ${r.visited}/54 · 생존 ${r.companions}명`,
      `재화 ${r.coins} · 누적 ${r.actions.total}행동 · 최장 ${r.actions.max}행동`,
      ...r.battles.map(b=>`${b.node} ${outcomes[b.outcome]} · ${b.actions}행동 · 처치 ${b.kills} · 체력 피해 ${b.hpDamageDealt} · 받은 피해 ${b.hpDamageTaken}`)].join('\n');
  }
  const lines=[];
  if (output.events?.length) {
    const effects=output.events.filter(e=>e.type!=='decision');
    if (effects.some(e=>e.type==='damage' || e.type==='heal')) lines.push(amounts([{events:effects}]));
    lines.push(...effects.map(eventLine));
  }
  if (output.destination) lines.push('분기 저장 '+output.destination);
  lines.push(renderView(output.view,output.revision));
  return lines.join('\n');
}

async function interactive(options) {
  arity(options.args,0,1);
  if (!exists(options.save)) run({...options,command:'new'});
  else if (options.args.length) throw Error('기존 저장에 새 판 번호를 지정할 수 없습니다. 다른 저장 파일을 선택하세요.');
  let current=run({...options,command:'show',args:[]});
  let revision=current.revision;
  process.stdout.write(`Dread to Dead · ${RULE_VERSION} · 도움말 / 종료\n${options.save}\n${human(current)}\n`);
  const rl=createInterface({input:process.stdin,output:process.stdout,crlfDelay:Infinity});
  if (process.stdin.isTTY) { rl.setPrompt('21> '); rl.prompt(); }
  try {
    for await (const line of rl) {
      try {
        const tokens=line.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g)?.map(t=>t.startsWith('"')?JSON.parse(t):t.startsWith("'")?t.slice(1,-1):t);
        if (tokens?.length) {
          const action=parse(tokens);
          if (action.command==='quit') break;
          if (action.command==='play') throw Error('진행 중인 원정입니다.');
          current=run({...action,save:options.save,revision:action.revision ?? revision});
          if (current.view && !current.destination) revision=current.revision;
          process.stdout.write((action.format==='json'?JSON.stringify(current):human(current))+'\n');
        }
      } catch (e) { process.stdout.write('오류 · '+e.message+'\n'); }
      if (process.stdin.isTTY) rl.prompt();
    }
  } finally { rl.close(); }
}
export function runCommand(tokens) { return run(parse(tokens)); }

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    const options=parse(process.argv.slice(2));
    if (options.command==='play') await interactive(options);
    else {
      const output=run(options);
      const asText=options.format==='text' || (!options.format && options.command==='help');
      process.stdout.write((asText?human(output):JSON.stringify(output,null,2))+'\n');
    }
  } catch (e) { process.stderr.write(JSON.stringify({error:e.message})+'\n'); process.exitCode=1; }
}
