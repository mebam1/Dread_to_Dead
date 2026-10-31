import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CREATURES, SERVICES } from './engine.js';

function entity(type, floor, overrides = {}) {
  return { id: `test-${type}-${floor ?? 'reserve'}`, type, floor, c: 0,
    p: CREATURES[type].maxP, uses: ['B', 'G'].includes(type) ? 2 : 0,
    shield: 0, ...overrides };
}

function battle({ seed = 101, round = 0, entities, visitor = {} } = {}) {
  const game = new Game(seed);
  game.s.round = round;
  game.startService();
  if (entities) game.s.entities = entities;
  Object.assign(game.s.visitor, visitor);
  return game;
}

function prepare(game, value, position = game.s.visitor.pos) {
  game.s.phase = 'choose';
  game.s.dice = [value, value, value];
  game.s.visitor.pos = position;
  game.choose(value);
}

function at(game, floor) {
  return game.s.entities.find(value => value.floor === floor);
}

test('new runs contain four initial creatures and eight services / twenty visitors', () => {
  const game = new Game(77);
  assert.equal(game.s.phase, 'management');
  assert.equal(game.s.money, 4);
  assert.equal(game.s.resets, 0);
  assert.equal(game.s.entities.length, 4);
  assert.equal(at(game, 1).type, 'U');
  assert.equal(at(game, 3).type, 'Q');
  assert.equal(at(game, 5).type, 'Q');
  assert.equal(at(game, 6).type, 'B');
  assert.equal(SERVICES.length, 8);
  assert.equal(SERVICES.reduce((sum, service) => sum + service.guests.length, 0), 20);
  assert.equal(SERVICES[3].guests.length, 1);
  assert.equal(SERVICES[7].guests.length, 1);
});

test('arrival never also applies pass effect; a pass can supply a later harvest', () => {
  const arrival = battle({ visitor: { t: 99 }, entities: [entity('U', 1), entity('Q', 3)] });
  prepare(arrival, 1, 0);
  arrival.move();
  assert.equal(arrival.s.visitor.a, 4);
  const harvest = battle({ visitor: { t: 99 }, entities: [entity('U', 1), entity('Q', 3)] });
  prepare(harvest, 3, 0);
  harvest.move();
  assert.equal(harvest.s.visitor.a, 0);
  assert.equal(harvest.s.visitor.f, 8);
});

test('hotel wraps from floor six to floor one and retains visitor state', () => {
  const game = battle({ visitor: { t: 99, a: 1, f: 5 }, entities: [entity('U', 1)] });
  prepare(game, 1, 6);
  assert.deepEqual(game.path(1), [1]);
  game.move();
  assert.equal(game.s.visitor.pos, 1);
  assert.equal(game.s.visitor.a, 5);
  assert.equal(game.s.visitor.f, 5);
});

test('a harvest effect removes at most one heart and discards excess fear', () => {
  const game = battle({ visitor: { t: 5, h: 3, a: 3 }, entities: [entity('Q', 3)] });
  prepare(game, 1, 2);
  game.move();
  assert.equal(game.s.visitor.h, 2);
  assert.equal(game.s.visitor.f, 0);
  assert.equal(game.s.stats.earned, 0);
});

test('two individual hits check tokens separately and reset attack progress', () => {
  const game = battle({ entities: [entity('Q', 3)] });
  prepare(game, 1, 2);
  game.move();
  assert.equal(at(game, 3).p, 1);
  assert.equal(at(game, 3).c, 0);
  const damaged = battle({ entities: [entity('Q', 3, { c: 11, p: 2 })] });
  prepare(damaged, 1, 2);
  damaged.move();
  assert.equal(at(damaged, 3).p, 1);
  assert.equal(at(damaged, 3).c, 6);
});

test('protection stacks and absorbs each hit before attack progress is added', () => {
  for (const [uses, expectedC] of [[1, 6], [2, 0]]) {
    const game = battle({ entities: [entity('G', 2), entity('Q', 3)] });
    prepare(game, 1, 2);
    for (let index = 0; index < uses; index++) game.active(at(game, 2).id, at(game, 3).id);
    game.move();
    assert.equal(at(game, 3).p, 2);
    assert.equal(at(game, 3).c, expectedC);
    assert.equal(at(game, 3).shield, 0);
    assert.equal(at(game, 2).uses, 2 - uses);
  }
});

