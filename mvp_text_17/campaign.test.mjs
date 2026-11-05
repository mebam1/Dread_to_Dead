import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignAction, createGame, finishBattle, previewFusion, publicMap} from './campaign.mjs';
import {credit, newEntity} from './shared.mjs';

// Isolate the node under test by placing the preceding visit on the centre path.
function visitFixture(s, kind, depth) {
  const node = s.map.find(n => n.kind === kind && n.depth === depth);
  const previous = s.map.find(n => n.depth === depth - 1 && ['중', '공통'].includes(n.col));
  s.visited = previous ? [previous.id] : [];
  campaignAction(s, 'visit', [node.id]);
  return node;
}

function finishFixture(s, outcome = 'win') {
  campaignAction(s, 'start');
  finishBattle(s, outcome);
}

test('각 막 지도는 20곳, 최초 3갈래, 이어진 경로만 방문하며 재고·이벤트는 미리 뽑지 않는다', () => {
  const s = createGame(31001);
  const map = publicMap(s);
  assert.deepEqual(s.floors.map(e => e?.type ?? null), ['gaze', null, 'owner', null, 'runes', 'safe', null, null, null, null]);
  assert.equal(map.length, 20);
  assert.equal(map.filter(n => n.reachable).length, 3);
  assert.deepEqual(map.filter(n => n.kind === 'fusion').map(n => n.depth), [2, 5]);
  assert.equal(map.find(n => n.kind === 'boss').guests[0].reward, 2);
  assert.equal(map.filter(n => n.kind === 'normal').every(n => n.guests.length === 3), true);
  assert.equal(map.filter(n => n.depth === 6).every(n => n.next.length === 1), true);
  assert.ok(!Object.keys(s.rng).some(k => /상점|이벤트|굴림/.test(k)));
  assert.throws(() => campaignAction(s, 'visit', ['1-2-중']));
  campaignAction(s, 'visit', ['1-1-좌']);
  assert.throws(() => campaignAction(s, 'visit', ['1-1-중']));
  finishFixture(s, 'escape');
  assert.deepEqual(publicMap(s).filter(n => n.reachable).map(n => n.id), ['1-2-좌', '1-2-중']);
  assert.equal(s.rewards.length, 0);
});

test('획득 대기는 창고 없이 해당 거래만 허용하며, 빈층·만실·폐기 모두 한 번만 정산한다', () => {
  const s = createGame();
  visitFixture(s, 'shop', 3);
  s.souls = 20;
  s.actIncome = 6;
  const stock = structuredClone(s.shop);
  campaignAction(s, 'buy', [1]);
  assert.equal(s.souls, 20 - stock[0].price);
  assert.equal(s.actIncome, 6);
  const id = s.pending.entity.id;
  for (const [cmd, args] of [['swap', [1, 2]], ['buy', [2]], ['leave', []], ['fuse', ['e1', 'e2']], ['place', [1]]]) {
    assert.throws(() => campaignAction(s, cmd, args));
  }
  campaignAction(s, 'place', [10]);
  assert.equal(s.floors[9].id, id);
  assert.throws(() => campaignAction(s, 'buy', [1]));
  for (let i = 0; i < 10; i++) s.floors[i] ??= newEntity(s, 'gaze', 'fixture');
  const removed = s.floors[9].id;
  campaignAction(s, 'buy', [2]);
  const incoming = s.pending.entity.id;
  campaignAction(s, 'place', [10]);
  assert.equal(s.floors.filter(Boolean).length, 10);
  assert.equal(s.floors[9].id, incoming);
  assert.ok(!s.floors.some(e => e.id === removed));
  const roster = structuredClone(s.floors);
  campaignAction(s, 'buy', [3]);
  campaignAction(s, 'discard');
  assert.deepEqual(s.floors, roster);
  assert.equal(s.shop.filter(slot => slot.sold).length, 3);
  assert.equal(s.souls, 20 - stock.slice(0, 3).reduce((n, item) => n + item.price, 0));
  campaignAction(s, 'leave');
  assert.equal(s.phase, 'map');
});

test('융합은 전용 방문에서만 비가역적이고 본체 상태만 계승한다. 미리보기·잘못된 선택은 무소모다', () => {
  const s = createGame(31002);
  const a = s.floors[2], b = s.floors[0];
  Object.assign(a, {upgraded: true, tokens: 1, damage: 7});
  b.upgraded = true;
  assert.throws(() => campaignAction(s, 'fuse', [a.id, b.id]));
  visitFixture(s, 'fusion', 2);
  const before = structuredClone(s);
  assert.match(previewFusion(s, a.id, b.id).donorEffect, /통과 시 불안 \+5$/);
  assert.throws(() => campaignAction(s, 'fuse', [a.id, a.id]));
  assert.throws(() => campaignAction(s, 'fuse', [a.id, b.id, 2]));
  assert.deepEqual(s, before);
  campaignAction(s, 'fuse', [a.id, b.id]);
  const c = s.floors[2];
  assert.match(c.fusion.name, / 융합체$/);
  assert.deepEqual(c.fusion.thumbnail, {left: 'owner', right: 'gaze'});
  assert.ok(![a.id, b.id].includes(c.id));
  assert.equal(c.donor, 'gaze');
  assert.deepEqual([c.damage, c.tokens, c.upgraded, s.floors[0]], [7, 1, true, null]);
  assert.equal(s.phase, 'map');
  visitFixture(s, 'fusion', 5);
  assert.throws(() => campaignAction(s, 'fuse', [c.id, s.floors[4].id]));
  assert.throws(() => campaignAction(s, 'fuse', [s.floors[4].id, c.id]));
  campaignAction(s, 'skip');
  assert.equal(s.souls, 2);
});

