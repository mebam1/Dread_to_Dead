import { restoreFormation, draw, log, credit, parts, maxHp, requireRule, resetStatuses } from '../mvp_text_19/shared.mjs';

const ARRIVAL = new Set(['saint', 'choir', 'crusader', 'warPriest', 'cardinal']);
const tokenDefaults = () => ({ quick: 0, poison: 0, exhaustion: 0, rage: 0 });
const allies = s => s.floors.filter(e => e && e.hp > 0);
const enemies = s => s.battle.enemies.filter(e => e.hp > 0);
const isEnemy = e => e?.side === 'enemy';
const position = (s, e) => isEnemy(e) ? e.pos : s.floors.findIndex(a => a?.id === e.id) + 1;
const alive = (s, e) => !!e && e.hp > 0 && (isEnemy(e) || position(s, e) > 0);
const hpMax = e => isEnemy(e) ? e.maxHp : maxHp(e);
const has = (e, type) => !isEnemy(e) && parts(e).some(p => p.type === type);
const orderedEnemies = s => enemies(s);
function record(s, type, details = {}) {
  const event = log(s, type, {action:s.battle.actionCount, ...details});
  delete event.round;
  return event;
}

/** Same-row neighbors and cardinal links are calculated after displacement. */
export function adjacent(s, a, b) {
  if (!a || !b || a.id === b.id) return false;
  const x = position(s, a), y = position(s, b);
  if (x < 1 || y < 1 || isEnemy(a) || isEnemy(b)) return false;
  if (Math.abs(x - y) === 1) return true;
  return s.floors.some((c, i) => c?.hp > 0 && has(c, 'cardinal')
    && ((x === i - 1 && y === i + 3) || (y === i - 1 && x === i + 3)));
}
const neighbors = (s, e) => allies(s).filter(a => adjacent(s, e, a));
function activity(s) { if (!s.battle.suppressActivity) s.battle.activity = true; }
function addToken(s, e, token, amount, source) {
  if (!alive(s, e)) return 0;
  const before = e.tokens[token] || 0;
  e.tokens[token] = Math.max(0, Math.min(token === 'quick' ? 1 : 99, before + amount));
  const actual = e.tokens[token] - before;
  if (actual > 0) activity(s);
  record(s, 'token', { source: source?.id ?? source ?? null, target: e.id, token, before, after: e.tokens[token], amount: actual });
  return actual;
}
function heal(s, e, amount, source) {
  if (!alive(s, e)) return;
  const before = e.hp;
  e.hp = Math.min(hpMax(e), e.hp + amount);
  const side = isEnemy(e) ? 'enemy' : 'ally';
  const receipt = {target:e.id, x:position(s,e), side, requested:amount, amount:e.hp-before, hpBefore:before, hpAfter:e.hp};
  s.battle.summary[isEnemy(e) ? 'enemyHealing' : 'healing'] += receipt.amount;
  record(s, 'heal', {source:source.id, ...receipt});
  return receipt;
}
function addDefense(s, e, amount, source) {
  if (!alive(s, e)) return;
  e.defense += amount;
  record(s, 'defense', { source: source.id, target: e.id, amount, defense: e.defense });
}

