import { DICE, creatureStats, credit, draw, entityById, floorOf, log, requireRule } from './shared.mjs';

const FLOOR_COUNT = 10;
const HIT_GREED = new Set(['safe', 'nepenthes', 'barnacle']);
const QUICK_TYPES = new Set(['mouse', 'portrait', 'safe', 'nepenthes', 'barnacle', 'collector', 'prophet', 'samara']);
const TARGETED_QUICK_TYPES = new Set(['mouse', 'collector', 'nepenthes']);

function partsOf(e) {
  return e.donor ? ['base', 'donor'] : ['base'];
}

function effectType(e, part) {
  return part === 'base' ? e.type : e.donor;
}

function effectUpgraded(e, part) {
  return part === 'base' ? e.upgraded : e.fusion?.bUpgraded;
}

function wrap(floor) {
  return ((floor - 1 + FLOOR_COUNT) % FLOOR_COUNT) + 1;
}

// A preview receives an isolated event sink. No hidden draw, next roll, or credit is performed.
function emit(s, run, type, details = {}) {
  if (run?.preview) run.events.push({ type, ...details });
  else log(s, type, details);
}

function roll(s, reroll = false) {
  const b = s.battle;
  b.rolls = s.dice.map(type => DICE[type].faces[draw(s, '굴림', 6)]);
  b.slot = null;
  b.face = null;
  s.phase = 'choose';
  log(s, 'roll', { turn: b.turn, index: b.index, reroll, rolls: [...b.rolls] });
}

function cleanEntities(s, { resetDamage = false, end = false } = {}) {
  for (const e of s.floors.filter(Boolean)) {
    e.seal = 0;
    e.ambush = 0;
    e.target = null;
    e.partnerTarget = null;
    e.defense = 0;
    if (resetDamage) e.damage = 0;
    if (end) e.stepBase = e.stepDonor = 0;
  }
}

function enterGuest(s, index) {
  const b = s.battle;
  const guest = b.guests[index];
  cleanEntities(s, { resetDamage: true });
  Object.assign(b, {
    guest, index, turn: 1, hearts: guest.h, fear: 0, position: 0,
    anxiety: 0, greed: 0, prophecy: 0, gainedAnxiety: 0,
    active: false, idle: 0, idleLimit: 3, guards: {}, barnacles: [],
  });
  log(s, 'guest-entry', { index, guest: guest.id, hearts: guest.h });
  roll(s);
}

export function startBattle(s, guests) {
  requireRule(s.floors.some(Boolean) && guests.length > 0, '영업할 괴이와 손님이 필요합니다.');
  s.battle = { guests: structuredClone(guests), exit: null };
  cleanEntities(s, { end: true });
  enterGuest(s, 0);
}

function gain(s, key, amount, source, run, part = 'base') {
  const b = s.battle;
  const delta = Math.min(amount, 99 - b[key]);
  b[key] += delta;
  if (delta > 0) b.active = true;
  if (key === 'anxiety') b.gainedAnxiety += delta;
  emit(s, run, 'gain', { resource: key, amount: delta, source, part, total: b[key] });
  if (key !== 'anxiety' || !delta || !run?.watchers) return;
  for (const watch of run.watchers) {
    if (watch.entity.id === source || watch.entity.seal) continue;
    const field = watch.part === 'base' ? 'stepBase' : 'stepDonor';
    watch.entity[field]++;
    emit(s, run, 'footstep-growth', { id: watch.entity.id, part: watch.part, total: watch.entity[field] });
  }
}

function spend(s, key, amount, source, run, part) {
  const b = s.battle;
  if (b[key] < amount) return false;
  b[key] -= amount;
  emit(s, run, 'spend', { resource: key, amount, source, part, total: b[key] });
  return true;
}

function fear(s, amount, entity, part, run) {
  if (amount <= 0) return;
  const b = s.battle;
  b.active = true;
  b.fear += amount;
  emit(s, run, 'fear', { id: entity.id, part, amount });
  if (b.fear < b.guest.t) return;
  b.hearts--;
  b.fear = 0;
  emit(s, run, 'heart', { id: entity.id, remaining: b.hearts });
}

