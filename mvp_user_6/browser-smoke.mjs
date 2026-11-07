// Optional graphical regression. The temporary save and screenshots are separate from the player's expedition.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createGameServer} from './server.mjs';
import {makePolicy} from '../mvp_text_19/policy.mjs';

function playwright() {
  const require = createRequire(import.meta.url);
  const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
  for (const pkg of [process.env.USER6_PLAYWRIGHT, 'playwright-core', bundled].filter(Boolean)) {
    try { return require(pkg); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw Error('playwright-core를 설치하거나 USER6_PLAYWRIGHT로 경로를 지정하세요.');
}

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'dtd-user6-browser-'));
const server = createGameServer({saveFile:path.join(output, 'game.json')});
const errors = [];
const moverPolicy = makePolicy();
let origin, browser, currentPage;

async function read(page, route = '/api/state') {
  const response = await page.request.get(origin + route);
  assert.equal(response.status(), 200, route);
  return response.json();
}

async function pageFor(options) {
  const page = await browser.newPage({reducedMotion:'reduce', ...options});
  currentPage = page;
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', r => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());
  });
  await page.goto(origin);
  return page;
}

async function mutate(page, command, interact) {
  currentPage = page;
  const response = page.waitForResponse(r => r.url() === origin + '/api/action' &&
    r.request().method() === 'POST' && r.request().postDataJSON().cmd === command);
  const [r] = await Promise.all([response, interact()]);
  const board = await r.json();
  assert.equal(r.status(), 200, board.error);
  return board;
}

async function mapCheck(page, state) {
  const nodes = page.locator('[data-inspect]');
  await nodes.first().waitFor();
  const ids = await nodes.evaluateAll(buttons => buttons.map(b => b.dataset.inspect).sort());
  assert.equal(ids.length, 52);
  assert.deepEqual(ids, state.view.map.map(n => n.id).sort());
  const reachable = await page.locator('[data-inspect].open').count();
  assert.equal(reachable, state.view.map.filter(n => n.reachable).length);
  assert.equal(await page.locator('[data-from][data-to]').count(),
    state.view.map.reduce((n, node) => n + node.next.length, 0));
}

async function fits(page) {
  const [surface, width] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(width <= page.viewportSize().width + 1, 'layout viewport expands beyond the device');
  assert.ok(surface <= width + 1, 'document overflow: ' + surface + ' > ' + width);
}