class NeedChoice extends Error {
  constructor(purpose, candidates) { super(purpose); this.purpose = purpose; this.candidates = candidates; }
}
function randomTarget(s, purpose, candidates, context) {
  if (!context) return candidates[draw(s, purpose, candidates.length)];
  const index = context.cursor++;
  if (index >= context.script.length) throw new NeedChoice(purpose, candidates.map(e => e.id));
  const choice = context.script[index];
  requireRule(choice.index < candidates.length, '미리보기 분기 대상이 바뀌었습니다.');
  context.conditions.push({ purpose, index: choice.index, options: candidates.map(e => e.id), targetId: candidates[choice.index].id });
  return candidates[choice.index];
}
function removeEntity(s, e, reason) {
  if (e.removed) return;
  e.hp = 0;
  e.removed = true;
  if (isEnemy(e)) {
    e.protection = [];
    e.support = [];
    for (const other of s.battle.enemies) {
      const removedProtection = other.protection.filter(p => p.source === e.id).reduce((n, p) => n + p.amount, 0);
      const removedSupport = other.support.filter(p => p.source === e.id).length;
      other.protection = other.protection.filter(p => p.source !== e.id);
      other.support = other.support.filter(p => p.source !== e.id);
      if (removedProtection || removedSupport) record(s, 'provider-removed', { source: e.id, target: other.id, protection: removedProtection, support: removedSupport });
    }
    credit(s, 1, `kill:${e.id}`);
    const income = s.journal.at(-1);
    income.action = s.battle.actionCount;
    delete income.round;
    s.battle.summary.kills++;
    if (s.battle.summary.kills === 1) s.battle.summary.firstKillAction = s.battle.actionCount;
    if (s.battle.summary.kills === 2) s.battle.summary.secondKillAction = s.battle.actionCount;
    record(s, 'enemy-killed', { id: e.id, enemyType: e.type, reason, pos: e.pos });
    if (!enemies(s).length) s.battle.lastEnemyKilled = true;
  } else {
    const x = position(s, e);
    if (x) s.floors[x - 1] = null;
    s.battle.summary.companionLosses++;
    if (s.stats?.losses) s.stats.losses.push({ id: e.id, type: e.type, act: s.act, node: s.node.id, action:s.battle.actionCount, position: x, cause: reason });
    record(s, 'companion-lost', { id: e.id, companionType: e.type, x, reason });
  }
}
function rageOnHpLoss(s, watchers, target) {
  for (const w of watchers) if (alive(s, w)) {
    for (const part of parts(w)) if (part.type === 'warPriest') {
      record(s, 'rage-reaction', {source:w.id, part:part.key, triggerSource:target.id, x:position(s,w)});
      addToken(s, w, 'rage', 10, w);
    }
  }
}
function receiveDamage(s, target, amount, meta, ignoreDefense = false) {
  if (!alive(s, target)) return;
  // Capture who witnessed the HP-loss event before a lethal hit removes its subject.
  const watchers = isEnemy(target) ? [] : neighbors(s, target).filter(e => has(e, 'warPriest'));
  let remaining = amount, absorbed = 0;
  if (!ignoreDefense) {
    if (isEnemy(target)) {
      for (const protection of target.protection) {
        const n = Math.min(protection.amount, remaining);
        protection.amount -= n; remaining -= n; absorbed += n;
      }
      target.protection = target.protection.filter(p => p.amount > 0);
    } else {
      absorbed = Math.min(target.defense, remaining);
      target.defense -= absorbed; remaining -= absorbed;
    }
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - remaining);
  const hpLoss = before - target.hp;
  if (hpLoss) {
    activity(s);
    s.battle.summary[isEnemy(target) ? 'hpDamageDealt' : 'hpDamageTaken'] += hpLoss;
  }
  record(s, 'damage', { ...meta, target: target.id, x: position(s, target), side: isEnemy(target) ? 'enemy' : 'ally', amount, absorbed, hpBefore: before, hpAfter: target.hp, hpLoss, ignoreDefense });
  if (target.hp === 0) removeEntity(s, target, meta.label || 'damage');
  if (hpLoss) rageOnHpLoss(s, watchers, target);
}
function damage(s, target, amount, meta, bypass = false) {
  if (!alive(s, target)) return;
  let remaining = amount;
  if (!bypass && !isEnemy(target) && !has(target, 'paladin')) {
    for (const guardian of neighbors(s, target).filter(e => has(e, 'paladin'))) {
      for (const part of parts(guardian).filter(p => p.type === 'paladin')) {
        if (!remaining || !alive(s, guardian)) break;
        const quota = Math.max(0, (part.upgraded ? 50 : 30) - (guardian.guardUsed[part.key] || 0));
        const n = Math.min(quota, remaining);
        if (!n) continue;
        guardian.guardUsed[part.key] = (guardian.guardUsed[part.key] || 0) + n;
        remaining -= n;
        record(s, 'redirect', { source: guardian.id, originalTarget: target.id, part: part.key, amount: n, used: guardian.guardUsed[part.key] });
        receiveDamage(s, guardian, n, { ...meta, originalTarget: target.id, redirected: true });
      }
      if (!remaining) break;
    }
  }
  // A zero-damage instruction still has a target and has already consumed rage.
  if (remaining || amount === 0) receiveDamage(s, target, remaining, { ...meta, originalTarget: target.id }, bypass);
}
function damageContext(source, label, part = null) { return { source, label, part, rage: null, hit: 0 }; }
function hit(s, effect, target, base, extra = {}) {
  if (!alive(s, target)) return;
  if (effect.rage === null) {
    effect.rage = effect.source?.tokens.rage || 0;
    if (effect.source) effect.source.tokens.rage = 0;
    if (effect.rage) record(s, 'rage-consumed', { source: effect.source.id, part: effect.part, amount: effect.rage, label: effect.label });
  }
  damage(s, target, base + effect.rage, { source: effect.source?.id ?? null, label: effect.label, part: effect.part, base, rage: effect.rage, hit: ++effect.hit, ...extra });
}
/** Generic damage instructions; empty targets represent no damage instruction. */
export function applyDamageEffect(s, source, attacks, label = 'effect') {
  const effect = damageContext(source, label);
  for (const attack of attacks) hit(s, effect, attack.target, attack.base);
}
function attackFront(s, effect, x, base) {
  const target = enemies(s).find(enemy => enemy.pos === x);
  if (target) hit(s, effect, target, base);
  else record(s, 'miss', {source:effect.source.id, part:effect.part, label:effect.label, x, side:'enemy'});
}