test('guard arrival charges only future use and caps at two', () => {
  const game = battle({ entities: [entity('G', 2, { uses: 0 })] });
  prepare(game, 1, 1);
  game.move();
  assert.equal(at(game, 2).uses, 1);
  assert.throws(() => game.active(at(game, 2).id, at(game, 2).id));
  prepare(game, 6);
  // Keep the guard alive so this boundary test concerns the charge cap.
  at(game, 2).p = 5;
  game.move();
  assert.equal(at(game, 2).uses, 2);
  prepare(game, 6);
  game.move();
  assert.equal(at(game, 2).uses, 2);
});

test('repair spends exactly two anxiety, affects attack progress only and rejects invalid use', () => {
  const game = battle({ visitor: { a: 4 }, entities: [entity('R', 2), entity('Q', 3, { c: 9, p: 1 })] });
  prepare(game, 1, 2);
  game.active(at(game, 2).id, at(game, 3).id);
  assert.equal(game.s.visitor.a, 2);
  assert.equal(at(game, 3).c, 3);
  assert.equal(at(game, 3).p, 1);
  game.active(at(game, 2).id, at(game, 3).id);
  assert.equal(game.s.visitor.a, 0);
  assert.equal(at(game, 3).c, 0);
  const before = structuredClone(game.s);
  assert.throws(() => game.active(at(game, 2).id, at(game, 3).id));
  assert.deepEqual(game.s, before);
});

test('inactivity penalties occur on turns three, five and seven', () => {
  const game = battle({ entities: [entity('G', 2, { p: 20, uses: 0 })] });
  const expectedInactive = [1, 2, 0, 1, 0, 1, 0];
  for (let turn = 1; turn <= 7; turn++) {
    prepare(game, 6, 2);
    game.move();
    assert.equal(game.s.inactive, expectedInactive[turn - 1], `counter after turn ${turn}`);
    const penalties = Math.max(0, Math.floor((turn - 1) / 2));
    assert.equal(at(game, 2).p, 20 - turn - penalties, `tokens after turn ${turn}`);
    assert.equal(game.s.inactiveLimit, turn < 3 ? 3 : 2);
  }
});

test('legal protection with no absorbed hit still resets inactivity to the three-turn threshold', () => {
  const game = battle({ entities: [entity('G', 2), entity('Q', 4)] });
  game.s.inactive = 1;
  game.s.inactiveLimit = 2;
  prepare(game, 6, 2);
  game.active(at(game, 2).id, at(game, 4).id);
  game.move();
  assert.equal(game.s.inactive, 0);
  assert.equal(game.s.inactiveLimit, 3);
  assert.equal(at(game, 4).c, 0);
  assert.equal(at(game, 4).shield, 0);
});

test('destroyed creatures disappear immediately and reserve creatures cannot prevent annihilation', () => {
  const game = battle({ entities: [entity('B', 1), entity('U', null)] });
  prepare(game, 1, 0);
  game.move();
  assert.equal(game.s.phase, 'lost');
  assert.equal(at(game, 1), undefined);
  assert.equal(game.s.entities.length, 1);
  assert.equal(game.s.entities[0].floor, null);
  assert.equal(game.s.stats.destroyed, 1);
  assert.equal(game.s.resets, 0);
  assert.throws(() => game.advance());
});

test('instant active kill cancels movement and awards a guest exactly once', () => {
  const game = battle({ visitor: { f: 6, a: 2, t: 12, h: 1 } });
  prepare(game, 3, 0);
  const bell = game.s.entities.find(value => value.type === 'B');
  game.active(bell.id);
  assert.equal(game.s.phase, 'guest_end');
  assert.equal(game.s.visitor.pos, 0);
  assert.equal(game.s.visitor.a, 2);
  assert.equal(game.s.money, 6);
  assert.equal(game.s.stats.kills, 1);
  assert.throws(() => game.active(bell.id));
  assert.throws(() => game.move());
  assert.equal(game.s.money, 6);
});

test('guest change resets attack progress but preserves tokens and remaining actives', () => {
  const game = battle({ visitor: { f: 6 } });
  const supply = at(game, 1);
  supply.c = 10;
  supply.p = 1;
  prepare(game, 1);
  const bell = at(game, 6);
  game.active(bell.id);
  game.advance();
  assert.equal(game.s.guestIndex, 1);
  assert.equal(game.s.phase, 'roll');
  assert.equal(at(game, 1).c, 0);
  assert.equal(at(game, 1).p, 1);
  assert.equal(at(game, 6).uses, 1);
  assert.equal(game.s.visitor.a, 0);
});

