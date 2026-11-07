import test from 'node:test';
import assert from 'node:assert/strict';
import * as previous from '../mvp_text_19/engine.mjs';
import { newEntity } from '../mvp_text_19/shared.mjs';
import { createGame, execute, previewBattle, publicView, upgradeSave } from './engine.mjs';

const enemy = (overrides = {}) => ({
  type:'A', role:'attack', pattern:'double', strong:false, firstCounter:1, period:2,
  maxHp:70, protection:0, ...overrides
});

function battle(placement, templates = [enemy()]) {
  const s = createGame();
  execute(s, 'visit', [s.map[0].id], '검증 전투');
  s.node.enemies = templates;
  s.floors.fill(null);
  for (const [x, type] of placement) s.floors[x-1] = newEntity(s, type);
  execute(s, 'start', [], '검증 전투');
  return s;
}
const eventsOf = (events, type) => events.filter(event => event.type === type);
const firstBranch = (s, id, slot, direction) => previewBattle(s, id, slot, direction).scenarios[0];

test('31900 양쪽 같은 도착, 다른 밀림. 검토·잘못된 확정은 주사위를 소비하지 않는다', () => {
  const s = createGame(31900);
  execute(s, 'visit', [s.map.find(n => n.depth === 1 && n.col === '우').id], '오른길');
  execute(s, 'start', [], '시작');
  const [saint, paladin, choir] = s.floors;
  assert.deepEqual(s.battle.dice, [3,4,5]);
  const snapshot = structuredClone(s);
  for (const direction of ['left','right']) {
    const branch = firstBranch(s, choir.id, 3, direction);
    const visits = eventsOf(branch.events, 'visit');
    assert.deepEqual(visits.map(e => e.x), direction === 'left' ? [2,1,10,9,8] : [4,5,6,7,8]);
    assert.equal(branch.enemies.find(e => e.pos === 8).hp, 0);
    assert.deepEqual(branch.allies.map(a => [a.id,a.x]), [
      [saint.id, direction === 'left' ? 2 : 1], [paladin.id, direction === 'left' ? 3 : 2], [choir.id,8]
    ]);
  }
  assert.throws(() => execute(s, 'move', [choir.id,3], '방향 없음'));
  assert.throws(() => execute(s, 'move', [choir.id,3,'up'], '잘못된 방향'));
  assert.throws(() => previewBattle(s, choir.id, 4, 'left'));
  assert.deepEqual(s, snapshot);
  const branch = firstBranch(s, choir.id, 3, 'left');
  const before = s.journal.length;
  execute(s, 'move', [choir.id,3,'left'], '성가대원 왼쪽');
  const actual = s.journal.slice(before+1).slice(0,branch.events.length);
  const normalize = rows => rows.map(({index,...row}) => row);
  assert.deepEqual(normalize(actual), normalize(branch.events));
  assert.deepEqual(actual[0].dice, [3,4,5]);
  assert.equal(s.battle.turn, 2);
});

test('추기경을 먼저 옮기고 다음 성전사 이동으로 성가대원 반응을 완성한다', () => {
  const s = battle([[3,'crusader'],[4,'choir'],[7,'cardinal']], [enemy({maxHp:50})]);
  s.battle.enemies[0].pos = 8;
  const crusader = s.floors[2].id, choir = s.floors[3].id, cardinal = s.floors[6].id;
  s.battle.dice = [1,1,1];
  const setup = firstBranch(s, cardinal, 1, 'left');
  const bridge = [{x:4,id:choir}, {x:8,id:null}];
  assert.deepEqual(eventsOf(setup.events, 'visit').at(-1).bridge, bridge);
  execute(s, 'move', [cardinal,1,'left'], '추기경으로 반응 준비');
  assert.deepEqual(s.journal.findLast(e => e.type === 'visit').bridge, bridge);
  s.battle.dice = [2,5,5];
  for (const dir of ['left','right']) {
    const branch = firstBranch(s, crusader, 2, dir);
    assert.equal(branch.enemies[0].hp, dir === 'left' ? 20 : 30);
    const arrival = eventsOf(branch.events, 'visit').at(-1);
    assert.deepEqual(arrival.neighbors, dir === 'left' ? [choir] : []);
    assert.deepEqual(eventsOf(branch.events, 'reaction').map(e => e.source), dir === 'left' ? [choir] : []);
    assert.equal(branch.allies.find(a => a.id === crusader).tokens.exhaustion, 8);
    assert.deepEqual(firstBranch(s, crusader, 3, dir).events.slice(1), branch.events.slice(1));
  }
  const view = execute(s, 'move', [crusader,3,'left'], '왼쪽으로 연계');
  assert.deepEqual(view.floors[7].neighbors, [choir]);
  assert.equal(s.journal.findLast(e => e.type === 'drop').slot, 3);
});

