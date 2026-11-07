import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame, publicMap, campaignAction, finishBattle, previewFusion } from './campaign.mjs';
import { CARDS, RULE_VERSION, draw, credit, maxHp, parts, newEntity, floorOf } from './shared.mjs';

const act = (s, command, ...args) => campaignAction(s, command, args);

// Campaign fixtures bypass combat resolution deliberately. Combat correctness is
// tested separately; this fixture supplies a completed battle for settlement.
function settleWin(s, rounds = 2) {
  assert.equal(s.phase, 'management');
  s.battle = { round: rounds, summary: { rounds, kills: s.node.enemies.length }, enemies: [], gas: Array.from({ length: 4 }, () => Array(10).fill(0)) };
  credit(s, 3, 'campaign-test-settlement');
  finishBattle(s, 'win');
}

function toDepth(s, depth, preferredKind) {
  for (let guard = 0; guard < 100; guard++) {
    if (s.phase === 'map') {
      const options = publicMap(s).filter(n => n.reachable);
      const chosen = options.find(n => n.depth === depth && n.kind === preferredKind) ?? options.find(n => n.col === '중') ?? options[0];
      assert.ok(chosen);
      act(s, 'visit', chosen.id);
      if (chosen.depth === depth) return;
    } else if (s.phase === 'management') { settleWin(s); act(s, 'skip'); }
    else if (s.phase === 'shop') act(s, 'leave');
    else if (['fusion', 'upgrade'].includes(s.phase)) act(s, 'skip');
    else throw Error(`Unexpected fixture phase ${s.phase}`);
  }
  throw Error('Fixture progression did not terminate');
}

test('new expedition has exact roster, placement, zero resources and unique IDs', () => {
  const s = createGame(31001);
  assert.equal(s.version, RULE_VERSION);
  assert.equal(s.coins, 0);
  assert.equal(s.floors.length, 10);
  assert.deepEqual(s.floors.slice(0, 3).map(e => [e.type, e.hp]), [['saint', 4], ['paladin', 6], ['choir', 3]]);
  assert.equal(new Set(s.floors.filter(Boolean).map(e => e.id)).size, 3);
  assert.equal(s.floors.filter(Boolean).every(e => !e.upgraded && !e.fusion && Object.values(e.tokens).every(x => x === 0)), true);
  assert.equal(Object.keys(CARDS).length, 11);
});

test('SHA-256 draw uses Korean location and purpose, independent counters, rejection sampling', () => {
  const s = { seed: 31001, act: 1, rng: {}, node: { act: 1, depth: 1, col: '좌' } };
  const key = '31001|1|1|좌|굴림';
  const expected = [1, 2, 3].map(i => createHash('sha256').update(`${key}|${i}`, 'utf8').digest().readUInt32BE(0) % 6);
  assert.deepEqual([draw(s, '굴림', 6), draw(s, '굴림', 6), draw(s, '굴림', 6)], expected);
  assert.equal(s.rng[key], 3);
  draw(s, '동료보상', 11);
  assert.equal(s.rng['31001|1|1|좌|동료보상'], 1);
  const n = 2 ** 31 + 1;
  let counter = 0, x;
  do { x = createHash('sha256').update(`31001|1|1|좌|거절시험|${++counter}`).digest().readUInt32BE(0); } while (x >= n);
  assert.equal(draw(s, '거절시험', n), x % n);
  assert.equal(s.rng['31001|1|1|좌|거절시험'], counter);
});

