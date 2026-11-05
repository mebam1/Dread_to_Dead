import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDecisions} from './decisions.js';
import {adventureMap} from './adventure-map.js';
import {catalog, createGame, execute, previewBattle, previewFusion, publicView} from '../mvp_text_17/engine.mjs';
import {finishBattle} from '../mvp_text_17/campaign.mjs';
import {newEntity} from '../mvp_text_17/shared.mjs';
import {attackForecast, guestGainForecast} from './ui.js';

test('막이 바뀌면 지도에는 새 막의 경로와 보스만 표시한다', () => {
  const game = createGame(31001);
  for (const act of [1,2,3]) {
    const view = publicView(game);
    const boss = view.map.find(n => n.kind === 'boss');
    const html = adventureMap(view, boss.id);
    assert.ok(html.includes('<li aria-current="step">'+act+'막</li>'));
    const ids = [...html.matchAll(/data-map-node="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids.sort(), view.map.map(n => n.id).sort());
    assert.ok(ids.every(id => id.startsWith(act+'-')));
    assert.equal(view.map.filter(n => n.reachable).length, 3);
    // Complete this boss and its reward to get the next act's genuine map.
    game.visited.push(view.map.find(n => n.next.includes(boss.id)).id);
    execute(game, 'visit', [boss.id], '지도 검사');
    execute(game, 'start', [], '지도 검사');
    finishBattle(game, 'win');
    execute(game, 'reward', [1], '지도 검사');
    execute(game, 'discard', [], '지도 검사');
  }
  assert.equal(game.phase, 'won');
});

test('공격 표식은 빗나감·연타·대리 수신·비활동 후보를 구분하고 탈출 시 사라진다', () => {
  const s = createGame(31001);
  execute(s, 'visit', [s.map.find(n=>n.depth===1).id], '표식 검사');
  execute(s, 'start', [], '표식 검사');
  const b = s.battle;
  Object.assign(b.guest, {pattern:'double', doublePower:1, t:99});
  b.rolls[0] = 2;
  const miss = attackForecast(previewBattle(s,1));
  assert.deepEqual(miss.steps, ['2층 빗나감','2층 빗나감']);
  assert.deepEqual(miss.byFloor.get(2), [{kind:'miss', text:'빗나감', count:2}]);
  assert.deepEqual(miss.damageByFloor.get(2), [{kind:'miss', power:1, absorbed:0, actual:0, count:2}]);

  b.rolls[0] = 3;
  b.guards[s.floors[2].id] = s.floors[4].id;
  const redirect = attackForecast(previewBattle(s,1));
  assert.deepEqual(redirect.steps, ['3층 (5층 대리)','3층 (5층 대리)']);
  assert.deepEqual(redirect.byFloor.get(3), [{kind:'redirect', text:'공격 → 5층', count:2}]);
  assert.deepEqual(redirect.byFloor.get(5), [{kind:'guard', text:'대리 피격', count:2}]);
  assert.equal(redirect.damageByFloor.has(3), false);
  assert.deepEqual(redirect.damageByFloor.get(5), [{kind:'guard', power:1, absorbed:0, actual:1, count:2}]);

  b.position = 6;
  b.idle = b.idleLimit - 1;
  const penalty = attackForecast(previewBattle(s,1));
  const candidates = [...penalty.byFloor].filter(([, marks])=>marks.some(m=>m.kind==='possible')).map(([floor])=>floor);
  assert.deepEqual(candidates, [1,3,5,6]);
  assert.deepEqual([...penalty.damageByFloor.keys()], [9], 'uncertain penalties are separate from the guest attack');
  assert.equal(penalty.steps.length, 2);
  b.exit = 7;
  const escape = attackForecast(previewBattle(s,1));
  assert.equal(escape.byFloor.size, 0);
  assert.equal(escape.damageByFloor.size, 0);
  assert.deepEqual(escape.steps, []);
});

test('공략도 예고는 연타마다 소모되는 방어와 이동 중 받을 방어를 실제 수신층에서 계산한다', () => {
  const s = nodeFixture('normal', 1);
  execute(s, 'start', [], '공략도 예고 검사');
  Object.assign(s.battle.guest, {pattern:'double', doublePower:4, t:99});
  s.battle.rolls[0] = 3;
  s.battle.guards[s.floors[2].id] = s.floors[4].id;
  s.floors[4].defense = 6;
  const double = attackForecast(previewBattle(s, 1)).damageByFloor;
  assert.deepEqual([...double.keys()], [5]);
  assert.deepEqual(double.get(5), [
    {kind:'guard', power:4, absorbed:4, actual:0, count:1},
    {kind:'guard', power:4, absorbed:2, actual:2, count:1},
  ]);
  assert.equal(s.floors[4].defense, 6);

  Object.assign(s.battle.guest, {pattern:'route', power:3});
  s.battle.rolls[0] = 2;
  s.battle.greed = 1;
  const barnacle = s.floors[5] = newEntity(s, 'barnacle', 'reward');
  execute(s, 'choose', [1], '통과 방어 검사');
  execute(s, 'active', [barnacle.id,'base'], '통과 방어 검사');
  assert.equal(s.floors[0].defense, 0);
  const planned = attackForecast(previewBattle(s)).damageByFloor;
  assert.deepEqual(planned.get(1), [{kind:'hit', power:3, absorbed:2, actual:1, count:1}]);
  assert.deepEqual(planned.get(2), [{kind:'miss', power:3, absorbed:0, actual:0, count:1}]);
  assert.equal(s.floors[0].defense, 0, 'reading the sticker does not grant or consume defense');
});

test('손님 상태 예고는 실제 증가량만 방문별로 모으고 원거리 피격 효과도 현재 손님 칸에 놓는다', () => {
  const s = nodeFixture('normal', 1);
  execute(s, 'start', [], '손님 상태 예고 검사');
  s.dice[0] = 'anxiety';
  s.battle.rolls[0] = 3;
  Object.assign(s.battle.guest, {pattern:'route', power:1, t:99});
  s.floors[0].donor = 'gaze';
  s.floors[1] = newEntity(s, 'runes', 'reward');
  s.floors[1].donor = 'safe';
  s.floors[2].type = 'steps';
  const gains = () => guestGainForecast(previewBattle(s,1), s.battle.position);
  assert.deepEqual([...gains()], [
    [0, [{visit:0, resource:'anxiety', amount:1}]],
    [1, [{visit:1, resource:'anxiety', amount:8}]],
    [2, [{visit:2, resource:'prophecy', amount:1}]],
    [3, [{visit:3, resource:'anxiety', amount:1}, {visit:3, resource:'greed', amount:1}]],
  ]);
  s.battle.anxiety = 97;
  const capped = gains();
  assert.deepEqual(capped.get(1), [{visit:1, resource:'anxiety', amount:1}]);
  assert.deepEqual(capped.get(3), [{visit:3, resource:'greed', amount:1}]);
  assert.equal(s.battle.anxiety, 97);
  s.battle.anxiety = 0;
  s.battle.rolls[0] = 12;
  assert.deepEqual(gains().get(1), [
    {visit:1, resource:'anxiety', amount:8}, {visit:11, resource:'anxiety', amount:8},
  ]);
});

// The panel uses delegated listeners. Read the actual rendered controls and dispatch those
// listeners, including their disabled/option guards, into the same public engine as the server.
function panel(game, {api, preview = () => {}, beforeAction, screen} = {}) {
  let generation = 0;
  let markup = '';
  let folds = [];
  let dice = [];
  const previewRegion = {innerHTML: '', querySelector: () => folds.find(fold => fold.dataset.fold === 'forecastOpen')};
  let error = {textContent: ''};
  const root = {
    ownerDocument: {activeElement: null},
    get innerHTML() { return markup; },
    set innerHTML(html) {
      markup = html;
      generation++;
      error = {textContent: ''};
      folds = [...html.matchAll(/<details\b([^>]*)data-fold="([^"]+)"([^>]*)>/g)].map(m => ({
        generation, dataset: {fold: m[2]}, open: /\sopen(?:\s|$)/.test(m[1] + m[3]),
      }));
      dice = controls('button', {act:'choose'});
    },
    contains(element) { return element?.generation === generation; },
    querySelectorAll(selector) {
      if (selector === '[data-act="choose"]') return dice;
      return selector === '[data-fold]' ? folds : [];
    },
    querySelector(selector) { return selector === '[data-battle-preview]' ? previewRegion : error; },
  };
  function read(path) {
    const url = new URL(path, 'http://fixture.local');
    if (url.pathname === '/api/fusion') return previewFusion(game, url.searchParams.get('a'), url.searchParams.get('b'));
    assert.equal(url.pathname, '/api/preview');
    return previewBattle(game, url.searchParams.get('slot') ?? undefined);
  }
  const ctx = {
    root, catalog: catalog(), view: publicView(game), preview, screen,
    api: api ?? (async path => read(path)),
    async act(cmd, args) {
      if (beforeAction) await beforeAction(cmd, args);
      ctx.view = execute(game, cmd, args, '화면 조작 검사');
      renderDecisions(ctx);
    },
  };
  renderDecisions(ctx);
  function controls(tag, pattern) {
    return [...markup.matchAll(new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)</' + tag + '>', 'g'))].map(([, attrs, body]) => ({
      dataset: Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])),
      attrs, body, disabled: /\sdisabled(?:\s|$)/.test(attrs), generation,
      classList: {toggle() {}},
      closest() { return this; },
    })).filter(item => Object.entries(pattern).every(([k,v]) => item.dataset[k] === String(v)));
  }
  function button(pattern) {
    const matches = controls('button', pattern);
    assert.equal(matches.length, 1, 'one button ' + JSON.stringify(pattern));
    return matches[0];
  }
  async function click(pattern) {
    const target = button(pattern);
    assert.equal(target.disabled, false, 'enabled button ' + JSON.stringify(pattern));
    await root.onclick({target});
    assert.equal(error.textContent, '', 'a rendered action must pass engine validation');
  }
  function field(key, value) {
    const [control] = controls('select', {field: key});
    assert.ok(control, 'rendered field ' + key);
    const options = [...control.body.matchAll(/<option value="([^"]*)"([^>]*)>/g)];
    const option = options.find(m => m[1] === String(value));
    assert.ok(option && !option[2].includes('disabled'), 'enabled option ' + key + '=' + value);
    root.onchange({target: {...control, value: String(value)}});
  }
  return {
    root, read, button, field, click, command: act => click({act}),
    pick: (key, value) => click({pick: key, value}), buttons: pattern => controls('button', pattern),
  };
}

