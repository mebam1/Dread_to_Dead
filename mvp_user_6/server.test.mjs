import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, rmdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGameServer} from './server.mjs';
import {
  catalog, createGame, execute, previewBattle, previewFusion, publicView, report,
} from '../mvp_text_19/engine.mjs';
import {makePolicy} from '../mvp_text_19/policy.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dtd-user6-api-'));
  const saveFile = path.join(dir, 'campaign.json');
  let server, origin;
  async function close() {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  async function start() {
    server = createGameServer({saveFile});
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
  }
  t.after(async () => {
    await close();
    await rm(saveFile, {force: true});
    await rmdir(dir);
  });
  await start();
  const get = route => fetch(origin + route);
  const post = (route, body, headers = {}) => fetch(origin + route, {
    method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin, ...headers},
    body: JSON.stringify(body),
  });
  return {get, post, saveFile, restart: async () => { await close(); await start(); }};
}

async function json(response) {
  const res = await response;
  const data = await res.json();
  assert.equal(res.status, 200, data.error);
  return data;
}
const wire = value => JSON.parse(JSON.stringify(value));

test('state, catalog, report and fusion are public v19 results; reads leave the save unchanged', async t => {
  const game = await fixture(t);
  const start = createGame(31001);
  const current = await json(game.get('/api/state'));
  assert.deepEqual(Object.keys(current).sort(), ['catalog','journal','revision','view']);
  assert.deepEqual(current.view, wire(publicView(start)));
  assert.equal(current.revision, 0);
  assert.deepEqual(current.catalog, catalog());
  assert.ok(!('rng' in current.view));
  const before = await readFile(game.saveFile, 'utf8');
  assert.deepEqual(await json(game.get('/api/report')), report(start));
  assert.deepEqual(await json(game.get('/api/fusion?a=c1&b=c2')), previewFusion(start, 'c1','c2'));
  assert.equal((await game.get('/api/preview?id=c1')).status, 400);
  for (const denied of ['/server.mjs','/saves/current.json','/assets/%2e%2e/saves/current.json','/package.json']) {
    assert.equal((await game.get(denied)).status, 404);
  }
  const action = {cmd:'visit',args:[1],revision:0};
  assert.equal((await game.post('/api/action', action, {Origin:'https://example.org'})).status, 403);
  assert.equal((await game.post('/api/action', action, {'Content-Type':'text/plain'})).status, 415);
  assert.equal(await readFile(game.saveFile, 'utf8'), before);
});

test('concurrent tabs commit one command and recover the same active battle after restart', async t => {
  const game = await fixture(t);
  const visit = {cmd:'visit',args:[1],revision:0};
  const attempts = await Promise.all([game.post('/api/action', visit), game.post('/api/action', visit)]);
  assert.deepEqual(attempts.map(r => r.status).sort(), [200,409]);
  const visited = await json(attempts.find(r => r.status === 200));
  assert.equal(visited.revision, 1);
  assert.equal(visited.view.phase, 'management');
  const before = await readFile(game.saveFile, 'utf8');
  assert.equal((await game.post('/api/action', {cmd:'move',args:['c1'],revision:1})).status, 400);
  assert.equal((await game.post('/api/new', {seed:31002,revision:0})).status, 409);
  assert.equal(await readFile(game.saveFile, 'utf8'), before);
  const playing = await json(game.post('/api/action', {cmd:'start',args:[],revision:1}));
  assert.equal(playing.view.battle.dice.length, 3);
  assert.deepEqual(playing.events.filter(e => e.type === 'player-roll').map(e => e.dice), [playing.view.battle.dice]);
  await game.restart();
  const {events, ...snapshot} = playing;
  assert.deepEqual(await json(game.get('/api/state')), snapshot);
  const uncommitted = await readFile(game.saveFile, 'utf8');
  for (const args of [['c1'], ['c1',0], ['c1',4], ['c1','bad']]) {
    assert.equal((await game.post('/api/action', {cmd:'move',args,revision:2})).status, 400);
  }
  for (const url of ['/api/preview?id=c1','/api/preview?id=c1&slot=0','/api/preview?id=c1&slot=4']) {
    assert.equal((await game.get(url)).status, 400);
  }
  for (const slot of [1,2,3]) {
    const p = await json(game.get('/api/preview?id=c1&slot=' + slot));
    assert.equal(p.slot, slot);
    assert.equal(p.die, playing.view.battle.dice[slot - 1]);
  }
  assert.equal(await readFile(game.saveFile, 'utf8'), uncommitted);
  const moved = await json(game.post('/api/action', {cmd:'move',args:['c1',3],revision:2}));
  assert.deepEqual(moved.events.filter(e => e.type === 'drop').map(e => [e.source, e.slot, e.die]),
    [['c1', 3, playing.view.battle.dice[2]]]);
  assert.equal((await game.post('/api/action', {cmd:'move',args:['c1',2],revision:2})).status, 409);
  const fresh = await json(game.post('/api/new', {seed:31002,revision:3}));
  const created = createGame(31002);
  assert.equal(fresh.revision, 4);
  assert.deepEqual(fresh.view, wire(publicView(created)));
  assert.deepEqual(fresh.events, created.journal);
  assert.equal((await game.post('/api/action', visit)).status, 409);
});

