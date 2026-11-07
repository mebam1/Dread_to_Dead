import { CARDS, RULE_VERSION, requireRule, draw, log, parts, maxHp, newEntity, entityById, floorOf, resetStatuses } from './shared.mjs';
import { startBattle } from './combat.mjs';

const COLS = ['좌', '중', '우'];
const TYPES = Object.keys(CARDS);
const DEPTHS = ['normal', 'normal', 'recovery', 'normal', 'shop', 'normal', 'service', 'normal', 'recovery', 'service', 'normal', 'recovery', 'normal', 'service', 'elite', 'recovery', 'shop', 'boss'];
const NORMAL = {
  A: { role: 'attack', pattern: 'double', hp: [2, 6, 9] },
  B: { role: 'support', pattern: 'path', hp: [1, 4, 6] },
  C: { role: 'guard', pattern: 'neighbor', hp: [3, 8, 12] },
  D: { role: 'attack', pattern: 'double', hp: [2, 6, 9] },
  E: { role: 'support', pattern: 'path', hp: [1, 4, 6] },
  F: { role: 'attack', pattern: 'mirror', hp: [1, 4, 6] },
};

function enemiesFor(s, node) {
  const { act, depth, kind } = node;
  if (kind === 'normal') {
    const pools = act === 1 ? [['A', 'A', 'B'], ['A', 'B', 'C'], ['B', 'C', 'D']]
      : act === 2 && depth >= 13 ? [['C', 'D', 'E'], ['D', 'E', 'F'], ['C', 'E', 'F']]
        : [['C', 'D', 'E'], ['D', 'E', 'F'], ['E', 'F', 'F']];
    return pools[draw(s, '적편성', pools.length, node)].map((type, row) => {
      const info = NORMAL[type];
      const attack = act === 1 ? (depth >= 13 && type === 'D' ? 2 : 1)
        : act === 2 ? (depth >= 13 && type === 'F' ? 4 : 2)
          : depth >= 7 ? 4 : 3;
      return { type, role: info.role, pattern: info.pattern, attack, maxHp: info.hp[act - 1], rows: [row], protection: type === 'C' ? act : 0 };
    });
  }
  if (kind !== 'elite' && kind !== 'boss') return [];
  const table = kind === 'elite'
    ? [{ role: 'support', pattern: 'path', attack: 2, maxHp: 5, protection: 0 }, { role: 'support', pattern: 'path', attack: 4, maxHp: 12, protection: 0 }, { role: 'guard', pattern: 'mirror', attack: 4, maxHp: 14, protection: 4 }]
    : [{ role: 'guard', pattern: 'mirror', attack: 2, maxHp: 5, protection: 2 }, { role: 'support', pattern: 'alternate', attack: 4, maxHp: 16, protection: 0 }, { role: 'attack', pattern: 'alternate', attack: 4, maxHp: 24, protection: 0 }];
  return [{ type: `${kind}-${act}`, ...table[act - 1], rows: [0, 1, 2] }];
}

function generateMap(s) {
  const map = [];
  for (let depth = 1; depth <= 18; depth++) {
    const serviceCol = DEPTHS[depth - 1] === 'service'
      ? draw(s, '정비강화위치', 3, { act: s.act, depth, col: '공통' }) : -1;
    const cols = depth === 18 ? ['공통'] : COLS;
    for (const [index, col] of cols.entries()) {
      const kind = DEPTHS[depth - 1] === 'service' ? (index === serviceCol ? 'upgrade' : 'fusion') : DEPTHS[depth - 1];
      const node = { id: `${s.act}-${depth}-${col}`, act: s.act, depth, col, kind, enemies: [], next: [] };
      node.enemies = enemiesFor(s, node);
      map.push(node);
    }
  }
  for (const node of map) {
    node.next = map.filter(candidate => candidate.depth === node.depth + 1 &&
      (candidate.col === '공통' || Math.abs(COLS.indexOf(node.col) - COLS.indexOf(candidate.col)) <= 1)).map(candidate => candidate.id);
  }
  return map;
}

