import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Game, CREATURES, GUESTS, SERVICES, DICE } from './engine.js';

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
  const saved = new Map([['dread-user2-options', JSON.stringify({ tutorial: false, speed: 'fast' })]]);
  const context = vm.createContext({
    Game, CREATURES, GUESTS, SERVICES, DICE, document,
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
    modalHtml: () => nodes.get('#modal-root').innerHTML,
    saved,
    node(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); },
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

test('offline view: a bell kill clears an unfinished protection target', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run("game.s.entities.push({id:'guard-pending',type:'G',floor:2,c:0,p:2,uses:2,shield:0})");
  await view.run("action('start')");
  await view.run("action('roll')");
  await view.run("action('die:0')");
  await view.run("action('choose')");
  view.run('game.s.visitor.f=9');
  await view.run("action('active:guard-pending')");
  assert.equal(view.run('selection.kind'), 'G');
  const bell = view.run("game.s.entities.find(e=>e.type==='B').id");
  await view.run(`action('active:${bell}')`);
  assert.equal(view.run('game.s.phase'), 'guest_end');
  assert.equal(view.run('selection'), null);
  assert.equal(view.run("entity('guard-pending').uses"), 2);
  assert.doesNotMatch(view.html(), /class="selection-banner"/);
});

test('offline view: editing preserves scroll but starting a new service reveals its controls', async () => {
  const view = harness();
  const workspace = view.node('.workspace');
  await view.run("action('new')");
  workspace.scrollTop = 900;
  await view.run("action('place:e1')");
  assert.equal(workspace.scrollTop, 900);
  await view.run("action('start')");
  assert.equal(workspace.scrollTop, 0);
});

