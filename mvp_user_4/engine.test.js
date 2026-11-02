/** Synthetic boundary fixtures; these are not normal-play or balance evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CREATURES,DICE,CAPS,creatureDef,generateMap,RULE_VERSION} from './engine.js';

function atNode(kind,act=1,seed=31001,depth=null){
  const g=new Game(seed);g.s.act=act;const n=g.s.maps[act-1].find(n=>n.kind===kind&&(depth==null||n.depth===depth));
  g.s.completed[act-1]=n.depth-1;g.s.lastNodes[act-1]=n.depth===1?null:'a'+act+'-d'+(n.depth-1)+'-c1';g.s.stats.visits=(act-1)*8+n.depth-1;
  g.visit(n.id);return g;
}
function combat(kind='normal',act=1){const g=atNode(kind,act);g.startService();Object.assign(g.s.visitor,{pattern:'none',t:999,h:3,attackBonus:0});for(const key of ['power','doublePower','mirrorPower'])delete g.s.visitor[key];return g;}
function layout(g,pairs){g.s.entities=[];return pairs.map(([type,floor])=>g._add(type,floor));}
function dice(g,value,type='normal'){
  const face=DICE[type].faces.indexOf(value);assert.notEqual(face,-1);
  g.s.equipped[0]=type;g.s.phase='choose';
  g.s.dice=g.s.equipped.map((t,slot)=>({slot,type:t,face:slot===0?face:0,value:slot===0?value:DICE[t].faces[0]}));
}
function prepare(g,value=1,type='normal'){dice(g,value,type);g.choose(0);}
function step(g,value=1,type='normal'){prepare(g,value,type);return g.move();}
function finish(g){
  for(const v of g._node().guests)Object.assign(v,{t:1,h:1,pattern:'none'});
  if(g.s.phase==='management')g.startService();
  while(g.s.phase==='roll'){
    Object.assign(g.s.visitor,{t:1,h:1,pattern:'none',prophecy:2});prepare(g,1);
  }
  assert.equal(g.s.phase,'anomaly_reward');
}
const clone=x=>structuredClone(x);

test('catalogue is exactly the thirteen latest creatures with their own prices and durability',()=>{
  const expected={gaze:['문틈의 시선',3,12,2],footsteps:['따라오는 발소리',3,12,1],owner:['시선의 주인',4,12,2],mouse:['별것 아닌 생쥐',4,12,2],portrait:['노려보는 초상화',5,8,2],safe:['유혹하는 금고',3,20,2],nepenthes:['모욕하는 네펜데스',5,14,2],barnacle:['수정 따개비',4,14,2],collector:['수집가',3,14,2],runes:['룬 문자 벽',3,12,2],roulette:['이름이 새겨진 룰렛',3,12,2],prophet:['횡설수설하는 예언가',4,12,2],samara:['사마라의 약속',4,12,2]};
  assert.deepEqual(Object.keys(CREATURES).sort(),Object.keys(expected).sort());
  for(const [type,values] of Object.entries(expected)){const d=creatureDef(type);assert.deepEqual([d.name,d.price,d.limit,d.maxP],values);}
  for(const state of ['a','greed','prophecy','seal','fire','uses'])assert.equal(CAPS[state],99);
  assert.equal(creatureDef('barnacle').initialUses,0);assert.equal(creatureDef('collector').initialUses,1);
  assert.equal(creatureDef('barnacle').maxStoredUses,99);assert.equal(creatureDef('collector').maxStoredUses,99);
});

test('new campaign and all maps are deterministic and preserve the full three-act route',()=>{
  const g=new Game(31001);assert.equal(g.s.version,RULE_VERSION);assert.match(RULE_VERSION,/user-4/);
  assert.deepEqual(g.s.entities.map(e=>[e.type,e.floor]),[['gaze',1],['owner',3],['runes',5],['safe',6]]);
  assert.deepEqual(g.s.equipped,['normal','normal','normal']);assert.equal(g.s.money,4);
  for(let act=1;act<=3;act++){const map=generateMap(31001,act);assert.equal(map.length,20);assert.equal(map.filter(n=>n.depth===7&&n.kind==='recovery').length,1);assert.equal(map.filter(n=>n.depth===8&&n.kind==='boss').length,1);assert.deepEqual(map,generateMap(31001,act));}
  assert.throws(()=>g.visit('a1-d8-c1'));assert.equal(g.s.stats.visits,0);
});

test('every upgrade is per instance and only footsteps grants a current token',()=>{
  for(const type of Object.keys(CREATURES)){
    const g=atNode('recovery'),e=g._add(type,2),other=g._add(type);e.c=7;e.uses=0;const original=clone(e);
    g.upgrade(e.id);assert.equal(e.upgraded,true);assert.equal(other.upgraded,false);assert.equal(e.c,7);assert.equal(e.uses,0);
    assert.equal(e.p,original.p+(type==='footsteps'?1:0));
    assert.equal(creatureDef(e).limit,type==='barnacle'?18:type==='samara'?14:CREATURES[type].limit);
    assert.equal(g.s.phase,'map');assert.throws(()=>g.upgrade(e.id));
  }
});

test('free swaps and storage retain the exact instance damage, tokens, charge and upgrade',()=>{
  const g=atNode('normal'),a=g.s.entities[0],b=g.s.entities[1];Object.assign(a,{c:7,p:1,upgraded:true,uses:3});
  g.place(a.id,b.floor);assert.equal(a.floor,3);assert.equal(b.floor,1);g.store(a.id);g.place(a.id,2);
  assert.deepEqual([a.c,a.p,a.upgraded,a.uses],[7,1,true,3]);
});

test('gaze supplies pass 3 or 4 and arrival 1, never both',()=>{
  for(const upgraded of [false,true])for(const value of [1,2]){
    const g=combat(),[e]=layout(g,[['gaze',1]]);e.upgraded=upgraded;step(g,value);
    assert.equal(g.s.visitor.a,value===1?1:upgraded?4:3);
  }
});

test('footsteps doubles current anxiety beyond twenty, clamps at ninety-nine and cannot generate from zero',()=>{
  for(const [initial,value,expected] of [[0,2,0],[7,2,14],[13,2,26],[20,2,40],[49,2,98],[50,2,99],[99,2,99],[99,1,99],[13,1,13]]){
    const g=combat();layout(g,[['footsteps',1]]);g.s.visitor.a=initial;step(g,value);assert.equal(g.s.visitor.a,expected);
  }
});

test('owner consumes rounded-up half and gives one or two fear per anxiety without refund',()=>{
  for(const upgraded of [false,true])for(const anxiety of [0,1,2,3,19,20,98,99]){
    const g=combat(),[e]=layout(g,[['owner',1]]);e.upgraded=upgraded;g.s.visitor.a=anxiety;dice(g,1);
    const before=clone(g.s),p=g.preview(0),spent=Math.ceil(anxiety/2);assert.deepEqual(g.s,before);
    assert.equal(p.summary.fear,spent*(upgraded?2:1));g.choose(0);g.move();
    assert.equal(g.s.visitor.a,anxiety-spent);assert.equal(g.s.visitor.f,spent*(upgraded?2:1));
  }
});

test('one enormous fear effect removes one heart, discards overflow, and death cancels movement and retaliation',()=>{
  const g=combat(),[e]=layout(g,[['owner',1]]);e.upgraded=true;Object.assign(g.s.visitor,{a:20,t:4,h:2,pattern:'none'});step(g,1);
  assert.equal(g.s.visitor.h,1);assert.equal(g.s.visitor.f,0);
  Object.assign(g.s.visitor,{pos:0,a:20,t:4,h:1,pattern:'double'});dice(g,1);const p=g.preview(0);
  assert.equal(p.summary.killed,true);assert.equal(p.attacks.length,0);g.choose(0);const ev=g.move();assert.ok(ev.some(e=>e.kind==='kill'));assert.ok(!ev.some(e=>e.kind==='hit'));
});

test('mouse repairs itself or another damaged creature, costs anxiety and preserves tokens',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[e]=layout(g,[['mouse',1]]);Object.assign(e,{upgraded,c:11,p:1});g.s.visitor.a=2;dice(g,1);
    const before=clone(g.s);assert.throws(()=>g.active(e.id,e.id));assert.deepEqual(g.s,before);g.choose(0);g.active(e.id,e.id);
    assert.deepEqual([e.c,e.p,g.s.visitor.a],[upgraded?1:5,1,0]);
    const after=clone(g.s);assert.throws(()=>g.active(e.id,e.id));assert.deepEqual(g.s,after);
  }
});

test('portrait increases the chosen distance for cost 4 or 3, without replaying selection effects',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[e]=layout(g,[['portrait',1]]);e.upgraded=upgraded;Object.assign(g.s.visitor,{a:8,prophecy:5});prepare(g,3,'anxiety');
    const f=g.s.visitor.f,p=g.s.visitor.prophecy;g.active(e.id);assert.equal(g.s.chosen,4);assert.equal(g.s.visitor.a,9-(upgraded?3:4));assert.equal(g.s.visitor.f,f);assert.equal(g.s.visitor.prophecy,p);
  }
});

test('safe lure changes actual route and destination, and each positive surviving hit produces greed',()=>{
  const g=combat(),[s]=layout(g,[['safe',2],['runes',5]]);g.s.visitor.pattern='double';prepare(g,6);g.active(s.id);
  const before=clone(g.s),p=g.preview();assert.deepEqual(g.s,before);assert.deepEqual(p.path,[1,2]);assert.equal(p.attacks[0].floor,2);
  g.move();assert.equal(s.c,12);assert.equal(s.p,2);assert.equal(g.s.visitor.greed,3);
});

test('fully absorbed or lethal hits do not produce safe greed; seal does not block its passive',()=>{
  const g=combat(),[s,q]=layout(g,[['safe',1],['owner',2]]);s.shield=6;g._damage(s,6);assert.equal(g.s.visitor.greed,0);
  s.seal=3;g._damage(s,1);assert.equal(g.s.visitor.greed,1);
  g.s.visitor.greed=0;s.p=1;s.c=19;g._damage(s,1);assert.equal(g.s.visitor.greed,0);assert.ok(!g.s.entities.includes(s));assert.ok(g.s.entities.includes(q));
});

test('fire blocks safe arrival income, seal blocks lure, and toggle is not activity',()=>{
  const g=combat(),[s]=layout(g,[['safe',2]]);s.lure=true;s.fire=2;prepare(g,6);g.move();assert.equal(g.s.visitor.greed,0);assert.equal(s.fire,1);
  s.seal=2;g.s.visitor.pos=0;prepare(g,6);assert.equal(g.preview().path.length,6);g.move();assert.equal(s.lure,true);assert.equal(s.seal,1);
  s.seal=0;prepare(g,1);g.s.activity=false;g.active(s.id);assert.equal(g.s.activity,false);
});

test('nepenthes gives self defense and redirects damage before original-target defense',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[q,n]=layout(g,[['owner',3],['nepenthes',4]]);n.upgraded=upgraded;q.shield=50;g.s.visitor.greed=1;g.s.visitor.pattern='double';prepare(g,3);g.active(n.id,q.id);
    assert.equal(n.shield,upgraded?8:4);const p=g.preview();assert.equal(p.attacks.length,2);assert.ok(p.attacks.every(e=>e.redirected));assert.equal(p.attacks[0].before.shield,upgraded?8:4);
    g.move();assert.equal(q.c,0);assert.equal(n.c,upgraded?4:8);assert.equal(q.shield,0);
  }
});

test('self protection is legal, while guard cycles fail without paying and reassignment replaces the prior target',()=>{
  const g=combat(),[a,b,q]=layout(g,[['nepenthes',1],['nepenthes',2],['owner',3]]);g.s.visitor.greed=2;prepare(g,1);g.active(a.id,a.id);assert.equal(a.shield,4);
  g.s.visitor.greed=2;g.active(b.id,a.id);const before=clone(g.s);assert.throws(()=>g.active(a.id,b.id),/고리/);assert.deepEqual(g.s,before);
  g.active(b.id,q.id);assert.equal(g.s.guards[q.id],b.id);assert.equal(g.s.guards[a.id],undefined);
});

test('a destroyed guard stops taking later hits in the same retaliation',()=>{
  const g=combat(),[q,n]=layout(g,[['owner',3],['nepenthes',4]]);n.c=13;n.p=1;g.s.visitor.greed=1;g.s.visitor.pattern='double';prepare(g,3);g.active(n.id,q.id);g.move();
  assert.ok(!g.s.entities.includes(n));assert.equal(q.c,6);assert.equal(q.p,2);
});

test('barnacle shields all actual passed floors after movement and excludes the actual destination',()=>{
  const g=combat(),[a,b,q,s]=layout(g,[['gaze',1],['barnacle',2],['owner',3],['safe',4]]);s.lure=true;prepare(g,6);
  const p=g.preview(),shields=p.events.filter(e=>e.kind==='shield');assert.deepEqual(p.path,[1,2,3,4]);
  assert.deepEqual(shields.map(e=>e.targetId).sort(),[a.id,b.id,q.id].sort());assert.ok(shields.every(e=>e.amount===2));
  assert.ok(p.events.findIndex(e=>e.kind==='shield')>p.events.map(e=>e.kind).lastIndexOf('move'));
});

test('barnacle passes stack per activation but a repeated recipient floor receives each activation only once',()=>{
  const g=combat(),[a,b,q]=layout(g,[['barnacle',1],['barnacle',2],['owner',3]]);prepare(g,8,'long');
  const p=g.preview(),shields=p.events.filter(e=>e.kind==='shield');
  assert.equal(p.summary.destination,2);assert.ok(!shields.some(e=>e.targetId===b.id));
  assert.equal(shields.filter(e=>e.targetId===a.id).reduce((n,e)=>n+e.amount,0),6);
  assert.equal(shields.filter(e=>e.targetId===q.id).reduce((n,e)=>n+e.amount,0),6);
});

test('barnacle charge requires real surviving damage, grows beyond twenty, caps at ninety-nine and spends one per use',()=>{
  const g=combat(),[b,q]=layout(g,[['barnacle',1],['owner',2]]);assert.equal(b.uses,0);b.shield=6;g._damage(b,6);assert.equal(b.uses,0);g._damage(b,1);assert.equal(b.uses,1);
  b.uses=20;g._damage(b,1);assert.equal(b.uses,21);b.uses=98;g._damage(b,1);assert.equal(b.uses,99);
  g._damage(b,1);assert.equal(b.uses,99);assert.equal(g.events.at(-1).amount,0);
  g.s.visitor.greed=1;prepare(g,3);g.active(b.id);assert.equal(b.uses,98);assert.equal(g.s.visitor.greed,0);
  const p=g.preview();assert.ok(p.events.filter(e=>e.kind==='shield').every(e=>e.amount===4));g.move();
  g.s.visitor.pos=0;prepare(g,3);assert.ok(g.preview().events.filter(e=>e.kind==='shield').every(e=>e.amount===2));
  b.p=1;b.c=13;b.uses=0;g._damage(b,1);assert.equal(b.uses,0);assert.ok(g.s.entities.includes(q));
});

test('collector pays one speed charge and two greed to repair sixteen then apply seal, including self',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[c,q]=layout(g,[['collector',2],['safe',1]]);c.upgraded=upgraded;q.c=19;g.s.visitor.greed=2;prepare(g,1);g.active(c.id,q.id);
    assert.deepEqual([c.uses,g.s.visitor.greed,q.c,q.seal],[0,0,3,upgraded?2:3]);g.move();assert.equal(q.seal,upgraded?1:2);
    c.uses=1;c.c=10;g.s.visitor.greed=2;prepare(g,1);g.active(c.id,c.id);assert.equal(c.c,0);assert.equal(c.seal,upgraded?2:3);assert.throws(()=>g.active(c.id,q.id));
  }
});

test('state caps and invalid targets never permit overpayment or partial failed actions',()=>{
  const g=combat(),[c,q]=layout(g,[['collector',1],['owner',2]]);q.c=11;q.seal=98;g.s.visitor.greed=2;prepare(g,1);g.active(c.id,q.id);assert.equal(q.seal,99);
  c.uses=1;g.s.visitor.greed=1;const before=clone(g.s);assert.throws(()=>g.active(c.id,q.id));assert.deepEqual(g.s,before);
  g._resource('a',100,'diagnostic');g._resource('greed',100,'diagnostic');g._resource('prophecy',100,'diagnostic');assert.deepEqual([g.s.visitor.a,g.s.visitor.greed,g.s.visitor.prophecy],[99,99,99]);
});

test('real supply effects treat twenty as ordinary and clamp excess at ninety-nine with matching previews',()=>{
  const cases=[
    ['gaze','a',2,[[20,23],[98,99],[99,99]]],
    ['safe','greed',1,[[20,21],[98,99],[99,99]]],
    // Choosing one spends one prophecy first; arrival then supplies two.
    ['runes','prophecy',1,[[20,21],[98,99],[99,99]]]
  ];
  for(const [type,resource,value,amounts] of cases)for(const [initial,expected] of amounts){
    const g=combat();layout(g,[[type,1]]);g.s.visitor[resource]=initial;dice(g,value);
    const before=clone(g.s),p=g.preview(0);assert.deepEqual(g.s,before);
    assert.equal(p.state.visitor[resource],expected,`${resource}: ${initial}`);
    g.choose(0);g.move();assert.deepEqual(g.s.visitor,p.state.visitor);
    if(initial===99){
      const gain=p.events.find(e=>e.resource===resource&&['resource','anxiety'].includes(e.kind));
      assert.ok(gain.wasted>0,'attempted over-cap income is discarded');
      assert.equal(gain.after,99);
    }
  }
});

test('large balances preserve active costs, charge spending and seal saturation in preview and actual resolution',()=>{
  const g=combat(),[mouse,guard,collector,samara,owner,barnacle]=layout(g,[['mouse',1],['nepenthes',2],['collector',3],['samara',4],['owner',5],['barnacle',6]]);
  Object.assign(g.s.visitor,{a:99,greed:99,prophecy:99});Object.assign(owner,{c:11,seal:98});collector.uses=99;barnacle.uses=99;dice(g,6);
  const actions=[
    {kind:'active',entityId:mouse.id,targetId:owner.id},
    {kind:'active',entityId:guard.id,targetId:owner.id},
    {kind:'active',entityId:collector.id,targetId:owner.id},
    {kind:'active',entityId:samara.id},
    {kind:'active',entityId:barnacle.id}
  ];
  const before=clone(g.s),p=g.preview(0,actions);assert.deepEqual(g.s,before);
  g.choose(0);for(const action of actions)g.active(action.entityId,action.targetId);g.move();
  assert.deepEqual(g.s.visitor,p.state.visitor);assert.deepEqual(g.s.entities,p.state.entities);
  assert.deepEqual([g.s.visitor.a,g.s.visitor.greed,g.s.visitor.prophecy],[97,95,96]);
  assert.deepEqual([collector.uses,barnacle.uses,owner.c,owner.seal],[98,98,0,98]);
  assert.equal(p.events.find(e=>e.kind==='status'&&e.targetId===owner.id).after,99);
  assert.equal(p.summary.destination,5);assert.equal(p.summary.fear,6);
});

test('seal and fire accept twenty, clamp a hundred-token application and decay once from the new maximum',()=>{
  // Fire has no normal-play source in this catalogue; use the explicit diagnostic API.
  for(const status of ['seal','fire'])for(const [applied,expected] of [[20,20],[99,99],[100,99]]){
    const g=combat(),[e]=layout(g,[['gaze',1]]);g.diagnoseStatus(e.id,status,applied);
    assert.equal(e[status],expected);
    if(expected===99){g.diagnoseStatus(e.id,status,1);assert.equal(e[status],99);assert.equal(g.events.find(event=>event.kind==='status').amount,0);}
    dice(g,1);const before=clone(g.s),p=g.preview(0);assert.deepEqual(g.s,before);
    assert.equal(p.state.entities[0][status],expected-1);g.choose(0);g.move();
    assert.deepEqual(g.s.entities,p.state.entities);assert.equal(g.s.visitor.a,0);
  }
});

test('prophecy triggers only on a real selected eye with strict greater-than, and no end-turn automatic damage remains',()=>{
  for(const [amount,value,fear,left] of [[0,1,0,0],[3,3,0,3],[4,3,3,3],[10,6,6,9],[20,6,6,19],[99,6,6,98]]){
    const g=combat();layout(g,[['safe',6]]);g.s.visitor.prophecy=amount;dice(g,value);const before=clone(g.s),p=g.preview(0);assert.deepEqual(g.s,before);assert.equal(p.summary.fear,fear);
    g.choose(0);assert.equal(g.s.visitor.f,fear);assert.equal(g.s.visitor.prophecy,left);g.move();assert.equal(g.s.visitor.f,fear);
  }
});

test('choice-time prophecy kill settles immediately and its preview has no path or attacks',()=>{
  const g=combat();layout(g,[['owner',1]]);Object.assign(g.s.visitor,{t:1,h:1,prophecy:3,pattern:'double'});dice(g,1);
  const p=g.preview(0);assert.equal(p.summary.killed,true);assert.deepEqual(p.path,[]);assert.deepEqual(p.attacks,[]);
  g.choose(0);assert.equal(g.s.phase,'roll');assert.equal(g.s.guestIndex,1);assert.equal(g.s.stats.kills,1);assert.equal(g.s.visitor.prophecy,0);
});

test('runes and roulette supply final-eye-dependent prophecy 1 on pass and 2/3 on arrival',()=>{
  for(const upgraded of [false,true])for(const [type,value,arrival,expected] of [['runes',2,true,2],['runes',4,true,0],['roulette',2,true,2],['roulette',3,true,0],['runes',2,false,1],['roulette',2,false,1]]){
    const g=combat(),[e]=layout(g,[[type,arrival?value:1]]);e.upgraded=upgraded;step(g,value);assert.equal(g.s.visitor.prophecy,expected+(upgraded&&arrival&&expected?1:0));assert.equal(g.s.visitor.f,0);
  }
});

test('samara costs two and changes final supply conditions, cannot go below one, and never retriggers prophecy',()=>{
  const g=combat(),[s,w]=layout(g,[['samara',1],['runes',3]]);g.s.visitor.prophecy=4;prepare(g,4);const f=g.s.visitor.f;g.active(s.id);assert.equal(g.s.chosen,3);assert.equal(g.s.visitor.prophecy,2);assert.equal(g.s.visitor.f,f);g.move();assert.equal(g.s.visitor.prophecy,4);
  g.s.visitor.prophecy=10;prepare(g,1);const before=clone(g.s);assert.throws(()=>g.active(s.id));assert.deepEqual(g.s,before);
});

test('prophet rerolls all three immediately, refunds the smallest new face only before upgrade and retains the turn',()=>{
  for(const upgraded of [false,true]){
    const g=combat(),[e,q]=layout(g,[['prophet',1],['owner',2]]);e.upgraded=upgraded;g.s.visitor.prophecy=4;prepare(g,6);q.shield=5;q.seal=3;
    const old=g.s.dice.map(d=>d.value);g.active(e.id);assert.equal(g.s.phase,'choose');assert.equal(g.s.dice.length,3);assert.equal(g.s.visitor.turn,1);assert.equal(g.s.visitor.rollIndex,1);assert.equal(q.shield,5);assert.equal(q.seal,3);
    assert.equal(g.s.visitor.prophecy,upgraded?3:Math.min(...g.s.dice.map(d=>d.value)));assert.notDeepEqual(g.s.dice.map(d=>d.value),old);
    assert.throws(()=>g.active(e.id));
  }
});

test('reroll preview never exposes hidden new faces or refund, is stable, and does not mutate state or RNG',()=>{
  const g=combat(),[e]=layout(g,[['prophet',1]]);g.s.visitor.prophecy=4;prepare(g,6);const before=clone(g.s);
  for(let i=0;i<30;i++){const p=g.preview(undefined,[{kind:'active',entityId:e.id}]);assert.equal(p.requiresRoll,true);assert.deepEqual(p.path,[]);assert.deepEqual(p.state.dice,[]);assert.ok(!p.events.some(e=>e.kind==='roll'));}
  assert.deepEqual(g.s,before);const twin=g.clone();g.active(e.id);twin.active(e.id);assert.deepEqual(g.s.dice,twin.s.dice);
});

test('each new reroll selection can trigger choice effects again; simple distance edits cannot',()=>{
  const g=combat(),[p,s]=layout(g,[['prophet',1],['samara',2]]);p.upgraded=true;g.s.visitor.prophecy=10;prepare(g,3,'anxiety');assert.equal(g.s.visitor.a,1);assert.equal(g.s.visitor.f,3);
  g.active(p.id);assert.equal(g.s.visitor.prophecy,8);g.s.dice[0]={slot:0,type:'anxiety',face:2,value:3};g.choose(0);assert.equal(g.s.visitor.a,2);assert.equal(g.s.visitor.f,6);assert.equal(g.s.visitor.prophecy,7);
  g.active(s.id);assert.equal(g.s.chosen,2);assert.equal(g.s.visitor.f,6);assert.equal(g.s.visitor.a,2);
});

test('seal blocks pass, arrival and speed; fire blocks only arrival, both decay once per actual turn',()=>{
  for(const status of ['seal','fire'])for(const value of [1,2]){
    const g=combat(),[e]=layout(g,[['gaze',1]]);e[status]=2;step(g,value);assert.equal(g.s.visitor.a,status==='fire'&&value===2?3:0);assert.equal(e[status],1);
  }
  const g=combat(),[m]=layout(g,[['mouse',1]]);m.fire=2;m.c=7;g.s.visitor.a=2;prepare(g,1);g.active(m.id,m.id);assert.equal(m.c,1);
});

test('same combat guest boundary clears resources and debuffs but keeps speed charges, lure and damaged tokens',()=>{
  const g=combat(),[b,s]=layout(g,[['barnacle',1],['safe',2]]);Object.assign(b,{p:1,c:7,uses:99,seal:99,fire:99});s.lure=true;
  Object.assign(g.s.visitor,{t:1,h:1,prophecy:99,a:99,greed:99});prepare(g,1);
  assert.equal(g.s.guestIndex,1);assert.deepEqual([g.s.visitor.a,g.s.visitor.greed,g.s.visitor.prophecy],[0,0,0]);assert.deepEqual([b.p,b.c,b.uses,b.seal,b.fire],[1,0,99,0,0]);assert.equal(s.lure,true);
});

test('individual durability controls overflow, destruction, reserve cannot prevent deployed wipeout',()=>{
  for(const type of ['portrait','gaze','nepenthes','safe']){
    const g=combat(),[e]=layout(g,[[type,1]]);const d=creatureDef(e);e.c=d.limit-1;g._damage(e,50);assert.equal(e.p,1);assert.equal(e.c,0);g._add('owner');g._damage(e,50);assert.equal(g.s.phase,'lost');assert.equal(g.s.entities.length,1);
  }
});

test('inactivity uses fixed twelve damage and per-creature limits, not unconditional token removal',()=>{
  const g=combat(),[s]=layout(g,[['safe',6]]);g.s.inactive=2;prepare(g,1);g.active(s.id);const p=g.preview();assert.equal(p.uncertainty[0].p,2);assert.equal(p.uncertainty[0].c,12);
  assert.equal(p.uncertainty[0].nextInactiveLimit,3);
  g.move();assert.equal(s.p,2);assert.equal(s.c,12);assert.equal(g.s.inactiveLimit,3);assert.equal(g.s.visitor.greed,1);
});

test('a penalty hit at the greed cap does not reset inactivity through a zero resource gain',()=>{
  const g=combat(),[s]=layout(g,[['safe',6]]);g.s.visitor.greed=99;g.s.inactive=2;prepare(g,1);
  const p=g.preview();assert.equal(p.uncertainty[0].nextInactiveLimit,2);
  g.move();assert.equal(s.c,12);assert.equal(g.s.visitor.greed,99);assert.equal(g.s.inactiveLimit,2);
});

test('shop stock uses all thirteen types across seeds, purchase and expansion occur once',()=>{
  const offered=new Set();for(let seed=31001;seed<31030;seed++){const g=atNode('shop',1,seed);for(const x of g.view().node.contents.stock)offered.add(x.type);}
  assert.equal(offered.size,13);const g=atNode('shop');g.s.money=40;const slot=g.view().node.contents.stock[0];const price=CREATURES[slot.type].price;g.buy(slot.slot);assert.equal(g.s.money,40-price);assert.equal(g.s.entities.at(-1).floor,null);assert.equal(g.s.entities.at(-1).upgraded,false);
  const before=clone(g.s);assert.throws(()=>g.buy(slot.slot));assert.deepEqual(g.s,before);for(let i=0;i<4;i++)g.expand();assert.equal(g.s.floorCount,10);assert.equal(g.s.money,12-price);assert.throws(()=>g.expand());
});

test('recovery budget includes reserve, caps per individual max, and is exclusive with upgrade',()=>{
  const g=atNode('recovery'),a=g.s.entities[0],b=g.s.entities[1];a.p=1;b.p=1;g.store(b.id);const before=clone(g.s);
  assert.throws(()=>g.recover({[a.id]:2,[b.id]:1}));assert.deepEqual(g.s,before);g.recover({[a.id]:1,[b.id]:1});assert.equal(a.p,2);assert.equal(b.p,2);assert.equal(g.s.stats.healedTokens,2);assert.throws(()=>g.upgrade(a.id));
});

test('mandatory creature rewards have three distinct basic types and elite alone adds optional die',()=>{
  for(const kind of ['normal','elite','boss']){
    const g=atNode(kind);finish(g);assert.equal(g.s.reward.creatures.length,3);assert.equal(new Set(g.s.reward.creatures).size,3);const before=clone(g.s);assert.throws(()=>g.claimCreature(3));assert.deepEqual(g.s,before);
    g.claimCreature(0);const e=g.s.entities.at(-1);assert.equal(e.upgraded,false);assert.equal(e.floor,null);assert.equal(e.p,creatureDef(e).maxP);
    if(kind==='elite'){assert.equal(g.s.phase,'die_reward');g.skipDie();assert.equal(g.s.phase,'map');}else assert.equal(g.s.phase,'map');
  }
});

test('both act transitions restore every surviving deployed or stored instance only after mandatory reward',()=>{
  for(const act of [1,2]){
    const g=atNode('boss',act),a=g.s.entities[0],b=g.s.entities[1],dead=g._add('portrait',2);a.p=1;b.p=1;g.store(b.id);g.s.entities=g.s.entities.filter(e=>e.id!==dead.id);finish(g);
    a.c=6;a.uses=2;a.upgraded=true;const money=g.s.money,history=g.s.history.length;assert.equal(a.p,1);g.claimCreature(0);
    assert.equal(g.s.act,act+1);assert.equal(a.p,creatureDef(a).maxP);assert.equal(b.p,creatureDef(b).maxP);assert.equal(a.c,6);assert.equal(a.uses,2);assert.equal(g.s.money,money);assert.ok(!g.s.entities.some(e=>e.id===dead.id));
    assert.equal(g.s.history.slice(history).filter(e=>e.kind==='act_start').length,1);assert.equal(g.s.stats.healedTokens,0);
  }
});

test('new combat preparation resets charge and status once but retains same-act token loss',()=>{
  const g=atNode('normal');finish(g);g.claimCreature(0);const a=g.s.entities[0],b=g._add('barnacle'),c=g._add('collector');a.p=1;a.c=6;a.lure=true;a.seal=99;a.fire=99;b.uses=99;c.uses=99;
  const next=g.availableNodes().find(n=>n.kind==='normal');g.visit(next.id);assert.equal(a.p,1);assert.equal(a.c,0);assert.equal(a.seal,0);assert.equal(a.fire,0);assert.equal(a.lure,false);assert.equal(b.uses,0);assert.equal(c.uses,1);
  a.c=5;b.uses=2;g.startService();assert.equal(a.c,5);assert.equal(b.uses,2);
});

test('final boss kill locks victory, final reward ends the run and never refills surviving tokens',()=>{
  const g=atNode('boss',3),a=g.s.entities[0];a.p=1;finish(g);assert.equal(g.s.finalVictory,true);assert.throws(()=>g.giveUp());assert.equal(a.p,1);g.claimCreature(0);assert.equal(g.s.phase,'won');assert.equal(a.p,1);assert.equal(g.s.act,3);assert.ok(!g.events.some(e=>e.kind==='act_start'));
  const fresh=new Game(g.s.seed);assert.equal(fresh.s.phase,'map');assert.equal(fresh.s.act,1);assert.equal(fresh.s.money,4);assert.equal(fresh.s.entities.length,4);
});

test('escape stops after contact, keeps only earned currency, and every boss escape loses',()=>{
  for(const kind of ['normal','elite','boss']){
    const g=combat(kind);layout(g,[['safe',6]]);prepare(g,3);g.installEscape(1);const money=g.s.money,p=g.preview();assert.deepEqual(p.path,[1]);assert.equal(p.attacks.length,0);g.move();assert.equal(g.s.money,money);assert.equal(g.s.phase,kind==='boss'?'lost':'map');assert.equal(g.s.reward,null);
  }
});

test('expansion comparison is hypothetical and leaves actual layout, resources, offers and RNG untouched',()=>{
  const g=atNode('shop'),before=clone(g.s);const p=g.expansionPreview({position:5,slot:0,face:1,anxiety:9,greed:1,prophecy:5});assert.equal(p.before.floorCount,6);assert.equal(p.after.floorCount,7);assert.deepEqual(g.s,before);assert.equal(p.cost,4);
  for(const amount of [20,99]){
    const high=g.expansionPreview({position:5,slot:0,face:1,anxiety:amount,greed:amount,prophecy:amount});
    assert.equal(high.after.state.visitor.a,amount);assert.equal(high.after.state.visitor.greed,amount);assert.equal(high.after.state.visitor.prophecy,amount-1);
  }
  for(const key of ['anxiety','greed','prophecy'])assert.throws(()=>g.expansionPreview({[key]:100}));
  assert.deepEqual(g.s,before);
});
