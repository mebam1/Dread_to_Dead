import { restoreFormation, attackPower, draw, log, credit, parts, maxHp, requireRule, resetStatuses, rollPlayerDice } from './shared.mjs';

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
const record = (s, type, details = {}) => log(s, type, { round: s.battle?.round, ...details });

/** The board is linear. Movement wraps; adjacency and offset attacks stay linear. */
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
  s.battle.summary.healing += e.hp - before;
  record(s, 'heal', { source: source.id, target: e.id, amount: e.hp - before, hpBefore: before, hpAfter: e.hp });
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
    s.battle.summary.kills++;
    if (s.battle.summary.kills === 1) s.battle.summary.firstKillRound = s.battle.round;
    if (s.battle.summary.kills === 2) s.battle.summary.secondKillRound = s.battle.round;
    record(s, 'enemy-killed', { id: e.id, enemyType: e.type, reason, pos: e.pos });
    if (!enemies(s).length) s.battle.lastEnemyKilled = true;
  } else {
    const x = position(s, e);
    if (x) s.floors[x - 1] = null;
    s.battle.summary.companionLosses++;
    if (s.stats?.losses) s.stats.losses.push({ id: e.id, type: e.type, act: s.act, node: s.node.id, round: s.battle.round, position: x, cause: reason });
    record(s, 'companion-lost', { id: e.id, companionType: e.type, x, reason });
  }
}
function rageOnHpLoss(s, watchers) {
  for (const w of watchers) if (alive(s, w)) {
    for (const part of parts(w)) if (part.type === 'warPriest') addToken(s, w, 'rage', 10, w);
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
  record(s, 'damage', { ...meta, target: target.id, side: isEnemy(target) ? 'enemy' : 'ally', amount, absorbed, hpBefore: before, hpAfter: target.hp, hpLoss, ignoreDefense });
  if (target.hp === 0) removeEntity(s, target, meta.label || 'damage');
  if (hpLoss) rageOnHpLoss(s, watchers);
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
  damage(s, target, base + effect.rage, { source: effect.source?.id ?? null, label: effect.label, part: effect.part, base, rage: effect.rage, turn: s.battle.turn, hit: ++effect.hit, ...extra });
}
/** Generic damage instructions; empty targets represent no damage instruction. */
export function applyDamageEffect(s, source, attacks, label = 'effect') {
  const effect = damageContext(source, label);
  for (const attack of attacks) hit(s, effect, attack.target, attack.base);
}
function front(s, e) { const x = position(s, e); return orderedEnemies(s).filter(n => n.pos === x); }
function aoe(s, e, base, effect) { for (const enemy of front(s, e)) hit(s, effect, enemy, base); }

function arrivalPayload(s, owner, original, context, copied = false) {
  const { type, upgraded, key } = original;
  const label = copied ? 'arrival-copy' : 'arrival';
  record(s, label, { source: owner.id, part: key, companionType: type, upgraded, x: position(s, owner) });
  const effect = damageContext(owner, label, key);
  const attack = amount => aoe(s, owner, amount, effect);
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
      if (part.type === 'squire') arrivalPayload(s, reactor, { ...original, key: part.key }, context, true);
      if (part.type === 'holyPriest') {
        const candidates = neighbors(s, reactor);
        if (candidates.length) {
          const target = randomTarget(s, '신성사제대상', candidates, context);
          record(s, 'random-target', { source: reactor.id, part: part.key, target: target.id, purpose: '신성사제대상', candidates: candidates.map(e => e.id) });
          addDefense(s, target, part.upgraded ? 20 : 10, reactor);
        }
      }
      if (part.type === 'choir') {
        const target = front(s, owner)[0];
        hit(s, damageContext(reactor, 'choir-reaction', part.key), target, part.upgraded ? 20 : 10);
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
function passPayload(s, owner, original) {
  const { type, upgraded, key } = original;
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
      aoe(s, owner, amount * 10, effect);
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

// Resolve pass effects at the encountered square before moving its occupant left.
function step(s, mover, arrival) {
  const enemy = isEnemy(mover);
  const from = position(s, mover), x = from % 10 + 1;
  const displaced = enemy ? enemies(s).find(e => e.pos === x) : s.floors[x - 1];
  if (enemy && x === s.battle.exit) {
    record(s, 'exit-contact', {source: mover.id, x});
    return endOutcome(s, s.node.kind === 'boss' ? 'loss' : 'escape', 'exit');
  }
  absorbGas(s, mover, x);
  if (!enemy && displaced && !arrival) {
    for (const original of parts(displaced)) {
      if (s.battle.lastEnemyKilled) break;
      passPayload(s, displaced, original);
    }
  }
  if (enemy) {
    if (displaced) displaced.pos = from;
    mover.pos = x;
  } else {
    s.floors[from - 1] = displaced;
    s.floors[x - 1] = mover;
  }
  if (displaced) record(s, 'push', {source: mover.id, target: displaced.id, from: x, to: from, arrival});
  record(s, 'visit', {source: mover.id, side: enemy ? 'enemy' : 'ally', from, x, kind: arrival ? 'arrival' : 'pass'});
}

export function nextPattern(enemy) {
  if (enemy.pattern === 'alternate') return enemy.attacks % 2 ? 'mirror' : 'double';
  if (enemy.type === 'D' && enemy.attacks % 2) return 'strikeMove';
  return enemy.pattern;
}

export function enemyIntent(round, enemy) {
  const pattern = nextPattern(enemy), x = enemy.pos;
  const moves = pattern === 'path' || pattern === 'strikeMove';
  const path = moves ? [1,2,3].map(offset => (x + offset - 1) % 10 + 1) : [];
  const deferred = pattern === 'path' && 10 - x < 3;
  const targets = {strikeMove:[x], double:[x,x], mirror:[x-2,x+2], neighbor:[x-1,x], path:deferred ? [] : path};
  return {pattern, power:attackPower(pattern,enemy.strong), counter:Math.max(0,enemy.nextAttack-round),
    path, positions:targets[pattern].filter(tile => tile >= 1 && tile <= 10), deferred};
}

function attack(s, enemy) {
  const b = s.battle, x = enemy.pos;
  const {pattern, power, positions, deferred} = enemyIntent(b.round, enemy);
  const effect = damageContext(enemy, 'counterattack');
  function strike(tile) {
    if (tile < 1 || tile > 10 || !allies(s).length) return;
    const support = enemy.support.length * 2;
    enemy.support = [];
    if (support) record(s, 'support-consumed', {source: enemy.id, amount: support, x: tile});
    if (s.floors[tile - 1]) hit(s, effect, s.floors[tile - 1], power + support, {attack: power, support, x: tile});
    else record(s, 'miss', {source: enemy.id, x: tile, support});
  }
  record(s, deferred ? 'path-deferred' : 'counterattack', {source: enemy.id, pattern, x, positions, attack: power});
  if (pattern === 'path' || pattern === 'strikeMove') {
    if (pattern === 'strikeMove') strike(x);
    for (let n = 1; n <= 3 && allies(s).length; n++) {
      const outcome = step(s, enemy, n === 3);
      if (outcome) return outcome;
      if (pattern === 'path' && !deferred) strike(enemy.pos);
    }
  } else {
    for (const tile of positions) strike(tile);
  }
  if (!deferred) enemy.attacks++;
  enemy.nextAttack = b.round + (deferred ? 1 : enemy.period);
  if (!allies(s).length) return endOutcome(s, 'loss', 'no-companions');
}

function endOutcome(s, outcome, reason) {
  if (s.battle.ended) return { outcome: s.battle.outcome };
  s.battle.ended = true;
  s.battle.outcome = outcome;
  s.battle.summary.rounds = s.battle.round;
  record(s, 'outcome', { outcome, reason, summary: structuredClone(s.battle.summary) });
  return { outcome };
}
function endRound(s, context) {
  const b = s.battle;
  if (b.ending) return b.ended ? { outcome: b.outcome } : undefined;
  b.ending = true;
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
  for (const e of enemies(s)) e.support = [];
  if (allies(s).length && enemies(s).length) {
    if (b.activity) { b.inactiveCount = 0; b.inactiveThreshold = 3; }
    else {
      b.inactiveCount++;
      if (b.inactiveCount >= b.inactiveThreshold) {
        const target = randomTarget(s, '비활동표적', allies(s), context);
        b.inactiveCount = 0; b.inactiveThreshold = 2;
        b.suppressActivity = true;
        record(s, 'inactivity-penalty', { target: target.id, amount: 10 });
        damage(s, target, 10, { source: null, label: 'inactivity', base: 10, rage: 0, row: null, hit: 1 }, true);
        b.suppressActivity = false;
      }
    }
  }
  b.summary.rounds = b.round;
  record(s, 'round-end', { activity: b.activity, inactiveCount: b.inactiveCount, inactiveThreshold: b.inactiveThreshold, allies: allies(s).map(e => ({ id: e.id, hp: e.hp })), enemies: enemies(s).map(e => ({ id: e.id, hp: e.hp })) });
  if (!allies(s).length) return endOutcome(s, 'loss', 'no-companions');
  if (!enemies(s).length) return endOutcome(s, 'win', 'all-enemies-killed');
}
function supportTarget(s, provider) { return orderedEnemies(s).find(e => e.id !== provider.id) || provider; }
function roundStart(s) {
  const b = s.battle;
  b.activity = false;
  b.ending = false;
  b.turn = 1;
  record(s, 'round-start', {round: b.round});
  for (const e of allies(s)) {
    e.guardUsed = {A: 0, B: 0};
    if (has(e, 'toxicHealer')) e.tokens.quick = 1;
    for (const part of parts(e)) if (part.type === 'paladin') addDefense(s, e, part.upgraded ? 15 : 10, e);
  }
  for (const e of enemies(s)) if (e.role === 'support') {
    const target = supportTarget(s, e);
    target.support.push({source: e.id});
    record(s, 'support-granted', {source: e.id, target: target.id});
  }
  for (const e of enemies(s)) if (e.nextAttack === b.round) {
    const outcome = attack(s, e);
    if (outcome) return outcome;
  }
}
function roll(s) {
  s.battle.dice = rollPlayerDice(s);
  record(s, 'player-roll', {turn: s.battle.turn, dice: [...s.battle.dice]});
}

export function startBattle(s) {
  requireRule(s.node?.enemies?.length, '전투 노드가 아닙니다.');
  requireRule(allies(s).length, '생존 동료가 없습니다.');
  resetStatuses(s);
  s.battle = {
    round: 1, turn: 1, dice: [],
    enemies: s.node.enemies.map((template, index) => ({ ...structuredClone(template), id: `E${index + 1}`, side: 'enemy', pos: [2,5,8][index], nextAttack: 1 + template.firstCounter, attacks: 0, hp: template.maxHp, tokens: tokenDefaults(), protection: [], support: [], removed: false })),
    gas: Array.from({ length: 2 }, () => Array(10).fill(0)), exit: null,
    inactiveCount: 0, inactiveThreshold: 3, activity: false, ended: false, ending: false, lastEnemyKilled: false,
    summary: { rounds: 0, kills: 0, companionLosses: 0, hpDamageDealt: 0, hpDamageTaken: 0, healing: 0, firstKillRound: null, secondKillRound: null },
    startAllies: allies(s).map(e => ({ id: e.id, type: e.type, x: position(s, e), hp: e.hp, maxHp: hpMax(e) }))
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
  roundStart(s);
  roll(s);
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
function dieAtSlot(dice, slot) {
  requireRule((Number.isInteger(slot) || (typeof slot === 'string' && /^[1-3]$/.test(slot))) &&
    slot >= 1 && slot <= dice.length, '사용할 주사위 번호를 1~3 중에서 선택하세요.');
  return dice[Number(slot) - 1];
}

function executeMove(s, id, slot, context) {
  const b = s.battle, mover = allies(s).find(e => e.id === id);
  requireRule(mover, '이동할 생존 동료 ID를 선택하세요.');
  const die = dieAtSlot(b.dice, slot);
  record(s, 'drop', {source: id, slot: Number(slot), die, from: position(s,mover), turn: b.turn});
  for (let n = 1; n <= die; n++) {
    step(s, mover, n === die);
    if (b.lastEnemyKilled) break;
    if (n === die) for (const original of parts(mover)) {
      if (b.lastEnemyKilled) break;
      if (ARRIVAL.has(original.type)) {
        arrivalPayload(s,mover,original,context);
        arrivalReactions(s,mover,original,context);
      }
    }
  }
  if (b.lastEnemyKilled || b.turn === 3) {
    const result = endRound(s,context);
    if (result) return result;
    b.round++;
    return roundStart(s);
  }
  b.turn++;
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
  const result = executeMove(s, args[0], args[1]);
  if (!result) roll(s);
  return result;
}

function projection(s, outcome, events, conditions) {
  if (outcome) { restoreFormation(s); resetStatuses(s); }
  return {
    conditions, outcome: outcome || null, events, round: s.battle.round, coins: s.coins,
    allies: allies(s).map(e => ({ id: e.id, type: e.type, x: position(s, e), hp: e.hp, maxHp: hpMax(e), defense: e.defense, tokens: structuredClone(e.tokens) })),
    enemies: s.battle.enemies.map(e => ({ id: e.id, type: e.type, pos: e.pos, counter: Math.max(0,e.nextAttack-s.battle.round), attacks: e.attacks, nextPattern: nextPattern(e), hp: e.hp, maxHp: e.maxHp, tokens: structuredClone(e.tokens), protection: structuredClone(e.protection), support: structuredClone(e.support) })),
    gas: structuredClone(s.battle.gas), activity: s.battle.activity,
    inactiveCount: s.battle.inactiveCount, inactiveThreshold: s.battle.inactiveThreshold,
    summary: structuredClone(s.battle.summary)
  };
}
/** Enumerates conditional random branches without consuming or consulting real RNG. */
export function previewBattle(s, id, slot) {
  requireRule(s.phase === 'prepare' && s.battle && !s.battle.ended, '유저 차례에 미리보기를 사용할 수 있습니다.');
  requireRule(allies(s).some(e => e.id === id), '미리보기할 동료 ID가 필요합니다.');
  const die = dieAtSlot(s.battle.dice, slot);
  const pending = [[]], scenarios = [], uncertainties = new Set();
  let attempts = 0;
  while (pending.length && scenarios.length < 64 && attempts++ < 1024) {
    const script = pending.pop();
    const clone = structuredClone({ ...s, journal: [] });
    // Resolve known automatic effects through the next input boundary, without rolling the next die.
    clone.rng = {};

    const context = { script, cursor: 0, conditions: [] };
    try {
      const result = executeMove(clone, id, slot, context);
      scenarios.push(projection(clone, result?.outcome, structuredClone(clone.journal), context.conditions));
    } catch (error) {
      if (!(error instanceof NeedChoice)) throw error;
      uncertainties.add(error.purpose);
      for (let i = error.candidates.length - 1; i >= 0; i--) pending.push([...script, { index: i }]);
    }
  }
  return { companion: id, slot: Number(slot), die, complete: pending.length === 0, uncertainties: [...uncertainties], scenarios, limit: 64 };
}
