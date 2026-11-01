import {CREATURES,DICE,CAPS,EXPANSION_COSTS,STARTERS,creatureDef,creatureName,RULE_VERSION} from './catalog.mjs';
const copy=x=>structuredClone(x);
export const wrap=(n,count)=>((n-1)%count+count)%count+1;

/** Shared low-level operations; all campaign decisions are supplied by Campaign. */
export class CombatCore{
  constructor(seed=31001){
    if(!Number.isSafeInteger(seed))throw new Error('난수 번호는 안전한 정수여야 합니다.');
    this.s={version:RULE_VERSION,seed,phase:'initializing',entities:[],nextId:1,money:4,floorCount:6,equipped:['normal','normal','normal'],
      visitor:null,dice:[],chosen:null,chosenSlot:null,choiceEffect:null,escape:null,guards:{},activity:false,inactive:0,inactiveLimit:3,
      history:[],logs:[],stats:{kills:0,escaped:0,skipped:0,earned:0,spent:0,destroyed:0},reason:'',summary:null};
    this.events=[];this.uncertainty=[];
    for(const [type,floor] of STARTERS)this._add(type,floor);
    this.s.phase='map';
  }
  _begin(){this.events=[];}
  _require(ok,message){if(!ok)throw new Error(message);}
  _definition(e){return creatureDef(e);}
  _name(e){return creatureName(e);}
  _emit(kind,text,extra={}){
    const source=extra.sourceId?this.s.entities.find(e=>e.id===extra.sourceId):null;
    const event={kind,text,act:this.s.act,nodeId:this.s.currentNode,turn:this.s.visitor?.turn??null,
      ...(source?{sourceType:source.type,sourceOrigin:copy(source.origin)}:{}),...extra,
      visitorSnapshot:copy(this.s.visitor),souls:this.s.money};
    this.events.push(event);this.s.history.push(copy(event));this.s.logs.push(text);return event;
  }
  _add(type,floor=null){
    const d=creatureDef(type);
    this._require(floor===null||Number.isInteger(floor)&&floor>=1&&floor<=this.s.floorCount,'배치 층이 유효하지 않습니다.');
    this._require(floor===null||!this.entityAt(floor),'이미 점유된 층입니다.');
    const origin={kind:({initializing:'start',shop:'shop',anomaly_reward:'free_reward',event:'event'})[this.s.phase]||'diagnostic',nodeId:this.s.currentNode??null,act:this.s.act??1};
    const e={id:'e'+this.s.nextId++,type,floor,c:0,p:d.maxP,uses:d.initialUses,shield:0,seal:0,fire:0,lure:false,upgraded:false,origin};
    this.s.entities.push(e);return e;
  }
  _entity(id){const e=this.s.entities.find(e=>e.id===id&&e.p>0);this._require(e,'생존 괴이 ID가 필요합니다.');return e;}
  entityAt(floor){return this.s.entities.find(e=>e.floor===floor&&e.p>0)||null;}
  _living(){return this.s.entities.filter(e=>e.floor!=null&&e.p>0);}
  place(id,floor){
    this._require(this.s.phase==='management','지금은 배치할 수 없습니다.');
    const e=this._entity(id);this._require(Number.isInteger(floor)&&floor>=1&&floor<=this.s.floorCount,'실제 층을 고르세요.');
    const other=this.entityAt(floor),from=e.floor;this._begin();
    if(other&&other.id!==id)other.floor=from;
    e.floor=floor;this._emit('place',this._name(e)+' 배치',{entityId:id,from,floor,entity:copy(e),swapped:other?.id});return this.events;
  }
  store(id){this._require(this.s.phase==='management','지금은 보관할 수 없습니다.');const e=this._entity(id);this._begin();const from=e.floor;e.floor=null;this._emit('store',this._name(e)+' 보관',{entityId:id,from,entity:copy(e)});return this.events;}
  expansionCost(){return EXPANSION_COSTS[this.s.floorCount-6]??null;}
  choose(slot){
    this._require(this.s.phase==='choose','공개된 주사위를 고르는 단계가 아닙니다.');
    const die=this.s.dice.find(d=>d.slot===slot);this._require(Number.isInteger(slot)&&die,'주사위 자리 0~2를 고르세요.');
    this._begin();this.s.chosenSlot=slot;this.s.chosen=die.value;this.s.phase='prepare';this.s.choiceEffect={slot,roll:this.s.visitor.rollIndex,applied:true};
    this._emit('choose',die.value+'칸 이동 확정',{slot,type:die.type,value:die.value,face:die.face,rollIndex:this.s.visitor.rollIndex});
    if(die.type==='anxiety'&&die.value===3)this._anxiety(1,'불안 주사위 선택',null);
    return this.events;
  }
  path(value=this.s.chosen){
    this._require(Number.isInteger(value)&&value>=1,'확정한 양수 이동 거리가 필요합니다.');
    return Array.from({length:value},(_,i)=>wrap(this.s.visitor.pos+i+1,this.s.floorCount));
  }
  installEscape(floor){
    this._require(this.s.phase==='prepare','주사위를 확정한 뒤 출구를 설치하세요.');
    this._require(this.s.escape===null,'이 전투에 이미 출구가 있습니다.');
    this._require(Number.isInteger(floor)&&floor>=1&&floor<=this.s.floorCount&&!this.entityAt(floor),'빈층을 고르세요.');
    this._begin();this.s.escape=floor;this._emit('escape_install',floor+'층 출구 설치',{floor});return this.events;
  }
  _resource(key,amount,source,floor=null,sourceId=null){
    const before=this.s.visitor[key],after=Math.min(CAPS[key],before+amount),actual=after-before;
    this.s.visitor[key]=after;if(actual>0)this.s.activity=true;
    return this._emit(key==='a'?'anxiety':'resource',source+' · '+key+' '+before+' → '+after,
      {resource:key,before,after,amount:actual,requested:amount,wasted:amount-actual,floor,source,sourceId});
  }
  _anxiety(amount,source,floor,sourceId=null){return this._resource('a',amount,source,floor,sourceId);}
  _shield(target,amount,source){
    target.shield+=amount;this._emit('shield',this._name(target)+' 방어 +'+amount,{sourceId:source.id,targetId:target.id,floor:target.floor,amount,entity:copy(target)});
  }
  _clearShields(){
    for(const e of this.s.entities){if(e.shield)this._emit('shield_expire',this._name(e)+' 남은 방어 제거',{entityId:e.id,amount:e.shield});e.shield=0;}
    this.s.guards={};
  }
  _damage(entity,power,kind='hit',extra={}){
    const before=copy(entity),limit=creatureDef(entity).limit;
    const absorbed=kind==='penalty'?0:Math.min(entity.shield,power);entity.shield-=absorbed;
    const damage=power-absorbed;entity.c+=damage;let broken=false;
    if(entity.c>=limit){entity.c=0;entity.p--;broken=true;}
    this._emit(kind,this._name(entity)+' 피해 '+damage+(absorbed?' · 방어 흡수 '+absorbed:''),
      {...extra,targetId:entity.id,targetType:entity.type,targetOrigin:copy(entity.origin),floor:entity.floor,power,absorbed,damage,limit,before,after:copy(entity),broken,entity:copy(entity)});
    if(entity.p===0){
      this.s.stats.destroyed++;this.s.entities=this.s.entities.filter(e=>e.id!==entity.id);
      for(const [id,guard] of Object.entries(this.s.guards))if(id===entity.id||guard===entity.id)delete this.s.guards[id];
      this._emit('destroy',this._name(entity)+' 영구 파괴',{entityId:entity.id,type:entity.type,floor:entity.floor,origin:copy(entity.origin)});
      if(!this._living().length){this.s.phase='lost';this.s.reason='배치 괴이가 전멸했습니다.';this._emit('lost',this.s.reason);}
    }
  }
  _previewSummary(before,state,events){
    const moves=events.filter(e=>e.kind==='move');
    const losses=before.entities.filter(e=>e.floor!=null).map(e=>{
      const after=state.entities.find(x=>x.id===e.id);
      return {id:e.id,floor:e.floor,name:this._name(e),beforeC:e.c,afterC:after?.c??0,beforeP:e.p,afterP:after?.p??0,tokens:e.p-(after?.p??0),destroyed:!after};
    }).filter(e=>e.tokens>0||e.destroyed);
    return {destination:moves.at(-1)?.floor??state.visitor?.pos??0,fear:events.filter(e=>e.kind==='fear').reduce((n,e)=>n+e.amount,0),
      hearts:events.filter(e=>e.kind==='heart').length,killed:events.some(e=>e.kind==='kill'),escaped:events.some(e=>e.kind==='escape'),lost:state.phase==='lost',
      retaliation:events.some(e=>e.kind==='hit'||e.kind==='miss'),losses,charges:events.filter(e=>e.kind==='charge'),
      anxietyBefore:before.visitor?.a??0,anxietyAfter:state.visitor?.a??0,greedAfter:state.visitor?.greed??0,prophecyAfter:state.visitor?.prophecy??0,
      fearAfter:state.visitor?.f??0,heartsAfter:state.visitor?.h??0,choiceBonus:events.filter(e=>e.kind==='anxiety'&&e.floor==null).reduce((n,e)=>n+e.amount,0)};
  }
  surrender(){this._require(!['won','lost'].includes(this.s.phase)&&!this.s.finalVictory,'이미 승패가 확정되었습니다.');this._begin();this.s.phase='lost';this.s.reason='플레이어가 포기했습니다.';this._emit('lost',this.s.reason);return this.events;}
}
