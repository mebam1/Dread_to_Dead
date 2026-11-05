// Optional browser integration check. Requires Playwright and an installed Chromium browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createGameServer} from './server.mjs';
import {createGame, execute} from '../mvp_text_17/engine.mjs';
import {newEntity} from '../mvp_text_17/shared.mjs';
import {createGuest} from '../mvp_user_4/enemies.mjs';

const require = createRequire(import.meta.url);
function loadBrowserTools() {
  const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
  for (const name of [process.env.USER5_PLAYWRIGHT, 'playwright-core', bundled].filter(Boolean)) {
    try { return require(name); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error('Playwright를 설치하거나 USER5_PLAYWRIGHT에 playwright-core 경로를 지정하세요.');
}

const {chromium} = loadBrowserTools();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hotel-user5-browser-'));
const saveFile = path.join(output, 'isolated-game.json');
const server = createGameServer({saveFile});
const columns = '#track .column[data-floor]';
const action = name => '#decisions [data-act="' + name + '"]';
const die = (page, slot) => page.locator(action('choose')+'[data-value="'+slot+'"]');
const coin = (page, id, side = 'base') => page.locator('#track [data-quick-id="' + id + '"][data-quick-side="' + side + '"]');
const viewButton = (page, name) => page.locator('button[data-view="'+name+'"]:visible').first();
const mapNode = (page, id) => page.locator('[data-map-node="'+id+'"]');
const errors = [];
let browser, currentPage;

function collectErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.status() + ' ' + response.url());
  });
}

async function layout(page) {
  await page.waitForFunction(sel => document.querySelectorAll(sel).length === 10, columns);
  return page.locator(columns).evaluateAll(nodes => nodes.map(col => {
    const guest = col.querySelector('.guest-slot').getBoundingClientRect();
    const card = col.querySelector('.floor-card').getBoundingClientRect();
    return {floor: Number(col.dataset.floor), topX: guest.x + guest.width / 2,
      bottomX: card.x + card.width / 2, guestY: guest.y, guestBottom: guest.bottom, cardY: card.y,
      cardHeight: card.height, width: card.width};
  }));
}

function checkLayout(rows) {
  assert.equal(rows.length, 10);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.floor, index + 1);
    assert.ok(Math.abs(row.topX - row.bottomX) <= 2, 'upper/lower slot centers differ on floor ' + row.floor);
    assert.ok(row.guestBottom <= row.cardY + 2 && row.cardHeight > 15 && row.width > 15, 'separate card rows on floor ' + row.floor);
    if (index) assert.ok(row.topX > rows[index - 1].topX && Math.abs(row.guestY - rows[0].guestY) <= 2);
  }
}

async function state(page) {
  return page.evaluate(async () => (await (await fetch('/api/state')).json()).view);
}

async function revision(page) {
  return page.evaluate(async () => (await (await fetch('/api/state')).json()).revision);
}

async function checkMapScreen(page) {
  const graph = page.locator('[data-map-node]');
  await graph.first().waitFor();
  assert.equal(await page.locator('#track .guest-slot, #track .floor-card').count(), 0,
    'the map has no guest or creature slots, even in hidden markup');
  const view = await state(page);
  assert.deepEqual((await graph.evaluateAll(nodes => nodes.map(n => n.dataset.mapNode))).sort(),
    view.map.map(n => n.id).sort(), 'the map shows exactly the nodes of the current act');
  return view;
}

async function openHotel(page) {
  await viewButton(page, 'hotel').click();
  await page.locator('#track .floor-card').first().waitFor();
}

async function screenshot(page, label) {
  await page.screenshot({path: path.join(output, label + '.png'), animations: 'allow'});
}

async function checkDamageSticker(page, floor, kind, amount, {defended = false, count = 1} = {}) {
  const sticker = page.locator('.column[data-floor="'+floor+'"] .floor-card .damage-sticker[data-kind="'+kind+'"]').first();
  const number = sticker.locator('.damage-amount');
  await sticker.waitFor();
  assert.equal(await number.innerText(), '+'+amount);
  assert.match(await sticker.innerText(), /공략도\s*\+\d+/);
  if (count > 1) assert.match(await sticker.innerText(), new RegExp('×\\s*'+count));
  const ink = await number.evaluate(el => ({
    marked: el.hasAttribute('data-defended'), number: getComputedStyle(el).color,
    label: getComputedStyle(el.closest('.damage-sticker')).color,
    weight: Number(getComputedStyle(el).fontWeight),
  }));
  assert.equal(ink.marked, defended);
  assert.equal(ink.label, 'rgb(255, 255, 255)');
  assert.equal(ink.number !== ink.label, defended, 'only a defended number changes ink');
  assert.ok(ink.weight >= 700, 'damage lettering is bold');
}

const gainChip = (page, floor, resource) => page.locator('.column[data-floor="'+floor+
  '"] .guest-slot .guest-gain-preview:not(.is-gained) .guest-gain[data-resource="'+resource+'"]');

async function checkGainChip(page, floor, resource, amount) {
  const chip = gainChip(page, floor, resource);
  await chip.waitFor();
  assert.match(await chip.innerText(), new RegExp('×\\s*'+amount+'(?!\\d)'));
  assert.equal(await chip.locator('svg').count(), 1);
}

async function panel(page, name) {
  const trigger = page.locator('[data-panel="' + name + '"]').first();
  await trigger.click();
  await page.locator('#modal').waitFor({state: 'visible'});
  const modal = page.locator('#modal');
  assert.ok((await modal.innerText()).trim().length > 2);
  await page.keyboard.press('Escape');
  await modal.waitFor({state: 'hidden'});
}

