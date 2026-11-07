import test from 'node:test';
import assert from 'node:assert/strict';
import {runCampaign} from './verify-campaign.mjs';
import { createGame, execute, publicView, previewBattle } from './engine.mjs';
import { makePolicy } from './policy.mjs';

test('companion policy only reads public combat information and preview leaves real RNG untouched', () => {
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
  const decide=(options={})=>makePolicy(options).decide(guarded,(order,slot)=>{calls++;return previewBattle(state,order,slot);});
  const decision=decide();
  assert.equal(calls,3*new Set(view.battle.dice).size);
  assert.equal(decision.command,'move');
  assert.ok(view.floors.some(e=>e?.id===decision.args[0]));
  assert.deepEqual(decision.analysis.dice,view.battle.dice);
  assert.equal(decision.analysis.alternatives.length,9);
  for(const ally of view.floors.filter(Boolean)) {
    const choices=decision.analysis.alternatives.filter(a=>a.order===ally.id);
    assert.deepEqual(choices.map(a=>[a.slot,a.die]),view.battle.dice.map((face,i)=>[i+1,face]));
  }
  const choice=decision.analysis.alternatives.find(a=>a.order===decision.args[0]&&a.slot===decision.args[1]);
  assert.equal(choice.score,Math.max(...decision.analysis.alternatives.map(a=>a.score)));
  assert.equal(choice.die,view.battle.dice[decision.args[1]-1]);
  const control=decide({fixedCompanion:true});
  const fixedChoices=control.analysis.alternatives.filter(a=>a.order==='c1');
  assert.equal(control.args[0],'c1');
  assert.equal(fixedChoices.find(a=>a.slot===control.args[1]).score,Math.max(...fixedChoices.map(a=>a.score)));
  assert.ok(decision.reason.trim());
  assert.deepEqual(state,before);
});

test('campaign decisions replay exactly from a fresh seed',()=>{
  const run=runCampaign(31001,{maxDecisions:35});
  const replay=createGame(31001);
  for(const d of run.decisions) execute(replay,d.command,d.args,d.reason);
  assert.deepEqual(replay,run.state);
  assert.ok(replay.stats.battles.length>0);
  for(const r of run.rounds) assert.equal(r.lastDie,r.lastDice[r.lastSlot-1]);
});