function arrivalPayload(s, owner, original, copiedFrom = null, triggerPart = null) {
  const { type, upgraded, key } = original;
  const label = copiedFrom ? 'arrival-copy' : 'arrival';
  record(s, label, { source: owner.id, part: key, companionType: type, upgraded, x: position(s, owner), triggerSource: copiedFrom, triggerPart });
  const effect = damageContext(owner, label, key);
  const attack = amount => attackFront(s, effect, position(s, owner), amount);
  switch (type) {
    case 'saint': for (const ally of neighbors(s, owner)) heal(s, ally, upgraded ? 25 : 15, owner); break;
    case 'choir': attack(10); break;
    case 'crusader':
      attack(upgraded ? 40 : 20);
      addToken(s, owner, 'exhaustion', 8, owner);
      break;
    case 'warPriest': case 'cardinal': attack(upgraded ? 20 : 10); break;
  }
}
function arrivalReactions(s, owner, original, context) {
  const reactors = neighbors(s, owner);
  for (const reactor of reactors) {
    if (!alive(s, reactor)) continue;
    for (const part of parts(reactor)) {
      if (!alive(s, reactor)) break;
      if (part.type === 'squire') arrivalPayload(s, reactor, { ...original, key: part.key }, owner.id, original.key);
      if (part.type === 'holyPriest' || part.type === 'choir') {
        record(s, 'reaction', {source:reactor.id, part:part.key, companionType:part.type, triggerSource:owner.id, triggerPart:original.key, x:position(s,reactor)});
      }
      if (part.type === 'holyPriest') {
        const candidates = neighbors(s, reactor);
        if (candidates.length) {
          const target = randomTarget(s, '신성사제대상', candidates, context);
          record(s, 'random-target', { source: reactor.id, part: part.key, target: target.id, purpose: '신성사제대상', candidates: candidates.map(e => e.id) });
          addDefense(s, target, part.upgraded ? 20 : 10, reactor);
        }
      }
      if (part.type === 'choir') {
        attackFront(s, damageContext(reactor, 'choir-reaction', part.key), position(s, owner), part.upgraded ? 20 : 10);
      }
    }
  }
}
function nearestPoison(s, owner) {
  const x = position(s, owner);
  const candidates = [...allies(s), ...enemies(s)].filter(e => e.tokens.poison > 0).map(e => {
    const px = position(s, e), y = isEnemy(e) ? 1 : 0;
    return { e, x: px, y, distance: Math.abs(x - px) + y, enemy: Number(isEnemy(e)) };
  });
  candidates.sort((a, b) => a.distance - b.distance || a.enemy - b.enemy || a.x - b.x || a.y - b.y || a.e.id.localeCompare(b.e.id));
  return candidates[0]?.e;
}
function passPayload(s, owner, original, mover) {
  const { type, upgraded, key } = original;
  if (type === 'sprayer' || type === 'gourmet') {
    record(s, 'pass-effect', {source:owner.id, part:key, companionType:type, triggerSource:mover.id, x:position(s,owner)});
  }
  if (type === 'sprayer') {
    const frontX = position(s, owner);
    for (const x of [frontX, frontX - 1]) {
      if (x < 1) continue;
      const before = s.battle.gas[1][x-1];
      const after = Math.min(99, before + (upgraded ? 10 : 6));
      s.battle.gas[1][x-1] = after;
      if (after > before) activity(s);
      record(s, 'gas-installed', {source: owner.id, part: key, x, y: 1, before, after});
    }
  }
  if (type === 'gourmet') {
    const effect = damageContext(owner, 'gourmet', key);
    for (let repeat = 0; repeat < (upgraded ? 2 : 1); repeat++) {
      const target = nearestPoison(s, owner);
      if (!target) continue;
      const amount = target.tokens.poison;
      target.tokens.poison = 0;
      record(s, 'poison-eaten', { source: owner.id, part: key, target: target.id, amount, repeat: repeat + 1 });
      attackFront(s, effect, position(s, owner), amount * 10);
    }
  }
}
export function absorbGas(s, entity, x = position(s, entity)) {
  const y = isEnemy(entity) ? 1 : 0;
  const amount = s.battle.gas[y][x - 1];
  if (!amount) return;
  s.battle.gas[y][x - 1] = 0;
  addToken(s, entity, 'poison', amount, 'gas');
  record(s, 'gas-absorbed', {target: entity.id, x, y, amount});
}

