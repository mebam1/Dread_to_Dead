import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, execute, publicView, previewBattle } from './engine.mjs';
import { makePolicy } from './policy.mjs';

test('assignment policy only reads public combat information and preview leaves real RNG untouched', () => {
  const state=createGame(31001);
  execute(state,'visit',[1],'공개정보 정책 검사 준비');
  execute(state,'start',[],'공개정보 정책 검사 전투 시작');
  const before=structuredClone(state);
  const view=publicView(state);
  const guarded=new Proxy(view,{get(target,key,receiver){
    if(['seed','rng','journal'].includes(key)) throw Error(`Policy must not read ${key}`);
    return Reflect.get(target,key,receiver);
  }});
  let calls=0;
  const decision=makePolicy().decide(guarded,order=>{calls++;return previewBattle(state,order);});
  assert.equal(calls,6);
  assert.equal(decision.command,'assign');
  assert.deepEqual([...decision.args].sort(),[1,2,3]);
  assert.equal(decision.analysis.alternatives.length,6);
  assert.ok(decision.reason.trim());
  assert.deepEqual(state,before);
});

test('six completed campaign traces replay exactly under the current rules without injected state', () => {
  for(const seed of [31001,31002,31003]) for(const policy of ['preview-heuristic','fixed-assignment']) {
    const stem=new URL(`./validation/automated-${seed}-${policy}`,import.meta.url);
    const stored=JSON.parse(fs.readFileSync(new URL(`${stem.href}.save.json`),'utf8'));
    const decisions=fs.readFileSync(new URL(`${stem.href}.decisions.jsonl`),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(stored.validation.status,'completed');
    assert.equal(stored.validation.stopReason,null);
    const replay=createGame(seed);
    for(const decision of decisions) execute(replay,decision.command,decision.args,decision.reason);
    assert.ok(['won','lost'].includes(replay.phase));
    assert.deepEqual(replay,stored.state,`${seed} ${policy} replay must match`);
    assert.ok(replay.stats.battles.length>0);
    assert.ok(!replay.journal.some(e=>e.type==='controlled-fixture'));
  }
});
