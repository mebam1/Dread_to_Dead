#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { COMMAND_ARGS, PERMUTATIONS, RULE_VERSION, catalog, createGame, execute, previewBattle, previewFusion, publicJournal, publicMap, publicView, report } from './engine.mjs';

const FORMAT='dread-to-dead/text18-run/1';
const DEFAULT_SAVE=fileURLToPath(new URL('./runs/my_game.json',import.meta.url));
const hints={
  map:'visit 노드번호/ID · swap 지점 지점 · map',
  management:'swap 지점 지점 · start',
  choose:'preview [배분번호] · choose 1~6 · assign 아래D번호 가운데D번호 위D번호',
  prepare:'active 동료ID A/B 대상ID · exit 빈지점 · preview · move',
  reward:'reward 후보번호 · skip',place:'place 지점 · discard',
  shop:'buy 상품번호 · leave',fusion:'preview-fusion A_ID B_ID · fuse A_ID B_ID · skip',
  upgrade:'upgrade 동료ID · skip',won:'report · journal',lost:'report · journal',
};
const labels={normal:'일반전투',elite:'엘리트',boss:'보스',recovery:'회복',shop:'상점',fusion:'융합',upgrade:'강화'};
function help() {
  return ['Dread-to-Dead · 텍스트 18 / 설정 '+RULE_VERSION,
    'node cli.mjs [--save 저장파일] 명령 [인자] [--reason "선택 이유"]',
    'play [새 판번호]: 대화형 진행/이어하기 · new [판번호]: 새 저장 · fork 새파일: 비교용 분기',
    'show · map · catalog · preview [1~6] · preview-fusion A_ID B_ID · journal [개수] · report · help',
    ...Object.entries(hints).map(([k,v])=>k+': '+v),
    '배분 1~6: '+PERMUTATIONS.map((a,i)=>(i+1)+'=['+a.join(',')+']').join(' '),
    'give-up: 원정 포기 · quit: 대화 종료. 위치/후보/상품 번호는 1부터 시작합니다.',
    '일반 전투의 세 행과 긴 적의 세 이동 모두 아래→가운데→위 순서입니다.'].join('\n');
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
  const [command='play',...args]=result.words;
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
  if(data?.format!==FORMAT||data.rule!==RULE_VERSION||data.state?.version!==RULE_VERSION||!['normal','control'].includes(data.group)) throw Error('설정 18 v1.5 저장 파일이 아닙니다.');
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
      arity(args,0,1);
      if(s.phase==='choose') {
        const indexes=args.length?[integer(args[0],1)]:[1,2,3,4,5,6];
        if(indexes.some(i=>i>6)) throw Error('배분 번호는 1~6입니다.');
        return {preview:indexes.map(i=>({choice:i,...previewBattle(s,PERMUTATIONS[i-1])}))};
      }
      if(args.length) throw Error('배분 번호는 choose 단계에서 지정합니다.');
      return {preview:previewBattle(s)};
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
        `${p.choice?'배분 '+p.choice+' ':''}[${p.assignment.map(d=>'D'+d).join(',')}] · ${cases.length}분기${p.complete?'':' (일부만 표시; 전체 결과 아님)'}`,
        '  결과: '+[...new Set(cases.map(x=>x.outcome??'계속'))].join(' / '),
        '  동료 체력: '+ids.map(id=>id+'='+range(cases.map(x=>x.allies.find(e=>e.id===id)?.hp??0))).join(' '),
        '  적 체력: '+enemies.map(id=>id+'='+range(cases.map(x=>x.enemies.find(e=>e.id===id)?.hp??0))).join(' '),
        p.uncertainties.length?'  무작위: '+p.uncertainties.join(', '):'  현재 공개 상태에서 확정 결과',
      ].join('\n');
    }).join('\n');
  }
  if(output.map) return output.map.map(n=>`${n.id} ${labels[n.kind]}${n.reachable?' [이동 가능]':''}${n.completed?' [완료]':''} ${n.enemies.map(e=>`${e.type} HP${e.maxHp} 공격${e.attack} ${e.pattern}`).join(' / ')} → ${n.next.join(',')}`).join('\n')+'\nvisit에는 이동 가능 목록의 번호 또는 노드 ID를 사용하세요.';
  if(output.companions) return Object.entries(output.companions).map(([key,c])=>`${key}: ${c.name} 체력${c.hp} 가격${c.price}\n  ${c.baseText}\n  강화: ${c.upgradeText}`).join('\n');
  if(!output.view) return JSON.stringify(output,null,2);
  const v=output.view;
  const tokenNames={quick:'속공',poison:'독',exhaustion:'탈진',rage:'분노'};
  const tokens=e=>Object.entries(e.tokens).filter(([,n])=>n>0).map(([t,n])=>`${tokenNames[t]}${n}`).join(' ')||'없음';
  const lines=[`${v.act}막 · ${v.phase} · 재화 ${v.coins} · 방문 ${v.visited.length}/54`];
  lines.push(...v.floors.map((e,i)=>e?`${i+1}: ${e.id} ${e.name}${e.upgraded?' A강화':''}${e.fusion?.bUpgraded?' B강화':''} 체력 ${e.hp}/${e.maxHp} 방어 ${e.defense} 상태 ${tokens(e)}`:`${i+1}: ·`));
  if(v.battle) {
    const b=v.battle, rows=['아래','가운데','위'];
    const patterns={double:'연타',path:'경로',neighbor:'이웃',mirror:'거울',alternate:'홀수 연타/짝수 거울'};
    lines.push(`${b.round}라운드 · ${b.dice.map((n,i)=>`D${i+1}=${n}`).join(' ')} · ${b.assignment.map((d,i)=>`${rows[i]} D${d}(${b.dice[d-1]})`).join(' / ')}`);
    lines.push(...b.enemies.map(e=>`${e.id} ${e.rows.map(r=>rows[r]).join('/')} ${e.type} @${e.pos||'진입 전'} HP ${e.hp}/${e.maxHp}${e.hp<=0?' 처치':''} · 공격${e.attack} ${patterns[e.pattern]} · 보호${e.protection.reduce((a,p)=>a+p.amount,0)} 지원${e.support.length} · 상태 ${tokens(e)}`));
    const gas=b.gas.flatMap((row,y)=>row.flatMap((n,x)=>n?[`${['동료',...rows][y]}${x+1}=${n}`]:[]));
    lines.push('가스: '+(gas.join(' ')||'없음')+` · 비활동 ${b.inactiveCount}/${b.inactiveThreshold}`+(b.exit?` · 철수 ${b.exit}번`:''));
    if(v.quickActions.length) lines.push('가능 속공: '+v.quickActions.map(a=>`${a.id} ${a.part} → ${a.targetId} (독1/회복${a.heal})`).join(' / '));
  }
  if(v.phase==='map') lines.push(...v.reachable.map((n,i)=>`${i+1}: ${n.id} ${labels[n.kind]} ${n.enemies?.map(e=>`${e.type} 체력${e.maxHp} 공격${e.attack}`).join(' / ')??''}`));
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
      const line=await rl.question('18> ');
      if(!line.trim()) continue;
      if(['quit','q','exit-game'].includes(line.trim())) break;
      try {
        const tokens=line.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g)?.map(t=>t[0]==='"'?JSON.parse(t):t[0]==="'"?t.slice(1,-1):t)??[];
        const action={...parse(tokens),save:options.save};
        if(action.command==='play') throw Error('진행 중입니다. 명령을 입력하세요.');
        if(Object.hasOwn(COMMAND_ARGS,action.command)&&!action.reason) action.reason=(await rl.question('선택 이유: ')).trim();
        process.stdout.write(human(run(action))+'\n');
      } catch(e) { process.stdout.write('오류: '+e.message+'\n'); }
    }
  } finally { rl.close(); }
}
try {
  const options=parse(process.argv.slice(2));
  if(options.command==='play') await interactive(options);
  else process.stdout.write(JSON.stringify(run(options),null,2)+'\n');
} catch(e) { process.stderr.write(JSON.stringify({error:e.message})+'\n'); process.exitCode=1; }
