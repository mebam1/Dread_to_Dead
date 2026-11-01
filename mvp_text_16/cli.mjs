#!/usr/bin/env node
/** Referee console: persists sealed state but prints public information only. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Game,CREATURES,DICE,creatureDef,RULE_VERSION} from './engine.js';
import {analyze} from './analysis.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIND = 'dread-to-dead-text-16';
const VERSION = 1;
const PHASES = new Set(['map','management','shop','recovery','discovery','event','anomaly_reward','die_reward','roll','choose','prepare','won','lost']);
const READ_ONLY = new Set(['show','map','preview','expansion-preview','journal','catalog','report','help']);
const NEED_REASON = new Set(['visit','place','store','start','choose','play','active','exit','buy','expand','leave','reward','die','event','give-up','recover','upgrade','recover-skip','diagnostic-status','fork']);

function usage() {
  return `사용자 설정 4 · 텍스트 실험 진행기

node cli.mjs [--save PATH] COMMAND [ARGS] [--reason "선택 이유"]
node cli.mjs [--save PATH] --command-json FILE
node cli.mjs [--save PATH] --command-json -  # 표준입력 JSON 한 개

new SEED [CLASSIFICATION]   새 판. normal(기본) / smoke / diagnostic
show | map                  현재 공개 정보 / 현재 막의 공개 지도
catalog                     공개된 괴이 12종·주사위 4종의 전체 효과
visit NODE_ID               연결된 다음 노드 방문 확정
place ENTITY_ID FLOOR       무료 배치·교환
store ENTITY_ID             보관함으로 이동
start                       전투 준비 종료·영업 시작
roll                        현재 턴의 세 주사위 공개
preview [SLOT]              공개된 주사위 또는 확정한 경로만 예고
choose SLOT                 공개된 주사위 자리 확정
active ENTITY_ID [TARGET]   직접 사용
exit FLOOR                  빈층에 탈출구 설치
move                        확정한 이동 실행
play SLOT [--actions JSON]  주사위 선택→명시한 액티브/출구→이동
buy SLOT                    상점 상품 구매
expand                      현재 상점에서 꼭대기 빈층 1개 구매
expansion-preview [JSON]    같은 가상 조건의 증설 전후 비교
leave                       상점·이벤트 종료·스킵
reward INDEX                세 괴이 후보 중 하나 획득
die SLOT | die skip         새 주사위를 기존 자리와 교체 / 거절
event OPTION [ARG]          die SLOT / souls / buy / sacrifice ID / leave
note "선택 이유"            다음 선택의 이유를 미리 기록
checkpoint [LABEL]          읽기 전용 통제 비교용 스냅샷 작성
journal [COUNT]             최근 행동·선택 이유·공개 결과
report                      네 목표의 관찰 수치와 미확인 항목
recover JSON | upgrade ID | recover-skip   회복 노드 선택
fork CHECKPOINT_FILE        새 --save에 control 분기 작성
 diagnostic-status ID seal|fire AMOUNT  diagnostic 판에서만 상태 부여
give-up                     이번 판 포기

SLOT·INDEX는 0부터 시작. FLOOR는 실제 1층부터 시작.
선택 명령에는 --reason 또는 앞선 note가 필요합니다.
play 액션 예: [{"kind":"active","entityId":"e4"}]
JSON 입력 예: {"command":"visit","args":["a1-d1-c1"],"reason":"..."}
저장은 진행자 장부입니다. 플레이어는 원시 저장 대신 show/map 출력만 읽습니다.`;
}

function integer(value, label = '숫자') {
  const n = Number(value);
  if (value === undefined || value === null || String(value).trim() === '' || !Number.isSafeInteger(n)) throw new Error(`${label}에 정수가 필요합니다.`);
  return n;
}

function parse(argv) {
  const result = {save:path.join(HERE,'runs','my_game.json'), args:[], reason:undefined, actions:[], input:undefined};
  for (let i=0;i<argv.length;i++) {
    const token = argv[i];
    if (token === '--save') result.save = path.resolve(argv[++i] || '');
    else if (token === '--reason') result.reason = argv[++i];
    else if (token === '--actions') result.actions = JSON.parse(argv[++i] || 'null');
    else if (token === '--command-json') result.input = argv[++i];
    else if (token === '--help' || token === '-h') result.args.push('help');
    else result.args.push(token);
  }
  if (result.input !== undefined) {
    if (result.args.length) throw new Error('JSON 명령과 일반 명령을 동시에 주지 마세요.');
    const text = result.input === '-' ? fs.readFileSync(0,'utf8') : fs.readFileSync(result.input,'utf8');
    const input = JSON.parse(text);
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.command !== 'string' || (input.args !== undefined && !Array.isArray(input.args))) throw new Error('JSON은 {command,args,reason,actions} 객체여야 합니다.');
    result.args = [input.command,...(input.args || [])];
    result.reason = input.reason ?? result.reason;
    result.actions = input.actions ?? result.actions;
  }
  result.command = result.args.shift() || 'help';
  if (!Array.isArray(result.actions)) throw new Error('actions는 배열이어야 합니다.');
  if (result.reason !== undefined && (typeof result.reason !== 'string' || !result.reason.trim())) throw new Error('선택 이유는 비어 있지 않은 문장이어야 합니다.');
  return result;
}

function validateSession(value) {
  if (!value || value.kind !== KIND || value.schemaVersion !== VERSION || !value.state || typeof value.state !== 'object') throw new Error('이 진행기의 저장 형식이 아닙니다.');
  const s = value.state;
  if (!Number.isSafeInteger(s.seed) || !PHASES.has(s.phase) || !Array.isArray(s.entities) || !Array.isArray(s.equipped) || s.equipped.length !== 3 || !Number.isInteger(s.floorCount) || s.floorCount < 6 || s.floorCount > 10 || !Number.isFinite(s.money) || s.money < 0 || !Array.isArray(value.journal) || !Array.isArray(value.checkpoints)) throw new Error('저장 상태의 필수 값이 유효하지 않습니다.');
  return value;
}

function load(save) {
  try { return validateSession(JSON.parse(fs.readFileSync(save,'utf8'))); }
  catch (original) {
    const recovery = `${save}.recovery`;
    if (!fs.existsSync(recovery)) throw original;
    const session = validateSession(JSON.parse(fs.readFileSync(recovery,'utf8')));
    session.recoveryNotice = '중단된 파일 교체를 감지해 직전의 완전한 복구 사본을 읽었습니다.';
    return session;
  }
}

function atomicWrite(destination, data, {exclusive=false}={}) {
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    if (exclusive) {
      // COPYFILE_EXCL works inside Windows sandboxes where hard links may be denied.
      // New files never replace an earlier run; existing-state mutations use rename.
      fs.copyFileSync(temporary,destination,fs.constants.COPYFILE_EXCL);
      fs.unlinkSync(temporary);
    } else {
      try { fs.renameSync(temporary,destination); }
      catch (error) {
        if (!['EPERM','EACCES','EEXIST'].includes(error.code)) throw error;
        // Some Windows managed sandboxes deny rename-over-existing. Keep a complete
        // recovery copy until the replacement is written; load() can recover it.
        const recovery = `${destination}.recovery`;
        if (fs.existsSync(destination)) {
          let validPrimary = false;
          try { validateSession(JSON.parse(fs.readFileSync(destination,'utf8'))); validPrimary = true; }
          catch { /* A recovered session may still have a partial primary file. */ }
          if (validPrimary) fs.copyFileSync(destination,recovery);
          else {
            // Preserve the valid backup used by load(); never replace it with the
            // interrupted primary before the new complete state is installed.
            if (!fs.existsSync(recovery)) throw new Error('기존 기록이 불완전하고 복구 사본이 없어 안전하게 교체할 수 없습니다.');
            validateSession(JSON.parse(fs.readFileSync(recovery,'utf8')));
          }
        }
        fs.copyFileSync(temporary,destination);
        if (fs.existsSync(recovery)) fs.unlinkSync(recovery);
      }
    }
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function marker(s) {
  return {act:s.act,node:s.currentNode,phase:s.phase,floors:s.floorCount,souls:s.money,guestIndex:s.guestIndex,turn:s.visitor?.turn ?? null};
}

