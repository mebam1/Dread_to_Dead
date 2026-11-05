import test from 'node:test';
import assert from 'node:assert/strict';
import { newEntity } from './shared.mjs';
import { availableQuickActions, combatAction, previewBattle, startBattle } from './combat.mjs';

const guest = { id: 'N1', name: '설정 17 판정 시험', t: 100, h: 1, reward: 1, pattern: 'route', power: 1, doublePower: 1, mirrorPower: 1 };

function battle(types, guests = [guest], kind = 'normal') {
  const s = {
    floors: Array(10).fill(null), act: 1, node: { id: 'test', act: 1, depth: 1, col: '중', kind },
    dice: ['normal', 'even', 'anxiety'], sequence: 0, seed: 31001, rng: {}, journal: [], actIncome: 0, souls: 2,
  };
  types.forEach((type, i) => { if (type) s.floors[i] = newEntity(s, type, 'test'); });
  startBattle(s, guests);
  return s;
}

function choose(s, face, slot = 1) {
  s.battle.rolls[slot - 1] = face;
  combatAction(s, 'choose', [slot]);
}

function use(s, i, side = 'base', j) {
  const args = [s.floors[i - 1].id, side];
  if (j) args.push(s.floors[j - 1].id);
  return combatAction(s, 'active', args);
}

const move = s => combatAction(s, 'move', []).outcome;

test('guest attack offsets stop at the hotel edges in both preview and actual play', () => {
  const scenarios = [
    // Pattern, turn, starting floor, movement, targeted floors in attack order.
    ['bossMirror', 1, 10, 1, [3]],
    ['bossMirror', 1, 9, 1, [8]],
    ['mirror', 1, 1, 1, [4]],
    ['mirror', 1, 8, 1, [7]],
    ['mirror', 1, 2, 1, [1, 5]],
    ['adjacent', 1, 10, 1, [1]],
    ['adjacent', 1, 9, 1, [9, 10]],
    ['final', 2, 10, 1, [3]],
    ['final', 1, 10, 1, [1, 1]],
    ['route', 1, 9, 3, [10, 1, 2]],
  ];
  const targetFloors = events => events.filter(e => e.type === 'hit' || e.type === 'miss').map(e => e.floor);
  for (const [pattern, turn, position, face, expected] of scenarios) {
    const s = battle(Array(10).fill('portrait'), [{...guest, pattern}]);
    s.floors[3] = null; // An in-range empty target still produces a miss.
    Object.assign(s.battle, {turn, position});
    s.battle.rolls[0] = face;
    const label = pattern + ' from floor ' + position + ', turn ' + turn;
    assert.deepEqual(targetFloors(previewBattle(s, 1).events), expected, label + ' preview');
    combatAction(s, 'choose', [1]);
    move(s);
    assert.deepEqual(targetFloors(s.journal), expected, label + ' actual');
  }
});

test('A before B, intermediate hearts absorb excess, terminal heart cancels attacks and credits once', () => {
  const s = battle(['gaze', 'owner'], [{ ...guest, t: 2, h: 2 }]);
  s.floors[0].donor = 'gaze';
  s.floors[1].donor = 'owner';
  choose(s, 2);
  move(s);
  assert.deepEqual(s.journal.filter(x => x.type === 'gain' && x.source === 'e1').map(x => [x.part, x.amount]), [['base', 4], ['donor', 4]]);
  assert.equal(s.battle.hearts, 1);
  assert.equal(s.battle.anxiety, 0);
  assert.equal(s.battle.fear, 0);
  assert.equal(s.souls, 2);
  s.floors[1].donor = 'runes';
  s.battle.position = 0;
  choose(s, 2);
  const before = s.journal.filter(x => x.type === 'hit').length;
  assert.equal(previewBattle(s).outcome, 'win');
  assert.equal(move(s), 'win');
  assert.equal(s.journal.filter(x => x.type === 'hit').length, before);
  assert.equal(s.souls, 3);
  assert.equal(s.journal.filter(x => x.type === 'income').length, 1);
});

