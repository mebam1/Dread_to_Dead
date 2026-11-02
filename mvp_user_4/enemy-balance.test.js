/** Enemy tuning contracts plus real first-service runs; no injected assets in opening(). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Game,generateMap} from './engine.js';
import {createGuest,ENEMY_TUNING} from './enemies.mjs';
import {opening} from './verify-opening.mjs';

// Decode the player-facing sentence independently of the numeric enemy profile.
// Positional numbers (below/above 2 floors) must not be confused with damage.
function advertisedPowers(text,turn,pathLength){
  let m;
  if((m=/^실제 경로 각 방문 순서대로 공략도 (\d+)$/.exec(text)))return Array(pathLength).fill(+m[1]);
  if((m=/^도착 바로 아래층 (\d+) → 도착층 (\d+)$/.exec(text)))return [+m[1],+m[2]];
  if((m=/^도착 아래 2층 (\d+) → 위 2층 (\d+)$/.exec(text)))return [+m[1],+m[2]];
  if((m=/^도착층 공략도 (\d+)씩 두 번$/.exec(text)))return [+m[1],+m[1]];
  if((m=/^홀수 턴: 도착층 (\d+)씩 두 번 \/ 짝수 턴: 아래 2층 (\d+) → 위 2층 (\d+)$/.exec(text)))return turn%2?[+m[1],+m[1]]:[+m[2],+m[3]];
  assert.fail(`Unrecognized player-facing attack description: ${text}`);
}

function expectedTargets(pattern,turn,path,floors){
  const destination=path.at(-1),offset=n=>(destination-1+n+floors)%floors+1;
  if(pattern==='route')return path;
  if(pattern==='adjacent')return [offset(-1),destination];
  if(pattern==='mirror'||pattern==='bossMirror'||pattern==='final'&&turn%2===0)return [offset(-2),offset(2)];
  return [destination,destination];
}

test('every generated enemy advertises the damage actually dealt, including final-boss alternating turns',()=>{
  const g=new Game(31001),seenPatterns=new Set(),seenKinds=new Set();
  for(let seed=31001;seed<=31020;seed++)for(let act=1;act<=3;act++){
    for(const node of generateMap(seed,act))for(const guest of node.guests||[]){
      seenPatterns.add(guest.pattern);seenKinds.add(node.kind);
      assert.ok(Number.isInteger(guest.t)&&guest.t>0);
      assert.ok(Number.isInteger(guest.h)&&guest.h>0);
      // Each profile provides real damage; old implicit power defaults must be unused.
      for(const key of ['power','doublePower','mirrorPower'])assert.ok(Number.isInteger(guest[key])&&guest[key]>0,`${node.id} ${guest.id} ${key}`);
      for(const turn of [1,2]){
        g.s.visitor={...guest,turn};
        const path=[5,6,1,2,3,4,5,6,1];
        assert.deepEqual(g.attackList(path).map(hit=>hit.power),advertisedPowers(guest.attackText,turn,path.length),`${node.id} ${guest.id} turn ${turn}`);
      }
    }
  }
  assert.deepEqual([...seenPatterns].sort(),['adjacent','bossMirror','double','final','mirror','route']);
  assert.deepEqual([...seenKinds].sort(),['boss','elite','normal']);
});

test('enemy tuning preserves circular targets, hit order and repeated visits at six and ten floors',()=>{
  const g=new Game(31001),guests=new Map();
  for(let seed=31001;seed<=31010;seed++)for(let act=1;act<=3;act++)for(const node of generateMap(seed,act)){
    for(const guest of node.guests||[])guests.set(guest.pattern,guest);
  }
  for(const floors of [6,10])for(const guest of guests.values())for(const turn of [1,2]){
    g.s.floorCount=floors;g.s.visitor={...guest,turn};
    for(const path of [[1],[floors],[floors-1,floors,1,2],[floors,...Array.from({length:floors},(_,i)=>i+1),1]]){
      assert.deepEqual(g.attackList(path).map(hit=>hit.floor),expectedTargets(guest.pattern,turn,path,floors),`${guest.pattern} turn ${turn}, ${floors} floors, ${path}`);
    }
    assert.deepEqual(g.attackList([]),[]);
  }
});

test('all three initial routes receive the opening allowance, which does not leak into later encounters',()=>{
  const seen=new Set();
  for(let seed=31001;seed<=31020;seed++){
    const g=new Game(seed),entrances=g.availableNodes();
    assert.deepEqual(entrances.map(n=>n.column),[0,1,2]);
    for(const node of entrances){
      assert.equal(node.kind,'normal');assert.equal(node.guests.length,3);
      for(const guest of node.guests){
        seen.add(guest.id);assert.equal(guest.h,1);assert.equal(guest.power,1);
        const later=createGuest(guest.id,1,2,'normal');
        assert.ok(guest.t<later.t,`${guest.id} must have a lower first-service fear threshold`);
        assert.equal(guest.t,ENEMY_TUNING.opening[guest.id].t);
        assert.deepEqual(createGuest(guest.id,1,6,'normal'),later,'ordinary later nodes share their act profile');
        assert.equal(guest.reward,later.reward,'the allowance must not reduce kill rewards');
      }
    }
    for(const act of [2,3])for(const node of generateMap(seed,act).filter(n=>n.depth===1))for(const guest of node.guests){
      assert.deepEqual(guest,createGuest(guest.id,act,2,'normal'),`${act}막 시작은 첫 판 튜토리얼 수치로 되돌리지 않는다`);
    }
  }
  assert.deepEqual([...seen].sort(),['N1','N2','N3','N4']);
});

// Captured from the pre-tuning campaign generator; damage/threshold/hearts are
// intentionally excluded. The test stays standalone within mvp_user_4.
const legacyMapFingerprints={
  31001:'a6fe040b1dc2d360c0a245c0178325db9ea0d7368b295635df92193f5dd27232',
  31002:'7fe13269a18a415eede8f4d7ddd0d70592089de8fb4b95754e772120ac014855',
  31003:'2ed1a4530446fa1b88b097f0435aed79c59e169cbb63da15fbe2eb8cd0a68d2c'
};
test('fixed seeds retain map connections, roster order, guest identity, patterns and soul rewards',()=>{
  for(const [seed,expected] of Object.entries(legacyMapFingerprints)){
    const maps=[1,2,3].map(act=>generateMap(Number(seed),act));
    assert.deepEqual(maps,[1,2,3].map(act=>generateMap(Number(seed),act)));
    const contract=maps.map(nodes=>nodes.map(({id,act,depth,column,kind,next,guests})=>({id,act,depth,column,kind,next,guests:guests?.map(({id,name,pattern,reward})=>({id,name,pattern,reward}))})));
    const actual=createHash('sha256').update(JSON.stringify(contract)).digest('hex');
    assert.equal(actual,expected,`seed ${seed}: a change outside enemy numeric tuning`);
  }
});

test('enemy instances cannot mutate the shared tuning or future generated encounters',()=>{
  const before=structuredClone(ENEMY_TUNING),first=createGuest('N1',1,1),second=createGuest('N1',1,1);
  first.t=999;first.h=99;first.power=999;first.attackText='changed';
  assert.deepEqual(createGuest('N1',1,1),second);assert.deepEqual(ENEMY_TUNING,before);
  assert.throws(()=>{ENEMY_TUNING.opening.N1.power=999;},TypeError);
});

for(const seed of [31001,31002,31003])test(`initial central route reaches its creature reward with starting assets and public choices: seed ${seed}`,()=>{
  const result=opening(seed,1,'simple');
  assert.equal(result.clear,true,JSON.stringify({seed,phase:result.phase,kills:result.kills,turns:result.turns,destroyed:result.destroyed,tokens:result.tokens}));
  assert.equal(result.phase,'anomaly_reward');assert.equal(result.kills,3);
  assert.ok(result.turns>0&&result.turns<100);assert.ok(result.tokens>0);
  // These fixtures exercise real roll/choose/move and three sequential guests.
  // They are a regression floor, not a claim about human or campaign win rates.
  if(result.history){
    assert.equal(result.history.filter(e=>e.kind==='guest_start').length,3);
    assert.equal(result.history.filter(e=>e.kind==='kill').length,3);
    assert.ok(result.history.some(e=>e.kind==='creature_offer'));
    assert.ok(!result.history.some(e=>['escape','purchase','place','store','expand'].includes(e.kind)));
    assert.equal(result.history.filter(e=>e.kind==='kill').reduce((total,e)=>total+e.reward,0),6);
  }
});
