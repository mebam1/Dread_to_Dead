import {Campaign,randomFor,NODE_TYPES,generateMap} from './campaign.mjs';
import {wrap} from './core.mjs';
import {CREATURES,DICE,CAPS,ANXIETY_CAP,EXPANSION_COSTS,creatureDef,creatureName,UPGRADE_TEXT,RULE_VERSION} from './catalog.mjs';
export {CREATURES,DICE,CAPS,ANXIETY_CAP,EXPANSION_COSTS,creatureDef,creatureName,UPGRADE_TEXT,RULE_VERSION,NODE_TYPES,generateMap};
const copy=x=>structuredClone(x);
const ENDED=new Set(['guest_end','service_end','anomaly_reward','die_reward','map','won','lost']);
const resourceNames={a:'불안',greed:'탐욕',prophecy:'예언',uses:'속공',seal:'봉인',fire:'화재'};

export class Game extends Campaign{
 static fromState(s){
  if(s?.version!==RULE_VERSION||!Array.isArray(s.maps)||s.maps.length!==3)throw new Error('사용자 설정 4의 저장 상태가 아닙니다.');
  const g=Object.create(Game.prototype);g.s=copy(s);g.events=[];g.uncertainty=[];return g;
 }
 clone(){return Game.fromState(this.s);}
 view(){return {...super.view(),rules:RULE_VERSION,caps:copy(CAPS),guards:copy(this.s.guards)};}
 _startGuest(reset=true){
  if(reset){
   const before=copy(this.s.entities);
   for(const e of this.s.entities){e.c=0;e.shield=0;e.seal=0;e.fire=0;e.barnacleBoost=false;}
   this._emit('guest_boundary','다음 손님 · 공략도·봉인·화재·방어 정리, 토큰·속공·유인 유지',{before,after:copy(this.s.entities)});
  }
  this.s.guards={};
  const def=this._node().guests[this.s.guestIndex];
  this.s.visitor={...copy(def),f:0,a:0,greed:0,prophecy:0,pos:0,turn:1,rollIndex:0};
  Object.assign(this.s,{phase:'roll',dice:[],chosen:null,chosenSlot:null,choiceEffect:null,inactive:0,inactiveLimit:3,activity:false});
  this._emit('guest_start',def.name+' 입장',{guest:copy(def),guestIndex:this.s.guestIndex});
 }
 _rollDice(){
  const v=this.s.visitor;
  this.s.dice=this.s.equipped.map((type,slot)=>{
   const face=Math.floor(randomFor(this.s.seed,this.s.act,this.s.currentNode,'dice',this.s.guestIndex,v.turn,v.rollIndex,slot)()*6),value=DICE[type].faces[face];
   return {slot,type,face,value,bonus:type==='anxiety'&&value===3?1:0};
  });
  this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;this.s.phase='choose';
  this._emit('roll','주사위 공개: '+this.s.dice.map(d=>DICE[d.type].name+' '+d.value).join(' / '),{dice:copy(this.s.dice),rollIndex:v.rollIndex});
 }
 roll(){this._require(this.s.phase==='roll','지금은 주사위를 굴릴 수 없습니다.');this._begin();this._rollDice();return this.events;}
 choose(slot){
  super.choose(slot);
  const v=this.s.visitor,value=this.s.chosen;
  if(v.prophecy>value){
   const before=v.prophecy;v.prophecy--;
   this._emit('prophecy_trigger','예언 '+before+' > 선택 눈 '+value+' · 예언 1 소비, 공포 '+value,{resource:'prophecy',before,after:v.prophecy,amount:-1,value});
   this._fear(value,'예언 선택 효과',null);
  }
  this._settle();return this.events;
 }
 upgrade(id){
  this._require(this.s.phase==='recovery'&&this._node()?.status==='active','회복 노드에서만 강화할 수 있습니다.');
  const e=this._entity(id);this._require(!e.upgraded,'이미 강화된 개체입니다.');
  const before=copy(e),beforeDef=creatureDef(e);this._begin();e.upgraded=true;
  if(e.type==='footsteps')e.p++;
  this.s.stats.upgrades++;
  this._emit('upgrade',this._name(e)+' · '+UPGRADE_TEXT[e.type],{entityId:id,entity:copy(e),before,after:copy(e),beforeEffect:beforeDef,afterEffect:creatureDef(e)});
  this._complete('upgrade');return this.events;
 }
 activeReason(id){
  const e=this.s.entities.find(e=>e.id===id&&e.p>0);
  if(this.s.phase!=='prepare')return '주사위를 확정한 뒤 이동 전에만 속공을 사용합니다.';
  if(!e||e.floor==null)return '생존 배치 괴이만 사용할 수 있습니다.';
  if(e.seal)return '봉인 중에는 속공을 사용할 수 없습니다.';
  const d=creatureDef(e),v=this.s.visitor;
  if(!d.hasActive)return '속공 효과가 없습니다.';
  if(d.limitedUses&&e.uses<1)return '속공 횟수가 부족합니다.';
  if(e.type==='mouse'&&(v.a<2||!this._living().some(t=>t.c>0)))return '불안 2와 공략도가 있는 대상이 필요합니다.';
  if(e.type==='portrait'&&v.a<d.portraitCost)return '불안 '+d.portraitCost+'가 필요합니다.';
  if(e.type==='nepenthes'&&v.greed<1)return '탐욕 1이 필요합니다.';
  if(e.type==='barnacle'&&(v.greed<1||e.barnacleBoost))return e.barnacleBoost?'이번 턴 통과 방어가 이미 강화되었습니다.':'탐욕 1이 필요합니다.';
  if(e.type==='collector'&&(v.greed<2||!this._living().some(t=>t.c>0)))return '탐욕 2와 공략도가 있는 대상이 필요합니다.';
  if(e.type==='prophet'&&v.prophecy<d.prophetCost)return '예언 '+d.prophetCost+'이 필요합니다.';
  if(e.type==='samara'&&(v.prophecy<2||this.s.chosen<=1))return '예언 2와 2 이상의 확정 눈이 필요합니다.';
  return '';
 }
 _plannedGuards(e,target){
  const guards={...this.s.guards};
  for(const [id,guard] of Object.entries(guards))if(guard===e.id)delete guards[id];
  if(target.id!==e.id)guards[target.id]=e.id;
  return guards;
 }
 _targetReason(e,targetId){
  const t=this.s.entities.find(t=>t.id===targetId&&t.p>0&&t.floor!=null);
  if(!t)return '생존 배치 대상을 고르세요.';
  if(['mouse','collector'].includes(e.type)&&t.c<=0)return '공략도가 있는 대상만 수리합니다.';
  if(e.type==='nepenthes'){
   const guards=this._plannedGuards(e,t),seen=new Set();let id=t.id;
   while(guards[id]){if(seen.has(id))return '대리 피격 고리를 만들 수 없습니다.';seen.add(id);id=guards[id];}
  }
  return '';
 }
 activeTargets(id){
  const e=this.s.entities.find(e=>e.id===id);
  if(!e||this.activeReason(id)||!creatureDef(e).targeted)return [];
  return this._living().filter(t=>!this._targetReason(e,t.id)).map(t=>t.id);
 }
 _cost(e,resource,amount){
  const owner=resource==='uses'?e:this.s.visitor,before=owner[resource];owner[resource]-=amount;
  this._emit('cost',this._name(e)+' '+resourceNames[resource]+' −'+amount,{sourceId:e.id,resource,amount,before,after:owner[resource],...(resource==='uses'?{entity:copy(e)}:{})});
 }
 _status(target,status,amount,sourceId=null){
  const before=target[status]||0;target[status]=Math.min(CAPS[status],before+amount);
  this._emit('status',this._name(target)+' '+resourceNames[status]+' '+before+' → '+target[status],{sourceId,targetId:target.id,floor:target.floor,status,before,after:target[status],amount:target[status]-before,entity:copy(target)});
 }
 _repair(target,amount,source){
  const before=target.c;target.c=Math.max(0,target.c-amount);
  this._emit('repair',this._name(target)+' 공략도 '+before+' → '+target.c,{sourceId:source.id,targetId:target.id,floor:target.floor,amount:before-target.c,before,after:target.c,entity:copy(target)});
 }
 active(id,targetId=null){
  const reason=this.activeReason(id);this._require(!reason,reason);
  const e=this._entity(id),d=creatureDef(e);
  if(d.targeted)this._require(!this._targetReason(e,targetId),this._targetReason(e,targetId));
  const t=d.targeted?this._entity(targetId):null;this._begin();
  if(e.type==='safe'){
   e.lure=!e.lure;this._emit('lure_toggle',this._name(e)+' 유인 '+(e.lure?'켜짐':'꺼짐'),{sourceId:e.id,enabled:e.lure,entity:copy(e)});
  }else{
   this.s.activity=true;
   if(e.type==='mouse'){this._cost(e,'a',2);this._repair(t,d.repairPower,e);}
   if(e.type==='portrait'){
    this._cost(e,'a',d.portraitCost);const before=this.s.chosen;this.s.chosen++;
    this._emit('die_adjust','확정 눈 '+before+' → '+this.s.chosen,{sourceId:e.id,before,after:this.s.chosen});
   }
   if(e.type==='nepenthes'){
    this._cost(e,'greed',1);this._shield(e,d.shieldPower,e);this.s.guards=this._plannedGuards(e,t);
    this._emit('guard',this._name(e)+' → '+this._name(t)+' 이번 턴 대리 피격',{sourceId:e.id,targetId:t.id,guards:copy(this.s.guards)});
   }
   if(e.type==='barnacle'){
    this._cost(e,'greed',1);this._cost(e,'uses',1);e.barnacleBoost=true;
    this._emit('pass_boost',this._name(e)+' 이번 턴 통과 방어 2 → 4',{sourceId:e.id,floor:e.floor,entity:copy(e)});
   }
   if(e.type==='collector'){
    this._cost(e,'greed',2);this._cost(e,'uses',1);this._repair(t,16,e);this._status(t,'seal',d.sealPower,e.id);
   }
   if(e.type==='prophet'){
    this._cost(e,'prophecy',d.prophetCost);this.s.visitor.rollIndex++;
    Object.assign(this.s,{phase:'roll',dice:[],chosen:null,chosenSlot:null,choiceEffect:null});
    this._emit('reroll','같은 턴에 주사위 3개 다시 굴리기',{sourceId:e.id,rollIndex:this.s.visitor.rollIndex});
    if(this._simulating){
     this._pendingRandom=true;this._emit('reroll_preview','새 눈과 예언 환급량은 굴린 뒤 공개합니다.',{unknown:true,refund:e.upgraded?'없음':'새 눈의 최솟값'});
    }else{
     this._rollDice();
     if(!e.upgraded)this._resource('prophecy',Math.min(...this.s.dice.map(die=>die.value)),this._name(e)+' 재굴림 환급',e.floor,e.id);
    }
   }
   if(e.type==='samara'){
    this._cost(e,'prophecy',2);const before=this.s.chosen;this.s.chosen--;
    this._emit('die_adjust','확정 눈 '+before+' → '+this.s.chosen,{sourceId:e.id,before,after:this.s.chosen});
   }
  }
  return this.events;
 }
 diagnoseStatus(id,status,amount){
  this._require(['seal','fire'].includes(status)&&Number.isInteger(amount)&&amount>=0,'봉인/화재와 0 이상의 정수가 필요합니다.');
  const e=this._entity(id);this._begin();this._status(e,status,amount);
  this._emit('diagnostic','진단 상태 주입 · 정상 플레이 아님',{entityId:id,status,amount});return this.events;
 }
 _visitEffect(e,arrival,attachments){
  if(e.seal||arrival&&e.fire){this._emit('suppressed',this._name(e)+' '+(arrival?'도착':'통과')+' 무효',{sourceId:e.id,floor:e.floor,seal:e.seal,fire:e.fire});return;}
  const d=creatureDef(e),v=this.s.visitor,source=this._name(e)+(arrival?' 도착':' 통과'),floor=e.floor;
  if(e.type==='gaze')this._anxiety(arrival?1:d.passAnxiety,source,floor,e.id);
  if(e.type==='footsteps'&&!arrival)this._anxiety(v.a,source,floor,e.id);
  if(e.type==='owner'&&arrival){
   const before=v.a,spent=Math.ceil(before/2);v.a-=spent;
   this._emit('harvest',source+' · 불안 절반(올림) '+spent+' 소비',{sourceId:e.id,floor,amount:spent,before,after:v.a});
   this._fear(spent*d.harvestMultiplier,source,floor,e.id);
  }
  if(e.type==='safe'&&arrival)this._resource('greed',e.upgraded?2:1,source,floor,e.id);
  if(e.type==='barnacle'&&!arrival){
   const amount=e.barnacleBoost?4:2;attachments.push({id:e.id,amount});
   this._emit('attachment','통과층에 줄 수정 따개비 방어 '+amount+' 예약',{sourceId:e.id,floor,amount});
  }
  const qualifies=e.type==='runes'?this.s.chosen<=3:e.type==='roulette'?this.s.chosen%2===0:false;
  if(qualifies)this._resource('prophecy',arrival?d.arrivalProphecy:1,source,floor,e.id);
 }
 _receiver(target){
  let current=target;const seen=new Set();
  while(this.s.guards[current.id]){
   if(seen.has(current.id))break;seen.add(current.id);
   const guard=this.s.entities.find(e=>e.id===this.s.guards[current.id]&&e.p>0&&e.floor!=null);
   if(!guard)break;current=guard;
  }
  return current;
 }
 _damage(entity,power,kind='hit',extra={}){
  const damage=kind==='penalty'?power:Math.max(0,power-entity.shield);
  super._damage(entity,power,kind,extra);
  if(damage<=0||entity.p<=0||ENDED.has(this.s.phase))return;
  if(entity.type==='safe')this._resource('greed',1,this._name(entity)+' 피격',entity.floor,entity.id);
  if(entity.type==='barnacle'){
   const before=entity.uses;entity.uses=Math.min(CAPS.uses,before+1);
   this._emit('charge',this._name(entity)+' 피격 · 속공 '+before+' → '+entity.uses,{sourceId:entity.id,entityId:entity.id,floor:entity.floor,before,after:entity.uses,amount:entity.uses-before,entity:copy(entity)});
  }
 }
 _clearShields(){
  super._clearShields();
  for(const e of this.s.entities)if(e.barnacleBoost){e.barnacleBoost=false;this._emit('pass_boost_expire',this._name(e)+' 통과 방어 4 → 2',{entityId:e.id,entity:copy(e)});}
 }
 _inactivity(preview=false){
  if(this.s.activity){this.s.inactive=0;this.s.inactiveLimit=3;return [];}
  this.s.inactive++;if(this.s.inactive<this.s.inactiveLimit){this._emit('inactivity','비활동 '+this.s.inactive);return [];}
  this.s.inactive=0;this.s.inactiveLimit=2;const candidates=this._living().sort((a,b)=>a.floor-b.floor);
  if(preview){
   this._emit('penalty_preview','비활동 · 무작위 대상, 방어 무시 공략도 12');
   return candidates.map(e=>{
    const broken=e.c+12>=creatureDef(e).limit,p=e.p-(broken?1:0),survives=p>0;
    const greedAfter=survives&&e.type==='safe'?Math.min(CAPS.greed,this.s.visitor.greed+1):this.s.visitor.greed;
    const usesAfter=survives&&e.type==='barnacle'?Math.min(CAPS.uses,e.uses+1):e.uses;
    const detail=survives&&e.type==='safe'?`생존 시 탐욕 +1 (상한 ${CAPS.greed})`:survives&&e.type==='barnacle'?`생존 시 속공 +1 (상한 ${CAPS.uses})`:'';
    return {id:e.id,name:this._name(e),floor:e.floor,c:broken?0:e.c+12,p,destroyed:p===0,defeat:p===0&&candidates.length===1,greedAfter,usesAfter,nextInactiveLimit:greedAfter>this.s.visitor.greed?3:2,detail};
   });
  }
  if(candidates.length){
   const target=candidates[Math.floor(randomFor(this.s.seed,this.s.act,this.s.currentNode,'penalty',this.s.guestIndex,this.s.visitor.turn)()*candidates.length)];
   this._emit('penalty_start','비활동 표적 결정',{targetId:target.id,floor:target.floor});this._damage(target,12,'penalty');
   if(this.s.activity&&!ENDED.has(this.s.phase)){
    this.s.inactiveLimit=3;
    this._emit('inactivity_reset','패널티 피격 후 실제 자원 증가 · 다음 비활동 기준 3턴');
   }
  }
  return [];
 }
 move(options={}){
  this._require(this.s.phase==='prepare','주사위 확정 뒤 이동하세요.');this._begin();this.uncertainty=[];
  const planned=this.path(),actual=[],passed=[],attachments=[];
  for(let i=0;i<planned.length;i++){
   const floor=planned[i],e=this.entityAt(floor),natural=i===planned.length-1;
   const forced=!natural&&e?.type==='safe'&&e.lure&&!e.seal,arrival=natural||forced;
   this.s.visitor.pos=floor;actual.push(floor);if(!arrival)passed.push(floor);
   this._emit('move',floor+'층 '+(arrival?'도착':'통과'),{floor,arrival});
   if(this.s.escape===floor){
    const skipped=this._node().guests.length-this.s.guestIndex-1;this.s.stats.escaped++;this.s.stats.skipped+=skipped;
    this._emit('escape',floor+'층 탈출',{floor,skipped});
    if(options.preview){this.s.phase=this._node().kind==='boss'?'lost':'service_end';this.s.summary={outcome:'escape'};if(this.s.phase==='lost')this.s.reason='막 보스를 탈출시켜 패배했습니다.';}
    else this._finishService('escape');
    return this.events;
   }
   if(forced)this._emit('lure','금고 유인 · 남은 이동 취소',{sourceId:e.id,floor,originalDestination:planned.at(-1)});
   if(e)this._visitEffect(e,arrival,attachments);
   if(ENDED.has(this.s.phase)){this._settle();return this.events;}
   if(arrival)break;
  }
  const destination=actual.at(-1),recipientFloors=[...new Set(passed)].filter(floor=>floor!==destination);
  for(const {id,amount} of attachments){const source=this._entity(id);for(const floor of recipientFloors){const target=this.entityAt(floor);if(target)this._shield(target,amount,source);}}
  if(options.movementOnly)return this.events;
  for(const {floor,power} of this.attackList(actual)){
   const target=this.entityAt(floor);
   if(target){const receiver=this._receiver(target);this._damage(receiver,power,'hit',{originalTargetId:target.id,originalFloor:floor,redirected:receiver.id!==target.id});}
   else this._emit('miss',floor+'층 빈층으로 빗나감',{floor,power});
   if(ENDED.has(this.s.phase))return this.events;
  }
  this._clearShields();this.uncertainty=this._inactivity(!!options.preview);
  if(!ENDED.has(this.s.phase)){
   for(const e of this.s.entities)for(const status of ['seal','fire'])if(e[status]>0){const before=e[status];e[status]--;this._emit('status_decay',this._name(e)+' '+resourceNames[status]+' −1',{entityId:e.id,status,before,after:e[status],entity:copy(e)});}
   this.s.visitor.turn++;this.s.visitor.rollIndex=0;
   Object.assign(this.s,{phase:'roll',dice:[],chosen:null,chosenSlot:null,choiceEffect:null,activity:false});
  }
  this._settle();return this.events;
 }
 preview(slot=this.s.chosenSlot,actions=[]){
  this._require(['choose','prepare'].includes(this.s.phase),'공개된 눈 또는 확정한 이동만 예고합니다.');
  const clone=this.clone();clone._simulating=true;const start=clone.s.history.length;
  const sourceDie=copy(clone.s.dice.find(d=>d.slot===(this.s.phase==='choose'?slot:this.s.chosenSlot)));
  if(this.s.phase==='choose')clone.choose(slot);else this._require(slot==null||slot===this.s.chosenSlot,'이미 확정한 자리입니다.');
  const selected={...sourceDie,effectiveValue:clone.s.chosen},plannedPath=clone.s.phase==='prepare'?clone.path():[];
  for(const action of actions){
   if(ENDED.has(clone.s.phase))break;
   this._require(clone.s.phase==='prepare','재굴림 이후 새 눈을 미리 보거나 후속 속공을 계획할 수 없습니다.');
   if(action.kind==='active')clone.active(action.entityId,action.targetId);else if(action.kind==='escape')clone.installEscape(action.floor);else throw new Error('지원하지 않는 계획 행동입니다.');
  }
  const requiresRoll=!!clone._pendingRandom;
  selected.effectiveValue=clone.s.chosen;
  const effectivePath=clone.s.phase==='prepare'?clone.path():[];
  if(clone.s.phase==='prepare')clone.move({preview:true});
  const events=clone.s.history.slice(start),uncertainty=copy(clone.uncertainty);
  return {selected,plannedPath,effectivePath,path:events.filter(e=>e.kind==='move').map(e=>e.floor),requiresRoll,known:!requiresRoll,
   uncertaintyMessage:requiresRoll?'새 주사위 눈과 예언 환급량은 실제 재굴림 뒤 공개합니다.':'',state:copy(clone.s),events,
   attacks:events.filter(e=>['hit','miss'].includes(e.kind)).map((e,i)=>({...e,order:i+1})),summary:this._previewSummary(this.s,clone.s,events),uncertainty,uncertainPenalty:copy(uncertainty)};
 }
 expansionPreview({position=0,slot=0,face=0,anxiety=0,greed=0,prophecy=0,fear=0}={}){
  this._require(['map','management','shop','recovery','discovery','event'].includes(this.s.phase),'비전투 설계 비교만 가능합니다.');
  this._require(this.s.floorCount<10,'최대 10층입니다.');
  this._require(Number.isInteger(position)&&position>=0&&position<=this.s.floorCount,'기준 위치가 유효하지 않습니다.');
  this._require(Number.isInteger(slot)&&slot>=0&&slot<3&&Number.isInteger(face)&&face>=0&&face<6,'주사위 자리/면이 유효하지 않습니다.');
  for(const [key,value] of Object.entries({a:anxiety,greed,prophecy}))this._require(Number.isInteger(value)&&value>=0&&value<=CAPS[key],'기준 자원이 유효하지 않습니다.');
  this._require(Number.isFinite(fear)&&fear>=0,'기준 공포가 유효하지 않습니다.');
  const simulate=count=>{
   const c=this.clone();c._simulating=true;c.s.floorCount=count;
   c.s.visitor={id:'design',name:'가상 비교',pos:position,a:anxiety,greed,prophecy,f:fear,t:Infinity,h:1,turn:1,rollIndex:0,pattern:'none'};
   const type=c.s.equipped[slot],value=DICE[type].faces[face];
   c.s.phase='choose';c.s.dice=[{slot,type,face,value}];c.s.escape=null;const start=c.s.history.length,base=copy(c.s);c.choose(slot);c.move({movementOnly:true});
   const events=c.s.history.slice(start),path=events.filter(e=>e.kind==='move').map(e=>e.floor);
   return {floorCount:count,path,events,state:c.s,summary:this._previewSummary(base,c.s,events)};
  };
  return {classification:'hypothetical movement-only comparison',notice:'가상 경로 비교. 선택 효과·이동 효과 포함, 반격·미래 눈 제외.',cost:this.expansionCost(),before:simulate(this.s.floorCount),after:simulate(this.s.floorCount+1)};
 }
 giveUp(){return this.surrender();}
 advance(){throw new Error('선택 없는 손님·전투 전환은 자동 진행합니다.');}
}
