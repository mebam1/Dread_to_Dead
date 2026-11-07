import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,execute,publicView,previewBattle,PERMUTATIONS} from './engine.mjs';

test('invalid commands are atomic including journal, RNG, HP and phase',()=>{
  const s=createGame(31001);
  execute(s,'visit',[2],'중앙 경로'); execute(s,'start',[],'전투 시작');
  for(const [cmd,args] of [['assign',[1,1,2]],['move',[]],['buy',[1]],['active',['c1','A','c2']],['choose',[7]]]) {
    const before=JSON.stringify(s);
    assert.throws(()=>execute(s,cmd,args,'잘못된 입력 검사'));
    assert.equal(JSON.stringify(s),before);
  }
});
test('public state excludes RNG and previews preserve future dice and live state',()=>{
  const s=createGame(31002);execute(s,'visit',[1],'진입');execute(s,'start',[],'시작');
  const before=JSON.stringify(s);
  const p=previewBattle(s,PERMUTATIONS[0]);
  assert.equal(JSON.stringify(s),before);
  assert.equal('rng' in publicView(s),false);
  assert.ok(p.scenarios.length);
  for(const x of p.scenarios) { assert.equal('dice' in x,false);assert.equal(x.events.some(e=>e.type==='round-start'),false); }
  execute(s,'choose',[1],'배분');execute(s,'move',[],'이동');
  assert.deepEqual(s.journal.map(x=>x.index),Array.from({length:s.journal.length},(_,i)=>i+1));
});
test('deterministic preview agrees with actual complete-round state',()=>{
  const s=createGame(31001); execute(s,'visit',[2],'진입');execute(s,'start',[],'시작');
  const p=previewBattle(s,PERMUTATIONS[2]);assert.equal(p.scenarios.length,1);
  execute(s,'choose',[3],'배분'); execute(s,'move',[],'이동');
  assert.deepEqual(s.floors.filter(Boolean).map(e=>[e.id,e.hp]),p.scenarios[0].allies.map(e=>[e.id,e.hp]));
  assert.deepEqual(s.battle.enemies.map(e=>[e.id,e.hp,e.pos]),p.scenarios[0].enemies.map(e=>[e.id,e.hp,e.pos]));
});
