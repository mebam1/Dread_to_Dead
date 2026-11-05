import {createGuest} from '../mvp_user_4/enemies.mjs';
import {quickAbilities, startBattle} from './combat.mjs';
import {
  CREATURES, DICE, RULE_VERSION, SUFFIXES, credit, creatureStats, draw,
  entityById, entityName, floorOf, log, newEntity, partnerEffectText, requireRule,
} from './shared.mjs';

const TYPES = Object.keys(CREATURES);
const SPECIAL_DICE = Object.keys(DICE).filter(type => type !== 'normal');
const COLUMNS = ['좌', '중', '우'];
const SIDES = [
  ['normal', 'normal'], ['event', 'fusion'], ['shop', 'recovery'],
  ['elite', 'event'], ['fusion', 'shop'], ['recovery', 'elite'],
];
const EARLY_GROUPS = [['N1', 'N1', 'N2'], ['N1', 'N2', 'N3'], ['N2', 'N3', 'N4']];
const LATE_GROUPS = [['N3', 'N4', 'N5'], ['N4', 'N5', 'N6'], ['N5', 'N6', 'N6']];
const COMBAT = new Set(['normal', 'elite', 'boss']);
const MANAGEMENT = new Set(['map', 'management', 'shop', 'event', 'recovery', 'fusion']);

function makeNode(s, depth, col, kind) {
  const act = s.act;
  const node = {id: [act, depth, col].join('-'), act, depth, col, kind, guests: [], next: []};
  let ids = [];
  let reward = 0;
  if (kind === 'normal') {
    const groups = act === 1 ? EARLY_GROUPS : LATE_GROUPS;
    ids = groups[draw(s, '손님묶음', groups.length, node)];
    reward = 1;
  } else if (kind === 'elite') {
    ids = ['E' + act];
    reward = 3;
  } else if (kind === 'boss') {
    ids = ['BOSS' + act];
    reward = act === 3 ? 0 : 2;
  }
  node.guests = ids.map(id => ({...createGuest(id, act, depth, kind), reward}));
  return node;
}

function makeMap(s) {
  const nodes = [];
  for (let depth = 1; depth <= 6; depth++) {
    const sides = [...SIDES[depth - 1]];
    if (depth > 1 && draw(s, '지도좌우', 2, {act: s.act, depth, col: '공통'}) === 1) sides.reverse();
    nodes.push(makeNode(s, depth, '좌', sides[0]), makeNode(s, depth, '중', 'normal'), makeNode(s, depth, '우', sides[1]));
  }
  nodes.push(makeNode(s, 7, '공통', 'recovery'), makeNode(s, 8, '공통', 'boss'));
  for (const node of nodes) {
    node.next = nodes.filter(other => other.depth === node.depth + 1 &&
      (other.col === '공통' || Math.abs(COLUMNS.indexOf(other.col) - COLUMNS.indexOf(node.col)) <= 1))
      .map(other => other.id);
  }
  return nodes;
}

export function createGame(seed = 31001) {
  requireRule(Number.isSafeInteger(seed), '판 번호는 안전한 정수여야 합니다.');
  const s = {
    version: RULE_VERSION, seed, act: 1, node: null, phase: 'map', floors: Array(10).fill(null),
    dice: ['normal', 'normal', 'normal'], souls: 2, actIncome: 0,
    sequence: 0, rng: {}, journal: [], map: [], visited: [], battle: null,
    shop: [], rewards: [], pending: null, offerDie: null, event: null, result: null,
  };
  log(s, 'start', {souls: 2, actIncome: 0});
  for (const [floor, type] of [[1, 'gaze'], [3, 'owner'], [5, 'runes'], [6, 'safe']]) {
    const entity = newEntity(s, type, 'start');
    s.floors[floor - 1] = entity;
    log(s, 'acquired', {id: entity.id, creature: type, source: 'start', floor});
  }
  s.map = makeMap(s);
  return s;
}

function availableNodes(s) {
  if (s.phase !== 'map') return [];
  const last = s.map.find(node => node.id === s.visited.at(-1));
  return s.map.filter(node => last ? last.next.includes(node.id) : node.depth === 1);
}

export function publicMap(s) {
  const available = new Set(availableNodes(s).map(node => node.id));
  return s.map.map(node => ({
    ...structuredClone(node), reachable: available.has(node.id),
    current: s.node?.id === node.id, completed: s.visited.includes(node.id),
  }));
}

function requirePhase(s, phase) {
  requireRule(s.phase === phase, '현재 단계에서 할 수 없는 행동입니다: ' + s.phase);
}