function choose(s, slot, run) {
  const b = s.battle;
  requireRule(s.phase === 'choose' && Number.isInteger(slot) && slot >= 1 && slot <= 3, '공개된 주사위 1~3번을 선택하세요.');
  b.slot = slot;
  b.face = b.rolls[slot - 1];
  s.phase = 'prepare';
  emit(s, run, 'choose', { slot, face: b.face });
  if (s.dice[slot - 1] === 'anxiety' && b.face === 3) gain(s, 'anxiety', 1, 'die', run, 'die');
}

function changeAmbush(s, e, amount, run) {
  const old = e.ambush;
  e.ambush = Math.max(0, Math.min(99, old + amount));
  emit(s, run, 'ambush', { id: e.id, previous: old, total: e.ambush });
  if (old <= 0 || e.ambush !== 0) return;
  emit(s, run, 'ambush-release', { id: e.id, target: e.target, partnerTarget: e.partnerTarget, sealed: e.seal > 0 });
  for (const part of partsOf(e)) {
    const type = effectType(e, part);
    const plus = effectUpgraded(e, part);
    const target = part === 'base' ? e.target : e.partnerTarget;
    if (e.seal || !s.battle.hearts) break;
    if (type === 'safe') fear(s, plus ? 3 : 2, e, part, run);
    if (type === 'visit' && target === s.battle.position) fear(s, plus ? 10 : 8, e, part, run);
  }
  e.target = e.partnerTarget = null;
}

function onVisit(s, e, part, arrival, run) {
  const b = s.battle;
  const type = effectType(e, part);
  const plus = effectUpgraded(e, part);
  switch (type) {
    case 'gaze':
      if (!arrival) gain(s, 'anxiety', plus ? 5 : 4, e.id, run, part);
      break;
    case 'steps':
      if (!arrival) run.watchers.push({ entity: e, part });
      else gain(s, 'anxiety', 1 + (part === 'base' ? e.stepBase : e.stepDonor), e.id, run, part);
      break;
    case 'owner':
      if (arrival) {
        const cost = b.anxiety;
        spend(s, 'anxiety', cost, e.id, run, part);
        fear(s, cost, e, part, run);
      }
      break;
    case 'ratKing':
      if (arrival && spend(s, 'anxiety', plus ? 7 : 8, e.id, run, part)) {
        fear(s, b.gainedAnxiety, e, part, run);
      }
      break;
    case 'safe':
      if (arrival) changeAmbush(s, e, -99, run);
      break;
    case 'runes':
      if (!arrival && b.face <= 3) gain(s, 'prophecy', plus ? 2 : 1, e.id, run, part);
      break;
    case 'roulette':
      if (!arrival && b.face % 2 === 0) gain(s, 'prophecy', plus ? 2 : 1, e.id, run, part);
      break;
    case 'visit':
      if (!arrival && spend(s, 'prophecy', 2, e.id, run, part)) {
        changeAmbush(s, e, 2, run);
        const targetKey = part === 'base' ? 'target' : 'partnerTarget';
        if (run.preview) {
          e[targetKey] = null;
          const options = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);
          run.uncertainties.push({ type: 'ambush-target', id: e.id, part, floors: options });
        } else {
          e[targetKey] = draw(s, '잠복표적', FLOOR_COUNT) + 1;
          emit(s, run, 'ambush-target', { id: e.id, part, target: e[targetKey] });
        }
      }
      break;
  }
}

function guardAssignment(s, protector, target) {
  // Build a candidate mapping first, so a rejected cycle never commits a defense or a cost.
  const guards = { ...s.battle.guards };
  for (const [id, guard] of Object.entries(guards)) {
    if (guard === protector.id) delete guards[id];
  }
  if (protector.id === target.id) return guards;
  for (let id = protector.id; guards[id] != null; id = guards[id]) {
    requireRule(guards[id] !== target.id, '대리 피격 순환은 만들 수 없습니다.');
  }
  guards[target.id] = protector.id;
  return guards;
}