function creatureInfo(value) {
  const def=creatureDef(value);
  return {type:def.type,name:def.name,role:def.role,concept:def.concept,effects:{pass:def.passText,arrival:def.arrivalText,active:def.activeText},limit:def.limit,initialP:def.maxP,initialUses:def.initialUses,maxStoredUses:def.maxStoredUses,upgradeText:def.upgradeText,upgraded:def.upgraded};
}

function dieInfo(type) {
  return {type,name:DICE[type].name,faces:DICE[type].faces,effect:DICE[type].effectText};
}

function publicView(g, includeMap=false) {
  const view = g.view();
  if (!view || typeof view !== 'object') throw new Error('엔진이 공개 정보 view()를 반환하지 않았습니다.');
  // A turn response must not repeat the entire 20-node map. It stays available via map.
  if (!includeMap) delete view.map;
  view.entities = view.entities.map(entity=>({...entity,...creatureInfo(entity),maxP:creatureDef(entity).maxP,activeUnavailable:g.activeReason(entity.id),activeTargets:g.activeTargets(entity.id)}));
  view.equipped = view.equipped.map((type,slot)=>({slot,...dieInfo(type)}));
  view.dice = view.dice.map(die=>({...die,name:DICE[die.type].name,effect:DICE[die.type].effectText}));
  if (view.reward?.creatures) view.reward.cards = view.reward.creatures.map((type,index)=>({index,...creatureInfo(type),cost:0}));
  if (view.reward?.die) view.reward.dieCard = dieInfo(view.reward.die);
  const contents = view.node?.contents;
  if (contents?.stock) contents.stock = contents.stock.map(item=>{
    const price = CREATURES[item.type].price;
    return {...item,...creatureInfo(item.type),price,unavailable:item.bought?'품절':view.money<price?`영혼 ${price-view.money} 부족`:''};
  });
  if (contents?.die) contents.dieCard = dieInfo(contents.die);
  if (contents?.creature) contents.creatureCard = {...creatureInfo(contents.creature),tradePrice:3};
  if (contents?.event) contents.eventName = {luggage:'잊힌 투숙객의 짐',sealed:'봉인된 객실',contract:'지하 계약'}[contents.event];
  return view;
}