test('reordering keeps the disclosure open across a selection change before the native toggle event arrives', async () => {
  const s = createGame(31001);
  const p = panel(s, {screen:'hotel'});
  const fold = () => p.root.querySelectorAll('[data-fold]').find(e => e.dataset.fold === 'reorder');
  fold().open = true;
  p.field('from','1');
  assert.equal(fold().open, true);
  p.field('to','2');
  assert.equal(fold().open, true);
  const id = s.floors[0].id;
  await p.command('swap');
  assert.equal(s.floors[1].id, id);
  assert.equal(s.floors[0], null);
});

function nodeFixture(kind, depth, seed = 31001) {
  const game = createGame(seed);
  const previous = game.map.find(n => n.depth === depth - 1 && ['중','공통'].includes(n.col));
  if (previous) game.visited = [previous.id];
  const node = game.map.find(n => n.depth === depth && n.kind === kind);
  execute(game, 'visit', [node.id], '분기 검사 준비');
  return game;
}

test('1층에 도착하는 거울 감찰관의 카드 표식과 공격 순서에는 3층만 표시된다', async () => {
  const game = nodeFixture('boss', 8);
  execute(game, 'start', [], '거울 감찰관 공격 예고 검사');
  assert.equal(game.battle.guest.id, 'BOSS1');
  game.battle.position = 10;
  game.battle.rolls[0] = 1;
  let attacks;
  const p = panel(game, {preview: forecast => { attacks = attackForecast(forecast); }});
  await Promise.resolve();
  assert.deepEqual([...attacks.byFloor.keys()], [3]);
  assert.deepEqual(attacks.steps, ['3층']);
  assert.match(p.root.innerHTML, /1~10층 안의 대상만 공격/);
  const markup = p.root.querySelector('[data-battle-preview]').innerHTML;
  assert.match(markup, /손님 공격<\/span><div class="dec-path"><span>3층<\/span><\/div>/);
  assert.doesNotMatch(markup, /9층/);
});

