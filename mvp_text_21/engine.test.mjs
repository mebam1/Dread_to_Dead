import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {newEntity} from '../mvp_text_19/shared.mjs';
import {createGame, execute, previewBattle, publicView, report} from './engine.mjs';

const powers = {vanguard:[17,25,34], patrol:[14,21,28], sweep:[14,21,28], medic:[0,0,0]};
const types = {vanguard:'A', patrol:'B', sweep:'C', medic:'D'};
function enemy(pattern, firstCounter=1) {
  return {type:types[pattern], role:pattern==='medic'?'support':'attack', pattern, firstCounter, period:3,
    attack:powers[pattern][0], healing:pattern==='medic'?8:0, maxHp:80, protection:0};
}
function battle(placement, templates=[enemy('vanguard',4)]) {
  const s=createGame(31001);
  execute(s,'visit',[s.map[0].id],'검증 전투');
  s.node.enemies=templates;
  s.floors.fill(null);
  for (const [x,type] of placement) s.floors[x-1]=newEntity(s,type);
  execute(s,'start',[],'검증 시작');
  return s;
}
const of = (events,type) => events.filter(e=>e.type===type);
const idAt = (s,x) => s.floors[x-1].id;
const clean = events => events.map(({index,...event})=>event);

// Compare through the next input boundary; campaign settlement follows the combat outcome.
function play(s,id,to) {
  const before=structuredClone(s);
  const preview=previewBattle(s,id,to);
  assert.deepEqual(s,before,'예고가 저장 상태를 바꾸었다.');
  execute(s,'move',[id,to],'예고한 칸으로 이동');
  const events=s.journal.slice(before.journal.length+1);
  const finish=events.findIndex(e=>e.type==='battle-finished');
  const combat=finish<0?events:events.slice(0,finish);
  assert.ok(preview.scenarios.some(branch=>isDeepStrictEqual(clean(branch.events),clean(combat))),
    '적 행동과 종료 판정까지 실제 기록이 예고한 분기 중 하나와 같아야 한다.');
  return combat;
}

test('1↔10은 각각 아홉 걸음이며 아홉 점유자를 매번 직전 칸으로 민다',()=>{
  const s=battle(Array.from({length:10},(_,i)=>[i+1,'paladin']));
  const ids=s.floors.map(a=>a.id);
  assert.equal('dice' in s.battle,false);
  for (const [from,to] of [[1,10],[10,1]]) {
    const step=Math.sign(to-from);
    const path=Array.from({length:9},(_,i)=>from+(i+1)*step);
    const events=play(s,ids[0],to);
    const [drop]=of(events,'drop');
    assert.deepEqual([drop.from,drop.to,drop.actualTo,drop.distance,drop.direction],
      [from,to,to,9,step===1?'right':'left']);
    for (const key of ['slot','die','dice']) assert.equal(key in drop,false);
    assert.deepEqual(of(events,'visit').map(e=>[e.x,e.kind]),path.map(x=>[x,x===to?'arrival':'pass']));
    assert.deepEqual(of(events,'push').map(e=>[e.from,e.to]),path.map(x=>[x,x-step]));
    assert.equal(idAt(s,to),ids[0]);
    assert.equal(new Set(s.floors.map(a=>a.id)).size,10);
  }
  assert.deepEqual(s.floors.map(a=>a.id),ids);
  assert.equal(s.battle.actionCount,2);
  assert.equal('round' in s.battle,false);
  assert.equal('turn' in s.battle,false);
  assert.equal(s.journal.some(e=>e.type==='player-roll'),false);
  assert.ok(Object.keys(s.rng).every(key=>!key.includes('유저굴림')));
});

