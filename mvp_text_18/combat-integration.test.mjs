import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, execute, previewBattle } from './engine.mjs';
import { newEntity, CARDS } from './shared.mjs';
import { combatAction } from './combat.mjs';

// Controlled rule checks, not campaign balance or win-rate measurements.
test('50 mixed controlled states: actual event sequence is one enumerated preview branch', () => {
  const types = Object.keys(CARDS);
  const eventTypes = new Set(['damage', 'heal', 'token', 'defense', 'redirect', 'gas-installed', 'gas-absorbed', 'poison-eaten', 'enemy-killed', 'companion-lost', 'outcome', 'random-target', 'support-consumed', 'provider-removed', 'round-end', 'row-start', 'row-end', 'row-skipped', 'arrival', 'arrival-copy', 'rage-consumed', 'visit', 'counterattack', 'miss']);
  const shape = events => JSON.stringify(events.filter(e => eventTypes.has(e.type)).map(({ index, ...e }) => e));
  let randomCases = 0;
  for (let i = 0; i < 50; i++) {
    const s = createGame(31001 + i);
    execute(s, 'visit', ['1-1-좌'], '독립 통제 판정 대조');
    s.floors.fill(null);
    for (let j = 0; j < 7; j++) {
      const e = newEntity(s, types[(i + j * 3) % types.length], 'control');
      e.upgraded = (i + j) % 3 === 0;
      if (j % 2 === 0) e.fusion = { bType: types[(i * 3 + j + 1) % types.length], bUpgraded: j % 3 === 0, aId: 'originalA', bId: 'originalB' };
      s.floors[(j + i) % 10] = e;
    }
    execute(s, 'start', [], '독립 통제 판정 대조');
    s.battle.dice = [i % 6 + 1, (i * 3 + 2) % 6 + 1, (i * 5 + 4) % 6 + 1];
    for (const e of s.floors.filter(Boolean)) { e.tokens.poison = i % 4; e.tokens.rage = i % 5; e.tokens.exhaustion = i % 3; }
    for (const e of s.battle.enemies) { e.pos = i % 10; e.tokens.poison = i % 3; e.hp = 5; e.maxHp = 5; }
    const before = JSON.stringify(s);
    const p = previewBattle(s, [3, 1, 2]);
    assert.equal(JSON.stringify(s), before, `case ${i}: preview mutation`);
    if (p.scenarios.length > 1) randomCases++;
    combatAction(s, 'assign', [3, 1, 2]);
    const mark = s.journal.length;
    combatAction(s, 'move', []);
    assert.equal(p.complete, true, `case ${i}: incomplete`);
    assert.ok(p.scenarios.some(x => shape(x.events) === shape(s.journal.slice(mark))), `case ${i}: preview mismatch`);
  }
  assert.ok(randomCases > 0, 'The fixtures must exercise unknown random targets.');
});

test('preview reports bounded enumeration as incomplete and never consumes real RNG', () => {
  const s = createGame(31003);
  execute(s, 'visit', [1], '무작위 분기 상한 통제');
  s.floors.fill(null);
  for (const x of [1, 3, 5]) s.floors[x - 1] = newEntity(s, 'paladin', 'control');
  for (const x of [2, 4]) {
    const e = newEntity(s, 'holyPriest', 'control');
    e.fusion = { bType: 'holyPriest', bUpgraded: false, aId: 'A', bId: 'B' };
    s.floors[x - 1] = e;
  }
  s.node.enemies = [{ type: 'control', role: 'attack', pattern: 'double', attack: 0, maxHp: 30, rows: [0, 1, 2], protection: 0 }];
  execute(s, 'start', [], '신성사제 분기 상한 검증');
  s.battle.dice = [1, 2, 2];
  const before = JSON.stringify(s), p = previewBattle(s);
  assert.equal(JSON.stringify(s), before);
  assert.equal(p.complete, false);
  assert.equal(p.scenarios.length, 64);
  assert.deepEqual(p.uncertainties, ['신성사제대상']);
  assert.ok(p.scenarios.every(x => x.conditions.length === 8 && !('rng' in x) && !('dice' in x)));
});

test('engine settlement agrees with final-kill preview: HP persists, status resets, one reward', () => {
  const s = createGame(31001);
  execute(s, 'visit', [1], '최종 정산 통제');
  s.floors.fill(null);
  s.floors[0] = newEntity(s, 'crusader', 'control');
  s.node.enemies = [{ type: 'control', role: 'attack', pattern: 'double', attack: 0, maxHp: 1, rows: [0], protection: 0 }];
  execute(s, 'start', [], '종료 효과와 원정 정산 연결 검증');
  s.floors[0].tokens.poison = 1;
  s.battle.dice = [1, 1, 1];
  const p = previewBattle(s).scenarios[0];
  execute(s, 'assign', [1, 2, 3], '즉시 최종 처치');
  execute(s, 'move', [], '독과 탈진까지 종료 처리');
  assert.equal(s.phase, 'reward');
  assert.equal(s.battle, null);
  assert.equal(s.stats.battles.length, 1);
  assert.equal(s.stats.battles[0].outcome, p.outcome);
  assert.equal(s.floors[0].hp, p.allies[0].hp);
  assert.deepEqual(s.floors[0].tokens, p.allies[0].tokens);
  assert.equal(s.journal.filter(e => e.type === 'round-end').length, 1);
  assert.equal(s.journal.filter(e => e.type === 'reward-offered').length, 1);
  assert.equal(s.coins, 1);
});