test('partial-service escape keeps earned rewards and skips only unspawned guests', () => {
  const game = battle({ visitor: { f: 6 } });
  at(game, 1).p = 1;
  prepare(game, 1);
  game.active(at(game, 6).id);
  game.advance();
  const nodesBefore = structuredClone(game.s.web);
  prepare(game, 3, 0);
  game.installEscape(2);
  assert.equal(game.s.phase, 'prepare');
  game.move();
  assert.equal(game.s.phase, 'service_end');
  assert.equal(game.s.visitor.pos, 2);
  assert.equal(game.s.stats.kills, 1);
  assert.equal(game.s.stats.escaped, 1);
  assert.equal(game.s.stats.skipped, 1);
  assert.equal(game.s.money, 6);
  assert.equal(game.s.resets, 1);
  assert.deepEqual(game.s.web, nodesBefore);
  game.advance();
  assert.equal(game.s.round, 1);
  assert.equal(game.s.phase, 'management');
  assert.equal(at(game, 1).p, 1);
  game.startService();
  assert.equal(at(game, 1).p, 2);
  assert.equal(at(game, 6).uses, 2);
});

test('escape contact precedes harvest, attack and inactivity penalties', () => {
  const game = battle({ visitor: { t: 8 }, entities: [entity('U', 1), entity('Q', 3)] });
  game.s.inactive = 2;
  prepare(game, 3, 0);
  game.installEscape(2);
  game.move();
  assert.equal(game.s.visitor.pos, 2);
  assert.equal(game.s.visitor.f, 0);
  assert.equal(game.s.stats.kills, 0);
  assert.equal(game.s.money, 4);
  assert.equal(game.s.stats.destroyed, 0);
  assert.equal(at(game, 1).p, 2);
  assert.equal(at(game, 3).p, 2);
});

test('intermediate boss escape advances while final boss escape is a loss', () => {
  for (const round of [3, 7]) {
    const game = battle({ round });
    prepare(game, 2, 0);
    game.installEscape(2);
    game.move();
    assert.equal(game.s.phase, round === 7 ? 'lost' : 'service_end');
    assert.equal(game.s.money, 4);
    assert.equal(game.s.resets, 1);
    if (round === 3) {
      game.advance();
      assert.equal(game.s.round, 4);
      assert.equal(game.s.phase, 'management');
    }
  }
});

test('final boss kill awards its fixed reward and ends the run without recovery', () => {
  const game = battle({ round: 7, visitor: { h: 1, f: 14 } });
  at(game, 1).p = 1;
  prepare(game, 1, 0);
  game.active(at(game, 6).id);
  assert.equal(game.s.phase, 'won');
  assert.equal(game.s.money, 14);
  assert.equal(game.s.stats.earned, 10);
  assert.equal(game.s.stats.kills, 1);
  assert.equal(game.s.resets, 1);
  assert.equal(at(game, 1).p, 1);
  assert.throws(() => game.advance());
});

test('full campaign boundary fixture visits twenty guests and awards the configured fifty-two', () => {
  const game = new Game(456);
  let count = 0;
  while (!['won', 'lost'].includes(game.s.phase)) {
    if (game.s.phase === 'management') game.startService();
    if (game.s.phase === 'roll') {
      // Set a deterministic final-heart opportunity: this checks campaign routing,
      // not the gameplay strength of a strategy or the balance of random seeds.
      game.s.visitor.h = 1;
      game.s.visitor.a = 3;
      game.s.visitor.f = Math.max(0, game.s.visitor.t - 12);
      prepare(game, 1, 2);
      game.move();
      count++;
    }
    if (['guest_end', 'service_end'].includes(game.s.phase)) game.advance();
    assert.ok(count <= 20);
  }
  assert.equal(game.s.phase, 'won');
  assert.equal(count, 20);
  assert.equal(game.s.stats.kills, 20);
  assert.equal(game.s.stats.earned, 52);
  assert.equal(game.s.money, 56);
});

