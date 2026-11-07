import { COMMAND_ARGS as campaignCommands, publicView as campaignView, previewFusion as campaignFusion } from '../mvp_text_19/engine.mjs';
import { campaignAction, createGame as newCampaign, finishBattle } from '../mvp_text_19/campaign.mjs';
import { CARDS, log, requireRule } from '../mvp_text_19/shared.mjs';
import { adjacent, availableQuickActions, combatAction, forecastEnemyIntents, startBattle } from './combat.mjs';
import { ENEMY_PATTERNS, configureEncounters } from './enemies.mjs';

export { publicJournal, publicMap } from '../mvp_text_19/engine.mjs';
export { previewBattle } from './combat.mjs';
export const RULE_VERSION = 'text-21-v1.1';
export const COMMAND_ARGS = Object.freeze({...campaignCommands, move:[2,2]});
const combatCommands = new Set(['active','exit','move']);
const companions = {
  ...CARDS,
  paladin:{...CARDS.paladin,
    baseText:'인접 동료의 피해를 합계 30까지 대신 받는다. 전투 시작과 이후 카드 이동 3회마다 한도를 갱신하고 자신 방어를 10 얻는다. 성기사가 받는 피해는 다른 동료가 대신 받을 수 없다.',
    upgradeText:'대신 받기 한도 50, 자신 방어 15. 전투 시작과 이후 카드 이동 3회마다 갱신한다.'},
  toxicHealer:{...CARDS.toxicHealer,
    baseText:'속공 1로 인접 동료 한 명에게 독 4를 부여한 뒤 체력 20을 회복한다. 전투 시작과 이후 카드 이동 3회마다 속공을 1로 채운다.',
    upgradeText:'독 5, 체력 25 회복. 속공 충전 주기는 카드 이동 3회.'},
};
function effectText(part) {
  return companions[part.type][part.upgraded ? 'upgradeText' : 'baseText'];
}

export function catalog() {
  return structuredClone({companions, enemyPatterns:ENEMY_PATTERNS});
}

export function previewFusion(s, a, b) {
  const preview = campaignFusion(s,a,b);
  for (const part of preview.parts) part.effect = effectText(part);
  return preview;
}

export function report(s) {
  const counts = s.stats.battles.map(b => b.actions);
  if (s.battle) counts.push(s.battle.actionCount);
  return structuredClone({seed:s.seed, version:s.version, phase:s.phase, act:s.act, coins:s.coins,
    companions:s.floors.filter(Boolean).length, visited:s.visited.length,
    actions:{total:counts.reduce((sum,n)=>sum+n,0), max:Math.max(0,...counts)}, ...s.stats});
}

export function createGame(seed = 31001) {
  const state = newCampaign(seed);
  state.version = RULE_VERSION;
  configureEncounters(state.map);
  state.journal.find(e => e.type === 'campaign-start').version = RULE_VERSION;
  for (const event of state.journal) delete event.round;
  return state;
}

export function upgradeSave(state) {
  requireRule(state?.version === RULE_VERSION, '설정 21의 저장 파일을 선택하세요.');
  return state;
}

export function publicView(s) {
  // Use the shared campaign/roster presentation independently of older combat rules.
  const view = campaignView({...s,battle:null});
  for (const ally of [...view.floors,view.pending?.entity].filter(Boolean)) {
    for (const part of ally.effects) part.text = effectText(part);
  }
  for (const item of [...view.rewards,...view.shop]) Object.assign(item,companions[item.type]);
  if (!s.battle) return view;
  const intents = forecastEnemyIntents(s);
  view.battle = structuredClone(s.battle);
  for (const enemy of view.battle.enemies) enemy.intent = intents.get(enemy.id) ?? null;
  for (const ally of view.floors.filter(Boolean)) {
    ally.neighbors = s.floors.filter(other => other?.hp > 0 && adjacent(s,ally,other)).map(other => other.id);
  }
  view.quickActions = availableQuickActions(s);
  return view;
}

export function execute(s, command, args = [], reason = '') {
  requireRule(s.version === RULE_VERSION,'설정 21의 저장 파일을 선택하세요.');
  requireRule(typeof command === 'string' && Array.isArray(args) && typeof reason === 'string','잘못된 명령 형식입니다.');
  const cmd = command === 'giveup' ? 'give-up' : command;
  requireRule(Object.hasOwn(COMMAND_ARGS,cmd),'알 수 없는 명령: '+cmd);
  const [min,max] = COMMAND_ARGS[cmd];
  requireRule(args.length >= min && args.length <= max,'명령의 인자 개수를 확인하세요.');
  requireRule(args.every(x=>Number.isSafeInteger(x) || (typeof x === 'string' && x.trim())), '인자는 숫자 또는 이름이어야 합니다.');
  const next = structuredClone({...s,journal:[]});
  log(next,'decision',{command:cmd,args:[...args],reason:reason.trim(),phase:s.phase});
  if (cmd === 'start') {
    requireRule(next.phase === 'management','전투 준비 지점에서 시작하세요.');
    startBattle(next);
  } else if (combatCommands.has(cmd)) {
    const result = combatAction(next,cmd,args);
    if (result?.outcome) finishBattle(next,result.outcome);
  } else {
    campaignAction(next,cmd,args);
  }
  if (next.act !== s.act) configureEncounters(next.map);
  // The shared campaign writer also serves earlier, round-based prototypes.
  const completedBattle = next.stats.battles.length > s.stats.battles.length ? next.stats.battles.at(-1) : null;
  if (completedBattle) {
    delete completedBattle.rounds;
    for (const ally of next.floors.filter(Boolean)) delete ally.nextRefreshAction;
  }
  next.journal.forEach((event,i)=>{
    delete event.round;
    if (event.type === 'battle-finished') delete event.rounds;
    event.index=s.journal.length+i+1;
  });
  next.journal = s.journal.concat(next.journal);
  const view = publicView(next);
  Object.assign(s,next);
  return view;
}