// Resolve pass effects before exchanging the two occupancies.
function step(s, mover, x, arrival) {
  const enemy = isEnemy(mover);
  const from = position(s, mover);
  const displaced = enemy ? enemies(s).find(e => e.pos === x) : s.floors[x - 1];
  if (enemy && x === s.battle.exit) {
    record(s, 'exit-contact', {source: mover.id, x});
    return endOutcome(s, s.node.kind === 'boss' ? 'loss' : 'escape', 'exit');
  }
  absorbGas(s, mover, x);
  if (!enemy && displaced && !arrival) {
    for (const original of parts(displaced)) {
      if (s.battle.lastEnemyKilled) break;
      passPayload(s, displaced, original, mover);
    }
  }
  if (enemy) {
    if (displaced) {
      displaced.pos = from;
      if (displaced.pattern === 'patrol' && (from === 1 || from === 10)) {
        displaced.direction = from === 1 ? 'right' : 'left';
      }
    }
    mover.pos = x;
  } else {
    s.floors[from - 1] = displaced;
    s.floors[x - 1] = mover;
  }
  if (displaced) record(s, 'push', {source: mover.id, target: displaced.id, from: x, to: from, arrival});
  const nearby = {};
  if (!enemy && arrival) {
    nearby.neighbors = neighbors(s, mover).map(e => e.id);
    if (has(mover, 'cardinal') && x >= 3 && x <= 8) {
      nearby.bridge = [x - 2, x + 2].map(tile => ({x:tile, id:s.floors[tile - 1]?.id ?? null}));
    }
  }
  record(s, 'visit', {source: mover.id, side: enemy ? 'enemy' : 'ally', from, x, kind: arrival ? 'arrival' : 'pass', ...nearby});
}

function linePath(from, to) {
  const step = Math.sign(to - from);
  return Array.from({length:Math.abs(to - from)}, (_, i) => from + (i + 1) * step);
}

function travelDirection(from, to) {
  if (from === to) return null;
  return to < from ? 'left' : 'right';
}

function patrolPath(enemy) {
  const path = [];
  let x = enemy.pos;
  let direction = enemy.direction;
  for (let n = 0; n < 3; n++) {
    if (x === 1) direction = 'right';
    if (x === 10) direction = 'left';
    x += direction === 'left' ? -1 : 1;
    path.push(x);
  }
  return path;
}

// Candidates are originally in formation order. Sorting is stable when the
// distances and coordinates match. Only living entities can guide an action.
function planAction(s, enemy) {
  const from = enemy.pos;
  if (enemy.pattern === 'patrol') {
    const path = patrolPath(enemy);
    return {path, to:path.at(-1), targetId:null};
  }
  const medic = enemy.pattern === 'medic';
  const candidates = medic ? enemies(s).filter(e => e !== enemy) : allies(s);
  const tiles = candidates.map(e => ({id:e.id, x:position(s,e)}));
  tiles.sort((a,b) => {
    const difference = Math.abs(a.x - from) - Math.abs(b.x - from);
    return (medic ? -difference : difference) || a.x - b.x;
  });
  const target = tiles[0];
  const to = target?.x ?? from;
  return {path:linePath(from,to), to, targetId:target?.id ?? null};
}

