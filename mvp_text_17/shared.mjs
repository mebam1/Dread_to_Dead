import {createHash} from 'node:crypto';
export {DICE} from '../mvp_user_4/catalog.mjs';

export const RULE_VERSION = 'text-17-v1.1';
export const SUFFIXES = Object.freeze(['속삭이는', '빛바랜', '떨리는', '그을린', '뒤틀린', '잠들지 않는']);

function card(name, price, limit, maxTokens, baseText, upgradeText) {
  return Object.freeze({name, price, limit, maxTokens, baseText, upgradeText});
}

// Insertion order is the printed roster order used by the seeded draws.
export const CREATURES = Object.freeze({
  gaze: card('문틈의 시선', 3, 12, 2,
    '통과 시 불안 +4', '통과 시 불안 +5'),
  steps: card('따라오는 발소리', 3, 12, 1,
    '통과 후 같은 이동에서 다른 괴이가 불안을 생성할 때마다 자신의 도착 공급량 +1. 도착 시 불안 1과 누적분을 얻음. 누적분은 영업 종료까지 유지.',
    '현재·최대 파훼 토큰 +1'),
  owner: card('시선의 주인', 4, 12, 2,
    '도착 시 보유 불안 전부 지불, 지불량만큼 공포', '공략 한계 13'),
  mouse: card('별것 아닌 생쥐', 4, 12, 2,
    '속공으로 불안 4 지불, 인접 괴이 하나의 공략도 −6 및 봉인 +2', '공략도 감소량 10'),
  portrait: card('노려보는 초상화', 5, 8, 2,
    '속공으로 불안 7 지불, 확정 눈 +2', '기본과 동일'),
  ratKing: card('쥐 왕', 3, 12, 2,
    '도착 시 불안 8 지불, 이번 턴 실제로 얻은 총 불안만큼 공포', '비용 7'),
  safe: card('유혹하는 금고', 3, 20, 2,
    '피격 시 탐욕 +1. 속공으로 자신 잠복 +99. 도착 시 잠복 −99. 잠복 해제 시 공포 2.', '해제 공포 3'),
  nepenthes: card('모욕하는 네펜데스', 5, 14, 2,
    '피격 시 탐욕 +1. 속공으로 탐욕 2 지불, 자신 방어 +4. 이번 턴 지정한 괴이의 피해를 대신 받음.', '자신 방어 +8'),
  barnacle: card('수정 따개비', 4, 14, 2,
    '피격 시 탐욕 +1. 속공으로 탐욕 1 지불, 이동 후 실제 통과한 각 점유층에 방어 +2.', '공략 한계 18'),
  collector: card('수집가', 3, 14, 2,
    '속공으로 괴이 하나의 방어 +10, 봉인 +6. 봉인된 괴이에게 사용할 수 없습니다.', '기본과 동일'),
  runes: card('룬 문자 벽', 3, 12, 2,
    '통과 시 최종 눈이 3 이하면 예언 +1', '조건 충족 시 예언 +2'),
  roulette: card('이름이 새겨진 룰렛', 3, 12, 2,
    '통과 시 최종 눈이 짝수면 예언 +1', '조건 충족 시 예언 +2'),
  visit: card('예언된 방문', 4, 10, 2,
    '통과 시 예언 2 지불, 잠복 +2 및 무작위 표적층 지정. 잠복 해제 시 그 층에 손님이 있으면 공포 8.', '해제 명중 공포 10'),
  prophet: card('횡설수설하는 예언가', 4, 12, 2,
    '속공으로 예언 2 지불, 장착 주사위 셋을 다시 굴린 뒤 하나를 선택', '비용 1'),
  samara: card('사마라의 약속', 4, 12, 2,
    '속공으로 예언 2 지불, 확정 눈 −1. 눈 1에서는 사용 불가.', '공략 한계 14'),
});

export function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

/** Uniform index. Counters are local to each node and purpose, including rejected hashes. */
export function draw(s, purpose, n, node = s.node) {
  requireRule(node && Number.isSafeInteger(n) && n > 0 && n <= 2 ** 32, '유효하지 않은 난수 범위입니다.');
  const key = [s.seed, node.act, node.depth, node.col, purpose].join('|');
  const cutoff = 2 ** 32 - (2 ** 32 % n);
  let value;
  do {
    const index = (s.rng[key] ?? 0) + 1;
    s.rng[key] = index;
    value = createHash('sha256').update(key + '|' + index, 'utf8').digest().readUInt32BE(0);
  } while (value >= cutoff);
  return value % n;
}

const upgradedLimits = {owner: 13, barnacle: 18, samara: 14};

export function partnerEffectText(type, upgraded) {
  const card = CREATURES[type];
  const upgradedAbility = upgraded && !(type in upgradedLimits) && type !== 'steps' && card.upgradeText !== '기본과 동일';
  return card.baseText + (upgradedAbility ? ' · 적용 강화: ' + card.upgradeText : '');
}

export function loadRuleVersion(state) {
  if (state?.version === 'text-17-v1.0') {
    // Old fusions already store both original types and their upgrade flags.
    if (state.battle?.barnacles) {
      state.battle.barnacles = state.battle.barnacles.map(id => ({id, part: 'base'}));
    }
    state.version = RULE_VERSION;
  }
  return state?.version === RULE_VERSION;
}

export function creatureStats(entity) {
  const card = CREATURES[entity.type];
  const limit = entity.upgraded ? upgradedLimits[entity.type] ?? card.limit : card.limit;
  const maxTokens = entity.upgraded && entity.type === 'steps' ? 2 : card.maxTokens;
  return {limit, maxTokens};
}

export function entityName(entity) {
  return entity.fusion?.name ?? (CREATURES[entity.type].name + (entity.upgraded ? '+' : ''));
}

export function newEntity(s, type, source) {
  requireRule(Object.hasOwn(CREATURES, type), '존재하지 않는 괴이 종류입니다.');
  return {
    id: 'e' + (++s.sequence), type, source, upgraded: false, donor: null, fusion: null,
    damage: 0, tokens: CREATURES[type].maxTokens, seal: 0, ambush: 0, target: null,
    defense: 0, stepBase: 0, stepDonor: 0,
  };
}

export function entityById(s, id) {
  const entity = s.floors.find(e => e && e.id === id);
  requireRule(entity, '호텔에서 괴이 ' + id + '를 찾을 수 없습니다.');
  return entity;
}

export function floorOf(s, id) {
  return s.floors.findIndex(e => e && e.id === id) + 1;
}

export function log(s, type, details = {}) {
  s.journal.push({act: s.act, nodeId: s.node?.id ?? null, ...structuredClone(details), type});
}

export function credit(s, amount, source, boss = false) {
  const paid = boss ? amount : Math.min(amount, 9 - s.actIncome);
  if (!boss) s.actIncome += paid;
  s.souls += paid;
  log(s, 'income', {source, requested: amount, paid, boss, souls: s.souls, actIncome: s.actIncome});
  return paid;
}
