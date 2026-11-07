import test from 'node:test';
import assert from 'node:assert/strict';
import { RULE_VERSION, newEntity } from './shared.mjs';
import { startBattle, combatAction, previewBattle, availableQuickActions, adjacent, applyDamageEffect, absorbGas } from './combat.mjs';

const normal = (overrides = {}) => ({type:'A',role:'attack',pattern:'double',strong:false,firstCounter:1,period:2,maxHp:70,protection:0,...overrides});
function setup(placement, templates=[normal()], kind='normal') {
  const s={version:RULE_VERSION,seed:31001,act:1,coins:0,sequence:0,rng:{},journal:[],stats:{losses:[]},
    floors:Array(10).fill(null),node:{id:'test',act:1,depth:1,col:'좌',kind,enemies:templates}};
  for(const [x,type] of placement) s.floors[x-1]=newEntity(s,type,'test');
  startBattle(s);
  return s;
}
function move(s, owner, die) {
  s.battle.dice[0] = die;
  return combatAction(s,'move',[owner.id,1]);
}
const events = (s,type)=>s.journal.filter(e=>e.type===type);

test('full-board circular steps push every occupant including the landing square once',()=>{
  const s=setup(Array.from({length:10},(_,i)=>[i+1,'paladin']));
  const before=s.floors.map(e=>e.id);
  move(s,s.floors[8],3);
  assert.deepEqual(s.floors.map(e=>e.id),[before[1],before[8],...before.slice(2,8),before[9],before[0]]);
  assert.equal(events(s,'push').length,3);
  assert.equal(events(s,'arrival').length,0);
});

test('sprayer uses original square and left tile, landing occupant never fires a pass',()=>{
  const s=setup([[2,'saint'],[3,'sprayer'],[4,'sprayer']]);
  move(s,s.floors[1],2);
  assert.deepEqual(s.battle.gas[1],[0,6,6,0,0,0,0,0,0,0]);
  const t=setup([[10,'saint'],[1,'sprayer']]);
  t.floors[0].upgraded=true;
  move(t,t.floors[9],2);
  assert.deepEqual(t.battle.gas[1],[10,0,0,0,0,0,0,0,0,0]);
});

test('basic attack and choir reaction hit the arriving companion’s front, never a fallback',()=>{
  const s=setup([[1,'warPriest'],[4,'choir']], [normal(),normal()]);
  const [front,elsewhere]=s.battle.enemies; front.pos=3; elsewhere.pos=4;
  move(s,s.floors[0],2);
  assert.equal(front.hp,50);assert.equal(elsewhere.hp,70);
  move(s,s.floors[2],3);
  assert.equal(elsewhere.hp,70);assert.equal(front.hp,50);
});

test('squire copies at its own position and does not retrigger arrival reactions',()=>{
  const s=setup([[1,'crusader'],[4,'squire'],[5,'squire']], [normal(),normal()]);
  const [a,b]=s.battle.enemies; a.pos=3;b.pos=4;
  move(s,s.floors[0],2);
  assert.deepEqual([a.hp,b.hp],[50,50]);
  assert.deepEqual([s.floors[2].tokens.exhaustion,s.floors[3].tokens.exhaustion,s.floors[4].tokens.exhaustion],[8,8,0]);
  assert.equal(events(s,'arrival-copy').length,1);
});

test('fusion arrival originals resolve A then B and each can trigger the choir',()=>{
  const s=setup([[1,'saint'],[4,'choir']]);
  s.floors[0].fusion={bType:'warPriest',bUpgraded:false};s.battle.enemies[0].pos=3;
  move(s,s.floors[0],2);
  assert.deepEqual(events(s,'arrival').map(e=>e.part),['A','B']);
  assert.equal(s.battle.enemies[0].hp,40);
});