function strike(s, enemy, action, effect, x) {
  const support = enemy.support.length * 2;
  if (!action.hits.length) action.firstHitBonus = support;
  enemy.support = [];
  if (support) record(s, 'support-consumed', {source:enemy.id, amount:support, x});
  const target = s.floors[x - 1];
  const before = s.journal.length;
  if (target) hit(s, effect, target, enemy.attack + support, {attack:enemy.attack, support, x});
  else record(s, 'miss', {source:enemy.id, label:'counterattack', side:'ally', x, support});
  const damage = s.journal.slice(before).filter(event => event.type === 'damage').map(event => ({
    target:event.target, x:event.x, side:event.side, amount:event.amount, absorbed:event.absorbed,
    hpLoss:event.hpLoss, hpBefore:event.hpBefore, hpAfter:event.hpAfter, redirected:!!event.redirected
  }));
  action.positions.push(x);
  action.hits.push({x, targetId:target?.id ?? null, damage});
}

function attack(s, enemy) {
  const b = s.battle;
  const from = enemy.pos;
  const {pattern} = enemy;
  const plan = planAction(s, enemy);
  const effect = damageContext(enemy, 'counterattack');
  const action = record(s, 'counterattack', {
    source:enemy.id, pattern, order:b.enemies.indexOf(enemy) + 1,
    x:from, from, to:plan.to, actualTo:from, targetId:plan.targetId,
    direction:travelDirection(from,plan.path[0] ?? from),
    nextDirection:pattern === 'patrol' ? enemy.direction : null,
    attack:enemy.attack, power:enemy.attack, healing:enemy.healing ?? 0,
    path:[], hits:[], positions:[], heals:[], firstHitBonus:0, exitAt:null
  });
  for (const [i,x] of plan.path.entries()) {
    const direction = travelDirection(enemy.pos,x);
    action.path.push(x);
    const outcome = step(s, enemy, x, i === plan.path.length - 1);
    if (outcome) {
      action.exitAt = x;
      return outcome;
    }
    action.actualTo = x;
    if (pattern === 'patrol') {
      enemy.direction = x === 1 ? 'right' : x === 10 ? 'left' : direction;
      action.nextDirection = enemy.direction;
      strike(s, enemy, action, effect, x);
      if (!allies(s).length) break;
    }
  }

  if (pattern === 'vanguard') strike(s, enemy, action, effect, enemy.pos);
  if (pattern === 'sweep') {
    for (const x of [enemy.pos - 1, enemy.pos, enemy.pos + 1]) {
      if (!allies(s).length) break;
      if (x >= 1 && x <= 10) strike(s, enemy, action, effect, x);
    }
  }
  if (pattern === 'medic') {
    const nearby = enemies(s).filter(e => Math.abs(e.pos - enemy.pos) === 1).sort((a,b) => a.pos - b.pos);
    for (const ally of nearby) action.heals.push(heal(s, ally, enemy.healing, enemy));
  }
  enemy.attacks++;
  enemy.counter = enemy.period;
  action.resetTo = enemy.counter;
}

