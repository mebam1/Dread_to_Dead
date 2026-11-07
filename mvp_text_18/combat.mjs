import { draw, log, credit, parts, maxHp, requireRule, resetStatuses } from './shared.mjs';

export const PERMUTATIONS = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
const ARRIVAL = new Set(['paladin', 'saint', 'choir', 'crusader', 'warPriest', 'cardinal']);
const tokenDefaults = () => ({ quick: 0, poison: 0, exhaustion: 0, rage: 0 });
const allies = s => s.floors.filter(e => e && e.hp > 0);
const enemies = s => s.battle.enemies.filter(e => e.hp > 0);
const isEnemy = e => Array.isArray(e?.rows);
const position = (s, e) => isEnemy(e) ? e.pos : s.floors.findIndex(a => a?.id === e.id) + 1;
const alive = (s, e) => !!e && e.hp > 0 && (isEnemy(e) || position(s, e) > 0);
const hpMax = e => isEnemy(e) ? e.maxHp : maxHp(e);
const has = (e, type) => !isEnemy(e) && parts(e).some(p => p.type === type);
const orderedEnemies = s => enemies(s).sort((a, b) => Math.min(...a.rows) - Math.min(...b.rows));
const record = (s, type, details = {}) => log(s, type, { round: s.battle?.round, ...details });