test('offline view: title offers a playable new game', async () => {
  const view = harness();
  assert.match(view.html(), /어서 오세요/);
  assert.match(view.html(), /호텔 영업 시작/);
  await view.run("action('new')");
  assert.equal(view.run('game.s.phase'), 'management');
  assert.match(view.html(), /문틈의 속삭임/);
  assert.match(view.html(), /이름을 부르는 객실/);
  assert.match(view.html(), /통과/);
  assert.match(view.html(), /도착/);
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
  await view.run("action('die:0')");
  await view.run("action('choose')");
  assert.equal(view.run('game.s.phase'), 'prepare');
  assert.match(view.html(), /공포 3 주기/);
  const id = view.run("game.s.entities.find(e=>e.type==='B').id");
  view.run('game.s.visitor.t=99');
  await view.run(`action('active:${id}')`);
  assert.equal(view.run(`entity('${id}').uses`), 1);
  assert.match(view.html(), /공포 3 주기 · 1회/);
  await view.run(`action('active:${id}')`);
  assert.equal(view.run(`entity('${id}').uses`), 0);
  assert.equal(view.run('game.s.visitor.f'), 6);
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
  await view.run("action('die:0')");
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
  await view.run("action('die:0')");
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

test('offline view: trial seed selection is honored and a new game resets expansion and equipment', async () => {
  const view = harness();
  await view.run("action('new')");
  assert.equal(view.run('game.s.seed'), 21001);
  view.run("game.expand();game.s.equipped[0]='long';prefs.speed='fast';seen.expansion=true;save()");
  view.handlers.change({ target: { dataset: { setting: 'seed' }, value: '21002' } });
  await view.run("action('new')");
  assert.equal(view.run('game.s.seed'), 21002);
  assert.equal(view.run('game.s.floorCount'), 6);
  assert.deepEqual(view.run('game.s.equipped'), ['normal', 'normal', 'normal']);
  assert.equal(view.run('game.s.money'), 4);
  assert.equal(view.run('prefs.speed'), 'fast');
  assert.equal(view.run('seen.expansion'), true);
});

test('offline view: expansion compares first, cancel is free and confirm adds only one floor', async () => {
  const view = harness();
  await view.run("action('new')");
  const before = view.run('JSON.stringify(game.s)');
  await view.run("action('expand')");
  assert.equal(view.run('modal.type'), 'expansion');
  assert.match(view.modalHtml(), /설계 미리보기/);
  assert.match(view.modalHtml(), /잔액 4 → 0/);
  assert.match(view.modalHtml(), /6층 → 1층/);
  assert.match(view.modalHtml(), /7층 → 1층/);
  assert.equal(view.run('JSON.stringify(game.s)'), before);
  view.handlers.change({ target: { dataset: { expand: 'position' }, value: '5' } });
  view.handlers.change({ target: { dataset: { expand: 'die' }, value: '0,1' } });
  assert.match(view.modalHtml(), /1층 도착/);
  assert.match(view.modalHtml(), /7층 도착/);
  await view.run("action('closemodal')");
  assert.equal(view.run('JSON.stringify(game.s)'), before);
  await view.run("action('expand')");
  await view.run("action('expandconfirm')");
  assert.equal(view.run('game.s.floorCount'), 7);
  assert.equal(view.run('game.s.money'), 0);
  assert.match(view.html(), /7층 호텔/);
  assert.match(view.html(), /data-floor="7"/);
  assert.match(view.html(), /공포 재화 6/);
});

test('offline view: ten floors remain individually navigable and expansion is disabled at the cap', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run('game.s.money=28;game.expand();game.expand();game.expand();game.expand();render()');
  assert.match(view.html(), /10층 호텔/);
  assert.equal((view.html().match(/data-floor="\d+"/g) || []).length, 10);
  for (let floor = 1; floor <= 10; floor++) assert.match(view.html(), new RegExp('data-action="jump:' + floor + '"'));
  assert.match(view.html().match(/<button[^>]+data-action="expand"[^>]*>/)?.[0] || '', /disabled/);
});

function revealIdenticalThree(view) {
  view.run(`
    game.s.equipped=['normal','anxiety','normal'];
    game.s.phase='choose';game.s.activity=false;
    game.s.dice=[
      {slot:0,type:'normal',face:2,value:3,bonus:0},
      {slot:1,type:'anxiety',face:2,value:3,bonus:1},
      {slot:2,type:'normal',face:2,value:3,bonus:0}
    ];render();
  `);
}

test('offline view: equal-value dice have separate identities, previews and a one-time selected bonus', async () => {
  const view = harness();
  await view.run("action('new')");
  await view.run("action('start')");
  revealIdenticalThree(view);
  assert.match(view.html(), /data-action="die:0"/);
  assert.match(view.html(), /data-action="die:1"/);
  assert.match(view.html(), /일반 주사위/);
  assert.match(view.html(), /불안 주사위/);
  await view.run("action('die:0')");
  assert.match(view.run('previewPanel()'), /공포 \+8/);
  assert.match(view.html(), /공략도 6 × 2/);
  assert.match(view.html(), /파훼 토큰 1개 소모 예상/);
  assert.equal(view.run('game.s.visitor.a'), 0);
  await view.run("action('die:1')");
  assert.match(view.run('previewPanel()'), /공포 \+12/);
  assert.match(view.run('previewPanel()'), /반격 없음/);
  assert.doesNotMatch(view.html(), /공략도 6 × 2/);
  assert.equal(view.run('game.s.visitor.a'), 0);
  await view.run("action('choose')");
  assert.equal(view.run('game.s.chosenSlot'), 1);
  assert.equal(view.run('game.s.visitor.a'), 1);
  for (let i = 0; i < 5; i++) view.run('render()');
  assert.equal(view.run('game.s.visitor.a'), 1);
  assert.match(view.run('previewPanel()'), /공포 \+12/);
});

test('offline view: basic cards omit empty effects while detail and shared terms retain rules', async () => {
  const view = harness();
  await view.run("action('new')");
  const card = view.run("creatureCard('Q')");
  const basic = card.split('<details')[0];
  assert.doesNotMatch(basic, /효과 없음/);
  assert.doesNotMatch(basic, /직접 사용/);
  assert.match(card, /상세 보기/);
  assert.match(card, /효과 없음/);
  assert.match(card, /data-action="term:수확"/);
  const guard = view.run("creatureCard('G')");
  assert.match(guard, /다음 턴부터 사용/);
  assert.match(guard, /자신도 선택 가능/);
  assert.match(guard, /비용: 사용 1회/);
  assert.match(guard, /2\/2회/);
  await view.run("action('term:보호')");
  assert.match(view.modalHtml(), /타격/);
  assert.match(view.modalHtml(), /흡수/);
});

function enterReward(view) {
  view.run(`
    game=new Game(21001);onTitle=false;game.s.round=3;game.startService();
    game.s.visitor.h=1;game.s.visitor.f=13;
    game.s.phase='choose';game.s.dice=[{slot:0,type:'normal',face:0,value:1,bonus:0}];
    game.choose(0);game.active(game.s.entities.find(e=>e.type==='B').id);render();
  `);
}

test('offline view: reward drafts and escape leave equipment unchanged until explicit confirmation', async () => {
  const view = harness();
  enterReward(view);
  assert.equal(view.run('game.s.phase'), 'reward');
  for (const name of ['장거리 주사위', '짝수 주사위', '불안 주사위']) assert.match(view.html(), new RegExp(name));
  await view.run("action('rewardtype:long')");
  await view.run("action('rewardslot:2')");
  assert.deepEqual(view.run('game.s.equipped'), ['normal', 'normal', 'normal']);
  view.handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(view.run('game.s.phase'), 'reward');
  assert.equal(view.run('rewardType'), null);
  assert.equal(view.run('rewardSlot'), null);
  await view.run("action('rewardtype:anxiety')");
  await view.run("action('rewardslot:1')");
  await view.run("action('rewardconfirm')");
  assert.equal(view.run('game.s.phase'), 'management');
  assert.equal(view.run('game.s.round'), 4);
  assert.deepEqual(view.run('game.s.equipped'), ['normal', 'anxiety', 'normal']);
  assert.equal(view.run('game.s.money'), 10);
  assert.equal(view.run('game.s.resets'), 1);
  assert.match(view.html(), /불안 주사위/);
});

test('offline view: skip reward proceeds with the original three dice', async () => {
  const view = harness();
  enterReward(view);
  await view.run("action('rewardtype:even')");
  await view.run("action('rewardskip')");
  assert.equal(view.run('game.s.phase'), 'management');
  assert.equal(view.run('game.s.round'), 4);
  assert.deepEqual(view.run('game.s.equipped'), ['normal', 'normal', 'normal']);
});

test('offline view: target card simulates one pending protection without spending or replaying dice bonus', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run("game.s.entities.push({id:'test-guard',type:'G',floor:2,c:0,p:2,uses:2,shield:0})");
  await view.run("action('start')");
  revealIdenticalThree(view);
  view.run('game.s.visitor.h=2');
  await view.run("action('die:1')");
  await view.run("action('choose')");
  await view.run("action('active:test-guard')");
  view.node('[data-floor="3"]');
  const tip = view.node('#tooltip');
  view.run('showTip(at(3).id,true)');
  assert.match(tip.innerHTML, /공략도 6\/12/);
  assert.match(tip.innerHTML, /파훼 토큰 2/);
  assert.equal(view.run("entity('test-guard').uses"), 2);
  assert.equal(view.run('game.s.visitor.a'), 1);
  await view.run("action('cancel')");
  assert.equal(view.run('at(3).shield'), 0);
  assert.equal(view.run('game.s.visitor.a'), 1);
});