function endOutcome(s, outcome, reason) {
  if (s.battle.ended) return { outcome: s.battle.outcome };
  s.battle.ended = true;
  s.battle.outcome = outcome;
  s.battle.summary.actions = s.battle.actionCount;
  record(s, 'outcome', { outcome, reason, summary: structuredClone(s.battle.summary) });
  return { outcome };
}
function settleStatuses(s, context) {
  const b = s.battle;
  for (const e of [...orderedEnemies(s), ...allies(s)]) {
    if (!alive(s, e)) continue;
    const poison = e.tokens.poison;
    if (poison > 0) {
      damage(s, e, poison, { source: null, label: 'poison', base: poison, rage: 0, row: null, hit: 1 });
      e.tokens.poison = Math.max(0, e.tokens.poison - 1);
    }
  }
  for (const e of [...orderedEnemies(s), ...allies(s)]) {
    if (e.tokens.exhaustion >= hpMax(e)) removeEntity(s, e, 'exhaustion');
  }
  for (const row of b.gas) for (let x = 0; x < 10; x++) row[x] = Math.max(0, row[x] - 1);
  if (allies(s).length && enemies(s).length) {
    if (b.activity) { b.inactiveCount = 0; b.inactiveThreshold = 9; }
    else {
      b.inactiveCount++;
      if (b.inactiveCount >= b.inactiveThreshold) {
        const target = randomTarget(s, '비활동표적', allies(s), context);
        b.inactiveCount = 0; b.inactiveThreshold = 6;
        b.suppressActivity = true;
        record(s, 'inactivity-penalty', { target: target.id, amount: 10 });
        damage(s, target, 10, { source: null, label: 'inactivity', base: 10, rage: 0, row: null, hit: 1 }, true);
        b.suppressActivity = false;
      }
    }
  }
  b.summary.actions = b.actionCount;
  b.lastActivity = b.activity;
  record(s, 'action-end', { activity:b.activity, inactiveCount:b.inactiveCount, inactiveThreshold:b.inactiveThreshold,
    allies:allies(s).map(e => ({id:e.id, hp:e.hp})), enemies:enemies(s).map(e => ({id:e.id, hp:e.hp, counter:e.counter})) });
  b.activity = false;
  if (!allies(s).length) return endOutcome(s, 'loss', 'no-companions');
  if (!enemies(s).length) return endOutcome(s, 'win', 'all-enemies-killed');
}
function supportTarget(s, provider) { return orderedEnemies(s).find(e => e.id !== provider.id) || provider; }
function refreshCompanions(s) {
  for (const e of allies(s)) {
    if (!has(e,'paladin') && !has(e,'toxicHealer')) continue;
    if (e.nextRefreshAction > s.battle.actionCount) continue;
    e.nextRefreshAction = s.battle.actionCount + 3;
    e.guardUsed = {A: 0, B: 0};
    if (has(e, 'toxicHealer')) e.tokens.quick = 1;
    record(s, 'ability-ready', {source:e.id, nextRefreshAction:e.nextRefreshAction});
    for (const part of parts(e)) if (part.type === 'paladin') addDefense(s, e, part.upgraded ? 15 : 10, e);
  }
}
function refreshSupport(s) {
  const living = enemies(s);
  for (const e of living) if (e.role === 'support') {
    if (living.some(other => other.support.some(p => p.source === e.id))) continue;
    const target = supportTarget(s, e);
    target.support.push({source: e.id});
    record(s, 'support-granted', {source: e.id, target: target.id});
  }
}
function resolveAfterMove(s, context) {
  refreshSupport(s);
  const living = enemies(s);
  if (living.length) {
    const counters = [];
    for (const enemy of living) {
      const before = enemy.counter;
      enemy.counter -= 1;
      counters.push({id:enemy.id, before, after:enemy.counter});
    }
    record(s,'counters-ticked',{counters});
  }
  for (const e of living) if (e.counter === 0 && allies(s).length) {
    const outcome = attack(s, e);
    if (outcome) return outcome;
    refreshSupport(s);
  }
  const outcome = settleStatuses(s, context);
  if (outcome) return outcome;
  refreshSupport(s);
  refreshCompanions(s);
}

// Conditional on the present formation. Replay the real ordered enemy actions
// (including displacement, exit contact and deaths) up to each first due action.
// Future player choices and their inactivity penalties cannot be known yet.
export function forecastEnemyIntents(s) {
  const intents = new Map();
  const living = enemies(s);
  for (const e of living) {
    intents.set(e.id, {
      pattern:e.pattern, order:s.battle.enemies.indexOf(e) + 1, power:e.attack, healing:e.healing ?? 0,
      counter:e.counter, afterActions:e.counter, action:s.battle.actionCount + e.counter,
      from:e.pos, to:e.pos, actualTo:e.pos,
      targetId:null, direction:null, nextDirection:e.direction ?? null,
      conditional:true, positions:[], path:[], hits:[], heals:[], firstHitBonus:0, interrupted:true, exitAt:null
    });
  }
  if (!living.length || s.battle.ended) return intents;
  const shadow = structuredClone({
    act:s.act, coins:s.coins, node:s.node, floors:s.floors, battle:s.battle, journal:[], stats:{losses:[]}
  });
  const horizon = Math.max(...living.map(e => e.counter));
  requireRule(Number.isSafeInteger(horizon) && horizon > 0, '적 행동 카운터가 올바르지 않습니다.');
  for (let n = 0; n < horizon && !shadow.battle.ended; n++) {
    shadow.battle.activity = true;
    shadow.battle.actionCount++;
    shadow.journal.length = 0;
    resolveAfterMove(shadow);
    for (const event of shadow.journal) {
      if (event.type !== 'counterattack') continue;
      const intent = intents.get(event.source);
      if (!intent.interrupted) continue;
      Object.assign(intent, {
        from:event.from, to:event.to, actualTo:event.actualTo, targetId:event.targetId,
        direction:event.direction, nextDirection:event.nextDirection, interrupted:false,
        path:event.path, positions:event.positions, hits:event.hits, heals:event.heals,
        firstHitBonus:event.firstHitBonus, exitAt:event.exitAt
      });
    }
  }
  return intents;
}

