import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Game, CREATURES, GUESTS, SERVICES } from './engine.js';

// These are offline rendering/action smoke checks, not browser or layout tests.
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8')
  .replace(/^import[^\n]+\n/, '');

function harness() {
  const handlers = {};
  const nodes = new Map();
  const classes = () => ({ add() {}, remove() {}, toggle() {} });
  const element = () => ({
    innerHTML: '', hidden: true, style: {}, dataset: {}, offsetHeight: 100,
    classList: classes(), setAttribute() {}, focus() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 20, left: 10, right: 310, height: 100 }; }
  });
  for (const key of ['#app', '#tooltip', '#modal-root']) nodes.set(key, element());
  const document = {
    activeElement: null,
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: () => [],
    createElement: element,
    body: { classList: classes(), append(node) { nodes.set('.toast', node); } },
    addEventListener(name, handler) { handlers[name] = handler; }
  };
  const saved = new Map([['dread-user1-options', JSON.stringify({ tutorial: false, speed: 'fast' })]]);
  const context = vm.createContext({
    Game, CREATURES, GUESTS, SERVICES, document,
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    crypto: { getRandomValues(array) { array[0] = 424242; return array; } },
    Uint32Array, structuredClone, innerWidth: 1280, innerHeight: 720,
    requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
    addEventListener() {}, console
  });
  vm.runInContext(source, context, { filename: 'app.js' });
  return {
    run: code => vm.runInContext(code, context),
    html: () => nodes.get('#app').innerHTML,
    handlers,
    clickFloor(floor) {
      const target = { dataset: { floor: String(floor) } };
      handlers.click({
        target: { closest: selector => selector === '[data-floor]' ? target : null },
        preventDefault() {}
      });
    }
  };
}

test('offline view: title offers a playable new game', async () => {
  const view = harness();
  assert.match(view.html(), /어서 오세요/);
  assert.match(view.html(), /호텔 영업 시작/);
  await view.run("action('new')");
  assert.equal(view.run('game.s.phase'), 'management');
  assert.match(view.html(), /문틈의 속삭임/);
  assert.match(view.html(), /이름을 부르는 객실/);
  assert.match(view.html(), /통과할 때/);
  assert.match(view.html(), /도착할 때/);
  assert.match(view.html(), /직접 사용/);
  assert.match(view.html(), /공포 재화/);
});

test('offline view: purchasing exposes a stored card and placement selection places it', async () => {
  const view = harness();
  await view.run("action('new')");
  const node = view.run('game.s.web.nodes.find(n=>n.depth===1)');
  await view.run(`action('buy:${node.id}')`);
  assert.match(view.html(), /보관 중인 괴이/);
  assert.match(view.html(), /배치하기/);
  const id = view.run('game.s.entities.at(-1).id');
  await view.run(`action('place:${id}')`);
  assert.equal(view.run('selection.kind'), 'place');
  assert.match(view.html(), /배치할 층을 선택하세요/);
  view.clickFloor(2);
  assert.equal(view.run(`entity('${id}').floor`), 2);
  assert.equal(view.run('selection'), null);
});

test('offline view: direct-use buttons follow preparation phase and allow repeated use', async () => {
  const view = harness();
  await view.run("action('new')");
  await view.run("action('start')");
  assert.equal(view.run('game.s.phase'), 'roll');
  assert.doesNotMatch(view.html(), /data-action="active:/);
  await view.run("action('roll')");
  assert.equal(view.run('game.s.phase'), 'choose');
  await view.run("action('die:'+game.s.dice[0])");
  await view.run("action('choose')");
  assert.equal(view.run('game.s.phase'), 'prepare');
  assert.match(view.html(), /공포 6 주기/);
  const id = view.run("game.s.entities.find(e=>e.type==='B').id");
  view.run('game.s.visitor.t=99');
  await view.run(`action('active:${id}')`);
  assert.equal(view.run(`entity('${id}').uses`), 1);
  assert.match(view.html(), /공포 6 주기 · 1회/);
  await view.run(`action('active:${id}')`);
  assert.equal(view.run(`entity('${id}').uses`), 0);
  assert.equal(view.run('game.s.visitor.f'), 12);
  assert.match(view.html(), /남은 횟수 없음/);
});

test('offline view: full hotel disables exit installation even with reserve creatures', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run(`game.s.entities.push(
    {id:'test-guard',type:'G',floor:2,c:0,p:2,uses:2,shield:0},
    {id:'test-amplifier',type:'E',floor:4,c:0,p:1,uses:0,shield:0},
    {id:'test-reserve',type:'U',floor:null,c:0,p:2,uses:0,shield:0}
  )`);
  await view.run("action('start')");
  await view.run("action('roll')");
  await view.run("action('die:'+game.s.dice[0])");
  await view.run("action('choose')");
  const exit = view.html().match(/<button[^>]+data-action="escape"[^>]*>/)?.[0];
  assert.ok(exit);
  assert.match(exit, /disabled/);
});

test('offline view: guard targeting does not spend until a valid floor is clicked', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run("game.s.entities.push({id:'test-guard',type:'G',floor:2,c:0,p:2,uses:2,shield:0})");
  await view.run("action('start')");
  await view.run("action('roll')");
  await view.run("action('die:'+game.s.dice[0])");
  await view.run("action('choose')");
  await view.run("action('active:test-guard')");
  assert.equal(view.run("entity('test-guard').uses"), 2);
  assert.equal(view.run('selection.kind'), 'G');
  await view.run("action('cancel')");
  assert.equal(view.run("entity('test-guard').uses"), 2);
  await view.run("action('active:test-guard')");
  view.clickFloor(3);
  assert.equal(view.run("entity('test-guard').uses"), 1);
  assert.equal(view.run('at(3).shield'), 6);
});

test('offline view: guest advance and terminal stats render without a browser DOM', async () => {
  const view = harness();
  await view.run("action('new')");
  await view.run("action('start')");
  view.run("game.s.phase='guest_end';game.s.stats.kills=1");
  await view.run("action('advance')");
  assert.equal(view.run('game.s.guestIndex'), 1);
  assert.match(view.html(), /손님 2\/3/);
  view.run("game.s.phase='won';game.s.round=7;game.s.stats.kills=20;game.s.stats.earned=52;game.s.reason='최종 보스 처치';render()");
  assert.match(view.html(), /마지막 손님이 사라졌다/);
  assert.match(view.html(), /20 \/ 20/);
  assert.match(view.html(), /52/);
  assert.match(view.html(), /새 판 시작/);
});