test('자기 칸·범위 밖·소수·사망자·구버전 이동 인수는 차례와 기록을 보존한다',()=>{
  const s=battle([[4,'saint']]), id=idAt(s,4), before=structuredClone(s);
  for (let to=1;to<=10;to++) {
    if (to!==4) assert.equal(previewBattle(s,id,to).scenarios.length,1);
  }
  for (const [actor,to] of [[id,4],[id,0],[id,11],[id,4.5],['fallen',3]]) {
    assert.throws(()=>previewBattle(s,actor,to));
    assert.throws(()=>execute(s,'move',[actor,to],'잘못된 이동'));
  }
  assert.throws(()=>execute(s,'move',[id,1,'right'],'구버전 입력'));
  assert.deepEqual(s,before);
});

test('도착 점유자는 밀리고 통과 점유자는 밀리기 전 칸에서 자기 효과를 발동한다',()=>{
  const s=battle([[4,'saint'],[6,'sprayer']]);
  const mover=idAt(s,4), sprayer=idAt(s,6);
  const at=previewBattle(s,mover,6).scenarios[0].events;
  assert.deepEqual(of(at,'gas-installed'),[]);
  assert.deepEqual(of(at,'push').map(e=>[e.target,e.from,e.to]),[[sprayer,6,5]]);
  const beyond=play(s,mover,7);
  assert.deepEqual(of(beyond,'gas-installed').map(e=>[e.x,e.after]),[[6,6],[5,6]]);
  assert.ok(beyond.findIndex(e=>e.type==='gas-installed')<beyond.findIndex(e=>e.type==='push'));
  assert.equal(idAt(s,5),sprayer);
  assert.deepEqual(s.battle.gas[1].slice(4,6),[5,5]);
});

test('중간 미식가가 마지막 적을 처치하면 그 걸음까지 교환하고 도착 기술을 건너뛴다',()=>{
  const s=battle([[5,'gourmet'],[7,'saint']]);
  const target=s.battle.enemies[0];
  target.pos=5; target.hp=7; target.tokens.poison=1;
  const events=play(s,idAt(s,7),2), drop=of(events,'drop')[0];
  assert.deepEqual([drop.to,drop.actualTo],[2,5]);
  assert.deepEqual(of(events,'visit').map(e=>e.x),[6,5]);
  assert.deepEqual(of(events,'push').map(e=>[e.from,e.to]),[[5,6]]);
  assert.deepEqual(of(events,'arrival'),[]);
  assert.equal(of(events,'action-end').length,1);
  assert.equal(s.phase,'reward');
});

test('추기경이 첫 수에 4·8을 연결하면 다음 성전사의 도착 뒤 성가대원이 10 피해를 더한다',()=>{
  const s=battle([[4,'choir'],[7,'cardinal'],[9,'crusader']]);
  const target=s.battle.enemies[0]; target.pos=8; target.hp=50;
  const crusader=idAt(s,9), choir=idAt(s,4);
  assert.equal(previewBattle(s,crusader,8).scenarios[0].enemies[0].hp,30);
  play(s,idAt(s,7),6);
  const events=play(s,crusader,8);
  assert.deepEqual(of(events,'damage').map(e=>[e.source,e.hpLoss,e.hpAfter]),[[crusader,20,30],[choir,10,20]]);
  assert.deepEqual(of(events,'visit').at(-1).neighbors,[choir]);
  assert.equal(s.floors[7].tokens.exhaustion,8);
});

test('끝칸 성녀의 도착·복사 회복과 반응 공격에 체력 상한 및 보호를 적용한다',()=>{
  const s=battle([[1,'saint'],[3,'squire'],[4,'choir']]);
  const [saint,,squire,choir]=s.floors;
  [saint.hp,squire.hp,choir.hp]=[34,26,25];
  const target=s.battle.enemies[0];
  target.pos=3; target.hp=7; target.protection=[{source:target.id,amount:3}];
  const events=play(s,saint.id,3);
  assert.deepEqual(events.filter(e=>['arrival','arrival-copy','reaction'].includes(e.type)).map(e=>[e.type,e.source]),
    [['arrival',saint.id],['arrival-copy',squire.id],['reaction',choir.id]]);
  assert.deepEqual(of(events,'heal').map(e=>[e.source,e.target,e.amount]),
    [[saint.id,squire.id,4],[saint.id,choir.id,5],[squire.id,saint.id,6]]);
  assert.deepEqual(of(events,'damage').map(e=>[e.source,e.absorbed,e.hpLoss]),[[choir.id,3,7]]);
  assert.equal(s.phase,'reward');
});