async function checkGuestDialog(page, battle) {
  const modal = page.getByRole('dialog', {name: '손님 상세'});
  await modal.waitFor();
  const details = await modal.innerText();
  assert.ok(details.includes(battle.guest.name), details);
  assert.ok(details.includes('손님 '+(battle.index + 1)+'/'+battle.guests.length), details);
  assert.ok(details.includes('공포 '+battle.fear+'/'+battle.guest.t), details);
  assert.ok(details.includes(battle.position ? battle.position+'층' : '입장 대기'), details);
  assert.ok(details.includes(battle.guest.attackText), details);
  assert.ok(details.includes('비활동 '+battle.idle+'/'+battle.idleLimit+'턴'), details);
  assert.match(details, /고유 효과\s+없음/);
  for (const key of ['heart','anxiety','greed','prophecy']) {
    const count = key === 'heart' ? battle.hearts : battle[key];
    assert.equal(await modal.locator('[data-token="'+key+'"]').innerText(), '×'+count);
  }
  return modal;
}

async function traceBattleFeedback(page) {
  await page.evaluate(() => {
    window.feedbackObserver?.disconnect();
    const trace = window.battleFeedback = {flashes:[], strikes:[], movedDuringFlash:false};
    const seen = new WeakMap();
    function sample() {
      const guest = document.querySelector('#track .guest-slot.occupied');
      if (!guest) return;
      const guestFloor = Number(guest.closest('.column').dataset.floor);
      for (const el of document.querySelectorAll('#track .feedback-flash')) {
        if (!seen.has(el)) {
          const flash = {kind:el.dataset.feedback, row:el.closest('.floor-card') ? 'creature' : 'guest',
            floor:Number(el.closest('.column').dataset.floor), guestFloor, color:getComputedStyle(el).color};
          if (flash.row === 'guest' && flash.kind !== 'fear') {
            const chip = guest.querySelector('.guest-gain-preview.is-gained .guest-gain[data-resource="'+flash.kind+'"]');
            flash.gained = chip?.querySelector('svg') ? chip.textContent : null;
            flash.duration = el.style.animationDuration;
          }
          seen.set(el,flash);
          trace.flashes.push(flash);
        } else if (seen.get(el).guestFloor !== guestFloor) trace.movedDuringFlash = true;
      }
      const ghost = document.querySelector('.guest-strike-ghost');
      if (!ghost) return;
      if (!seen.has(ghost)) {
        const strike = {from:guestFloor, target:Number(ghost.dataset.targetFloor), dipped:false};
        trace.strikes.push(strike);
        seen.set(ghost,strike);
      }
      const impact = document.querySelector('#track .column[data-floor="'+ghost.dataset.targetFloor+'"] .strike-impact');
      if (impact && guest.classList.contains('lunging') && ghost.getBoundingClientRect().bottom > guest.getBoundingClientRect().bottom + 5) seen.get(ghost).dipped = true;
    }
    window.feedbackObserver = new MutationObserver(sample);
    window.feedbackObserver.observe(document.body,{subtree:true, childList:true, attributes:true});
  });
}

function checkFlash(trace, kind, sourceFloor, guestFloor, amount) {
  assert.equal(trace.movedDuringFlash, false);
  const find = (row, floor) => trace.flashes.find(f =>
    f.kind === kind && f.row === row && f.floor === floor && f.guestFloor === guestFloor);
  const source = find('creature',sourceFloor), recipient = find('guest',guestFloor);
  assert.ok(source && recipient, JSON.stringify(trace));
  assert.equal(source.color, recipient.color, kind+' uses one color on both affected cards');
  if (amount !== undefined) {
    assert.equal(recipient.gained, '×'+amount, kind+' gain and icon are visible during the flash');
    assert.equal(recipient.duration, '150ms');
  }
}

