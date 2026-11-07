import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame, execute} from '../mvp_text_19/engine.mjs';
import {healingEncounter, temporaryGame} from './test-support.mjs';
import {combatTotals} from './combat-feedback.js';

const format = 'dread-to-dead/user7-save/1';
const json = async response => {
  const res = await response;
  const data = await res.json();
  assert.equal(res.status, 200, data.error);
  return data;
};
async function client(t, snapshot) {
  const game = await temporaryGame(snapshot);
  t.after(() => game.close());
  const get = path => fetch(game.url+path);
  const post = (path, body) => fetch(game.url+path, {method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const act = (revision, cmd, ...args) => post('/api/action', {revision,cmd,args});
  return {...game, get, post, act};
}

test('left and right share a starting roll, wrap independently and commit exactly once', async t => {
  const g = await client(t);
  await json(g.post('/api/new', {revision:0, seed:31900}));
  await json(g.act(1, 'visit', '1-1-우'));
  const board = await json(g.act(2, 'start'));
  assert.deepEqual(board.view.battle.dice, [3,4,5]);
  const before = await readFile(g.saveFile, 'utf8');
  const url = '/api/preview?id=c3&slot=3';
  const both = await json(g.get(url));
  assert.equal(both.revision, 3);
  for (const [dir, path] of Object.entries({left:[2,1,10,9,8], right:[4,5,6,7,8]})) {
    const {revision,...single} = await json(g.get(url+'&direction='+dir));
    assert.equal(revision, 3);
    assert.deepEqual(single, both[dir]);
    assert.deepEqual(single.scenarios[0].events.filter(e => e.type==='visit' && e.source==='c3').map(e=>e.x), path);
    assert.equal(combatTotals(single.scenarios[0].events).dealt, 10);
  }
  assert.equal((await g.get(url+'&direction=up')).status, 400);
  assert.equal((await g.act(3, 'move', 'c3', 3)).status, 400);
  assert.equal(await readFile(g.saveFile, 'utf8'), before);
  const clicks = await Promise.all(['left','right'].map(dir=>g.act(3,'move','c3',3,dir)));
  assert.deepEqual(clicks.map(r=>r.status).sort(), [200,409]);
  const board2 = await json(clicks.find(r=>r.ok));
  const drop = board2.events.find(e=>e.type==='drop');
  assert.deepEqual([drop.slot,drop.die,drop.source], [3,5,'c3']);
  const actual = board2.events.filter(e => !['decision','player-roll'].includes(e.type));
  const preview = both[drop.direction].scenarios[0].events;
  const withoutIndex = ({index,...event}) => event;
  assert.deepEqual(actual.map(withoutIndex), preview.map(withoutIndex));
  const saved = await json(g.get('/api/state'));
  assert.deepEqual(saved.lastBattleEvents, board2.events);
  assert.equal(saved.view.battle.turn, 2);
});

test('a terminal forecast agrees with the ordered copy, reaction and effective HP changes after rewards', async t => {
  const g = await client(t, {format,revision:0,state:healingEncounter()});
  const pair = await json(g.get('/api/preview?id=c2&slot=1'));
  assert.deepEqual(combatTotals(pair.left.scenarios[0].events), {healed:0, dealt:0, taken:0, absorbed:0, defense:0});
  const effects = {dealt:7, taken:0, healed:15, absorbed:3, defense:0};
  assert.deepEqual(combatTotals(pair.right.scenarios[0].events), effects);
  const won = await json(g.act(0,'move','c2',1,'right'));
  assert.equal(won.view.phase, 'reward');
  assert.deepEqual(combatTotals(won.lastBattleEvents), effects);
  const chain = won.events.filter(e=>['arrival','arrival-copy','reaction','damage','heal','outcome'].includes(e.type));
  assert.deepEqual(chain.map(e=>e.type), ['arrival','heal','heal','arrival-copy','heal','reaction','damage','outcome']);
  assert.deepEqual(chain.filter(e=>e.type==='heal').map(e=>e.amount), [4,5,6]);
  assert.equal(chain.at(-2).hpAfter, 0);
  const map = await json(g.act(1,'skip'));
  assert.equal(map.view.phase, 'map');
  assert.deepEqual(map.lastBattleEvents, won.lastBattleEvents);
  await json(g.act(2,'visit',map.view.map.find(n=>n.reachable).id));
  assert.deepEqual((await json(g.get('/api/state'))).lastBattleEvents, []);
});

test('poison after a killing blow can wipe the party, and both the preview and final recap show the loss', async t => {
  const state = healingEncounter();
  for (const unit of state.floors.filter(Boolean)) unit.tokens.poison = 60;
  const g = await client(t, {format,revision:0,state});
  const preview = await json(g.get('/api/preview?id=c2&slot=1&direction=right'));
  assert.equal(preview.scenarios[0].outcome,'loss');
  const lost = await json(g.act(0,'move','c2',1,'right'));
  assert.equal(lost.view.phase,'lost');
  const ordered = lost.lastBattleEvents.map(e=>e.type);
  assert.ok(ordered.indexOf('enemy-killed')<ordered.indexOf('companion-lost'));
  assert.equal(ordered.filter(type=>type==='companion-lost').length,3);
  assert.equal(combatTotals(lost.lastBattleEvents).taken,100);
  assert.equal(lost.lastBattleEvents.find(e=>e.type==='outcome').outcome,'loss');
  assert.deepEqual((await json(g.get('/api/state'))).lastBattleEvents,lost.lastBattleEvents);
});

test('an existing v6 battle preserves its roll and positions, then accepts a new direction', async t => {
  const old = createGame(31001);
  execute(old,'visit',[1],'기존 원정');
  execute(old,'start',[],'기존 전투');
  execute(old,'move',['c2',1],'기존 오른쪽 이동');
  const g = await client(t, {format:'dread-to-dead/user6-save/1', revision:7, state:old});
  const saved = await json(g.get('/api/state'));
  assert.equal(saved.revision, 8);
  assert.equal(saved.view.version,'text-20-v1.0');
  assert.deepEqual(saved.view.battle.dice, old.battle.dice);
  assert.deepEqual(saved.view.floors.map(e=>e?.id), old.floors.map(e=>e?.id));
  assert.equal(saved.lastBattleEvents.find(e=>e.type==='drop').direction, 'right');
  assert.equal(JSON.parse(await readFile(g.saveFile,'utf8')).format, format);
  const move = await json(g.act(8,'move','c2',1,'left'));
  assert.equal(move.events.find(e=>e.type==='drop').direction, 'left');
});
