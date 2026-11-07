#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { COMMAND_ARGS, RULE_VERSION, catalog, createGame, execute, previewBattle, previewFusion, publicJournal, publicMap, publicView, report, upgradeSave } from './engine.mjs';

import { TRIAL_RULES } from './shared.mjs';

const FORMAT='dread-to-dead/text19-run/1';
const DEFAULT_SAVE=fileURLToPath(new URL('./runs/my_game-v1.2.json',import.meta.url));
const hints={
  map:'visit 노드번호/ID · swap 지점 지점 · map',
  management:'swap 지점 지점 · start',
  prepare:'active 동료ID A/B 대상ID · exit 빈지점 · preview [동료ID 주사위번호] · move 동료ID 주사위번호',
  reward:'reward 후보번호 · skip',place:'place 지점 · discard',
  shop:'buy 상품번호 · leave',fusion:'preview-fusion A_ID B_ID · fuse A_ID B_ID · skip',
  upgrade:'upgrade 동료ID · skip',won:'report · journal',lost:'report · journal',
};
const labels={normal:'일반전투',elite:'엘리트',boss:'보스',recovery:'회복',shop:'상점',fusion:'융합',upgrade:'강화'};
function help() {
  return ['Dread-to-Dead · 텍스트 19 / 설정 '+RULE_VERSION,
    'node cli.mjs [--save 저장파일] 명령 [인자] [--reason "선택 이유"]',
    'play [새 판번호]: 대화형 진행/이어하기 · new [판번호]: 새 저장 · fork 새파일: 비교용 분기',
    'show · map · catalog · rules (시험 판정) · preview [동료ID 주사위번호] · preview-fusion A_ID B_ID · journal [개수] · report · help',
    ...Object.entries(hints).map(([k,v])=>k+': '+v),
    'give-up: 원정 포기 · quit: 대화 종료. 위치/후보/상품 번호는 1부터 시작합니다.',
    '매 차례 새 6면체 주사위 3개 중 하나와 이동할 동료를 고릅니다. 나머지 주사위는 그 차례가 끝나면 버립니다.',
    '예: preview c3 2 / 주사위 사용 #C3 2. 끝의 2는 화면에서 두 번째 주사위를 뜻합니다.',
    'preview만 입력하면 모든 주사위와 동료 조합을 검토합니다.'].join('\n');
}
function parse(tokens) {
  const result={save:DEFAULT_SAVE,reason:'',words:[]};
  const seen=new Set();
  for(let i=0;i<tokens.length;i++) {
    const token=tokens[i];
    if(token==='--save'||token==='--reason') {
      const value=tokens[++i];
      if(seen.has(token)||!value?.trim()||value.startsWith('--')) throw Error(token+' 값을 하나 지정하세요.');
      seen.add(token); result[token.slice(2)]=token==='--save'?path.resolve(value):value;
    } else if(token==='--help'||token==='-h') result.words.push('help');
    else if(token.startsWith('--')) throw Error('알 수 없는 옵션 '+token);
    else result.words.push(token);
  }
  if (result.words[0] === '주사위' && result.words[1] === '사용') result.words.splice(0,2,'move');
  if (result.words[0] === '검토') result.words[0] = 'preview';
  const [command='play',...args]=result.words;
  if (['move','preview'].includes(command) && args[0]) args[0] = args[0].replace(/^#/,'').toLowerCase();
  return {...result,command:command==='giveup'?'give-up':command,args};
}
function arity(args,min,max=min) { if(args.length<min||args.length>max) throw Error('인자 개수가 맞지 않습니다. help를 확인하세요.'); }
function integer(value,min=0) { if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<min) throw Error(min+' 이상의 정수가 필요합니다.'); return Number(value); }
function exists(file) { return fs.existsSync(file)||fs.existsSync(file+'.commit'); }
function lock(file,fn) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  let fd;
  try { fd=fs.openSync(file+'.lock','wx'); }
  catch(e) { if(e.code==='EEXIST') throw Error('다른 진행 명령이 저장을 사용 중입니다.'); throw e; }
  try { fs.writeFileSync(fd,String(process.pid)); return fn(); }
  finally { fs.closeSync(fd); fs.unlinkSync(file+'.lock'); }
}
function read(file) {
  let data;
  try { data=JSON.parse(fs.readFileSync(fs.existsSync(file+'.commit')?file+'.next':file,'utf8')); }
  catch(e) { if(e.code==='ENOENT') throw Error('저장이 없습니다. new 또는 play로 시작하세요.'); throw e; }
  if(data?.format!==FORMAT||!data.state||data.rule!==data.state.version||!['normal','control'].includes(data.group)) throw Error('이 규칙 버전의 저장 파일이 아닙니다.');
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
function result(session) {
  const {map,...view}=publicView(session.state);
  return {classification:session.group,view:{...view,reachable:map.filter(n=>n.reachable)}};
}
function run({command,args,save,reason}) {
  if(command==='help') { arity(args,0); return {help:help()}; }
  if(command==='rules') { arity(args,0); return {help:TRIAL_RULES.join('\n')}; }
  if(command==='catalog') { arity(args,0); return catalog(); }
  if(command==='new') {
    arity(args,0,1);
    return transaction(save,true,()=>{const session={format:FORMAT,rule:RULE_VERSION,group:'normal',state:createGame(integer(args[0]??31001))};return {session,output:result(session)};});
  }
  if(command==='fork') {
    arity(args,1); const source=lock(save,()=>read(save)); const dest=path.resolve(args[0]);
    return transaction(dest,true,()=>{const session={...source,group:'control',parent:save};return {session,output:{...result(session),destination:dest}};});
  }
  if(Object.hasOwn(COMMAND_ARGS,command)) {
    arity(args,...COMMAND_ARGS[command]);
    if(command==='move' && !reason.trim()) reason='선택한 동료에게 주사위 사용';
    if(!reason.trim()) throw Error('--reason "선택 이유"를 지정하세요.');
    return transaction(save,false,session=>{execute(session.state,command,args,reason);return {session,output:result(session)};});
  }
  const session=lock(save,()=>read(save)),s=session.state;
  switch(command) {
    case 'show': case 'view': arity(args,0); return result(session);
    case 'map': arity(args,0); return {map:publicMap(s)};
    case 'journal': arity(args,0,1); return {journal:publicJournal(s,integer(args[0]??20))};
    case 'report': arity(args,0); return {classification:session.group,report:report(s)};
    case 'preview-fusion': arity(args,2); return {preview:previewFusion(s,...args)};
    case 'preview': {
      if (s.phase !== 'prepare') throw Error('전투 중에 미리보기를 사용하세요.');
      if (args.length) {
        if (args.length!==2) throw Error('preview 동료ID 주사위번호(1~3)를 입력하세요.');
        return {preview:previewBattle(s,args[0],integer(args[1],1))};
      }
      return {preview:s.floors.filter(Boolean).flatMap(e=>s.battle.dice.map((_,i)=>previewBattle(s,e.id,i+1)))};
    }
    default: throw Error('알 수 없는 명령 '+command);
  }
}
function human(output) {
  if(output.help) return output.help;
  if(output.preview) {
    const previews=Array.isArray(output.preview)?output.preview:[output.preview];
    if(previews.every(p=>Array.isArray(p.scenarios))) return previews.map(p=>{
      const cases=p.scenarios;
      const range=(values)=>{const low=Math.min(...values),high=Math.max(...values);return low===high?String(low):`${low}~${high}`;};
      const ids=[...new Set(cases.flatMap(x=>x.allies.map(e=>e.id)))];
      const enemies=[...new Set(cases.flatMap(x=>x.enemies.map(e=>e.id)))];
      return [
        `동료 ${p.companion} · ${p.slot}번 주사위 (눈 ${p.die}) · ${cases.length}분기${p.complete?'':' (일부)'}`,
        '  이동: '+(cases[0]?.events??[]).filter(e=>e.type==='visit'||e.type==='push').map(e=>e.type==='visit'?`${e.source}→${e.x}`:`밀림 ${e.target}→${e.to}`).join(' '),
        '  방어: '+ids.map(id=>id+'='+range(cases.map(x=>x.allies.find(e=>e.id===id)?.defense??0))).join(' '),
        '  결과: '+[...new Set(cases.map(x=>x.outcome??'계속'))].join(' / '),
        '  동료 체력: '+ids.map(id=>id+'='+range(cases.map(x=>x.allies.find(e=>e.id===id)?.hp??0))).join(' '),
        '  적 체력: '+enemies.map(id=>id+'='+range(cases.map(x=>x.enemies.find(e=>e.id===id)?.hp??0))).join(' '),
        p.uncertainties.length?'  무작위: '+p.uncertainties.join(', '):'  현재 공개 상태에서 확정 결과',
      ].join('\n');
    }).join('\n');
  }
  if(output.map) return output.map.map(n=>`${n.id} ${labels[n.kind]}${n.reachable?' [이동 가능]':''}${n.completed?' [완료]':''} ${n.enemies.map(e=>`${e.type} HP${e.maxHp} 공격${e.attack} ${e.pattern} · 첫 카운터 ${e.firstCounter}/주기 ${e.period}`).join(' / ')} → ${n.next.join(',')}`).join('\n')+'\nvisit에는 이동 가능 목록의 번호 또는 노드 ID를 사용하세요.';
  if(output.companions) return Object.entries(output.companions).map(([key,c])=>`${key}: ${c.name} 체력${c.hp} 가격${c.price}\n  ${c.baseText}\n  강화: ${c.upgradeText}`).join('\n');
  if(!output.view) return JSON.stringify(output,null,2);
  const v=output.view;
  const tokenNames={quick:'속공',poison:'독',exhaustion:'탈진',rage:'분노'};
  const tokens=e=>Object.entries(e.tokens).filter(([,n])=>n>0).map(([t,n])=>`${tokenNames[t]}${n}`).join(' ')||'없음';
  const lines=[`${v.act}막 · ${v.phase} · 재화 ${v.coins} · 방문 ${v.visited.length}/54`];
  lines.push(...v.floors.map((e,i)=>e?`${i+1}: ${e.id} ${e.name}${e.upgraded?' A강화':''}${e.fusion?.bUpgraded?' B강화':''} 체력 ${e.hp}/${e.maxHp} 방어 ${e.defense} 상태 ${tokens(e)}`:`${i+1}: ·`));
  if(v.battle) {
    const b=v.battle;
    const cells=Array.from({length:10},(_,i)=>i+1);
    const row=(label,values)=>label+' '+values.map(value=>String(value??'·').padStart(4)).join('');
    lines.push(row('지점',cells),
      row('적  ',cells.map(x=>b.enemies.find(e=>e.hp>0 && e.pos===x)?.id)),
      row('동료',v.floors.map(e=>e?.id)));
    const patterns={double:'연속 2타',path:'3칸 경로공격',neighbor:'이웃',mirror:'거울',strikeMove:'타격 후 3칸 이동'};
    lines.push(`${b.round}라운드 · 유저 ${b.turn}/3 · 주사위 ${b.dice.map((face,i)=>`${i+1}번[${face}]`).join('  ')}`);
    lines.push(...b.enemies.map(e=>`${e.id} ${e.type} @${e.pos} HP ${e.hp}/${e.maxHp} · ${e.hp ? '카운터 '+e.intent.counter+' · '+patterns[e.intent.pattern]+' · 타격당 '+e.intent.power+' · 현재 위치 기준 '+(e.intent.positions.join('→')||'타격 없음')+' · 이동 '+(e.intent.path.join('→')||'없음') : '처치'} · 보호${e.protection.reduce((n,p)=>n+p.amount,0)} 지원${e.support.length} · 상태 ${tokens(e)}`));
    const gas=b.gas.flatMap((row,y)=>row.flatMap((n,x)=>n?[`${['동료','적'][y]}${x+1}=${n}`]:[]));
    lines.push('가스: '+(gas.join(' ')||'없음')+` · 비활동 ${b.inactiveCount}/${b.inactiveThreshold}`+(b.exit?` · 철수 ${b.exit}번`:''));
    if(v.quickActions.length) lines.push('가능 속공: '+v.quickActions.map(a=>`${a.id} ${a.part} → ${a.targetId} (독${a.poison}/회복${a.heal})`).join(' / '));
  }
  if(v.phase==='map') lines.push(...v.reachable.map((n,i)=>`${i+1}: ${n.id} ${labels[n.kind]} ${n.enemies?.map(e=>`${e.type} 체력${e.maxHp} ${e.pattern} 공격${e.attack} 첫 카운터${e.firstCounter}/주기${e.period}`).join(' / ')??''}`));
  if(v.phase==='shop') lines.push(...v.shop.map(e=>`${e.slot}: ${e.name} ${e.price}재화 ${e.purchased?'구매완료':''} / ${e.baseText}`));
  if(v.phase==='reward') lines.push(...v.rewards.map(e=>`${e.slot}: ${e.name} / ${e.baseText}`));
  if(v.pending) lines.push('획득: '+v.pending.entity.name);
  lines.push(hints[v.phase]??'help');
  return lines.join('\n');
}
async function interactive(options) {
  arity(options.args,0,1);
  if(!exists(options.save)) run({...options,command:'new'});
  else if(options.args.length) throw Error('기존 저장에 새 판번호를 지정할 수 없습니다. --save로 다른 파일을 선택하세요.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  process.stdout.write(help()+'\n'+human(run({...options,command:'show',args:[]}))+'\n');
  try {
    while(true) {
      const line=await rl.question('19> ');
      if(!line.trim()) continue;
      if(['quit','q','exit-game'].includes(line.trim())) break;
      try {
        const tokens=line.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g)?.map(t=>t[0]==='"'?JSON.parse(t):t[0]==="'"?t.slice(1,-1):t)??[];
        const action={...parse(tokens),save:options.save};
        if(action.command==='play') throw Error('진행 중입니다. 명령을 입력하세요.');
        if(action.command!=='move' && Object.hasOwn(COMMAND_ARGS,action.command)&&!action.reason) action.reason=(await rl.question('선택 이유: ')).trim();
        process.stdout.write(human(run(action))+'\n');
      } catch(e) { process.stdout.write('오류: '+e.message+'\n'); }
    }
  } finally { rl.close(); }
}
export function runCommand(tokens) { return run(parse(tokens)); }

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const options=parse(process.argv.slice(2));
    if(options.command==='play') await interactive(options);
    else process.stdout.write(JSON.stringify(run(options),null,2)+'\n');
  } catch(e) { process.stderr.write(JSON.stringify({error:e.message})+'\n'); process.exitCode=1; }
}