function eventSlice(g, start) {
  return Array.isArray(g.s.history) ? structuredClone(g.s.history.slice(start)) : structuredClone(g.events || []);
}

function cleanPreview(result) {
  if (!result || typeof result !== 'object') return result;
  // Never print a preview clone's referee state: it may contain unvisited nodes.
  const {state, ...publicResult} = result;
  if (state) {
    publicResult.after = {
      phase:state.phase,visitor:state.visitor,entities:state.entities,
      floorCount:state.floorCount,equipped:state.equipped,
      souls:state.money,stats:state.stats
    };
  }
  return publicResult;
}

function normalizeActions(actions) {
  return actions.map(action => {
    if (!action || typeof action !== 'object' || !['active','escape'].includes(action.kind)) throw new Error('play 액션은 active 또는 escape여야 합니다.');
    if (action.kind === 'escape') return {kind:'escape',floor:integer(action.floor,'출구 층')};
    if (typeof action.entityId !== 'string') throw new Error('active 액션에는 entityId가 필요합니다.');
    return {kind:'active',entityId:action.entityId,targetId:action.targetId ?? null};
  });
}

function takeReason(session, input, command) {
  if (!NEED_REASON.has(command)) return null;
  const reason = input.reason?.trim() || session.pendingReason?.text;
  if (!reason) throw new Error('선택 이유가 필요합니다. --reason "..." 또는 먼저 note "..."를 사용하세요.');
  session.pendingReason = null;
  return reason;
}