const cell = (page, side, x) => page.locator('.bt-cell.' + side + '[data-x="' + x + '"]');
const ally = (page, id) => page.locator('.bt-cell.ally[data-entity="' + id + '"]');
const dieButton = (page, slot) => page.locator('.bt-die[data-slot="' + slot + '"]');
async function checkBoardLayout(page) {
  const boardCells = page.locator('.bt-cell');
  await boardCells.first().waitFor();
  assert.equal(await boardCells.count(), 20);
  const field = page.locator('.bt-field');
  const {width,height} = page.viewportSize();
  const bounds = await field.boundingBox();
  const pairs = await boardCells.evaluateAll(cells => cells.map(c => {
    const r = c.getBoundingClientRect();
    return {side:c.dataset.side,x:c.dataset.x,left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  }));
  for (const square of pairs) {
    const where = square.side + ' ' + square.x + ' at ' + width + 'px';
    assert.ok(square.right > square.left && square.bottom > square.top, where + ' is painted');
    assert.ok(square.left >= Math.max(0,bounds.x) - 1 && square.right <= Math.min(width,bounds.x+bounds.width) + 1,
      where + ' is visible without panning');
    assert.ok(square.top >= -1 && square.bottom <= height + 1, where + ' is visible without scrolling');
  }
  for (const upper of pairs.filter(c => c.side === 'enemy')) {
    const lower = pairs.find(c => c.side === 'ally' && c.x === upper.x);
    assert.ok(Math.abs(upper.left-lower.left) <= 1 && Math.abs(upper.right-lower.right) <= 1 &&
      upper.bottom <= lower.top + 1, 'facing units line up at ' + upper.x);
  }
  const labels = await page.locator('.bt-coord').evaluateAll(nodes => nodes.map(n => {
    const r = n.getBoundingClientRect();
    return {text:n.textContent, mid:(r.left+r.right)/2, bottom:r.bottom};
  }));
  assert.equal(labels.length,10);
  for (const [i,label] of labels.entries()) {
    const enemy = pairs.find(c => c.side === 'enemy' && c.x === String(i + 1));
    assert.equal(label.text,String(i + 1).padStart(2,'0'));
    assert.ok(Math.abs(label.mid - (enemy.left+enemy.right)/2) <= 1 && label.bottom <= enemy.top + 1,
      'position ' + label.text + ' sits above its pair');
  }
  if (width >= 1280) {
    for (const side of ['enemy','ally']) {
      const row = pairs.filter(c => c.side === side);
      assert.ok(row.every((c, i) => Math.abs(c.top-row[0].top) <= 1 && (!i || c.left >= row[i-1].right - 1)),
        'all ten desktop ' + side + ' squares form one row');
    }
  } else if (width <= 480) {
    for (const side of ['enemy','ally']) {
      const row = pairs.filter(c => c.side === side);
      for (let i=0; i<5; i++) {
        assert.ok(Math.abs(row[i].top-row[0].top) <= 1 && Math.abs(row[i+5].top-row[5].top) <= 1 &&
          Math.abs(row[i].left-row[i+5].left) <= 1 && row[i].bottom <= row[i+5].top,
          'phone shows the second five positions below the first five');
      }
    }
  }
  assert.equal(await page.locator('.bt-inspect,.bt-detail,.bt-forecast,.bt-enemy-list,.bt-pan,[data-preview],[data-detail],[data-pan]').count(), 0);
  const panelBounds = await page.locator('.bt-panel').boundingBox();
  assert.ok(panelBounds.y + panelBounds.height <= bounds.y + bounds.height + 3, 'the board ends at the field');
  await fits(page);
}

async function checkField(page, board) {
  await checkBoardLayout(page);
  const hpButtons = page.getByRole('button', {name:/^동료 \d+번 .*체력/});
  assert.equal(await hpButtons.count(), board.view.floors.filter(Boolean).length);
  assert.equal(await page.getByRole('button',{name:/^적 \d+번 .*체력/}).count(),
    board.view.battle.enemies.filter(e => e.hp > 0).length);
  assert.equal(await page.locator('.bt-die').count(), 3);
  for (const [i,face] of board.view.battle.dice.entries()) {
    assert.equal(await dieButton(page,i+1).getAttribute('aria-label'), '주사위 ' + face + ', ' + (i+1) + '번 주사위 선택');
  }
}

// Check painted geometry and the visible number independently of the engine-facing data attribute.
async function checkCards(cards, expected, label, compact = false) {
  currentPage = cards.page();
  await cards.first().waitFor();
  const measured = await cards.evaluateAll((elements, compact) => elements.map(card => {
    const rect = node => node?.getBoundingClientRect().toJSON();
    const full = card.querySelector('.card-effects');
    const effects = compact ? card.querySelector('.bt-compact-effect') : full;
    const badges = card.querySelector('.card-badges');
    const art = badges?.parentElement.querySelector('.portrait') && rect(badges.parentElement);
    const hp = badges?.querySelector('.card-hp');
    const counter = badges?.querySelector('.card-counter');
    function badge(node, attribute) {
      if (!node) return null;
      const domRange = document.createRange();
      const text = node.querySelector('span') ?? node;
      domRange.selectNodeContents(text);
      return {value:node.getAttribute(attribute), text:text.textContent.trim(),
        box:rect(node), ink:rect(domRange), visible:node.checkVisibility({opacityProperty:true,visibilityProperty:true})};
    }
    const effectRuns = [];
    if (effects) {
      const walker = document.createTreeWalker(effects, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const domRange = document.createRange();
        domRange.selectNodeContents(node);
        effectRuns.push({font:parseFloat(getComputedStyle(node.parentElement).fontSize),
          visible:node.parentElement.checkVisibility({opacityProperty:true,visibilityProperty:true}),
          box:rect(domRange)});
      }
    }
    return {art, bounds:rect(card), enlarged:card.matches('.bt-card-view'), clip:rect(effects?.closest('.bt-body')),
      hp:badge(hp,'data-hp'), counter:badge(counter,'data-counter'),
      heart:rect(hp?.querySelector('svg path')), rounding:counter && getComputedStyle(counter).borderTopLeftRadius,
      fullVisible:full?.checkVisibility(), effects:effects?.innerText, effectsBox:rect(effects), effectRuns};
  }), compact);
  assert.equal(measured.length, expected.length, label + ' card count');
  measured.forEach((m,i) => {
    const unit = expected[i], where = label + ' ' + (unit.id ?? unit.type);
    assert.ok(m.art?.width > 0 && m.art.height > 0, where + ' portrait');
    assert.ok(m.heart?.width > 0 && m.heart.height > 0, where + ' heart artwork');
    function checkBadge(b, value, right) {
      assert.ok(b?.visible, where + ' visible badge');
      assert.equal(b.value, String(value), where + ' badge data');
      assert.equal(b.text, String(value), where + ' visible number');
      const inset = right ? m.art.right - b.box.right : b.box.left - m.art.left;
      const top = b.box.top - m.art.top;
      assert.ok(inset >= -2 && inset <= 16 && top >= -2 && top <= 16, where + ' thumbnail corner');
      const edge = right ? m.bounds.right - b.box.right : b.box.left - m.bounds.left;
      const topEdge = b.box.top - m.bounds.top;
      if (!m.enlarged) {
        assert.ok(edge >= -1 && edge <= 17 && topEdge >= -1 && topEdge <= 17,
          where + ' card corner (horizontal ' + edge + 'px, top ' + topEdge + 'px)');
      }
      assert.ok(b.ink.width > 0 && b.ink.height > 0 && b.ink.left >= b.box.left - 1 &&
        b.ink.right <= b.box.right + 1 && b.ink.top >= b.box.top - 1 && b.ink.bottom <= b.box.bottom + 1,
        where + ' number inside shape');
    }
    checkBadge(m.hp, unit.hp ?? unit.maxHp, false);
    if (unit.role && unit.hp !== 0) {
      checkBadge(m.counter, unit.intent?.counter ?? unit.firstCounter, true);
      const round = m.rounding.endsWith('%') ? parseFloat(m.rounding) >= 50 :
        parseFloat(m.rounding) >= m.counter.box.width / 2 - 1;
      assert.ok(round && Math.abs(m.counter.box.width - m.counter.box.height) <= 1, where + ' circular countdown');
    } else assert.equal(m.counter, null, where + ' no active enemy countdown');
    assert.ok(m.effects?.trim() && m.effectRuns.length > 0 && m.effectsBox.top >= m.art.bottom - 1,
      where + ' effects below portrait');
    if (compact) {
      assert.equal(m.fullVisible,false,where + ' compact text replaces the full paragraphs');
      assert.ok(m.clip, where + ' compact text is on the card');
    }
    for (const run of m.effectRuns) {
      const r = run.box;
      assert.ok(run.visible && run.font >= (compact ? 13 : 14) && r.width > 0 && r.height > 0,
        where + ' readable effect font ' + run.font);
      const visibleBottom = Math.min(compact ? m.clip.bottom : m.effectsBox.bottom, m.bounds.bottom);
      assert.ok(r.left >= m.bounds.left - 1 && r.right <= m.bounds.right + 1 &&
        r.top >= m.effectsBox.top - 1 && r.bottom <= visibleBottom + 1,
        where + ' complete visible effect text fits: ' + m.effects);
    }
  });
}

async function mapCards(page, board) {
  const selected = await page.locator('[data-inspect][aria-pressed="true"]').getAttribute('data-inspect');
  const node = board.view.map.find(n => n.id === selected);
  await checkCards(page.locator('.roster-card'), board.view.floors.filter(Boolean), 'map companions');
  const enemies = node.id === board.view.node?.id && board.view.battle ? board.view.battle.enemies : node.enemies;
  if (enemies.length) await checkCards(page.locator('.cm-enemies li'), enemies, 'map enemies');
}

async function fieldCards(page, board) {
  await page.waitForFunction(() => document.querySelector('#stage')?.getAttribute('aria-busy') !== 'true');
  const enemies = board.view.battle ? board.view.battle.enemies.filter(e => e.hp > 0).sort((a,b) => a.pos - b.pos) :
    board.view.node.enemies;
  const compact = page.viewportSize().width <= 480;
  await checkCards(page.locator('.bt-cell.ally.filled'), board.view.floors.filter(Boolean), 'field companions', compact);
  await checkCards(page.locator('.bt-cell.enemy.filled'), enemies, 'field enemies', compact);
}

async function checkEnlargedCard(page, unit, rearranging = false) {
  const square = page.locator('.bt-cell[data-entity="' + unit.id + '"]');
  const fullText = await square.locator('.card-effects').textContent();
  if (page.viewportSize().width <= 480) await square.tap();
  else await square.click();
  if (rearranging) await page.locator('[data-op="expand"]').click();
  const opened = page.locator('#dialog[open] .bt-card-view');
  await opened.waitFor();
  assert.equal(await opened.locator('.card-effects').textContent(), fullText);
  await checkCards(opened,[unit],'enlarged card');
  await page.locator('#dialog-close').click();
}
 
async function chooseMove(page, view, requestedSlot) {
  const candidates = view.floors.filter(Boolean).flatMap(e =>
    view.battle.dice.map((_,i) => read(page, '/api/preview?id=' + encodeURIComponent(e.id) + '&slot=' + (i+1))));
  const all = await Promise.all(candidates);
  const choices = new Map(all.map(p => [p.companion + '/' + p.slot, p]));
  const [id,slot] = moverPolicy.decide(view, (id,slot) => choices.get(id + '/' + slot)).args;
  return {id,slot:requestedSlot ?? slot};
}

async function checkRoutePreview(page, id, slot) {
  const expected = await read(page, '/api/preview?id=' + encodeURIComponent(id) + '&slot=' + slot);
  const steps = expected.scenarios[0].events.filter(e => e.type === 'visit' && e.source === id);
  assert.ok(steps.length > 0);
  await dieButton(page,slot).click();
  await ally(page,id).hover();
  assert.equal(await dieButton(page,slot).getAttribute('aria-pressed'), 'true');
  for (const step of steps) {
    const mark = step.kind === 'arrival' ? 'bt-landing' : 'bt-path';
    await page.locator('.bt-cell.ally.' + mark + '[data-x="' + step.x + '"]').waitFor();
  }
}

async function move(page, state, input, requestedSlot) {
  const {id,slot} = await chooseMove(page, state.view, requestedSlot);
  const die = dieButton(page,slot);
  const target = ally(page,id);
  const board = await mutate(page, 'move', async () => {
    if (input === 'drag') await die.dragTo(target);
    else if (input === 'keyboard') {
      await die.press('Enter');
      await target.press('Enter');
    } else {
      await die.tap();
      await target.tap();
    }
  });
  assert.equal(board.revision, state.revision + 1);
  assert.deepEqual(board.events.filter(e => e.type === 'drop').map(e => [e.source,e.slot,e.die]),
    [[id,slot,state.view.battle.dice[slot-1]]]);
  return board;
}

async function screenshot(page, name) {
  await page.screenshot({path:path.join(output, name + '.png')});
}

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  const {chromium} = playwright();
  const launch = {headless:true};
  if (process.env.USER6_BROWSER) launch.executablePath = process.env.USER6_BROWSER;
  else if (process.platform === 'win32') launch.channel = 'msedge';
  browser = await chromium.launch(launch);
  const desktop = await pageFor({viewport:{width:1440,height:900}});
  let board = await read(desktop);
  await mapCheck(desktop, board);
  await mapCards(desktop,board);
  await fits(desktop);
  await screenshot(desktop, 'desktop-map');
  await desktop.locator('.cm-enemies').screenshot({path:path.join(output,'desktop-map-enemies.png')});
  await desktop.locator('.roster-cards').screenshot({path:path.join(output,'desktop-map-companions.png')});
  const mobile = await pageFor({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await mapCheck(mobile,board);
  await mapCards(mobile,board);
  await fits(mobile);
  await desktop.locator('[data-inspect="1-1-중"]').click();
  board = await mutate(desktop, 'visit', () => desktop.locator('[data-cmd="visit"]').click());
  assert.equal(board.view.phase, 'management');
  await checkBoardLayout(desktop);
  await fieldCards(desktop,board);
  await screenshot(desktop,'desktop-preparation');
  await mobile.reload();
  await checkBoardLayout(mobile);
  await fieldCards(mobile,board);
  await fits(mobile);
  await checkEnlargedCard(mobile,board.view.floors[2],true);
  assert.equal(await mobile.locator('.bt-panel').getAttribute('data-mode'), 'swap');
  await mobile.locator('[data-op="cancel"]').tap();
  assert.equal((await read(mobile)).revision,board.revision,'examining a preparation card preserves the formation');
  await cell(desktop,'ally',3).click();
  board = await mutate(desktop, 'swap', () => cell(desktop,'ally',4).click());
  assert.equal(board.view.floors[3].type, 'choir');
  assert.equal(board.view.floors[2], null);
  board = await mutate(desktop, 'start', () => desktop.getByRole('button',{name:/전투 시작/}).click());
  await checkField(desktop,board);
  await fieldCards(desktop,board);
  const laptop = await pageFor({viewport:{width:1280,height:720}});
  await checkField(laptop,board);
  await screenshot(laptop,'laptop-battle');
  await laptop.close();
  currentPage = desktop;
  const threat = board.view.battle.enemies.find(e => e.intent.positions.length);
  assert.ok(threat);
  await cell(desktop,'enemy',threat.pos).hover();
  for (const x of new Set(threat.intent.positions)) {
    await desktop.locator('.bt-cell.ally.bt-danger[data-x="' + x + '"]').waitFor();
  }
  await desktop.locator('[data-op="exit"]').click();
  await desktop.locator('.bt-panel[data-mode="exit"] .bt-cell.ally.empty.bt-eligible').first().waitFor();
  await desktop.keyboard.press('Escape');
  assert.equal((await read(desktop)).revision, board.revision, 'cancelling exit placement preserves the turn');
  const {id} = await chooseMove(desktop,board.view,2);
  await checkEnlargedCard(desktop,board.view.floors.find(e => e?.id === id));
  assert.equal((await read(desktop)).revision, board.revision, 'a companion alone does not consume the turn');
  await checkRoutePreview(desktop,id,2);
  assert.equal((await read(desktop)).revision, board.revision);
  await screenshot(desktop, 'desktop-preview');
  await desktop.locator('.bt-roll').screenshot({path:path.join(output,'dice-options.png')});
  board = await move(desktop,board,'drag',2);
  await desktop.reload();
  await checkField(desktop,board);
  assert.deepEqual((await read(desktop)).view, board.view);
  assert.equal(await desktop.locator('.bt-die[aria-pressed="true"]').count(), 0);
  assert.equal(board.view.battle.dice[0], board.view.battle.dice[1]);
  for (const slot of [1,2]) {
    await checkRoutePreview(desktop,id,slot);
  }
  await desktop.keyboard.press('Escape');
  await dieButton(desktop,1).dragTo(desktop.locator('.bt-cell.ally.empty').first());
  assert.equal((await read(desktop)).revision, board.revision, 'switching between equal faces or dropping on an empty cell does not advance');
  board = await move(desktop,board,'keyboard',3);

  await mobile.reload();
  await checkField(mobile,board);
  await fieldCards(mobile,board);
  await screenshot(mobile, 'mobile-battle');
  await checkEnlargedCard(mobile,board.view.floors.find(Boolean));
  let touchTurns = 0;
  let woundedCardsChecked = false;
  while (board.view.phase === 'prepare' && touchTurns < 90) {
    board = await move(mobile,board,'touch');
    touchTurns++;
    const live = board.view.battle?.enemies.filter(e => e.hp > 0) ?? [];
    if (!woundedCardsChecked && live.some(e => e.hp < e.maxHp && e.intent.counter !== e.firstCounter) &&
        board.view.floors.some(e => e && e.hp < e.maxHp)) {
      await fieldCards(mobile,board);
      await screenshot(mobile,'mobile-damaged-cards');
      await desktop.reload();
      await fieldCards(desktop,board);
      await screenshot(desktop,'desktop-damaged-cards');
      const wounded = live.find(e => e.hp < e.maxHp && e.intent.counter !== e.firstCounter);
      await desktop.locator('.bt-cell.enemy[data-entity="' + wounded.id + '"]').screenshot({
        path:path.join(output,'card-detail.png'),
      });
      await desktop.locator('[data-tab="map"]').click();
      await desktop.locator('[data-inspect="' + board.view.node.id + '"]').click();
      await mapCards(desktop,board);
      await desktop.locator('.cm-enemies').screenshot({path:path.join(output,'desktop-live-map-enemies.png')});
      woundedCardsChecked = true;
    }
  }
  assert.ok(woundedCardsChecked, 'live damaged allies, damaged enemy and updated countdown were checked');
  assert.equal(board.view.phase, 'reward');
  assert.equal(board.view.coins, 3);
  await mobile.locator('[data-cmd="reward"]').first().waitFor();
  assert.equal(await mobile.locator('[data-cmd="reward"]').count(), 3);
  await checkCards(mobile.locator('.cm-ally-card'), board.view.rewards, 'mobile reward');
  await desktop.reload();
  await checkCards(desktop.locator('.cm-ally-card'), board.view.rewards, 'desktop reward');
  await screenshot(desktop,'desktop-reward');
  await fits(mobile);
  await screenshot(mobile,'mobile-reward');
  board = await mutate(mobile, 'reward', () => mobile.locator('[data-cmd="reward"]').first().tap());
  assert.equal(board.view.phase, 'place');
  board = await mutate(mobile, 'place', () => mobile.locator('[data-cmd="place"]:enabled').first().tap());
  await mapCheck(mobile, board);
  await mapCards(mobile,board);
  await fits(mobile);
  assert.equal(board.view.visited.length,1);
  assert.equal(board.view.floors.filter(Boolean).length,4);
  await screenshot(mobile,'mobile-map');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:['52 nodes and their links','formation swap','all 20 aligned squares on screen without panning or scrolling',
    'no lower explanation panels or board pan controls','exit placement cancellation','on-board movement path and landing preview',
    'three accessible die slots','companion selection and preview preserve turn','desktop slot 2 drag','slot 3 keyboard move','reload restores all dice','mobile touch',
    'first battle victory, reward and placement','desktop and phone widths',
    'live HP inside heart, enemy countdown circle, companions without countdown',
    'effects below thumbnails, full-sized effects in card magnifier, mobile five-column overview'],touchTurns,screenshots:output}));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await screenshot(currentPage,'failure').catch(() => {});
    console.error((await currentPage.locator('#stage').innerText().catch(() => '')).slice(0, 800));
  }
  if (errors.length) console.error(errors);
  console.error('Browser QA artifacts: ' + output);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server.listening) {
    const closed = once(server,'close');
    server.close();
    server.closeAllConnections();
    await closed;
  }
}