test('a saved v1.2 turn keeps the published die in slot one, adds two and persists the upgrade exactly once', async t => {
  const game = await fixture(t);
  const legacy = createGame(31002);
  execute(legacy,'visit',[1],'fixture');
  execute(legacy,'start',[],'fixture');
  // Recreate the historical single-roll payload and RNG cursor at this turn boundary.
  legacy.version = 'text-19-v1.2';
  legacy.battle.die = 2;
  delete legacy.battle.dice;
  const roll = legacy.journal.at(-1);
  assert.equal(roll.type, 'player-roll');
  delete roll.dice;
  roll.die = legacy.battle.die;
  legacy.journal.find(e => e.type === 'campaign-start').version = legacy.version;
  const key = '31002|1|1|좌|유저굴림';
  legacy.rng[key] = 1;
  await writeFile(game.saveFile, JSON.stringify({format:'dread-to-dead/user6-save/1',revision:7,state:legacy}));
  const upgraded = await json(game.get('/api/state'));
  assert.equal(upgraded.revision, 8);
  assert.equal(upgraded.view.version, 'text-19-v1.3');
  assert.deepEqual(upgraded.view.battle.dice.slice(0,1), [2]);
  assert.equal(upgraded.view.battle.dice.length, 3);
  assert.equal(upgraded.view.battle.turn, legacy.battle.turn);
  const saved = await readFile(game.saveFile,'utf8');
  assert.equal(JSON.parse(saved).state.rng[key], 3);
  await game.restart();
  assert.deepEqual(await json(game.get('/api/state')), upgraded);
  assert.equal(await readFile(game.saveFile,'utf8'), saved);
  assert.equal((await game.post('/api/action', {cmd:'move',args:['c1',2],revision:7})).status, 409);
  assert.equal((await game.post('/api/action', {cmd:'move',args:['c1',2],revision:8})).status, 200);
});

test('the API plays a real battle and its reward with the exact engine previews, events and results', async t => {
  const game = await fixture(t);
  const engine = createGame(31003);
  const policy = makePolicy();
  let board = await json(game.post('/api/new', {seed:31003,revision:0}));
  let previews = 0;
  for (let i = 0; engine.visited.length === 0 && i < 150; i++) {
    const decision = policy.decide(publicView(engine), (id,slot) => previewBattle(engine, id,slot));
    if (decision.command === 'move') {
      const [id,slot] = decision.args;
      const preview = await json(game.get('/api/preview?id=' + encodeURIComponent(id) + '&slot=' + slot));
      assert.deepEqual(preview, wire(previewBattle(engine, id,slot)));
      previews++;
    }
    const previousEvents = engine.journal.length;
    const {command:cmd,args} = decision;
    board = await json(game.post('/api/action', {cmd,args,revision:board.revision}));
    const reason = board.events.find(e => e.type === 'decision').reason;
    assert.deepEqual(board.view, wire(execute(engine, cmd, args, reason)));
    assert.deepEqual(board.events, wire(engine.journal.slice(previousEvents)));
  }
  assert.ok(previews > 0);
  assert.equal(engine.visited.length, 1);
  assert.equal(board.view.phase, 'map');
  assert.equal(board.view.coins, 3);
  assert.equal(board.view.floors.filter(Boolean).length, 4);
  assert.deepEqual(await json(game.get('/api/report')), wire(report(engine)));
});