test('동시 만료는 최초 편성 순서. 선봉에게 밀린 광역형은 밀린 칸에서 추격한다',()=>{
  const s=battle([[6,'saint'],[10,'squire']],[enemy('vanguard'),enemy('sweep')]);
  const [first,second]=publicView(s).battle.enemies.map(e=>e.intent);
  assert.deepEqual([first.from,first.path,first.positions],[2,[3,4,5,6],[6]]);
  assert.deepEqual([second.from,second.path,second.positions],[4,[5,6],[5,6,7]]);
  const events=play(s,idAt(s,10),9);
  assert.deepEqual(of(events,'counterattack').map(e=>[e.source,e.x,e.path,e.hits]),
    [['E1',first.from,first.path,first.hits],['E2',second.from,second.path,second.hits]]);
  assert.deepEqual(of(events,'push').map(e=>[e.target,e.from,e.to]),[['E2',5,4],['E1',6,5]]);
  assert.equal(s.battle.actionCount,1);
  assert.deepEqual(s.battle.enemies.map(e=>e.counter),[3,3]);
});

test('선봉 동률은 작은 칸, 이미 정면이면 제자리 타격. 성기사는 시작 방어로 대신 받는다',()=>{
  const s=battle([[2,'paladin'],[3,'choir'],[7,'saint'],[10,'squire']],[enemy('vanguard')]);
  s.battle.enemies[0].pos=5;
  const choir=idAt(s,3), paladin=idAt(s,2);
  assert.equal(publicView(s).battle.enemies[0].intent.targetId,choir);
  s.battle.enemies[0].pos=3;
  const intent=publicView(s).battle.enemies[0].intent;
  assert.deepEqual([intent.path,intent.positions,intent.hits[0].targetId],[[],[3],choir]);
  const events=play(s,idAt(s,10),9);
  const [hit]=of(events,'damage');
  assert.deepEqual([hit.originalTarget,hit.target,hit.hpLoss,hit.absorbed],[choir,paladin,7,10]);
  assert.equal(s.battle.enemies[0].counter,3);
});

test('광역형은 1·10번에서 보드 안만 작은 칸부터 치고 전멸 순간 남은 타격을 끝낸다',()=>{
  for (const [target,from,expected] of [[1,2,[1,2]],[10,9,[9,10]]]) {
    const s=battle([[target,'saint'],[5,'paladin']],[enemy('sweep')]);
    s.battle.enemies[0].pos=from;
    const casts=of(play(s,idAt(s,5),6),'counterattack');
    assert.deepEqual(casts[0].hits.map(h=>h.x),expected);
  }
  const s=battle([[2,'saint']],[enemy('sweep')]);
  s.floors[1].hp=1; s.battle.enemies[0].pos=5;
  const events=play(s,idAt(s,2),4);
  assert.deepEqual(of(events,'counterattack')[0].hits.map(h=>h.x),[3,4]);
  assert.equal(s.phase,'lost');
});

test('순찰은 중앙을 향해 시작하고 벽에서 되돌아와 재방문 칸도 다시 친다',()=>{
  const s=battle([[1,'squire'],[9,'saint']],[enemy('patrol'),enemy('patrol',3),enemy('patrol',3)]);
  assert.deepEqual(s.battle.enemies.map(e=>e.direction),['right','right','left']);
  const patrol=s.battle.enemies[0];
  // This patrol has already moved right across the board. The other two are out of its path.
  patrol.pos=8; s.battle.enemies[2].pos=3;
  const preview=publicView(s).battle.enemies[0].intent;
  assert.deepEqual(preview.path,[9,10,9]);
  const saint=idAt(s,9);
  const events=play(s,idAt(s,1),2);
  assert.deepEqual(of(events,'counterattack')[0].hits.map(h=>[h.x,h.targetId]),[[9,saint],[10,null],[9,saint]]);
  assert.equal(s.floors[8].hp,12);
  assert.deepEqual([s.battle.enemies[0].pos,s.battle.enemies[0].direction],[9,'left']);
});