test('both footsteps grow without spending and retain their own arrival gains between guests', () => {
  const s = battle(['steps', 'gaze', 'owner'], [{ ...guest, t: 2 }, guest]);
  s.floors[0].donor = 'steps';
  choose(s, 3);
  move(s);
  assert.equal(s.battle.index, 1);
  assert.equal(s.floors[0].stepBase, 1);
  assert.equal(s.floors[0].stepDonor, 1);
  assert.equal(s.battle.anxiety, 0);
  assert.equal(s.floors[0].damage, 0);
  choose(s, 1);
  move(s);
  assert.equal(s.battle.anxiety, 4);
  s.battle.position = 0;
  s.battle.anxiety = 99;
  choose(s, 3);
  move(s);
  assert.equal(s.floors[0].stepBase, 1);
});

test('rat king on either side uses actual gains and owner spends the full remaining stock', () => {
  const s = battle(['gaze', 'ratKing']);
  s.battle.anxiety = 97;
  s.floors[1].donor = 'owner';
  choose(s, 2);
  move(s);
  assert.equal(s.battle.fear, 2 + 91);
  assert.equal(s.battle.anxiety, 0);
  s.battle.position = 1;
  s.battle.anxiety = 8;
  s.floors[1].type = 'gaze';
  s.floors[1].donor = 'ratKing';
  choose(s, 1);
  move(s);
  assert.equal(s.battle.fear, 93);
});

test('quick actions respect adjacency including 1/10, donor costs and seals', () => {
  const s = battle(['portrait', 'samara', null, null, null, null, null, null, null, 'safe']);
  s.floors[0].donor = 'mouse';
  s.floors[9].damage = 7;
  s.battle.anxiety = 20;
  s.battle.prophecy = 2;
  choose(s, 1);
  const snapshot = structuredClone(s);
  const legal = availableQuickActions(s);
  assert.deepEqual(s, snapshot);
  assert.ok(legal.some(a => a.id === 'e1' && a.side === 'donor' && a.target === 'e3'));
  assert.ok(!legal.some(a => a.id === 'e2'));
  assert.throws(() => use(s, 2));
  assert.equal(s.battle.prophecy, 2);
  use(s, 1, 'donor', 10);
  assert.equal(s.floors[9].damage, 1);
  assert.equal(s.journal.at(-1).repaired, 6);
  assert.equal(s.journal.at(-1).part, 'donor');
  assert.equal(s.floors[9].seal, 2);
  assert.throws(() => use(s, 10));
  use(s, 1);
  assert.equal(s.battle.face, 3);
  use(s, 2);
  assert.equal(s.battle.face, 2);
  assert.equal(s.battle.anxiety, 9);
});

test('불안 + 강화 네펜데스는 한 층에서 불안 생산, 피격 탐욕, 대리 방어 속공을 모두 쓴다', () => {
  const s = battle(['gaze', 'owner']);
  const e = s.floors[0];
  Object.assign(e, {donor: 'nepenthes', fusion: {bUpgraded: true}});
  choose(s, 2);
  const forecast = previewBattle(s);
  move(s);
  assert.equal(s.battle.fear, 4);
  assert.equal(s.battle.greed, 1);
  assert.equal(forecast.after.battle.greed, s.battle.greed);
  s.battle.greed = 2;
  choose(s, 1);
  assert.ok(availableQuickActions(s).some(a => a.side === 'donor' && a.target === s.floors[1].id));
  use(s, 1, 'donor', 2);
  assert.equal(e.defense, 8);
  assert.equal(s.battle.greed, 0);
  assert.equal(s.battle.guards[s.floors[1].id], e.id);
});