test('web generation has twelve reachable nodes, all types, constrained roots and duplicate types', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const game = new Game(seed);
    const nodes = game.s.web.nodes;
    assert.equal(nodes.length, 12);
    assert.equal(new Set(nodes.map(node => node.id)).size, 12);
    assert.equal(new Set(nodes.map(node => node.type)).size, 6);
    const roots = nodes.filter(node => node.depth === 1);
    assert.equal(roots.length, 3);
    assert.ok(roots.some(node => ['G', 'E'].includes(node.type)));
    assert.ok(roots.some(node => ['U', 'Q'].includes(node.type)));
    assert.ok([4, 5, 6].includes(nodes.filter(node => node.depth === 2).length));
    for (const node of nodes.filter(node => node.depth > 1)) {
      const parent = nodes.find(candidate => candidate.id === node.parent);
      assert.ok(parent);
      assert.equal(parent.depth, node.depth - 1);
    }
    for (const root of roots) assert.ok(nodes.some(node => node.parent === root.id));
  }
});

test('web dependencies unlock on purchase, each node sells once and ownership does not block duplicates', () => {
  const game = new Game(15);
  game.s.money = 100;
  const root = game.s.web.nodes.find(node => node.depth === 1 && ['U', 'Q'].includes(node.type));
  const child = game.s.web.nodes.find(node => node.parent === root.id);
  assert.throws(() => game.buy(child.id));
  const beforeCount = game.s.entities.length;
  const ownedSameType = game.s.entities.filter(value => value.type === root.type).length;
  assert.ok(ownedSameType > 0);
  game.buy(root.id);
  assert.equal(root.bought, true);
  assert.equal(game.s.entities.length, beforeCount + 1);
  assert.equal(game.s.entities.filter(value => value.type === root.type).length, ownedSameType + 1);
  assert.equal(game.s.entities.at(-1).floor, null);
  const moneyAfter = game.s.money;
  assert.throws(() => game.buy(root.id));
  assert.equal(game.s.money, moneyAfter);
  game.buy(child.id);
  assert.equal(child.bought, true);
});

test('reset spends one saved right and replaces only the web', () => {
  const game = new Game(15);
  assert.throws(() => game.resetWeb());
  const root = game.s.web.nodes.find(node => node.depth === 1);
  game.buy(root.id);
  const assets = structuredClone(game.s.entities);
  const money = game.s.money;
  const oldIds = new Set(game.s.web.nodes.map(node => node.id));
  const generation = game.s.web.generation;
  game.s.resets = 2;
  game.resetWeb();
  assert.equal(game.s.resets, 1);
  assert.equal(game.s.money, money);
  assert.deepEqual(game.s.entities, assets);
  assert.ok(game.s.web.generation > generation);
  assert.ok(game.s.web.nodes.every(node => !node.bought && !oldIds.has(node.id)));
});

test('placement swaps floor occupants, stores an inventory replacement and never heals', () => {
  const game = new Game(15);
  const supply = at(game, 1);
  const harvest = at(game, 3);
  supply.c = 8;
  supply.p = 1;
  game.place(supply.id, 3);
  assert.equal(at(game, 3).id, supply.id);
  assert.equal(at(game, 1).id, harvest.id);
  assert.equal(supply.c, 8);
  assert.equal(supply.p, 1);
  game.store(supply.id);
  assert.equal(supply.floor, null);
  game.place(supply.id, 1);
  assert.equal(at(game, 1).id, supply.id);
  assert.equal(harvest.floor, null);
  assert.equal(supply.c, 8);
});

test('preview neither mutates state nor consumes future dice and is deterministic', () => {
  const game = new Game(8842);
  const control = new Game(8842);
  game.startService();
  control.startService();
  game.roll();
  control.roll();
  const before = structuredClone(game.s);
  for (const value of new Set(game.s.dice)) {
    const first = game.preview(value);
    const second = game.preview(value);
    assert.deepEqual(first, second);
    assert.deepEqual(game.s, before);
    assert.ok(Array.isArray(first.path));
    assert.ok(Array.isArray(first.events));
  }
  const value = game.s.dice[0];
  game.choose(value);
  control.choose(value);
  game.move();
  control.move();
  assert.deepEqual(game.s, control.s);
  if (game.s.phase === 'roll') {
    game.roll();
    control.roll();
    assert.deepEqual(game.s.dice, control.s.dice);
  }
});

test('a new game starts with initial assets after another game has changed', () => {
  const original = new Game(1);
  original.s.money = 99;
  original.s.resets = 4;
  original.s.entities = [];
  const restarted = new Game(2);
  assert.equal(restarted.s.money, 4);
  assert.equal(restarted.s.resets, 0);
  assert.equal(restarted.s.entities.length, 4);
  assert.equal(restarted.s.round, 0);
  assert.equal(restarted.s.stats.kills, 0);
});