test('hover and focus are read-only even when forecasts race; one die activation commits its own slot', async () => {
  const game = nodeFixture('normal', 1);
  execute(game, 'start', [], '전투 미리보기 검사');
  const original = structuredClone(game);
  const requests = new Map();
  const shown = [];
  const sent = [];
  let finishAction;
  const waiting = new Promise(resolve => { finishAction = resolve; });
  const p = panel(game, {
    api: path => new Promise(resolve => requests.set(path, resolve)),
    preview: forecast => shown.push(forecast?.slot ?? null),
    beforeAction(cmd, args) { sent.push([cmd, args]); return waiting; },
  });
  const dice = () => p.root.querySelectorAll('[data-act="choose"]');
  const [first, second, third] = dice();
  async function respond(slot) {
    const path = '/api/preview?slot=' + slot;
    requests.get(path)(p.read(path));
    await Promise.resolve();
  }
  await respond(1);
  second.onpointerenter({pointerType:'mouse'});
  third.onpointerenter({pointerType:'mouse'});
  await respond(2);
  assert.equal(shown.at(-1), null, 'a late response cannot paint another die');
  await respond(3);
  assert.equal(shown.at(-1), 3);
  assert.equal(first, dice()[0], 'the hovered button stays mounted during comparisons');
  third.onpointerleave({pointerType:'mouse'});
  assert.equal(shown.at(-1), 1);
  second.onfocus();
  assert.equal(shown.at(-1), 2);
  second.onblur({});
  assert.equal(shown.at(-1), 1);
  second.onpointerenter({pointerType:'touch'});
  assert.equal(shown.at(-1), 1, 'touch pointer entry alone does not choose a die');
  assert.deepEqual(game, original, 'browsing dice does not mutate combat or its journal');
  third.onpointerenter({pointerType:'mouse'});
  const commit = p.click({act:'choose', value:2});
  await p.click({act:'choose', value:3});
  assert.deepEqual(sent, [['choose',[2]]], 'a second activation during the request does not submit a second choice');
  finishAction();
  await commit;
  assert.equal(game.battle.slot, 2);
  assert.equal(game.phase, 'prepare');
  assert.equal(dice().length, 0);
  assert.equal(game.journal.filter(e => e.type === 'choose').length, 1);
});

