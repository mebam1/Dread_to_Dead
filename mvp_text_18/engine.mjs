import { CARDS, RULE_VERSION, entityName, maxHp, parts, log, requireRule } from './shared.mjs';
import { campaignAction, createGame, finishBattle, previewFusion, publicMap as campaignMap } from './campaign.mjs';
import { availableQuickActions, combatAction, previewBattle } from './combat.mjs';

export { createGame, previewBattle, previewFusion, RULE_VERSION };
export const PERMUTATIONS = [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]];
export const COMMAND_ARGS = Object.freeze({
  visit:[1,1], swap:[2,2], start:[0,0], assign:[3,3], choose:[1,1], active:[3,3],
  exit:[1,1], move:[0,0], reward:[1,1], place:[1,1], discard:[0,0], buy:[1,1],
  leave:[0,0], upgrade:[1,1], fuse:[2,2], skip:[0,0], 'give-up':[0,0],
});
const combatCommands = new Set(['assign','choose','active','exit','move']);
export function catalog() { return structuredClone({ companions:CARDS, dice:{ count:3, faces:[1,2,3,4,5,6] } }); }
export function publicMap(s) { return structuredClone(campaignMap(s)); }
function describe(e) {
  return e ? { ...e, name:entityName(e), maxHp:maxHp(e), effects:parts(e).map(p => ({...p, text:p.upgraded ? CARDS[p.type].upgradeText : CARDS[p.type].baseText})) } : null;
}
export function publicView(s) {
  return structuredClone({
    version:s.version, seed:s.seed, act:s.act, phase:s.phase, coins:s.coins,
    visited:s.visited, map:publicMap(s), node:s.node,
    floors:s.floors.map(describe), battle:s.battle,
    quickActions:s.phase === 'prepare' ? availableQuickActions(s) : [],
    shop:s.phase === 'shop' ? s.shop.map((item,i) => ({...item,slot:i+1,...CARDS[item.type]})) : [],
    rewards:s.phase === 'reward' ? s.rewards.map((type,i) => ({type,slot:i+1,...CARDS[type]})) : [],
    pending:s.pending ? {...s.pending,entity:describe(s.pending.entity)} : null,
    result:s.result ?? null,
  });
}
export function publicJournal(s, count=20) {
  requireRule(Number.isSafeInteger(Number(count)) && Number(count)>=0,'기록 개수는 0 이상의 정수입니다.');
  return Number(count) ? structuredClone(s.journal.slice(-Number(count))) : [];
}
export function report(s) {
  const rounds=s.stats.battles.map(b=>b.rounds ?? b.round ?? 0);
  return structuredClone({seed:s.seed,version:s.version,phase:s.phase,act:s.act,coins:s.coins,
    companions:s.floors.filter(Boolean).length,visited:s.visited.length,
    rounds:{total:rounds.reduce((a,b)=>a+b,0),max:Math.max(0,...rounds),over15:rounds.filter(n=>n>15).length},...s.stats});
}
/** Validate against a copy; illegal actions cannot spend tokens, coins, or RNG. */
export function execute(s, command, args=[], reason='') {
  requireRule(s.version === RULE_VERSION,'설정 18 v1.5 저장이 필요합니다.');
  requireRule(typeof command === 'string' && Array.isArray(args) && typeof reason === 'string','잘못된 명령 형식입니다.');
  const cmd=command === 'giveup' ? 'give-up' : command;
  requireRule(Object.hasOwn(COMMAND_ARGS,cmd),'알 수 없는 명령: '+cmd);
  const [min,max]=COMMAND_ARGS[cmd];
  requireRule(args.length>=min && args.length<=max,'명령의 인자 개수를 확인하세요.');
  requireRule(args.every(x=>Number.isSafeInteger(x) || (typeof x==='string' && x.trim())),'인자는 숫자 또는 이름이어야 합니다.');
  requireRule(reason.trim(),'선택 이유를 입력하세요.');
  const next=structuredClone({...s,journal:[]});
  log(next,'decision',{command:cmd,args,reason:reason.trim(),phase:s.phase});
  if (combatCommands.has(cmd)) {
    const result=combatAction(next,cmd,args);
    if (result?.outcome) finishBattle(next,result.outcome);
  } else campaignAction(next,cmd,args);
  next.journal.forEach((entry,i)=>{entry.index=s.journal.length+i+1;});
  next.journal=s.journal.concat(next.journal);
  const view=publicView(next);
  Object.assign(s,next);
  return view;
}