function active(s, args, run) {
  const [id, part, targetId] = args;
  const e = entityById(s, id);
  requireRule(e && !e.seal, '미봉인 생존 괴이를 선택하세요.');
  requireRule(partsOf(e).includes(part), '사용할 원본 괴이를 선택하세요.');
  const type = effectType(e, part);
  const plus = effectUpgraded(e, part);
  const b = s.battle;
  const targeted = TARGETED_QUICK_TYPES.has(type);
  requireRule(args.length === (targeted ? 3 : 2), targeted ? '대상 괴이 ID가 필요합니다.' : '대상을 지정하지 않는 속공입니다.');
  const target = targeted ? entityById(s, targetId) : null;
  if (targeted) requireRule(target, '생존한 대상 괴이를 선택하세요.');
  const contribution = {};
  function pay(resource, amount) {
    requireRule(spend(s, resource, amount, id, run, part), '속공에 필요한 자원이 부족합니다.');
    b.active = true;
  }
  switch (type) {
    case 'mouse': {
      const distance = Math.abs(floorOf(s, id) - floorOf(s, targetId));
      requireRule(distance === 1 || distance === FLOOR_COUNT - 1, '생쥐는 인접한 괴이만 선택할 수 있습니다.');
      pay('anxiety', 4);
      contribution.repaired = Math.min(target.damage, plus ? 10 : 6);
      target.damage -= contribution.repaired;
      target.seal = Math.min(99, target.seal + 2);
      break;
    }
    case 'portrait':
      pay('anxiety', 7);
      contribution.faceChange = 2;
      b.face += contribution.faceChange;
      break;
    case 'safe':
      requireRule(e.ambush < 99, '이미 잠복 99입니다.');
      changeAmbush(s, e, 99, run);
      break;
    case 'nepenthes': {
      const guards = guardAssignment(s, e, target);
      pay('greed', 2);
      contribution.defenseGranted = plus ? 8 : 4;
      contribution.defenseTarget = e.id;
      e.defense += contribution.defenseGranted;
      b.guards = guards;
      break;
    }
    case 'barnacle':
      pay('greed', 1);
      b.barnacles.push({id: e.id, part});
      break;
    case 'collector':
      requireRule(target.seal === 0, '봉인된 괴이에게 사용할 수 없습니다.');
      contribution.defenseGranted = 10;
      contribution.defenseTarget = target.id;
      target.defense += contribution.defenseGranted;
      target.seal = Math.min(99, target.seal + 6);
      break;
    case 'prophet':
      pay('prophecy', plus ? 1 : 2);
      if (!run?.preview) roll(s, true);
      break;
    case 'samara':
      requireRule(b.face > 1, '눈 1은 줄일 수 없습니다.');
      pay('prophecy', 2);
      b.face--;
      contribution.faceChange = -1;
      break;
    default:
      requireRule(false, '이 효과에는 속공이 없습니다.');
  }
  emit(s, run, 'active', {
    id: e.id, part, ability: type, target: target?.id ?? null, face: b.face, ...contribution,
    defense: e.defense, targetDefense: target?.defense, targetDamage: target?.damage, targetSeal: target?.seal,
  });
}

function attackPlan(b, path) {
  const g = b.guest;
  const floor = b.position;
  const pattern = g.pattern === 'final' ? (b.turn % 2 ? 'double' : 'mirror') : g.pattern;
  switch (pattern) {
    case 'route': return path.map(target => [target, g.power]);
    case 'adjacent': return floor > 1 ? [[floor - 1, g.power], [floor, g.power]] : [[floor, g.power]];
    case 'mirror':
    case 'bossMirror':
      return [floor - 2, floor + 2]
        .filter(target => target >= 1 && target <= FLOOR_COUNT)
        .map(target => [target, g.mirrorPower]);
    case 'double': return [[floor, g.doublePower], [floor, g.doublePower]];
    default: throw new Error('알 수 없는 손님 공격 패턴: ' + pattern);
  }
}

function greedParts(e) {
  return partsOf(e).filter(part => HIT_GREED.has(effectType(e, part)));
}