test('offline view: terminal result shows final hotel and equipment, and surrender remains restartable', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run("game.expand();game.s.equipped[0]='even';render()");
  await view.run("action('surrender')");
  assert.equal(view.run('game.s.phase'), 'lost');
  assert.match(view.html(), /7층/);
  assert.match(view.html(), /짝수 주사위/);
  assert.match(view.html(), /새 판 시작/);
  await view.run("action('new')");
  assert.equal(view.run('game.s.phase'), 'management');
  assert.equal(view.run('game.s.floorCount'), 6);
});

test('offline view: expanding attack details on a target floor does not commit protection or its cost', async () => {
  const view = harness();
  await view.run("action('new')");
  view.run("game.s.entities.push({id:'test-guard',type:'G',floor:2,c:0,p:2,uses:2,shield:0})");
  await view.run("action('start')");
  await view.run("action('roll')");
  await view.run("action('die:0')");
  await view.run("action('choose')");
  await view.run("action('active:test-guard')");
  const before = view.run('JSON.stringify(game.s)');
  const floor = { dataset: { floor: '3' } };
  view.handlers.click({
    target: { closest(selector) {
      if (selector === '[data-action]') return null;
      if (selector === '[data-floor]') return floor;
      if (selector.includes('details')) return { tagName: 'SUMMARY' };
      return null;
    } },
    preventDefault() {}
  });
  assert.equal(view.run('JSON.stringify(game.s)'), before);
  assert.equal(view.run('selection.kind'), 'G');
  assert.equal(view.run("entity('test-guard').uses"), 2);
  assert.equal(view.run('at(3).shield'), 0);
});

test('offline view: an anxiety-die bonus at the cap is shown as actual zero, not another gain', async () => {
  const view = harness();
  await view.run("action('new')");
  await view.run("action('start')");
  revealIdenticalThree(view);
  view.run('game.s.visitor.a=9');
  await view.run("action('die:1')");
  await view.run("action('choose')");
  assert.equal(view.run('game.s.visitor.a'), 9);
  assert.equal(view.run('game.s.choiceEffect.amount'), 0);
  assert.match(view.run('previewPanel()'), /실제 불안 \+0 \(상한 9\)/);
  assert.doesNotMatch(view.run('previewPanel()'), /실제 불안 \+1/);
  assert.equal(view.run('game.s.activity'), false);
});