async function checkNoIdle(page) {
  const first = await layout(page);
  const animated = await page.locator('#track').evaluate(track => track.getAnimations({subtree: true}).filter(a =>
    a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
  assert.equal(animated, 0, 'noncombat cards should never have a looping animation');
  await page.waitForTimeout(360);
  const later = await layout(page);
  assert.deepEqual(later, first, 'quiet hotel should stay in place');
}

async function checkWaitingGuest(page, battle, previous) {
  await page.locator('#arrival-portrait').waitFor({state:'visible'});
  assert.equal(await page.locator('#track #arrival-portrait').count(), 0);
  assert.equal(await page.locator('#track .guest-slot:not(.occupied)').count(), 10);
  const label = await page.locator('#location').innerText();
  assert.ok(label.includes(battle.guest.name), label);
  assert.ok(label.includes((battle.index + 1) + '/' + battle.guests.length), label);
  assert.match(label, /입장 대기/);
  if (previous) {
    const history = await page.locator('#arrival-history').innerText();
    assert.ok(history.includes(previous.name), history);
    assert.ok(history.includes(previous.floor + '층'), history);
    assert.match(history, /처치/);
    assert.match(history, /1층부터/);
  }
}

// Stage a route attack that passes a guarded card and cards which can gain barnacle defense.
function seedFusedEncounter() {
  const game = createGame(31001);
  const base = game.floors[0] = newEntity(game, 'nepenthes', 'reward');
  const donor = game.floors[1] = newEntity(game, 'portrait', 'reward');
  game.floors[6] = newEntity(game, 'barnacle', 'reward');
  const fusion = game.map.find(node => node.kind === 'fusion');
  game.visited = [game.map.find(node => node.next.includes(fusion.id)).id];
  execute(game, 'visit', [fusion.id], '금화 검사');
  execute(game, 'fuse', [base.id, donor.id], '금화 검사');
  const next = game.map.find(node => fusion.next.includes(node.id) && node.kind === 'normal');
  execute(game, 'visit', [next.id], '금화 검사');
  game.node.guests[0] = createGuest('N5', 2, 4); // route, power 3: partial as well as full defense is visible
  execute(game, 'start', [], '금화 검사');
  Object.assign(game.battle, {greed: 3, anxiety: 7});
  game.floors[4].defense = 1;
  fs.writeFileSync(saveFile, JSON.stringify({format:'dread-to-dead/user5-save/1', revision:0, state:game}));
  return game.floors[0].id;
}

async function checkFusedCoins(page, id) {
  const left = coin(page, id), right = coin(page, id, 'donor');
  await left.waitFor();
  assert.ok(await left.isDisabled() && await right.isDisabled(), 'both coins show backs before choosing a die');
  const facePaint = button => button.evaluate(el => getComputedStyle(el).backgroundImage);
  const backPaint = await facePaint(left);
  await checkDamageSticker(page, 1, 'hit', 3);
  await checkDamageSticker(page, 5, 'hit', 2, {defended:true});
  await screenshot(page, 'desktop-damage-preview');
  assert.equal(await page.locator(action('choose')).count(), 3, 'each die is its own confirmation button');
  assert.equal(await page.getByRole('button', {name:/주사위 확정/}).count(), 0);
  await die(page,1).press('Space');
  await page.locator(action('move')).waitFor();
  assert.equal((await state(page)).battle.slot, 1, 'Space commits the focused die without moving');
  const barnacle = (await state(page)).floors[6].id;
  await coin(page, barnacle).click();
  await page.locator('body:not([data-busy])').waitFor();
  assert.equal((await state(page)).floors[0].defense, 0, 'the pass defense will only be granted by moving');
  await checkDamageSticker(page, 1, 'hit', 1, {defended:true});
  assert.ok(await left.isEnabled() && await right.isEnabled());
  const frontPaint = await facePaint(left);
  assert.notEqual(frontPaint, backPaint, 'the face changes visibly as well as becoming clickable');
  const [l, r, card] = await Promise.all([left.boundingBox(), right.boundingBox(),
    page.locator('.column[data-floor="1"] .floor-card').boundingBox()]);
  assert.ok(l.x + l.width <= r.x + 1, 'base and partner coins have separate ordered hit areas');
  assert.ok(r.x + r.width > card.x + card.width * .8 && l.y > card.y + card.height * .65,
    'coins sit in the lower-right corner of the fused card');
  const initial = await state(page);
  const cancel = page.locator('[data-cancel-quick]');
  const target = page.locator('.column[data-floor="3"] .floor-card.quick-target');
  await left.focus();
  await page.keyboard.press('Enter');
  await target.waitFor();
  assert.ok(await page.locator('.quick-target .floor-open:focus').count(), 'keyboard activation focuses an eligible card');
  await page.keyboard.press('Escape');
  await cancel.waitFor({state:'hidden'});
  assert.ok(await left.evaluate(el => el === document.activeElement), 'Escape restores focus to its coin');
  await left.click();
  await target.waitFor();
  assert.equal(await page.locator('.floor-card.empty.quick-target').count(), 0);
  await cancel.click();
  await cancel.waitFor({state:'hidden'});
  assert.deepEqual(await state(page), initial, 'cancelling spends nothing and applies no effect');
  await left.click();
  await target.click();
  await page.locator('body:not([data-busy])').waitFor();
  const protectedState = await state(page);
  assert.equal(protectedState.phase, 'prepare');
  assert.equal(protectedState.battle.guards[initial.floors[2].id], id);
  assert.deepEqual([protectedState.battle.greed, protectedState.battle.anxiety, protectedState.battle.face,
    protectedState.floors[0].defense], [0, 7, initial.battle.face, initial.floors[0].defense + 4]);
  assert.ok(await left.isDisabled() && await right.isEnabled());
  assert.equal(await facePaint(left), backPaint);
  assert.equal(await facePaint(right), frontPaint);
  await checkDamageSticker(page, 1, 'guard', 0, {defended:true});
  assert.equal(await page.locator('.column[data-floor="3"] .damage-sticker').count(), 0,
    'the protected floor does not receive the guard\'s damage as well');
  await screenshot(page, 'desktop-fused-coins');
  await right.click();
  await page.locator('body:not([data-busy])').waitFor();
  const used = await state(page);
  assert.deepEqual([used.battle.greed, used.battle.anxiety, used.battle.face, used.floors[0].defense],
    [0, 0, initial.battle.face + 2, protectedState.floors[0].defense]);
  assert.ok(await right.isDisabled() && await left.isDisabled());
  assert.equal(await page.locator('#modal').isVisible(), false);
}

try {
  const fusionId = seedFusedEncounter();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.USER5_BROWSER;
  browser = await chromium.launch(executablePath ? {executablePath, headless: true} : {channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
  currentPage = page;
  collectErrors(page);
  page.setDefaultTimeout(8000);
  await page.goto(url);
  const savedBattle = await checkMapScreen(page);
  assert.ok(savedBattle.visited.length && savedBattle.node && savedBattle.phase === 'choose');
  assert.equal(await mapNode(page, savedBattle.node.id).getAttribute('data-state'), 'current');
  assert.equal(await mapNode(page, savedBattle.visited.at(-1)).getAttribute('data-state'), 'completed');
  const resumeRevision = await revision(page);
  await openHotel(page);
  assert.equal(await revision(page), resumeRevision, 'resuming a saved hotel does not play a turn');
  await checkFusedCoins(page, fusionId);
  // The fused encounter passes the now-empty second floor. Completing this node
  // should reopen the route graph automatically, with only its successors reachable.
  await page.locator('[data-fold="exitOpen"] summary').click();
  await page.selectOption('[data-field="exitFloor"]', '2');
  await page.locator(action('exit')).click();
  await page.locator('body:not([data-busy])').waitFor();
  await page.locator(action('move')).click();
  const afterExit = await checkMapScreen(page);
  assert.equal(afterExit.phase, 'map');
  assert.equal(afterExit.visited.at(-1), savedBattle.node.id);
  assert.equal(await mapNode(page, savedBattle.node.id).getAttribute('data-state'), 'completed');
  assert.deepEqual(afterExit.map.filter(n => n.reachable).map(n => n.id).sort(), [...savedBattle.node.next].sort());
  const eventNode = afterExit.map.find(n => n.reachable && n.kind === 'event');
  await mapNode(page, eventNode.id).click();
  await page.locator(action('visit')).click();
  await page.locator(action('skip')).waitFor();
  assert.equal(await page.locator('#track .guest-slot, #track .floor-card').count(), 0);
  await openHotel(page);
  await viewButton(page, 'activity').click();
  await page.locator(action('skip')).click();
  assert.equal((await checkMapScreen(page)).visited.at(-1), eventNode.id);
  await page.locator('[data-panel="settings"]').click();
  await page.locator('[data-seed-form] button').click();
  await page.locator('[data-confirm-action="new"]').click();
  const newRun = await checkMapScreen(page);
  assert.equal(newRun.act, 1);
  assert.equal(newRun.phase, 'map');
  await page.evaluate(() => document.fonts.ready);
  await screenshot(page, 'desktop-map');
  const initialRevision = await revision(page);
  const reachable = newRun.map.filter(node => node.reachable);
  const boss = newRun.map.find(node => node.kind === 'boss');
  const edges = await page.locator('.adventure-map [data-from][data-to]').evaluateAll(links =>
    links.map(link => link.dataset.from+'→'+link.dataset.to));
  assert.deepEqual(edges.sort(), newRun.map.flatMap(node => node.next.map(id => node.id+'→'+id)).sort(),
    'the visible paths connect the exact nodes from the campaign');
  await mapNode(page, boss.id).click();
  assert.equal(await page.locator(action('visit')+':enabled:visible').count(), 0);
  const mapGuest = page.locator('#decisions [data-guest-node="'+boss.id+'"]').first();
  if (!await mapGuest.isVisible()) await page.locator('#decisions details:has([data-guest-node="'+boss.id+'"]) summary').click();
  const mapGuestName = await mapGuest.innerText();
  await mapGuest.click();
  const rosterDialog = page.getByRole('dialog', {name:'손님 상세'});
  await rosterDialog.waitFor();
  assert.ok((await rosterDialog.innerText()).includes(mapGuestName));
  await page.keyboard.press('Escape');
  await checkMapScreen(page);
  const alternate = reachable[1];
  await mapNode(page, alternate.id).click();
  assert.deepEqual(JSON.parse(decodeURIComponent(await page.locator(action('visit')).getAttribute('data-args'))), [alternate.id]);
  assert.equal(await revision(page), initialRevision, 'inspecting a future or reachable route only reads the map');
  await openHotel(page);
  checkLayout(await layout(page));
  await checkNoIdle(page);
  assert.equal(await page.locator('#arrival-portrait').isVisible(), false);
  assert.equal(await page.locator('#track .guest-slot:not(.occupied)').count(), 10);
  assert.equal(await page.locator('#track .floor-card.filled').count(), 4);
  assert.equal(await page.locator('#track .floor-card.empty').count(), 6);
  assert.equal(await page.locator('#track [data-quick-id]').count(), 1);
  assert.ok(await coin(page, 'e4').isDisabled(), 'the safe keeps its dark coin while inspecting the hotel');
  assert.equal(await page.locator(action('visit')+':visible').count(), 0);
  await screenshot(page, 'desktop-hotel');
  for (const name of ['journal', 'settings', 'guide']) await panel(page, name);
  const paper = page.locator('#track [data-inspect="1"]');
  await paper.focus();
  await page.keyboard.press('Enter');
  await page.locator('#modal[open]').waitFor();
  assert.match(await page.locator('#modal').innerText(), /문틈의 시선/);
  await page.keyboard.press('Escape');
  await page.locator('#modal').waitFor({state: 'hidden'});
  assert.equal(await paper.getAttribute('aria-current'), 'true');
  assert.equal(await paper.evaluate(card => getComputedStyle(card).outlineWidth), '4px');
  const token = paper.locator('[data-token="tokens"]');
  assert.match(await token.innerText(), /×\s*2/);
  assert.equal(await token.locator('svg').count(), 1);
  await token.click();
  assert.match(await page.locator('.token-tip').innerText(), /파훼 토큰/);

  const floorCard = (p, n) => p.locator('#track .floor-card[data-inspect="' + n + '"]');
  const floorIds = async p => (await state(p)).floors.map(e => e?.id);
  const originals = await floorIds(page);
  await floorCard(page, 1).dragTo(floorCard(page, 3));
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('두 괴이 맞교환'));
  const swapped = await floorIds(page);
  assert.equal(swapped[0], originals[2]);
  assert.equal(swapped[2], originals[0]);
  await floorCard(page, 3).dragTo(floorCard(page, 1));
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('3층 → 1층'));
  assert.deepEqual(await floorIds(page), originals);
  const afterSwap = await revision(page);
  await floorCard(page, 1).dragTo(page.locator('.column[data-floor="2"] .guest-slot'));
  const sameCard = await floorCard(page, 1).boundingBox();
  await page.mouse.move(sameCard.x + 15, sameCard.y + 15);
  await page.mouse.down();
  await page.mouse.move(sameCard.x + 33, sameCard.y + 15);
  await page.mouse.up();
  assert.equal(await revision(page), afterSwap);
  assert.equal(await page.locator('#modal').isVisible(), false);

  const touchPage = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  collectErrors(touchPage);
  await touchPage.goto(url);
  await checkMapScreen(touchPage);
  assert.ok(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'the map fits a narrow viewport');
  await screenshot(touchPage, 'mobile-map');
  await viewButton(touchPage, 'hotel').tap();
  await floorCard(touchPage, 1).waitFor();
  const touchSession = await touchPage.context().newCDPSession(touchPage);
  async function touchDrop(from, to) {
    const start = await floorCard(touchPage, from).boundingBox();
    const end = await floorCard(touchPage, to).boundingBox();
    const x = start.x + start.width / 2, y = start.y + start.height / 2;
    const targetX = end.x + end.width / 2;
    const touch = (type, points) => touchSession.send('Input.dispatchTouchEvent', {type, touchPoints: points});
    await touch('touchStart', [{x, y}]);
    await touch('touchMove', [{x: (x + targetX) / 2, y}]);
    await touch('touchMove', [{x: targetX, y}]);
    await touch('touchEnd', []);
    await touchPage.waitForFunction(text => document.querySelector('#notice').textContent.startsWith(text), from + '층 → ' + to + '층');
  }
  await touchDrop(1, 2);
  assert.equal((await floorIds(touchPage))[1], originals[0]);
  await touchDrop(2, 1);
  assert.deepEqual(await floorIds(touchPage), originals);
  for (const [from, to, side] of [[1,10,'right'],[10,1,'left']]) {
    const card = await floorCard(touchPage, from).boundingBox();
    const track = await touchPage.locator('#track').boundingBox();
    const x = card.x + card.width / 2, y = card.y + card.height / 2;
    const edge = side === 'right' ? track.x + track.width - 10 : track.x + 10;
    const touch = (type, points) => touchSession.send('Input.dispatchTouchEvent', {type, touchPoints: points});
    await touch('touchStart', [{x, y}]);
    await touch('touchMove', [{x: edge, y}]);
    await floorCard(touchPage, to).and(touchPage.locator('.drop-target')).waitFor();
    await touch('touchEnd', []);
    await touchPage.waitForFunction(text => document.querySelector('#notice').textContent.startsWith(text), from + '층 → ' + to + '층');
    assert.equal((await floorIds(touchPage))[to - 1], originals[0]);
  }
  await touchPage.close();
  // Reload the first tab to pick up the revisions committed from touch.
  await page.reload();
  await checkMapScreen(page);
  await openHotel(page);

  // Move a printed card from 1 to 2 using the accessible in-game controls.
  await page.locator('[data-fold="reorder"] summary').click();
  await page.selectOption('[data-field="from"]', '3');
  await page.selectOption('[data-field="from"]', '1');
  await page.selectOption('[data-field="to"]', '2');
  assert.equal(await page.locator('.floor-card.is-selected').getAttribute('data-inspect'), '2');
  await page.locator(action('swap')).click();
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).view.floors[1]?.id === 'e1');
  await checkNoIdle(page);
  await viewButton(page, 'map').click();
  await checkMapScreen(page);
  await mapNode(page, reachable[0].id).click();
  await page.locator(action('visit')).click();
  await page.locator(action('start')).waitFor();
  checkLayout(await layout(page));
  const battleNode = (await state(page)).node;
  assert.equal(battleNode.id, reachable[0].id);
  await page.locator('#decisions [data-guest-node][data-guest-index="1"]').click();
  await rosterDialog.waitFor();
  const rosterDetails = await rosterDialog.innerText();
  assert.ok(rosterDetails.includes(battleNode.guests[1].name), rosterDetails);
  assert.ok(rosterDetails.includes(battleNode.guests[1].attackText), rosterDetails);
  assert.ok(rosterDetails.includes('공포 한계 '+battleNode.guests[1].t), rosterDetails);
  assert.equal(await rosterDialog.locator('[data-token="anxiety"]').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator(action('start')).click();
  await page.locator('.dec-forecast').waitFor();
  const entering = await state(page);
  assert.equal(entering.phase, 'choose');
  await checkWaitingGuest(page, entering.battle);
  const beforeInspect = await revision(page);
  const entrance = page.locator('#arrival-portrait[data-panel="guest"]');
  await entrance.focus();
  await entrance.press('Enter');
  await checkGuestDialog(page, entering.battle);
  await page.keyboard.press('Escape');
  await page.locator('#modal').waitFor({state:'hidden'});
  assert.ok(await entrance.evaluate(el => document.activeElement === el), 'closing guest details returns focus to the entrance');
  await page.locator('#track .guest-slot:not(.occupied)').first().click();
  assert.equal(await page.locator('#modal').isVisible(), false);
  assert.equal(await revision(page), beforeInspect);
  assert.equal(await page.locator('#board-fear').innerText(), '공포 0/4');
  assert.equal(await page.locator('#track.can-reorder').count(), 0);
  const lockedRevision = await revision(page);
  await floorCard(page, 2).dragTo(floorCard(page, 3));
  assert.equal(await revision(page), lockedRevision);
  assert.equal(await page.locator('#track .guest-slot.occupied .guest-portrait').count(), 0, 'entry starts before floor 1');
  await checkDamageSticker(page, 1, 'miss', 1, {count:2});
  assert.equal(await gainChip(page, 2, 'anxiety').count(), 0);
  await die(page,3).locator('.dec-die-face').hover();
  await checkDamageSticker(page, 5, 'hit', 1, {count:2});
  await checkGainChip(page, 2, 'anxiety', 4);
  assert.equal((await state(page)).battle.anxiety, entering.battle.anxiety);
  assert.ok(await die(page,3).evaluate(el => el.classList.contains('is-previewed')));
  assert.equal(await floorCard(page,1).locator('.damage-sticker').count(), 0);
  await page.locator('#table h1').hover();
  await checkDamageSticker(page, 1, 'miss', 1, {count:2});
  assert.equal(await gainChip(page, 2, 'anxiety').count(), 0, 'restoring the default preview clears gains from the other path');
  await die(page,2).focus();
  await checkDamageSticker(page, 4, 'miss', 1, {count:2});
  await page.keyboard.press('Tab');
  await checkDamageSticker(page, 5, 'hit', 1, {count:2});
  assert.equal(await revision(page), lockedRevision, 'comparing dice only reads the current turn');
  const slot = entering.battle.rolls.indexOf(Math.max(...entering.battle.rolls)) + 1;
  await die(page,slot).click();
  await page.locator(action('move')).waitFor();
  assert.equal(await revision(page), lockedRevision+1);
  assert.equal((await state(page)).battle.slot, slot, 'one click commits the face displayed on the die');
  await page.locator('#track .column.pass').first().waitFor();
  for (const [kind, style] of [['pass','dashed'],['arrival','solid']]) {
    const slot = page.locator('#track .column.' + kind + ' .guest-slot').first();
    assert.deepEqual(await slot.evaluate(el => {
      const css = getComputedStyle(el);
      return [css.outlineWidth, css.outlineStyle];
    }), ['4px',style]);
  }

  // A DOM observer sees the same floor sequence as a viewer during real movement.
  await page.evaluate(() => {
    window.observedHotelFloors = [];
    window.guestAlsoAtEntrance = false;
    function sample() {
      const guest = document.querySelector('#track .guest-slot.occupied .guest-portrait');
      const floor = Number(guest?.closest('[data-floor]')?.dataset.floor);
      if (floor && window.observedHotelFloors.at(-1) !== floor) window.observedHotelFloors.push(floor);
      if (floor && document.querySelector('#arrival-portrait')?.getClientRects().length) window.guestAlsoAtEntrance = true;
    }
    new MutationObserver(sample).observe(document.querySelector('#track'), {childList: true, subtree: true, attributes: true});
  });
  await traceBattleFeedback(page);
  await page.locator(action('move')).click();
  await page.waitForFunction(() => document.querySelector('#decisions [data-act="choose"]') && document.querySelector('#track .guest-slot.occupied .guest-portrait'));
  const moved = await state(page);
  const firstFeedback = await page.evaluate(() => window.battleFeedback);
  checkFlash(firstFeedback, 'anxiety', 2, 2, 4);
  assert.deepEqual(firstFeedback.strikes,[
    {from:5,target:5,dipped:true}, {from:5,target:5,dipped:true},
  ], 'each actual hit should dip the guest card into its target and return');
  assert.equal(moved.battle.position, entering.battle.rolls[slot - 1]);
  assert.equal(await page.locator('.guest-slot.occupied .guest-fear').innerText(), '공포 '+moved.battle.fear+'/'+moved.battle.guest.t);
  const travel = await page.evaluate(() => window.observedHotelFloors);
  assert.deepEqual(travel, Array.from({length: moved.battle.position}, (_, i) => i + 1));
  assert.equal(await page.locator('#track .guest-slot.occupied .guest-portrait').count(), 1);
  assert.match(await page.locator('#track .guest-slot.occupied').evaluate(el => getComputedStyle(el).boxShadow), /0px 0px 0px 4px/);
  assert.equal(await page.locator('#track .guest-slot.occupied .guest-portrait').first().evaluate(el => Number(el.closest('[data-floor]').dataset.floor)), moved.battle.position);
  assert.ok(await page.locator('#track [data-token]').count() > 0);
  assert.match(await page.locator('#track .guest-slot.occupied [data-token="anxiety"]').innerText(), /×\s*4/);
  await page.locator('#track .guest-slot.occupied [data-token="anxiety"]').click();
  assert.match(await page.locator('.token-tip').innerText(), /불안/);
  assert.equal(await page.locator('#modal').isVisible(), false);
  const guestCard = page.locator('.guest-slot.occupied button[data-panel="guest"]');
  await guestCard.click({position:{x:10, y:10}});
  await checkGuestDialog(page, moved.battle);
  await screenshot(page, 'desktop-guest-details');
  await page.keyboard.press('Escape');
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.evaluate(() => scrollTo(0, 0));
  await screenshot(page, 'desktop-battle');

  const mobile = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce'});
  currentPage = mobile;
  mobile.setDefaultTimeout(8000);
  collectErrors(mobile);
  await mobile.goto(url);
  await checkMapScreen(mobile);
  await viewButton(mobile, 'hotel').tap();
  checkLayout(await layout(mobile));
  await mobile.locator('.dec-forecast').waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'narrow layout should fit the viewport');
  assert.ok(await mobile.locator('.board-head h1').evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 2),
    'narrow layout should keep the hotel title on one line');
  await mobile.waitForFunction(() => {
    const track = document.querySelector('#track').getBoundingClientRect();
    const guest = document.querySelector('#track .guest-slot.occupied')?.getBoundingClientRect();
    return guest && guest.left >= track.left - 2 && guest.right <= track.right + 2;
  });
  await screenshot(mobile, 'mobile-battle');
  const beforeNext = await mobile.locator('#track').evaluate(el => el.scrollLeft);
  await mobile.locator('#next').tap();
  await mobile.waitForFunction(left => document.querySelector('#track').scrollLeft > left + 30, beforeNext);
  await mobile.waitForTimeout(450);
  const beforePrev = await mobile.locator('#track').evaluate(el => el.scrollLeft);
  await mobile.locator('#prev').tap();
  await mobile.waitForFunction(left => document.querySelector('#track').scrollLeft < left - 30, beforePrev);
  await mobile.waitForTimeout(450);
  await mobile.locator('#zoom').tap();
  assert.equal(await mobile.locator('#zoom').getAttribute('aria-pressed'), 'true');
  checkLayout(await layout(mobile));
  await mobile.locator('#zoom').tap();
  const tenth = mobile.locator(columns + '[data-floor="10"] .floor-card');
  await tenth.scrollIntoViewIfNeeded();
  assert.ok(await tenth.evaluate(el => el.getBoundingClientRect().x < innerWidth && el.getBoundingClientRect().right > 0));
  const battleRevision = await revision(mobile);
  await viewButton(mobile, 'map').tap();
  await checkMapScreen(mobile);
  assert.equal(await mobile.locator(action('visit')+':enabled:visible').count(), 0);
  await viewButton(mobile, 'activity').tap();
  await die(mobile,1).waitFor();
  assert.equal(await revision(mobile), battleRevision, 'checking the map during battle leaves the turn intact');
  // In the fixed first public roll, 5→6→7→8→9→10→1 can be read and watched on the board.
  const wrapSlot = moved.battle.rolls.findIndex(face => moved.battle.position + face > 10) + 1;
  assert.ok(wrapSlot > 0, 'expected a wrap-around option in this fixture');
  await die(page,wrapSlot).press('Enter');
  await page.locator(action('move')).waitFor();
  assert.equal((await state(page)).battle.slot, wrapSlot);
  await page.locator(action('move')).click();
  await page.waitForFunction(() => document.querySelector('#decisions [data-act="choose"]') &&
    window.observedHotelFloors.includes(10) && window.observedHotelFloors.at(-1) === 1);
  assert.deepEqual(await page.evaluate(() => window.observedHotelFloors.slice(-6)), [6, 7, 8, 9, 10, 1]);
  const wrapped = await state(page);
  assert.equal(wrapped.battle.position, 1);
  assert.equal(wrapped.battle.index, entering.battle.index, 'wrapping must keep the same guest');
  assert.equal(wrapped.battle.guest.name, entering.battle.guest.name);
  assert.equal(await page.locator('.column[data-floor="1"] .guest-name').innerText(), entering.battle.guest.name);
  assert.equal(await page.evaluate(() => window.guestAlsoAtEntrance), false);

  // A new mobile session resumes the wrapped turn. Slot 3 now kills this guest at floor 3.
  await mobile.emulateMedia({reducedMotion:'no-preference'});
  await mobile.reload();
  await checkMapScreen(mobile);
  await viewButton(mobile, 'hotel').tap();
  await traceBattleFeedback(mobile);
  await die(mobile,3).tap();
  await mobile.locator(action('move')).waitFor();
  assert.equal((await state(mobile)).battle.slot, 3);
  await mobile.locator(action('move')).tap();
  const defeated = mobile.locator('.column[data-floor="3"] .guest-slot');
  await defeated.locator('.kill-stamp').waitFor({state:'visible'});
  assert.equal(await defeated.locator('.guest-name').innerText(), wrapped.battle.guest.name);
  await mobile.waitForFunction(async () => {
    const v = (await (await fetch('/api/state')).json()).view;
    return v.battle?.index === 1 && v.battle.position === 0 &&
      document.querySelector('#decisions [data-act="choose"]') && !document.querySelector('#track .guest-slot.occupied .guest-portrait');
  });
  await mobile.locator('body:not([data-busy])').waitFor();
  const next = (await state(mobile)).battle;
  const killFeedback = await mobile.evaluate(() => window.battleFeedback);
  checkFlash(killFeedback, 'fear', 3, 3);
  assert.equal(killFeedback.strikes.length, 0, 'a guest killed during movement does not counterattack');
  assert.equal(next.index, wrapped.battle.index + 1);
  const previous = {name: wrapped.battle.guest.name, floor: 3};
  await checkWaitingGuest(mobile, next, previous);
  await mobile.locator('#arrival-portrait[data-panel="guest"]').tap();
  const nextGuestDetails = await checkGuestDialog(mobile, next);
  assert.equal((await nextGuestDetails.innerText()).includes(previous.name), false);
  await screenshot(mobile, 'mobile-guest-details');
  await nextGuestDetails.locator('[data-dismiss]').tap();
  await nextGuestDetails.waitFor({state:'hidden'});
  const notice = await mobile.locator('#notice').innerText();
  assert.ok(notice.includes(previous.name) && notice.includes('3층') && notice.includes('처치'), notice);
  await screenshot(mobile, 'mobile-next-guest');
  await mobile.emulateMedia({reducedMotion:'reduce'});
  await mobile.reload();
  await checkMapScreen(mobile);
  await viewButton(mobile, 'hotel').tap();
  await checkWaitingGuest(mobile, next, previous);
  // Retiring mid-battle keeps a final ledger, but the upper row belongs to live guests.
  await die(mobile,1).tap();
  await mobile.locator(action('move')).waitFor();
  await checkWaitingGuest(mobile, next, previous);
  await traceBattleFeedback(mobile);
  await mobile.locator(action('move')).tap();
  await mobile.locator('.guest-slot.occupied').waitFor();
  assert.equal(await mobile.locator('#arrival-portrait').isVisible(), false);
  assert.equal(await mobile.locator('.guest-slot.occupied .guest-name').innerText(), next.guest.name);
  await mobile.locator('body:not([data-busy])').waitFor();
  assert.deepEqual(await mobile.evaluate(() => window.battleFeedback),
    {flashes:[],strikes:[],movedDuringFlash:false}, 'reduced motion still advances the turn without transient effects');
  await mobile.locator('[data-panel="settings"]').tap();
  await mobile.locator('[data-giveup]').tap();
  await mobile.locator('[data-confirm-action="giveup"]').tap();
  await mobile.locator('#decisions [data-local="new"]').waitFor();
  assert.equal((await state(mobile)).phase, 'lost');
  assert.equal(await mobile.locator('#arrival-portrait').isVisible(), false);
  assert.equal(await mobile.locator('.guest-slot.occupied').count(), 0);
  await mobile.locator('[data-panel="settings"]').click();
  await mobile.locator('[data-seed-form] [name="seed"]').fill('31002');
  await mobile.locator('[data-seed-form] button').tap();
  await mobile.locator('[data-cancel]').tap();
  assert.equal((await state(mobile)).seed, 31001);
  await mobile.locator('[data-seed-form] button').tap();
  await mobile.locator('[data-confirm-action="new"]').tap();
  await mobile.locator(action('visit')).waitFor();
  assert.equal((await state(mobile)).seed, 31002);
  // The safe in floor six raises fear in this opening without removing a heart.
  await mobile.locator(action('visit')).tap();
  await mobile.locator(action('start')).tap();
  await die(mobile,1).tap();
  const safeCoin = coin(mobile, 'e4');
  await safeCoin.tap();
  await mobile.locator('body:not([data-busy])').waitFor();
  assert.ok(await safeCoin.isDisabled(), 'the ambushing safe cannot be activated again');
  assert.equal((await state(mobile)).floors[5].ambush, 99);
  await mobile.emulateMedia({reducedMotion:'no-preference'});
  await traceBattleFeedback(mobile);
  await mobile.locator(action('move')).tap();
  await die(mobile,1).waitFor();
  await mobile.locator('.guest-fear').filter({hasText:'공포 2/4'}).waitFor();
  const routeFeedback = await mobile.evaluate(() => window.battleFeedback);
  checkFlash(routeFeedback, 'fear', 6, 6);
  checkFlash(routeFeedback, 'greed', 6, 6, 1);
  assert.deepEqual(routeFeedback.strikes.map(s => [s.from,s.target,s.dipped]),[1,2,3,4,5,6].map(f => [6,f,true]));
  assert.equal(await mobile.locator('#board-fear').innerText(), '공포 2/4');
  await screenshot(mobile, 'mobile-fear');
  await mobile.locator('body:not([data-busy])').waitFor();
  await mobile.locator('.guest-slot.occupied button[data-panel="guest"]').tap({position:{x:10, y:10}});
  const finalDetails = await checkGuestDialog(mobile, (await state(mobile)).battle);
  await finalDetails.locator('[data-dismiss]').tap();
  // On a fresh run, put the rune wall in floor 1. Face 2 passes it for prophecy.
  await mobile.locator('[data-panel="settings"]').tap();
  await mobile.locator('[data-seed-form] button').tap();
  await mobile.locator('[data-confirm-action="new"]').tap();
  await checkMapScreen(mobile);
  await viewButton(mobile, 'hotel').tap();
  await mobile.locator('[data-fold="reorder"] summary').tap();
  await mobile.selectOption('[data-field="from"]','5');
  await mobile.selectOption('[data-field="to"]','1');
  await mobile.locator(action('swap')).tap();
  await mobile.waitForFunction(() => document.querySelector('.column[data-floor="1"] .card-name')?.textContent.includes('룬'));
  await viewButton(mobile, 'map').tap();
  await checkMapScreen(mobile);
  await mobile.locator(action('visit')).tap();
  await mobile.locator(action('start')).tap();
  await die(mobile,2).tap();
  await mobile.locator(action('move')).waitFor();
  await checkGainChip(mobile, 1, 'prophecy', 1);
  assert.equal((await state(mobile)).battle.prophecy, 0, 'a tap confirms the die, and movement gains wait until movement');
  await traceBattleFeedback(mobile);
  await mobile.locator(action('move')).tap();
  await die(mobile,1).waitFor();
  const runeFeedback = await mobile.evaluate(() => window.battleFeedback);
  checkFlash(runeFeedback,'prophecy',1,1,1);
  const colors = [firstFeedback, routeFeedback, runeFeedback].flatMap(t => t.flashes.map(f => [f.kind,f.color]));
  assert.equal(new Set(new Map(colors).values()).size, 4, 'fear and three resources should have distinct flash colors');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({checked: ['desktop', 'mobile', 'map first without hotel slots', 'route graph and guest roster', 'map and hotel navigation', '20 aligned slots', 'quiet noncombat', 'paper swap', 'panels', 'tokens', 'guest travel', '10→1', 'new guest entry', 'guest details', 'attack contact', 'four effect colors', 'fused coin costs', 'coin target and cancel', 'touch coin', 'damage stickers', 'current and planned defense', 'guest gain preview and flash'], travel, screenshots: output}));
} catch (error) {
  if (currentPage) {
    await screenshot(currentPage, 'failure');
    console.error(await currentPage.evaluate(() => ({modal: document.querySelector('#modal')?.innerText,
      modalOpen: document.querySelector('#modal')?.open, notice: document.querySelector('#notice')?.innerText,
      decision: document.querySelector('#decisions h2')?.innerText, busy: document.body.hasAttribute('data-busy')})));
  }
  throw error;
} finally {
  console.log('Browser QA artifacts: ' + output);
  if (browser) await browser.close();
  if (server.listening) { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; }
}