export function createGame(seed = 31001) {
  requireRule((typeof seed === 'number' && Number.isSafeInteger(seed)) || (typeof seed === 'string' && seed.length > 0), '판 번호는 정수 또는 빈 문자열이 아닌 값이어야 합니다.');
  const s = {
    version: RULE_VERSION, seed, act: 1, phase: 'map', coins: 0, sequence: 0, rng: {}, journal: [],
    floors: Array(10).fill(null), map: [], node: null, visited: [],
    stats: { battles: [], purchases: [], acquired: [], losses: [], fusions: [], upgrades: [] },
    battle: null, shop: [], rewards: [], pending: null,
  };
  for (const [type, position] of [['paladin', 2], ['saint', 1], ['choir', 3]]) {
    const e = newEntity(s, type, 'start');
    s.floors[position - 1] = e;
    s.stats.acquired.push({ id: e.id, type, source: 'start', act: 1, node: null, position });
  }
  s.map = generateMap(s);
  log(s, 'campaign-start', { version: RULE_VERSION, seed, positions: s.floors.map(e => e?.id ?? null) });
  return s;
}

function reachableNodes(s) {
  if (s.phase !== 'map') return [];
  const ids = s.node?.act === s.act ? s.node.next : s.map.filter(n => n.depth === 1).map(n => n.id);
  return s.map.filter(n => ids.includes(n.id) && !s.visited.includes(n.id));
}

export function publicMap(s) {
  const reachable = new Set(reachableNodes(s).map(n => n.id));
  // Explicit projection keeps private draw counters and shop/reward stock out.
  return s.map.map(n => ({ id: n.id, act: n.act, depth: n.depth, col: n.col, kind: n.kind,
    enemies: structuredClone(n.enemies), next: [...n.next], reachable: reachable.has(n.id), completed: s.visited.includes(n.id) }));
}

function completeVisit(s) {
  requireRule(s.node, '완료할 지점이 없습니다.');
  const completed = s.node;
  if (!s.visited.includes(completed.id)) s.visited.push(completed.id);
  log(s, 'node-completed', { kind: completed.kind, depth: completed.depth, col: completed.col });
  s.shop = [];
  s.rewards = [];
  s.pending = null;
  s.phase = 'map';
  if (completed.kind === 'boss') {
    if (s.act === 3) {
      s.phase = 'won';
      log(s, 'campaign-won', { coins: s.coins, visits: s.visited.length });
    } else {
      s.act++;
      s.node = null;
      s.map = generateMap(s);
      log(s, 'act-start', { coins: s.coins, hp: s.floors.filter(Boolean).map(e => ({ id: e.id, hp: e.hp, maxHp: maxHp(e) })) });
    }
  }
}

function visit(s, reference) {
  requireRule(s.phase === 'map', '지도에서 다음 지점을 선택할 수 있습니다.');
  const choices = reachableNodes(s);
  const node = typeof reference === 'string' && s.map.some(n => n.id === reference)
    ? choices.find(n => n.id === reference) : choices[Number(reference) - 1];
  requireRule(node, `이동 가능한 지점: ${choices.map((n, i) => `${i + 1}:${n.id}`).join(', ')}`);
  s.node = node;
  log(s, 'node-visited', { kind: node.kind, depth: node.depth, col: node.col });
  if (['normal', 'elite', 'boss'].includes(node.kind)) s.phase = 'management';
  else if (node.kind === 'recovery') {
    const healed = s.floors.filter(Boolean).map(e => {
      const before = e.hp;
      e.hp = maxHp(e);
      return { id: e.id, before, after: e.hp, amount: e.hp - before };
    });
    log(s, 'recovery', { healed });
    completeVisit(s);
  } else if (node.kind === 'shop') {
    s.shop = Array.from({ length: 8 }, () => ({ type: TYPES[draw(s, '상점', TYPES.length)], price: 6, purchased: false }));
    s.phase = 'shop';
    log(s, 'shop-opened', { stock: structuredClone(s.shop) });
  } else s.phase = node.kind;
  return { action: 'visit', node: node.id, kind: node.kind };
}

function acquire(s, type, source) {
  s.pending = { entity: newEntity(s, type, source), source, returnPhase: source === 'shop' ? 'shop' : 'reward' };
  s.phase = 'place';
}

function finishAcquisition(s) {
  const returnPhase = s.pending.returnPhase;
  s.pending = null;
  if (returnPhase === 'shop') s.phase = 'shop';
  else completeVisit(s);
}

function positionIndex(value) {
  const n = Number(value);
  requireRule(Number.isInteger(n) && n >= 1 && n <= 10, '지점 번호는 1~10 정수여야 합니다.');
  return n - 1;
}

function livingCompanion(s, id) {
  const e = entityById(s, id);
  requireRule(e && floorOf(s, id) > 0 && e.hp > 0, `생존 동료 ID가 필요합니다: ${id}`);
  return e;
}

