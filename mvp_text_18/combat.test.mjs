import test from 'node:test';
import assert from 'node:assert/strict';
import { RULE_VERSION, newEntity } from './shared.mjs';
import { startBattle, combatAction, previewBattle, availableQuickActions, adjacent, applyDamageEffect, absorbGas } from './combat.mjs';

const normal = (rows = [0], overrides = {}) => ({ type: 'A', role: 'attack', pattern: 'double', attack: 0, maxHp: 30, rows, protection: 0, ...overrides });
function setup(placement, templates = [normal()], kind = 'combat') {
  const s = { version: RULE_VERSION, seed: 31001, act: 1, phase: 'management', coins: 0, sequence: 0, rng: {}, journal: [], stats: { losses: [] }, floors: Array(10).fill(null), node: { id: 'test', act: 1, depth: 1, col: '좌', kind, enemies: templates } };
  for (const [x, type] of placement) s.floors[x - 1] = newEntity(s, type, 'test');
  startBattle(s);
  return s;
}
function round(s, dice, assignment = [1, 2, 3]) {
  s.battle.dice = dice;
  combatAction(s, 'assign', assignment);
  return combatAction(s, 'move');
}
const events = (s, type) => s.journal.filter(e => e.type === type);

test('ordinary rows resolve in order; long enemy continues from preceding destination', () => {
  const s = setup([[10, 'saint']], [normal([0]), normal([1]), normal([2])]);
  round(s, [3, 2, 1]);
  assert.deepEqual(s.battle.enemies.map(e => e.pos), [3, 2, 1]);
  assert.deepEqual(events(s, 'row-end').map(e => e.path), [[1, 2, 3], [1, 2], [1]]);
  const t = setup([[10, 'saint']], [normal([0, 1, 2])], 'elite');
  round(t, [3, 2, 1]);
  assert.deepEqual(events(t, 'row-end').map(e => e.pos), [3, 5, 6]);
  assert.equal(t.battle.enemies[0].pos, 6);
});

test('movement alone wraps; adjacency and mirror ranges stay linear', () => {
  const s = setup([[1, 'saint'], [10, 'saint']], [normal([0], { pattern: 'mirror', attack: 1 })]);
  assert.equal(adjacent(s, s.floors[0], s.floors[9]), false);
  s.battle.enemies[0].pos = 9;
  round(s, [3, 1, 1]);
  assert.deepEqual(events(s, 'row-end')[0].path, [10, 1, 2]);
  assert.deepEqual(events(s, 'counterattack')[0].positions, [4]);
  assert.equal(s.floors[9].hp, 4);
});

test('cardinal creates only its two endpoint edge, without transitive or wrapped links', () => {
  const s = setup([[2, 'saint'], [3, 'saint'], [5, 'cardinal'], [7, 'saint'], [8, 'saint'], [10, 'saint']]);
  assert.ok(adjacent(s, s.floors[2], s.floors[6]));
  assert.equal(adjacent(s, s.floors[4], s.floors[2]), false);
  assert.equal(adjacent(s, s.floors[1], s.floors[6]), false);
  s.floors[4] = null;
  assert.equal(adjacent(s, s.floors[2], s.floors[6]), false);
});

test('rage applies in full to each AoE target and explicit zero damage, never to absent targets', () => {
  const s = setup([[1, 'crusader']], [normal([0]), normal([1]), normal([2])]);
  const owner = s.floors[0]; owner.tokens.rage = 3;
  applyDamageEffect(s, owner, []);
  assert.equal(owner.tokens.rage, 3);
  applyDamageEffect(s, owner, s.battle.enemies.map(target => ({ target, base: 0 })));
  assert.deepEqual(s.battle.enemies.map(e => e.hp), [27, 27, 27]);
  assert.equal(owner.tokens.rage, 0);
  assert.equal(events(s, 'rage-consumed').length, 1);
});

test('arrival AoE counts a long card only once per original', () => {
  const s = setup([[1, 'crusader']], [normal([0, 1, 2])], 'elite');
  s.floors[0].tokens.rage = 3;
  round(s, [1, 1, 1]);
  assert.equal(s.battle.enemies[0].hp, 25);
  assert.equal(events(s, 'damage').filter(e => e.side === 'enemy').length, 1);
});

