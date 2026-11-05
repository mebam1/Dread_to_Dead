import {
  CREATURES, DICE, RULE_VERSION, creatureStats, entityName, log, partnerEffectText, requireRule,
} from './shared.mjs';
import {
  campaignAction, createGame, finishBattle, previewFusion, publicMap as campaignMap,
} from './campaign.mjs';
import {availableQuickActions, combatAction, previewBattle, quickAbilities} from './combat.mjs';

export {createGame, previewBattle, previewFusion, RULE_VERSION};
export {growthReport} from './report.mjs';
export {loadRuleVersion} from './shared.mjs';

export const COMMAND_ARGS = Object.freeze({
  visit: [1, 1], swap: [2, 2], start: [0, 0], choose: [1, 1], active: [2, 3],
  exit: [1, 1], move: [0, 0], reward: [1, 1], place: [1, 1], discard: [0, 0],
  buy: [1, 1], leave: [0, 0], cash: [0, 0], deal: [0, 0], contract: [1, 1],
  equip: [1, 1], heal: [1, 2], upgrade: [1, 1], fuse: [2, 3], skip: [0, 0],
  'give-up': [0, 0],
});

function describeCard(type) {
  return {...CREATURES[type], quickAbilities: quickAbilities({type})};
}

export function catalog() {
  const creatures = Object.fromEntries(Object.keys(CREATURES).map(type => [type, describeCard(type)]));
  return {creatures, dice: DICE};
}

export function publicMap(s) {
  return structuredClone(campaignMap(s));
}

function describeEntity(entity) {
  if (!entity) return null;
  const definition = CREATURES[entity.type];
  return {
    ...entity, name: entityName(entity), ...creatureStats(entity),
    quickAbilities: quickAbilities(entity),
    baseText: definition.baseText, upgradeText: definition.upgradeText,
    donorText: entity.donor ? partnerEffectText(entity.donor, entity.fusion?.bUpgraded) : null,
  };
}

export function publicView(s) {
  const map = publicMap(s);
  const offers = s.phase === 'shop' ? s.shop.map(item => item.type) : s.rewards;
  const offerCards = offers.map((type, i) => ({slot: i + 1, type, ...describeCard(type)}));
  return structuredClone({
    version: s.version, seed: s.seed, act: s.act, phase: s.phase,
    souls: s.souls, actIncome: s.actIncome, dice: s.dice, visited: s.visited,
    map, node: map.find(node => node.id === s.node?.id) ?? null,
    floors: s.floors.map(describeEntity),
    battle: s.battle, quickActions: s.phase === 'prepare' ? availableQuickActions(s) : [],
    shop: s.shop, rewards: s.rewards, offerCards, event: s.event, offerDie: s.offerDie,
    pending: s.pending ? {...s.pending, entity: describeEntity(s.pending.entity)} : null,
    result: s.result ?? null,
  });
}

export function publicJournal(s, count = 20) {
  const limit = Number(count);
  requireRule(Number.isSafeInteger(limit) && limit >= 0, '기록 개수에는 0 이상의 정수를 입력하세요.');
  return limit ? structuredClone(s.journal.slice(-limit)) : [];
}

const combatCommands = new Set(['choose', 'active', 'exit', 'move']);

/** Commit one legal decision. Past journal entries are append-only, so only clone the current board. */
export function execute(s, cmd, args = [], reason = '') {
  requireRule(s.version === RULE_VERSION, '17판 게임 저장이 필요합니다.');
  requireRule(typeof cmd === 'string' && Array.isArray(args) && typeof reason === 'string', '잘못된 명령 형식입니다.');
  const action = cmd === 'give-up' ? 'giveup' : cmd;
  const commandName = action === 'giveup' ? 'give-up' : action;
  requireRule(Object.hasOwn(COMMAND_ARGS, commandName), '알 수 없는 명령입니다: ' + cmd);
  const [min, max] = COMMAND_ARGS[commandName];
  requireRule(args.length >= min && args.length <= max, '명령의 인자 개수를 확인하세요.');
  requireRule(args.every(arg => Number.isSafeInteger(arg) || (typeof arg === 'string' && arg.trim())),
    '명령 인자에는 숫자 또는 이름을 입력하세요.');
  requireRule(reason.trim(), '결정에는 선택 이유가 필요합니다.');
  const next = structuredClone({...s, journal: []});
  log(next, 'decision', {command: action, args, reason, phase: s.phase});
  if (combatCommands.has(action)) {
    const resolution = combatAction(next, action, args);
    if (resolution?.outcome) finishBattle(next, resolution.outcome);
  } else {
    campaignAction(next, action, args);
  }
  const view = publicView(next);
  next.journal = s.journal.concat(next.journal);
  Object.assign(s, next);
  return view;
}
