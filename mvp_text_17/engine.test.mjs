import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog, createGame, execute, growthReport, loadRuleVersion, publicJournal, publicView, previewBattle} from './engine.mjs';
import {creatureStats, draw} from './shared.mjs';

test('17판 설정에 있는 15종의 추첨 순서·가격·내구와 막당 세 장의 예산', () => {
  const spec = readFileSync(new URL('../mvps/mvp-config-17.md', import.meta.url), 'utf8');
  const section = spec.split('## 4. 괴이 15종')[1].split('## 5.')[0];
  const rows = section.split(/\r?\n/).filter(line => /^\| [^|]+ \| \d/.test(line))
    .map(line => line.split('|').slice(1, -1).map(c => c.trim()));
  const cards = Object.values(catalog().creatures);
  assert.equal(rows.length, 15);
  assert.deepEqual(cards.map(card => card.name), rows.map(([name]) => name));
  rows.forEach(([, price, durability], index) => {
    const card = cards[index];
    assert.equal(card.price, parseInt(price));
    assert.equal(card.limit + '/' + card.maxTokens, durability);
    assert.ok(card.baseText);
  });
  assert.equal(cards.reduce((sum, card) => sum + card.price, 0) / 15 * 3, 11);
  for (const [type, limit, maxTokens] of [['steps',12,2], ['owner',13,2], ['barnacle',18,2], ['samara',14,2]]) {
    assert.deepEqual(creatureStats({type, upgraded:true}), {limit, maxTokens});
  }
});

test('31001의 중앙 입장 난수는 설정의 UTF-8 SHA-256 키와 일치하고 목적별로 독립적이다', () => {
  const s = {seed: 31001, rng: {}, node: {act: 1, depth: 1, col: '중'}};
  assert.equal(draw(s, '손님묶음', 3), 1);
  assert.deepEqual(Array.from({length: 3}, () => 1 + draw(s, '굴림', 6)), [3, 2, 2]);
});

test('공개 정보와 검토는 원본 장부를 변경하지 않고, 잘못된 선택도 결제·기록하지 않는다', () => {
  const s = createGame(31001);
  const view = publicView(s);
  assert.equal(view.floors.length, 10);
  assert.equal(view.map.length, 20);
  assert.equal(view.map.filter(n => n.kind === 'fusion').length, 2);
  assert.equal(view.map.some(n => n.kind === 'discovery'), false);
  assert.equal('rng' in view, false);
  view.floors[0].tokens = 0;
  assert.equal(s.floors[0].tokens, 2);
  const entry = view.map.find(n => n.depth === 1 && n.col === '중');
  execute(s, 'visit', [entry.id], '중앙 첫 손님 확인');
  execute(s, 'start', [], '초기 배치로 시작');
  assert.deepEqual(s.battle.rolls, [3, 2, 2]);
  const before = structuredClone(s);
  assert.throws(() => execute(s, 'choose', [4], '범위 밖'));
  assert.throws(() => execute(s, 'give-up', ['잘못된 추가 인자'], '포기'));
  assert.throws(() => execute(s, 'give-up', [], '  '));
  assert.throws(() => execute(s, 'fuse', ['e1', 'e2'], '전투 중에는 불가'));
  assert.deepEqual(previewBattle(s, 1), previewBattle(s, 1));
  assert.deepEqual(s, before);
  assert.ok(publicJournal(s, 100).some(entry => entry.reason === '중앙 첫 손님 확인'));
  assert.deepEqual(publicJournal(s, 0), []);
});

test('융합체의 속공 목록은 항상 A·B 순서이며 가능한 속공과 비용은 선택한 원본을 따른다', () => {
  const s = createGame(31001);
  const entity = s.floors[0];
  Object.assign(entity, {type: 'portrait', donor: 'prophet', fusion: {name: '빛바랜 융합체', bUpgraded: true}});
  s.version = 'text-17-v1.0';
  assert.ok(loadRuleVersion(s));
  const abilities = [{side: 'base', type: 'portrait'}, {side: 'donor', type: 'prophet'}];
  const sides = view => view.quickActions.filter(action => action.id === entity.id).map(action => action.side);
  const map = publicView(s);
  assert.deepEqual(map.floors[0].quickAbilities, abilities);
  assert.deepEqual(map.floors[2].quickAbilities, []);
  assert.deepEqual(map.floors[5].quickAbilities, [{side: 'base', type: 'safe'}]);
  assert.deepEqual(catalog().creatures.safe.quickAbilities, map.floors[5].quickAbilities);
  assert.deepEqual(sides(map), []);
  const entry = map.map.find(node => node.depth === 1 && node.col === '중');
  execute(s, 'visit', [entry.id], '손님 입장');
  execute(s, 'start', [], '영업 시작');
  execute(s, 'choose', [1], '주사위 확정');
  assert.deepEqual(sides(publicView(s)), []);
  Object.assign(s.battle, {anxiety: 7, prophecy: 1});
  assert.deepEqual(sides(publicView(s)), ['base', 'donor']);
  const face = s.battle.face;
  const base = execute(s, 'active', [entity.id, 'base'], '본체 초상화의 눈 +2');
  assert.deepEqual([base.battle.anxiety, base.battle.prophecy, base.battle.face], [0, 1, face + 2]);
  assert.deepEqual(sides(base), ['donor']);
  assert.deepEqual(base.floors[0].quickAbilities, abilities);
  const donor = execute(s, 'active', [entity.id, 'donor'], '강화 예언가의 재굴림');
  assert.deepEqual([donor.battle.anxiety, donor.battle.prophecy, donor.phase], [0, 0, 'choose']);
  assert.deepEqual(sides(donor), []);
  assert.deepEqual(donor.floors[0].quickAbilities, abilities);
});

test('획득 기록에는 이어진 영업의 실제 본체·공여 기여만 집계하고, 최종 보상은 후속 영업 0회다', () => {
  const s = createGame();
  const events = [
    {type: 'decision', reason: '도착 공포 확보'}, {type: 'fusion', a: 'e1', b: 'e2', c: 'e5', inherited: 'safe'},
    {type: 'guest-entry', index: 0}, {type: 'guest-entry', index: 1},
    {type: 'gain', source: 'e5', part: 'base', amount: 4},
    {type: 'fear', id: 'e5', part: 'donor', amount: 1},
    {type: 'income', paid: 1, boss: false}, {type: 'acquired', id: 'e6', source: 'reward', creature: 'visit'},
  ];
  for (const e of events) s.journal.push({act: 1, nodeId: '시험-노드', ...e});
  const report = growthReport(s);
  assert.equal(report.acts[0].earned, 1);
  assert.equal(report.acts[0].fusions[0].reason, '도착 공포 확보');
  const [{contribution}] = report.followUp.find(r => r.id === 'e5').nextTwoBattles;
  assert.equal(contribution.donorFear, 1);
  assert.equal(contribution.resourcesGained, 4);
  assert.equal(contribution.donorResources, 0);
  assert.deepEqual(report.followUp.find(r => r.id === 'e6').nextTwoBattles, []);
});