function listIndex(input, len, message) {
  const n = Number(input);
  requireRule(Number.isInteger(n) && n >= 1 && n <= len, message);
  return n - 1;
}

function completeNode(s) {
  const node = s.node;
  log(s, 'node-complete', {kind: node.kind, occupied: s.floors.filter(Boolean).length, souls: s.souls, actIncome: s.actIncome});
  s.visited.push(node.id);
  s.shop = [];
  s.rewards = [];
  s.pending = null;
  s.event = null;
  s.offerDie = null;
  if (node.kind === 'boss' && s.act === 3) {
    s.phase = 'won';
    s.result = 'victory';
    log(s, 'victory', {visits: s.visited.length, survivors: s.floors.filter(Boolean).map(e => e.id)});
    return;
  }
  if (node.kind === 'boss') {
    const restored = [];
    for (const entity of s.floors.filter(Boolean)) {
      const max = creatureStats(entity).maxTokens;
      restored.push({id: entity.id, before: entity.tokens, after: max});
      entity.tokens = max;
    }
    log(s, 'act-end', {nextAct: s.act + 1, souls: s.souls, income: s.actIncome, restored});
    s.act++;
    s.actIncome = 0;
    s.map = makeMap(s);
  }
  s.node = null;
  s.phase = 'map';
}

function visit(s, input) {
  requirePhase(s, 'map');
  const choices = availableNodes(s);
  const node = choices.find(n => n.id === input) ??
    choices[listIndex(input, choices.length, '연결된 다음 노드를 선택하세요.')];
  s.node = node;
  s.phase = node.kind;
  log(s, 'visit', {kind: node.kind, alternatives: choices.map(n => n.id), souls: s.souls, income: s.actIncome});
  if (COMBAT.has(node.kind)) {
    for (const e of s.floors.filter(Boolean)) e.damage = 0;
    s.phase = 'management';
  } else if (node.kind === 'shop') {
    s.shop = Array.from({length: 8}, (_, i) => {
      const type = TYPES[draw(s, '상점', TYPES.length)];
      return {slot: i + 1, type, price: CREATURES[type].price, sold: false};
    });
    log(s, 'shop-open', {stock: structuredClone(s.shop), souls: s.souls});
  } else if (node.kind === 'event') {
    const kind = ['luggage', 'room', 'contract'][draw(s, '이벤트종류', 3)];
    s.event = {kind};
    if (kind === 'luggage') s.event.die = SPECIAL_DICE[draw(s, '이벤트제시물', SPECIAL_DICE.length)];
    if (kind === 'room') s.event.type = TYPES[draw(s, '이벤트제시물', TYPES.length)];
    if (kind !== 'room') s.event.payout = Math.min(2, 9 - s.actIncome);
    log(s, 'event-open', {offer: {...s.event}});
  }
}

function lose(s, reason) {
  s.phase = 'lost';
  s.result = reason;
  log(s, 'defeat', {reason, visits: s.visited.length});
}

export function finishBattle(s, outcome) {
  requireRule(COMBAT.has(s.node?.kind) && s.battle, '진행 중인 전투가 없습니다.');
  requireRule(['win', 'escape', 'loss'].includes(outcome), '전투 결과가 잘못되었습니다.');
  for (const e of s.floors.filter(Boolean)) {
    Object.assign(e, {seal: 0, ambush: 0, target: null, partnerTarget: null, defense: 0, stepBase: 0, stepDonor: 0});
  }
  s.battle = null;
  log(s, 'battle-end', {outcome, kind: s.node.kind});
  if (outcome === 'loss' || (outcome === 'escape' && s.node.kind === 'boss')) {
    lose(s, outcome === 'escape' ? 'boss-escape' : 'extinction');
  } else if (outcome === 'escape') {
    completeNode(s);
  } else {
    const pool = [...TYPES];
    s.rewards = [];
    for (let i = 0; i < 3; i++) {
      s.rewards.push(pool.splice(draw(s, '괴이보상', pool.length), 1)[0]);
    }
    s.phase = 'reward';
    log(s, 'reward-offer', {options: [...s.rewards]});
  }
}

function acquire(s, type, source) {
  const entity = newEntity(s, type, source);
  s.pending = {source, entity};
  s.phase = 'acquisition';
  log(s, 'acquired', {id: entity.id, creature: type, source});
}