function execute(input) {
  const {command:c,args,save} = input;
  if (c === 'help') return {help:usage()};
  if (c === 'catalog') return {command:c,classification:'public-rules',creatures:Object.keys(CREATURES).map(type=>({...creatureInfo(type),shopPrice:CREATURES[type].price})),dice:Object.keys(DICE).map(dieInfo)};
  let session, g;
  if (c === 'fork') {
    if(fs.existsSync(save))throw new Error('분기는 새로운 --save 파일명을 사용하세요.');
    const checkpoint=JSON.parse(fs.readFileSync(String(args[0]),'utf8'));
    if(checkpoint.kind!=='dread-to-dead-text-16-checkpoint')throw new Error('실험16 체크포인트가 아닙니다.');
    g=Game.fromState(checkpoint.state);
    session={kind:KIND,schemaVersion:VERSION,protocol:RULE_VERSION,classification:'control',parent:{source:checkpoint.source,label:checkpoint.label},createdAt:new Date().toISOString(),state:g.s,journal:[],pendingReason:null,checkpoints:[]};
  } else if (c === 'new') {
    if (fs.existsSync(save)) throw new Error('저장 파일이 이미 있습니다. 새 파일명을 사용하세요.');
    const seed = integer(args[0] ?? 31001,'난수 번호');
    g = new Game(seed);
    const classification = args[1] ?? 'normal';
    if (!['normal','smoke','diagnostic'].includes(classification)) throw new Error('새 판 분류는 normal, smoke, diagnostic 중 하나입니다.');
    session = {kind:KIND,schemaVersion:VERSION,protocol:RULE_VERSION,classification,createdAt:new Date().toISOString(),state:g.s,journal:[],pendingReason:null,checkpoints:[]};
  } else {
    session = load(save);
    g = Game.fromState(session.state);
  }

  const historyStart = g.s.history?.length || 0;
  const before = marker(g.s);
  let reason = takeReason(session,input,c);
  let result;
  switch (c) {
    case 'new': break;
    case 'fork': break;
    case 'report': result=analyze(g.s,session.classification,session.journal); break;
    case 'recover': g.recover(typeof args[0]==='string'?JSON.parse(args[0]):args[0]); break;
    case 'upgrade': g.upgrade(String(args[0])); break;
    case 'recover-skip': g.skipRecovery(); break;
    case 'diagnostic-status': {
      if(session.classification!=='diagnostic')throw new Error('상태 주입은 diagnostic 판에서만 가능합니다.');
      g.diagnoseStatus(String(args[0]),String(args[1]),integer(args[2],'상태량'));break;
    }
    case 'show': break;
    case 'map': break;
    case 'visit': g.visit(String(args[0])); break;
    case 'place': g.place(String(args[0]),integer(args[1],'배치 층')); break;
    case 'store': g.store(String(args[0])); break;
    case 'start': g.startService(); break;
    case 'roll': g.roll(); break;
    case 'choose': g.choose(integer(args[0],'주사위 자리')); break;
    case 'active': g.active(String(args[0]),args[1] == null ? null : String(args[1])); break;
    case 'exit': g.installEscape(integer(args[0],'출구 층')); break;
    case 'move': {
      // The chosen movement already has a recorded reason; this is its execution.
      reason = input.reason?.trim() || session.journal.findLast(entry=>entry.command==='choose'||entry.command==='play')?.reason || null;
      if (!reason) throw new Error('이동할 주사위 선택 이유를 먼저 기록하세요.');
      g.move();
      break;
    }
    case 'play': {
      const actions = normalizeActions(input.actions);
      g.choose(integer(args[0],'주사위 자리'));
      for (const action of actions) {
        if (g.s.phase !== 'prepare') throw new Error('리롤 뒤에는 새로 굴리고 확정해야 합니다. 이후 액션을 미리 지정할 수 없습니다.');
        if (action.kind === 'escape') g.installEscape(action.floor);
        else g.active(action.entityId,action.targetId);
      }
      if (g.s.phase === 'prepare') g.move();
      break;
    }
    case 'preview': {
      const actions = normalizeActions(input.actions);
      if (args[0] !== undefined) result = cleanPreview(g.preview(integer(args[0],'주사위 자리'),actions));
      else if (g.s.phase === 'choose') result = g.s.dice.map(die=>({slot:die.slot,...cleanPreview(g.preview(die.slot,actions))}));
      else result = cleanPreview(g.preview(undefined,actions));
      break;
    }
    case 'expansion-preview': {
      const options = args[0] === undefined ? {} : typeof args[0] === 'string' ? JSON.parse(args[0]) : args[0];
      const preview = g.expansionPreview(options);
      result = {...preview,before:cleanPreview(preview.before),after:cleanPreview(preview.after)};
      break;
    }
    case 'buy': g.buy(integer(args[0],'상품 슬롯')); break;
    case 'expand': g.expand(); break;
    case 'leave': g.leave(); break;
    case 'reward': g.claimCreature(integer(args[0],'괴이 후보')); break;
    case 'die': {
      if (args[0] === 'skip') g.skipDie();
      else g.claimDie(integer(args[0],'교체할 자리'));
      break;
    }
    case 'event': {
      const option = String(args[0]);
      const arg = option === 'die' ? integer(args[1],'교체할 자리') : args[1];
      g.eventChoose(option,arg);
      break;
    }
    case 'give-up': g.giveUp(); break;
    case 'note': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('기록할 이유를 입력하세요.');
      session.pendingReason = {text,at:marker(g.s)};
      reason = text;
      break;
    }
    case 'journal': result = session.journal.slice(-Math.max(1,integer(args[0] ?? 10,'기록 수'))); break;
    case 'checkpoint': {
      const label = String(args[0] ?? `decision-${session.journal.length+1}`);
      if (!/^[\p{L}\p{N}_.-]{1,80}$/u.test(label)) throw new Error('체크포인트 이름은 문자·숫자·점·밑줄·하이픈 1~80자로 지정하세요.');
      if (session.checkpoints.some(item=>item.label===label)) throw new Error('같은 체크포인트 이름이 있습니다. 새 이름을 사용하세요.');
      const destination = path.join(path.dirname(save),'checkpoints',`${path.basename(save,'.json')}-${label}.json`);
      atomicWrite(destination,{kind:'dread-to-dead-text-16-checkpoint',schemaVersion:VERSION,classification:'control-source',label,source:path.resolve(save),createdAt:new Date().toISOString(),state:structuredClone(g.s),publicView:publicView(g)},{exclusive:true});
      session.checkpoints.push({label,file:destination,at:marker(g.s)});
      result = {checkpoint:destination,classification:'control-source',notice:'비교용 원본입니다. 플레이어가 원시 state를 열어 미방문 내용을 읽지 않습니다.'};
      break;
    }
    default: throw new Error(`지원하지 않는 명령: ${c}. help를 확인하세요.`);
  }

  const events = eventSlice(g,historyStart);
  if (!READ_ONLY.has(c)) {
    session.journal.push({sequence:session.journal.length+1,at:new Date().toISOString(),command:c,args,actions:input.actions,reason,before,after:marker(g.s),events});
    session.state = g.s;
    atomicWrite(save,session,{exclusive:c==='new'||c==='fork'});
  }
  return {command:c,classification:session.classification,...(session.recoveryNotice?{recoveryNotice:session.recoveryNotice}:{}),view:publicView(g,c==='map'),...(result===undefined?{}:{result}),events,pendingReason:session.pendingReason?.text ?? null,recentDecisions:session.journal.filter(item=>item.reason).slice(-3).map(({sequence,command,reason,before,after})=>({sequence,command,reason,before,after}))};
}

try {
  const input = parse(process.argv.slice(2));
  const output = execute(input);
  if (output.help) process.stdout.write(output.help+'\n');
  else process.stdout.write(JSON.stringify(output,null,2)+'\n');
} catch (error) {
  process.stderr.write(JSON.stringify({error:error.message})+'\n');
  process.exitCode = 1;
}
