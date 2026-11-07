import { createHash } from 'node:crypto';

export const RULE_VERSION = 'text-18-v1.5';

// Order is part of the reproducible content-selection contract (§11).
export const CARDS = Object.freeze({
  paladin: { name: '수달 성기사', hp: 6, price: 6, baseText: '인접 동료의 피해를 라운드당 최대 3까지 대신 받습니다. 다른 동료는 이 동료의 피해를 대신 받을 수 없습니다. 도착: 자신 방어 +1.', upgradeText: '체력 6→10. 인접 동료의 피해를 라운드당 최대 3까지 대신 받습니다. 다른 동료는 이 동료의 피해를 대신 받을 수 없습니다. 도착: 자신 방어 +1.' },
  holyPriest: { name: '수달 신성사제', hp: 3, price: 6, baseText: '인접 동료가 도착 효과를 발동하면, 자신을 제외한 인접 무작위 동료 하나에게 방어 1.', upgradeText: '인접 동료가 도착 효과를 발동하면, 자신을 제외한 인접 무작위 동료 하나에게 방어 2.' },
  saint: { name: '수달 성녀', hp: 4, price: 6, baseText: '도착: 인접 동료들 1회복.', upgradeText: '도착: 인접 동료들 2회복.' },
  squire: { name: '수달 시종', hp: 3, price: 6, baseText: '인접 동료가 도착 효과를 발동하면, 자기 위치·개체 기준으로 그 효과를 복사합니다. 복사는 도착 반응을 유발하지 않습니다.', upgradeText: '체력 3→5. 인접 동료가 도착 효과를 발동하면, 자기 위치·개체 기준으로 그 효과를 복사합니다. 복사는 도착 반응을 유발하지 않습니다.' },
  choir: { name: '수달 성가대원', hp: 3, price: 6, baseText: '도착: 1피해. 인접 동료가 도착 효과를 발동하면, 그 효과를 발동시킨 적에게 1피해.', upgradeText: '도착: 1피해. 인접 동료가 도착 효과를 발동하면, 그 효과를 발동시킨 적에게 2피해.' },
  crusader: { name: '검은수달 성전사', hp: 4, price: 6, baseText: '도착: 2피해. 자신 탈진 +1.', upgradeText: '도착: 4피해. 자신 탈진 +1.' },
  warPriest: { name: '검은수달 전투사제', hp: 4, price: 6, baseText: '인접 동료의 체력이 감소할 때마다 분노 +1. 도착: 1피해.', upgradeText: '인접 동료의 체력이 감소할 때마다 분노 +1. 도착: 2피해.' },
  cardinal: { name: '검은수달 추기경', hp: 4, price: 6, baseText: '자신의 왼쪽 두 칸과 오른쪽 두 칸 동료끼리는 서로 인접합니다. 도착: 1피해.', upgradeText: '자신의 왼쪽 두 칸과 오른쪽 두 칸 동료끼리는 서로 인접합니다. 도착: 2피해.' },
  sprayer: { name: '스컹크 살포요원', hp: 3, price: 6, baseText: '통과: 자신의 앞쪽 적 세 타일에 가스 1씩 배치.', upgradeText: '통과: 자신의 앞쪽 적 세 타일에 가스 2씩 배치.' },
  gourmet: { name: '스컹크 미식가', hp: 3, price: 6, baseText: '통과: 맨해튼 거리로 가장 가까운 독 보유 개체의 독을 전부 먹고, 그만큼 자기 앞 적들에게 피해. 같은 거리면 동료, 왼쪽, 아래 순.', upgradeText: '통과: 맨해튼 거리로 가장 가까운 독 보유 개체의 독을 전부 먹고, 그만큼 자기 앞 적들에게 피해. 같은 거리면 동료, 왼쪽, 아래 순. 이 효과를 한 번 더 반복합니다.' },
  toxicHealer: { name: '스컹크 독 치료사', hp: 4, price: 6, baseText: '속공: 인접 동료 하나를 선택하여 독 +1, 2회복.', upgradeText: '속공: 인접 동료 하나를 선택하여 독 +1, 3회복.' },
});