test('같은 금고 두 개는 피격과 잠복 해제에 둘 다 반응하고 최종 처치에서는 즉시 멈춘다', () => {
  const s = battle(['safe']);
  Object.assign(s.floors[0], {donor: 'safe', fusion: {bUpgraded: true}});
  choose(s, 1);
  use(s, 1, 'donor');
  const preview = previewBattle(s);
  assert.deepEqual(preview.events.filter(e => e.type === 'fear').map(e => [e.part, e.amount]), [['base', 2], ['donor', 3]]);
  move(s);
  assert.equal(s.battle.fear, 5);
  assert.equal(s.battle.greed, 2);
  s.battle.guest.t = 7;
  s.battle.position = 0;
  choose(s, 1);
  use(s, 1);
  assert.deepEqual(previewBattle(s).events.filter(e => e.type === 'fear').map(e => e.part), ['base']);
  assert.equal(move(s), 'win');
});

test('예언된 방문끼리 융합하면 각 통과 비용과 표적을 별도로 관리한다', () => {
  const s = battle(['visit']);
  Object.assign(s.floors[0], {donor: 'visit', fusion: {bUpgraded: true}});
  s.battle.prophecy = 4;
  choose(s, 2);
  assert.deepEqual(previewBattle(s).uncertainties.map(u => u.part), ['base', 'donor']);
  move(s);
  const e = s.floors[0];
  assert.equal(e.ambush, 3);
  assert.equal(s.battle.prophecy, 0);
  assert.deepEqual(s.journal.filter(ev => ev.type === 'ambush-target').map(ev => ev.target), [e.target, e.partnerTarget]);
  Object.assign(e, {ambush: 1, target: 4, partnerTarget: 3});
  choose(s, 1);
  assert.equal(previewBattle(s).after.battle.fear, 10);
  move(s);
  assert.equal(s.battle.fear, 10);
  assert.equal(e.partnerTarget, null);
});

test('rerolls preserve paid actions, gained anxiety, ambush and the exit; no automatic prophecy fear', () => {
  const s = battle(['prophet', 'safe']);
  s.battle.prophecy = 8;
  s.floors[0].upgraded = true;
  choose(s, 3, 3);
  use(s, 2);
  combatAction(s, 'exit', [9]);
  use(s, 1);
  assert.equal(s.phase, 'choose');
  assert.equal(s.battle.prophecy, 7);
  assert.equal(s.battle.gainedAnxiety, 1);
  assert.equal(s.floors[1].ambush, 99);
  assert.equal(s.battle.exit, 9);
  choose(s, 3, 3);
  assert.equal(s.battle.anxiety, 2);
  assert.equal(s.battle.fear, 0);
});

test('collector strictly targets unsealed creatures and blocks all effects including victim hit greed and pending release', () => {
  const s = battle(['collector', 'safe']);
  s.floors[1].ambush = 1;
  choose(s, 2);
  use(s, 1, 'base', 2);
  assert.equal(s.journal.at(-1).defenseGranted, 10);
  assert.equal(s.journal.at(-1).defenseTarget, s.floors[1].id);
  assert.throws(() => use(s, 1, 'base', 2));
  assert.equal(s.floors[1].defense, 10);
  use(s, 1, 'base', 1);
  assert.equal(s.battle.active, false);
  move(s);
  assert.equal(s.battle.fear, 0);
  assert.equal(s.floors[1].ambush, 0);
  assert.equal(s.floors[1].seal, 5);
  assert.equal(s.floors[1].damage, 0);
  assert.equal(s.battle.greed, 0);
});

test('safe releases immediately on arrival and can kill before donor or an attack', () => {
  const s = battle(['safe'], [{ ...guest, t: 3 }], 'boss');
  s.floors[0].upgraded = true;
  s.floors[0].donor = 'runes';
  choose(s, 1);
  use(s, 1);
  assert.throws(() => use(s, 1));
  const view = previewBattle(s);
  assert.equal(view.outcome, 'win');
  assert.deepEqual(view.events.filter(e => e.type === 'fear').map(e => e.amount), [3]);
  assert.equal(move(s), 'win');
  assert.equal(s.actIncome, 0);
  assert.equal(s.journal.find(e => e.type === 'income').boss, true);
});

