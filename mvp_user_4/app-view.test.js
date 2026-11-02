import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game,CREATURES,DICE,creatureDef,creatureName,UPGRADE_TEXT,NODE_TYPES,ANXIETY_CAP,CAPS} from './engine.js';

// Offline HTML/action contract checks. These do not claim browser layout, focus,
// accessibility-tree, animation timing, or real mouse/touch coverage.
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
function harness(){
  const handlers={},nodes=new Map(),timers=new Map(),errors=[],scrollRequests=[];let timerId=0;
  const classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
  const element=()=>({innerHTML:'',textContent:'',hidden:true,style:{},dataset:{},offsetHeight:100,scrollHeight:1000,clientHeight:500,scrollTop:0,scrollLeft:0,classList:classes(),setAttribute(){},removeAttribute(){},focus(){},remove(){},append(){},click(){},scrollTo(o){scrollRequests.push({selector:this.testSelector,method:'scrollTo',options:o});this.scrollTop=o.top??this.scrollTop;},scrollIntoView(){scrollRequests.push({selector:this.testSelector,method:'scrollIntoView'});},querySelector(){return null;},querySelectorAll(){return [];},contains(other){return other===this;},closest(){return null;},matches(){return false;},getBoundingClientRect(){return {top:20,left:10,right:310,bottom:120,width:300,height:100};}});
  for(const key of ['#app','#tooltip','#modal-root'])nodes.set(key,element());
  const document={activeElement:null,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],createElement:element,body:{classList:classes(),append(node){nodes.set('.toast',node);}},addEventListener(name,fn){handlers[name]=fn;}};
  const saved=new Map([['dread-user4-options',JSON.stringify({tutorial:false,speed:'fast'})]]);
  const context=vm.createContext({Game,CREATURES,DICE,creatureDef,creatureName,UPGRADE_TEXT,NODE_TYPES,ANXIETY_CAP,CAPS,document,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},crypto:{getRandomValues(a){a[0]=31001;return a;}},Uint32Array,structuredClone,innerWidth:1280,innerHeight:720,requestAnimationFrame(){},cancelAnimationFrame(){},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},setInterval(){return 1;},clearInterval(){},addEventListener(){},console:{...console,error:error=>errors.push(error.message)}});
  vm.runInContext(source,context,{filename:'app.js'});
  vm.runInContext('animationEnabled=false',context);
  return {run:code=>vm.runInContext(code,context),action:name=>vm.runInContext(`action(${JSON.stringify(name)})`,context),html:()=>nodes.get('#app').innerHTML,modalHtml:()=>nodes.get('#modal-root').innerHTML,saved,handlers,errors,scrollRequests,node(selector){if(!nodes.has(selector))nodes.set(selector,{...element(),testSelector:selector});return nodes.get(selector);},flushTimers(){const jobs=[...timers.values()];timers.clear();for(const fn of jobs)fn();}};
}
function fixture(v,kind='normal',act=1,depth=null){
  v.run(`game=new Game(31001);onTitle=false;game.s.act=${act};(()=>{const n=game.s.maps[${act-1}].find(n=>n.kind===${JSON.stringify(kind)}&&(${depth}==null||n.depth===${depth}));game.s.completed[${act-1}]=n.depth-1;game.s.lastNodes[${act-1}]=n.depth===1?null:'a${act}-d'+(n.depth-1)+'-c1';game.s.stats.visits=${(act-1)*8}+n.depth-1;game.visit(n.id);})();newDrafts();modal=null;render();`);
}
async function prepare(v){await v.action('start');await v.action('roll');await v.action('die:0');await v.action('choose');}
const snapshot=v=>v.run('JSON.stringify(game.s)');