test('each act has 52 nodes, all 18-depth paths have the guaranteed composition', () => {
  const s = createGame(31001);
  assert.equal(s.map.length, 52);
  for (let depth = 1; depth <= 18; depth++) {
    const nodes = s.map.filter(n => n.depth === depth);
    assert.equal(nodes.length, depth === 18 ? 1 : 3);
    if ([7, 10, 14].includes(depth)) {
      assert.equal(nodes.filter(n => n.kind === 'upgrade').length, 1);
      assert.equal(nodes.filter(n => n.kind === 'fusion').length, 2);
    }
    for (const n of nodes) for (const nextId of n.next) {
      const next = s.map.find(other => other.id === nextId);
      assert.equal(next.depth, depth + 1);
      if (next.col !== '공통') assert.ok(Math.abs(['좌', '중', '우'].indexOf(n.col) - ['좌', '중', '우'].indexOf(next.col)) <= 1);
    }
  }
  const depthKinds = s.map.filter(n => n.col === '좌' || n.col === '공통').map(n => n.kind);
  assert.equal(depthKinds.filter(k => k === 'normal').length, 7);
  assert.equal(depthKinds.filter(k => k === 'elite').length, 1);
  assert.equal(depthKinds.filter(k => k === 'boss').length, 1);
  assert.equal(depthKinds.filter(k => k === 'recovery').length, 4);
  assert.equal(depthKinds.filter(k => k === 'shop').length, 2);
  assert.equal(publicMap(s).filter(n => n.reachable).length, 3);
});

test('map projection exposes enemy templates, is detached and never draws stock', () => {
  const s = createGame(31002);
  const before = structuredClone(s);
  const map = publicMap(s);
  assert.ok(map[0].enemies.every(e => e.maxHp > 0 && e.attack > 0 && e.pattern && e.role));
  assert.ok(!JSON.stringify(map).includes('rng'));
  assert.ok(!JSON.stringify(s.rng).includes('상점'));
  assert.ok(!JSON.stringify(s.rng).includes('동료보상'));
  map[0].enemies[0].maxHp = 900;
  map[0].next.length = 0;
  assert.deepEqual(s, before);
  assert.deepEqual(createGame(31002), s);
});

test('node commitment prevents skipping fights and only adjacent next columns are reachable', () => {
  const s = createGame(31001);
  act(s, 'visit', '1-1-좌');
  assert.equal(s.phase, 'management');
  assert.throws(() => act(s, 'visit', '1-2-좌'));
  assert.throws(() => act(s, 'skip'));
  settleWin(s);
  assert.equal(new Set(s.rewards).size, 3);
  act(s, 'skip');
  assert.deepEqual(publicMap(s).filter(n => n.reachable).map(n => n.col), ['좌', '중']);
  assert.throws(() => act(s, 'visit', '1-2-우'));
  assert.equal(s.node.id, '1-1-좌');
});

test('recovery heals everyone immediately, advances once, and has no upgrade choice', () => {
  const s = createGame(31001);
  s.floors[1].upgraded = true;
  s.floors[1].hp = 2;
  s.floors[0].hp = 1;
  toDepth(s, 3);
  assert.equal(s.phase, 'map');
  assert.deepEqual(s.floors.slice(0, 3).map(e => e.hp), [4, 10, 3]);
  assert.equal(s.visited.length, 3);
  assert.throws(() => act(s, 'upgrade', s.floors[0].id));
});

test('battle settlement preserves HP, clears statuses, and does not auto-heal at next act', () => {
  const s = createGame(31001);
  act(s, 'visit', 1);
  s.floors[1].hp = 2;
  s.floors[1].tokens = { quick: 1, poison: 3, exhaustion: 2, rage: 4 };
  s.floors[1].defense = 5;
  s.floors[1].guardUsed = { A: 3, B: 2 };
  settleWin(s, 16);
  assert.equal(s.floors[1].hp, 2);
  assert.deepEqual(s.floors[1].tokens, { quick: 0, poison: 0, exhaustion: 0, rage: 0 });
  assert.deepEqual(s.floors[1].guardUsed, { A: 0, B: 0 });
  assert.equal(s.floors[1].defense, 0);
  assert.equal(s.phase, 'reward');
  assert.equal(s.stats.battles[0].rounds, 16);
  act(s, 'skip');
  toDepth(s, 18);
  s.floors[1].hp = 2;
  settleWin(s);
  const coins = s.coins;
  assert.equal(s.act, 1);
  act(s, 'reward', 1);
  assert.equal(s.act, 1);
  act(s, 'discard');
  assert.equal(s.act, 2);
  assert.equal(s.floors[1].hp, 2);
  assert.equal(s.coins, coins);
  assert.equal(s.visited.length, 18);
  assert.equal(s.map.length, 52);
});