test('의무병은 가장 먼 다른 적까지 교환한 뒤 이웃만 실제 결손량까지 회복한다',()=>{
  const s=battle([[9,'squire']],[enemy('medic'),enemy('patrol',3),enemy('vanguard',3)]);
  const [medic,near,far]=s.battle.enemies;
  medic.pos=2; near.pos=4; far.pos=7;
  medic.hp-=10; near.hp-=10; far.hp-=3;
  const intent=publicView(s).battle.enemies[0].intent;
  assert.deepEqual([intent.targetId,intent.path],[far.id,[3,4,5,6,7]]);
  assert.deepEqual(intent.heals.map(h=>[h.target,h.x,h.requested,h.amount]),[[far.id,6,8,3]]);
  const events=play(s,idAt(s,9),10);
  assert.deepEqual(of(events,'push').map(e=>[e.target,e.from,e.to]),[[near.id,4,3],[far.id,7,6]]);
  assert.deepEqual(of(events,'heal').map(e=>[e.side,e.target,e.amount]),[['enemy',far.id,3]]);
  assert.deepEqual(s.battle.enemies.map(e=>[e.pos,e.hp]),[[7,70],[3,70],[6,80]]);
  assert.deepEqual(of(events,'damage'),[]);
});

test('의무병 단독 행동은 이동·치유 0회 후 정규 주기를 다시 센다',()=>{
  const s=battle([[1,'squire']],[enemy('medic')]);
  s.battle.enemies[0].hp=15;
  const events=play(s,idAt(s,1),2);
  const [action]=of(events,'counterattack');
  assert.deepEqual([action.path,action.heals,action.hits],[[],[],[]]);
  assert.equal(s.battle.enemies[0].attacks,1);
  assert.equal(s.battle.enemies[0].counter,3);
  assert.equal(s.battle.enemies[0].hp,15);
});

test('철수 접촉은 다음 칸의 가스·교환·타격과 뒤 순번을 중단한다. 보스는 패배',()=>{
  for (const boss of [false,true]) {
    const s=battle([[6,'saint'],[10,'squire']],[enemy('vanguard'),enemy('sweep')]);
    if (boss) s.node.kind='boss';
    s.battle.enemies[1].pos=4; s.battle.gas[1][3]=7;
    execute(s,'exit',[4],'진입 칸에 철수 설치');
    const [first,second]=publicView(s).battle.enemies.map(e=>e.intent);
    assert.equal(first.exitAt,4);
    assert.equal(second.interrupted,true);
    const events=play(s,idAt(s,10),9);
    assert.deepEqual(of(events,'counterattack').map(e=>e.source),['E1']);
    assert.deepEqual(of(events,'exit-contact').map(e=>e.x),[4]);
    assert.deepEqual(of(events,'gas-absorbed'),[]);
    assert.deepEqual(of(events,'push'),[]);
    assert.deepEqual(of(events,'damage'),[]);
    assert.equal(s.phase,boss?'lost':'map');
  }
});

test('무작위 방어는 각 가능 대상을 예고하고 실제 적용은 한 대상의 방어 10이다',()=>{
  const s=battle([[4,'squire'],[5,'holyPriest'],[6,'saint'],[7,'crusader']]);
  const mover=idAt(s,6), priest=idAt(s,5), other=idAt(s,7);
  const snapshot=structuredClone(s);
  const preview=previewBattle(s,mover,5);
  assert.equal(preview.complete,true);
  assert.equal(preview.scenarios.length,2);
  const targets=preview.scenarios.map(branch=>{
    const [event]=of(branch.events,'defense');
    assert.deepEqual([event.source,event.amount],[priest,10]);
    return event.target;
  });
  assert.deepEqual(new Set(targets),new Set([mover,other]));
  assert.deepEqual(s,snapshot);
  assert.equal(of(play(s,mover,5),'defense').length,1);
});