export function startBattle(s) {
  requireRule(s.node?.enemies?.length, '전투 노드가 아닙니다.');
  requireRule(allies(s).length, '생존 동료가 없습니다.');
  resetStatuses(s);
  s.battle = {
    actionCount:0,
    enemies: s.node.enemies.map((template, index) => {
      const pos = [2,5,8][index];
      return {
        ...structuredClone(template), id:`E${index + 1}`, side:'enemy', pos,
        direction:template.pattern === 'patrol' ? (pos <= 5 ? 'right' : 'left') : null,
        counter:template.firstCounter, attacks:0, hp:template.maxHp,
        tokens:tokenDefaults(), protection:[], support:[], removed:false
      };
    }),
    gas: Array.from({ length: 2 }, () => Array(10).fill(0)), exit: null,
    inactiveCount:0, inactiveThreshold:9, activity:false, ended:false, lastEnemyKilled:false,
    summary: { actions:0, kills:0, companionLosses:0, hpDamageDealt:0, hpDamageTaken:0, healing:0, enemyHealing:0, firstKillAction:null, secondKillAction:null },
    startAllies: allies(s).map(e => ({ id: e.id, type: e.type, fusion: structuredClone(e.fusion), x: position(s, e), hp: e.hp, maxHp: hpMax(e) }))
  };
  for (let i = 0; i < s.battle.enemies.length; i++) {
    const e = s.battle.enemies[i], amount = s.node.enemies[i].protection || 0;
    if (amount) {
      const target = supportTarget(s, e);
      target.protection.push({ source: e.id, amount });
      record(s, 'protection-granted', { source: e.id, target: target.id, amount });
    }
  }
  record(s, 'battle-start', { node: s.node.id, act: s.act, allies: s.battle.startAllies, enemies: structuredClone(s.battle.enemies) });
  s.phase = 'prepare';
  for (const ally of allies(s)) delete ally.nextRefreshAction;
  refreshCompanions(s);
  refreshSupport(s);
}
export function availableQuickActions(s) {
  if (s.phase !== 'prepare' || !s.battle || s.battle.ended || s.battle.lastEnemyKilled) return [];
  const actions = [];
  for (const owner of allies(s)) if (owner.tokens.quick > 0) {
    for (const part of parts(owner)) if (part.type === 'toxicHealer') {
      for (const target of neighbors(s, owner)) actions.push({ id: owner.id, part: part.key, targetId: target.id, cost: 1, poison: part.upgraded ? 5 : 4, heal: part.upgraded ? 25 : 20 });
    }
  }
  return actions;
}
function movePlan(s, id, destination) {
  const mover = allies(s).find(e => e.id === id);
  requireRule(mover, '이동할 생존 동료 ID를 선택하세요.');
  requireRule(Number.isInteger(destination) || (typeof destination === 'string' && /^(?:[1-9]|10)$/.test(destination)),
    '목적지 번호는 1~10 중 정수여야 합니다.');
  const from = position(s, mover), to = Number(destination);
  requireRule(to >= 1 && to <= 10, '목적지는 전장 안의 1~10번 칸입니다.');
  requireRule(to !== from, '출발 칸과 다른 목적지를 선택하세요.');
  return {from, to, direction:travelDirection(from,to), distance:Math.abs(to-from)};
}