test('좌측 경계의 통과 가스는 고정 좌표, 도착 점유자는 통과 효과 없이 밀린다', () => {
  const s = battle([[1,'sprayer'],[2,'saint'],[10,'gourmet']]);
  const [sprayer, saint] = s.floors;
  s.battle.dice = [3,1,6];
  const branch = firstBranch(s, saint.id, 1, 'left');
  assert.deepEqual(eventsOf(branch.events, 'visit').map(e => e.x), [1,10,9]);
  assert.deepEqual(eventsOf(branch.events, 'gas-installed').map(e => [e.x,e.after]), [[1,6]]);
  assert.equal(branch.allies.find(a => a.id === sprayer.id).x, 2);
  const wrapped = firstBranch(s, sprayer.id, 2, 'left');
  assert.deepEqual(eventsOf(wrapped.events, 'pass-effect'), []);
  assert.deepEqual(eventsOf(wrapped.events, 'visit')[0].neighbors, []);
  assert.deepEqual(eventsOf(wrapped.events, 'push').map(e => [e.from,e.to]), [[10,1]]);
});

test('예고는 적 행동 순서의 밀림, 빗나감, 지원, 대신 받은 실제 피해를 반영한다', () => {
  const s = battle([[3,'choir'],[4,'paladin'],[9,'saint']], [
    enemy({type:'B',role:'support',pattern:'path'}), enemy({type:'C',pattern:'neighbor'})
  ]);
  const choir = s.floors[2].id, paladin = s.floors[3].id, saint = s.floors[8].id;
  const [b,c] = publicView(s).battle.enemies.map(e => e.intent);
  assert.deepEqual(b.path, [3,4,5]);
  assert.deepEqual(b.hits.map(hit => hit.targetId), [choir,paladin,null]);
  assert.equal(c.round, 2);
  assert.equal(c.from, 4);
  assert.equal(c.firstHitBonus, 2);
  assert.deepEqual(c.positions, [3,4]);
  assert.equal(c.hits[0].damage[0].target, paladin);
  assert.equal(c.hits[0].damage[0].redirected, true);
  assert.equal(c.hits[0].damage[0].hpLoss, 0);
  s.battle.turn = 3;
  s.battle.dice = [1,2,3];
  const preview = firstBranch(s, saint, 1, 'left');
  const ahead = eventsOf(preview.events, 'counterattack');
  assert.deepEqual(ahead.map(e => e.hits), [b.hits,c.hits]);
  const before = s.journal.length;
  execute(s, 'move', [saint,1,'left'], '라운드 마침');
  assert.deepEqual(eventsOf(s.journal.slice(before), 'counterattack').map(e => e.hits), [b.hits,c.hits]);
});

test('연기 경로, 철수 접촉으로 중단된 적, 빗나간 첫 타격의 지원 소모', () => {
  const s = battle([[1,'saint']], [enemy({pattern:'path'}), enemy({role:'support'})]);
  s.battle.enemies[0].pos = 9;
  let [first] = publicView(s).battle.enemies.map(e => e.intent);
  assert.equal(first.deferred, true);
  assert.deepEqual(first.path, [10,1,2]);
  assert.deepEqual(first.hits, []);
  execute(s, 'exit', [10], '적 경로에서 철수');
  const intents = publicView(s).battle.enemies.map(e => e.intent);
  assert.deepEqual(intents[0].path, [10]);
  assert.equal(intents[0].exitAt, 10);
  assert.equal(intents[1].interrupted, true);
  s.battle.exit = null;
  s.battle.enemies[0].pos = 2;
  [first] = publicView(s).battle.enemies.map(e => e.intent);
  assert.equal(first.firstHitBonus, 2);
  assert.equal(first.hits[0].targetId, null);
});

test('시종 복사와 회복 상한, 사제의 대상 분기를 실제 체력 변화로 기록한다', () => {
  const s = battle([[4,'squire'],[5,'holyPriest'],[6,'saint'],[7,'crusader']]);
  s.battle.dice = [1,4,4];
  const squire = s.floors[3], priest = s.floors[4], saint = s.floors[5];
  squire.hp -= 2;
  saint.hp -= 3;
  const snapshot = structuredClone(s);
  const candidates = previewBattle(s, saint.id, 1, 'left');
  assert.equal(candidates.scenarios.length, 2);
  const events = candidates.scenarios[0].events;
  assert.equal(eventsOf(events, 'arrival-copy')[0].triggerSource, saint.id);
  assert.equal(eventsOf(events, 'reaction')[0].source, priest.id);
  assert.equal(eventsOf(events, 'heal').find(e => e.target === squire.id).amount, 2);
  assert.equal(eventsOf(events, 'heal').find(e => e.target === saint.id).amount, 3);
  assert.deepEqual(s, snapshot);
});

test('19판 저장의 확정 이동을 오른쪽으로 복원하고 현재 배치·공개 눈·난수를 보존한다', () => {
  const old = previous.createGame(31900);
  previous.execute(old, 'visit', [old.map[0].id], '이전 판');
  previous.execute(old, 'start', [], '시작');
  previous.execute(old, 'move', [old.floors[0].id,1], '기존 이동');
  const snapshot = structuredClone(old), next = upgradeSave(old);
  assert.deepEqual(old, snapshot);
  assert.deepEqual(next.battle, old.battle);
  assert.deepEqual(next.rng, old.rng);
  assert.equal(next.journal.findLast(e => e.type === 'drop').direction, 'right');
  assert.deepEqual(next.journal.findLast(e => e.command === 'move').args, [old.journal.findLast(e => e.type === 'drop').source,1,'right']);
  assert.doesNotThrow(() => execute(next, 'move', [next.floors.find(Boolean).id,1,'left'], '새 방향'));
});