export function previewFusion(s, a, b) {
  const A = livingCompanion(s, typeof a === 'object' ? a.id : a);
  const B = livingCompanion(s, typeof b === 'object' ? b.id : b);
  requireRule(A.id !== B.id, '서로 다른 두 동료를 골라야 합니다.');
  requireRule(!A.fusion && !B.fusion, '융합 동료는 다시 융합할 수 없습니다.');
  return {
    position: floorOf(s, A.id), emptiedPosition: floorOf(s, B.id), hp: A.hp, maxHp: maxHp(A), upgraded: A.upgraded,
    parts: [{ key: 'A', id: A.id, type: A.type, upgraded: A.upgraded, effect: A.upgraded ? CARDS[A.type].upgradeText : CARDS[A.type].baseText },
      { key: 'B', id: B.id, type: B.type, upgraded: B.upgraded, effect: B.upgraded ? CARDS[B.type].upgradeText : CARDS[B.type].baseText }],
    sharedQuick: 1, canFuseAgain: false,
  };
}

export function finishBattle(s, outcome) {
  requireRule(['win', 'loss', 'escape'].includes(outcome), `알 수 없는 전투 결과: ${outcome}`);
  requireRule(s.battle && s.node, '정산할 전투가 없습니다.');
  const living = s.floors.filter(e => e && e.hp > 0);
  if (!living.length || (outcome === 'escape' && s.node.kind === 'boss')) outcome = 'loss';
  const summary = {
    ...structuredClone(s.battle.summary ?? {}), node: s.node.id, act: s.act, depth: s.node.depth,
    kind: s.node.kind, outcome, rounds: s.battle.summary?.rounds || s.battle.round,
    coins: s.coins, survivors: living.map(e => ({ id: e.id, hp: e.hp, maxHp: maxHp(e) })),
  };
  s.stats.battles.push(summary);
  log(s, 'battle-finished', summary);
  resetStatuses(s);
  s.battle = null;
  if (outcome === 'loss') {
    s.phase = 'lost';
    s.pending = null;
    s.rewards = [];
    log(s, 'campaign-lost', { reason: 'battle', coins: s.coins });
  } else if (outcome === 'escape') completeVisit(s);
  else {
    const pool = [...TYPES];
    s.rewards = Array.from({ length: 3 }, () => pool.splice(draw(s, '동료보상', pool.length), 1)[0]);
    s.phase = 'reward';
    log(s, 'reward-offered', { offers: [...s.rewards] });
  }
  return summary;
}