test('마지막 적을 죽인 도착 공격도 남은 탈진과 종료 독을 처리해 전멸하면 패배한다',()=>{
  const s=battle([[1,'crusader']],[enemy('vanguard',1)]);
  s.floors[0].hp=1; s.floors[0].tokens.poison=2;
  s.battle.enemies[0].pos=3; s.battle.enemies[0].hp=7;
  const events=play(s,idAt(s,1),3);
  const sequence=events.filter(e=>['enemy-killed','token','companion-lost','action-end','outcome'].includes(e.type));
  assert.deepEqual(sequence.map(e=>e.type),['enemy-killed','token','companion-lost','action-end','outcome']);
  assert.equal(sequence[1].token,'exhaustion');
  assert.equal(sequence.at(-1).outcome,'loss');
  assert.deepEqual(of(events,'counterattack'),[]);
  assert.equal(s.phase,'lost');
  assert.deepEqual(report(s).actions,{total:1,max:1});
});

test('왼쪽 벽에서도 같은 순찰 방향이 다음 행동과 저장 재개에 이어진다',()=>{
  const s=battle([[2,'saint'],[10,'squire']],[enemy('patrol')]);
  s.battle.enemies[0].pos=3; s.battle.enemies[0].direction='left';
  const restored=JSON.parse(JSON.stringify(s));
  const events=play(restored,idAt(restored,10),9);
  const [patrol]=of(events,'counterattack');
  assert.deepEqual([patrol.path,patrol.hits.map(h=>h.x)],[[2,1,2],[2,1,2]]);
  assert.equal(restored.battle.enemies[0].direction,'right');
  assert.equal(restored.floors[1].hp,12);
});

test('각 막의 지도에 일반·엘리트·보스 패턴과 막별 공격·치유량을 적용한다',()=>{
  const s=createGame();
  const normal={A:'vanguard',B:'patrol',C:'sweep',D:'medic',E:'patrol',F:'vanguard'};
  const counters={A:[2,6],B:[3,7],C:[4,6],D:[2,5],E:[3,7],F:[1,5]};
  const heals=[8,12,16];
  for (let act=1;act<=3;act++) {
    assert.equal(s.act,act);
    const found=new Set();
    for (const node of publicView(s).map) {
      for (const [index,e] of node.enemies.entries()) {
        const expect=node.kind==='normal'?normal[e.type]:[node.kind==='elite'?'vanguard':'sweep','patrol','medic'][index];
        assert.equal(e.pattern,expect);
        assert.equal(e.attack,powers[expect][act-1]);
        assert.equal(e.healing,expect==='medic'?heals[act-1]:0);
        const timing=node.kind==='normal'?counters[e.type]:[[node.kind==='boss'?3:2,6],[4,7],[2,5]][index];
        assert.deepEqual([e.firstCounter,e.period],timing);
        if (node.kind==='normal') found.add(e.pattern);
      }
    }
    assert.equal(found.size,4);
    // Resume at this act's last reward, then advance with the ordinary campaign command.
    s.node=s.map.find(n=>n.kind==='boss'); s.phase='reward';
    execute(s,'skip',[],'보스 보상 건너뛰기');
  }
  assert.equal(s.phase,'won');
});