test('paladin splits after rage, shares quota across hits, and applies recipient defenses after split', () => {
  const s = setup([[1, 'paladin'], [2, 'saint'], [3, 'warPriest']]);
  const [guard, ally, priest] = s.floors;
  guard.defense = 2; ally.defense = 3;
  const enemy = s.battle.enemies[0]; enemy.tokens.rage = 3;
  applyDamageEffect(s, enemy, [{ target: ally, base: 2 }, { target: ally, base: 2 }]);
  assert.equal(guard.hp, 5);
  assert.equal(guard.guardUsed.A, 3);
  assert.equal(s.floors[1], null);
  assert.equal(priest.tokens.rage, 1);
  assert.deepEqual(events(s, 'damage').map(e => [e.target, e.amount, e.absorbed, e.hpLoss]), [[guard.id, 3, 2, 1], [ally.id, 2, 2, 0], [ally.id, 5, 1, 4]]);
  assert.equal(s.stats.losses.length, 1);
});

test('a paladin recipient cannot be protected, and fused guardians retain per-original quotas', () => {
  const s = setup([[1, 'paladin'], [2, 'paladin'], [3, 'saint']]);
  const enemy = s.battle.enemies[0];
  applyDamageEffect(s, enemy, [{ target: s.floors[1], base: 2 }]);
  assert.equal(s.floors[0].hp, 6);
  assert.equal(s.floors[1].hp, 4);
  const guard = s.floors[1]; guard.hp = 6; guard.defense = 6;
  guard.fusion = { bType: 'paladin', bUpgraded: false };
  applyDamageEffect(s, enemy, [{ target: s.floors[2], base: 6 }]);
  assert.deepEqual(guard.guardUsed, { A: 3, B: 3 });
  assert.equal(s.floors[2].hp, 4);
});

test('last kill finishes crusader exhaustion and end round once; mutual elimination is loss', () => {
  const s = setup([[1, 'crusader']], [normal([0], { maxHp: 1 })]);
  s.floors[0].tokens.exhaustion = 3;
  assert.deepEqual(round(s, [1, 1, 1]), { outcome: 'loss' });
  assert.equal(s.coins, 1);
  assert.equal(events(s, 'round-end').length, 1);
  assert.equal(events(s, 'enemy-killed').length, 1);
  assert.deepEqual(events(s, 'row-skipped').map(e => [e.row, e.reason]), [[1, 'last-enemy-killed'], [2, 'last-enemy-killed']]);
  assert.equal(events(s, 'companion-lost')[0].reason, 'exhaustion');
  assert.equal(s.stats.losses[0].cause, 'exhaustion');
});

test('final poison kill does not restart cleanup; ally poison still applies and rage remains unused', () => {
  const s = setup([[10, 'saint']], [normal([0], { maxHp: 1 })]);
  s.floors[9].tokens.poison = 1; s.floors[9].tokens.rage = 3;
  s.battle.enemies[0].tokens.poison = 1;
  assert.deepEqual(round(s, [1, 1, 1]), { outcome: 'win' });
  assert.equal(s.floors[9].hp, 3);
  assert.equal(s.floors[9].tokens.rage, 3); // Campaign owns the final reset.
  assert.equal(events(s, 'round-end').length, 1);
  assert.deepEqual(events(s, 'damage').filter(e => e.label === 'poison').map(e => e.hpLoss), [1, 1]);
});

test('squire copies base payload, its own rage and exhaustion; copied effects do not recursively trigger', () => {
  const s = setup([[1, 'crusader'], [2, 'squire'], [3, 'squire']], [normal([0]), normal([1])]);
  s.battle.enemies[1].pos = 2;
  s.floors[0].tokens.rage = 3; s.floors[1].tokens.rage = 1;
  round(s, [1, 1, 1]);
  const copied = events(s, 'damage').find(e => e.label === 'arrival-copy');
  assert.equal(copied.base, 2); assert.equal(copied.rage, 1); assert.equal(copied.hpLoss, 3);
  assert.equal(s.floors[1].tokens.exhaustion, 1);
  assert.equal(s.floors[2].tokens.exhaustion, 0);
  assert.equal(events(s, 'arrival-copy').length, 1);
});