function selected(v,value=2){v.run(`game.s.phase='choose';game.s.dice=game.s.equipped.map((type,slot)=>({slot,type,face:${value-1},value:${value}}));game.choose(0);render();`);}
function peaceful(v){v.run("Object.assign(game.s.visitor,{pattern:'none',t:999,h:3});");}
function rewardFixture(v,act=1){fixture(v,'boss',act);v.run("for(const g of game._node().guests)Object.assign(g,{t:1,h:1,pattern:'none'});game.startService();game.s.visitor.prophecy=2;game.s.phase='choose';game.s.dice=[{slot:0,type:'normal',face:0,value:1}];game.choose(0);render();");}

test('title, new run and all twenty map nodes use user-4 content',async()=>{
 const v=harness();assert.match(v.html(),/새 모험 시작/);await v.action('new');assert.equal(v.run('game.s.phase'),'map');assert.equal((v.html().match(/data-node=/g)||[]).length,20);assert.equal(v.run('game.s.entities.length'),4);assert.match(v.html(),/USER 4/);assert.equal(v.errors.length,0);
});

test('node review is free and visiting reveals the three guests',async()=>{
 const v=harness();await v.action('new');const before=snapshot(v);await v.action('node:a1-d1-c1');assert.equal(snapshot(v),before);await v.action('visit');assert.equal(v.run('game.s.phase'),'management');assert.equal((v.html().match(/class="guest-thumb"/g)||[]).length,3);assert.match(v.html(),/문틈의 시선/);
});

test('six through ten floors remain ascending and horizontally labelled in preparation and battle',async()=>{
 const v=harness();fixture(v);
 for(let count=6;count<=10;count++){
  v.run(`game.s.floorCount=${count};render()`);
  assert.deepEqual([...v.html().matchAll(/data-floor="(\d+)"/g)].map(m=>+m[1]),Array.from({length:count},(_,i)=>i+1));
  assert.match(v.html(),/data-orientation="horizontal"/);
 }
 await v.action('start');assert.match(v.html(),/horizontal-route/);assert.match(v.html(),/마지막 층 다음은 1층/);assert.deepEqual([...v.html().matchAll(/data-route-floor="(\d+)"/g)].map(m=>+m[1]),[1,2,3,4,5,6,7,8,9,10]);
});

test('horizontal route preserves wrapping, revisits, arrivals and ignores retaliation resource changes',()=>{
 const v=harness();fixture(v);v.run('game.startService()');
 const steps=v.run("routeSteps([{kind:'move',floor:6},{kind:'move',floor:1},{kind:'resource',resource:'a',amount:3},{kind:'move',floor:2,arrival:true},{kind:'hit',floor:6},{kind:'resource',resource:'greed',amount:1}],5,6)");
 assert.equal(steps[1].wrap,true);assert.equal(steps[1].effects[0],'불안 +3');assert.equal(steps[2].arrival,true);assert.equal(steps[2].effects.length,0);
 const lane=v.run("routeLane({events:[{kind:'move',floor:1},{kind:'move',floor:2},{kind:'move',floor:1,arrival:true}]})");assert.match(lane,/data-route-order="3" data-route-kind="arrival"/);assert.equal((lane.match(/data-route-order=/g)||[]).length,3);
});

test('cards expose all thirteen names, effects and upgrades without legacy creatures',async()=>{
 const v=harness();await v.action('help');const html=v.modalHtml();for(const d of Object.values(CREATURES))assert.ok(html.includes(d.name),d.name);assert.match(html,/지속/);assert.match(html,/강화/);assert.doesNotMatch(html,/빈 프런트의 호출벨|닫히지 않는 방화문|문틈의 속삭임/);
});

test('one-unit progress bars and token hearts follow each creatures actual limit',()=>{
 const v=harness();fixture(v);
 for(const [type,upgraded,limit] of [['portrait',false,8],['gaze',false,12],['barnacle',false,14],['barnacle',true,18],['safe',false,20]]){
  const html=v.run(`creatureDurability({type:'${type}',upgraded:${upgraded},c:7,p:1})`);assert.equal((html.match(/class="progress-cell[ "]/g)||[]).length,limit);assert.equal((html.match(/progress-cell filled/g)||[]).length,7);assert.match(html,/♥/);assert.match(html,/♡/);assert.ok(html.includes('7/'+limit));
 }
});

