/** Browser-independent user-3 v1.1 campaign and combat rules. */
import {Game as CombatGame, CREATURES, DICE, EXPANSION_COSTS, GUESTS} from './combat-base.mjs';
export {CREATURES,DICE,EXPANSION_COSTS};
export const NODE_TYPES=Object.freeze({normal:'일반 손님 전투',elite:'엘리트 전투',boss:'보스 전투',shop:'상점',recovery:'회복',discovery:'주사위 발견',event:'이벤트'});
export const UPGRADE_TEXT=Object.freeze({U:'통과 불안 2 → 3',Q:'수확 불안 상한 3 → 4 · 최대 공포 12 → 16',B:'전투당 직접 사용 초기 횟수 2 → 3',G:'직접 사용 보호 6 → 8',E:'도착 불안 1 → 3',R:'직접 사용 공략도 감소량 6 → 10'});
export function creatureDef(entityOrType){
  const entity=typeof entityOrType==='string'?{type:entityOrType}:entityOrType;
  if(!entity||!CREATURES[entity.type])throw new Error('알 수 없는 괴이입니다.');
  const {type}=entity,upgraded=!!entity.upgraded,base=CREATURES[type];
  const def={...base,type,upgraded,name:base.name+(upgraded?'+':''),maxUses:type==='B'&&upgraded?3:base.maxUses,
    passAnxiety:type==='U'?(upgraded?3:2):0,arrivalAnxiety:type==='U'?4:type==='E'?(upgraded?3:1):0,
    harvestCap:upgraded&&type==='Q'?4:3,shieldPower:upgraded&&type==='G'?8:6,repairPower:upgraded&&type==='R'?10:6,upgradeText:UPGRADE_TEXT[type]};
  if(type==='U'){def.passText='손님 불안 +'+def.passAnxiety+'.';def.summary='통과: 불안 +'+def.passAnxiety+' · 도착: 불안 +4';}
  if(type==='Q'){def.arrivalText='불안 최대 '+def.harvestCap+' 수확 → 소비 1당 공포 4. 최대 공포 '+def.harvestCap*4+'를 한 번에 부여.';def.summary='도착: 불안 최대 '+def.harvestCap+' → 공포 최대 '+def.harvestCap*4;}
  if(type==='B')def.activeText='손님 공포 +3. 비용: 사용 1회. 전투 준비 최초 진입 시 '+def.maxUses+'회로 복구.';
  if(type==='G'){def.activeText='생존 배치 괴이 하나에 이번 턴 보호 '+def.shieldPower+'. 자신도 가능. 비용: 사용 1회.';def.summary='도착: 방어 1회 충전 · 직접 사용: 보호 '+def.shieldPower;}
  if(type==='E'){def.arrivalText='손님 불안 +'+def.arrivalAnxiety+'.';def.summary='통과: 현재 불안만큼 추가 · 도착: 불안 +'+def.arrivalAnxiety;}
  if(type==='R'){def.activeText='불안 2 소비 → 공략도가 있는 생존 배치 괴이 하나의 공략도 최대 '+def.repairPower+' 감소. 자신도 가능. 토큰 복구 없음.';def.summary='직접 사용: 불안 2 → 공략도 최대 −'+def.repairPower;}
  return def;
}
export const creatureName=entityOrType=>creatureDef(entityOrType).name;
const copy = x => structuredClone(x);
const TYPES=Object.keys(CREATURES), SPECIAL=['long','even','anxiety'];
const COMBAT=new Set(['normal','elite','boss']);
const ENDED=new Set(['guest_end','service_end','anomaly_reward','die_reward','map','won','lost']);
const wrap=(n,count)=>((n-1)%count+count)%count+1;
export function randomFor(...parts){
  let n=2166136261;
  for(const ch of parts.join('/'))n=Math.imul(n^ch.charCodeAt(0),16777619);
  return ()=>{n=(n+0x6D2B79F5)|0;let x=n;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return ((x^x>>>14)>>>0)/4294967296;};
}
function shuffled(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function guest(id,act){
  const g=copy(GUESTS[id]);g.id=id;g.attackBonus=act===3?2:0;
  if(act===3){
    g.t+=4;g.name+=' · 3막 강화';
    g.attackText=g.pattern==='route'?'실제 경로 각 방문 순서대로 공략도 6':g.pattern==='adjacent'?'도착 바로 아래층 8 → 도착층 8':g.pattern==='mirror'?'도착 아래 2층 8 → 위 2층 8':'도착층 공략도 8씩 두 번';
  }
  return g;
}
function roster(act,kind,rng){
  if(kind==='normal'){
    const groups=act===1?[['N1','N1','N2'],['N1','N2','N3'],['N2','N3','N4']]:[['N3','N4','N5'],['N4','N5','N6'],['N5','N6','N6']];
    return groups[Math.floor(rng()*3)].map(id=>guest(id,act));
  }
  if(kind==='elite')return [act===1?{id:'E1',name:'정예 복도 점검원',t:16,h:3,reward:6,pattern:'route',power:4,attackText:'실제 경로 각 방문에 공략도 4'}:act===2?{id:'E2',name:'정예 야간 점검원',t:20,h:3,reward:6,pattern:'route',power:6,attackText:'실제 경로 각 방문에 공략도 6'}:{id:'E3',name:'정예 거울 감찰관',t:24,h:3,reward:6,pattern:'mirror',power:10,attackText:'도착 아래 2층 10 → 위 2층 10'}];
  if(kind==='boss')return [act===1?{...copy(GUESTS.BOSS1),id:'BOSS1'}:act===2?{...copy(GUESTS.BOSS2),id:'BOSS2',reward:8}:{id:'BOSS3',name:'호텔의 조사관 · 최종 조사',t:24,h:3,reward:10,pattern:'final',doublePower:8,mirrorPower:10,attackText:'홀수: 도착층 8씩 두 번 / 짝수: 아래 2층 10 → 위 2층 10'}];
  return null;
}
export function generateMap(seed,act){
  const pairs={2:['event','discovery'],3:['shop','recovery'],4:['elite','event'],5:['discovery','shop'],6:['recovery','elite']};
  const nodes=[];
  for(let depth=1;depth<=8;depth++){
    const rng=randomFor(seed,act,'map',depth);
    const sides=depth<7?shuffled(pairs[depth]||['normal','normal'],rng):[];
    for(const column of depth>=7?[1]:[0,1,2]){
      const kind=depth===8?'boss':depth===7?'recovery':column===1?'normal':sides[column===0?0:1];
      const id=`a${act}-d${depth}-c${column}`;
      const n={id,act,depth,column,kind,status:'unvisited',next:depth===8?[]:depth>=6?[`a${act}-d${depth+1}-c1`]:[0,1,2].filter(c=>Math.abs(c-column)<=1).map(c=>`a${act}-d${depth+1}-c${c}`)};
      if(COMBAT.has(kind))n.guests=roster(act,kind,randomFor(seed,act,id,'roster'));
      nodes.push(n);
    }
  }
  return nodes;
}

export class Game extends CombatGame {
  constructor(seed=31001){
    super(seed);
    delete this.s.web;delete this.s.resets;delete this.s.rewardPending;
    Object.assign(this.s,{version:'user-3-v1.1',act:1,maps:[1,2,3].map(a=>generateMap(seed,a)),currentNode:null,completed:[0,0,0],lastNodes:[null,null,null],phase:'map',reward:null,finalVictory:false,history:[],logs:[],round:0});
    Object.assign(this.s.stats,{visits:0,combats:0,expansions:0,expansionSpent:0,eventRemoved:0,recoveries:0,healedTokens:0,recoveryWasted:0,upgrades:0});
    this.events=[];this._emit('start','새 모험 · 1막 · 6층 · 영혼 4 · 일반 주사위 3개');
  }
  static fromState(state){const game=Object.create(Game.prototype);game.s=copy(state);game.events=[];game.uncertainty=[];return game;}
  clone(){return Game.fromState(this.s);}
  _generateWeb(){} // No blood web is generated, even during the base constructor.
  webReason(){return '블러드 웹과 리셋권은 사용하지 않습니다.';}
  resetWeb(){throw new Error('블러드 웹과 리셋권은 사용하지 않습니다.');}
  _emit(kind,text,extra={}){return super._emit(kind,text,{act:this.s.act,nodeId:this.s.currentNode,visitorSnapshot:copy(this.s.visitor),souls:this.s.money,...extra});}
  _definition(entity){return creatureDef(entity);}
  _name(entity){return creatureName(entity);}
  _add(type,floor=null){const entity=super._add(type,floor);entity.upgraded=false;return entity;}
  _node(){return this.s.maps[this.s.act-1].find(n=>n.id===this.s.currentNode);}
  _key(purpose){return randomFor(this.s.seed,this.s.act,this.s.currentNode,purpose);}
  _requirePlacement(){this._require(['map','management','shop','recovery','discovery','event'].includes(this.s.phase),'지금은 배치를 바꿀 수 없습니다.');}
  availableNodes(){
    if(this.s.phase!=='map')return [];
    const nodes=this.s.maps[this.s.act-1],last=nodes.find(n=>n.id===this.s.lastNodes[this.s.act-1]);
    return copy(nodes.filter(n=>last?last.next.includes(n.id):n.depth===1));
  }
  view(){
    const node=this._node();
    const map=this.s.maps[this.s.act-1].map(({contents,...n})=>copy(n));
    return {version:this.s.version,seed:this.s.seed,act:this.s.act,phase:this.s.phase,currentNode:this.s.currentNode,completed:copy(this.s.completed),visits:this.s.stats.visits,map,availableNodes:this.availableNodes(),
      node:node?copy(node):null,money:this.s.money,souls:this.s.money,floorCount:this.s.floorCount,equipped:copy(this.s.equipped),entities:copy(this.s.entities),visitor:copy(this.s.visitor),guestIndex:this.s.guestIndex,dice:copy(this.s.dice),chosen:this.s.chosen,chosenSlot:this.s.chosenSlot,
      choiceEffect:copy(this.s.choiceEffect),escape:this.s.escape,inactive:this.s.inactive,inactiveLimit:this.s.inactiveLimit,stats:copy(this.s.stats),reward:['anomaly_reward','die_reward'].includes(this.s.phase)?copy(this.s.reward):null,reason:this.s.reason,summary:copy(this.s.summary),events:copy(this.events)};
  }
  visit(nodeId){
    this._require(this.s.phase==='map','현재 노드를 먼저 마치세요.');
    const available=this.availableNodes();
    this._require(available.some(n=>n.id===nodeId),'연결된 다음 노드만 방문할 수 있습니다.');
    this._begin();this.s.currentNode=nodeId;
    const n=this._node();n.status='active';this.s.round=(this.s.act-1)*20+this.s.maps[this.s.act-1].indexOf(n);
    this.s.guestIndex=0;this.s.reward=null;this.s.summary=null;this.s.visitor=null;this.s.dice=[];this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;this.s.escape=null;
    this._emit('visit',`${this.s.act}막 ${n.depth}번째 · ${NODE_TYPES[n.kind]} 방문`,{kindName:n.kind,depth:n.depth,column:n.column,available:available.map(node=>node.id),connections:copy(n.next)});
    if(COMBAT.has(n.kind)){
      const before=copy(this.s.entities);
      for(const e of this.s.entities){e.c=0;e.uses=creatureDef(e).maxUses;e.shield=0;}
      this.s.phase='management';this.s.stats.combats++;n.restored=true;
      this._emit('restore','전투 준비 최초 진입 · 공략도·직접 사용 잔량 복구 · 파훼 토큰과 강화는 이월',{before,after:copy(this.s.entities),guests:copy(n.guests)});
    }else{
      this.s.phase=n.kind;
      const rng=this._key(n.kind+'-contents');
      if(n.kind==='shop')n.contents={stock:Array.from({length:8},(_,slot)=>({slot,type:TYPES[Math.floor(rng()*TYPES.length)],bought:false}))};
      if(n.kind==='discovery')n.contents={die:SPECIAL[Math.floor(rng()*3)]};
      if(n.kind==='recovery')n.contents={budget:2};
      if(n.kind==='event'){
        const event=['luggage','sealed','contract'][Math.floor(rng()*3)];
        n.contents={event,...(event==='luggage'?{die:SPECIAL[Math.floor(rng()*3)]}:event==='sealed'?{creature:TYPES[Math.floor(rng()*6)]}:{})};
      }
      this._emit('node_open',`${NODE_TYPES[n.kind]} 제시물 공개`,{contents:copy(n.contents||{})});
    }
    return this.events;
  }
  place(entityId,floor){this._requirePlacement();const phase=this.s.phase;this.s.phase='management';try{return super.place(entityId,floor);}finally{this.s.phase=phase;}}
  store(entityId){this._requirePlacement();const phase=this.s.phase;this.s.phase='management';try{return super.store(entityId);}finally{this.s.phase=phase;}}
  expansionReason(){if(this.s.phase!=='shop')return '상점에서만 층을 구매할 수 있습니다.';const cost=this.expansionCost();if(cost==null)return '최대 10층입니다.';if(this.s.money<cost)return `영혼 ${cost-this.s.money} 부족`;return '';}
  expand(){
    this._require(!this.expansionReason(),this.expansionReason());this._begin();
    const before=this.s.floorCount,cost=this.expansionCost(),moneyBefore=this.s.money,layout=copy(this.s.entities);
    this.s.floorCount++;this.s.money-=cost;this.s.stats.spent+=cost;this.s.stats.expansions++;this.s.stats.expansionSpent+=cost;
    this._emit('expand',`${before}층 → ${this.s.floorCount}층 · 영혼 ${cost} 사용`,{before,after:this.s.floorCount,cost,moneyBefore,moneyAfter:this.s.money,beforeLayout:layout,afterLayout:copy(this.s.entities),newEmptyFloor:this.s.floorCount});return this.events;
  }
  expansionPreview(options={}){this._require(['map','management','shop','recovery','discovery','event'].includes(this.s.phase),'비전투 화면에서만 설계를 비교합니다.');const clone=this.clone();clone.s.phase='management';clone._simulating=true;return CombatGame.prototype.expansionPreview.call(clone,options);}
  buy(slot){
    this._require(this.s.phase==='shop','상점 노드에서만 구매할 수 있습니다.');
    const item=this._node().contents.stock.find(i=>i.slot===slot);
    this._require(item&&!item.bought,'구매 가능한 상품 슬롯을 고르세요.');
    const price=CREATURES[item.type].price;this._require(this.s.money>=price,'영혼이 부족합니다.');this._begin();
    const moneyBefore=this.s.money;this.s.money-=price;this.s.stats.spent+=price;item.bought=true;const entity=this._add(item.type);
    this._emit('purchase',`${CREATURES[item.type].name} 구매 · 영혼 ${price} 사용 · 보관함 추가`,{slot,type:item.type,price,entityId:entity.id,moneyBefore,moneyAfter:this.s.money,entity:copy(entity)});return this.events;
  }
  leave(){this._require(['shop','event'].includes(this.s.phase),'이 화면에서는 해당 선택을 먼저 마치세요.');this._begin();this._complete('leave');return this.events;}
  recover(allocations){
    this._require(this.s.phase==='recovery'&&this._node()?.status==='active','회복 노드에서만 토큰을 회복할 수 있습니다.');
    this._require(allocations&&typeof allocations==='object'&&!Array.isArray(allocations),'개체별 회복 배분을 선택하세요.');
    const plan=Object.entries(allocations).map(([id,amount])=>{
      this._require(Number.isInteger(amount)&&amount>=0,'회복량은 0 이상의 정수여야 합니다.');
      const entity=this._entity(id),max=creatureDef(entity).maxP;
      this._require(entity.p+amount<=max,'현재 최대 파훼 토큰을 넘겨 회복할 수 없습니다.');
      return {entity,amount,max};
    });
    const total=plan.reduce((sum,p)=>sum+p.amount,0);
    this._require(total>=1&&total<=2,'호텔 전체 합계 1~2토큰을 배분하거나 건너뛰세요.');
    this._begin();
    const changes=[];
    for(const {entity,amount,max} of plan){if(!amount)continue;const before=entity.p;entity.p+=amount;changes.push({id:entity.id,name:this._name(entity),floor:entity.floor,upgraded:entity.upgraded,max,before,after:entity.p,amount});}
    this.s.stats.recoveries++;this.s.stats.healedTokens+=total;this.s.stats.recoveryWasted+=2-total;
    this._emit('recovery',`파훼 토큰 ${total}개 회복 · 남은 ${2-total}개 소멸 · 영혼 변동 없음`,{choice:'recover',changes,amount:total,wasted:2-total});
    this._complete('recovery');return this.events;
  }
  upgrade(entityId){
    this._require(this.s.phase==='recovery'&&this._node()?.status==='active','회복 노드에서만 괴이를 강화할 수 있습니다.');
    const entity=this._entity(entityId);this._require(!entity.upgraded,'이미 강화된 개체입니다.');
    const before=copy(entity),beforeDef=creatureDef(entity);this._begin();entity.upgraded=true;this.s.stats.upgrades++;
    this._emit('upgrade',`${this._name(entity)} 강화 · ${UPGRADE_TEXT[entity.type]} · 파훼 토큰·공략도·현재 사용 잔량 유지`,{choice:'upgrade',entityId,entity:copy(entity),before,after:copy(entity),beforeEffect:beforeDef,afterEffect:creatureDef(entity)});
    this._complete('upgrade');return this.events;
  }
  skipRecovery(){
    this._require(this.s.phase==='recovery'&&this._node()?.status==='active','지금은 회복 노드가 아닙니다.');this._begin();this.s.stats.recoveryWasted+=2;
    this._emit('recovery_skip','회복 노드 건너뛰기 · 토큰·강화·영혼 변화 없음',{choice:'skip',amount:0,wasted:2});this._complete('skip_recovery');return this.events;
  }
  _complete(outcome){
    const n=this._node();this._require(n&&n.status==='active','이미 완료했거나 진행 중인 노드가 없습니다.');
    n.status='completed';n.outcome=outcome;
    for(const other of this.s.maps[this.s.act-1])if(other.depth===n.depth&&other.id!==n.id)other.status='closed';
    this.s.completed[this.s.act-1]++;this.s.lastNodes[this.s.act-1]=n.id;this.s.stats.visits++;
    const outcomeName={clear:'전투 완승',escape:'탈출',leave:'떠나기',die:'주사위 교체',skip_die:'주사위 건너뛰기',event:'이벤트 선택',recovery:'토큰 회복',upgrade:'괴이 강화',skip_recovery:'회복 건너뛰기'}[outcome]||outcome;
    this._emit('node_complete',`${this.s.act}막 ${n.depth}/8 완료 · ${outcomeName}`,{outcome,depth:n.depth});
    this.s.currentNode=null;this.s.reward=null;this.s.visitor=null;this.s.escape=null;this.s.dice=[];this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;this.s.inactive=0;this.s.inactiveLimit=3;this.s.activity=false;
    this._clearShields();
    if(n.kind==='boss'){
      if(this.s.act===3){this.s.phase='won';this.s.reason='3막 보스 처치와 마지막 괴이 보상을 마쳤습니다.';this._emit('won',this.s.reason);return;}
      this.s.act++;this._emit('act_start',`${this.s.act}막 시작 · 자산·남은 파훼 토큰·강화 유지`,{entities:copy(this.s.entities),equipped:copy(this.s.equipped),floorCount:this.s.floorCount});
    }
    this.s.phase='map';
  }
  claimCreature(index){
    this._require(this.s.phase==='anomaly_reward','괴이 보상 선택 단계가 아닙니다.');
    const type=this.s.reward?.creatures[index];this._require(Number.isInteger(index)&&type,'공개된 세 후보 중 하나를 고르세요.');this._begin();
    const entity=this._add(type);this._emit('creature_reward',`${CREATURES[type].name} 무료 획득 · 새 기본형 개체 보관함 추가`,{candidates:copy(this.s.reward.creatures),index,type,entityId:entity.id,entity:copy(entity)});
    if(this._node().kind==='elite'){
      this.s.phase='die_reward';this.s.reward={die:SPECIAL[Math.floor(this._key('elite-die')()*3)]};this._emit('die_offer','엘리트 추가 주사위 1개 · 교체 또는 건너뛰기',{die:this.s.reward.die});
    }else this._complete('clear');
    return this.events;
  }
  _replaceDie(type,slot){this._require(Number.isInteger(slot)&&slot>=0&&slot<3,'교체할 장착 자리 0~2를 고르세요.');const oldType=this.s.equipped[slot];this.s.equipped[slot]=type;this._emit('die_reward',`${slot+1}번 ${DICE[oldType].name} → ${DICE[type].name} · 영혼 증감 없음`,{slot,oldType,type,equipped:copy(this.s.equipped)});}
  claimDie(slot){this._require(['discovery','die_reward'].includes(this.s.phase),'현재 주사위 획득 기회가 없습니다.');const type=this.s.phase==='discovery'?this._node().contents.die:this.s.reward.die;this._require(Number.isInteger(slot)&&slot>=0&&slot<3,'교체할 장착 자리 0~2를 고르세요.');this._begin();this._replaceDie(type,slot);this._complete('die');return this.events;}
  skipDie(){this._require(['discovery','die_reward'].includes(this.s.phase),'현재 건너뛸 주사위 기회가 없습니다.');this._begin();this._emit('die_skip','주사위 건너뛰기 · 장비·영혼 유지');this._complete('skip_die');return this.events;}
  eventChoose(option,argument){
    this._require(this.s.phase==='event','이벤트 선택 단계가 아닙니다.');
    const content=this._node().contents;
    if(option==='leave')return this.leave();
    if(content.event==='luggage'){
      this._require(['die','souls'].includes(option),'주사위 교체·영혼·떠나기 중 고르세요.');
      if(option==='die')this._require(Number.isInteger(argument)&&argument>=0&&argument<3,'교체 자리 0~2가 필요합니다.');
      this._begin();if(option==='die')this._replaceDie(content.die,argument);else{const moneyBefore=this.s.money;this.s.money+=4;this.s.stats.earned+=4;this._emit('event_souls','짐 대신 영혼 4 획득',{amount:4,moneyBefore,moneyAfter:this.s.money});}
    }else if(content.event==='sealed'){
      this._require(option==='buy','획득 또는 떠나기 중 고르세요.');this._require(this.s.money>=3,'영혼 3이 필요합니다.');this._begin();const moneyBefore=this.s.money;this.s.money-=3;this.s.stats.spent+=3;const e=this._add(content.creature);this._emit('event_buy',`${CREATURES[content.creature].name} 획득 · 영혼 3`,{price:3,entityId:e.id,type:e.type,entity:copy(e),moneyBefore,moneyAfter:this.s.money});
    }else{
      this._require(option==='sacrifice','괴이 제거 거래 또는 떠나기 중 고르세요.');this._require(this.s.entities.filter(e=>e.p>0).length>=2,'살아 있는 보유 괴이를 최소 1개 남겨야 합니다.');const e=this._entity(argument);this._begin();const moneyBefore=this.s.money;this.s.entities=this.s.entities.filter(x=>x.id!==e.id);this.s.money+=4;this.s.stats.earned+=4;this.s.stats.eventRemoved++;this._emit('event_remove',`${this._name(e)} 영구 제거${e.upgraded?' · 강화 함께 소멸':''} · 영혼 4`,{entityId:e.id,type:e.type,floor:e.floor,amount:4,entity:copy(e),upgraded:!!e.upgraded,moneyBefore,moneyAfter:this.s.money});
    }
    this._emit('event_result','이벤트 선택 확정',{event:content.event,option});this._complete('event');return this.events;
  }
  startService(){
    this._require(this.s.phase==='management'&&COMBAT.has(this._node()?.kind),'전투 준비에서만 시작합니다.');this._require(this._living().length>0,'살아 있는 괴이를 한 개 이상 배치하세요.');this._begin();
    this.s.guestIndex=0;this.s.serviceStartStats=copy(this.s.stats);this._emit('service_start','영업 시작 · 준비에서 완료한 복구를 반복하지 않습니다.');this._startGuest(false);return this.events;
  }
  _startGuest(resetProgress=true){
    if(resetProgress){const before=copy(this.s.entities);for(const e of this.s.entities){e.c=0;e.shield=0;}this._emit('guest_boundary','다음 손님 준비 · 공략도만 초기화 · 파훼 토큰·직접 사용 잔량·강화 유지',{before,after:copy(this.s.entities)});}
    const def=this._node().guests[this.s.guestIndex];this.s.visitor={...copy(def),f:0,a:0,pos:0,turn:1};
    this.s.phase='roll';this.s.dice=[];this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;this.s.inactive=0;this.s.inactiveLimit=3;this.s.activity=false;
    this._emit('guest_start',`${def.name} 입장 · 공포 한계 ${def.t} · 심장 ${def.h}`,{guest:copy(def),guestIndex:this.s.guestIndex});
  }
  roll(){
    this._require(this.s.phase==='roll','지금은 주사위를 굴릴 수 없습니다.');this._begin();
    this.s.dice=this.s.equipped.map((type,slot)=>{const face=Math.floor(randomFor(this.s.seed,this.s.act,this.s.currentNode,'dice',this.s.guestIndex,this.s.visitor.turn,slot)()*6),value=DICE[type].faces[face];return {slot,type,face,value,bonus:type==='anxiety'&&value===3?1:0};});
    this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;this.s.phase='choose';this.s.activity=false;this._emit('roll','주사위 공개: '+this.s.dice.map(d=>(d.slot+1)+'번 '+DICE[d.type].name+' '+d.value+'칸'+(d.bonus?' · 선택 시 불안 +1':'')).join(' / '),{dice:copy(this.s.dice)});return this.events;
  }
  _fear(amount,source,floor){
    if(amount<=0)return;const v=this.s.visitor,before=v.f;this.s.activity=true;v.f+=amount;
    this._emit('fear',`${source} · 공포 ${before} → ${v.f}`,{floor,source,before,after:v.f,amount,threshold:v.t});
    if(v.f>=v.t){
      v.h--;this._emit('heart',`심장마비 · 남은 심장 ${v.h}`,{floor,before:v.h+1,after:v.h,amount:1,threshold:v.t});
      const saturated=v.f;v.f=0;this._emit('fear_reset','심장마비 뒤 공포 0으로 초기화',{floor,before:saturated,after:0});
      if(v.h===0){const moneyBefore=this.s.money;this.s.money+=v.reward;this.s.stats.earned+=v.reward;this.s.stats.kills++;this._emit('kill',`${v.name} 처치 · 영혼 +${v.reward} · 남은 이동·공격 취소`,{floor,reward:v.reward,moneyBefore,moneyAfter:this.s.money});this._clearShields();this.s.phase=this.s.guestIndex===this._node().guests.length-1?'service_end':'guest_end';}
    }
  }
  _settle(){
    if(this._simulating)return;
    if(this.s.phase==='guest_end'){this.s.guestIndex++;this._startGuest();}
    else if(this.s.phase==='service_end')this._finishService('clear');
  }
  active(entityId,targetId=null){const result=super.active(entityId,targetId);this._settle();return this.events;}
  _finishService(outcome){
    this._clearShields();const n=this._node(),start=this.s.serviceStartStats||{};
    this.s.summary={nodeId:n.id,kind:n.kind,outcome,...Object.fromEntries(['kills','escaped','skipped','earned','destroyed'].map(k=>[k,this.s.stats[k]-(start[k]||0)]))};
    this._emit('service_end',`${NODE_TYPES[n.kind]} ${outcome==='escape'?'탈출 종료':'완승'}`,{outcome,summary:copy(this.s.summary)});
    if(outcome==='escape'){
      if(n.kind==='boss'){this.s.phase='lost';this.s.reason='막 보스를 탈출시켜 패배했습니다.';this._emit('lost',this.s.reason);}else this._complete('escape');
      return;
    }
    if(this.s.act===3&&n.kind==='boss')this.s.finalVictory=true;
    this.s.phase='anomaly_reward';this.s.reward={creatures:shuffled(TYPES,this._key('creature-reward')).slice(0,3)};
    this._emit('creature_offer','괴이 3개 중 1개 무료 선택',{candidates:copy(this.s.reward.creatures)});
  }
  attackList(path){
    if(!this.s.visitor||!path.length)return [];const v=this.s.visitor,d=path.at(-1);let pattern=v.pattern;
    if(pattern==='final')pattern=v.turn%2?'double':'bossMirror';
    const power=v.power??((pattern==='route'?4:pattern==='bossMirror'?8:6)+(v.attackBonus||0));
    if(pattern==='none')return [];
    if(pattern==='route')return path.map(floor=>({floor,power}));
    if(pattern==='adjacent')return [{floor:wrap(d-1,this.s.floorCount),power},{floor:d,power}];
    if(pattern==='mirror'||pattern==='bossMirror'){const p=v.mirrorPower??power;return [{floor:wrap(d-2,this.s.floorCount),power:p},{floor:wrap(d+2,this.s.floorCount),power:p}];}
    return [{floor:d,power:v.doublePower??power},{floor:d,power:v.doublePower??power}];
  }
  _inactivity(preview=false){
    if(this.s.activity){this.s.inactive=0;this.s.inactiveLimit=3;return [];}
    this.s.inactive++;
    if(this.s.inactive<this.s.inactiveLimit){this._emit('inactivity',`비활동 ${this.s.inactive}턴 · 기준 ${this.s.inactiveLimit}`);return [];}
    this.s.inactive=0;this.s.inactiveLimit=2;const candidates=this._living().sort((a,b)=>a.floor-b.floor);
    if(preview){this._emit('penalty_preview','무작위 생존 배치 괴이 하나에 공략도 12 · 표적 미공개');return candidates.map(e=>({id:e.id,floor:e.floor,name:this._name(e),c:0,p:e.p-1,destroyed:e.p===1,defeat:e.p===1&&candidates.length===1}));}
    if(candidates.length){const target=candidates[Math.floor(randomFor(this.s.seed,this.s.act,this.s.currentNode,'penalty',this.s.guestIndex,this.s.visitor.turn)()*candidates.length)];this._emit('penalty_start','비활동 패널티 표적 결정',{floor:target.floor,targetId:target.id,candidates:candidates.map(e=>({id:e.id,floor:e.floor}))});this._damage(target,12,'penalty');}return [];
  }
  move(options={}){
    this._require(this.s.phase==='prepare','주사위를 확정한 뒤 이동하세요.');this._begin();this.uncertainty=[];
    const path=this.path(this.s.chosen);this._require(path.length>0,'이동 거리가 없습니다.');
    for(let i=0;i<path.length;i++){
      const floor=path[i],arrival=i===path.length-1;this.s.visitor.pos=floor;this._emit('move',`${floor}층 ${arrival?'도착':'통과'}`,{floor,arrival});
      if(this.s.escape===floor){
        this.s.stats.escaped++;const skipped=this._node().guests.length-this.s.guestIndex-1;this.s.stats.skipped+=skipped;
        this._emit('escape',`${floor}층 탈출 · 미등장 ${skipped}명 무보상`,{floor,skipped});
        if(options.preview){
          this.s.phase=this._node().kind==='boss'?'lost':'service_end';this.s.summary={outcome:'escape'};
          if(this.s.phase==='lost'){this.s.reason='막 보스를 탈출시켜 패배했습니다.';this._emit('lost',this.s.reason);}
        }else this._finishService('escape');
        return this.events;
      }
      const e=this.entityAt(floor);if(!e)continue;const source=this._name(e)+(arrival?' 도착':' 통과'),def=creatureDef(e);
      if(e.type==='U')this._anxiety(arrival?def.arrivalAnxiety:def.passAnxiety,source,floor);
      if(e.type==='E')this._anxiety(arrival?def.arrivalAnxiety:this.s.visitor.a,source,floor);
      if(e.type==='Q'&&arrival){const spent=Math.min(def.harvestCap,this.s.visitor.a);this.s.visitor.a-=spent;this._emit('harvest',`${floor}층 ${this._name(e)} 불안 ${spent} 소비`,{floor,source:this._name(e),amount:spent,before:this.s.visitor.a+spent,after:this.s.visitor.a});this._fear(spent*4,source,floor);}
      if(e.type==='B'&&arrival)this._fear(3,source,floor);
      if(e.type==='G'&&arrival){const before=e.uses;e.uses=Math.min(2,e.uses+1);this._emit('charge',`${floor}층 방어 ${before} → ${e.uses} · 다음 턴부터`,{floor,entityId:e.id,name:this._name(e),before,after:e.uses,amount:e.uses-before,wasted:1-(e.uses-before)});}
      if(ENDED.has(this.s.phase)){this._settle();return this.events;}
    }
    if(options.movementOnly)return this.events;
    for(const {floor,power} of this.attackList(path)){const e=this.entityAt(floor);if(e)this._damage(e,power);else this._emit('miss',`${floor}층 빈층으로 공격 빗나감`,{floor,power});if(ENDED.has(this.s.phase))return this.events;}
    this._clearShields();this.uncertainty=this._inactivity(!!options.preview);
    if(!ENDED.has(this.s.phase)){this.s.visitor.turn++;this.s.phase='roll';this.s.dice=[];this.s.chosen=null;this.s.chosenSlot=null;this.s.choiceEffect=null;}
    this._settle();return this.events;
  }
  preview(slot=this.s.chosenSlot,actions=[]){
    this._require(['choose','prepare'].includes(this.s.phase),'공개된 주사위만 미리볼 수 있습니다.');const clone=this.clone();clone._simulating=true;const all=[];
    if(this.s.phase==='choose'){clone.choose(slot);all.push(...clone.events);}else this._require(slot==null||slot===this.s.chosenSlot,'이미 확정한 자리입니다.');
    const selected=copy(clone.s.dice.find(d=>d.slot===clone.s.chosenSlot)),plannedPath=clone.path();
    for(const action of actions){if(clone.s.phase!=='prepare')break;if(action.kind==='active')clone.active(action.entityId,action.targetId);else if(action.kind==='escape')clone.installEscape(action.floor);else throw new Error('미리보기 행동 종류가 잘못되었습니다.');all.push(...clone.events);}
    if(clone.s.phase==='prepare'){clone.move({preview:true});all.push(...clone.events);}
    return {selected,plannedPath,path:all.filter(e=>e.kind==='move').map(e=>e.floor),state:copy(clone.s),events:all,attacks:all.filter(e=>['hit','miss'].includes(e.kind)).map((e,i)=>({...e,order:i+1})),summary:this._previewSummary(this.s,clone.s,all),uncertainty:copy(clone.uncertainty||[]),uncertainPenalty:copy(clone.uncertainty||[])};
  }
  advance(){throw new Error('선택 없는 손님·영업 전환은 자동 진행합니다.');}
  giveUp(){this._require(!['won','lost'].includes(this.s.phase)&&!this.s.finalVictory,'이미 승패가 확정되었습니다.');return super.surrender();}
  surrender(){return this.giveUp();}
}