test('paladin carries defense but refreshes redirect quota, including upgrade and fusion',()=>{
  const s=setup([[1,'paladin'],[2,'saint'],[3,'warPriest']], [normal({firstCounter:8})]);
  const [a,b,c]=s.floors;
  applyDamageEffect(s,s.battle.enemies[0],[{target:b,base:35}]);
  assert.deepEqual([a.hp,b.hp,a.guardUsed.A,c.tokens.rage],[40,35,30,10]);
  a.defense=4;a.upgraded=true;a.fusion={bType:'paladin',bUpgraded:false};
  s.battle.turn=3;move(s,c,4);
  assert.equal(a.defense,29);assert.equal(a.guardUsed.A,0);
  applyDamageEffect(s,s.battle.enemies[0],[{target:b,base:60}]);
  assert.deepEqual(a.guardUsed,{A:50,B:10});
});

test('last kill resolves poison and exhaustion exactly once even on first action',()=>{
  const s=setup([[1,'crusader']], [normal({maxHp:1})]);
  const owner=s.floors[0];owner.tokens.exhaustion=32;
  assert.deepEqual(move(s,owner,1),{outcome:'loss'});
  assert.equal(events(s,'round-end').length,1);assert.equal(s.coins,1);
});

test('three actions per round; due enemies attack before next die and misses advance boss pattern',()=>{
  const s=setup([[1,'saint']], [normal({pattern:'alternate'}),normal()]);
  const owner=s.floors[0]; const boss=s.battle.enemies[0];
  for(let i=0;i<3;i++)move(s,owner,1);
  assert.deepEqual([s.battle.round,s.battle.turn,boss.attacks,boss.nextAttack],[2,1,1,4]);
  assert.deepEqual(events(s,'counterattack').map(e=>e.source),['E1','E2']);
  assert.equal(events(s,'player-roll').at(-1).index>events(s,'counterattack').at(-1).index,true);
  for(let i=0;i<6;i++)move(s,owner,1);
  assert.deepEqual(events(s,'counterattack').filter(e=>e.source==='E1').map(e=>e.pattern),['double','mirror']);
});

test('conditional path skips short paths, repositions, then hits exactly three visited squares',()=>{
  const s=setup([[2,'paladin']],[normal({pattern:'path'}),normal({firstCounter:8})]);const [a,b]=s.battle.enemies;
  a.pos=9;b.pos=2;s.battle.turn=3;const guard=s.floors[1];
  move(s,guard,1);
  assert.deepEqual([a.pos,b.pos,a.attacks,a.nextAttack],[2,1,0,3]);
  s.battle.turn=3;move(s,guard,1);
  assert.equal(a.pos,5);assert.equal(a.attacks,1);
  assert.deepEqual(events(s,'visit').filter(e=>e.source==='E1'&&e.round===3).map(e=>e.x),[3,4,5]);
});

test('strike then move targets starting tile before pushing other enemies',()=>{
  const s=setup([[1,'saint'],[8,'paladin']], [normal({type:'D'}),normal({firstCounter:9})]);
  const [a,b]=s.battle.enemies;a.attacks=1;s.battle.turn=3;
  move(s,s.floors[0],1);
  assert.deepEqual([s.floors[1].hp,a.pos,b.pos],[30,5,4]);
});

test('quick healing pays shared token and applies selected original',()=>{
  const s=setup([[1,'toxicHealer'],[2,'saint']]);const [a,b]=s.floors;
  a.fusion={bType:'toxicHealer',bUpgraded:true};b.hp=2;
  assert.equal(availableQuickActions(s).length,2);
  combatAction(s,'active',[a.id,'B',b.id]);
  assert.deepEqual([a.tokens.quick,b.tokens.poison,b.hp],[0,5,27]);
  assert.equal(availableQuickActions(s).length,0);
});

test('gourmet uses pre-push coordinate, ally-first tie and tenfold poison',()=>{
  const s=setup([[3,'saint'],[4,'paladin'],[5,'gourmet']], [normal({maxHp:150}),normal()]);
  const g=s.floors[4];g.upgraded=true;g.tokens.rage=3;s.floors[2].tokens.poison=2;
  s.battle.enemies[0].pos=5;s.battle.enemies[1].pos=4;s.battle.enemies[1].tokens.poison=4;
  move(s,s.floors[3],2);
  assert.deepEqual(events(s,'damage').filter(e=>e.label==='gourmet').map(e=>e.hpLoss),[23,43]);
  assert.equal(events(s,'rage-consumed').length,1);
});