export function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

export function draw(s, purpose, n, node = s.node) {
  requireRule(Number.isSafeInteger(n) && n > 0 && n <= 2 ** 32, '추첨 후보 수가 올바르지 않습니다.');
  requireRule(node && Number.isInteger(node.depth) && node.col, '추첨할 지도 지점이 필요합니다.');
  const key = [s.seed, node.act ?? s.act, node.depth, node.col, purpose].join('|');
  const cutoff = 2 ** 32 - (2 ** 32 % n);
  let value;
  do {
    const counter = (s.rng[key] ?? 0) + 1;
    s.rng[key] = counter;
    value = createHash('sha256').update(`${key}|${counter}`, 'utf8').digest().readUInt32BE(0);
  } while (value >= cutoff);
  return value % n;
}

export function log(s, type, details = {}) {
  const entry = { index: s.journal.length + 1, act: s.act, node: s.node?.id ?? null, round: s.battle?.round ?? null,
    ...details, ...(details.type === undefined ? {} : { subjectType: details.type }), type };
  s.journal.push(entry);
  return entry;
}

export function credit(s, amount, source) {
  requireRule(Number.isInteger(amount) && amount >= 0, '재화 지급량이 올바르지 않습니다.');
  s.coins += amount;
  log(s, 'income', { amount, source, coins: s.coins });
}

export function parts(e) {
  if (!e) return [];
  const result = [{ key: 'A', type: e.type, upgraded: Boolean(e.upgraded) }];
  if (e.fusion) result.push({ key: 'B', type: e.fusion.bType, upgraded: Boolean(e.fusion.bUpgraded) });
  return result;
}

export function maxHp(e) {
  if (!e) return 0;
  if (!CARDS[e.type]) return e.maxHp;
  if (e.upgraded && e.type === 'paladin') return 10;
  if (e.upgraded && e.type === 'squire') return 5;
  return CARDS[e.type].hp;
}

const emptyTokens = () => ({ quick: 0, poison: 0, exhaustion: 0, rage: 0 });

export function newEntity(s, type, source = 'reward') {
  requireRule(Object.hasOwn(CARDS, type), `알 수 없는 동료: ${type}`);
  const e = { id: `c${++s.sequence}`, type, upgraded: false, fusion: null, hp: CARDS[type].hp, tokens: emptyTokens(), defense: 0, guardUsed: { A: 0, B: 0 } };
  log(s, 'companion-created', { id: e.id, companionType: type, source, hp: e.hp });
  return e;
}

export function entityById(s, id) {
  return s.floors.find(e => e?.id === id) ?? s.battle?.enemies?.find(e => e.id === id) ?? null;
}

export function floorOf(s, id) {
  return s.floors.findIndex(e => e?.id === (typeof id === 'object' ? id?.id : id)) + 1;
}

export function entityName(e) {
  if (!e) return '빈 지점';
  const name = CARDS[e.type]?.name ?? e.name ?? e.type;
  return e.fusion ? `${name} + ${CARDS[e.fusion.bType].name}` : name;
}

export function resetStatuses(s) {
  for (const e of s.floors.filter(Boolean)) {
    e.tokens = emptyTokens();
    e.defense = 0;
    e.guardUsed = { A: 0, B: 0 };
  }
  if (s.battle) {
    for (const e of s.battle.enemies ?? []) {
      e.tokens = emptyTokens();
      e.protection = [];
      e.support = [];
    }
    s.battle.gas = Array.from({ length: 4 }, () => Array(10).fill(0));
    s.battle.exit = null;
    s.battle.activity = false;
    s.battle.inactiveCount = 0;
    s.battle.inactiveThreshold = 3;
  }
}
