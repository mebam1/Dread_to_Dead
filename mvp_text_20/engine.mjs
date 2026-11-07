import { COMMAND_ARGS as previousCommands, publicView as previousView, upgradeSave as upgradePrevious } from '../mvp_text_19/engine.mjs';
import { campaignAction, createGame as startCampaign, finishBattle } from '../mvp_text_19/campaign.mjs';
import { log, requireRule } from '../mvp_text_19/shared.mjs';
import { adjacent, combatAction, forecastEnemyIntents, startBattle } from './combat.mjs';

export { catalog, previewFusion, publicJournal, publicMap, report } from '../mvp_text_19/engine.mjs';
export { previewBattle } from './combat.mjs';
export const RULE_VERSION = 'text-20-v1.0';
export const COMMAND_ARGS = Object.freeze({ ...previousCommands, move: [3, 3] });
const combatCommands = new Set(['active', 'exit', 'move']);

export function createGame(seed = 31001) {
  const state = startCampaign(seed);
  state.version = RULE_VERSION;
  state.journal.find(event => event.type === 'campaign-start').version = RULE_VERSION;
  return state;
}

export function upgradeSave(state) {
  if (state?.version === RULE_VERSION) return state;
  const next = structuredClone(upgradePrevious(state));
  for (const event of next.journal) {
    if (event.type === 'drop') {
      event.slot ??= 1;
      event.direction = 'right';
    }
    if (event.type === 'decision' && event.command === 'move') {
      if (event.args.length === 1) event.args.push(1); // Single-die 19 v1.2 history.
      event.args.push('right');
    }
  }
  const from = next.version;
  next.version = RULE_VERSION;
  log(next, 'rules-upgraded', { from, to: RULE_VERSION, dice: next.battle?.dice ?? [] });
  return next;
}

export function publicView(s) {
  const view = previousView(s);
  if (!s.battle) return view;
  const intents = forecastEnemyIntents(s);
  for (const enemy of view.battle.enemies) enemy.intent = intents.get(enemy.id) ?? null;
  for (const ally of view.floors.filter(Boolean)) {
    ally.neighbors = s.floors.filter(other => other?.hp > 0 && adjacent(s, ally, other)).map(other => other.id);
  }
  return view;
}

export function execute(s, command, args = [], reason = '') {
  requireRule(s.version === RULE_VERSION, '현재 규칙 버전의 저장이 필요합니다.');
  requireRule(typeof command === 'string' && Array.isArray(args) && typeof reason === 'string', '잘못된 명령 형식입니다.');
  const cmd = command === 'giveup' ? 'give-up' : command;
  requireRule(Object.hasOwn(COMMAND_ARGS, cmd), '알 수 없는 명령: ' + cmd);
  const [min, max] = COMMAND_ARGS[cmd];
  requireRule(args.length >= min && args.length <= max, '명령의 인자 개수를 확인하세요.');
  requireRule(args.every(x => Number.isSafeInteger(x) || (typeof x === 'string' && x.trim())), '인자는 숫자 또는 이름이어야 합니다.');
  requireRule(reason.trim(), '선택 이유를 입력하세요.');

  // Commit state, RNG and journal only after the entire action succeeds.
  const next = structuredClone({ ...s, journal: [] });
  log(next, 'decision', { command: cmd, args: [...args], reason: reason.trim(), phase: s.phase });
  if (cmd === 'start') {
    requireRule(next.phase === 'management', '전투 준비 지점에서 시작하세요.');
    startBattle(next);
  } else if (combatCommands.has(cmd)) {
    const result = combatAction(next, cmd, args);
    if (result?.outcome) finishBattle(next, result.outcome);
  } else {
    campaignAction(next, cmd, args);
  }
  next.journal.forEach((entry, i) => { entry.index = s.journal.length + i + 1; });
  next.journal = s.journal.concat(next.journal);
  const view = publicView(next);
  Object.assign(s, next);
  return view;
}
