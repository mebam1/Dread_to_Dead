/** Synthetic boundary fixtures. None of these are normal-play/expansion ROI evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CREATURES,DICE,generateMap} from './engine.js';

function atNode(kind,act=1,depth=null) {
  const g=new Game(31001);g.s.act=act;
  const node=g.s.maps[act-1].find(n=>n.kind===kind&&(depth==null||n.depth===depth));
  assert.ok(node,`fixture ${kind}/${act}/${depth}`);
  g.s.completed[act-1]=node.depth-1;
  g.s.lastNodes[act-1]=node.depth===1?null:`a${act}-d${node.depth-1}-c1`;
  g.s.stats.visits=(act-1)*8+node.depth-1;
  g.visit(node.id);return g;
}
function combat(kind='normal',act=1) {
  const g=atNode(kind,act);g.startService();return g;
}
function forceDice(g,value,type='normal') {
  assert.ok(DICE[type].faces.includes(value));
  g.s.equipped[0]=type;g.s.phase='choose';g.s.activity=false;
  g.s.dice=g.s.equipped.map((t,slot)=>{
    const face=slot===0?DICE[t].faces.indexOf(value):0,number=DICE[t].faces[face];
    return {slot,type:t,face,value:number,bonus:t==='anxiety'&&number===3?1:0};
  });
}
function finishSyntheticCombat(g) {
  // Low thresholds and sufficient Bell charges isolate boundary transitions.
  for(const v of g._node().guests){v.t=3;v.h=1;v.pattern='none';}
  if(g.s.phase==='management')g.startService();
  Object.assign(g.s.visitor,{t:3,h:1,pattern:'none'});
  const bell=g.s.entities.find(e=>e.type==='B');bell.uses=5;
  while(g.s.phase==='roll') {g.roll();g.choose(0);g.active(bell.id);}
  assert.equal(g.s.phase,'anomaly_reward');
}

test('initial assets, 3x22 map generation, all graph nodes reachable and every path has 8 visits',()=>{
  const g=new Game();
  assert.equal(g.s.money,4);assert.equal(g.s.floorCount,6);
  assert.equal(g.s.entities.length,4);assert.deepEqual(g.s.equipped,['normal','normal','normal']);
  assert.equal(g.s.web,undefined);assert.equal(g.s.resets,undefined);
  for(let act=1;act<=3;act++) {
    const nodes=generateMap(31001,act),byId=new Map(nodes.map(n=>[n.id,n]));
    assert.equal(nodes.length,22);assert.equal(nodes.filter(n=>n.kind==='boss').length,1);
    const reached=new Set();let paths=0;
    function walk(n,length) {
      reached.add(n.id);
      if(!n.next.length){assert.equal(length,8);assert.equal(n.kind,'boss');paths++;return;}
      for(const id of n.next){const next=byId.get(id);assert.equal(next.depth,n.depth+1);if(next.depth<8)assert.ok(Math.abs(next.column-n.column)<=1);walk(next,length+1);}
    }
    for(const n of nodes.filter(n=>n.depth===1)){assert.equal(n.kind,'normal');walk(n,1);}
    assert.equal(reached.size,22);assert.equal(paths,577);
    assert.deepEqual(nodes,generateMap(31001,act));
  }
});

test('route lock rejects skipping depth, revisiting, or choosing another node before completion',()=>{
  const g=new Game();assert.throws(()=>g.visit('a1-d2-c1'));
  const id=g.availableNodes()[1].id;g.visit(id);
  const before=structuredClone(g.s);
  assert.throws(()=>g.visit(id));assert.throws(()=>g.visit('a1-d1-c0'));
  assert.deepEqual(g.s,before);assert.equal(g.s.phase,'management');
});

test('public views reveal current-act enemy info but no sealed future contents',()=>{
  const g=new Game(),v=g.view();
  assert.equal(v.map.length,22);assert.equal(v.maps,undefined);
  assert.ok(v.map.every(n=>n.act===1&&!Object.hasOwn(n,'contents')));
  assert.equal(v.reward,null);assert.equal(v.node,null);assert.deepEqual(v.dice,[]);
  g.s.maps[0].find(n=>n.kind==='shop').contents={stock:['SEALED']};
  g.s.maps[1][0].secret='UNSEEN_ACT';
  const text=JSON.stringify(g.view());assert.ok(!text.includes('SEALED'));assert.ok(!text.includes('UNSEEN_ACT'));
});

test('expansion is paid only at its node; current entities and states remain unchanged; cap10',()=>{
  const fresh=new Game();assert.throws(()=>fresh.expand());
  const g=atNode('expansion');g.s.money=28;
  g.s.entities[0].c=7;g.s.entities[0].p=1;
  const entities=structuredClone(g.s.entities);
  for(const cost of [4,6,8,10]){
    const before=g.s.money;g.expand();assert.equal(before-g.s.money,cost);
    assert.deepEqual(g.s.entities,entities);assert.equal(g.entityAt(g.s.floorCount),null);
  }
  assert.equal(g.s.money,0);assert.equal(g.s.floorCount,10);assert.equal(g.s.stats.expansionSpent,28);
  const capped=structuredClone(g.s);assert.throws(()=>g.expand());assert.deepEqual(g.s,capped);
  g.leave();assert.equal(g.s.phase,'map');assert.equal(g.s.stats.visits,3);
});

test('insufficient expansion and skipped expansion do not mutate assets',()=>{
  const g=atNode('expansion');g.s.money=3;const before=structuredClone(g.s);
  assert.throws(()=>g.expand());assert.deepEqual(g.s,before);
  g.leave();assert.equal(g.s.floorCount,6);assert.equal(g.s.money,3);
  assert.equal(g.s.completed[0],3);
});

test('restoration occurs at combat preparation entry, not start, noncombat visit, or rearrangement',()=>{
  const g=atNode('expansion');
  const bell=g.s.entities.find(e=>e.type==='B'),q=g.s.entities.find(e=>e.type==='Q');
  bell.uses=0;q.c=7;q.p=1;g.store(q.id);g.place(q.id,3);
  assert.equal(q.c,7);assert.equal(q.p,1);assert.equal(bell.uses,0);
  g.leave();g.visit('a1-d4-c1');
  assert.equal(q.c,0);assert.equal(q.p,2);assert.equal(bell.uses,2);
  q.p=1;bell.uses=0;g.startService();
  assert.equal(q.p,1);assert.equal(bell.uses,0);
});

test('normal node awards souls per guest and one creature set after all three, with auto entry',()=>{
  const g=atNode('normal',1,1),cash=g.s.money;
  finishSyntheticCombat(g);
  assert.equal(g.s.stats.kills,3);assert.equal(g.s.money,cash+6);
  assert.equal(g.s.completed[0],0);assert.equal(g.s.stats.visits,0);
  assert.equal(g.s.reward.creatures.length,3);assert.equal(new Set(g.s.reward.creatures).size,3);
  const length=g.s.entities.length,layout=g.s.entities.map(e=>[e.id,e.floor]);
  g.claimCreature(1);assert.equal(g.s.entities.length,length+1);
  assert.deepEqual(g.s.entities.slice(0,length).map(e=>[e.id,e.floor]),layout);
  assert.equal(g.s.entities.at(-1).floor,null);assert.equal(g.s.phase,'map');assert.equal(g.s.completed[0],1);
  const after=structuredClone(g.s);assert.throws(()=>g.claimCreature(1));assert.deepEqual(g.s,after);
  assert.equal(g.s.history.filter(e=>e.kind==='creature_offer').length,1);
  assert.equal(g.s.history.filter(e=>e.kind==='guest_start').length,3);
});

test('same node inter-guest transition keeps remaining P and active uses',()=>{
  const g=atNode('normal',1,1);g._node().guests.forEach(v=>{v.t=3;v.h=1;});g.startService();
  const bell=g.s.entities.find(e=>e.type==='B'),q=g.s.entities.find(e=>e.type==='Q');q.c=8;q.p=1;
  g.roll();g.choose(0);g.active(bell.id);
  assert.equal(g.s.phase,'roll');assert.equal(g.s.guestIndex,1);
  assert.equal(q.c,0);assert.equal(q.p,1);assert.equal(bell.uses,1);
});

test('elite grants one creature followed by one optional free die, never two rewards',()=>{
  const g=atNode('elite');finishSyntheticCombat(g);const cash=g.s.money;
  g.claimCreature(0);assert.equal(g.s.phase,'die_reward');assert.ok(DICE[g.s.reward.die]);
  assert.equal(g.s.completed[0],3);const old=[...g.s.equipped];g.skipDie();
  assert.deepEqual(g.s.equipped,old);assert.equal(g.s.money,cash);assert.equal(g.s.completed[0],4);
  assert.throws(()=>g.skipDie());assert.throws(()=>g.claimDie(0));
});

test('all bosses require creature selection, never award a die, and only final then wins',()=>{
  for(const act of [1,2,3]){
    const g=atNode('boss',act);finishSyntheticCombat(g);
    assert.equal(g.s.phase,'anomaly_reward');assert.equal(g.s.completed[act-1],7);
    if(act===3)assert.throws(()=>g.giveUp());
    g.claimCreature(2);assert.equal(g.s.completed[act-1],8);
    assert.equal(g.s.phase,act===3?'won':'map');assert.equal(g.s.act,Math.min(3,act+1));
    assert.ok(!g.s.history.some(e=>e.kind==='die_offer'));
  }
});

test('discovery preserves money for both replacement and rejection; multiple special dice allowed',()=>{
  for(const accept of [true,false]){
    const g=atNode('discovery'),cash=g.s.money,type=g._node().contents.die;
    g.s.equipped=['long','even','anxiety'];
    if(accept)g.claimDie(1);else g.skipDie();
    assert.equal(g.s.money,cash);assert.equal(g.s.equipped.length,3);
    assert.equal(g.s.equipped[1],accept?type:'even');assert.equal(g.s.phase,'map');
    assert.throws(()=>g.claimDie(0));
  }
});

test('shop has 8 independently purchasable slots with duplicate kinds and no reset',()=>{
  const g=atNode('shop');g.s.money=100;
  const stock=g._node().contents.stock;assert.equal(stock.length,8);assert.ok(new Set(stock.map(i=>i.type)).size<8);
  const cost=stock.reduce((s,i)=>s+CREATURES[i.type].price,0),old=g.s.entities.length;
  for(let i=0;i<8;i++)g.buy(i);
  assert.equal(g.s.money,100-cost);assert.equal(g.s.entities.length,old+8);
  assert.throws(()=>g.buy(0));assert.throws(()=>g.resetWeb());assert.throws(()=>g.expand());
  g.leave();assert.equal(g.s.phase,'map');
});

test('shop rejects insufficient funds atomically and allows no-purchase departure',()=>{
  const g=atNode('shop');g.s.money=0;const before=structuredClone(g.s);
  assert.throws(()=>g.buy(0));assert.deepEqual(g.s,before);g.leave();assert.equal(g.s.money,0);
});

test('luggage event choices are mutually exclusive and die candidate stays fixed under viewing',()=>{
  const g=atNode('event');g._node().contents={event:'luggage',die:'anxiety'};
  const before=structuredClone(g.s);g.view();g.view();assert.deepEqual(g.s,before);
  const cash=g.s.money;g.eventChoose('souls');assert.equal(g.s.money,cash+4);
  assert.throws(()=>g.eventChoose('die',0));assert.equal(g.s.equipped[0],'normal');
  const h=atNode('event');h._node().contents={event:'luggage',die:'even'};
  const money=h.s.money;h.eventChoose('die',0);assert.equal(h.s.money,money);assert.equal(h.s.equipped[0],'even');
});

test('sealed event has one fixed paid creature; sacrifice preserves at least one owned survivor',()=>{
  const g=atNode('event');g._node().contents={event:'sealed',creature:'Q'};
  const before=g.s.entities.length;g.eventChoose('buy');assert.equal(g.s.money,1);assert.equal(g.s.entities.length,before+1);
  assert.throws(()=>g.eventChoose('buy'));
  const h=atNode('event');h._node().contents={event:'contract'};
  h.s.entities=h.s.entities.slice(0,1);assert.throws(()=>h.eventChoose('sacrifice',h.s.entities[0].id));
  const extra=h._add('Q');h.store(h.s.entities[0].id);const cash=h.s.money;
  h.eventChoose('sacrifice',extra.id);assert.equal(h.s.entities.length,1);assert.equal(h.s.money,cash+4);assert.equal(h.s.phase,'map');
});

test('normal escape retains earlier souls, skips others and gives no completion reward',()=>{
  const g=combat();g.s.stats.earned=2;g.s.stats.kills=1;g.s.money+=2;g.s.guestIndex=1;
  Object.assign(g.s.visitor,{pos:0,pattern:'none'});forceDice(g,2);g.choose(0);g.installEscape(2);g.move();
  assert.equal(g.s.phase,'map');assert.equal(g.s.money,6);assert.equal(g.s.stats.skipped,1);
  assert.equal(g.s.stats.visits,1);assert.equal(g.s.reward,null);
  assert.ok(!g.s.history.some(e=>e.kind==='creature_offer'));
});

test('every boss escape preview and actual execution agree on immediate defeat',()=>{
  for(const act of [1,2,3]){
    const g=combat('boss',act);forceDice(g,3);g.choose(0);g.installEscape(2);
    const before=structuredClone(g.s),p=g.preview();
    assert.equal(p.summary.escaped,true);assert.equal(p.summary.lost,true);assert.equal(p.summary.retaliation,false);
    assert.deepEqual(g.s,before);g.move();assert.equal(g.s.phase,'lost');assert.equal(g.s.stats.visits,(act-1)*8+7);
  }
});

test('each attack is a separate threshold event and destruction ends battle even with stored assets',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='Q').slice(0,1);
  const q=g.s.entities[0];q.floor=3;q.c=10;q.p=2;g._damage(q,4);g._damage(q,4);
  assert.equal(q.c,4);assert.equal(q.p,1);
  const stored=g._add('U');assert.equal(stored.floor,null);
  g._damage(q,12);assert.equal(g.s.phase,'lost');assert.equal(g.entityAt(3),null);
  assert.equal(g.s.entities.length,1);assert.equal(g.s.entities[0].id,stored.id);
});

test('pass/arrival and anxiety die differentiate same value; preview is repeatable and nonmutating',()=>{
  const normal=combat();Object.assign(normal.s.visitor,{t:12,h:1,pattern:'none'});forceDice(normal,3);
  const before=structuredClone(normal.s),p=normal.preview(0);assert.equal(p.summary.fear,8);assert.equal(p.summary.hearts,0);
  for(let i=0;i<30;i++)assert.deepEqual(normal.preview(0),p);assert.deepEqual(normal.s,before);
  const special=combat();Object.assign(special.s.visitor,{t:12,h:1,pattern:'none'});forceDice(special,3,'anxiety');
  const q=special.preview(0);assert.equal(q.summary.fear,12);assert.equal(q.summary.hearts,1);assert.equal(q.summary.retaliation,false);
  special.choose(0);assert.equal(special.s.visitor.a,1);special.preview();assert.equal(special.s.visitor.a,1);
});

test('expansion changes circular path and long route hits preserve repeated visits',()=>{
  const g=atNode('expansion');const before=structuredClone(g.s),p=g.expansionPreview({position:5,slot:0,face:1});
  assert.deepEqual(p.before.path,[6,1]);assert.deepEqual(p.after.path,[6,7]);assert.deepEqual(g.s,before);
  const h=combat();h.s.visitor.pos=4;h.s.visitor.pattern='route';forceDice(h,8,'long');h.choose(0);
  assert.deepEqual(h.path(),[5,6,1,2,3,4,5,6]);const attacks=h.attackList(h.path());
  assert.equal(attacks.filter(a=>a.floor===5).length,2);assert.equal(attacks.filter(a=>a.floor===6).length,2);
});

test('protection is shared across hits, new charge waits until next turn, repair never restores P',()=>{
  const g=combat();const guard=g._add('G',2),repair=g._add('R',4),q=g.s.entities.find(e=>e.type==='Q');
  guard.uses=1;Object.assign(g.s.visitor,{a:4,pattern:'none'});forceDice(g,2);g.choose(0);
  g.active(guard.id,q.id);g._damage(q,4);g._damage(q,4);assert.equal(q.shield,0);assert.equal(q.c,2);
  q.p=1;g.active(repair.id,q.id);assert.equal(q.c,0);assert.equal(q.p,1);assert.equal(g.s.visitor.a,2);
  assert.equal(guard.uses,0);g.move();assert.equal(guard.uses,1);assert.equal(g.s.phase,'roll');assert.throws(()=>g.active(guard.id,q.id));
});

test('inactivity previews list uncertainty without selecting a hidden penalty target',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='Q');
  Object.assign(g.s.visitor,{pos:0,a:0,pattern:'none'});g.s.inactive=2;forceDice(g,2);
  const before=structuredClone(g.s),p=g.preview(0);
  assert.equal(p.uncertainPenalty.length,2);assert.ok(p.events.some(e=>e.kind==='penalty_preview'));
  assert.ok(!p.events.some(e=>e.kind==='penalty_start'||e.kind==='penalty'));assert.deepEqual(g.s,before);
});

test('normal act3 attack and elite/boss powers match actual public numbers',()=>{
  const g=combat('normal',3);assert.ok([16,20].includes(g.s.visitor.t));
  const base=g.s.visitor.pattern==='route'?6:8;assert.ok(g.attackList([1,2,3]).every(a=>a.power===base));
  const elite=combat('elite',3);assert.deepEqual(elite.attackList([3]),[{floor:1,power:10},{floor:5,power:10}]);
  const boss=combat('boss',3);assert.ok(boss.attackList([3]).every(a=>a.power===8));boss.s.visitor.turn=2;
  assert.ok(boss.attackList([3]).every(a=>a.power===10));
});

test('node-keyed dice remain identical after unrelated views/notes and preserve slot face indices',()=>{
  const a=combat(),b=Game.fromState(a.s);
  for(let i=0;i<30;i++)b.view();b.s.history.push({kind:'note',text:'read-only observation'});
  a.roll();b.roll();assert.deepEqual(a.s.dice,b.s.dice);
  const c=combat();c.s.equipped=['anxiety','even','long'];c.roll();
  assert.deepEqual(c.s.dice.map(d=>d.face),a.s.dice.map(d=>d.face));
  assert.equal(a.s.phase,'choose');assert.throws(()=>a.roll());
});

test('synthetic full campaign keeps 24 node completions and 66 guest rewards distinct',()=>{
  // Transition test with artificial low thresholds, not a playable balance run.
  const g=new Game(31001);
  for(let visit=0;visit<24;visit++){
    const choice=g.availableNodes().find(n=>n.column===1);assert.ok(choice);
    g.visit(choice.id);finishSyntheticCombat(g);g.claimCreature(0);
    assert.equal(g.s.stats.visits,visit+1);
    if(visit<23)assert.equal(g.s.phase,'map');
  }
  assert.equal(g.s.phase,'won');assert.deepEqual(g.s.completed,[8,8,8]);
  assert.equal(g.s.stats.kills,66);assert.equal(g.s.money,154);
  assert.equal(g.s.entities.length,28);assert.equal(g.s.floorCount,6);
  assert.equal(g.s.history.filter(e=>e.kind==='restore').length,24);
  assert.equal(g.s.history.filter(e=>e.kind==='creature_reward').length,24);
});
