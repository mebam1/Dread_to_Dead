/** Synthetic boundary fixtures. These are not normal-play or balance evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CREATURES,DICE,creatureDef,generateMap,RULE_VERSION} from './engine.js';
import {analyze} from './analysis.mjs';

function atNode(kind,act=1,seed=31001){
  const g=new Game(seed);g.s.act=act;const n=g.s.maps[act-1].find(n=>n.kind===kind);
  g.s.completed[act-1]=n.depth-1;g.s.lastNodes[act-1]=n.depth===1?null:'a'+act+'-d'+(n.depth-1)+'-c1';g.s.stats.visits=(act-1)*8+n.depth-1;
  g.visit(n.id);return g;
}
function combat(kind='normal',act=1){const g=atNode(kind,act);g.startService();Object.assign(g.s.visitor,{pattern:'none',t:999,h:3});return g;}
function layout(g,pairs){g.s.entities=[];return pairs.map(([type,floor])=>g._add(type,floor));}
function dice(g,value,type='normal'){
  const face=DICE[type].faces.indexOf(value);assert.notEqual(face,-1);
  g.s.equipped[0]=type;g.s.phase='choose';
  g.s.dice=g.s.equipped.map((t,slot)=>({slot,type:t,face:slot===0?face:0,value:slot===0?value:DICE[t].faces[0]}));
}
function step(g,value=1){dice(g,value);g.choose(0);return g.move();}
function finish(g){
  for(const v of g._node().guests)Object.assign(v,{t:1,h:1,pattern:'none'});
  if(g.s.phase==='management')g.startService();
  Object.assign(g.s.visitor,{t:1,h:1,pattern:'none'});
  while(g.s.phase==='roll'){g.s.visitor.prophecy=1;step(g);}
  assert.equal(g.s.phase,'anomaly_reward');
}

test('catalogue has the exact twelve creatures and per-instance durability',()=>{
  assert.equal(Object.keys(CREATURES).length,12);
  assert.deepEqual(Object.values(CREATURES).map(d=>[d.price,d.limit,d.maxP]),[[3,12,2],[3,12,1],[4,12,2],[4,12,2],[3,20,2],[5,20,2],[4,14,2],[3,12,1],[3,12,2],[3,12,2],[4,12,2],[4,12,2]]);
  assert.ok(!Object.values(CREATURES).some(d=>/호출벨|방화문/.test(d.name)));
});
test('new campaign has four distinct starters, twenty-node maps and stable public contents',()=>{
  const g=new Game(31001);assert.equal(g.s.version,RULE_VERSION);
  assert.deepEqual(g.s.entities.map(e=>[e.type,e.floor]),[['gaze',1],['owner',3],['runes',5],['safe',6]]);
  for(let a=1;a<=3;a++){const map=generateMap(31001,a);assert.equal(map.length,20);assert.equal(map.filter(n=>n.depth===7).length,1);assert.deepEqual(map,generateMap(31001,a));}
  assert.throws(()=>g.visit('a1-d8-c1'));assert.equal(g.s.stats.visits,0);
});
test('all upgrades are individual; footsteps gain a token and samara gains limit, without resetting other damage',()=>{
  for(const type of Object.keys(CREATURES)){
    const g=atNode('recovery'),e=g._add(type,2);e.c=7;e.uses=0;const max=creatureDef(e).maxP;
    g.upgrade(e.id);assert.equal(e.upgraded,true);assert.equal(e.c,7);assert.equal(e.uses,0);
    assert.equal(e.p,type==='footsteps'?max+1:max);assert.equal(creatureDef(e).limit,type==='samara'?14:CREATURES[type].limit);
    assert.equal(g.s.phase,'map');assert.throws(()=>g.upgrade(e.id));
  }
});
test('free placement swaps occupied floors and preserves damaged upgraded entities',()=>{
  const g=atNode('normal'),a=g.s.entities[0],b=g.s.entities[1];a.c=7;a.p=1;a.upgraded=true;
  g.place(a.id,b.floor);assert.equal(b.floor,1);assert.equal(a.floor,3);g.store(a.id);g.place(a.id,2);
  assert.equal(a.c,7);assert.equal(a.p,1);assert.equal(a.upgraded,true);
});
test('gaze distinguishes pass and arrival; footsteps doubles only on pass and clamps at twenty',()=>{
  for(const [value,expected] of [[1,4],[2,2]]){
    const g=combat();layout(g,[['gaze',1]]);step(g,value);assert.equal(g.s.visitor.a,expected);
  }
  for(const [value,expected] of [[1,12],[2,20]]){
    const g=combat();layout(g,[['footsteps',1]]);g.s.visitor.a=12;step(g,value);assert.equal(g.s.visitor.a,expected);
  }
  const g=combat();const [e]=layout(g,[['gaze',1]]);e.upgraded=true;step(g,2);assert.equal(g.s.visitor.a,3);
});
test('owner harvests all anxiety one-for-one; upgrade supplies one even from zero',()=>{
  for(const upgraded of [false,true])for(const a of [0,2,20]){
    const g=combat(),[q]=layout(g,[['owner',1]]);q.upgraded=upgraded;g.s.visitor.a=a;dice(g,1);
    const before=structuredClone(g.s),p=g.preview(0);assert.deepEqual(g.s,before);assert.equal(p.summary.fear,a);
    g.choose(0);g.move();assert.equal(g.s.visitor.f,a);assert.equal(g.s.visitor.a,upgraded?1:0);
    assert.deepEqual(g.events.filter(e=>['harvest','fear','anxiety'].includes(e.kind)).map(e=>e.kind),['harvest',...(a?['fear']:[]),...(upgraded?['anxiety']:[])]);
  }
});
test('one harvest removes one heart; lethal harvest cancels supply and starts a fresh visitor',()=>{
  const g=combat(),[q]=layout(g,[['owner',1]]);q.upgraded=true;Object.assign(g.s.visitor,{a:20,t:4,h:2});step(g);
  assert.equal(g.s.visitor.h,1);assert.equal(g.s.visitor.f,0);assert.equal(g.s.visitor.a,1);
  Object.assign(g.s.visitor,{a:20,pos:0});const events=step(g);
  assert.equal(g.s.guestIndex,1);assert.equal(g.s.visitor.a,0);assert.ok(!events.some(e=>e.kind==='anxiety'));
});
test('mouse pays anxiety, repairs progress only, can repair itself, and respects seal',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[r]=layout(g,[['mouse',1]]);r.upgraded=upgraded;r.c=11;r.p=1;g.s.visitor.a=2;dice(g,1);
    const before=structuredClone(g.s);assert.throws(()=>g.active(r.id,r.id));assert.deepEqual(g.s,before);
    g.choose(0);g.active(r.id,r.id);assert.equal(r.c,upgraded?1:5);assert.equal(r.p,1);assert.equal(g.s.visitor.a,0);
    r.seal=1;const sealed=structuredClone(g.s);assert.throws(()=>g.active(r.id,r.id));assert.deepEqual(g.s,sealed);
  }
});
test('safe toggles only after confirmation and redirects the actual route and attack destination',()=>{
  const g=combat(),[s]=layout(g,[['safe',2],['runes',5]]);g.s.visitor.pattern='double';dice(g,6);
  assert.throws(()=>g.active(s.id));g.choose(0);g.active(s.id);
  const p=g.preview();assert.deepEqual(p.path,[1,2]);assert.equal(p.summary.greedAfter,1);assert.equal(p.attacks[0].floor,2);
  g.move();assert.equal(s.c,12);assert.equal(s.p,2);assert.equal(g.s.visitor.greed,1);
});
test('fire stops safe income but not attraction; seal suppresses attraction without deleting its setting',()=>{
  const g=combat(),[s]=layout(g,[['safe',2]]);s.lure=true;s.fire=2;dice(g,6);g.choose(0);
  assert.deepEqual(g.preview().path,[1,2]);g.move();assert.equal(g.s.visitor.greed,0);assert.equal(s.fire,1);
  g.s.visitor.pos=0;s.seal=2;dice(g,6);g.choose(0);assert.equal(g.preview().path.length,6);g.move();assert.equal(s.lure,true);assert.equal(s.seal,1);
});
test('free lure toggles do not reset inactivity; penalty uses actual twenty-point limit',()=>{
  const g=combat(),[s]=layout(g,[['safe',6]]);g.s.inactive=2;dice(g,1);g.choose(0);g.active(s.id);
  const p=g.preview();assert.equal(p.uncertainty.length,1);assert.equal(p.uncertainty[0].p,2);assert.equal(p.uncertainty[0].c,12);
  g.move();assert.equal(s.p,2);assert.equal(s.c,12);assert.ok(g.events.some(e=>e.kind==='penalty_start'));
});
test('barnacle attachments follow an actual safe stop and stack per pass',()=>{
  const g=combat(),[a,b,s]=layout(g,[['barnacle',1],['barnacle',2],['safe',3]]);s.lure=true;g.s.visitor.pattern='double';
  dice(g,6);g.choose(0);const p=g.preview();assert.deepEqual(p.path,[1,2,3]);assert.equal(p.events.filter(e=>e.kind==='shield').reduce((n,e)=>n+e.amount,0),6);
  g.move();assert.equal(s.c,6);assert.equal(s.shield,0);assert.equal(a.uses+b.uses,0);
});
test('barnacle banks greed on arrival, cannot spend it until next preparation and does not charge at cap',()=>{
  const g=combat(),[b]=layout(g,[['barnacle',1]]);g.s.visitor.greed=1;step(g);assert.equal(b.uses,1);assert.equal(g.s.visitor.greed,0);
  assert.throws(()=>g.active(b.id,b.id));dice(g,1);g.choose(0);g.active(b.id,b.id);assert.equal(b.uses,0);assert.equal(b.shield,10);
  b.uses=2;g.s.visitor.greed=1;g.s.visitor.pos=0;g.move();assert.equal(b.uses,2);assert.equal(g.s.visitor.greed,1);
});
test('upgraded barnacle gives fifteen defense and fire does not block its active',()=>{
  const g=combat(),[b]=layout(g,[['barnacle',1]]);b.upgraded=true;b.uses=1;b.fire=3;dice(g,1);g.choose(0);g.active(b.id,b.id);
  assert.equal(b.shield,15);assert.equal(b.uses,0);
});
test('nepenthes leaves movement intact; receiver defense absorbs redirected hits',()=>{
  const g=combat(),[q,n,b]=layout(g,[['owner',3],['nepenthes',4],['barnacle',2]]);n.upgraded=true;b.uses=1;g.s.visitor.greed=1;g.s.visitor.pattern='double';
  dice(g,3);g.choose(0);g.active(n.id,q.id);g.active(b.id,n.id);const p=g.preview();assert.deepEqual(p.path,[1,2,3]);g.move();
  assert.equal(q.c,0);assert.equal(n.c,0);assert.equal(n.p,2);assert.equal(g.events.filter(e=>e.kind==='hit'&&e.redirected).length,2);
});
test('guard cycles and self-targets are rejected before payment',()=>{
  const g=combat(),[a,b]=layout(g,[['nepenthes',1],['nepenthes',2]]);g.s.visitor.greed=2;dice(g,1);g.choose(0);g.active(b.id,a.id);
  const before=structuredClone(g.s);assert.throws(()=>g.active(a.id,b.id),/고리/);assert.deepEqual(g.s,before);assert.throws(()=>g.active(a.id,a.id));
});
test('destroyed guard stops receiving later hits, which return to the original target',()=>{
  const g=combat(),[q,n]=layout(g,[['owner',3],['nepenthes',4]]);n.c=16;n.p=1;g.s.visitor.greed=1;g.s.visitor.pattern='double';
  dice(g,3);g.choose(0);g.active(n.id,q.id);g.move();assert.ok(!g.s.entities.includes(n));assert.equal(q.c,6);assert.equal(q.p,2);
});
test('collector pays one use, caps greed and seals for three or upgraded two including this turn',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[c,q]=layout(g,[['collector',2],['owner',1]]);c.upgraded=upgraded;g.s.visitor.a=20;g.s.visitor.greed=1;
    dice(g,1);g.choose(0);g.active(c.id,q.id);assert.equal(c.uses,0);assert.equal(q.seal,upgraded?2:3);assert.equal(g.s.visitor.greed,2);
    g.move();assert.equal(g.s.visitor.f,0);assert.equal(g.s.visitor.a,20);assert.equal(q.seal,upgraded?1:2);
  }
});
test('collector cannot seal itself; existing seals extend to nine and seal blocks later actives',()=>{
  const g=combat(),[c,q]=layout(g,[['collector',2],['owner',1]]);dice(g,1);g.choose(0);
  const before=structuredClone(g.s);assert.throws(()=>g.active(c.id,c.id));assert.deepEqual(g.s,before);
  q.seal=8;g.active(c.id,q.id);assert.equal(q.seal,9);c.uses=1;c.seal=1;assert.throws(()=>g.active(c.id,q.id));
});
test('fire permits rune pass supply while seal blocks it; both decay once per completed turn',()=>{
  for(const status of ['fire','seal']){
    const g=combat(),[w]=layout(g,[['runes',1]]);w[status]=2;step(g,2);
    assert.equal(g.s.visitor.f,status==='fire'?1:0);assert.equal(w[status],1);
  }
});
test('prophet returns to rolling after confirmation, preserves costs/effects and uses a fresh roll batch',()=>{
  const g=combat(),[f,q]=layout(g,[['prophet',2],['owner',3]]);g.s.visitor.prophecy=6;g.roll();const first=g.s.dice.map(d=>d.face);
  assert.throws(()=>g.active(f.id));g.choose(0);q.shield=5;q.seal=3;g.active(f.id);
  assert.equal(g.s.phase,'roll');assert.equal(g.s.visitor.prophecy,2);assert.equal(g.s.visitor.turn,1);assert.equal(q.seal,3);assert.equal(q.shield,5);
  g.roll();assert.equal(g.s.phase,'choose');assert.equal(g.s.visitor.rollIndex,1);assert.notDeepEqual(g.s.dice.map(d=>d.face),first);
  assert.equal(g.s.activity,true);assert.equal(q.seal,3);
});
test('reroll previews disclose no new dice and forbid planning after unknown outcomes',()=>{
  const g=combat(),[f]=layout(g,[['prophet',1]]);g.s.visitor.prophecy=6;g.roll();
  const before=structuredClone(g.s),p=g.preview(0,[{kind:'active',entityId:f.id}]);assert.equal(p.requiresRoll,true);
  assert.equal(p.state.visitor.prophecy,2);assert.deepEqual(p.state.dice,[]);assert.deepEqual(p.path,[]);assert.ok(!p.events.some(e=>e.kind==='roll'));
  assert.throws(()=>g.preview(0,[{kind:'active',entityId:f.id},{kind:'active',entityId:f.id}]));assert.deepEqual(g.s,before);
});
test('selection bonus occurs once per batch, survives reroll, and samara does not apply it again',()=>{
  const g=combat(),[f,s]=layout(g,[['prophet',1],['samara',2]]);g.s.visitor.prophecy=6;
  dice(g,3,'anxiety');g.choose(0);assert.equal(g.s.visitor.a,1);g.active(f.id);g.roll();
  g.s.equipped[0]='anxiety';g.s.dice[0]={slot:0,type:'anxiety',face:2,value:3};g.choose(0);assert.equal(g.s.visitor.a,2);
  g.active(s.id);assert.equal(g.s.chosen,2);assert.equal(g.s.visitor.a,2);
});
test('samara changes the final rune condition and path, but its upgrade changes only durability',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[s,w]=layout(g,[['samara',1],['runes',3]]);s.upgraded=upgraded;g.s.visitor.prophecy=2;dice(g,4);g.choose(0);
    const p=g.preview(undefined,[{kind:'active',entityId:s.id}]);assert.equal(p.selected.effectiveValue,3);assert.deepEqual(p.effectivePath,[1,2,3]);
    g.active(s.id);assert.equal(g.s.chosen,3);assert.equal(g.s.visitor.prophecy,0);g.move();assert.equal(g.s.visitor.f,4);assert.equal(creatureDef(s).limit,upgraded?14:12);
  }
  const g=combat(),[s]=layout(g,[['samara',1]]);g.s.visitor.prophecy=10;dice(g,1);g.choose(0);const before=structuredClone(g.s);
  assert.throws(()=>g.active(s.id));assert.deepEqual(g.s,before);
});
test('rune and roulette upgraded arrival both give five; final parity and threshold govern supply',()=>{
  for(const [type,value,expected] of [['runes',2,5],['runes',4,0],['roulette',2,5],['roulette',3,0],['roulette',6,5]]){
    const g=combat(),[w]=layout(g,[[type,value]]);w.upgraded=true;step(g,value);
    assert.equal(g.s.visitor.f,expected);assert.equal(g.s.visitor.prophecy,Math.max(0,expected-1));
  }
});
test('automatic prophecy is one effect before attack and kills cancel retaliation and carryover',()=>{
  const g=combat();layout(g,[['safe',6]]);g.s.visitor.prophecy=6;step(g,1);assert.equal(g.s.visitor.f,6);assert.equal(g.s.visitor.prophecy,5);
  Object.assign(g.s.visitor,{prophecy:6,t:6,h:1,pattern:'double'});const events=step(g,1);
  assert.ok(events.some(e=>e.kind==='kill'));assert.ok(!events.some(e=>e.kind==='hit'));assert.equal(g.s.guestIndex,1);assert.equal(g.s.visitor.prophecy,0);
});
test('shop, reward and event pools cover twelve species; purchases and free awards retain origin',()=>{
  const seen=new Set(),events=new Set();
  for(let seed=31001;seed<31041;seed++){
    const g=atNode('shop',1,seed);assert.equal(g._node().contents.stock.length,8);
    for(const i of g._node().contents.stock)seen.add(i.type);
    const e=atNode('event',1,seed);if(e._node().contents.creature)events.add(e._node().contents.creature);
  }
  assert.equal(seen.size,12);assert.ok([...events].some(t=>['runes','roulette','prophet','samara'].includes(t)));
  const shop=atNode('shop');shop.s.money=10;shop.buy(0);assert.equal(shop.s.entities.at(-1).origin.kind,'shop');const after=structuredClone(shop.s);assert.throws(()=>shop.buy(0));assert.deepEqual(shop.s,after);
  const g=atNode('normal');finish(g);assert.equal(new Set(g.s.reward.creatures).size,3);g.claimCreature(0);assert.equal(g.s.entities.at(-1).origin.kind,'free_reward');
});
test('expansion is shop-only; geometry comparison is repeatable and excludes automatic combat',()=>{
  const g=atNode('shop');g.s.equipped[0]='long';const before=structuredClone(g.s),p=g.expansionPreview({position:5,slot:0,face:5,anxiety:20,prophecy:10});
  assert.equal(p.before.path[1],1);assert.equal(p.after.path[1],7);assert.ok(!p.before.events.some(e=>e.source==='예언 자동 공포'||e.kind==='hit'));
  assert.deepEqual(g.s,before);assert.deepEqual(g.expansionPreview({position:5,slot:0,face:5,anxiety:20,prophecy:10}),p);
  assert.throws(()=>g.expansionPreview({anxiety:21}));g.expand();assert.equal(g.s.floorCount,7);assert.equal(g.s.money,0);
  assert.throws(()=>atNode('normal').expand());
});
test('recovery allocates two tokens globally; upgrades and skips are mutually exclusive',()=>{
  const g=atNode('recovery'),[a,b]=g.s.entities;a.p=1;b.p=1;g.recover({[a.id]:1,[b.id]:1});
  assert.equal(a.p,2);assert.equal(b.p,2);assert.equal(g.s.money,4);assert.throws(()=>g.upgrade(a.id));
});
test('combat preparation resets charges and statuses once, but preserves token damage',()=>{
  const g=atNode('shop'),e=g.s.entities[0];e.p=1;e.c=9;e.seal=3;g.leave();g.visit('a1-d4-c1');
  assert.equal(e.p,1);assert.equal(e.c,0);assert.equal(e.seal,0);e.c=7;g.view();g.startService();assert.equal(e.c,7);
});
test('boss boundaries restore surviving upgraded maxima and final victory stays locked through reward',()=>{
  for(const act of [1,2,3]){
    const g=atNode('boss',act),e=g._add('footsteps');e.upgraded=true;e.p=1;
    finish(g);
    if(act===3){assert.equal(g.s.finalVictory,true);assert.throws(()=>g.giveUp());}
    g.claimCreature(0);assert.equal(e.p,act===3?1:2);assert.equal(g.s.phase,act===3?'won':'map');
  }
});
test('boss escape is defeat; previews and execution stop at contact',()=>{
  const g=combat('boss');dice(g,4);g.choose(0);g.installEscape(2);const p=g.preview();assert.deepEqual(p.path,[1,2]);assert.equal(p.summary.lost,true);
  g.move();assert.equal(g.s.phase,'lost');assert.ok(!g.events.some(e=>e.kind==='hit'));
});
test('preview is pure across repeats and clone continuation matches real rolled dice',()=>{
  const g=combat();g.roll();const before=structuredClone(g.s);for(let i=0;i<30;i++)for(const d of g.s.dice)g.preview(d.slot);assert.deepEqual(g.s,before);
  const clone=g.clone();g.choose(0);clone.choose(0);g.move();clone.move();assert.deepEqual(g.s,clone.s);
  assert.throws(()=>Game.fromState({...g.s,version:'user-3-v1.2'}));
});
test('analysis links real fear and acquisitions to origin without declaring growth goals achieved',()=>{
  const g=combat();g.s.visitor.a=20;dice(g,3);g.choose(0);g.move();const report=analyze(g.s,'diagnostic');
  assert.equal(report.evidenceOnly,true);assert.equal(report.goals.distinctClears.clearCase,false);
  assert.ok(report.goals.distinctClears.actualFear.anxietyHarvest>0);
  assert.ok(report.goals.distinctClears.usedEntities.some(e=>e.type==='owner'&&e.effects.fear>0));
});
test('synthetic campaign traverses all twenty-four visits, rewards, mandatory recoveries and final victory',()=>{
  const g=new Game(31001);
  while(g.s.phase!=='won'){
    assert.equal(g.s.phase,'map');const n=g.availableNodes().find(n=>n.column===1);g.visit(n.id);
    if(g.s.phase==='recovery')g.skipRecovery();
    else{finish(g);g.claimCreature(0);}
  }
  assert.deepEqual(g.s.completed,[8,8,8]);assert.equal(g.s.stats.visits,24);assert.equal(g.s.stats.kills,57);
  assert.equal(g.s.history.filter(e=>e.kind==='act_start').length,2);
});
test('analysis retains body-only contributions even when resource supply was capped',()=>{
  const g=combat();layout(g,[['safe',2]]);Object.assign(g.s.visitor,{greed:2,pattern:'double'});step(g,2);
  const report=analyze(g.s,'diagnostic'),body=report.goals.distinctClears.usedEntities.find(e=>e.type==='safe');
  assert.equal(body.firstEffect.kind,'body_hit');assert.equal(body.effects.damageTaken,12);assert.equal(body.effects.hitsTaken,2);assert.equal(body.effects.greed,0);
});
