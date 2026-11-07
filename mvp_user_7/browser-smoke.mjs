import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createGame, execute} from '../mvp_text_20/engine.mjs';
import {healingEncounter, temporaryGame} from './test-support.mjs';

const require = createRequire(import.meta.url);
function playwright() {
  const bundled = path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
  for (const name of [process.env.USER7_PLAYWRIGHT, 'playwright-core', bundled].filter(Boolean)) {
    try { return require(name); }
    catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  throw Error('playwright-core를 설치하거나 USER7_PLAYWRIGHT로 경로를 지정하세요.');
}
const browser = await playwright().chromium.launch(process.env.USER7_BROWSER
  ? {executablePath:process.env.USER7_BROWSER} : process.platform === 'win32' ? {channel:'msedge'} : {});
const output = await mkdtemp(path.join(os.tmpdir(),'dtd-user7-screens-'));
const errors = [];
const die = (slot, direction) => '.bt-die[data-slot="'+slot+'"][data-direction="'+direction+'"]';
const ally = id => '.bt-cell.ally[data-entity="'+id+'"]';
const route = dir => '.bt-route[data-route="'+dir+'"]';

async function withBoard(state, options, run) {
  const game = await temporaryGame({format:'dread-to-dead/user7-save/1', revision:0, state});
  const context = await browser.newContext({reducedMotion:'reduce', ...options});
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', err=>errors.push(err.message));
    page.on('response', r=>{ if (r.status()>=400) errors.push(r.status()+' '+r.url()); });
    await page.goto(game.url);
    await run(page, async ()=>(await page.request.get(game.url+'/api/state')).json());
  } finally {
    await context.close();
    await game.close();
  }
}
async function fits(page) {
  const overflow = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=1,'horizontal overflow '+overflow);
}
async function takeMove(page, input, id, slot, direction) {
  const [response] = await Promise.all([
    page.waitForResponse(r=>r.url().endsWith('/api/action') && r.request().method()==='POST'), input()
  ]);
  assert.equal(response.status(),200);
  assert.deepEqual(response.request().postDataJSON().args,[id,slot,direction]);
  const result = await response.json();
  const drops = result.events.filter(e=>e.type==='drop');
  assert.equal(drops.length,1);
  assert.deepEqual([drops[0].source,drops[0].slot,drops[0].direction],[id,slot,direction]);
  return result;
}

async function checkDice(page, values) {
  assert.equal(await page.locator('.bt-die').count(), 6);
  for (const [i, value] of values.entries()) {
    for (const direction of ['left','right']) {
      const choice = page.locator(die(i+1,direction));
      assert.equal(await choice.getAttribute('draggable'),'true');
      assert.match(await choice.getAttribute('aria-label'), direction==='left' ? /왼쪽/ : /오른쪽/);
      assert.equal(await choice.locator('.lit').count(), value);
      const arrow = choice.locator('.bt-die-arrow');
      assert.equal(await arrow.innerText(), direction==='left' ? '←' : '→');
      const [face, mark] = await Promise.all([choice.boundingBox(), arrow.boundingBox()]);
      assert.ok(mark.x + mark.width/2 > face.x + face.width/2 &&
        mark.y + mark.height/2 > face.y + face.height/2, 'direction arrow at lower right of die');
    }
  }
}
const screenshot = (page, name) => page.screenshot({path:path.join(output,name+'.png'),fullPage:true});

async function checkFingerDrag(page, state) {
  const cdp = await page.context().newCDPSession(page);
  const source = page.locator(die(1,'right')), target = page.locator(ally('c2'));
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const point = box => ({x:Math.round(box.x+box.width/2), y:Math.round(box.y+box.height/2), id:1});
  try {
    for (const canceled of [true,false]) {
      await source.scrollIntoViewIfNeeded();
      const start = point(await source.boundingBox());
      await send('touchStart',[start]);
      await send('touchMove',[{...start,y:start.y+18}]);
      await page.locator('.bt-touch-ghost').waitFor();
      await send('touchMove',[point(await target.boundingBox())]);
      await page.locator('.bt-touch-target').waitFor();
      await page.locator(route('right')).waitFor();
      const readout=page.locator('.bt-drag-readout');
      assert.match(await readout.innerText(),/03번 도착.*적 체력 피해 7.*실제 회복 15/);
      const box=await readout.boundingBox();
      assert.ok(box.y>=0 && box.y+box.height<=page.viewportSize().height);
      assert.equal((await state()).revision,0);
      if (canceled) {
        await send('touchCancel',[]);
        await page.locator('.bt-touch-ghost').waitFor({state:'detached'});
        assert.equal(await page.locator('.bt-die[aria-pressed="true"]').count(),0);
        assert.equal((await state()).revision,0);
      } else {
        const result = await takeMove(page,()=>send('touchEnd',[]),'c2',1,'right');
        assert.equal(result.view.phase,'reward');
        assert.equal(result.revision,1);
        await page.getByRole('heading',{name:'전투 보상'}).waitFor();
      }
    }
  } finally { await cdp.detach(); }
}