function dispose(s, destination) {
  requirePhase(s, 'acquisition');
  const {source, entity} = s.pending;
  if (destination === null) {
    log(s, 'discard', {id: entity.id, creature: entity.type, source, incoming: true});
  } else {
    const i = listIndex(destination, 10, '1~10층을 지정하세요.');
    const old = s.floors[i];
    requireRule(!old || s.floors.every(Boolean), '빈층이 있으면 새 괴이는 빈층에 배치하세요.');
    if (old) log(s, 'discard', {id: old.id, creature: old.type, floor: i + 1, incoming: false, replacement: entity.id});
    s.floors[i] = entity;
    log(s, 'placed', {id: entity.id, floor: i + 1, source});
  }
  s.pending = null;
  if (source === 'shop') {
    s.phase = 'shop';
  } else if (source === 'reward' && s.node.kind === 'elite') {
    s.offerDie = SPECIAL_DICE[draw(s, '엘리트주사위', SPECIAL_DICE.length)];
    s.phase = 'die';
    log(s, 'die-offer', {die: s.offerDie});
  } else {
    completeNode(s);
  }
}

export function previewFusion(s, aId, bId) {
  requireRule(s.phase === 'fusion' || s.phase === 'map', '지도 또는 융합 노드에서 재료를 살펴보세요.');
  const a = entityById(s, aId);
  const b = entityById(s, bId);
  requireRule(a && b && a.id !== b.id && !a.fusion && !b.fusion,
    '서로 다른 생존 미융합 개체 둘을 고르세요.');
  const aFloor = floorOf(s, a.id);
  const bFloor = floorOf(s, b.id);
  return {
    a: a.id, b: b.id, aFloor, bFloor, freeFloor: bFloor,
    aName: entityName(a), bName: entityName(b), bodyEffect: CREATURES[a.type].baseText,
    upgradeEffect: a.upgraded ? CREATURES[a.type].upgradeText : null, donorEffect: partnerEffectText(b.type, b.upgraded),
    stats: creatureStats(a), tokens: a.tokens, damage: a.damage, upgraded: a.upgraded,
    thumbnail: {left: a.type, right: b.type},
    quickAbilities: quickAbilities({type: a.type, donor: b.type}),
  };
}

function fuse(s, aId, bId, option = 1) {
  requirePhase(s, 'fusion');
  requireRule(Number(option) === 1, '융합에는 A와 B의 본 효과를 모두 사용합니다.');
  const preview = previewFusion(s, aId, bId);
  const a = s.floors[preview.aFloor - 1];
  const b = s.floors[preview.bFloor - 1];
  const name = SUFFIXES[draw(s, '융합수식어', SUFFIXES.length)] + ' 융합체';
  const newId = newEntity(s, a.type, 'fusion').id;
  const fusion = {name, aId: a.id, bId: b.id, aType: a.type, bType: b.type,
    aUpgraded: a.upgraded, bUpgraded: b.upgraded, thumbnail: preview.thumbnail};
  const result = {...a, id: newId, source: 'fusion', donor: b.type, fusion};
  s.floors[preview.aFloor - 1] = result;
  s.floors[preview.bFloor - 1] = null;
  log(s, 'fusion', {a: a.id, b: b.id, c: result.id, ...preview, name, inherited: b.type});
  completeNode(s);
}

function equip(s, input) {
  const die = s.phase === 'die' ? s.offerDie : s.phase === 'event' && s.event?.die;
  requireRule(die, '교체할 주사위 제안이 없습니다.');
  const i = listIndex(input, 3, '장착한 세 자리 중 하나를 선택하세요.');
  log(s, 'equip', {slot: i + 1, before: s.dice[i], after: die});
  s.dice[i] = die;
  completeNode(s);
}

function recover(s, ids) {
  requirePhase(s, 'recovery');
  requireRule(ids.length === 1 || ids.length === 2, '회복 토큰 1~2개를 받을 ID를 지정하세요.');
  const targets = ids.map(id => entityById(s, id));
  const counts = new Map();
  for (const entity of targets) {
    requireRule(entity, '생존 괴이 ID를 지정하세요.');
    const count = (counts.get(entity) ?? 0) + 1;
    requireRule(entity.tokens + count <= creatureStats(entity).maxTokens, '최대 토큰을 초과합니다.');
    counts.set(entity, count);
  }
  for (const [entity, count] of counts) {
    entity.tokens += count;
    log(s, 'heal', {id: entity.id, count, tokens: entity.tokens});
  }
  completeNode(s);
}