test('pending reward locks all progress; replacements allowed only when all ten places occupied', () => {
  const s = createGame(31001);
  act(s, 'visit', 1);
  settleWin(s);
  act(s, 'reward', 1);
  for (const [cmd, args] of [['reward', [2]], ['swap', [1, 2]], ['visit', [1]], ['skip', []]]) assert.throws(() => campaignAction(s, cmd, args));
  assert.throws(() => act(s, 'place', 1));
  const expected = s.pending.entity.id;
  act(s, 'place', 4);
  assert.equal(s.floors[3].id, expected);
  assert.equal(s.phase, 'map');
  for (let i = 4; i < 10; i++) s.floors[i] = newEntity(s, 'saint', 'test');
  act(s, 'visit', 1);
  settleWin(s);
  act(s, 'reward', 1);
  const replacedId = s.floors[0].id;
  act(s, 'place', 1);
  assert.notEqual(s.floors[0].id, replacedId);
  assert.equal(s.stats.losses.at(-1).cause, 'replacement');
});

test('shop has eight reproducible independent slots; discarded purchase spends coins and stock', () => {
  const s = createGame(31003);
  toDepth(s, 5);
  assert.equal(s.phase, 'shop');
  assert.equal(s.shop.length, 8);
  assert.equal(s.coins, 9);
  const beforeRng = structuredClone(s.rng);
  const stock = structuredClone(s.shop);
  act(s, 'buy', 1);
  assert.equal(s.coins, 3);
  assert.equal(s.phase, 'place');
  assert.throws(() => act(s, 'leave'));
  act(s, 'discard');
  assert.equal(s.phase, 'shop');
  assert.equal(s.shop[0].purchased, true);
  assert.throws(() => act(s, 'buy', 1));
  assert.throws(() => act(s, 'buy', 2));
  assert.deepEqual(s.rng, beforeRng);
  assert.deepEqual(s.shop.slice(1), stock.slice(1));
  assert.equal(s.stats.purchases.length, 1);
  assert.equal(s.journal.filter(e => e.type === 'purchased').length, 1);
});

test('fusion preserves A body and two original upgrades, then upgrades A only without healing', () => {
  const s = createGame(31001);
  toDepth(s, 7, 'fusion');
  assert.equal(s.phase, 'fusion');
  const A = s.floors[1], B = s.floors[2];
  A.hp = 2;
  B.upgraded = true;
  const before = structuredClone(s);
  const preview = previewFusion(s, A.id, B.id);
  assert.deepEqual(s, before);
  assert.equal(preview.hp, 2);
  assert.equal(preview.maxHp, 6);
  act(s, 'fuse', A.id, B.id);
  const C = s.floors[1];
  assert.equal(C.hp, 2);
  assert.equal(maxHp(C), 6);
  assert.notEqual(C.id, A.id);
  assert.equal(s.floors[2], null);
  assert.equal(C.fusion.bUpgraded, true);
  assert.deepEqual(parts(C), [{ key: 'A', type: 'paladin', upgraded: false }, { key: 'B', type: 'choir', upgraded: true }]);
  assert.throws(() => previewFusion(s, C.id, s.floors[0].id));
  toDepth(s, 10, 'upgrade');
  assert.equal(s.phase, 'upgrade');
  C.hp = 2;
  act(s, 'upgrade', C.id);
  assert.equal(maxHp(C), 10);
  assert.equal(C.hp, 2);
  assert.equal(C.fusion.bUpgraded, true);
  assert.equal(C.upgraded, true);
  assert.equal(floorOf(s, C.id), 2);
});

