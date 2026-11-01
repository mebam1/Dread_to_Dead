/** Synthetic boundary fixtures. None of these are normal-play/expansion ROI evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CREATURES,DICE,generateMap,creatureDef,creatureName,ANXIETY_CAP} from './engine.js';

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

test('initial assets, 3x20 map generation, all graph nodes reachable and every path has 8 visits',()=>{
  const g=new Game();
  assert.equal(g.s.money,4);assert.equal(g.s.floorCount,6);
  assert.equal(g.s.entities.length,4);assert.deepEqual(g.s.equipped,['normal','normal','normal']);
  assert.equal(g.s.web,undefined);assert.equal(g.s.resets,undefined);
  for(let act=1;act<=3;act++) {
    const nodes=generateMap(31001,act),byId=new Map(nodes.map(n=>[n.id,n]));
    assert.equal(nodes.length,20);assert.equal(nodes.filter(n=>n.kind==='boss').length,1);
    const reached=new Set();let paths=0;
    function walk(n,length) {
      reached.add(n.id);
      if(!n.next.length){assert.equal(length,8);assert.equal(n.kind,'boss');paths++;return;}
      for(const id of n.next){const next=byId.get(id);assert.equal(next.depth,n.depth+1);if(next.depth<7)assert.ok(Math.abs(next.column-n.column)<=1);walk(next,length+1);}
    }
    for(const n of nodes.filter(n=>n.depth===1)){assert.equal(n.kind,'normal');walk(n,1);}
    assert.equal(reached.size,20);assert.equal(paths,239);
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
  assert.equal(v.map.length,20);assert.equal(v.maps,undefined);
  assert.ok(v.map.every(n=>n.act===1&&!Object.hasOwn(n,'contents')));
  assert.equal(v.reward,null);assert.equal(v.node,null);assert.deepEqual(v.dice,[]);
  g.s.maps[0].find(n=>n.kind==='shop').contents={stock:['SEALED']};
  g.s.maps[1][0].secret='UNSEEN_ACT';
  const text=JSON.stringify(g.view());assert.ok(!text.includes('SEALED'));assert.ok(!text.includes('UNSEEN_ACT'));
});

test('expansion is paid only in a shop; current entities and states remain unchanged; cap10',()=>{
  const fresh=new Game();assert.throws(()=>fresh.expand());
  const g=atNode('shop');g.s.money=28;
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
  const g=atNode('shop');g.s.money=3;const before=structuredClone(g.s);
  assert.throws(()=>g.expand());assert.deepEqual(g.s,before);
  g.leave();assert.equal(g.s.floorCount,6);assert.equal(g.s.money,3);
  assert.equal(g.s.completed[0],3);
});

test('restoration occurs at combat preparation entry, not start, noncombat visit, or rearrangement',()=>{
  const g=atNode('shop');
  const bell=g.s.entities.find(e=>e.type==='B'),q=g.s.entities.find(e=>e.type==='Q');
  bell.uses=0;q.c=7;q.p=1;g.store(q.id);g.place(q.id,3);
  assert.equal(q.c,7);assert.equal(q.p,1);assert.equal(bell.uses,0);
  g.leave();g.visit('a1-d4-c1');
  assert.equal(q.c,0);assert.equal(q.p,1);assert.equal(bell.uses,2);
  q.p=1;q.c=7;q.shield=2;bell.uses=0;g.startService();
  assert.equal(q.p,1);assert.equal(q.c,7);assert.equal(q.shield,2);assert.equal(bell.uses,0);
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
  assert.throws(()=>g.buy(0));assert.throws(()=>g.resetWeb());
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
  const normal=combat();Object.assign(normal.s.visitor,{t:3,h:1,pattern:'none'});forceDice(normal,3);
  const before=structuredClone(normal.s),p=normal.preview(0);assert.equal(p.summary.fear,2);assert.equal(p.summary.hearts,0);
  for(let i=0;i<30;i++)assert.deepEqual(normal.preview(0),p);assert.deepEqual(normal.s,before);
  const special=combat();Object.assign(special.s.visitor,{t:3,h:1,pattern:'none'});forceDice(special,3,'anxiety');
  const q=special.preview(0);assert.equal(q.summary.fear,3);assert.equal(q.summary.hearts,1);assert.equal(q.summary.retaliation,false);
  special.choose(0);assert.equal(special.s.visitor.a,1);special.preview();assert.equal(special.s.visitor.a,1);
});

test('supply and doubling can build twenty anxiety, with die bonuses and overflow applied once',()=>{
  assert.equal(ANXIETY_CAP,20);
  for(const [type,initial,increases] of [['normal',8,[2,10]],['anxiety',18,[1,1,0]]]){
    const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='U');g._add('E',2);
    Object.assign(g.s.visitor,{pos:0,a:initial,pattern:'none'});forceDice(g,3,type);
    const before=structuredClone(g.s),p=g.preview(0);
    assert.equal(p.state.visitor.a,20);assert.deepEqual(g.s,before);
    assert.deepEqual(p.events.filter(e=>e.kind==='anxiety').map(e=>e.amount),increases);
    g.choose(0);g.move();assert.equal(g.s.visitor.a,20);assert.equal(g.s.inactive,0);
    const overflow=g.events.filter(e=>e.kind==='anxiety');
    if(type==='anxiety'){assert.equal(overflow[0].wasted,1);assert.equal(overflow[1].wasted,20);}
  }
});

test('harvest spends all anxiety at one fear each, then upgraded arrival independently adds one even from zero',()=>{
  for(const upgraded of [false,true])for(const anxiety of [0,2,9,20]){
    const g=combat(),q=g.entityAt(3);q.upgraded=upgraded;
    Object.assign(g.s.visitor,{pos:2,a:anxiety,f:0,t:999,h:2,pattern:'none'});forceDice(g,1);
    const before=structuredClone(g.s),p=g.preview(0);
    assert.equal(p.summary.fear,anxiety);assert.equal(p.state.visitor.a,upgraded?1:0);assert.deepEqual(g.s,before);
    const effects=p.events.filter(e=>['harvest','fear','anxiety'].includes(e.kind));
    assert.deepEqual(effects.map(e=>e.kind),['harvest',...(anxiety?['fear']:[]),...(upgraded?['anxiety']:[])]);
    assert.equal(effects[0].amount,anxiety);assert.equal(effects[0].after,0);
    g.choose(0);g.move();assert.equal(g.s.visitor.f,anxiety);assert.equal(g.s.visitor.a,upgraded?1:0);
  }
});

test('expansion changes circular path and long route hits preserve repeated visits',()=>{
  const g=atNode('shop');const before=structuredClone(g.s),p=g.expansionPreview({position:5,slot:0,face:1});
  assert.deepEqual(p.before.path,[6,1]);assert.deepEqual(p.after.path,[6,7]);assert.deepEqual(g.s,before);
  const high=g.expansionPreview({anxiety:20});assert.equal(high.before.state.visitor.a,20);assert.equal(high.after.state.visitor.a,20);
  assert.throws(()=>g.expansionPreview({anxiety:21}),/0~20/);assert.deepEqual(g.s,before);
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

test('synthetic full campaign keeps 24 node completions and 57 guest rewards distinct',()=>{
  // Transition test with artificial low thresholds, not a playable balance run.
  const g=new Game(31001);
  for(let visit=0;visit<24;visit++){
    const choice=g.availableNodes().find(n=>n.column===1);assert.ok(choice);
    g.visit(choice.id);if(g.s.phase==='recovery')g.skipRecovery();else{finishSyntheticCombat(g);g.claimCreature(0);}
    assert.equal(g.s.stats.visits,visit+1);
    if(visit<23)assert.equal(g.s.phase,'map');
  }
  assert.equal(g.s.phase,'won');assert.deepEqual(g.s.completed,[8,8,8]);
  assert.equal(g.s.stats.kills,57);assert.equal(g.s.money,136);
  assert.equal(g.s.entities.length,25);assert.equal(g.s.floorCount,6);
  assert.equal(g.s.history.filter(e=>e.kind==='restore').length,21);
  assert.equal(g.s.history.filter(e=>e.kind==='creature_reward').length,21);
});

test('each map has one mandatory seventh recovery and no expansion node, with one to three recoveries per route',()=>{
  for(const seed of [31001,31002,31003])for(let act=1;act<=3;act++){
    const nodes=generateMap(seed,act),byId=new Map(nodes.map(n=>[n.id,n]));
    assert.equal(nodes.filter(n=>n.kind==='expansion').length,0);
    for(const depth of [3,6])assert.equal(nodes.filter(n=>n.depth===depth&&n.kind==='recovery').length,1);
    assert.deepEqual(nodes.filter(n=>n.depth===7).map(n=>[n.kind,n.column]),[['recovery',1]]);
    for(const n of nodes.filter(n=>n.depth===6))assert.deepEqual(n.next,[`a${act}-d7-c1`]);
    assert.deepEqual(byId.get(`a${act}-d7-c1`).next,[`a${act}-d8-c1`]);
    function walk(n,count){const nextCount=count+(n.kind==='recovery'?1:0);if(!n.next.length){assert.ok(nextCount>=1&&nextCount<=3);return;}for(const id of n.next)walk(byId.get(id),nextCount);}
    for(const n of nodes.filter(n=>n.depth===1))walk(n,0);
  }
});

test('skipping common recovery completes exactly one visit then opens only the boss',()=>{
  const g=atNode('recovery',1,7),before=structuredClone(g.s.entities),money=g.s.money;
  assert.equal(g.s.completed[0],6);assert.equal(g.s.stats.visits,6);
  g.skipRecovery();assert.equal(g.s.completed[0],7);assert.equal(g.s.stats.visits,7);
  assert.deepEqual(g.availableNodes().map(n=>n.id),['a1-d8-c1']);
  assert.deepEqual(g.s.entities,before);assert.equal(g.s.money,money);assert.throws(()=>g.skipRecovery());
});

test('recovery allocates one shared two-token budget across placed and stored creatures without other restoration',()=>{
  const g=atNode('recovery'),u=g.s.entities.find(e=>e.type==='U'),q=g.s.entities.find(e=>e.type==='Q'),bell=g.s.entities.find(e=>e.type==='B');
  u.p=1;u.c=7;q.p=1;q.c=5;bell.uses=0;g.store(q.id);const money=g.s.money,depth=g._node().depth;
  g.recover({[u.id]:1,[q.id]:1});
  assert.equal(u.p,2);assert.equal(q.p,2);assert.equal(q.floor,null);assert.equal(u.c,7);assert.equal(q.c,5);assert.equal(bell.uses,0);
  assert.equal(g.s.money,money);assert.equal(g.s.completed[0],depth);assert.equal(g.s.phase,'map');
  assert.throws(()=>g.recover({[u.id]:1}));assert.throws(()=>g.upgrade(q.id));
});

test('partial recovery consumes its visit and unused token budget cannot also buy an upgrade',()=>{
  const g=atNode('recovery'),u=g.s.entities.find(e=>e.type==='U');u.p=1;
  g.recover({[u.id]:1});assert.equal(u.p,2);assert.equal(g.s.phase,'map');assert.equal(u.upgraded,false);
  assert.throws(()=>g.upgrade(u.id));assert.throws(()=>g.recover({[u.id]:1}));
  assert.ok(g.s.history.some(e=>e.kind.includes('recover')));
});

test('invalid recovery budgets, missing targets, fractional amounts, dead and full creatures fail atomically',()=>{
  const g=atNode('recovery'),[u,q1,q2,b]=g.s.entities;u.p=q1.p=q2.p=1;
  for(const allocation of [{[u.id]:2,[q1.id]:1},{[b.id]:1},{ghost:1},{[u.id]:0.5},{[u.id]:-1},{[u.id]:2}]){
    const before=structuredClone(g.s);assert.throws(()=>g.recover(allocation));assert.deepEqual(g.s,before);
  }
  const missing=g._add('G');missing.p=0;const before=structuredClone(g.s);assert.throws(()=>g.recover({[missing.id]:1}));assert.deepEqual(g.s,before);
});

test('upgrading affects one owned instance only and does not refill tokens progress or current active charges',()=>{
  const g=atNode('recovery'),bell=g.s.entities.find(e=>e.type==='B'),other=g._add('B');
  bell.uses=0;bell.c=9;const money=g.s.money;g.upgrade(bell.id);
  assert.equal(bell.upgraded,true);assert.equal(other.upgraded,false);assert.equal(bell.p,1);assert.equal(bell.c,9);assert.equal(bell.uses,0);
  assert.equal(creatureName(bell),'빈 프런트의 호출벨+');assert.equal(creatureName(other),'빈 프런트의 호출벨');
  assert.equal(creatureDef(bell).maxP,1);assert.equal(creatureDef(bell).maxUses,3);assert.equal(creatureDef(other).maxUses,2);
  assert.equal(g.s.money,money);assert.equal(g.s.phase,'map');assert.throws(()=>g.recover({}));
  g.visit('a1-d4-c1');assert.equal(bell.uses,3);assert.equal(other.uses,2);assert.equal(bell.c,0);
  bell.uses=1;g.store(bell.id);g.place(bell.id,6);g.view();g.startService();assert.equal(bell.uses,1);
});

test('already upgraded or removed entities cannot be upgraded, but skip remains possible',()=>{
  const g=atNode('recovery'),e=g.s.entities[0];e.upgraded=true;
  const before=structuredClone(g.s);assert.throws(()=>g.upgrade(e.id));assert.deepEqual(g.s,before);
  assert.throws(()=>g.upgrade('removed'));g.skipRecovery();assert.equal(g.s.phase,'map');
});

test('all six upgrades change only the designated runtime effect and keep token maxima',()=>{
  for(const type of Object.keys(CREATURES)){
    const g=atNode('recovery',1,7),e=g._add(type,2);g.upgrade(e.id);
    g.visit('a1-d8-c1');g.startService();g.s.entities=[e];e.floor=1;
    Object.assign(g.s.visitor,{pos:0,t:999,h:2,f:0,a:type==='Q'?9:type==='R'?2:0,pattern:'none'});
    forceDice(g,type==='U'?2:1);g.choose(0);
    if(type==='G'){g.active(e.id,e.id);assert.equal(e.shield,8);assert.equal(e.uses,1);}
    else if(type==='R'){e.c=11;g.active(e.id,e.id);assert.equal(e.c,1);assert.equal(g.s.visitor.a,0);}
    else if(type==='B'){assert.equal(e.uses,3);g.active(e.id);assert.equal(g.s.visitor.f,3);assert.equal(e.uses,2);g.move();assert.equal(g.s.visitor.f,6);}
    else {g.move();if(type==='U')assert.equal(g.s.visitor.a,3);if(type==='Q'){assert.equal(g.s.visitor.a,1);assert.equal(g.s.visitor.f,9);}if(type==='E')assert.equal(g.s.visitor.a,3);}
    assert.equal(creatureDef(e).maxP,CREATURES[type].maxP);assert.equal(e.p,CREATURES[type].maxP);
  }
});

test('an upgraded harvest is still one fear effect and removes at most one heart',()=>{
  const g=combat(),q=g.s.entities.find(e=>e.type==='Q');q.upgraded=true;
  Object.assign(g.s.visitor,{pos:2,a:9,f:0,t:4,h:3,pattern:'none'});forceDice(g,1);g.choose(0);g.move();
  assert.equal(g.s.visitor.h,2);assert.equal(g.s.visitor.f,0);assert.equal(g.s.visitor.a,1);
  const lethal=combat();lethal.entityAt(3).upgraded=true;
  Object.assign(lethal.s.visitor,{pos:2,a:20,t:4,h:1,pattern:'none'});forceDice(lethal,1);lethal.choose(0);
  const preview=lethal.preview();assert.equal(preview.summary.killed,true);assert.ok(!preview.events.some(e=>e.kind==='anxiety'));
  lethal.move();assert.equal(lethal.s.guestIndex,1);assert.equal(lethal.s.visitor.a,0);
});

test('upgraded pass and arrival use the same effective rules in real play and preview',()=>{
  const g=combat();g.s.entities.find(e=>e.type==='U').upgraded=true;g.s.entities.find(e=>e.floor===3).upgraded=true;
  Object.assign(g.s.visitor,{a:1,t:99,h:2,pattern:'none'});forceDice(g,3);
  const before=structuredClone(g.s),p=g.preview(0);assert.equal(p.summary.fear,4);assert.deepEqual(g.s,before);
  g.choose(0);g.move();assert.equal(g.s.visitor.f,4);assert.equal(g.s.visitor.a,1);
});

test('upgraded guard charges one to a maximum of two and repair keeps the anxiety cost of two',()=>{
  const g=combat(),guard=g._add('G',2),repair=g._add('R',4),q=g.s.entities.find(e=>e.floor===3);guard.upgraded=repair.upgraded=true;
  Object.assign(g.s.visitor,{a:2,pattern:'none'});forceDice(g,2);g.choose(0);guard.uses=2;
  g.active(guard.id,q.id);g.active(guard.id,q.id);assert.equal(q.shield,16);assert.equal(guard.uses,0);
  q.c=11;q.p=1;g.active(repair.id,q.id);assert.equal(q.c,1);assert.equal(q.p,1);assert.equal(g.s.visitor.a,0);
  g.move();assert.equal(guard.uses,1);assert.equal(q.shield,0);
});

test('permanent destruction and event removal erase the upgrade and later new copies are base instances',()=>{
  const g=combat(),u=g.s.entities.find(e=>e.type==='U');u.upgraded=true;u.p=1;g._damage(u,12);
  assert.ok(!g.s.entities.some(e=>e.id===u.id));const replacement=g._add('U');assert.equal(replacement.upgraded,false);assert.equal(replacement.p,2);
  const h=atNode('event');h._node().contents={event:'contract'};const e=h.s.entities[0];e.upgraded=true;
  h.eventChoose('sacrifice',e.id);assert.ok(!h.s.entities.some(n=>n.id===e.id));assert.equal(h.s.stats.eventRemoved,1);
  assert.ok(h.s.history.some(record=>record.kind==='event_remove'));
});

test('shop expansion preserves its eight stock slots and does not complete the active node',()=>{
  const g=atNode('shop'),stock=structuredClone(g._node().contents.stock),before=g.s.completed[0];g.s.money=20;
  g.expand();g.expand();assert.equal(g.s.floorCount,8);assert.deepEqual(g._node().contents.stock,stock);
  assert.equal(g.s.phase,'shop');assert.equal(g.s.completed[0],before);g.buy(0);assert.equal(g.s.phase,'shop');g.leave();assert.equal(g.s.completed[0],before+1);
});

test('node-specific permissions reject remote shop expansion, healing, upgrading and rewards',()=>{
  const g=new Game(),e=g.s.entities[0];
  for(const f of [()=>g.buy(0),()=>g.expand(),()=>g.recover({[e.id]:1}),()=>g.upgrade(e.id),()=>g.claimCreature(0),()=>g.claimDie(0)])assert.throws(f);
  g.visit('a1-d1-c1');assert.throws(()=>g.expand());assert.throws(()=>g.upgrade(e.id));assert.throws(()=>g.recover({[e.id]:1}));
  finishSyntheticCombat(g);assert.throws(()=>g.place(e.id,2));assert.throws(()=>g.store(e.id));
});

test('full token and empty-target recovery can always be skipped without rewards',()=>{
  const g=atNode('recovery'),before=structuredClone(g.s.entities),money=g.s.money;
  assert.throws(()=>g.recover({[g.s.entities[0].id]:1}));g.skipRecovery();assert.deepEqual(g.s.entities,before);assert.equal(g.s.money,money);
});

test('both next-act transitions restore all living placed and stored tokens only after claiming the boss creature',()=>{
  for(const act of [1,2]){
    const g=atNode('boss',act),u=g.s.entities[0],q=g.s.entities[1],bell=g.s.entities.find(e=>e.type==='B');
    const guard=g._add('G',2),repair=g._add('R'),echo=g._add('E');
    g.s.floorCount=8;g.s.equipped=['long','anxiety','even'];
    q.floor=null;u.upgraded=q.upgraded=guard.upgraded=repair.upgraded=true;
    for(const e of [u,q,guard,repair])e.p=1;
    finishSyntheticCombat(g);
    for(const [index,e] of [u,q,guard,repair].entries()){e.c=index+5;e.uses=0;}bell.uses=0;
    const before=structuredClone(g.s),existing=structuredClone(g.s.entities),money=g.s.money;
    for(let i=0;i<100;i++)g.view();assert.deepEqual(g.s,before);
    assert.equal(g.s.act,act);assert.equal(g.s.phase,'anomaly_reward');assert.equal(g.s.stats.visits,(act-1)*8+7);
    assert.ok([u,q,guard,repair].every(e=>e.p===1));
    g.claimCreature(0);
    assert.equal(g.s.act,act+1);assert.equal(g.s.phase,'map');assert.equal(g.s.stats.visits,act*8);
    for(const old of existing)assert.deepEqual(g.s.entities.find(e=>e.id===old.id),{...old,p:creatureDef(old).maxP});
    assert.equal(echo.p,1);assert.equal(bell.p,1);assert.equal(g.s.money,money);assert.equal(g.s.floorCount,8);assert.deepEqual(g.s.equipped,before.equipped);
    assert.equal(g.s.stats.recoveries,before.stats.recoveries);assert.equal(g.s.stats.healedTokens,before.stats.healedTokens);
    const reward=g.s.entities.at(-1);assert.equal(reward.upgraded,false);assert.equal(reward.floor,null);assert.equal(reward.p,creatureDef(reward).maxP);
    const boundary=g.s.history.filter(e=>e.kind==='act_start');assert.equal(boundary.length,1);assert.equal(boundary[0].act,act+1);assert.equal(boundary[0].restoredTokens,4);
    for(const old of existing)assert.deepEqual(boundary[0].beforeEntities.find(e=>e.id===old.id),old);
    assert.deepEqual(boundary[0].entities,g.s.entities);
    const after=structuredClone(g.s);assert.throws(()=>g.claimCreature(0));assert.deepEqual(g.s,after);
    // A later combat in the same newly started act must not repeat the refill.
    u.p=q.p=1;g.visit(`a${act+1}-d1-c1`);assert.equal(u.p,1);assert.equal(q.p,1);assert.equal(u.c,0);assert.equal(bell.uses,2);
    g.startService();Object.assign(g.s.visitor,{t:3,h:1,pattern:'none'});g.roll();g.choose(0);g.active(bell.id);
    assert.equal(g.s.guestIndex,1);assert.equal(u.p,1);assert.equal(q.p,1);assert.equal(bell.uses,1);
  }
});

test('act token restoration never resurrects destroyed or contract-removed creature instances',()=>{
  const g=atNode('event'),removed=g.s.entities[1];removed.upgraded=true;
  g._node().contents={event:'contract'};g.eventChoose('sacrifice',removed.id);
  g.s.completed[0]=7;g.s.lastNodes[0]='a1-d7-c1';g.s.stats.visits=7;g.visit('a1-d8-c1');
  const destroyed=g._add('G',2);destroyed.upgraded=true;destroyed.p=1;g._damage(destroyed,12);
  const survivor=g.s.entities[0];survivor.p=1;finishSyntheticCombat(g);
  const ids=g.s.entities.map(e=>e.id),destroyedCount=g.s.stats.destroyed,removedCount=g.s.stats.eventRemoved;
  g.claimCreature(0);assert.equal(g.s.act,2);assert.equal(survivor.p,2);
  assert.ok(!g.s.entities.some(e=>[removed.id,destroyed.id].includes(e.id)));
  assert.deepEqual(g.s.entities.slice(0,-1).map(e=>e.id),ids);assert.equal(g.s.stats.destroyed,destroyedCount);assert.equal(g.s.stats.eventRemoved,removedCount);
});

test('final-act boss reward ends the run without restoring surviving tokens or other instance state',()=>{
  const g=atNode('boss',3),placed=g.s.entities[0],reserve=g.s.entities[1];
  placed.p=reserve.p=1;placed.upgraded=reserve.upgraded=true;reserve.floor=null;
  finishSyntheticCombat(g);placed.c=5;reserve.c=7;const entities=structuredClone(g.s.entities),money=g.s.money;
  assert.equal(g.s.finalVictory,true);assert.equal(g.s.phase,'anomaly_reward');assert.equal(placed.p,1);assert.equal(reserve.p,1);
  g.claimCreature(0);assert.equal(g.s.phase,'won');assert.equal(g.s.act,3);assert.equal(g.s.money,money);
  assert.deepEqual(g.s.entities.slice(0,-1),entities);assert.equal(g.s.history.filter(e=>e.kind==='act_start').length,0);
});

test('final win is locked after last boss death; the mandatory last creature completes visit twenty-four',()=>{
  const g=atNode('boss',3);finishSyntheticCombat(g);const earned=g.s.stats.earned,money=g.s.money;
  assert.equal(g.s.finalVictory,true);assert.equal(g.s.stats.visits,23);assert.equal(g.s.phase,'anomaly_reward');
  assert.throws(()=>g.surrender());assert.throws(()=>g.skipDie());assert.throws(()=>g.leave());
  g.claimCreature(0);assert.equal(g.s.phase,'won');assert.equal(g.s.stats.visits,24);assert.equal(g.s.money,money);assert.equal(g.s.stats.earned,earned);
  const after=structuredClone(g.s);assert.throws(()=>g.claimCreature(0));assert.deepEqual(g.s,after);
});

test('new campaign resets map, upgrades, tokens, souls, hotel and dice rather than carrying a prior run',()=>{
  const changed=atNode('recovery');changed.s.entities[0].p=1;changed.upgrade(changed.s.entities[0].id);changed.s.equipped=['anxiety','anxiety','long'];changed.s.floorCount=10;
  const fresh=new Game(31001);assert.equal(fresh.s.money,4);assert.equal(fresh.s.floorCount,6);assert.deepEqual(fresh.s.equipped,['normal','normal','normal']);
  assert.ok(fresh.s.entities.every(e=>e.upgraded===false&&e.p===CREATURES[e.type].maxP));assert.deepEqual(fresh.s.completed,[0,0,0]);assert.equal(fresh.s.phase,'map');
});

test('one hundred public reviews never redraw stock, discovered die, event or reward candidates',()=>{
  for(const kind of ['shop','discovery','event']){
    const g=atNode(kind),before=structuredClone(g.s);
    for(let i=0;i<100;i++)g.view();
    assert.deepEqual(g.s,before,kind);
  }
  const g=atNode('normal');finishSyntheticCombat(g);const before=structuredClone(g.s);
  for(let i=0;i<100;i++)g.view();assert.deepEqual(g.s,before);
});

test('elite exit contact cancels later movement, attacks and both reward stages',()=>{
  const g=combat('elite'),cash=g.s.money;forceDice(g,6);g.choose(0);g.installEscape(2);
  const p=g.preview();assert.deepEqual(p.path,[1,2]);assert.equal(p.summary.escaped,true);
  assert.equal(p.summary.retaliation,false);assert.equal(p.summary.fear,0);
  const events=g.move();assert.deepEqual(events.filter(e=>e.kind==='move').map(e=>e.floor),[1,2]);
  assert.equal(g.s.phase,'map');assert.equal(g.s.money,cash);assert.equal(g.s.reward,null);
  assert.ok(!events.some(e=>['hit','miss','creature_offer','die_offer'].includes(e.kind)));
});

test('a lethal direct effect cancels movement and does not carry an unfinished choice into the next guest',()=>{
  const g=combat(),bell=g.s.entities.find(e=>e.type==='B');
  Object.assign(g.s.visitor,{t:3,h:1,pattern:'route'});forceDice(g,6);g.choose(0);
  const before=structuredClone(g.s),p=g.preview(undefined,[{kind:'active',entityId:bell.id}]);
  assert.equal(p.summary.killed,true);assert.deepEqual(p.path,[]);assert.equal(p.summary.retaliation,false);
  assert.equal(p.summary.heartsAfter,0);assert.deepEqual(g.s,before);
  const events=g.active(bell.id);
  assert.equal(g.s.phase,'roll');assert.equal(g.s.visitor.pos,0);assert.equal(g.s.chosen,null);
  assert.equal(g.s.visitor.f,0);assert.equal(g.s.stats.kills,1);
  assert.deepEqual(events.filter(e=>['fear','heart','fear_reset','kill'].includes(e.kind)).map(e=>e.kind),['fear','heart','fear_reset','kill']);
  const after=structuredClone(g.s);assert.throws(()=>g.move());assert.deepEqual(g.s,after);
});

test('same-visit arrival does not also pass; repeat visits apply distinct effects',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='U');
  Object.assign(g.s.visitor,{a:0,pattern:'none'});forceDice(g,1);g.choose(0);g.move();
  assert.equal(g.s.visitor.a,4);assert.equal(g.events.filter(e=>e.kind==='anxiety').length,1);
  Object.assign(g.s.visitor,{pos:0,a:0});forceDice(g,8,'long');g.choose(0);g.move();
  assert.equal(g.s.visitor.a,4);assert.equal(g.events.filter(e=>e.kind==='anxiety').length,2);
});

test('inactivity penalties begin after three idle turns, then two, bypass protection and reset after activity',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='Q');
  Object.assign(g.s.visitor,{pos:0,a:0,pattern:'none'});
  for(let turn=1;turn<=5;turn++){
    forceDice(g,2);g.choose(0);g.move();
    assert.equal(g.events.some(e=>e.kind==='penalty_start'),turn===3||turn===5);
    assert.equal(g.s.inactiveLimit,turn<3?3:2);
  }
  const h=combat(),q=h.s.entities.find(e=>e.type==='Q');
  h.s.entities=[q];q.shield=99;h.s.activity=false;h.s.inactive=2;
  h._inactivity();assert.equal(q.p,1);assert.equal(q.shield,99);
  h.s.activity=true;h._inactivity();assert.equal(h.s.inactive,0);assert.equal(h.s.inactiveLimit,3);
});

test('zero actual anxiety increase is idle, but legal direct protection counts as activity',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='U');
  Object.assign(g.s.visitor,{a:ANXIETY_CAP,pattern:'none'});forceDice(g,1);g.choose(0);g.move();
  assert.equal(g.s.inactive,1);
  const h=combat(),guard=h._add('G',2);h.s.inactive=2;
  Object.assign(h.s.visitor,{pattern:'none'});forceDice(h,2);h.choose(0);h.active(guard.id,guard.id);h.move();
  assert.equal(h.s.inactive,0);assert.equal(h.s.inactiveLimit,3);
  assert.equal(guard.shield,0);assert.ok(h.events.some(e=>e.kind==='shield_expire'));
});

test('retaliation ends immediately on loss rather than hitting empty later floors',()=>{
  const g=combat();g.s.entities=g.s.entities.filter(e=>e.type==='Q').slice(0,1);
  const e=g.s.entities[0];e.p=1;e.c=6;e.floor=3;
  Object.assign(g.s.visitor,{a:0,pattern:'double',pos:0});forceDice(g,3);g.choose(0);
  const p=g.preview();assert.equal(p.summary.lost,true);assert.equal(p.attacks.length,1);
  const events=g.move();assert.equal(g.s.phase,'lost');
  assert.equal(events.filter(e=>['hit','miss'].includes(e.kind)).length,1);
  assert.ok(!events.some(e=>e.kind==='inactivity'));
});