function hit(s, floor, power, penalty, run) {
  const b = s.battle;
  let e = s.floors[floor - 1];
  if (!e) {
    emit(s, run, 'miss', { floor, power });
    return;
  }
  while (!penalty && b.guards[e.id]) {
    const guard = entityById(s, b.guards[e.id]);
    if (!guard) break;
    e = guard;
  }
  const absorbed = penalty ? 0 : Math.min(e.defense, power);
  const actual = power - absorbed;
  e.defense -= absorbed;
  e.damage += actual;
  const breached = e.damage >= creatureStats(e).limit;
  if (breached) {
    e.damage = 0;
    e.tokens--;
  }
  const receiver = floorOf(s, e.id);
  emit(s, run, 'hit', {
    floor, receiver, id: e.id, penalty, power, absorbed, actual, damage: e.damage,
    breached, tokens: e.tokens, destroyed: e.tokens === 0,
  });
  if (!e.tokens) {
    s.floors[receiver - 1] = null;
    for (const [target, protector] of Object.entries(b.guards)) {
      if (target === e.id || protector === e.id) delete b.guards[target];
    }
    emit(s, run, 'destroy', { id: e.id, floor: receiver });
  } else if (actual && !e.seal) {
    for (const part of greedParts(e)) gain(s, 'greed', 1, e.id, run, part);
  }
}

function turnEnd(s, run) {
  const b = s.battle;
  for (const e of s.floors.filter(Boolean)) e.defense = 0;
  b.guards = {};
  b.barnacles = [];
  if (!b.active && ++b.idle >= b.idleLimit) {
    const floors = s.floors.flatMap((e, i) => e ? [i + 1] : []);
    b.idle = 0;
    b.idleLimit = 2;
    if (run.preview && floors.length > 1) {
      const options = floors.map(floor => {
        const e = s.floors[floor - 1];
        const breached = e.damage + 12 >= creatureStats(e).limit;
        const tokens = e.tokens - Number(breached);
        const greed = tokens > 0 && !e.seal ? Math.min(99 - b.greed, greedParts(e).length) : 0;
        return { floor, id: e.id, damage: breached ? 0 : e.damage + 12, tokens, destroyed: !tokens, greed, idleLimit: greed ? 3 : 2 };
      });
      run.uncertainties.push({ type: 'inactivity-target', options });
    } else {
      const floor = run.preview ? floors[0] : floors[draw(s, '비활동표적', floors.length)];
      hit(s, floor, 12, true, run);
      if (!s.floors.some(Boolean)) return 'loss';
    }
  }
  if (b.active) {
    b.idle = 0;
    b.idleLimit = 3;
  }
  for (const e of s.floors.filter(Boolean)) if (e.seal) e.seal--;
  return null;
}

function move(s, run) {
  const b = s.battle;
  for (let step = 1; step <= b.face; step++) {
    const floor = wrap(b.position + 1);
    b.position = floor;
    run.path.push(floor);
    const arrival = step === b.face;
    const e = s.floors[floor - 1];
    emit(s, run, 'floor-visit', { floor, arrival, id: e?.id ?? null });
    if (b.exit === floor) {
      emit(s, run, 'exit-contact', { floor, guest: b.guest.id });
      return 'escape';
    }
    if (!e || e.seal) continue;
    onVisit(s, e, 'base', arrival, run);
    if (!b.hearts) return 'guest-kill';
    if (e.donor) onVisit(s, e, 'donor', arrival, run);
    if (!b.hearts) return 'guest-kill';
  }
  const passed = new Set(run.path.slice(0, -1));
  passed.delete(b.position);
  for (const {id: source, part} of b.barnacles) {
    for (const floor of passed) {
      const e = s.floors[floor - 1];
      if (!e) continue;
      e.defense += 2;
      emit(s, run, 'pass-defense', { source, part, floor, id: e.id, amount: 2 });
    }
  }
  for (const e of s.floors.filter(Boolean)) {
    if (e.ambush > 0) changeAmbush(s, e, -1, run);
    if (!b.hearts) return 'guest-kill';
  }
  for (const [floor, power] of attackPlan(b, run.path)) {
    hit(s, floor, power, false, run);
    if (!s.floors.some(Boolean)) return 'loss';
  }
  return turnEnd(s, run);
}

