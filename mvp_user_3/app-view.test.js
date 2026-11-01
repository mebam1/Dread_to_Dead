import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game,CREATURES,DICE,creatureDef,creatureName,UPGRADE_TEXT,NODE_TYPES} from './engine.js';

// Offline HTML/action contract checks. These do not claim browser layout, focus,
// accessibility-tree, animation timing, or real mouse/touch coverage.
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
function harness(){
  const handlers={},nodes=new Map(),timers=new Map(),errors=[],scrollRequests=[];let timerId=0;
  const classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
  const element=()=>({innerHTML:'',textContent:'',hidden:true,style:{},dataset:{},offsetHeight:100,scrollHeight:1000,clientHeight:500,scrollTop:0,scrollLeft:0,classList:classes(),setAttribute(){},removeAttribute(){},focus(){},remove(){},append(){},click(){},scrollTo(o){scrollRequests.push({selector:this.testSelector,method:'scrollTo',options:o});this.scrollTop=o.top??this.scrollTop;},scrollIntoView(){scrollRequests.push({selector:this.testSelector,method:'scrollIntoView'});},querySelector(){return null;},querySelectorAll(){return [];},contains(other){return other===this;},closest(){return null;},matches(){return false;},getBoundingClientRect(){return {top:20,left:10,right:310,bottom:120,width:300,height:100};}});
  for(const key of ['#app','#tooltip','#modal-root'])nodes.set(key,element());
  const document={activeElement:null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],createElement:element,body:{classList:classes(),append(node){nodes.set('.toast',node);}},addEventListener(name,fn){handlers[name]=fn;}};
  const saved=new Map([['dread-user3-options',JSON.stringify({tutorial:false,speed:'fast'})]]);
  const context=vm.createContext({Game,CREATURES,DICE,creatureDef,creatureName,UPGRADE_TEXT,NODE_TYPES,document,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},crypto:{getRandomValues(a){a[0]=31001;return a;}},Uint32Array,structuredClone,innerWidth:1280,innerHeight:720,requestAnimationFrame(){},cancelAnimationFrame(){},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},setInterval(){return 1;},clearInterval(){},addEventListener(){},console:{...console,error:error=>errors.push(error.message)}});
  vm.runInContext(source,context,{filename:'app.js'});
  vm.runInContext('animationEnabled=false',context);
  return {run:code=>vm.runInContext(code,context),action:name=>vm.runInContext(`action(${JSON.stringify(name)})`,context),html:()=>nodes.get('#app').innerHTML,modalHtml:()=>nodes.get('#modal-root').innerHTML,saved,handlers,errors,scrollRequests,node(selector){if(!nodes.has(selector))nodes.set(selector,{...element(),testSelector:selector});return nodes.get(selector);},flushTimers(){const jobs=[...timers.values()];timers.clear();for(const fn of jobs)fn();}};
}
function fixture(v,kind='normal',act=1,depth=null){
  v.run(`game=new Game(31001);onTitle=false;game.s.act=${act};(()=>{const n=game.s.maps[${act-1}].find(n=>n.kind===${JSON.stringify(kind)}&&(${depth}==null||n.depth===${depth}));game.s.completed[${act-1}]=n.depth-1;game.s.lastNodes[${act-1}]=n.depth===1?null:'a${act}-d'+(n.depth-1)+'-c1';game.s.stats.visits=${(act-1)*8}+n.depth-1;game.visit(n.id);})();newDrafts();modal=null;render();`);
}
async function prepare(v){await v.action('start');await v.action('roll');await v.action('die:0');await v.action('choose');}
const snapshot=v=>v.run('JSON.stringify(game.s)');
function rewardFixture(v,kind='normal',act=1){
  fixture(v,kind,act);v.run(`for(const guest of game._node().guests)Object.assign(guest,{t:3,h:1,pattern:'none'});game.startService();game.s.entities.find(e=>e.type==='B').uses=5;while(game.s.phase==='roll'){game.roll();game.choose(0);game.active(game.s.entities.find(e=>e.type==='B').id);}render();`);
}
function key(v,key){v.handlers.keydown({key,target:{tagName:'BODY',closest(){return null;}},preventDefault(){}});}
function floorControl(v,f){
  const el=v.node(`[data-floor="${f}"]`),id=v.run(`at(${f})?.id`);el.dataset={floor:String(f),...(id?{entity:id}:{})};
  el.closest=selector=>selector.includes('[data-floor]')||id&&selector==='[data-entity]'?el:null;
  el.matches=selector=>selector==='[data-floor]';return el;
}
const floorNumbers=html=>[...html.matchAll(/data-floor="(\d+)"/g)].map(match=>Number(match[1]));

