import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,createGame,execute,publicView,previewBattle,upgradeSave} from './engine.mjs';

test('invalid commands are atomic including journal, RNG, HP and phase',()=>{
  const s=createGame(31001);
  execute(s,'visit',[2],'중앙 경로'); execute(s,'start',[],'전투 시작');
  for(const [cmd,args] of [['assign',[1,1,2]],['move',[]],['buy',[1]],['active',['c1','A','c2']],['choose',[7]],['move',['E2',1]],['move',['missing',1]],['move',['c1']],['move',['c1',0]],['move',['c1',4]],['move',['c1',1.5]],['move',['c1','NaN']]]) {
    const before=JSON.stringify(s);
    assert.throws(()=>execute(s,cmd,args,'잘못된 입력 검사'));
    assert.equal(JSON.stringify(s),before);
  }
});
test('public state excludes RNG and previews preserve future dice and live state',()=>{
  const s=createGame(31002);execute(s,'visit',[1],'진입');execute(s,'start',[],'시작');
  const before=JSON.stringify(s);
  const p=previewBattle(s,'c1',2);
  assert.equal(JSON.stringify(s),before);
  assert.equal('rng' in publicView(s),false);
  assert.ok(p.scenarios.length);
  for(const x of p.scenarios) { assert.equal('dice' in x,false);assert.equal(x.events.some(e=>e.type==='round-start'),false); }
  execute(s,'move',['c3',2],'이동');
  assert.deepEqual(s.journal.map(x=>x.index),Array.from({length:s.journal.length},(_,i)=>i+1));
});
test('deterministic preview agrees with actual drop result',()=>{
  const s=createGame(31001); execute(s,'visit',[2],'진입');execute(s,'start',[],'시작');
  const p=previewBattle(s,'c3',3);assert.equal(p.scenarios.length,1);
  execute(s,'move',['c3',3],'이동');
  assert.deepEqual(s.floors.filter(Boolean).map(e=>[e.id,e.hp]),p.scenarios[0].allies.map(e=>[e.id,e.hp]));
  assert.deepEqual(s.battle.enemies.map(e=>[e.id,e.hp,e.pos]),p.scenarios[0].enemies.map(e=>[e.id,e.hp,e.pos]));
});

test('each turn offers three independent draws, including duplicates, and resolves only the chosen slot',()=>{
  const s=createGame(31001);
  execute(s,'visit',[2],'중앙 경로'); execute(s,'start',[],'전투 시작');
  assert.equal(catalog().dice.count,3);
  assert.deepEqual(s.battle.dice,[5,3,6]);
  const before=JSON.stringify(s);
  for(const [i,die] of s.battle.dice.entries()){
    const p=previewBattle(s,'c3',i+1);
    assert.equal(p.die,die);
    const visits=p.scenarios[0].events.filter(e=>e.type==='visit'&&e.source==='c3');
    assert.equal(visits.length,die);
  }
  assert.throws(()=>previewBattle(s,'c3'));
  assert.equal(JSON.stringify(s),before);
  execute(s,'move',['c3','2'],'두 번째 주사위');
  const drop=s.journal.findLast(e=>e.type==='drop');
  assert.deepEqual([drop.slot,drop.die,s.battle.turn],[2,3,2]);
  assert.deepEqual(s.battle.dice,[3,3,6]);
  assert.deepEqual(s.journal.filter(e=>e.type==='player-roll').map(e=>e.dice),[[5,3,6],[3,3,6]]);
  const a=structuredClone(s),b=structuredClone(s);
  execute(a,'move',['c1',1],'첫 번째 3'); execute(b,'move',['c1',2],'두 번째 3');
  assert.deepEqual(a.floors,b.floors);
  assert.deepEqual(a.battle,b.battle);
  assert.deepEqual(a.rng,b.rng);
  assert.equal(b.journal.findLast(e=>e.type==='drop').slot,2);
});

test('upgrading a pending v1.2 turn keeps its existing die and adds exactly two stable options',()=>{
  const s=createGame(31001);
  execute(s,'visit',[2],'경로'); execute(s,'start',[],'전투');
  const legacy=structuredClone(s);
  legacy.version='text-19-v1.2';
  const rollKey=Object.keys(legacy.rng).find(k=>k.endsWith('|유저굴림'));
  legacy.rng[rollKey]=1;
  legacy.battle.die=5;
  delete legacy.battle.dice;
  const current=upgradeSave(legacy);
  assert.deepEqual(current.battle.dice,[5,3,6]);
  assert.deepEqual(current.rng,s.rng);
  assert.deepEqual(current.floors,legacy.floors);
  assert.equal(current.battle.turn,legacy.battle.turn);
  assert.equal(legacy.rng[rollKey],1);
  assert.deepEqual(upgradeSave(legacy),current);
  assert.equal(upgradeSave(current),current);
});