try {
  const initial=createGame(31001);
  execute(initial,'visit',['1-1-좌'],'연속 적 행동');
  execute(initial,'start',[],'첫 적 예고');
  await withBoard(initial, {viewport:{width:1280,height:800}}, async (page, state)=>{
    const third=page.locator('[data-threat="E3"]');
    await third.waitFor();
    assert.match(await third.innerText(),/07번에서/);
    assert.match(await third.innerText(),/06번 빈칸\s*→\s*07번 빈칸/);
    await third.focus();
    assert.deepEqual(await page.locator('.bt-danger').evaluateAll(cells=>cells.map(el=>el.dataset.x)),['6','7']);
    assert.match(await page.locator('[data-threat="E1"]').innerText(),/체력 피해 0.*방어 흡수 12/);
    await third.click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(),/6 → 7번/);
    await page.getByRole('button',{name:'닫기'}).click();
    await checkDice(page, initial.battle.dice);
    let release;
    const held = new Promise(resolve=>{release=resolve;});
    const slowPreview = '**/api/preview?id=c3&slot=1&direction=left';
    const arrived = page.waitForRequest(slowPreview);
    await page.route(slowPreview,async route=>{
      const response = await route.fetch();
      await held;
      await route.fulfill({response});
    });
    await page.locator(die(1,'left')).click();
    await page.locator(ally('c3')).hover();
    await arrived;
    await page.locator(die(2,'right')).click();
    const right = page.locator(route('right'));
    await right.waitFor();
    const before = await right.innerText();
    const delivered = page.waitForResponse(slowPreview);
    release();
    await delivered;
    assert.equal(await right.innerText(), before);
    assert.equal(await page.locator(route('left')).count(),0);
    const snapshot=await state();
    assert.equal(snapshot.revision,0);
    await page.locator('[data-op="exit"]').click();
    await page.locator('.bt-cell.ally[data-x="6"]').click();
    await page.locator('[data-threat="E2"]').getByText(/06번 철수 접촉/).waitFor();
    const updated=await state();
    assert.equal(updated.revision,1);
    assert.deepEqual(updated.view.battle.dice,snapshot.view.battle.dice);
    assert.equal(updated.view.battle.turn,snapshot.view.battle.turn);
  });

  await withBoard(createGame(31900), {viewport:{width:390,height:844}, isMobile:true, hasTouch:true}, async (page, state) => {
    await page.locator('[data-inspect="1-1-우"]').tap();
    assert.equal(await page.locator('.cm-enemies li').count(),3);
    assert.match(await page.locator('.cm-enemies').innerText(),/첫 행동 2라운드/);
    await page.locator('[data-cmd="visit"]').tap();
    await page.locator('[data-op="start"]').tap();
    await page.locator('.bt-intents').waitFor();
    assert.equal(await page.locator('.bt-threat').count(),3);
    assert.equal(await page.locator('.bt-cell').count(),20);
    const before=await state();
    assert.deepEqual(before.view.battle.dice,[3,4,5]);
    await checkDice(page,before.view.battle.dice);
    await page.locator(die(3,'left')).tap();
    await page.locator('select[data-preview-ally]').selectOption('c3');
    const left=page.locator(route('left')), right=page.locator(route('right'));
    await left.waitFor();
    assert.match(await left.innerText(),/03\s*→\s*02\s*→\s*01\s*→\s*10\s*→\s*09\s*→\s*08/);
    assert.equal(await left.locator('.cf-dealt dd').innerText(),'10');
    assert.match(await left.locator('.bt-next-threats').innerText(),/02번 수달 성녀.*수달 성기사 대신 받기/);
    await page.locator(die(3,'right')).tap();
    await right.waitFor();
    assert.match(await right.innerText(),/03\s*→\s*04\s*→\s*05\s*→\s*06\s*→\s*07\s*→\s*08/);
    assert.equal(await left.count(),0);
    assert.equal((await state()).revision,before.revision);
    await fits(page);
    await screenshot(page,'phone-directions');
    await page.reload();
    await page.locator(die(3,'left')).waitFor();
    assert.equal(await page.locator('.bt-die[aria-pressed="true"]').count(),0);
    assert.equal((await state()).revision,before.revision);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{
      window.gameCues=[];
      new MutationObserver(records=>{
        for (const r of records) for (const el of r.addedNodes) {
          if (el.classList?.contains('bt-fx')) window.gameCues.push([el.textContent,r.target.dataset.x]);
        }
      }).observe(document.getElementById('stage'),{childList:true,subtree:true});
    });
    await page.locator(die(3,'left')).tap();
    const result=await takeMove(page,()=>page.locator(ally('c3')).tap(),'c3',3,'left');
    assert.equal(result.view.battle.turn,2);
    assert.equal(result.view.floors[7].id,'c3');
    assert.equal(result.events.find(e=>e.type==='drop').direction,'left');
    await page.locator('[data-last-action]').getByText(/왼쪽 이동/).first().waitFor();
    assert.equal(await page.locator('.bt-head + [data-last-action]').count(),1);
    assert.equal(await page.locator('[data-last-action]').count(),1);
    const cues=await page.evaluate(()=>window.gameCues);
    assert.ok(cues.some(([label,x])=>label.includes('성가대원') && label.includes('도착 공격') && x==='8'));
    assert.ok(cues.some(([label,x])=>label==='−10' && x==='8'));
  });

  // The two fives have identical range. Slot and direction still belong to the
  // specific die graphic that was dragged, even after an earlier invalid drop.
  for (const [slot, direction, pathTaken] of [[2,'left',[10,9,8,7,6]],[3,'right',[2,3,4,5,6]]]) {
    await withBoard(healingEncounter(), {viewport:{width:1440,height:1000}}, async (page, state)=>{
      const source = page.locator(die(slot,direction));
      const target = page.locator(ally('c2'));
      await source.waitFor();
      await checkDice(page,[2,5,5]);
      await source.dragTo(page.locator('.bt-cell.enemy[data-x="3"]'));
      assert.equal((await state()).revision,0);
      assert.equal(await page.locator('.bt-die[aria-pressed="true"]').count(),0);
      const result = await takeMove(page,()=>source.dragTo(target),'c2',slot,direction);
      const visits = result.events.filter(e=>e.type==='visit' && e.source==='c2');
      assert.deepEqual(visits.map(e=>e.x),pathTaken);
      assert.equal(result.view.battle.turn,2);
      assert.equal(result.revision,1);
      const post=page.locator('[data-last-action]');
      await post.getByText(direction==='left' ? /왼쪽 이동/ : /오른쪽 이동/).first().waitFor();
      await page.reload();
      await post.waitFor();
      const saved=await state();
      assert.equal(saved.revision,1);
      assert.deepEqual(saved.view.battle.dice, result.view.battle.dice);
      assert.equal(saved.view.floors[5].id,'c2');
      assert.equal(await page.locator('.bt-die[aria-pressed="true"]').count(),0);
    });
  }

  await withBoard(healingEncounter(), {viewport:{width:1440,height:1000}}, async (page, state) => {
    const threat=page.locator('.bt-threat');
    await threat.waitFor();
    assert.match(await threat.innerText(),/03번/);
    await page.locator(die(1,'right')).press('Enter');
    await page.locator(ally('c2')).focus();
    const right=page.locator(route('right'));
    await right.waitFor();
    assert.equal((await state()).revision,0);
    assert.equal(await right.locator('.cf-healed dd').innerText(),'15');
    assert.equal(await right.locator('.cf-dealt dd').innerText(),'7');
    assert.equal(await right.locator('.cf-absorbed dd').innerText(),'3');
    assert.match(await right.locator('.bt-next-threats').innerText(),/완승.*다음 적 행동 없음/);
    assert.match(await right.innerText(),/복사/);
    assert.match(await right.innerText(),/반응/);
    await fits(page);
    await screenshot(page,'desktop-preview');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(route('right')).count(),0);
    assert.equal((await state()).revision,0);
    await page.locator(die(1,'right')).press('Enter');
    const won=await takeMove(page,()=>page.locator(ally('c2')).press('Space'),'c2',1,'right');
    assert.equal(won.view.phase,'reward');
    await page.getByRole('heading',{name:'전투 보상'}).waitFor();
    const last=page.locator('[data-last-action]');
    assert.equal(await last.locator('.cf-dealt dd').innerText(),'7');
    assert.equal(await last.locator('.cf-healed dd').innerText(),'15');
    assert.match(await last.innerText(),/복사/);
    assert.match(await last.innerText(),/반응/);
    await page.reload();
    await last.waitFor();
    assert.equal(await last.locator('.cf-absorbed dd').innerText(),'3');
    await screenshot(page,'reward');
    await page.getByRole('button',{name:'원정 기록'}).click();
    const journal=page.getByRole('dialog');
    await journal.waitFor();
    const record=await journal.textContent();
    for (const text of ['시종','성가대원','복사','반응','보호 흡수 3','실제 회복 6']) assert.ok(record.includes(text),text);
  });
  await withBoard(healingEncounter(), {viewport:{width:390,height:844}, hasTouch:true, isMobile:true}, checkFingerDrag);
  assert.deepEqual(errors,[]);
  console.log('모바일·데스크톱 조작, 전투 예고·확정·보상·재접속 검증 완료. '+output);
} finally { await browser.close(); }
