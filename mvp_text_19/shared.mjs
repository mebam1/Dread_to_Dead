import { createHash } from 'node:crypto';

export const RULE_VERSION = 'text-19-v1.3';
export const PLAYER_DICE_COUNT = 3;

// Provisional rulings for §13. Available through the CLI "rules" command.
export const TRIAL_RULES = [
  '적 시작 칸은 편성 순서 2·5·8번. 동시 만료와 종료 독도 편성 순서로 처리한다.',
  '강제 밀림은 추가 가스·철수·도착 효과를 발동하지 않는다. 목적지 점유자는 한 칸 밀리며 통과 기술은 쓰지 않는다.',
  '강화 살포대원의 10개는 대상 타일 각각에 적용한다.',
  'D형은 연타와 타격 후 3칸 이동을 순서대로 사용한다. 대기 중에는 이동하지 않는다.',
  '경로공격의 남은 경로는 10번까지 남은 칸 수로 본다. 세 칸 미만이면 타격 없이 3칸 순환 이동하고 다음 라운드에 재시도한다.',
  '같은 동료를 다시 선택할 수 있다. 단순 이동·방어·회복·완전 흡수만으로는 활동 처리하지 않는다.',
];

// Order is part of the reproducible content-selection contract (§11).
export const CARDS = Object.freeze({
  paladin: { name: '수달 성기사', hp: 60, price: 6, baseText: '인접 동료의 피해를 라운드당 합계 30까지 대신 받는다. 다른 동료는 성기사의 피해를 대신 받을 수 없다. 매 라운드 시작 시 자신 방어 +10.', upgradeText: '대신 받기 한도 50, 라운드 시작 방어 +15' },
  holyPriest: { name: '수달 신성사제', hp: 30, price: 6, baseText: '인접 동료의 도착 효과가 발동하면 자신을 제외한 인접 동료 중 무작위 한 명에게 방어 10을 준다.', upgradeText: '방어 20' },
  saint: { name: '수달 성녀', hp: 40, price: 6, baseText: '도착 시 인접 동료들을 각각 15 회복한다.', upgradeText: '각각 25 회복' },
  squire: { name: '수달 시종', hp: 30, price: 6, baseText: '인접 동료가 발동한 도착 효과를 자기 위치에서 복사한다. 예를 들어 도착 피해 10을 복사하면 시종 앞쪽에 피해 10을 준다. 복사는 도착 반응을 다시 일으키지 않는다.', upgradeText: '최대 체력 30 → 50' },
  choir: { name: '수달 성가대원', hp: 30, price: 6, baseText: '도착 시 피해 10. 인접 동료의 도착 효과가 발동하면 도착 효과를 발동한 동료 앞칸에 피해 10.', upgradeText: '반응 피해 20. 자신의 도착 피해 10' },
  crusader: { name: '검은수달 성전사', hp: 40, price: 6, baseText: '도착 시 피해 20, 자신 탈진 +8.', upgradeText: '피해 40, 자신 탈진 +8' },
  warPriest: { name: '검은수달 전투사제', hp: 40, price: 6, baseText: '인접 동료의 실제 체력이 감소할 때마다 자신 분노 +10. 도착 시 피해 10.', upgradeText: '도착 피해 20, 분노 획득 +10' },
  cardinal: { name: '검은수달 추기경', hp: 40, price: 6, baseText: '자신에게서 왼쪽으로 두 칸 떨어진 동료와 오른쪽으로 두 칸 떨어진 동료를 서로 인접하게 한다. 도착 시 피해 10.', upgradeText: '도착 피해 20' },
  sprayer: { name: '스컹크 살포대원', hp: 30, price: 6, baseText: '통과당하면 밀리기 전 자신의 앞칸과 그 왼쪽 적 타일에 각각 가스 6개를 설치한다.', upgradeText: '대상 칸마다 가스 10개 (시험값)' },
  gourmet: { name: '스컹크 미식가', hp: 30, price: 6, baseText: '통과당하면 가장 가까운 독 보유자의 독을 전부 먹는다. 같은 거리에서는 아군을 우선한다. 자기 지점의 적 각각에게 먹은 독 × 10 피해를 준다.', upgradeText: '한 번 더 반복. 첫 섭취 후 두 번째 대상을 다시 찾는다.' },
  toxicHealer: { name: '스컹크 독 치료사', hp: 40, price: 6, baseText: '속공으로 인접 동료 한 명에게 독 4를 부여한 뒤 체력 20을 회복한다.', upgradeText: '독 5, 체력 25 회복' },
});

export function attackPower(pattern, strong) {
  const values = { strikeMove: [10,14], double: [5,7], alternate: [5,7], neighbor: [5,7], mirror: [6,8], path: [3,5] };
  return values[pattern][Number(strong)];
}

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

export function rollPlayerDice(s, revealed = []) {
  const dice = [...revealed];
  while (dice.length < PLAYER_DICE_COUNT) dice.push(draw(s, '유저굴림', 6) + 1);
  return dice;
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
  if (e.upgraded && e.type === 'squire') return 50;
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

export function restoreFormation(s) {
  const survivors = new Map(s.floors.filter(e => e?.hp > 0).map(e => [e.id,e]));
  s.floors = Array(10).fill(null);
  for (const {id,x} of s.battle.startAllies) {
    if (survivors.has(id)) s.floors[x-1] = survivors.get(id);
  }
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
    s.battle.gas = Array.from({ length: 2 }, () => Array(10).fill(0));
    s.battle.exit = null;
    s.battle.activity = false;
    s.battle.inactiveCount = 0;
    s.battle.inactiveThreshold = 3;
  }
}
