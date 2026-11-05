import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createGameServer} from './server.mjs';
import {
  createGame, execute, growthReport, previewBattle, publicView,
} from '../mvp_text_17/engine.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dtd-user5-api-'));
  const saveFile = path.join(dir, 'nested', 'test.json');
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
    await rm(dir, {recursive: true, force: true});
  });
  await start();
  const request = (route, options) => fetch(origin + route, options);
  const post = (route, body, headers = {}) => request(route, {
    method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin, ...headers}, body: JSON.stringify(body),
  });
  async function json(route, options) {
    const response = await request(route, options);
    assert.equal(response.status, 200);
    return response.json();
  }
  function requestHost(host) {
    // Fetch replaces Host with the URL authority. Exercise the raw HTTP header here.
    return new Promise((resolve, reject) => {
      http.get(origin + '/api/state', {headers: {Host: host}}, response => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      }).once('error', reject);
    });
  }
  return {saveFile, request, requestHost, post, json, restart: async () => { await close(); await start(); }};
}

test('첫 판·공개 조회·정적 자산은 노출 범위를 지킨다. 외부 Origin, 수상한 Host, 폼 POST를 거절한다', async t => {
  const game = await fixture(t);
  const current = await game.json('/api/state');
  assert.deepEqual(current.view, publicView(createGame(31001)));
  assert.equal(current.revision, 0);
  assert.equal(Object.keys(current.catalog.creatures).length, 15);
  assert.ok(!('rng' in current.view));
  assert.deepEqual(await game.json('/api/journal'), current.journal);
  assert.deepEqual(await game.json('/api/report'), growthReport(createGame(31001)));
  const before = await readFile(game.saveFile, 'utf8');
  const preview = await game.json('/api/fusion?a=e1&b=e2');
  assert.deepEqual(preview.thumbnail, {left: 'gaze', right: 'owner'});
  const js = await game.request('/ui.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  for (const inaccessible of ['/server.mjs', '/server.test.mjs', '/saves/current.json', '/assets/%2e%2e/saves/current.json', '/package.json']) {
    assert.equal((await game.request(inaccessible)).status, 404);
  }
  const request = {cmd: 'give-up', args: [], revision: 0};
  assert.equal((await game.post('/api/action', request, {Origin: 'http://elsewhere.test'})).status, 403);
  assert.equal(await game.requestHost('elsewhere.test'), 403);
  assert.equal((await game.request('/api/state', {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  assert.equal((await game.post('/api/action', request, {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await game.request('/api/action')).status, 405);
  assert.equal((await game.request('/api/preview?slot=1')).status, 400);
  assert.equal(await readFile(game.saveFile, 'utf8'), before);
});

test('동시에 도착한 같은 진행 번호의 결정은 한 번만 확정한다. 재시작 뒤 지갑·위치·주사위·장부를 그대로 복구한다', async t => {
  const game = await fixture(t);
  const cmd = {cmd: 'visit', args: ['1-1-중'], revision: 0};
  const responses = await Promise.all([game.post('/api/action', cmd), game.post('/api/action', cmd)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const s = await (responses.find(r => r.status === 200)).json();
  assert.equal(s.revision, 1);
  assert.equal(s.view.phase, 'management');
  assert.equal((await game.post('/api/new', {seed: 4, revision: 0})).status, 409);
  const invalid = await game.post('/api/action', {cmd: 'fuse', args: ['e1', 'e2'], revision: 1});
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).error);
  const started = await game.post('/api/action', {cmd: 'start', args: [], revision: 1});
  const playing = await started.json();
  assert.deepEqual(playing.view.battle.rolls, [3, 2, 2]);
  assert.match(playing.journal.findLast(e => e.type === 'decision').reason, /영업 시작/);
  assert.equal(playing.journal.filter(e => e.type === 'visit').length, 1);
  assert.equal(playing.events.some(e => e.type === 'visit'), false);
  assert.equal(playing.events.filter(e => e.type === 'decision').length, 1);
  await game.restart();
  const {events, ...snapshot} = playing;
  assert.deepEqual(await game.json('/api/state'), snapshot);
  assert.equal((await game.post('/api/new', {seed: -1, revision: 2})).status, 400);
  const reset = await game.post('/api/new', {seed: 31002, revision: 2});
  assert.equal(reset.status, 200);
  const fresh = await reset.json();
  assert.equal(fresh.revision, 3);
  assert.ok(!('events' in fresh));
  assert.deepEqual(fresh.view, publicView(createGame(31002)));
  assert.equal((await game.post('/api/action', {...cmd, revision: 0})).status, 409);
});

test('공개 눈 미리보기부터 첫 영업 완승·필수 보상 배치까지 브라우저 API와 17판 엔진이 같은 상태를 만든다', async t => {
  const game = await fixture(t);
  const engine = createGame(31001);
  let board = await game.json('/api/state');
  async function decide(cmd, ...args) {
    const previousRevision = board.revision;
    const response = await game.post('/api/action', {cmd, args, revision: previousRevision});
    assert.equal(response.status, 200);
    board = await response.json();
    const reason = board.events.find(e => e.type === 'decision').reason;
    const previousEvents = engine.journal.length;
    assert.deepEqual(board.view, execute(engine, cmd, args, reason));
    assert.deepEqual(board.events, JSON.parse(JSON.stringify(engine.journal.slice(previousEvents))));
    assert.equal(board.revision, previousRevision + 1);
  }
  await decide('visit', '1-1-중');
  await decide('start');
  let turns = 0;
  while (board.view.phase === 'choose' && turns++ < 100) {
    const estimates = [];
    for (const slot of [1, 2, 3]) {
      const preview = await game.json('/api/preview?slot=' + slot);
      assert.deepEqual(preview, previewBattle(engine, slot));
      const after = preview.after.battle;
      let score = 5 * after.fear + after.anxiety - after.hearts * 50;
      if (preview.outcome === 'win' || preview.outcome === 'guest-kill') score += 1000;
      if (preview.outcome === 'loss') score -= 1000;
      estimates.push({slot, score});
    }
    estimates.sort((a, b) => b.score - a.score);
    await decide('choose', estimates[0].slot);
    const safe = board.view.floors.find(e => e?.type === 'safe' && e.ambush === 0 && e.seal === 0);
    if (safe) await decide('active', safe.id, 'base');
    assert.deepEqual(await game.json('/api/preview'), previewBattle(engine));
    await decide('move');
  }
  assert.equal(board.view.phase, 'reward', '첫 손님 세 명을 처치해야 보상이 열린다.');
  assert.equal(board.view.souls, 5);
  assert.equal(board.view.actIncome, 3);
  assert.equal(new Set(board.view.rewards).size, 3);
  await decide('reward', 1);
  await decide('place', 2);
  assert.equal(board.view.phase, 'map');
  assert.deepEqual(board.view.visited, ['1-1-중']);
  assert.equal(board.view.floors.filter(Boolean).length, 5);
  const journal = await game.json('/api/journal');
  assert.equal(journal.filter(e => e.type === 'kill').length, 3);
  assert.equal(journal.filter(e => e.type === 'income').length, 3);
  assert.deepEqual((await game.json('/api/report')).acts[0].occupancy, growthReport(engine).acts[0].occupancy);
});