test('이동마다 전 적 카운터가 1 줄고 만료 때만 발동한다. 속공·철수는 시간을 쓰지 않는다',()=>{
  const s=battle([[1,'paladin'],[2,'toxicHealer'],[9,'squire']],[{...enemy('vanguard',2),period:2}]);
  const paladin=idAt(s,1), healer=idAt(s,2), mover=idAt(s,9);
  assert.deepEqual([s.battle.actionCount,s.battle.enemies[0].counter],[0,2]);
  assert.equal(s.floors[0].defense,10);
  execute(s,'exit',[10],'철수 준비');
  execute(s,'active',[healer,'A',paladin],'독 치료');
  assert.deepEqual([s.battle.actionCount,s.battle.enemies[0].counter],[0,2]);
  assert.equal(s.floors[0].tokens.poison,4);
  for (let action=1;action<=4;action++) {
    const events=play(s,mover,action%2?8:9);
    assert.equal(s.battle.actionCount,action);
    const counter=action%2?1:2;
    assert.equal(s.battle.enemies[0].counter,counter);
    const attacks=of(events,'counterattack');
    assert.deepEqual(attacks.map(e=>e.action),action%2?[]:[action]);
    assert.deepEqual(of(events,'counters-ticked')[0].counters,[
      {id:'E1',before:action % 2 ? 2 : 1,after:action % 2 ? 1 : 0},
    ]);
    if (attacks.length) assert.equal(attacks[0].resetTo,2);
    assert.equal(of(events,'action-end').length,1);
    const intent=publicView(s).battle.enemies[0].intent;
    assert.deepEqual([intent.counter,intent.afterActions,intent.action],[counter,counter,action+counter]);
    assert.equal(s.floors[0].tokens.poison,4-action);
    assert.equal(s.floors[1].tokens.quick,action<3?0:1);
    if (action===3) {
      assert.equal(s.floors[0].defense,10);
      assert.equal(s.floors[0].guardUsed.A,0);
      assert.equal(s.floors[0].nextRefreshAction,6);
    }
  }
});

test('이동 중 처치한 만료 적은 행동하지 않고 나머지 만료 적만 반격한다',()=>{
  const s=battle([[1,'crusader']],[enemy('vanguard'),enemy('vanguard')]);
  s.battle.enemies[0].hp=10;
  const events=play(s,idAt(s,1),2);
  assert.deepEqual(of(events,'enemy-killed').map(e=>e.id),['E1']);
  assert.deepEqual(of(events,'counterattack').map(e=>e.source),['E2']);
  assert.deepEqual(of(events,'damage').map(e=>[e.side,e.hpLoss]),[['enemy',10],['ally',17]]);
  assert.equal(s.battle.actionCount,1);
});

test('대신 받기 30점은 행동 사이에 누적되고 3번째 적 타격을 마친 뒤 재충전된다',()=>{
  const s=battle([[1,'paladin'],[2,'saint'],[9,'squire']],[{...enemy('vanguard'),period:1}]);
  const mover=idAt(s,9), guarded=idAt(s,2);
  const intercepted=[], unguarded=[], remainingDefense=[];
  for (let action=1;action<=4;action++) {
    const events=play(s,mover,action%2?8:9);
    intercepted.push(of(events,'redirect').reduce((sum,e)=>sum+e.amount,0));
    unguarded.push(of(events,'damage').filter(e=>e.target===guarded).reduce((sum,e)=>sum+e.hpLoss,0));
    remainingDefense.push(s.floors[0].defense);
  }
  assert.deepEqual(intercepted,[17,13,0,17]);
  assert.deepEqual(unguarded,[0,4,17,0]);
  assert.deepEqual(remainingDefense,[0,0,10,0]);
});

test('실제 전투 효과 없는 이동은 첫 9회, 그 뒤 6회에 비활동 피해를 준다',()=>{
  const s=battle([[1,'squire']],[enemy('medic')]), mover=idAt(s,1);
  const penalties=[];
  for (let action=1;action<=15;action++) {
    const events=play(s,mover,action%2?2:1);
    for (const e of of(events,'inactivity-penalty')) penalties.push([e.action,e.target,e.amount]);
  }
  assert.deepEqual(penalties,[[9,mover,10],[15,mover,10]]);
  assert.equal(s.floors[1].hp,10);
});