/** The board is linear. Only enemy movement uses the 10 -> 1 boundary. */
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
    credit(s, e.rows.length === 3 ? 3 : 1, `kill:${e.id}`);
    s.battle.summary.kills++;
    if (s.battle.summary.kills === 1) s.battle.summary.firstKillRound = s.battle.round;
    if (s.battle.summary.kills === 2) s.battle.summary.secondKillRound = s.battle.round;
    record(s, 'enemy-killed', { id: e.id, enemyType: e.type, reason, rows: e.rows, pos: e.pos });
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
    for (const part of parts(w)) if (part.type === 'warPriest') addToken(s, w, 'rage', 1, w);
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
        const quota = Math.max(0, 3 - (guardian.guardUsed[part.key] || 0));
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
  damage(s, target, base + effect.rage, { source: effect.source?.id ?? null, label: effect.label, part: effect.part, base, rage: effect.rage, row: s.battle.currentRow ?? null, hit: ++effect.hit, ...extra });
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
  switch (type) {
    case 'paladin': addDefense(s, owner, 1, owner); break;
    case 'saint': for (const ally of neighbors(s, owner)) heal(s, ally, upgraded ? 2 : 1, owner); break;
    case 'choir': aoe(s, owner, 1, effect); break;
    case 'crusader':
      aoe(s, owner, upgraded ? 4 : 2, effect);
      addToken(s, owner, 'exhaustion', 1, owner);
      break;
    case 'warPriest': case 'cardinal': aoe(s, owner, upgraded ? 2 : 1, effect); break;
  }
}
function arrivalReactions(s, owner, original, visitor, context) {
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
          addDefense(s, target, part.upgraded ? 2 : 1, reactor);
        }
      }
      if (part.type === 'choir' && alive(s, visitor)) {
        hit(s, damageContext(reactor, 'choir-reaction', part.key), visitor, part.upgraded ? 2 : 1);
      }
    }
  }
}
function nearestPoison(s, owner) {
  const x = position(s, owner);
  const candidates = [...allies(s), ...enemies(s)].filter(e => e.tokens.poison > 0).map(e => {
    const px = position(s, e), y = isEnemy(e) ? Math.min(...e.rows) + 1 : 0;
    return { e, x: px, y, distance: Math.abs(x - px) + y, enemy: Number(isEnemy(e)) };
  });
  candidates.sort((a, b) => a.distance - b.distance || a.enemy - b.enemy || a.x - b.x || a.y - b.y || a.e.id.localeCompare(b.e.id));
  return candidates[0]?.e;
}
function passPayload(s, owner, original) {
  const { type, upgraded, key } = original;
  if (type === 'sprayer') {
    const x = position(s, owner) - 1;
    for (let y = 1; y <= 3; y++) {
      const before = s.battle.gas[y][x];
      s.battle.gas[y][x] = Math.min(99, before + (upgraded ? 2 : 1));
      if (s.battle.gas[y][x] > before) activity(s);
      record(s, 'gas-installed', { source: owner.id, part: key, x: x + 1, y, before, after: s.battle.gas[y][x] });
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
      aoe(s, owner, amount, effect);
    }
  }
}
/** Used by enemy visits and future combat movement effects for companions. */
export function absorbGas(s, entity, x = position(s, entity)) {
  const rows = isEnemy(entity) ? entity.rows.map(r => r + 1) : [0];
  let amount = 0;
  for (const y of rows) { amount += s.battle.gas[y][x - 1]; s.battle.gas[y][x - 1] = 0; }
  if (amount) {
    addToken(s, entity, 'poison', amount, 'gas');
    record(s, 'gas-absorbed', { target: entity.id, x, rows, amount });
  }
}
function visit(s, enemy, kind, context) {
  if (s.battle.exit === enemy.pos) return endOutcome(s, s.node.kind === 'boss' ? 'loss' : 'escape', 'exit');
  absorbGas(s, enemy);
  const companion = s.floors[enemy.pos - 1];
  if (!companion) return;
  for (const original of parts(companion)) {
    if (!alive(s, companion)) break;
    // No new original starts after the final kill. A current original and its reactions do finish.
    if (s.battle.lastEnemyKilled) break;
    if (kind === 'arrival' && ARRIVAL.has(original.type)) {
      arrivalPayload(s, companion, original, context);
      arrivalReactions(s, companion, original, enemy, context);
    } else if (kind === 'pass') passPayload(s, companion, original);
  }
}
function counterattack(s, enemy, path) {
  let pattern = enemy.pattern;
  if (pattern === 'alternate' || pattern === 'alternating') pattern = s.battle.round % 2 ? 'double' : 'mirror';
  const positions = ({ double: [enemy.pos, enemy.pos], path, neighbor: [enemy.pos - 1, enemy.pos], mirror: [enemy.pos - 2, enemy.pos + 2] })[pattern];
  requireRule(positions, `알 수 없는 적 패턴: ${pattern}`);
  const effect = damageContext(enemy, 'counterattack');
  record(s, 'counterattack', { source: enemy.id, row: s.battle.currentRow, pattern, positions: positions.filter(x => x >= 1 && x <= 10) });
  for (const x of positions) {
    if (x < 1 || x > 10) continue;
    if (!allies(s).length || !alive(s, enemy)) break;
    const support = enemy.support.length;
    enemy.support = [];
    const target = s.floors[x - 1];
    if (support) record(s, 'support-consumed', { source: enemy.id, amount: support, x });
    if (target) hit(s, effect, target, enemy.attack + support, { attack: enemy.attack, support, x });
    else record(s, 'miss', { source: enemy.id, x, row: s.battle.currentRow, support });
  }
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
  for (const e of allies(s)) { e.defense = 0; e.guardUsed = { A: 0, B: 0 }; }
  for (const e of enemies(s)) e.support = [];
  if (allies(s).length && enemies(s).length) {
    if (b.activity) { b.inactiveCount = 0; b.inactiveThreshold = 3; }
    else {
      b.inactiveCount++;
      if (b.inactiveCount >= b.inactiveThreshold) {
        const target = randomTarget(s, '비활동표적', allies(s), context);
        b.inactiveCount = 0; b.inactiveThreshold = 2;
        b.suppressActivity = true;
        record(s, 'inactivity-penalty', { target: target.id, amount: 1 });
        damage(s, target, 1, { source: null, label: 'inactivity', base: 1, rage: 0, row: null, hit: 1 }, true);
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
  b.activity = false; b.ending = false; b.currentRow = null;
  for (const e of allies(s)) {
    e.guardUsed = { A: 0, B: 0 };
    if (has(e, 'toxicHealer')) e.tokens.quick = 1;
  }
  for (const e of orderedEnemies(s)) {
    if (e.role === 'support' || e.role === '지원') {
      const target = supportTarget(s, e);
      target.support.push({ source: e.id });
      record(s, 'support-granted', { source: e.id, target: target.id });
    }
  }
  b.dice = Array.from({ length: 3 }, () => draw(s, '굴림', 6) + 1);
  b.assignment = [1, 2, 3];
  s.phase = 'choose';
  record(s, 'round-start', { dice: [...b.dice], allies: allies(s).map(e => ({ id: e.id, hp: e.hp })), enemies: enemies(s).map(e => ({ id: e.id, hp: e.hp, pos: e.pos })) });
}
export function startBattle(s) {
  requireRule(s.node?.enemies?.length, '전투 노드가 아닙니다.');
  requireRule(allies(s).length, '생존 동료가 없습니다.');
  resetStatuses(s);
  s.battle = {
    round: 1, dice: [], assignment: [1, 2, 3],
    enemies: s.node.enemies.map((template, index) => ({ ...structuredClone(template), id: `E${index + 1}`, pos: 0, hp: template.maxHp, tokens: tokenDefaults(), protection: [], support: [], removed: false })),
    gas: Array.from({ length: 4 }, () => Array(10).fill(0)), exit: null,
    inactiveCount: 0, inactiveThreshold: 3, activity: false, ended: false, ending: false, lastEnemyKilled: false,
    summary: { rounds: 0, kills: 0, companionLosses: 0, hpDamageDealt: 0, hpDamageTaken: 0, healing: 0, firstKillRound: null, secondKillRound: null, emptyRowAssignments: 0 },
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
  roundStart(s);
}
function validateAssignment(assignment) {
  requireRule(Array.isArray(assignment) && assignment.length === 3 && [...assignment].sort().join(',') === '1,2,3', '아래·가운데·위에 D1·D2·D3을 한 번씩 배분하세요.');
}
export function availableQuickActions(s) {
  if (s.phase !== 'prepare' || !s.battle || s.battle.ended || s.battle.lastEnemyKilled) return [];
  const actions = [];
  for (const owner of allies(s)) if (owner.tokens.quick > 0) {
    for (const part of parts(owner)) if (part.type === 'toxicHealer') {
      for (const target of neighbors(s, owner)) actions.push({ id: owner.id, part: part.key, targetId: target.id, cost: 1, poison: 1, heal: part.upgraded ? 3 : 2 });
    }
  }
  return actions;
}
function executeRound(s, context) {
  const b = s.battle;
  const skipRemainingRows = (from, reason) => {
    for (let skipped = from; skipped < 3; skipped++) {
      const die = b.assignment[skipped];
      record(s, 'row-skipped', { row: skipped, die, final: b.dice[die - 1], reason });
    }
  };
  for (let row = 0; row < 3; row++) {
    if (!enemies(s).length || !allies(s).length) {
      skipRemainingRows(row, !enemies(s).length ? 'last-enemy-killed' : 'no-companions');
      break;
    }
    b.currentRow = row;
    const enemy = enemies(s).find(e => e.rows.includes(row));
    if (!enemy) { b.summary.emptyRowAssignments++; record(s, 'row-skipped', { row, reason: 'empty-row' }); continue; }
    const die = b.assignment[row], count = b.dice[die - 1], path = [];
    record(s, 'row-start', { row, enemy: enemy.id, start: enemy.pos, die, original: count, final: count });
    for (let step = 0; step < count; step++) {
      if (!alive(s, enemy) || !allies(s).length) break;
      const prior = enemy.pos;
      enemy.pos = enemy.pos % 10 + 1;
      path.push(enemy.pos);
      const kind = step === count - 1 ? 'arrival' : 'pass';
      record(s, 'visit', { row, enemy: enemy.id, x: enemy.pos, kind, wrapped: prior === 10 });
      const result = visit(s, enemy, kind, context);
      if (result) {
        record(s, 'row-end', { row, enemy: enemy.id, path, hp: enemy.hp, pos: enemy.pos, stopped: 'exit' });
        skipRemainingRows(row + 1, 'exit');
        return result;
      }
      if (b.lastEnemyKilled) break;
    }
    if (alive(s, enemy) && allies(s).length && !b.lastEnemyKilled) counterattack(s, enemy, path);
    record(s, 'row-end', { row, enemy: enemy.id, path, hp: enemy.hp, pos: enemy.pos, stopped: !alive(s, enemy) ? 'enemy-killed' : !allies(s).length ? 'no-companions' : null });
    if (!allies(s).length && !b.lastEnemyKilled) {
      skipRemainingRows(row + 1, 'no-companions');
      return endOutcome(s, 'loss', 'no-companions');
    }
  }
  b.currentRow = null;
  return endRound(s, context);
}
export function combatAction(s, cmd, args = []) {
  requireRule(s.battle && !s.battle.ended, '진행 중인 전투가 없습니다.');
  if (cmd === 'assign' || cmd === 'choose') {
    requireRule(s.phase === 'choose', '배분은 배분 단계에서 확정합니다.');
    const assignment = cmd === 'choose' ? PERMUTATIONS[Number(args[0]) - 1] : args.map(Number);
    validateAssignment(assignment);
    s.battle.assignment = [...assignment]; s.phase = 'prepare';
    record(s, 'assignment', { assignment: [...assignment], values: assignment.map(d => s.battle.dice[d - 1]) });
    return;
  }
  requireRule(s.phase === 'prepare', '먼저 주사위 배분을 확정하세요.');
  if (cmd === 'active') {
    const [id, key, targetId] = args;
    const action = availableQuickActions(s).find(a => a.id === id && a.part === key && a.targetId === targetId);
    requireRule(action, '속공 주체·원본·대상 또는 속공 비용이 유효하지 않습니다.');
    const owner = allies(s).find(e => e.id === id), target = allies(s).find(e => e.id === targetId);
    owner.tokens.quick--;
    record(s, 'quick-cost', { source: id, part: key, token: 'quick', amount: 1, target: targetId });
    addToken(s, target, 'poison', 1, owner); heal(s, target, action.heal, owner);
    return;
  }
  if (cmd === 'exit') {
    const x = Number(args[0]);
    requireRule(Number.isInteger(x) && x >= 1 && x <= 10 && !s.floors[x - 1], '철수 지점은 1~10 중 빈 지점이어야 합니다.');
    requireRule(s.battle.exit === null, '철수 지점은 전투당 한 번만 설치할 수 있습니다.');
    s.battle.exit = x; record(s, 'exit-placed', { x }); return;
  }
  requireRule(cmd === 'move', `알 수 없는 전투 명령: ${cmd}`);
  const result = executeRound(s);
  if (!result) { s.battle.round++; roundStart(s); }
  return result;
}

function projection(s, outcome, events, conditions) {
  if (outcome) resetStatuses(s);
  return {
    conditions, outcome: outcome || null, events, round: s.battle.round, coins: s.coins,
    allies: allies(s).map(e => ({ id: e.id, type: e.type, x: position(s, e), hp: e.hp, maxHp: hpMax(e), defense: e.defense, tokens: structuredClone(e.tokens) })),
    enemies: s.battle.enemies.map(e => ({ id: e.id, type: e.type, pos: e.pos, rows: e.rows, hp: e.hp, maxHp: e.maxHp, tokens: structuredClone(e.tokens), protection: structuredClone(e.protection), support: structuredClone(e.support) })),
    gas: structuredClone(s.battle.gas), activity: s.battle.activity,
    inactiveCount: s.battle.inactiveCount, inactiveThreshold: s.battle.inactiveThreshold,
    summary: structuredClone(s.battle.summary)
  };
}
/** Enumerates conditional random branches without consuming or consulting real RNG. */
export function previewBattle(s, assignment = s.battle?.assignment) {
  requireRule(s.battle && !s.battle.ended && ['choose', 'prepare'].includes(s.phase), '지금은 전투 미리보기를 할 수 없습니다.');
  validateAssignment(assignment);
  if (s.phase === 'prepare') requireRule(assignment.join() === s.battle.assignment.join(), '확정 후에는 실제 배분의 미리보기만 가능합니다.');
  const pending = [[]], scenarios = [], uncertainties = new Set();
  let attempts = 0;
  while (pending.length && scenarios.length < 64 && attempts++ < 1024) {
    const script = pending.pop();
    const clone = structuredClone({ ...s, journal: [] });
    // No future-round start is called; actual RNG is inaccessible in randomTarget.
    clone.rng = {};
    clone.battle.assignment = [...assignment]; clone.phase = 'prepare';
    const context = { script, cursor: 0, conditions: [] };
    try {
      const result = executeRound(clone, context);
      scenarios.push(projection(clone, result?.outcome, structuredClone(clone.journal), context.conditions));
    } catch (error) {
      if (!(error instanceof NeedChoice)) throw error;
      uncertainties.add(error.purpose);
      for (let i = error.candidates.length - 1; i >= 0; i--) pending.push([...script, { index: i }]);
    }
  }
  return { assignment: [...assignment], complete: pending.length === 0, uncertainties: [...uncertainties], scenarios, limit: 64 };
}