function executeMove(s, id, plan, context) {
  const b = s.battle, mover = s.floors[plan.from - 1];
  b.actionCount++;
  const drop = record(s, 'drop', {source:id, ...plan, actualTo:plan.from});
  for (const x of linePath(plan.from, plan.to)) {
    step(s, mover, x, x === plan.to);
    drop.actualTo = x;
    if (b.lastEnemyKilled) break;
    if (x === plan.to) for (const original of parts(mover)) {
      if (b.lastEnemyKilled) break;
      if (ARRIVAL.has(original.type)) {
        arrivalPayload(s,mover,original);
        arrivalReactions(s,mover,original,context);
      }
    }
  }
  return resolveAfterMove(s, context);
}
export function combatAction(s, cmd, args = []) {
  requireRule(s.battle && !s.battle.ended, '진행 중인 전투가 없습니다.');
  requireRule(s.phase === 'prepare', '유저 차례에 사용할 수 있습니다.');
  if (cmd === 'active') {
    const [id, key, targetId] = args;
    const action = availableQuickActions(s).find(a => a.id === id && a.part === key && a.targetId === targetId);
    requireRule(action, '속공 주체·원본·대상 또는 속공 비용이 유효하지 않습니다.');
    const owner = allies(s).find(e => e.id === id), target = allies(s).find(e => e.id === targetId);
    owner.tokens.quick--;
    record(s, 'quick-cost', { source: id, part: key, token: 'quick', amount: 1, target: targetId });
    addToken(s, target, 'poison', action.poison, owner); heal(s, target, action.heal, owner);
    return;
  }
  if (cmd === 'exit') {
    const x = Number(args[0]);
    requireRule(Number.isInteger(x) && x >= 1 && x <= 10 && !s.floors[x - 1], '철수 지점은 1~10 중 빈 지점이어야 합니다.');
    requireRule(s.battle.exit === null, '철수 지점은 전투당 한 번만 설치할 수 있습니다.');
    s.battle.exit = x; record(s, 'exit-placed', { x }); return;
  }
  requireRule(cmd === 'move', `알 수 없는 전투 명령: ${cmd}`);
  requireRule(args.length === 2, '이동할 동료 ID와 목적지 번호를 선택하세요.');
  return executeMove(s, args[0], movePlan(s,args[0],args[1]));
}

function projection(s, outcome, events, conditions) {
  const intents = outcome ? new Map() : forecastEnemyIntents(s);
  if (outcome) {
    restoreFormation(s);
    resetStatuses(s);
    s.battle.inactiveThreshold = 9;
    for (const ally of allies(s)) delete ally.nextRefreshAction;
  }
  return {
    conditions, outcome: outcome || null, events, actionCount:s.battle.actionCount, coins: s.coins,
    allies: allies(s).map(e => ({ id: e.id, type: e.type, x: position(s, e), hp: e.hp, maxHp: hpMax(e), defense: e.defense,
      nextRefreshAction:e.nextRefreshAction ?? null, guardUsed:structuredClone(e.guardUsed), tokens:structuredClone(e.tokens) })),
    enemies: s.battle.enemies.map(e => ({ id: e.id, type: e.type, pos: e.pos, direction:e.direction,
      counter:e.counter, attacks:e.attacks, nextPattern:e.pattern,
      intent:intents.get(e.id) ?? null, hp: e.hp, maxHp: e.maxHp, tokens: structuredClone(e.tokens), protection: structuredClone(e.protection), support: structuredClone(e.support) })),
    gas:structuredClone(s.battle.gas), activity:s.battle.lastActivity ?? s.battle.activity,
    inactiveCount: s.battle.inactiveCount, inactiveThreshold: s.battle.inactiveThreshold,
    summary: structuredClone(s.battle.summary)
  };
}
/** Enumerates conditional random branches without consuming or consulting real RNG. */
export function previewBattle(s, id, destination) {
  requireRule(s.phase === 'prepare' && s.battle && !s.battle.ended, '유저 차례에 미리보기를 사용할 수 있습니다.');
  const plan = movePlan(s, id, destination);
  const pending = [[]], scenarios = [], uncertainties = new Set();
  let attempts = 0;
  while (pending.length && scenarios.length < 64 && attempts++ < 1024) {
    const script = pending.pop();
    const clone = structuredClone({ ...s, journal: [] });
    // Enumerate random effects through the next input boundary independently of the real RNG.
    clone.rng = {};

    const context = { script, cursor: 0, conditions: [] };
    try {
      const result = executeMove(clone, id, plan, context);
      scenarios.push(projection(clone, result?.outcome, structuredClone(clone.journal), context.conditions));
    } catch (error) {
      if (!(error instanceof NeedChoice)) throw error;
      uncertainties.add(error.purpose);
      for (let i = error.candidates.length - 1; i >= 0; i--) pending.push([...script, { index: i }]);
    }
  }
  return { companion:id, ...plan, complete:pending.length === 0, uncertainties:[...uncertainties], scenarios, limit:64 };
}