test('a legal first battle reaches an actual reward; selecting and placing its card are separate decisions', async () => {
  const s = createGame(31001);
  const p = panel(s);
  await p.command('visit');
  await p.command('start');
  for (let turn = 0; s.phase === 'choose' && turn < 100; turn++) {
    const previews = [1,2,3].map(slot => previewBattle(s, slot));
    function score(f) {
      const b = f.after.battle;
      return (f.outcome === 'win' || f.outcome === 'guest-kill' ? 1000 : 0)
        + 100 * (s.battle.hearts - b.hearts) + b.fear * 4 + b.anxiety;
    }
    const slot = [...previews].sort((a,b) => score(b) - score(a))[0].slot;
    await p.click({act:'choose', value:slot});
    const safe = s.floors.find(e => e?.type === 'safe');
    if (safe && !safe.ambush && !safe.seal) await p.command('active');
    await p.command('move');
  }
  assert.equal(s.phase, 'reward');
  const chosen = s.rewards[1];
  const roster = structuredClone(s.floors);
  await p.pick('offer', 2);
  assert.deepEqual(s.floors, roster);
  await p.command('reward');
  assert.equal(s.pending.entity.type, chosen);
  assert.ok(p.button({act:'place'}).disabled);
  assert.equal(p.buttons({pick:'dest', value:1}).length, 0, 'partially full hotels only offer vacancies');
  const empty = s.floors.indexOf(null) + 1;
  await p.pick('dest', empty);
  assert.deepEqual(s.floors, roster);
  await p.command('place');
  assert.equal(s.phase, 'map');
  assert.equal(s.floors[empty - 1].type, chosen);
});

test('full-hotel shop transactions need a disposal decision and permit both replacement and discarding the incoming card', async () => {
  const s = nodeFixture('shop', 3);
  s.souls = 15;
  for (let i=0; i<10; i++) s.floors[i] ??= newEntity(s, 'mouse', 'test');
  const p = panel(s);
  await p.pick('offer', 3);
  await p.command('buy');
  const incoming = s.pending.entity;
  const old = s.floors[9];
  const paidBalance = s.souls;
  assert.equal(p.buttons({act:'buy'}).length, 0);
  assert.equal(p.buttons({act:'swap'}).length, 0);
  assert.ok(p.button({act:'place'}).disabled);
  await p.pick('dest', 10);
  assert.ok(p.root.innerHTML.includes(old.id) && p.root.innerHTML.includes('폐기 후 교체'));
  assert.equal(s.floors[9].id, old.id);
  await p.command('place');
  assert.equal(s.phase, 'shop');
  assert.equal(s.floors[9].id, incoming.id);
  assert.ok(p.button({pick:'offer',value:3}).disabled);
  await p.pick('offer', 2);
  await p.command('buy');
  const hotelIds = s.floors.map(e => e.id);
  const newId = s.pending.entity.id;
  await p.pick('dest', 'discard');
  await p.command('discard');
  assert.deepEqual(s.floors.map(e => e.id), hotelIds);
  assert.equal(s.souls, paidBalance - s.shop[1].price);
  assert.ok(s.journal.some(e => e.type === 'discard' && e.id === newId && e.incoming));
});