function movementResult(s, run) {
  const b = s.battle;
  const outcome = move(s, run);
  if (outcome === 'guest-kill') {
    const isLast = b.index + 1 === b.guests.length;
    if (!run.preview) {
      log(s, 'kill', { guest: b.guest.id, index: b.index, turn: b.turn });
      credit(s, b.guest.reward, b.guest.id, s.node.kind === 'boss');
      if (!isLast) enterGuest(s, b.index + 1);
    }
    return isLast ? 'win' : run.preview ? 'guest-kill' : null;
  }
  if (!outcome && !run.preview) {
    b.turn++;
    b.gainedAnxiety = 0;
    b.active = false;
    roll(s);
  }
  return outcome;
}

export function combatAction(s, cmd, args = []) {
  if (cmd === 'choose') {
    requireRule(args.length === 1, '주사위 자리 하나가 필요합니다.');
    choose(s, Number(args[0]));
    return { outcome: null };
  }
  requireRule(s.phase === 'prepare', '먼저 주사위를 선택하세요.');
  switch (cmd) {
    case 'active':
      active(s, args);
      break;
    case 'exit': {
      const floor = Number(args[0]);
      requireRule(args.length === 1 && Number.isInteger(floor) && floor >= 1 && floor <= FLOOR_COUNT, '1~10층을 선택하세요.');
      requireRule(s.battle.exit === null && !s.floors[floor - 1], '영업당 한 번, 빈층에만 출구를 놓을 수 있습니다.');
      s.battle.exit = floor;
      log(s, 'exit-install', { floor });
      break;
    }
    case 'move': {
      requireRule(args.length === 0, '이동 명령에는 인자가 없습니다.');
      return { outcome: movementResult(s, { path: [], watchers: [] }) };
    }
    default: requireRule(false, '알 수 없는 전투 명령입니다.');
  }
  return { outcome: null };
}

function simulation(s) {
  // Only clone public mutable fields actually touched by one candidate turn.
  return {
    battle: structuredClone(s.battle), floors: structuredClone(s.floors),
    phase: s.phase, dice: s.dice, node: { kind: s.node.kind },
  };
}

export function previewBattle(s, slot) {
  requireRule(s.phase === 'choose' || s.phase === 'prepare', '전투에서만 미리볼 수 있습니다.');
  const sim = simulation(s);
  const run = { preview: true, events: [], path: [], watchers: [], uncertainties: [] };
  if (sim.phase === 'choose') choose(sim, Number(slot), run);
  else requireRule(slot == null || Number(slot) === sim.battle.slot, '현재 확정한 주사위만 미리볼 수 있습니다.');
  const resolved = movementResult(sim, run);
  const bossEscape = resolved === 'escape' && sim.node.kind === 'boss';
  const outcome = bossEscape ? 'loss' : resolved;
  return {
    slot: sim.battle.slot, face: sim.battle.face, path: run.path, events: run.events,
    uncertainties: run.uncertainties, outcome, ...(bossEscape ? { reason: 'boss-escape' } : {}),
    after: { battle: sim.battle, floors: sim.floors },
  };
}

export function quickAbilities(entity) {
  return partsOf(entity)
    .map(side => ({side, type: effectType(entity, side)}))
    .filter(ability => QUICK_TYPES.has(ability.type));
}

export function availableQuickActions(s) {
  if (s.phase !== 'prepare') return [];
  const actions = [];
  const entities = s.floors.filter(Boolean);
  for (const e of entities) {
    if (e.seal) continue;
    for (const {side, type} of quickAbilities(e)) {
      const targets = TARGETED_QUICK_TYPES.has(type) ? entities : [null];
      for (const target of targets) {
        const args = [e.id, side];
        if (target) args.push(target.id);
        try {
          active(simulation(s), args, { preview: true, events: [] });
          actions.push(target ? { id: e.id, side, target: target.id } : { id: e.id, side });
        } catch (error) {
          // Candidate inputs intentionally exercise rule rejections. Unexpected programming errors must surface.
          if (!(error instanceof Error) || error instanceof TypeError || error instanceof ReferenceError) throw error;
        }
      }
    }
  }
  return actions;
}