test('protection already granted remains after its caster is destroyed', () => {
  const game = battle({
    visitor: { pattern: 'bossMirror' },
    entities: [entity('G', 2, { c: 6, p: 1 }), entity('Q', 6)]
  });
  prepare(game, 1, 3);
  game.active(at(game, 2).id, at(game, 6).id);
  game.move();
  assert.equal(at(game, 2), undefined);
  assert.equal(at(game, 6).c, 2);
  assert.equal(at(game, 6).p, 2);
  assert.equal(game.s.phase, 'roll');
});

test('charging on arrival does not protect a vulnerable guard in that turn', () => {
  const game = battle({ entities: [entity('G', 2, { c: 6, p: 1, uses: 0 })] });
  prepare(game, 1, 1);
  game.move();
  assert.equal(at(game, 2), undefined);
  assert.equal(game.s.phase, 'lost');
});

test('invalid repair targets do not spend anxiety even when some other target is legal', () => {
  const game = battle({
    visitor: { a: 4 },
    entities: [entity('R', 2), entity('Q', 3, { c: 6 }), entity('U', null, { c: 6 })]
  });
  prepare(game, 1, 2);
  const repair = at(game, 2).id;
  assert.throws(() => game.active(repair, repair));
  assert.equal(game.s.visitor.a, 4);
  assert.throws(() => game.active(repair, game.s.entities.find(value => value.floor === null).id));
  assert.equal(game.s.visitor.a, 4);
  assert.equal(at(game, 3).c, 6);
});

test('zero harvest and saturated supply do not count as activity', () => {
  const harvest = battle({ entities: [entity('Q', 3)] });
  prepare(harvest, 1, 2);
  harvest.move();
  assert.equal(harvest.s.inactive, 1);
  const supply = battle({ visitor: { a: 9 }, entities: [entity('U', 1)] });
  prepare(supply, 1, 0);
  supply.move();
  assert.equal(supply.s.visitor.a, 9);
  assert.equal(supply.s.inactive, 1);
});

test('penalty preview exposes candidates without drawing or damaging an actual target', () => {
  const game = battle({ entities: [entity('G', 2, { p: 3 }), entity('Q', 4, { p: 1 })] });
  game.s.inactive = 2;
  prepare(game, 1, 1);
  const before = structuredClone(game.s);
  const preview = game.preview(1);
  assert.deepEqual(game.s, before);
  assert.equal(preview.uncertainty.length, 2);
  assert.ok(preview.uncertainty.some(candidate => candidate.floor === 4 && candidate.destroyed));
  assert.ok(preview.events.some(event => event.kind === 'penalty_preview'));
  assert.ok(preview.events.every(event => event.kind !== 'penalty_start'));
  game.move();
  assert.ok(game.events.some(event => event.kind === 'penalty_start'));
});

test('an exit installed at the current floor requires a future actual visit', () => {
  const game = battle();
  prepare(game, 1, 2);
  game.installEscape(2);
  assert.equal(game.s.phase, 'prepare');
  game.move();
  assert.equal(game.s.phase, 'roll');
  assert.equal(game.s.visitor.pos, 3);
  prepare(game, 5);
  game.move();
  assert.equal(game.s.phase, 'service_end');
  assert.equal(game.s.visitor.pos, 2);
});

test('a newly destroyed floor can hold an exit in the next preparation phase', () => {
  const game = battle({ entities: [entity('B', 1), entity('Q', 3)] });
  prepare(game, 1, 0);
  assert.throws(() => game.installEscape(1));
  game.move();
  assert.equal(game.s.phase, 'roll');
  assert.equal(at(game, 1), undefined);
  prepare(game, 1);
  game.installEscape(1);
  assert.equal(game.s.escape, 1);
});

test('an old purchase still unlocks its descendants after the purchased creature is lost', () => {
  const game = new Game(21);
  game.s.money = 100;
  const parent = game.s.web.nodes.find(node => node.depth === 1);
  game.buy(parent.id);
  const acquired = game.s.entities.at(-1);
  game.s.entities = game.s.entities.filter(value => value.id !== acquired.id);
  const child = game.s.web.nodes.find(node => node.parent === parent.id);
  assert.equal(game.webReason(child.id), '');
  game.buy(child.id);
  assert.equal(child.bought, true);
});