test('escape contact precedes gas and attacks, boss escape loses',()=>{
  for(const kind of ['normal','boss']) {
    const s=setup([[8,'saint']],[normal({pattern:'path'})],kind);
    combatAction(s,'exit',[3]);s.battle.gas[1][2]=6;s.battle.turn=3;
    assert.deepEqual(move(s,s.floors[7],1),{outcome:kind==='boss'?'loss':'escape'});
    assert.equal(events(s,'gas-absorbed').length,0);
  }
});

test('cardinal creates only its two endpoint edge, without transitive or wrapped links', () => {
  const s = setup([[2, 'saint'], [3, 'saint'], [5, 'cardinal'], [7, 'saint'], [8, 'saint'], [10, 'saint']]);
  assert.ok(adjacent(s, s.floors[2], s.floors[6]));
  assert.equal(adjacent(s, s.floors[4], s.floors[2]), false);
  assert.equal(adjacent(s, s.floors[1], s.floors[6]), false);
  s.floors[4] = null;
  assert.equal(adjacent(s, s.floors[2], s.floors[6]), false);
});

test('rage applies in full to each AoE target and explicit zero damage, never to absent targets', () => {
  const s = setup([[1, 'crusader']], [normal(), normal(), normal()]);
  const owner = s.floors[0]; owner.tokens.rage = 3;
  applyDamageEffect(s, owner, []);
  assert.equal(owner.tokens.rage, 3);
  applyDamageEffect(s, owner, s.battle.enemies.map(target => ({ target, base: 0 })));
  assert.deepEqual(s.battle.enemies.map(e => e.hp), [67, 67, 67]);
  assert.equal(owner.tokens.rage, 0);
  assert.equal(events(s, 'rage-consumed').length, 1);
});

test('companion combat movement consumes gas, including poison cap', () => {
  const s = setup([[2, 'saint']]);
  s.battle.gas[0][1] = 4; s.floors[1].tokens.poison = 98;
  absorbGas(s, s.floors[1]);
  assert.equal(s.battle.gas[0][1], 0); assert.equal(s.floors[1].tokens.poison, 99);
});

test('provider death removes remaining protection and support immediately', () => {
  const s = setup([[10, 'saint']], [normal(), normal( { type: 'C', role: 'guard', protection: 2 }), normal( { type: 'B', role: 'support' })]);
  const [a, c, b] = s.battle.enemies;
  assert.equal(a.protection[0].amount, 2); assert.equal(a.support.length, 1);
  applyDamageEffect(s, s.floors[9], [{ target: c, base: 70 }, { target: b, base: 70 }]);
  assert.deepEqual(a.protection, []); assert.deepEqual(a.support, []);
  assert.equal(s.coins, 2);
  applyDamageEffect(s, s.floors[9], [{ target: c, base: 70 }]);
  assert.equal(s.coins, 2);
});

test('inactivity counts rounds, bypasses defense at 3 then 2, and activity resets it',()=>{
  const s=setup([[1,'paladin']],[normal({firstCounter:12})]);
  const ally=s.floors[0];
  for(let r=1;r<=5;r++)for(let k=0;k<3;k++)move(s,ally,1);
  assert.deepEqual(events(s,'inactivity-penalty').map(e=>[e.round,e.amount]),[[3,10],[5,10]]);
  assert.equal(ally.hp,40);
  s.battle.gas[0][s.floors.indexOf(ally)===9?0:s.floors.indexOf(ally)+1]=1;
  for(let k=0;k<3;k++)move(s,ally,1);
  assert.equal(s.battle.inactiveCount,0);assert.equal(s.battle.inactiveThreshold,3);
});

test('support boosts first empty tile, rage survives the miss and applies to later path hits',()=>{
  const s=setup([[1,'saint'],[5,'saint']],[normal({pattern:'path',role:'support'})]);
  const a=s.battle.enemies[0];a.tokens.rage=2;s.battle.turn=3;
  move(s,s.floors[0],1);
  assert.equal(events(s,'support-consumed')[0].x,3);
  assert.deepEqual(events(s,'damage').map(e=>[e.x,e.rage,e.hpLoss]),[[5,2,5]]);
});