test('회복은 총 2토큰 이내, 강화는 개체당 한 번이며 발소리만 최대·현재 토큰이 함께 증가한다', () => {
  const s = createGame();
  const a = s.floors[0], b = s.floors[2];
  a.tokens = b.tokens = 1;
  visitFixture(s, 'recovery', 3);
  assert.throws(() => campaignAction(s, 'heal', [a.id, a.id]));
  assert.deepEqual([a.tokens, b.tokens], [1, 1]);
  campaignAction(s, 'heal', [a.id, b.id]);
  assert.deepEqual([a.tokens, b.tokens], [2, 2]);
  const steps = s.floors[1] = newEntity(s, 'steps', 'fixture');
  steps.damage = 4;
  visitFixture(s, 'recovery', 7);
  campaignAction(s, 'upgrade', [steps.id]);
  assert.deepEqual([steps.damage, steps.tokens, steps.upgraded], [4, 2, true]);
  visitFixture(s, 'recovery', 7);
  assert.throws(() => campaignAction(s, 'upgrade', [steps.id]));
});

test('엘리트 보상은 괴이 처분 후 주사위 교체를 한 번만 허용하며 보스 탈출은 패배다', () => {
  const s = createGame();
  visitFixture(s, 'elite', 4);
  finishFixture(s);
  assert.equal(new Set(s.rewards).size, 3);
  assert.throws(() => campaignAction(s, 'equip', [2]));
  campaignAction(s, 'reward', [2]);
  assert.throws(() => campaignAction(s, 'skip'));
  campaignAction(s, 'discard');
  const offered = s.offerDie;
  assert.ok(['long', 'even', 'anxiety'].includes(offered));
  campaignAction(s, 'equip', [2]);
  assert.equal(s.dice[1], offered);
  assert.equal(s.phase, 'map');
  visitFixture(s, 'boss', 8);
  finishFixture(s, 'escape');
  assert.equal(s.phase, 'lost');
  assert.equal(s.result, 'boss-escape');
});

test('이벤트 세 종류가 방문 후 공개되며 한도 9, 마지막 개체, 실제 지급과 객실 폐기를 존중한다', () => {
  // Deterministic examples for all three offers. These cases exercise isolated rules.
  const found = new Set();
  for (let seed = 31001; found.size < 3 && seed < 31100; seed++) {
    const s = createGame(seed);
    s.actIncome = 8;
    visitFixture(s, 'event', 2);
    const {kind} = s.event;
    if (found.has(kind)) continue;
    found.add(kind);
    if (kind === 'room') {
      assert.throws(() => campaignAction(s, 'deal'));
      s.souls = 3;
      campaignAction(s, 'deal');
      assert.equal(s.souls, 0);
      campaignAction(s, 'discard');
      assert.equal(s.floors.filter(Boolean).length, 4);
    } else {
      const cmd = kind === 'contract' ? 'contract' : 'cash';
      const args = kind === 'contract' ? [s.floors[0].id] : [];
      assert.equal(s.event.payout, 1);
      s.actIncome = 9;
      assert.throws(() => campaignAction(s, cmd, args));
      s.actIncome = 8;
      if (kind === 'contract') {
        const full = s.floors;
        s.floors = [full[0], ...Array(9).fill(null)];
        assert.throws(() => campaignAction(s, cmd, args));
        s.floors = full;
      } else {
        assert.ok(['long', 'even', 'anxiety'].includes(s.event.die));
      }
      campaignAction(s, cmd, args);
      assert.equal(s.actIncome, 9);
      assert.equal(s.souls, 3);
    }
    assert.equal(s.phase, 'map');
  }
  assert.equal(found.size, 3);
});

test('세 막 순차 진행에서 보스 수당 2·2·0, 막 경계 토큰, 마지막 보상 뒤 24회 방문을 정산한다', () => {
  const s = createGame();
  for (let act = 1; act <= 3; act++) {
    for (let depth = 1; depth <= 8; depth++) {
      const node = publicMap(s).find(n => n.reachable && ['중', '공통'].includes(n.col));
      assert.deepEqual([node.act, node.depth], [act, depth]);
      campaignAction(s, 'visit', [node.id]);
      if (node.kind === 'recovery') {
        campaignAction(s, 'skip');
        continue;
      }
      campaignAction(s, 'start');
      // Controlled combat outcomes: settlements here exercise the campaign boundaries.
      for (const guest of node.guests) credit(s, guest.reward, guest.id, node.kind === 'boss');
      s.floors[0].tokens = 1;
      finishBattle(s, 'win');
      if (act === 3 && depth === 8) assert.throws(() => campaignAction(s, 'giveup'));
      campaignAction(s, 'reward', [1]);
      if (act === 3 && depth === 8) assert.throws(() => campaignAction(s, 'giveup'));
      assert.equal(s.floors[0].tokens, 1);
      campaignAction(s, 'discard');
    }
    if (act < 3) {
      assert.deepEqual([s.floors[0].tokens, s.actIncome, s.souls], [2, 0, 2 + act * 11]);
    }
  }
  assert.deepEqual([s.phase, s.visited.length, s.floors[0].tokens, s.souls], ['won', 24, 1, 33]);
});
