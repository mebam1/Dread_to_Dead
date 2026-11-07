import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createGame as oldGame} from '../mvp_text_20/engine.mjs';
import {RULE_VERSION} from './engine.mjs';

const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
test('CLI 한글 직접 이동, 읽기 전용 예고, 중복 확정 거부, 재시작과 구판 저장 격리',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dread-text21-'));
  t.after(()=>{
    for (const entry of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,entry));
    fs.rmdirSync(dir);
  });
  const file=path.join(dir,'game.json');
  const call=(...args)=>spawnSync(process.execPath,[cli,'--save',file,...args],{encoding:'utf8'});
  const read=()=>fs.readFileSync(file,'utf8');
  function ok(...args) {
    const result=call(...args);
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(result.stdout);
  }
  ok('새게임','31001'); ok('방문','1');
  ok('교환','1','2');
  const start=ok('시작');
  assert.equal(start.view.battle.actionCount,0);
  assert.deepEqual(start.view.battle.enemies.map(e=>e.counter),start.view.battle.enemies.map(e=>e.firstCounter));

  const before=read();
  const {preview:options}=ok('검토','#C3');
  assert.deepEqual(options.map(p=>p.to),[1,2,4,5,6,7,8,9,10]);
  const {preview}=ok('검토','#C3','8');
  assert.deepEqual([preview.companion,preview.from,preview.to,preview.direction,preview.distance],['c3',3,8,'right',5]);
  for (const args of [['이동','#C3','3'],['move','c3','11'],['move','c3','2','right']]) {
    assert.notEqual(call(...args).status,0);
  }
  assert.equal(read(),before);

  const moved=ok('이동','#C3','8','--revision',String(start.revision));
  assert.equal(moved.view.battle.actionCount,1);
  assert.deepEqual(moved.view.battle.enemies.filter(e=>e.hp>0).map(e=>e.counter),
    moved.view.battle.enemies.filter(e=>e.hp>0).map(e=>e.firstCounter>1?e.firstCounter-1:e.period));
  const {events}=moved;
  const drop=events.find(e=>e.type==='drop');
  assert.deepEqual([drop.action,drop.from,drop.to,drop.actualTo,drop.distance],[1,3,8,8,5]);
  assert.deepEqual(events.filter(e=>e.type==='visit' && e.source==='c3').map(e=>e.x),[4,5,6,7,8]);
  const checkpoint=read();
  assert.notEqual(call('move','c3','7','--revision',String(start.revision)).status,0);
  const reloaded=ok('show');
  assert.deepEqual(reloaded.view,moved.view);
  assert.equal(reloaded.revision,start.revision+1);
  const status=call('상태','--text');
  assert.equal(status.status,0,status.stderr);
  assert.match(status.stdout,/확정 행동 1회/);
  assert.match(status.stdout,/카운터/);
  assert.doesNotMatch(status.stdout,/라운드|주사위/);
  assert.equal(read(),checkpoint);
  const persisted=JSON.parse(checkpoint);
  assert.equal(persisted.rule,RULE_VERSION);
  assert.deepEqual(persisted.state.battle.enemies.map(e=>e.counter),reloaded.view.battle.enemies.map(e=>e.counter));

  for (const old of [
    {...persisted,format:'dread-to-dead/text20-run/1',rule:'text-20-v1.0',state:oldGame()},
    {...persisted,rule:'text-21-v1.0',state:{...persisted.state,version:'text-21-v1.0'}},
  ]) {
    const original=JSON.stringify(old);
    fs.writeFileSync(file,original);
    assert.notEqual(call('show').status,0);
    assert.notEqual(call('move','c3','4').status,0);
    assert.equal(read(),original);
  }
});