/** One accepted command is one decision. References to unpublished stock never enter map data. */
export function campaignAction(s, cmd, args = []) {
  switch (cmd) {
    case 'visit':
      visit(s, args[0]);
      break;
    case 'start':
      requirePhase(s, 'management');
      requireRule(s.floors.some(Boolean), '영업을 시작하려면 괴이가 하나 이상 있어야 합니다.');
      startBattle(s, structuredClone(s.node.guests));
      break;
    case 'swap': {
      requireRule(MANAGEMENT.has(s.phase), '이 단계에서는 재배치할 수 없습니다.');
      const from = listIndex(args[0], 10, '출발층은 1~10이어야 합니다.');
      const to = listIndex(args[1], 10, '목표층은 1~10이어야 합니다.');
      requireRule(from !== to && s.floors[from], '배치된 괴이의 층과 다른 목표층을 선택하세요.');
      log(s, 'swap', {from: from + 1, to: to + 1, id: s.floors[from].id, other: s.floors[to]?.id ?? null});
      [s.floors[from], s.floors[to]] = [s.floors[to], s.floors[from]];
      break;
    }
    case 'reward': {
      requirePhase(s, 'reward');
      const i = listIndex(args[0], s.rewards.length, '괴이 보상 1~3번 가운데 고르세요.');
      const type = s.rewards[i];
      log(s, 'reward-choice', {slot: i + 1, creature: type, options: [...s.rewards]});
      s.rewards = [];
      acquire(s, type, 'reward');
      break;
    }
    case 'place': dispose(s, args[0]); break;
    case 'discard': dispose(s, null); break;
    case 'buy': {
      requirePhase(s, 'shop');
      const item = s.shop[listIndex(args[0], s.shop.length, '유효한 상점 슬롯을 지정하세요.')];
      requireRule(!item.sold && s.souls >= item.price, '품절이거나 영혼이 부족합니다.');
      s.souls -= item.price;
      item.sold = true;
      log(s, 'purchase', {source: 'shop', slot: item.slot, creature: item.type, paid: item.price, souls: s.souls});
      acquire(s, item.type, 'shop');
      break;
    }
    case 'deal':
      requirePhase(s, 'event');
      requireRule(s.event.kind === 'room' && s.souls >= 3, '봉인된 객실에서 영혼 3이 필요합니다.');
      s.souls -= 3;
      log(s, 'purchase', {source: 'event', creature: s.event.type, paid: 3, souls: s.souls});
      acquire(s, s.event.type, 'event');
      break;
    case 'cash':
      requirePhase(s, 'event');
      requireRule(s.event.kind === 'luggage' && s.actIncome < 9, '영혼을 받을 수 없는 이벤트입니다.');
      credit(s, 2, 'luggage');
      completeNode(s);
      break;
    case 'contract': {
      requirePhase(s, 'event');
      requireRule(s.event.kind === 'contract' && s.actIncome < 9, '계약으로 영혼을 받을 수 없습니다.');
      const who = entityById(s, args[0]);
      requireRule(who && s.floors.filter(Boolean).length > 1, '계약 후 생존 괴이가 하나 이상 남아야 합니다.');
      const floor = floorOf(s, who.id);
      s.floors[floor - 1] = null;
      log(s, 'contract', {id: who.id, creature: who.type, floor});
      credit(s, 2, 'contract');
      completeNode(s);
      break;
    }
    case 'equip': equip(s, args[0]); break;
    case 'fuse': fuse(s, ...args); break;
    case 'heal': recover(s, args); break;
    case 'upgrade': {
      requirePhase(s, 'recovery');
      const who = entityById(s, args[0]);
      requireRule(who && !who.upgraded, '미강화 생존 괴이를 선택하세요.');
      who.upgraded = true;
      if (who.type === 'steps') who.tokens++;
      log(s, 'upgrade', {id: who.id, creature: who.type, tokens: who.tokens, ...creatureStats(who)});
      completeNode(s);
      break;
    }
    case 'leave':
      requirePhase(s, 'shop');
      completeNode(s);
      break;
    case 'skip':
      requireRule(['event', 'fusion', 'recovery', 'die'].includes(s.phase), '현재 결정을 건너뛸 수 없습니다.');
      log(s, 'skip', {choice: s.phase});
      completeNode(s);
      break;
    case 'giveup':
      requireRule(!['won', 'lost'].includes(s.phase) &&
        !(s.act === 3 && s.node?.kind === 'boss' && ['reward', 'acquisition'].includes(s.phase)),
      '결과가 확정된 판입니다.');
      lose(s, 'giveup');
      break;
    default:
      throw new Error('알 수 없는 캠페인 행동: ' + cmd);
  }
  return s;
}