test('stored cards can be placed and swapped with state preserved',async()=>{
 const v=harness();fixture(v);v.run("Object.assign(entity('e1'),{p:1,c:7,upgraded:true});game.store('e1');render()");assert.match(v.html(),/inventory-card/);await v.action('place:e1');await v.action('floor:3');assert.equal(v.run("entity('e1').floor"),3);assert.equal(v.run("entity('e2').floor"),null);assert.equal(v.run("entity('e1').c"),7);assert.equal(v.run("entity('e1').p"),1);
});

test('shop offers eight cards; comparing expansion is pure and confirmed expansion adds the rightmost floor',async()=>{
 const v=harness();fixture(v,'shop');assert.equal((v.html().match(/class="shop-item /g)||[]).length,8);const before=snapshot(v);await v.action('expand');assert.match(v.modalHtml(),/6 → 7층/);assert.match(v.modalHtml(),/data-expand="greed"/);assert.match(v.modalHtml(),/data-expand="prophecy"/);assert.equal(snapshot(v),before);await v.action('closemodal');assert.equal(snapshot(v),before);await v.action('expand');await v.action('expandconfirm');assert.equal(v.run('game.s.floorCount'),7);assert.equal(v.run('game.s.money'),0);assert.match(v.html(),/data-floor="7"/);
});

test('combat displays all three resources with their caps and active buttons',async()=>{
 const v=harness();fixture(v);await prepare(v);assert.match(v.html(),/visitor-resource anxiety/);assert.match(v.html(),/visitor-resource greed/);assert.match(v.html(),/visitor-resource prophecy/);assert.match(v.html(),/data-action="active:e4"/);assert.match(v.html(),/속공/);assert.equal(v.errors.length,0);
});

test('99-cap resources, stored speed and hypothetical inputs show their full legal range',async()=>{
 const v=harness();fixture(v);v.run("game._add('barnacle',2);game.startService();Object.assign(game.s.visitor,{a:98,greed:99,prophecy:95});game.s.entities.at(-1).uses=99;render()");
 for(const label of ['불안 98/99','탐욕 99/99','예언 95/99'])assert.ok(v.html().includes(label),label);
 assert.equal((v.html().match(/segments resource-meter/g)||[]).length,3);assert.match(v.html(),/속공 99\/99/);
 for(const key of ['불안','탐욕','예언','속공','봉인','화재'])assert.ok(v.run(`glossary['${key}']`).includes('99'));
 fixture(v,'shop');await v.action('expand');
 for(const key of ['anxiety','greed','prophecy']){
  assert.match(v.modalHtml(),new RegExp('data-expand="'+key+'"[^>]*max="99"'));
  v.handlers.change({target:{dataset:{expand:key},value:'100'}});assert.equal(v.run(`expansion.${key}`),99);
 }
});

test('repair target review does not spend and clicking the floor applies one paid repair',async()=>{
 const v=harness();fixture(v);v.run("game._add('mouse',2);game.startService();game.s.visitor.a=6;entity('e1').c=9");selected(v);peaceful(v);const mouse=v.run("game.s.entities.find(e=>e.type==='mouse').id");const before=snapshot(v);await v.action('active:'+mouse);v.run('reviewTarget(1)');assert.equal(snapshot(v),before);assert.equal(v.run('targetFloor'),1);await v.action('target:1');assert.equal(v.run("entity('e1').c"),3);assert.equal(v.run('game.s.visitor.a'),4);assert.equal(v.run('selection'),null);assert.equal(v.errors.length,0);
});

test('immediate eye modification updates the prepared distance without choosing again',async()=>{
 const v=harness();fixture(v);v.run("game._add('portrait',2);game.startService();game.s.visitor.a=8");selected(v,3);peaceful(v);const id=v.run("game.s.entities.find(e=>e.type==='portrait').id");await v.action('active:'+id);assert.equal(v.run('game.s.visitor.a'),4);assert.equal(v.run('game.s.chosen'),4);assert.match(v.html(),/4칸/);assert.equal(v.errors.length,0);
});

test('reroll preview conceals future dice, actual action returns to dice selection',async()=>{
 const v=harness();fixture(v);v.run("game._add('prophet',2);game.startService();game.s.visitor.prophecy=7");peaceful(v);selected(v,6);const id=v.run("game.s.entities.find(e=>e.type==='prophet').id");const before=snapshot(v);const result=v.run(`game.preview(null,[{kind:'active',entityId:'${id}'}])`);assert.equal(result.requiresRoll,true);assert.equal(result.known,false);assert.equal(snapshot(v),before);await v.action('active:'+id);assert.equal(v.run('game.s.phase'),'choose');assert.equal(v.run('game.s.dice.length'),3);assert.equal(v.errors.length,0);
});

test('sealing suppresses the active button and is disclosed on the full card',async()=>{
 const v=harness();fixture(v);await prepare(v);v.run("entity('e4').seal=2;render()");assert.doesNotMatch(v.html(),/data-action="active:e4"/);assert.match(v.html(),/봉인 2/);await v.action('info:e4');assert.match(v.modalHtml(),/봉인 2/);
});

test('footsteps upgrade comparison and confirmation show the extra current heart',async()=>{
 const v=harness();fixture(v,'recovery');v.run("game._add('footsteps',2);render()");const id=v.run("game.s.entities.at(-1).id");await v.action('recovermode:upgrade');await v.action('upgradeselect:'+id);assert.match(v.html(),/현재·최대 파훼 토큰 \+1/);assert.match(v.html(),/따라오는 발소리\+/);await v.action('upgradeconfirm');assert.equal(v.run(`entity('${id}').p`),2);assert.equal(v.run('game.s.phase'),'map');assert.equal(v.errors.length,0);
});

test('boss reward advances the act only after mandatory selection and restores surviving hearts',async()=>{
 const v=harness();rewardFixture(v);v.run("entity('e1').p=1;render()");assert.equal(v.run('game.s.phase'),'anomaly_reward');assert.equal(v.run('game.s.act'),1);await v.action('rewardselect:0');await v.action('rewardconfirm');assert.equal(v.run('game.s.act'),2);assert.equal(v.run("entity('e1').p"),2);assert.equal(v.errors.length,0);
});

test('final reward ends in victory and new run clears the old campaign',async()=>{
 const v=harness();rewardFixture(v,3);await v.action('rewardselect:0');await v.action('rewardconfirm');assert.equal(v.run('game.s.phase'),'won');assert.match(v.html(),/승리/);await v.action('new');assert.equal(v.run('game.s.phase'),'map');assert.equal(v.run('game.s.act'),1);assert.equal(v.run('game.s.entities.length'),4);assert.equal(v.errors.length,0);
});

test('surrender cancellation is harmless; confirmed defeat permits restarting',async()=>{
 const v=harness();fixture(v);const before=snapshot(v);await v.action('surrenderconfirm');await v.action('closemodal');assert.equal(snapshot(v),before);await v.action('surrenderconfirm');await v.action('surrender');assert.equal(v.run('game.s.phase'),'lost');assert.match(v.html(),/패배/);await v.action('new');assert.equal(v.run('game.s.phase'),'map');
});

test('tutorial settings persist in the isolated user-4 preference key',async()=>{
 const v=harness();v.run("prefs.tutorial=true;teach('states')");assert.match(v.modalHtml(),/세 가지 손님 자원/);await v.action('tutorialoff');assert.equal(JSON.parse(v.saved.get('dread-user4-options')).tutorial,false);assert.equal(v.run('queue.length'),0);
});
