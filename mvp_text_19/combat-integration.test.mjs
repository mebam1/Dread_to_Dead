import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, execute, previewBattle } from './engine.mjs';
import { newEntity, CARDS } from './shared.mjs';
import { combatAction } from './combat.mjs';

// Controlled rule checks, not campaign balance or win-rate measurements.
test('50 mixed controlled states: actual event sequence is one enumerated preview branch', () => {
  const types = Object.keys(CARDS);
  const eventTypes = new Set(['damage', 'heal', 'token', 'defense', 'redirect', 'gas-installed', 'gas-absorbed', 'poison-eaten', 'enemy-killed', 'companion-lost', 'outcome', 'random-target', 'support-consumed', 'provider-removed', 'round-end', 'drop', 'push', 'round-start', 'arrival', 'arrival-copy', 'rage-consumed', 'visit', 'counterattack', 'miss']);
  const shape = events => JSON.stringify(events.filter(e => eventTypes.has(e.type)).map(({ index, ...e }) => e));
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
    const slot = i%3 + 1;
    s.battle.dice[slot-1]=i%6+1; s.battle.turn=i%3+1;
    for (const e of s.floors.filter(Boolean)) { e.tokens.poison = i % 4; e.tokens.rage = i % 5; e.tokens.exhaustion = i % 3; }
    for (const e of s.battle.enemies) { e.pos = (i+3*s.battle.enemies.indexOf(e))%10+1; e.tokens.poison = i % 3; e.hp = 5; e.maxHp = 5; }
    const before = JSON.stringify(s);
    const id=s.floors[(i+1)%10].id;
    const p = previewBattle(s,id,slot);
    assert.equal(JSON.stringify(s), before, `case ${i}: preview mutation`);
    const mark = s.journal.length;
    combatAction(s, 'move', [id,slot]);
    assert.equal(p.complete, true, `case ${i}: incomplete`);
    assert.ok(p.scenarios.some(x => shape(x.events) === shape(s.journal.slice(mark))), `case ${i}: preview mismatch`);
  }

});

test('preview reports bounded enumeration as incomplete and never consumes real RNG', () => {
  const s = createGame(31003);
  execute(s, 'visit', [1], '무작위 분기 상한 통제');
  s.floors.fill(null);
  for (const x of [2,3,6]) s.floors[x-1]=newEntity(s,'saint','control');
  const mover=s.floors[2];mover.fusion={bType:'saint',bUpgraded:false};
  for (const x of [4,5]) {
    const e=newEntity(s,'holyPriest','control');
    e.fusion={bType:'holyPriest',bUpgraded:false};
    s.floors[x-1]=e;
  }
  execute(s,'start',[],'분기 검사');s.battle.dice[0]=1;
  const before = JSON.stringify(s), p = previewBattle(s,mover.id,1);
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
  s.node.enemies = [{ type: 'control', role: 'attack', pattern: 'double', attack: 0, maxHp: 1, firstCounter:1,period:2,strong:false, protection: 0 }];
  execute(s, 'start', [], '종료 효과와 원정 정산 연결 검증');
  s.floors[0].tokens.poison = 1;
  s.battle.dice[0] = 1;
  const id=s.floors[0].id;
  const p = previewBattle(s,id,1).scenarios[0];
  execute(s, 'move', [id,1], '독과 탈진까지 종료 처리');
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

test('exit and surrender restore surviving entry IDs to their slots and leave casualties empty',()=>{
  for (const retreat of [true,false]) {
    const s=createGame();
    execute(s,'visit',[1],'진입');
    s.node.enemies[0].pattern='path';s.node.enemies[0].firstCounter=1;
    execute(s,'start',[],'전투');
    const original=s.floors.map(e=>e?.id??null);
    execute(s,'move',['c3',1],'재배치');
    const fallen=s.floors.findIndex(e=>e?.id==='c2');
    s.floors[fallen]=null;
    const guardian=s.floors.find(e=>e?.id==='c1');guardian.hp=23;
    if (retreat) {
      s.battle.exit=3; s.battle.turn=3;
      execute(s,'move',['c1',1],'철수까지 이동');
      assert.equal(s.phase,'map');
    } else {
      execute(s,'give-up',[],'포기');
      assert.equal(s.phase,'lost');
    }
    assert.deepEqual(s.floors.map(e=>e?.id??null),original.map(id=>id==='c2'?null:id));
    assert.equal(s.floors[1].hp,23);assert.equal(s.floors[1].defense,0);
  }
});