test('foretold visit previews all ten targets without drawing and releases after the following movement', () => {
  const s = battle(['visit']);
  s.battle.prophecy = 2;
  s.floors[0].upgraded = true;
  choose(s, 2);
  const before = structuredClone(s);
  const view = previewBattle(s);
  assert.deepEqual(s, before);
  assert.equal(view.after.floors[0].target, null);
  assert.equal(view.uncertainties[0].floors.length, 10);
  assert.ok(!view.events.some(e => e.type === 'roll' || e.type === 'ambush-target'));
  move(s);
  assert.equal(s.floors[0].ambush, 1);
  const target = s.floors[0].target;
  assert.ok(target >= 1 && target <= 10);
  s.battle.position = target === 1 ? 10 : target - 1;
  choose(s, 1);
  assert.equal(previewBattle(s).after.battle.fear, 10);
  move(s);
  assert.equal(s.battle.fear, 10);
  assert.equal(s.floors[0].target, null);
});

test('guard chains absorb only on final recipient, reject cycles before payment and sever on death', () => {
  const s = battle(['nepenthes', 'nepenthes', 'gaze'], [{ ...guest, pattern: 'double', doublePower: 20 }]);
  choose(s, 3);
  s.battle.greed = 20;
  use(s, 1, 'base', 3);
  use(s, 2, 'base', 1);
  const before = structuredClone(s);
  assert.throws(() => use(s, 1, 'base', 2));
  assert.deepEqual(s, before);
  s.floors[1].tokens = 1;
  move(s);
  const hits = s.journal.filter(x => x.type === 'hit');
  assert.deepEqual(hits.map(h => h.receiver), [2, 1]);
  assert.deepEqual(hits.map(h => h.absorbed), [4, 4]);
  assert.equal(s.floors[1], null);
  assert.equal(s.floors[2].damage, 0);
  assert.equal(s.battle.greed, 17);
});

test('barnacle applies per paid use to unique occupied passed floors only, independent of visiting the caster', () => {
  const s = battle(['gaze', 'owner', 'barnacle']);
  choose(s, 12);
  s.battle.greed = 2;
  use(s, 3);
  use(s, 3);
  const view = previewBattle(s);
  const grants = view.events.filter(x => x.type === 'pass-defense').map(x => x.floor);
  assert.deepEqual(grants, [1, 3, 1, 3]);
  assert.equal(view.path.length, 12);
  assert.equal(view.events.filter(x => x.type === 'hit' && x.floor === 1).length, 2);
  move(s);
  assert.equal(s.floors[0].defense, 0);
  assert.equal(s.floors[0].damage, 0);
  assert.equal(s.floors[1].damage, 2);
});

test('preview of inactivity enumerates public possible targets, hides actual one and matches seeded resolution', () => {
  const s = battle(['safe', 'portrait']);
  s.battle.idle = 2;
  s.battle.position = 4;
  choose(s, 1);
  const view = previewBattle(s);
  assert.deepEqual(view.uncertainties[0].options.map(o => [o.floor, o.damage, o.tokens, o.idleLimit]), [[1, 12, 2, 3], [2, 0, 1, 2]]);
  assert.ok(!view.events.some(e => e.penalty));
  move(s);
  const hit = s.journal.find(e => e.penalty);
  const option = view.uncertainties[0].options.find(o => o.floor === hit.floor);
  assert.equal(s.floors[hit.floor - 1].damage, option.damage);
  assert.equal(s.battle.idleLimit, option.idleLimit);
});

test('exit contact precedes all effects, boss escape and last creature destruction end immediately', () => {
  for (const kind of ['normal', 'elite', 'boss']) {
    const s = battle([null, 'owner'], [guest], kind);
    choose(s, 2);
    combatAction(s, 'exit', [1]);
    assert.equal(previewBattle(s).outcome, kind === 'boss' ? 'loss' : 'escape');
    assert.equal(move(s), 'escape');
    assert.equal(s.journal.filter(e => e.type === 'hit').length, 0);
  }
  const s = battle(['portrait'], [{ ...guest, pattern: 'double', doublePower: 8 }]);
  s.floors[0].tokens = 1;
  choose(s, 1);
  assert.equal(move(s), 'loss');
  assert.equal(s.journal.filter(e => e.type === 'hit').length, 1);
});