test('fusion waits for the preview of the current direction, preserves both originals during comparison, and commits that direction', async () => {
  const s = nodeFixture('fusion', 2);
  s.floors[2].upgraded = true;
  s.floors[2].damage = 5;
  s.floors[2].tokens = 1;
  const requests = [];
  const p = panel(s, {api: path => new Promise(resolve => { requests.push({path, resolve}); })});
  const original = structuredClone(s);
  const [gaze, owner] = [s.floors[0].id, s.floors[2].id];
  p.field('body', gaze);
  p.field('donor', owner);
  assert.ok(p.button({act:'fuse'}).disabled);
  await p.click({local:'reverse'});
  assert.equal(requests.length, 2);
  requests[0].resolve(p.read(requests[0].path));
  await Promise.resolve();
  assert.ok(p.button({act:'fuse'}).disabled, 'the stale result must not enable an irreversible action');
  requests[1].resolve(p.read(requests[1].path));
  await Promise.resolve();
  assert.match(p.root.innerHTML, /3층에 융합체 배치 · 1층은 빈층/);
  assert.match(p.root.innerHTML, /B 본 효과<\/dt><dd>통과 시 불안 \+4/);
  assert.match(p.root.innerHTML, /공략도 5\/13/);
  assert.deepEqual(s, original);
  await p.command('fuse');
  assert.equal(s.phase,'map');
  assert.equal(s.floors[0],null);
  assert.equal(s.floors[2].fusion.aId,owner);
  assert.equal(s.floors[2].fusion.bId,gaze);
  assert.equal(s.floors[2].damage,5);
  assert.equal(s.floors[2].tokens,1);
});

test('an elite reward passes through acquisition before it unlocks a single die replacement', async () => {
  const s = nodeFixture('elite', 4);
  execute(s, 'start', [], '엘리트 검사 준비');
  finishBattle(s, 'win');
  const p = panel(s);
  await p.command('reward');
  assert.equal(p.buttons({act:'equip'}).length, 0);
  await p.pick('dest','discard');
  await p.command('discard');
  assert.equal(s.phase,'die');
  assert.ok(p.button({act:'equip'}).disabled);
  const offered = s.offerDie;
  await p.pick('equipSlot', 3);
  await p.command('equip');
  assert.deepEqual(s.dice,['normal','normal',offered]);
  assert.equal(s.phase,'map');
});

test('recovery commits a two-card allocation; events expose the actual capped payout and the named contract target', async () => {
  const healing = nodeFixture('recovery',3);
  healing.floors[0].tokens = healing.floors[2].tokens = 1;
  const p = panel(healing);
  p.field('healFirst',healing.floors[0].id);
  assert.throws(() => p.field('healSecond',healing.floors[0].id),/enabled option/);
  p.field('healSecond',healing.floors[2].id);
  await p.command('heal');
  assert.deepEqual([healing.floors[0].tokens,healing.floors[2].tokens],[2,2]);
  assert.equal(healing.phase,'map');

  const s = nodeFixture('event',2);
  // Isolate the event boundary with one soul of the act's nine remaining.
  s.actIncome = 8;
  s.event = {kind:'contract',payout:1};
  const contract = panel(s);
  const target = s.floors[2].id;
  assert.ok(contract.button({act:'contract'}).disabled);
  contract.field('contract',target);
  assert.ok(contract.button({act:'contract'}).body.includes('영혼 1'));
  assert.ok(contract.root.innerHTML.includes(target));
  await contract.command('contract');
  assert.equal(s.floors[2],null);
  assert.equal(s.actIncome,9);
  assert.equal(s.souls,3);
});