export function campaignAction(s, command, args = []) {
  requireRule(Array.isArray(args), '명령 인수는 배열이어야 합니다.');
  requireRule(!['won', 'lost'].includes(s.phase), '이미 끝난 원정입니다. 새 판을 시작하세요.');
  if (command === 'give-up') {
    if (s.battle) return finishBattle(s, 'loss');
    resetStatuses(s);
    s.phase = 'lost';
    s.pending = null;
    s.rewards = [];
    s.shop = [];
    log(s, 'campaign-lost', { reason: 'give-up', coins: s.coins });
    return { action: command };
  }
  if (command === 'visit') return visit(s, args[0]);
  if (command === 'swap') {
    requireRule(['map', 'management', 'shop', 'fusion', 'upgrade'].includes(s.phase) && !s.pending, '현재 단계에서는 재배치할 수 없습니다.');
    const a = positionIndex(args[0]);
    const b = positionIndex(args[1]);
    [s.floors[a], s.floors[b]] = [s.floors[b], s.floors[a]];
    log(s, 'rearranged', { positions: [a + 1, b + 1], ids: [s.floors[a]?.id ?? null, s.floors[b]?.id ?? null] });
    return { action: command, positions: [a + 1, b + 1] };
  }
  if (command === 'start') {
    requireRule(s.phase === 'management', '전투 준비 지점에서 시작하세요.');
    requireRule(s.floors.some(e => e && e.hp > 0), '생존 동료가 한 명 이상 필요합니다.');
    startBattle(s);
    return { action: command };
  }
  if (command === 'reward') {
    requireRule(s.phase === 'reward', '선택할 전투 보상이 없습니다.');
    const choice = Number(args[0]);
    requireRule(Number.isInteger(choice) && choice >= 1 && choice <= s.rewards.length, '보상 번호는 1~3입니다.');
    const type = s.rewards[choice - 1];
    log(s, 'reward-chosen', { choice, companionType: type });
    acquire(s, type, 'reward');
    return { action: command, type };
  }
  if (command === 'place') {
    requireRule(s.phase === 'place' && s.pending, '배치할 새 동료가 없습니다.');
    const index = positionIndex(args[0]);
    requireRule(!s.floors[index] || s.floors.every(Boolean), '빈 지점이 남아 있으면 빈 지점에 배치해야 합니다.');
    const old = s.floors[index];
    if (old) {
      const loss = { id: old.id, type: old.type, act: s.act, node: s.node.id, position: index + 1, cause: 'replacement' };
      s.stats.losses.push(loss);
      log(s, 'companion-removed', loss);
    }
    const { entity, source } = s.pending;
    s.floors[index] = entity;
    const acquired = { id: entity.id, type: entity.type, source, act: s.act, node: s.node.id, position: index + 1 };
    s.stats.acquired.push(acquired);
    log(s, 'companion-placed', acquired);
    finishAcquisition(s);
    return { action: command, id: entity.id, position: index + 1 };
  }
  if (command === 'discard') {
    requireRule(s.phase === 'place' && s.pending, '포기할 새 동료가 없습니다.');
    const { entity, source } = s.pending;
    log(s, 'acquisition-discarded', { id: entity.id, companionType: entity.type, source });
    finishAcquisition(s);
    return { action: command, id: entity.id };
  }
  if (command === 'buy') {
    requireRule(s.phase === 'shop', '상점에서 구매할 수 있습니다.');
    const slot = Number(args[0]);
    requireRule(Number.isInteger(slot) && slot >= 1 && slot <= s.shop.length, '상점 슬롯은 1~8입니다.');
    const item = s.shop[slot - 1];
    requireRule(!item.purchased, '이미 구매한 슬롯입니다.');
    requireRule(s.coins >= item.price, `재화 ${item.price}가 필요합니다.`);
    s.coins -= item.price;
    item.purchased = true;
    const purchase = { act: s.act, node: s.node.id, depth: s.node.depth, slot, type: item.type, price: item.price, coins: s.coins };
    s.stats.purchases.push(purchase);
    log(s, 'purchased', purchase);
    acquire(s, item.type, 'shop');
    return { action: command, ...purchase };
  }
  if (command === 'leave') {
    requireRule(s.phase === 'shop', '상점에서 나갈 때 사용하는 명령입니다.');
    completeVisit(s);
    return { action: command };
  }
  if (command === 'upgrade') {
    requireRule(s.phase === 'upgrade', '강화 지점에서만 강화할 수 있습니다.');
    const e = livingCompanion(s, args[0]);
    requireRule(!e.upgraded, '원본 A는 이미 강화되었습니다.');
    const before = maxHp(e);
    e.upgraded = true;
    const result = { act: s.act, node: s.node.id, id: e.id, type: e.type, hp: e.hp, maxHpBefore: before, maxHpAfter: maxHp(e), part: 'A' };
    s.stats.upgrades.push(result);
    log(s, 'upgraded', result);
    completeVisit(s);
    return { action: command, ...result };
  }
  if (command === 'fuse') {
    requireRule(s.phase === 'fusion', '융합 지점에서만 융합할 수 있습니다.');
    const preview = previewFusion(s, args[0], args[1]);
    const A = livingCompanion(s, args[0]);
    const B = livingCompanion(s, args[1]);
    const result = newEntity(s, A.type, 'fusion');
    result.hp = A.hp;
    result.upgraded = A.upgraded;
    result.fusion = { bType: B.type, bUpgraded: B.upgraded, aId: A.id, bId: B.id };
    s.floors[preview.position - 1] = result;
    s.floors[preview.emptiedPosition - 1] = null;
    const fusion = { act: s.act, node: s.node.id, id: result.id, aId: A.id, bId: B.id, hp: result.hp, maxHp: maxHp(result), position: preview.position, parts: parts(result) };
    s.stats.fusions.push(fusion);
    log(s, 'fused', fusion);
    completeVisit(s);
    return { action: command, ...fusion };
  }
  if (command === 'skip') {
    requireRule(['reward', 'upgrade', 'fusion'].includes(s.phase), '보상·강화·융합에서 건너뛸 수 있습니다.');
    log(s, 'node-skipped', { phase: s.phase });
    completeVisit(s);
    return { action: command };
  }
  throw new Error(`알 수 없는 원정 명령: ${command}`);
}