test('escape gives no reward, boss escape loses, and loss never grants victory rewards', () => {
  const s = createGame(31001);
  act(s, 'visit', 1);
  s.battle = { round: 1, enemies: [], summary: { rounds: 1 } };
  credit(s, 1, 'one-kill');
  finishBattle(s, 'escape');
  assert.equal(s.phase, 'map');
  assert.equal(s.coins, 1);
  assert.deepEqual(s.rewards, []);
  assert.equal(s.visited.length, 1);
  toDepth(s, 18);
  s.battle = { round: 1, enemies: [], summary: { rounds: 1 } };
  finishBattle(s, 'escape');
  assert.equal(s.phase, 'lost');
  assert.deepEqual(s.rewards, []);
});

test('three-act economy is 27 rewards and 13 purchases with 3 coins; final reward must resolve', () => {
  const s = createGame(31001);
  const purchasesByAct = [];
  let wins = 0;
  while (!['won', 'lost'].includes(s.phase)) {
    if (s.phase === 'map') act(s, 'visit', 1);
    else if (s.phase === 'management') {
      settleWin(s);
      wins++;
      if (s.act === 3 && s.node.kind === 'boss') assert.equal(s.phase, 'reward');
    } else if (s.phase === 'reward') {
      act(s, 'reward', 1);
      if (s.act === 3 && s.node.kind === 'boss') assert.equal(s.phase, 'place');
    } else if (s.phase === 'place') {
      const empty = s.floors.findIndex(e => !e);
      act(s, 'place', empty < 0 ? 10 : empty + 1);
    } else if (s.phase === 'shop') {
      const available = s.shop.findIndex(item => !item.purchased);
      if (s.coins >= 6 && available >= 0) act(s, 'buy', available + 1);
      else {
        purchasesByAct.push([s.act, s.node.depth, s.stats.purchases.filter(p => p.act === s.act && p.depth === s.node.depth).length]);
        act(s, 'leave');
      }
    } else if (['upgrade', 'fusion'].includes(s.phase)) act(s, 'skip');
    else throw Error(`Unexpected phase ${s.phase}`);
  }
  assert.equal(s.phase, 'won');
  assert.equal(s.visited.length, 54);
  assert.equal(wins, 27);
  assert.equal(s.stats.acquired.filter(e => e.source === 'reward').length, 27);
  assert.equal(s.stats.purchases.length, 13);
  assert.equal(s.coins, 3);
  assert.deepEqual(purchasesByAct, [[1, 5, 1], [1, 17, 3], [2, 5, 2], [2, 17, 2], [3, 5, 2], [3, 17, 3]]);
  assert.throws(() => act(s, 'give-up'));
});

test('later act templates match attack breakpoints, long-card health and no late-act double F', () => {
  const s = createGame(31002);
  for (let targetAct = 1; targetAct <= 3; targetAct++) {
    assert.equal(s.act, targetAct);
    const boss = s.map.find(n => n.kind === 'boss').enemies[0];
    const elite = s.map.find(n => n.kind === 'elite').enemies[0];
    assert.equal(boss.maxHp, [5, 16, 24][targetAct - 1]);
    assert.equal(elite.maxHp, [5, 12, 14][targetAct - 1]);
    assert.deepEqual(boss.rows, [0, 1, 2]);
    assert.equal(boss.protection, targetAct === 1 ? 2 : 0);
    for (const n of s.map.filter(n => n.kind === 'normal')) {
      if (targetAct === 2 && n.depth >= 13) assert.ok(n.enemies.filter(e => e.type === 'F').length <= 1);
      for (const e of n.enemies) {
        const expected = targetAct === 1 ? n.depth >= 13 && e.type === 'D' ? 2 : 1
          : targetAct === 2 ? n.depth >= 13 && e.type === 'F' ? 4 : 2 : n.depth >= 7 ? 4 : 3;
        assert.equal(e.attack, expected);
        if (e.type === 'C') assert.equal(e.protection, targetAct);
      }
    }
    toDepth(s, 18);
    settleWin(s);
    act(s, 'skip');
  }
  assert.equal(s.phase, 'won');
});