test('offline title starts the specified default seed and a twenty-node map',async()=>{
  const v=harness();assert.match(v.html(),/새 모험 시작/);assert.match(v.html(),/31001/);
  await v.action('new');assert.equal(v.run('game.s.seed'),31001);assert.equal(v.run('game.s.phase'),'map');
  assert.equal((v.html().match(/data-node=/g)||[]).length,20);assert.match(v.html(),/영혼/);
  assert.doesNotMatch(v.html(),/블러드 웹|리셋권|공포 재화/);
});

test('node review changes no game state; visit locks preparation and reveals all three guests',async()=>{
  const v=harness();await v.action('new');const before=snapshot(v);
  for(let i=0;i<100;i++)await v.action('node:a1-d1-c1');
  assert.equal(snapshot(v),before);assert.equal(v.run('selectedNode'),'a1-d1-c1');
  await v.action('visit');assert.equal(v.run('game.s.phase'),'management');
  assert.match(v.html(),/영업 시작/);assert.equal((v.html().match(/class="guest-thumb"/g)||[]).length,3);
  assert.match(v.html(),/파훼 토큰과 강화는 현재 상태를 표시/);assert.match(v.html(),/토큰은 새 막 시작 시 최대치로 복구/);assert.doesNotMatch(v.html(),/data-action="buy:|data-action="expand"|recovermode:/);
  const after=snapshot(v);await v.action('node:a1-d1-c0');await v.action('visit');assert.equal(snapshot(v),after);
});

test('hotel modal permits map placement and preserves a damaged upgraded instance',async()=>{
  const v=harness();await v.action('new');v.run("Object.assign(game.s.entities[0],{p:1,c:7,upgraded:true});game.store('e1');render()");
  await v.action('hotel');assert.match(v.modalHtml(),/문틈의 속삭임\+/);assert.match(v.modalHtml(),/배치하기/);
  await v.action('place:e1');await v.action('floor:2');
  assert.equal(v.run("entity('e1').floor"),2);assert.equal(v.run("entity('e1').p"),1);assert.equal(v.run("entity('e1').c"),7);assert.equal(v.run("entity('e1').upgraded"),true);
});

test('preparation reopening its map and starting never heals tokens or reapplies restore',async()=>{
  const v=harness();fixture(v);v.run("Object.assign(entity('e1'),{p:1,c:7});entity('e4').uses=0;render()");
  const before=snapshot(v);await v.action('map');assert.match(v.modalHtml(),/현재 노드/);await v.action('closemodal');assert.equal(snapshot(v),before);
  await v.action('start');assert.equal(v.run("entity('e1').p"),1);assert.equal(v.run("entity('e1').c"),7);assert.equal(v.run("entity('e4').uses"),0);
  assert.match(v.html(),/영혼/);assert.match(v.html(),/공포/);assert.doesNotMatch(v.html(),/data-action="buy:/);
});

test('shop exposes eight separate products and expansion cancellation costs nothing',async()=>{
  const v=harness();fixture(v,'shop');assert.equal((v.html().match(/class="shop-item /g)||[]).length,8);
  const before=snapshot(v);await v.action('expand');assert.match(v.modalHtml(),/6 → 7층/);assert.match(v.modalHtml(),/영혼 4 사용/);
  await v.action('closemodal');assert.equal(snapshot(v),before);assert.equal(v.run('game.s.phase'),'shop');
  await v.action('expand');await v.action('expandconfirm');assert.equal(v.run('game.s.floorCount'),7);assert.equal(v.run('game.s.money'),0);assert.equal(v.run('game.s.phase'),'shop');
  assert.equal(v.run('game._node().contents.stock.length'),8);await v.action('leave');assert.equal(v.run('game.s.phase'),'map');
});

test('shop purchase yields one base stored card; repeated purchase is not charged again',async()=>{
  const v=harness();fixture(v,'shop');const slot=v.run('game._node().contents.stock.find(x=>CREATURES[x.type].price<=game.s.money).slot');
  await v.action('buy:'+slot);assert.equal(v.run('game.s.entities.length'),5);assert.equal(v.run('game.s.entities.at(-1).floor'),null);assert.equal(v.run('game.s.entities.at(-1).upgraded'),false);
  assert.match(v.html(),/품절/);assert.match(v.html(),/배치하기/);const before=snapshot(v);await v.action('buy:'+slot);assert.equal(snapshot(v),before);
});

test('recovery preview allocates globally, includes reserve, cancels cleanly, and locks hotel editing',async()=>{
  const v=harness();fixture(v,'recovery');v.run("entity('e1').p=1;entity('e2').p=1;game.store('e2');render()");const before=snapshot(v);
  await v.action('recovermode:heal');await v.action('healadd:e1');await v.action('healadd:e2');
  assert.match(v.html(),/전체 예산 2 · 배분 2 · 남음 0/);assert.match(v.html(),/보관 중/);assert.equal(snapshot(v),before);
  await v.action('hotel');assert.match(v.modalHtml(),/읽기 전용/);assert.doesNotMatch(v.modalHtml(),/data-action="place:/);await v.action('closemodal');
  await v.action('recovercancel');assert.equal(snapshot(v),before);assert.equal(v.run('recoveryDraft.mode'),null);
  await v.action('recovermode:heal');await v.action('healadd:e1');await v.action('healadd:e2');await v.action('recoverconfirm');
  assert.equal(v.run("entity('e1').p+entity('e2').p"),4);assert.equal(v.run('game.s.stats.healedTokens'),2);assert.equal(v.run('game.s.phase'),'map');
  const after=snapshot(v);await v.action('recoverconfirm');assert.equal(snapshot(v),after);
});

test('partial recovery discloses discarded budget and consumes the only recovery choice',async()=>{
  const v=harness();fixture(v,'recovery');v.run("entity('e1').p=1;render()");
  await v.action('recovermode:heal');await v.action('healadd:e1');assert.match(v.html(),/1개 회복 · 남은 1개 포기/);
  await v.action('recoverconfirm');assert.equal(v.run('game.s.stats.recoveryWasted'),1);assert.equal(v.run('game.s.stats.upgrades'),0);
  const after=snapshot(v);await v.action('upgradeconfirm');assert.equal(snapshot(v),after);
});

test('upgrade comparison is per instance, no refill, and committed names/effects use plus',async()=>{
  const v=harness();fixture(v,'recovery');v.run("Object.assign(entity('e4'),{uses:0,c:8});render()");const before=snapshot(v);
  await v.action('recovermode:upgrade');await v.action('upgradeselect:e4');assert.match(v.html(),/빈 프런트의 호출벨\+/);assert.match(v.html(),/현재 사용 0회 유지/);assert.equal(snapshot(v),before);
  await v.action('recovercancel');assert.equal(snapshot(v),before);
  await v.action('recovermode:upgrade');await v.action('upgradeselect:e4');await v.action('upgradeconfirm');
  assert.equal(v.run("entity('e4').uses"),0);assert.equal(v.run("entity('e4').c"),8);assert.equal(v.run("entity('e4').upgraded"),true);
  await v.action('info:e4');assert.match(v.modalHtml(),/빈 프런트의 호출벨\+/);assert.match(v.modalHtml(),/3회/);
});

test('full recovery and fully upgraded party can still skip common rest into the boss',async()=>{
  const v=harness();fixture(v,'recovery',1,7);v.run('for(const e of game.s.entities)e.upgraded=true;render()');
  assert.match(v.html(),/회복할 손실 토큰이 없습니다/);assert.match(v.html(),/강화할 미강화 개체가 없습니다/);
  await v.action('recoveryskip');assert.equal(v.run('game.s.stats.visits'),7);assert.deepEqual(Array.from(v.run('game.availableNodes().map(n=>n.kind)')),['boss']);
});

test('creature reward review and Escape never claim or skip the mandatory reward',async()=>{
  const v=harness();rewardFixture(v);const before=snapshot(v);
  assert.equal((v.html().match(/data-action="rewardselect:/g)||[]).length,3);assert.doesNotMatch(v.html(),/data-action="skip|data-action="buy:/);
  await v.action('rewardselect:1');assert.equal(snapshot(v),before);key(v,'Escape');assert.equal(v.run('rewardIndex'),null);assert.equal(snapshot(v),before);
  await v.action('hotel');assert.match(v.modalHtml(),/읽기 전용/);assert.doesNotMatch(v.modalHtml(),/data-action="place:/);await v.action('closemodal');
  await v.action('rewardselect:2');await v.action('rewardconfirm');assert.equal(v.run('game.s.phase'),'map');assert.equal(v.run('game.s.entities.length'),5);
  const after=snapshot(v);await v.action('rewardconfirm');assert.equal(snapshot(v),after);
});

test('elite creature selection automatically opens one die offer, and skipping retains prior rewards',async()=>{
  const v=harness();rewardFixture(v,'elite');await v.action('rewardselect:0');await v.action('rewardconfirm');
  assert.equal(v.run('game.s.phase'),'die_reward');assert.equal((v.html().match(/class="new-die-card"/g)||[]).length,1);
  assert.equal((v.html().match(/data-action="dieslot:/g)||[]).length,3);const money=v.run('game.s.money');
  await v.action('dieskip');assert.equal(v.run('game.s.entities.length'),5);assert.equal(v.run('game.s.money'),money);assert.equal(v.run('game.s.phase'),'map');
});

test('discovery replacement review changes neither money nor equipment before confirm',async()=>{
  const v=harness();fixture(v,'discovery');const before=snapshot(v),type=v.run('game._node().contents.die');
  await v.action('dieslot:0');await v.action('dieslot:2');assert.equal(snapshot(v),before);assert.match(v.html(),/기존 주사위는 폐기/);
  await v.action('hotel');assert.match(v.modalHtml(),/읽기 전용/);await v.action('closemodal');
  await v.action('dieconfirm');assert.equal(v.run('game.s.equipped[2]'),type);assert.equal(v.run('game.s.money'),4);assert.equal(v.run('game.s.equipped.length'),3);
});

test('luggage die comparison can be cancelled and then souls taken exactly once',async()=>{
  const v=harness();fixture(v,'event');v.run("game._node().contents={event:'luggage',die:'anxiety'};render()");const before=snapshot(v);
  await v.action('eventdie');await v.action('dieslot:1');await v.action('eventback');assert.equal(snapshot(v),before);
  await v.action('eventsouls');assert.equal(v.run('game.s.money'),8);assert.equal(v.run('game.s.equipped[1]'),'normal');
  const after=snapshot(v);await v.action('eventsouls');assert.equal(snapshot(v),after);
});

test('contract review shows permanent loss but cancellation removes nothing',async()=>{
  const v=harness();fixture(v,'event');v.run("game._node().contents={event:'contract'};entity('e1').upgraded=true;render()");const before=snapshot(v);
  await v.action('eventcontract');await v.action('eventtarget:e1');assert.match(v.html(),/강화도 함께 소멸/);assert.equal(snapshot(v),before);
  await v.action('eventback');assert.equal(snapshot(v),before);
  await v.action('eventcontract');await v.action('eventtarget:e1');await v.action('eventconfirm');assert.equal(v.run("entity('e1')"),undefined);assert.equal(v.run('game.s.money'),8);
});

test('same-value dice expose distinct chosen effects and reviewing applies no bonus',async()=>{
  const v=harness();fixture(v);await v.action('start');v.run("game.s.equipped=['normal','anxiety','even'];game.s.phase='choose';game.s.dice=[{slot:0,type:'normal',face:2,value:3,bonus:0},{slot:1,type:'anxiety',face:2,value:3,bonus:1},{slot:2,type:'even',face:0,value:2,bonus:0}];Object.assign(game.s.visitor,{t:12,h:1,pattern:'none'});render()");
  const before=snapshot(v);await v.action('die:0');assert.match(v.run('previewPanel(currentPreview())'),/공포 \+8/);await v.action('die:1');assert.match(v.run('previewPanel(currentPreview())'),/공포 \+12/);assert.match(v.run('previewPanel(currentPreview())'),/심장 1개 제거/);assert.equal(snapshot(v),before);
  await v.action('choose');assert.equal(v.run('game.s.visitor.a'),1);assert.match(v.html(),/선택 효과 적용 완료/);v.run('render()');assert.equal(v.run('game.s.visitor.a'),1);
});

test('guard target review and cancel spend nothing; a confirmed hotel floor spends once',async()=>{
  const v=harness();fixture(v);v.run("game._add('G',2)");await prepare(v);const id=v.run("game.s.entities.find(e=>e.type==='G').id");
  await v.action('active:'+id);assert.equal(v.run('selection.kind'),'G');assert.equal(v.run(`entity('${id}').uses`),2);
  const before=snapshot(v);await v.action('cancel');assert.equal(snapshot(v),before);
  await v.action('floor:2');await v.action('floor:3');assert.equal(v.run(`entity('${id}').uses`),1);assert.equal(v.run('at(3).shield'),6);assert.equal(v.run('selection'),null);
});

test('lethal direct use automatically enters the next guest and clears pending target without an advance button',async()=>{
  const v=harness();fixture(v);v.run("game._add('G',2)");await prepare(v);v.run('game.s.visitor.t=3;game.s.visitor.h=1');
  const guard=v.run("game.s.entities.find(e=>e.type==='G').id");await v.action('active:'+guard);await v.action('active:e4');
  assert.equal(v.run('game.s.phase'),'roll');assert.equal(v.run('game.s.guestIndex'),1);assert.equal(v.run('selection'),null);assert.equal(v.run(`entity('${guard}').uses`),2);
  assert.match(v.html(),/주사위 굴리기/);assert.doesNotMatch(v.html(),/data-action="advance"/);
});

test('final boss reward removes surrender and final selection renders won then restart resets all assets',async()=>{
  const v=harness();rewardFixture(v,'boss',3);v.run("entity('e1').p=1;entity('e2').p=1;entity('e2').floor=null;render()");assert.equal(v.run('game.s.finalVictory'),true);assert.doesNotMatch(v.html(),/data-action="surrender(?:confirm)?"|이번 판 포기/);assert.match(v.html(),/최종 보유 목록/);assert.doesNotMatch(v.html(),/무료 새 개체를 획득한 뒤 다음 막으로 갑니다/);
  await v.action('rewardselect:0');await v.action('rewardconfirm');assert.equal(v.run('game.s.phase'),'won');assert.match(v.html(),/24 \/ 24/);assert.match(v.html(),/새 판 시작/);
  assert.equal(v.run("entity('e1').p"),1);assert.equal(v.run("entity('e2').p"),1);assert.equal(v.run("game.s.history.filter(e=>e.kind==='act_start').length"),0);
  await v.action('new');assert.equal(v.run('game.s.phase'),'map');assert.equal(v.run('game.s.floorCount'),6);assert.equal(v.run('game.s.entities.length'),4);assert.equal(v.run('game.s.money'),4);assert.equal(v.run('game.s.stats.visits'),0);
});

test('first and second boss reward confirmation restores placed and reserve tokens and explains the new act',async()=>{
  for(const act of [1,2]){
    const v=harness();rewardFixture(v,'boss',act);v.run("Object.assign(entity('e1'),{p:1,c:7,upgraded:true});Object.assign(entity('e2'),{p:1,c:9,floor:null,upgraded:true});entity('e4').uses=0;render()");
    assert.match(v.html(),/무료 새 개체를 획득한 뒤 다음 막으로 갑니다/);assert.match(v.html(),/파훼 토큰이 배치·보관 모두 최대치로 복구/);
    const before=snapshot(v),money=v.run('game.s.money');await v.action('rewardselect:1');assert.equal(snapshot(v),before);assert.equal(v.run("entity('e1').p"),1);assert.equal(v.run("entity('e2').p"),1);
    v.run('prefs.tutorial=true');await v.action('rewardconfirm');assert.equal(v.run('game.s.act'),act+1);assert.equal(v.run('game.s.phase'),'map');
    assert.equal(v.run("entity('e1').p"),2);assert.equal(v.run("entity('e2').p"),2);assert.equal(v.run("entity('e2').floor"),null);assert.equal(v.run("entity('e1').upgraded&&entity('e2').upgraded"),true);
    assert.equal(v.run("entity('e1').c"),7);assert.equal(v.run("entity('e2').c"),9);assert.equal(v.run("entity('e4').uses"),0);assert.equal(v.run('game.s.money'),money);
    assert.match(v.node('.toast').textContent,new RegExp((act+1)+'막 시작'));assert.match(v.node('.toast').textContent,/파훼 토큰 최대치 복구/);
    assert.equal(v.run('modal.key'),'actReset');assert.match(v.modalHtml(),/배치·보관 중인 모든 생존 괴이/);assert.match(v.modalHtml(),/제거한 괴이는 돌아오지 않습니다/);
    const after=snapshot(v);await v.action('tutorialnext');assert.equal(snapshot(v),after);assert.equal(v.run('seen.actReset'),true);
    assert.match(v.html(),/파훼 토큰은 같은 막에서 이월/);assert.match(v.html(),/새 막 시작 시 배치·보관 괴이 모두 최대치로 복구/);
  }
});

test('options and term help do not mutate run state and persist tutorial preference',async()=>{
  const v=harness();await v.action('new');const before=snapshot(v);await v.action('options');assert.match(v.modalHtml(),/첫 등장 안내/);await v.action('closemodal');
  await v.action('term:파훼 토큰');assert.match(v.modalHtml(),/같은 막에서는 손님·전투 사이에 유지/);assert.match(v.modalHtml(),/다음 막이 시작되면 생존 괴이의 토큰이 최대치로 복구/);await v.action('closeterm');assert.equal(snapshot(v),before);
  v.run("prefs.tutorial=true;save()");assert.equal(JSON.parse(v.saved.get('dread-user3-options')).tutorial,true);
});

test('hotel target hover keeps the complete floor range, visitor, geometry and costs unchanged',async()=>{
  const v=harness();fixture(v);v.run("game.s.floorCount=10;game._add('G',2)");await prepare(v);
  const board=v.node('.hotel-board'),building=v.node('.hotel-building');
  const target=floorControl(v,3),id=v.run("game.s.entities.find(e=>e.type==='G').id");await v.action('floor:2');
  const before=snapshot(v),pos=v.run('game.s.visitor.pos'),geometry=JSON.stringify([board.style,building.style,target.getBoundingClientRect()]);
  v.handlers.pointerover({target,pointerType:'mouse',relatedTarget:null});v.flushTimers();
  assert.equal(v.run('targetFloor'),3);assert.equal(snapshot(v),before);assert.equal(v.run('game.s.visitor.pos'),pos);
  assert.match(v.run('previewPanel(currentPreview())'),/가상 결과 · 아직 비용 미지불/);
  assert.deepEqual(floorNumbers(v.run('hotelFloors(currentPreview(),true)')),[10,9,8,7,6,5,4,3,2,1]);
  assert.equal(JSON.stringify([board.style,building.style,target.getBoundingClientRect()]),geometry);assert.deepEqual(v.scrollRequests,[]);
  v.handlers.pointerout({target,relatedTarget:null});v.flushTimers();assert.equal(v.run('targetFloor'),null);assert.equal(v.run('selection.kind'),'G');assert.equal(snapshot(v),before);
  await v.action('cancel');assert.equal(v.run('selection'),null);assert.equal(v.run(`entity('${id}').uses`),2);assert.deepEqual(v.scrollRequests,[]);
});

test('touch targeting requires a second tap on the same valid floor',async()=>{
  const v=harness();fixture(v);v.run("game._add('G',2)");await prepare(v);const id=v.run("game.s.entities.find(e=>e.type==='G').id");
  await v.action('active:'+id);v.run("lastPointerType='touch'");const before=snapshot(v);
  await v.action('floor:3');assert.equal(v.run('targetFloor'),3);assert.equal(snapshot(v),before);
  await v.action('floor:5');assert.equal(v.run('targetFloor'),5);assert.equal(snapshot(v),before);
  await v.action('floor:5');assert.equal(v.run(`entity('${id}').uses`),1);assert.equal(v.run('at(5).shield'),6);assert.equal(v.run('selection'),null);
});

test('keyboard node focus reviews without visiting and Enter on a usable floor activates it',async()=>{
  const v=harness();await v.action('new');const before=snapshot(v),mapNode={dataset:{node:'a1-d1-c1'}};
  v.handlers.focusin({target:{closest:s=>s==='[data-node]'?mapNode:null}});
  assert.equal(v.run('selectedNode'),'a1-d1-c1');assert.equal(snapshot(v),before);await v.action('visit');await prepare(v);
  v.run('game.s.visitor.t=99');const target={dataset:{floor:'6'},matches:s=>s==='[data-floor]'};
  v.handlers.keydown({key:'Enter',target,preventDefault(){}});assert.equal(v.run("entity('e4').uses"),1);assert.equal(v.run('game.s.visitor.f'),3);
});

test('pointer or focus dice review preserves the fixed hotel and actual visitor state',async()=>{
  const v=harness();fixture(v);await v.action('start');await v.action('roll');const building=v.node('.hotel-building');
  const before=snapshot(v),die={dataset:{die:'0'}};v.handlers.pointerover({target:{closest:s=>s==='[data-die]'?die:null}});
  assert.equal(v.run('hoverDie'),0);assert.deepEqual(building.style,{});assert.deepEqual(v.scrollRequests,[]);assert.equal(snapshot(v),before);
  const other={dataset:{die:'1'}};v.handlers.focusin({target:{closest:s=>s==='[data-die]'?other:null}});
  assert.equal(v.run('hoverDie'),1);assert.deepEqual(building.style,{});assert.deepEqual(v.scrollRequests,[]);assert.equal(snapshot(v),before);
});

test('1280x720 view contract renders only owned floors, basement and controls with no minimap',async()=>{
  const v=harness();fixture(v);assert.deepEqual(floorNumbers(v.html()),[6,5,4,3,2,1]);
  for(const kind of ['normal','shop','recovery']){
    fixture(v,kind);v.run('game.s.floorCount=10;render()');
    assert.deepEqual(floorNumbers(v.html()),[10,9,8,7,6,5,4,3,2,1]);
    assert.match(v.html(),/class="hotel-board/);assert.match(v.html(),/class="hotel-building/);assert.match(v.html(),/class="hotel-floors/);assert.match(v.html(),/basement-machine/);
    assert.doesNotMatch(v.html(),/class="minimap|data-mini=|hotel-scroll|호텔 복도 스크롤/);
  }
  fixture(v);v.run('game.s.floorCount=10');await prepare(v);
  assert.deepEqual(floorNumbers(v.html()),[10,9,8,7,6,5,4,3,2,1]);assert.match(v.html(),/이동 실행/);assert.match(v.html(),/CURRENT FLOOR/);
  assert.doesNotMatch(v.html(),/class="minimap|data-mini=|hotel-scroll/);
  const before=snapshot(v);await v.action('hotel');assert.deepEqual(floorNumbers(v.modalHtml()),[10,9,8,7,6,5,4,3,2,1]);assert.equal(snapshot(v),before);
});

test('hotel information icon and nested detail inspection never activate or select an effect',async()=>{
  const v=harness();fixture(v);await prepare(v);v.run('game.s.visitor.t=99');const before=snapshot(v);
  const floor=floorControl(v,6),icon={dataset:{action:'info:e4'},disabled:false,closest:selector=>selector==='[data-action]'?icon:selector==='[data-floor]'?floor:null};
  v.handlers.click({target:icon,preventDefault(){}});assert.equal(snapshot(v),before);assert.equal(v.run('selection'),null);
  assert.equal(v.node('#tooltip').hidden,false);assert.match(v.node('#tooltip').innerHTML,/빈 프런트의 호출벨/);
  const detail={closest:selector=>selector==='details,summary,input,select,label,a'?detail:selector==='[data-floor]'?floor:null};
  v.handlers.click({target:detail,preventDefault(){}});assert.equal(snapshot(v),before);
  assert.equal(v.run("entity('e4').uses"),2);assert.equal(v.run('game.s.visitor.f'),0);
});

test('keyboard hotel target focus previews freely and Enter commits that floor exactly once',async()=>{
  const v=harness();fixture(v);v.run("game._add('G',2)");await prepare(v);await v.action('floor:2');
  const id=v.run('selection.id'),target=floorControl(v,3),before=snapshot(v);v.run("lastPointerType='keyboard'");
  v.handlers.focusin({target});v.flushTimers();assert.equal(v.run('targetFloor'),3);assert.equal(snapshot(v),before);
  v.handlers.keydown({key:'Enter',target,preventDefault(){}});assert.equal(v.run(`entity('${id}').uses`),1);assert.equal(v.run('at(3).shield'),6);assert.equal(v.run('selection'),null);
  assert.deepEqual(v.scrollRequests,[]);
});

test('invalid hotel target clears virtual preview, cannot consume protection and keeps selection open',async()=>{
  const v=harness();fixture(v);v.run("game._add('G',2)");await prepare(v);await v.action('floor:2');
  const before=snapshot(v);v.run('reviewTarget(3,true)');assert.equal(v.run('targetFloor'),3);
  const empty=floorControl(v,4);v.handlers.pointerover({target:empty,pointerType:'mouse',relatedTarget:null});v.flushTimers();
  assert.equal(v.run('targetFloor'),null);await v.action('floor:4');assert.equal(snapshot(v),before);assert.equal(v.run('selection.kind'),'G');
});

function forceRoute(v,{type='normal',value=3,position=0,anxiety=0}={}){
  const face=DICE[type].faces.indexOf(value);assert.notEqual(face,-1);
  v.run(`game.s.equipped[0]=${JSON.stringify(type)};game.s.phase='choose';game.s.dice=[{slot:0,type:${JSON.stringify(type)},face:${face},value:${value},bonus:${type==='anxiety'&&value===3?1:0}},{slot:1,type:'normal',face:0,value:1,bonus:0},{slot:2,type:'normal',face:1,value:2,bonus:0}];Object.assign(game.s.visitor,{pos:${position},a:${anxiety},t:999,h:2,pattern:'none'});hoverDie=0;render()`);
}
const routeSteps=v=>JSON.parse(v.run('JSON.stringify(routeSteps(currentPreview().events,game.s.visitor.pos,game.s.floorCount))'));

test('straight route arrows label actual pass supply and arrival harvest in visit order',async()=>{
  const v=harness();fixture(v);await v.action('start');forceRoute(v);
  const before=snapshot(v),steps=routeSteps(v);assert.deepEqual(steps.map(s=>s.floor),[1,2,3]);
  assert.match(steps[0].label,/통과.*불안 \+2/);assert.doesNotMatch(steps[1].label,/불안 [+-]|공포 \+/);
  assert.match(steps[2].label,/도착.*불안 [−-]2.*공포 \+8/);assert.ok(steps.every(s=>!s.wrap));
  assert.equal(v.run('currentPreview().summary.fear'),8);assert.equal(snapshot(v),before);
  const html=v.run('hotelFloors(currentPreview(),true)');assert.match(html,/data-route-order="1"/);assert.match(html,/data-route-floor="3"/);assert.match(html,/data-route-kind="arrival"/);
});

test('long routes retain separate revisit arrows and mark the top-to-first-floor curve',async()=>{
  const v=harness();fixture(v);await v.action('start');forceRoute(v,{type:'long',value:8,position:4});
  const steps=routeSteps(v);assert.deepEqual(steps.map(s=>s.floor),[5,6,1,2,3,4,5,6]);
  assert.equal(steps.length,8);assert.equal(steps.filter(s=>s.wrap).length,1);assert.equal(steps.find(s=>s.wrap).floor,1);
  assert.equal(steps.filter(s=>s.floor===5).length,2);assert.equal(steps.filter(s=>s.floor===6).length,2);
  assert.match(steps.at(-1).label,/도착.*공포 \+3/);assert.doesNotMatch(steps[1].label,/공포 \+3/);
  const html=v.run('hotelFloors(currentPreview(),true)');assert.match(html,/data-route-wrap="true"/);assert.match(html,/data-route-order="8"/);
});

test('route labels exclude pre-movement die bonus while arrival uses the bonus only once',async()=>{
  const v=harness();fixture(v);await v.action('start');forceRoute(v,{type:'anxiety',value:3});
  const before=snapshot(v),steps=routeSteps(v);assert.match(steps[0].label,/불안 \+2/);assert.doesNotMatch(steps[0].label,/불안 \+3|선택 효과/);
  assert.match(steps[2].label,/불안 [−-]3.*공포 \+12/);assert.equal(v.run('currentPreview().summary.choiceBonus'),1);
  for(let i=0;i<100;i++)routeSteps(v);assert.equal(snapshot(v),before);
  await v.action('choose');assert.equal(v.run('game.s.visitor.a'),1);assert.deepEqual(routeSteps(v).map(s=>s.label),steps.map(s=>s.label));assert.equal(v.run('game.s.visitor.a'),1);
});

test('route labels use effective upgrade, actual anxiety cap and actual next-turn guard charge',async()=>{
  const v=harness();fixture(v);await v.action('start');v.run("entity('e1').upgraded=true;entity('e2').upgraded=true");forceRoute(v,{anxiety:1});
  let steps=routeSteps(v);assert.match(steps[0].label,/불안 \+3/);assert.match(steps[2].label,/불안 [−-]4.*공포 \+16/);
  forceRoute(v,{anxiety:9});steps=routeSteps(v);assert.doesNotMatch(steps[0].label,/불안 \+3/);assert.match(steps[2].label,/불안 [−-]4.*공포 \+16/);
  v.run("game._add('G',2)");forceRoute(v,{value:2});let guard=v.run("game.s.entities.find(e=>e.type==='G').id");v.run(`entity('${guard}').uses=1`);
  steps=routeSteps(v);assert.match(steps[1].label,/방어.*\+1/);assert.match(steps[1].label,/다음 턴/);
  v.run(`entity('${guard}').uses=2`);steps=routeSteps(v);assert.doesNotMatch(steps[1].label,/방어.*\+1/);
});

test('exit hover preview stops route arrows at contact without installing or paying anything',async()=>{
  const v=harness();fixture(v);await v.action('start');forceRoute(v,{value:6});await v.action('choose');await v.action('escape');
  assert.equal(v.run('validTarget(1)'),false);assert.equal(v.run('validTarget(2)'),true);
  const before=snapshot(v);await v.action('floor:1');assert.equal(snapshot(v),before);assert.equal(v.run('selection.kind'),'escape');
  v.run('reviewTarget(2,true)');const preview=v.run('currentPreview()');
  assert.equal(preview.summary.escaped,true);assert.deepEqual(Array.from(preview.path),[1,2]);assert.equal(preview.summary.retaliation,false);
  assert.deepEqual(routeSteps(v).map(s=>s.floor),[1,2]);assert.equal(snapshot(v),before);assert.equal(v.run('game.s.escape'),null);
  const html=v.run('hotelFloors(currentPreview(),true)');assert.doesNotMatch(html,/data-route-order="3"/);
  const floor=floorControl(v,2);v.handlers.pointerout({target:floor,relatedTarget:null});v.flushTimers();
  assert.equal(v.run('targetFloor'),null);assert.equal(v.run('selection.kind'),'escape');assert.equal(snapshot(v),before);assert.equal(v.run('currentPreview().path.length'),6);
  v.run('reviewTarget(2,true)');assert.deepEqual(routeSteps(v).map(s=>s.floor),[1,2]);
  await v.action('cancel');assert.equal(snapshot(v),before);assert.equal(v.run('currentPreview().path.length'),6);
});

test('lethal direct-use preview produces no future movement arrows or retaliation',async()=>{
  const v=harness();fixture(v);await prepare(v);v.run('game.s.visitor.t=3;game.s.visitor.h=1');
  const before=snapshot(v),steps=v.run("routeSteps(game.preview(undefined,[{kind:'active',entityId:'e4'}]).events,game.s.visitor.pos,game.s.floorCount)");
  assert.equal(steps.length,0);assert.equal(snapshot(v),before);
});

test('animated movement keeps all ten floor targets fixed without camera or scroll requests',async()=>{
  const v=harness();fixture(v);v.run('game.s.floorCount=10');await v.action('start');forceRoute(v,{value:6});await v.action('choose');
  const board=v.node('.hotel-board'),building=v.node('.hotel-building');for(let f=1;f<=10;f++)floorControl(v,f);
  const geometry=JSON.stringify([board.style,building.style]),range=[10,9,8,7,6,5,4,3,2,1];v.run('animationEnabled=true');
  const moving=v.action('move');let frames=0;
  while(v.run('busy')&&frames++<100){assert.deepEqual(floorNumbers(v.html()),range);assert.equal(JSON.stringify([board.style,building.style]),geometry);v.flushTimers();await Promise.resolve();}
  assert.equal(v.run('busy'),false);await moving;assert.equal(v.run('game.s.phase'),'roll');assert.equal(v.run('game.s.visitor.pos'),6);
  assert.ok(frames>1);assert.deepEqual(v.scrollRequests,[]);assert.equal(JSON.stringify([board.style,building.style]),geometry);
});