test('fused arrival originals trigger reactions separately in A then B order', () => {
  const s = setup([[1, 'paladin'], [2, 'choir']]);
  s.floors[0].fusion = { bType: 'saint', bUpgraded: false };
  round(s, [1, 1, 1]);
  assert.equal(s.battle.enemies[0].hp, 28);
  assert.deepEqual(events(s, 'arrival').map(e => e.part), ['A', 'B']);
  assert.equal(events(s, 'damage').filter(e => e.label === 'choir-reaction').length, 2);
});

test('holy priest preview branches possible targets, stays pure, and actual result belongs to branches', () => {
  const s = setup([[1, 'saint'], [2, 'holyPriest'], [3, 'saint']], [normal([0], { attack: 1 })]);
  s.battle.dice = [1, 1, 1];
  const before = JSON.stringify(s), p = previewBattle(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(p.complete, true); assert.equal(p.scenarios.length, 2);
  assert.deepEqual(p.uncertainties, ['신성사제대상']);
  assert.ok(p.scenarios.every(c => !('rng' in c) && !('dice' in c)));
  const expected = p.scenarios.map(c => c.allies.map(e => [e.id, e.hp]));
  round(s, [1, 1, 1]);
  assert.ok(expected.some(a => JSON.stringify(a) === JSON.stringify(s.floors.filter(Boolean).map(e => [e.id, e.hp]))));
  assert.equal(events(s, 'random-target').length, 1);
  assert.equal(events(s, 'defense').some(e => e.target === s.floors[1].id), false);
});

test('gas installation waits for another visit, absorbs all three rows on long card, and decays once', () => {
  const s = setup([[1, 'sprayer']], [normal([0]), normal([1]), normal([2])]);
  round(s, [2, 1, 1]);
  assert.deepEqual(s.battle.enemies.map(e => e.hp), [30, 29, 29]);
  assert.ok(s.battle.gas.flat().every(n => n === 0));
  const t = setup([[10, 'saint']], [normal([0, 1, 2])], 'elite');
  t.battle.gas[1][0] = 1; t.battle.gas[2][0] = 2; t.battle.gas[3][0] = 3;
  round(t, [1, 1, 1]);
  assert.equal(t.battle.enemies[0].hp, 24);
  assert.equal(t.battle.enemies[0].tokens.poison, 5);
  assert.equal(events(t, 'gas-absorbed').length, 1);
});

test('companion combat movement consumes gas, including poison cap', () => {
  const s = setup([[2, 'saint']]);
  s.battle.gas[0][1] = 4; s.floors[1].tokens.poison = 98;
  absorbGas(s, s.floors[1]);
  assert.equal(s.battle.gas[0][1], 0); assert.equal(s.floors[1].tokens.poison, 99);
});

test('gourmet uses Manhattan tie order and a single rage bonus for both repetitions', () => {
  const s = setup([[3, 'saint'], [5, 'gourmet']], [normal([0]), normal([1])]);
  s.floors[4].upgraded = true; s.floors[4].tokens.rage = 3;
  s.floors[2].tokens.poison = 2;
  s.battle.enemies[0].pos = 4;
  s.battle.enemies[1].pos = 5; s.battle.enemies[1].tokens.poison = 4;
  round(s, [2, 1, 1]);
  assert.deepEqual(events(s, 'poison-eaten').map(e => [e.target, e.amount]), [[s.floors[2].id, 2], ['E2', 4]]);
  const hits = events(s, 'damage').filter(e => e.label === 'gourmet');
  assert.deepEqual(hits.map(e => e.hpLoss), [5, 5, 7, 7]);
  assert.equal(events(s, 'rage-consumed').length, 1);
});

test('quick effects validate before cost and fused quick effects share one token', () => {
  const s = setup([[1, 'toxicHealer'], [2, 'saint']]);
  const owner = s.floors[0], target = s.floors[1]; target.hp = 1;
  owner.fusion = { bType: 'toxicHealer', bUpgraded: true };
  combatAction(s, 'assign', [1, 2, 3]);
  assert.equal(availableQuickActions(s).length, 2);
  const before = JSON.stringify(s);
  assert.throws(() => combatAction(s, 'active', [owner.id, 'A', owner.id]));
  assert.equal(JSON.stringify(s), before);
  combatAction(s, 'active', [owner.id, 'B', target.id]);
  assert.equal(target.hp, 4); assert.equal(target.tokens.poison, 1); assert.equal(owner.tokens.quick, 0);
  assert.equal(availableQuickActions(s).length, 0);
});

test('provider death removes remaining protection and support immediately', () => {
  const s = setup([[10, 'saint']], [normal([0]), normal([1], { type: 'C', role: 'guard', protection: 2 }), normal([2], { type: 'B', role: 'support' })]);
  const [a, c, b] = s.battle.enemies;
  assert.equal(a.protection[0].amount, 2); assert.equal(a.support.length, 1);
  applyDamageEffect(s, s.floors[9], [{ target: c, base: 30 }, { target: b, base: 30 }]);
  assert.deepEqual(a.protection, []); assert.deepEqual(a.support, []);
  assert.equal(s.coins, 2);
  applyDamageEffect(s, s.floors[9], [{ target: c, base: 30 }]);
  assert.equal(s.coins, 2);
});

test('support consumes on an empty first tile but rage waits for a valid damage target', () => {
  const s = setup([[2, 'paladin']], [normal([0], { role: 'support', pattern: 'path', attack: 1 })]);
  s.battle.enemies[0].tokens.rage = 2;
  round(s, [2, 1, 1]);
  const hit = events(s, 'damage')[0];
  assert.equal(hit.base, 1); assert.equal(hit.rage, 2); assert.equal(hit.hpLoss, 2);
  assert.equal(events(s, 'support-consumed')[0].x, 1);
});

test('inactivity triggers at 3 then 2, auto quick and defense do not count, actual activity resets', () => {
  const s = setup([[10, 'toxicHealer']]);
  for (let i = 0; i < 5; i++) { s.battle.enemies[0].pos = 0; round(s, [1, 1, 1]); }
  assert.equal(events(s, 'inactivity-penalty').length, 2);
  assert.equal(s.floors[9].hp, 2);
  assert.equal(s.battle.inactiveThreshold, 2);
  s.battle.enemies[0].pos = 9; s.battle.enemies[0].attack = 1; s.battle.enemies[0].pattern = 'path';
  round(s, [1, 1, 1]);
  // Actual damage is activity even without any player damage or token grant.
  assert.equal(events(s, 'round-end').slice(-1)[0].activity, true);
  assert.equal(s.battle.inactiveCount, 0);
  assert.equal(s.battle.inactiveThreshold, 3);
});

test('exit wins priority over gas and effects; boss preview and actual both return loss', () => {
  for (const kind of ['combat', 'elite', 'boss']) {
    const s = setup([[10, 'saint']], [normal(kind === 'combat' ? [0] : [0, 1, 2])], kind);
    s.battle.dice = [1, 1, 1];
    combatAction(s, 'assign', [1, 2, 3]); combatAction(s, 'exit', [1]);
    s.battle.gas[1][0] = 4;
    const expected = kind === 'boss' ? 'loss' : 'escape';
    const p = previewBattle(s);
    assert.equal(p.scenarios[0].outcome, expected);
    assert.deepEqual(combatAction(s, 'move'), { outcome: expected });
    assert.equal(events(s, 'gas-absorbed').length, 0);
    assert.equal(events(s, 'round-end').length, 0);
  }
});

test('preview final cleanup leaves persistent HP and clears all statuses without mutating reality', () => {
  const s = setup([[1, 'crusader']], [normal([0], { maxHp: 1 })]);
  s.floors[0].tokens.poison = 1; s.battle.dice = [1, 1, 1];
  const before = JSON.stringify(s), p = previewBattle(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(p.scenarios[0].outcome, 'win');
  assert.equal(p.scenarios[0].allies[0].hp, 3);
  assert.ok(Object.values(p.scenarios[0].allies[0].tokens).every(n => n === 0));
});
