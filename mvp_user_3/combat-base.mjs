/** Local combat primitives. engine.js supplies user-3 campaign and per-instance definitions. */
export const ANXIETY_CAP = 20;
export const CREATURES = Object.freeze({
  U: {name:'문틈의 속삭임',role:'불안 공급',passText:`손님 불안 2 증가 (상한 ${ANXIETY_CAP})`,arrivalText:`손님 불안 4 증가 (상한 ${ANXIETY_CAP})`,activeText:'효과 없음',price:3,maxP:2,maxUses:0,color:'#d4af75',shape:'triangle',summary:'통과: 불안 +2 · 도착: 불안 +4'},
  Q: {name:'이름을 부르는 객실',role:'불안 수확',passText:'효과 없음',arrivalText:'불안 전부 소비 → 소비한 불안 1당 공포 1을 한 번에 부여',activeText:'효과 없음',price:4,maxP:2,maxUses:0,color:'#b192d1',shape:'diamond',summary:'도착: 불안 전부 → 공포 1배'},
  B: {name:'빈 프런트의 호출벨',role:'즉시 공격',passText:'효과 없음',arrivalText:'손님 공포 +3.',activeText:'손님 공포 +3.',price:3,maxP:1,maxUses:2,color:'#d88378',shape:'circle',summary:'도착: 공포 +3 · 직접 사용: 공포 +3',activeLabel:'공포 3 주기'},
  G: {name:'닫히지 않는 방화문',role:'보호·충전',passText:'효과 없음',arrivalText:'방어 1회 충전. 최대 2회, 다음 턴부터 사용.',activeText:'살아 있는 배치 괴이 하나에 이번 턴 보호 6. 자신도 선택 가능.',price:4,maxP:2,maxUses:2,color:'#77ad9b',shape:'square',summary:'도착: 방어 1회 충전 · 직접 사용: 보호 6',activeLabel:'보호하기'},
  E: {name:'따라오는 발자국',role:'불안 증폭',passText:`현재 불안만큼 추가. 불안 0이면 증가 없음, 불안 상한 ${ANXIETY_CAP}.`,arrivalText:'손님 불안 +1.',activeText:'효과 없음',price:3,maxP:1,maxUses:0,color:'#8caccb',shape:'hexagon',summary:'통과: 현재 불안만큼 추가 · 도착: 불안 +1'},
  R: {name:'벽을 꿰매는 그림자',role:'공략도 수리',passText:'효과 없음',arrivalText:'효과 없음',activeText:'이동 전에 손님 불안 2 소비 → 살아 있는 배치 괴이 하나의 공략도 최대 6 감소. 공략도가 1 이상인 대상 필요, 자신도 가능. 파훼 토큰은 복구하지 않음',price:4,maxP:2,maxUses:0,color:'#c6b98d',shape:'cross',summary:'직접 사용: 불안 2 → 공략도 최대 −6',activeLabel:'공략도 줄이기'}
});

export const DICE = Object.freeze({
  normal: Object.freeze({name:'일반 주사위',faces:Object.freeze([1,2,3,4,5,6]),effectText:'추가 효과 없음'}),
  long: Object.freeze({name:'장거리 주사위',faces:Object.freeze([1,2,3,4,5,8]),effectText:'추가 효과 없음 · 8칸 이동 가능'}),
  even: Object.freeze({name:'짝수 주사위',faces:Object.freeze([2,2,4,4,6,6]),effectText:'추가 효과 없음 · 2·4·6만 나옴'}),
  anxiety: Object.freeze({name:'불안 주사위',faces:Object.freeze([1,1,3,3,5,5]),effectText:`눈 3을 선택하면 이동 전에 불안 +1 (상한 ${ANXIETY_CAP})`})
});
export const EXPANSION_COSTS = Object.freeze([4,6,8,10]);

export const GUESTS = Object.freeze({
  N1:{name:'성급한 투숙객',t:12,h:1,reward:2,pattern:'double',attackText:'도착층에 공략도 6씩 두 번'},
  N2:{name:'복도 점검원',t:12,h:1,reward:2,pattern:'route',attackText:'이동한 모든 층에 순서대로 공략도 4'},
  N3:{name:'옆방을 확인하는 손님',t:16,h:1,reward:2,pattern:'adjacent',attackText:'도착층 바로 아래층에 공략도 6 → 도착층에 공략도 6'},
  N4:{name:'두 번 확인하는 손님',t:12,h:2,reward:2,pattern:'double',attackText:'도착층에 공략도 6씩 두 번'},
  N5:{name:'야간 점검원',t:16,h:2,reward:2,pattern:'route',attackText:'이동한 모든 층에 순서대로 공략도 4'},
  N6:{name:'거울을 보는 손님',t:16,h:2,reward:2,pattern:'mirror',attackText:'도착층에서 아래로 2층에 공략도 6 → 위로 2층에 공략도 6'},
  BOSS1:{name:'거울 감찰관',t:16,h:2,reward:6,pattern:'bossMirror',attackText:'도착층에서 아래로 2층에 공략도 8 → 위로 2층에 공략도 8'},
  BOSS2:{name:'호텔의 조사관',t:20,h:3,reward:10,pattern:'final',attackText:'홀수 턴: 도착층에 공략도 6 두 번 / 짝수 턴: 아래로 2층, 위로 2층에 공략도 8씩'}
});

export const SERVICES = Object.freeze([
  {name:'일반 영업 1',guests:['N1','N1','N2']},
  {name:'일반 영업 2',guests:['N1','N2','N3']},
  {name:'일반 영업 3',guests:['N2','N3','N4']},
  {name:'중간 보스',guests:['BOSS1']},
  {name:'일반 영업 4',guests:['N3','N4','N5']},
  {name:'일반 영업 5',guests:['N4','N5','N6']},
  {name:'일반 영업 6',guests:['N5','N6','N6']},
  {name:'최종 보스',guests:['BOSS2']}
]);

const copy = value => structuredClone(value);
const wrap = (floor,count) => ((floor - 1) % count + count) % count + 1;
const TYPES = Object.keys(CREATURES);
const TERMINAL = new Set(['guest_end','service_end','reward','won','lost']);

function randomFor(...parts) {
  const text = parts.join('/');
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i),16777619);
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let n = value;
    n = Math.imul(n ^ n >>> 15,n | 1);
    n ^= n + Math.imul(n ^ n >>> 7,n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(array,random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i],result[j]] = [result[j],result[i]];
  }
  return result;
}

export class Game {
  constructor(seed = 21001) {
    this.s = {
      seed,round:0,guestIndex:0,phase:'management',entities:[],nextId:1,
      money:4,resets:0,web:{generation:0,nodes:[]},floorCount:6,equipped:['normal','normal','normal'],dice:[],chosen:null,chosenSlot:null,choiceEffect:null,rewardPending:false,
      visitor:null,escape:null,inactive:0,inactiveLimit:3,activity:false,
      stats:{kills:0,escaped:0,skipped:0,earned:0,spent:0,destroyed:0},
      logs:[],history:[],reason:'',summary:null,serviceStartStats:null
    };
    this.events = [];
    this._add('U',1); this._add('Q',3); this._add('Q',5); this._add('B',6);
    this._generateWeb(0);
    this._emit('start','첫 영업을 준비하세요. 괴이 카드와 층의 효과를 확인하고 자유롭게 배치할 수 있습니다.');
  }

  clone() {
    const game = Object.create(Game.prototype);
    game.s = copy(this.s);
    game.events = [];
    return game;
  }

  _begin() { this.events = []; }
  _require(condition,message) { if (!condition) throw new Error(message); }
  _emit(kind,text,extra = {}) {
    const event = {kind,text,...extra};
    this.events.push(event);
    this.s.logs.push(text);
    this.s.history.push({round:this.s.round,guestIndex:this.s.guestIndex,turn:this.s.visitor?.turn??null,...copy(event)});
    return event;
  }
  _add(type,floor = null) {
    const def = CREATURES[type];
    const entity = {id:'e'+this.s.nextId++,type,floor,c:0,p:def.maxP,uses:def.maxUses,shield:0};
    this.s.entities.push(entity);
    return entity;
  }
  entityAt(floor) { return this.s.entities.find(e => e.floor === floor && e.p > 0) || null; }
  _living() { return this.s.entities.filter(e => e.floor != null && e.p > 0); }
  _definition(entity) { return CREATURES[entity.type]; }
  _name(entity) { return this._definition(entity).name; }
  _entity(id) {
    const entity = this.s.entities.find(e => e.id === id && e.p > 0);
    this._require(entity,'해당 괴이는 더 이상 존재하지 않습니다.');
    return entity;
  }

  _generateWeb(generation) {
    const random = randomFor(this.s.seed,'web',generation);
    const secondCount = 4 + Math.floor(random() * 3);
    const pool = [...TYPES,...Array.from({length:6},() => TYPES[Math.floor(random()*6)])];
    let types;
    do { types = shuffle(pool,random); }
    while (!types.slice(0,3).some(t => t === 'G' || t === 'E') || !types.slice(0,3).some(t => t === 'U' || t === 'Q'));
    const nodes = [];
    const firstParents = shuffle([0,1,2],random);
    for (let i = 0; i < 12; i++) {
      let depth = 1, parent = null;
      if (i >= 3 && i < 3 + secondCount) {
        depth = 2;
        parent = nodes[i < 6 ? firstParents[i-3] : Math.floor(random()*3)].id;
      } else if (i >= 3 + secondCount) {
        depth = 3;
        parent = nodes[3+Math.floor(random()*secondCount)].id;
      }
      nodes.push({id:'w'+generation+'-'+(i+1),type:types[i],parent,depth,bought:false});
    }
    this.s.web = {generation,nodes};
  }

  webReason(nodeId) {
    if (this.s.phase !== 'management') return '영업 사이에만 구매할 수 있습니다.';
    const node = this.s.web.nodes.find(n => n.id === nodeId);
    if (!node) return '현재 구매망에 없는 카드입니다.';
    if (node.bought) return '이미 구매 완료한 카드입니다.';
    const parent = this.s.web.nodes.find(n => n.id === node.parent);
    if (parent && !parent.bought) return CREATURES[parent.type].name+' 구매 후 개방';
    const price = CREATURES[node.type].price;
    if (this.s.money < price) return '공포 재화 '+(price-this.s.money)+' 부족';
    return '';
  }

  buy(nodeId) {
    this._begin();
    const reason = this.webReason(nodeId);
    this._require(!reason,reason);
    const node = this.s.web.nodes.find(n => n.id === nodeId);
    const def = CREATURES[node.type];
    this.s.money -= def.price;
    this.s.stats.spent += def.price;
    node.bought = true;
    const entity = this._add(node.type);
    this._emit('purchase',def.name+' 구매 · 공포 재화 '+def.price+' 소비. 보관함에 새 카드가 추가되었습니다.',{entityId:entity.id});
    return this.events;
  }

  resetWeb() {
    this._begin();
    this._require(this.s.phase === 'management','영업 사이에만 구매망을 리셋할 수 있습니다.');
    this._require(this.s.resets > 0,'웹 리셋권이 없습니다. 영업을 마치면 하나 얻습니다.');
    this.s.resets--;
    this._generateWeb(this.s.web.generation+1);
    this._emit('web_reset','웹 리셋권 1개를 사용했습니다. 가진 괴이는 유지하고 새로운 구매망을 열었습니다.');
    return this.events;
  }

  place(entityId,floor) {
    this._begin();
    this._require(this.s.phase === 'management','배치는 영업 사이에만 바꿀 수 있습니다.');
    this._require(Number.isInteger(floor) && floor >= 1 && floor <= this.s.floorCount,'배치할 층을 선택하세요.');
    const entity = this._entity(entityId), other = this.entityAt(floor), oldFloor = entity.floor;
    if (other && other !== entity) other.floor = oldFloor;
    entity.floor = floor;
    this._emit('place',floor+'층에 '+this._name(entity)+' 배치'+(other && other !== entity ? ' · 기존 괴이는 '+(oldFloor == null ? '보관함' : oldFloor+'층')+'으로 이동' : ''),{floor,entityId});
    return this.events;
  }

  store(entityId) {
    this._begin();
    this._require(this.s.phase === 'management','보관은 영업 사이에만 가능합니다.');
    const entity = this._entity(entityId);
    this._require(entity.floor != null,'이미 보관 중인 괴이입니다.');
    const floor = entity.floor;
    entity.floor = null;
    this._emit('store',floor+'층의 '+this._name(entity)+'을 보관함으로 옮겼습니다.',{entityId});
    return this.events;
  }

  expansionCost() { return EXPANSION_COSTS[this.s.floorCount-6] ?? null; }

  expansionReason() {
    if (this.s.phase !== 'management') return '구매·배치 단계에만 증설할 수 있습니다.';
    const cost = this.expansionCost();
    if (cost == null) return '최대 10층입니다.';
    if (this.s.money < cost) return '공포 재화 '+(cost-this.s.money)+' 부족';
    return '';
  }

  expand() {
    const reason = this.expansionReason();
    this._require(!reason,reason);
    this._begin();
    const before = this.s.floorCount, cost = this.expansionCost(), moneyBefore = this.s.money;
    this.s.floorCount++;
    this.s.money -= cost;
    this.s.stats.spent += cost;
    const layout=this.s.entities.filter(e=>e.floor!=null).map(e=>({id:e.id,name:this._name(e),floor:e.floor}));
    this._emit('expand',before+'층 → '+this.s.floorCount+'층 · 꼭대기에 빈층 추가 · 공포 재화 '+cost+' 사용 ('+moneyBefore+' → '+this.s.money+') · 순환 '+this.s.floorCount+'층 → 1층',{
      before,after:this.s.floorCount,cost,moneyBefore,moneyAfter:this.s.money,
      layout,beforeLayout:copy(layout),afterLayout:copy(layout),newEmptyFloor:this.s.floorCount
    });
    return this.events;
  }

  /** Hypothetical design comparison: no visitor attacks or fear threshold is assumed. */
  expansionPreview({position=0,slot=0,face=0,anxiety=0,fear=0} = {}) {
    this._require(this.s.phase === 'management','경영 중에 증설 경로를 비교할 수 있습니다.');
    this._require(this.s.floorCount < 10,'최대 10층입니다.');
    this._require(Number.isInteger(position)&&position>=0&&position<=this.s.floorCount,'기준 위치를 선택하세요.');
    this._require(Number.isInteger(slot)&&slot>=0&&slot<3&&Number.isInteger(face)&&face>=0&&face<6,'비교할 주사위와 면을 선택하세요.');
    this._require(Number.isInteger(anxiety)&&anxiety>=0&&anxiety<=ANXIETY_CAP&&Number.isFinite(fear)&&fear>=0,`기준 불안은 0~${ANXIETY_CAP}, 공포는 0 이상이어야 합니다.`);
    const type=this.s.equipped[slot], value=DICE[type].faces[face], bonus=type==='anxiety'&&value===3?1:0;
    const die={slot,type,face,value,bonus};
    const simulate=count=>{
      const clone=this.clone();
      clone.s.floorCount=count;
      clone.s.visitor={id:'design',name:'설계 비교',pos:position,a:anxiety,f:fear,t:Infinity,h:1,turn:1,reward:0,pattern:'none'};
      clone.s.phase='choose'; clone.s.dice=[die]; clone.s.escape=null;
      clone.s.activity=false;
      const base=copy(clone.s);
      clone.choose(slot);
      const choice=copy(clone.events);
      clone.move({preview:true,movementOnly:true});
      const events=[...choice,...clone.events], path=events.filter(e=>e.kind==='move').map(e=>e.floor);
      return {floorCount:count,path,state:clone.s,events,summary:this._previewSummary(base,clone.s,events),arrival:path.at(-1),arrivalEffect:clone.entityAt(path.at(-1))?clone._definition(clone.entityAt(path.at(-1))).arrivalText:'빈층 · 효과 없음'};
    };
    return {position,slot,face,die,anxiety,fear,cost:this.expansionCost(),moneyBefore:this.s.money,moneyAfter:this.s.money-this.expansionCost(),before:simulate(this.s.floorCount),after:simulate(this.s.floorCount+1)};
  }

  startService() {
    this._begin();
    this._require(this.s.phase === 'management','지금은 영업을 시작할 수 없습니다.');
    this._require(this._living().length > 0,'살아 있는 괴이를 한 개 이상 배치하세요.');
    for (const entity of this.s.entities) {
      entity.c = 0; entity.p = CREATURES[entity.type].maxP; entity.uses = CREATURES[entity.type].maxUses; entity.shield = 0;
    }
    this.s.guestIndex = 0;
    this.s.escape = null;
    this.s.serviceStartStats = copy(this.s.stats);
    this.s.summary = null;
    this._emit('service_start',SERVICES[this.s.round].name+' 시작 · 생존 괴이의 파훼 토큰과 사용 횟수를 복구했습니다.');
    this._startGuest();
    return this.events;
  }

  _startGuest() {
    const id = SERVICES[this.s.round].guests[this.s.guestIndex];
    this.s.visitor = {...copy(GUESTS[id]),id,f:0,a:0,pos:0,turn:1};
    for (const e of this.s.entities) { e.c = 0; e.shield = 0; }
    this.s.phase = 'roll';
    this.s.dice = []; this.s.chosen = null; this.s.chosenSlot = null; this.s.choiceEffect = null;
    this.s.inactive = 0; this.s.inactiveLimit = 3; this.s.activity = false;
    this._emit('guest_start',this.s.visitor.name+' 입장 · 공포 한계 '+this.s.visitor.t+' · 남은 심장 '+this.s.visitor.h);
  }

  advance() {
    this._begin();
    if (this.s.phase === 'guest_end') {
      this.s.guestIndex++;
      this._startGuest();
    } else if (this.s.phase === 'service_end') {
      this._nextManagement();
    } else throw new Error('손님 또는 영업 결과를 확인한 뒤 진행할 수 있습니다.');
    return this.events;
  }

  _nextManagement() {
    this.s.round++;
    this.s.guestIndex = 0;
    this.s.phase = 'management';
    this.s.visitor = null; this.s.escape = null; this.s.dice = []; this.s.chosen = null; this.s.chosenSlot = null; this.s.choiceEffect = null;
    this.s.inactive = 0; this.s.inactiveLimit = 3; this.s.activity = false;
    this._clearShields();
    this._emit('management','다음 구간: '+SERVICES[this.s.round].name+' · 구매와 배치를 준비하세요.');
  }

  claimDie(type,slot) {
    this._require(this.s.phase === 'reward' && this.s.rewardPending,'지금은 주사위 보상을 받을 수 없습니다.');
    this._require(['long','even','anxiety'].includes(type),'보상 후보 중 하나를 선택하세요.');
    this._require(Number.isInteger(slot)&&slot>=0&&slot<3,'교체할 주사위 자리를 선택하세요.');
    this._begin();
    const oldType=this.s.equipped[slot];
    this.s.equipped[slot]=type;
    this.s.rewardPending=false;
    this._emit('die_reward',(slot+1)+'번 자리 '+DICE[oldType].name+' → '+DICE[type].name+' 교체 · 눈 '+DICE[type].faces.join('·')+' · '+DICE[type].effectText,{slot,oldType,type,equipped:copy(this.s.equipped)});
    this._nextManagement();
    return this.events;
  }

  skipReward() {
    this._require(this.s.phase === 'reward' && this.s.rewardPending,'지금은 주사위 보상을 결정할 수 없습니다.');
    this._begin();
    this.s.rewardPending=false;
    this._emit('die_reward_skip','중간 보스 주사위 보상 건너뛰기 · 기존 세 주사위 유지',{equipped:copy(this.s.equipped)});
    this._nextManagement();
    return this.events;
  }

  roll() {
    this._begin();
    this._require(this.s.phase === 'roll','지금은 주사위를 굴릴 수 없습니다.');
    this.s.dice = this.s.equipped.map((type,slot)=>{
      const random=randomFor(this.s.seed,'dice',this.s.round,this.s.guestIndex,this.s.visitor.turn,slot);
      const face=Math.floor(random()*6),value=DICE[type].faces[face];
      return {slot,type,face,value,bonus:type==='anxiety'&&value===3?1:0};
    });
    this.s.chosen = null; this.s.chosenSlot = null; this.s.choiceEffect = null;
    this.s.phase = 'choose';
    this.s.activity = false;
    this._emit('roll','주사위: '+this.s.dice.map(d=>(d.slot+1)+'번 '+DICE[d.type].name+' '+d.value+'칸'+(d.bonus?' (선택 시 불안 +1)':'')).join(' · '),{dice:copy(this.s.dice)});
    return this.events;
  }

  choose(slot) {
    this._begin();
    this._require(this.s.phase === 'choose','주사위를 굴린 뒤 이동 거리를 고르세요.');
    const die=this.s.dice.find(d=>d.slot===slot);
    this._require(Number.isInteger(slot)&&die,'공개된 주사위 자리 중 하나를 선택하세요.');
    this.s.chosen = die.value; this.s.chosenSlot = slot;
    this.s.phase = 'prepare';
    this._emit('choose',(slot+1)+'번 '+DICE[die.type].name+' · '+die.value+'칸 이동 선택 · 이동 전에 각 층의 직접 사용 효과를 쓸 수 있습니다.',{...die,name:DICE[die.type].name});
    const before=this.s.visitor.a;
    if(die.bonus) this._anxiety(die.bonus,DICE[die.type].name+' 선택 효과',null);
    this.s.choiceEffect={slot,type:die.type,value:die.value,requested:die.bonus,amount:this.s.visitor.a-before,applied:true};
    return this.events;
  }

  activeReason(entityId) {
    const entity = this.s.entities.find(e => e.id === entityId && e.p > 0);
    if (!entity || entity.floor == null) return '배치된 살아 있는 괴이만 사용할 수 있습니다.';
    if (!['B','G','R'].includes(entity.type)) return '직접 사용 효과 없음';
    if (this.s.phase !== 'prepare') return '눈 선택 후, 이동 전에 사용';
    if (!this.s.visitor || this.s.visitor.h < 1) return '손님이 없습니다.';
    if (entity.type === 'R') {
      if (this.s.visitor.a < 2) return '불안 2 필요';
      if (!this._living().some(e => e.c > 0)) return '수리할 대상 없음';
    } else if (entity.uses < 1) return '남은 횟수 없음';
    return '';
  }

  active(entityId,targetId = null) {
    this._begin();
    const reason = this.activeReason(entityId);
    this._require(!reason,reason);
    const entity = this._entity(entityId);
    let target = null;
    if (entity.type !== 'B') {
      target = this._entity(targetId);
      this._require(target.floor != null,'층에 배치된 대상을 선택하세요.');
      if (entity.type === 'R') this._require(target.c > 0,'공략도가 있는 대상을 선택하세요.');
    }
    this.s.activity = true;
    if (entity.type === 'B') {
      entity.uses--;
      this._emit('active',entity.floor+'층 '+this._name(entity)+' 직접 사용 · 남은 '+entity.uses+'회',{floor:entity.floor,entityId,beforeUses:entity.uses+1,afterUses:entity.uses});
      this._fear(3,this._name(entity),entity.floor);
    } else if (entity.type === 'G') {
      const before=target.shield,power=this._definition(entity).shieldPower??6;
      entity.uses--; target.shield += power;
      this._emit('shield',entity.floor+'층 '+this._name(entity)+' → '+target.floor+'층 '+this._name(target)+' 보호 '+power+' · 이번 턴 보호 '+target.shield,{floor:target.floor,entityId,targetId,amount:power,before,after:target.shield,beforeUses:entity.uses+1,afterUses:entity.uses,entity:copy(entity),target:copy(target)});
    } else {
      const before = target.c;
      target.c = Math.max(0,target.c-(this._definition(entity).repairPower??6));
      this.s.visitor.a -= 2;
      this._emit('repair',entity.floor+'층 '+this._name(entity)+' → '+target.floor+'층 '+this._name(target)+' 공략도 '+before+' → '+target.c+' · 불안 2 소비',{floor:target.floor,entityId,targetId,before,after:target.c,amount:before-target.c,anxietyCost:2,entity:copy(entity),target:copy(target)});
    }
    return this.events;
  }

  path(value = this.s.chosen) {
    if (!this.s.visitor || !Number.isInteger(value) || value < 1 || value > 8) return [];
    const position = this.s.visitor.pos;
    return Array.from({length:value},(_,i) => wrap(position+i+1,this.s.floorCount));
  }

  attackList(path) {
    if (!this.s.visitor || !path.length) return [];
    const d = path[path.length-1];
    let pattern = this.s.visitor.pattern || GUESTS[this.s.visitor.id]?.pattern;
    if (pattern === 'final') pattern = this.s.visitor.turn % 2 ? 'double' : 'bossMirror';
    if (pattern === 'route') return path.map(floor => ({floor,power:4}));
    if (pattern === 'none') return [];
    if (pattern === 'adjacent') return [{floor:wrap(d-1,this.s.floorCount),power:6},{floor:d,power:6}];
    if (pattern === 'mirror' || pattern === 'bossMirror') return [{floor:wrap(d-2,this.s.floorCount),power:pattern === 'mirror' ? 6 : 8},{floor:wrap(d+2,this.s.floorCount),power:pattern === 'mirror' ? 6 : 8}];
    return [{floor:d,power:6},{floor:d,power:6}];
  }

  installEscape(floor) {
    this._begin();
    this._require(this.s.phase === 'prepare','탈출구는 눈 선택 후 이동 전에 설치하세요.');
    this._require(this.s.escape == null,'탈출구는 영업당 하나만 설치할 수 있습니다.');
    this._require(Number.isInteger(floor) && floor >= 1 && floor <= this.s.floorCount,'탈출구를 열 층을 선택하세요.');
    this._require(!this.entityAt(floor),'빈층에만 탈출구를 설치할 수 있습니다.');
    this.s.escape = floor;
    this._emit('escape_install',floor+'층에 탈출구 설치 · 실제로 통과하거나 도착해야 영업이 종료됩니다.',{floor});
    return this.events;
  }

  _anxiety(amount,source,floor) {
    const before = this.s.visitor.a;
    this.s.visitor.a = Math.min(ANXIETY_CAP,before+amount);
    if (this.s.visitor.a > before) this.s.activity = true;
    this._emit('anxiety',(floor==null?'':floor+'층 ')+source+' · 불안 '+before+' → '+this.s.visitor.a,{floor,source,before,after:this.s.visitor.a,requested:amount,amount:this.s.visitor.a-before,wasted:amount-(this.s.visitor.a-before)});
  }

  _fear(amount,source,floor) {
    if (amount <= 0) return;
    const v = this.s.visitor, before = v.f;
    this.s.activity = true;
    v.f += amount;
    this._emit('fear',floor+'층 '+source+' · 공포 '+before+' → '+v.f,{floor,source,before,after:v.f,amount});
    if (v.f >= v.t) {
      v.h--; v.f = 0;
      this._emit('heart','심장마비 · 남은 심장 '+v.h+' · 공포 0으로 초기화',{floor,before:v.h+1,after:v.h,amount:1});
      if (v.h === 0) {
        this.s.money += v.reward;
        this.s.stats.earned += v.reward;
        this.s.stats.kills++;
        this._emit('kill',v.name+' 처치 · 공포 재화 +'+v.reward+' · 남은 이동과 공격 취소',{floor,reward:v.reward});
        this._clearShields();
        if (this.s.guestIndex === SERVICES[this.s.round].guests.length-1) this._finishService('clear');
        else this.s.phase = 'guest_end';
      }
    }
  }

  _clearShields() {
    for (const entity of this.s.entities) {
      if(entity.shield>0) this._emit('shield_expire',entity.floor+'층 '+this._name(entity)+' 남은 이번 턴 보호 '+entity.shield+' 소멸',{floor:entity.floor,entityId:entity.id,amount:entity.shield});
      entity.shield=0;
    }
  }

  _finishService(outcome) {
    this.s.resets++;
    const start = this.s.serviceStartStats || {kills:0,escaped:0,skipped:0,earned:0,destroyed:0};
    this.s.summary = {round:this.s.round,name:SERVICES[this.s.round].name,outcome,
      kills:this.s.stats.kills-start.kills,escaped:this.s.stats.escaped-start.escaped,
      skipped:this.s.stats.skipped-start.skipped,earned:this.s.stats.earned-start.earned,
      destroyed:this.s.stats.destroyed-start.destroyed};
    this._clearShields();
    this._emit('service_end',SERVICES[this.s.round].name+' 종료 · 웹 리셋권 +1 · 구매망은 유지됩니다.');
    if (this.s.round === 7) {
      this.s.phase = outcome === 'clear' ? 'won' : 'lost';
      this.s.reason = outcome === 'clear' ? '호텔의 조사관을 처치했습니다. 마지막 손님까지 맞이한 호텔의 승리입니다.' : '최종 보스를 탈출시켜 마지막 처치 목표를 달성하지 못했습니다.';
      this._emit(this.s.phase,this.s.reason);
    } else if(this.s.round===3 && outcome==='clear') {
      this.s.phase='reward'; this.s.rewardPending=true;
      this._emit('reward_offer','중간 보스 처치 보상 · 장거리·짝수·불안 주사위 중 하나를 받거나 건너뛰세요.',{candidates:['long','even','anxiety']});
    } else {
      this.s.phase = 'service_end';
      if(this.s.round===3) this._emit('reward_unavailable','중간 보스 탈출 · 처치 재화와 주사위 보상 없음');
    }
  }

  _damage(entity,power,kind = 'hit') {
    const floor = entity.floor;
    const beforeC = entity.c, beforeP = entity.p;
    const absorbed = kind === 'penalty' ? 0 : Math.min(entity.shield,power);
    if (kind !== 'penalty') entity.shield -= absorbed;
    entity.c += power-absorbed;
    if (entity.c >= 12) { entity.c = 0; entity.p--; }
    this._emit(kind,floor+'층 '+this._name(entity)+' · '+(absorbed ? '보호로 '+absorbed+' 흡수 · ' : '')+'공략도 '+beforeC+' → '+entity.c+' · 파훼 토큰 '+beforeP+' → '+entity.p,{floor,power,absorbed,entityId:entity.id,name:this._name(entity),beforeC,afterC:entity.c,beforeP,afterP:entity.p,tokenLoss:beforeP-entity.p,damage:power-absorbed,entity:copy(entity)});
    if (entity.p <= 0) {
      this.s.entities = this.s.entities.filter(e => e.id !== entity.id);
      this.s.stats.destroyed++;
      this._emit('destroy',floor+'층 '+this._name(entity)+' 영구 파괴'+(entity.upgraded?' · 강화도 함께 소멸':'')+' · 즉시 빈층으로 전환',{floor,entityId:entity.id,upgraded:!!entity.upgraded,entity:copy(entity)});
      if (this._living().length === 0) {
        this.s.phase = 'lost';
        this.s.reason = '배치된 괴이가 모두 파괴되어 호텔이 무너졌습니다.';
        this._emit('lost',this.s.reason);
      }
    }
  }

  _inactivity(preview = false) {
    if (this.s.activity) { this.s.inactive = 0; this.s.inactiveLimit = 3; return []; }
    this.s.inactive++;
    if (this.s.inactive < this.s.inactiveLimit) {
      this._emit('inactivity','활동 없이 '+this.s.inactive+'턴 · '+(this.s.inactiveLimit-this.s.inactive)+'턴 더 이어지면 공략도 12 패널티');
      return [];
    }
    this.s.inactive = 0; this.s.inactiveLimit = 2;
    const candidates = this._living().sort((a,b) => a.floor-b.floor);
    if (preview) {
      this._emit('penalty_preview','비활동 패널티 예정 · 살아 있는 무작위 괴이 하나에 공략도 12. 대상은 실행할 때 결정됩니다.');
      return candidates.map(e => ({id:e.id,floor:e.floor,name:this._name(e),c:0,p:e.p-1,destroyed:e.p===1,defeat:e.p===1&&candidates.length===1}));
    }
    if (candidates.length) {
      const random = randomFor(this.s.seed,'penalty',this.s.round,this.s.guestIndex,this.s.visitor.turn);
      const target = candidates[Math.floor(random()*candidates.length)];
      this._emit('penalty_start','비활동 패널티 · '+target.floor+'층에 공략도 12 추가',{floor:target.floor,candidates:candidates.map(e=>({id:e.id,floor:e.floor,name:this._name(e)})),targetId:target.id});
      this._damage(target,12,'penalty');
    }
    return [];
  }

  move(options = {}) {
    this._begin();
    this.uncertainty=[];
    this._require(this.s.phase === 'prepare','이동 거리를 선택한 뒤 이동하세요.');
    const path = this.path(this.s.chosen);
    this._require(path.length > 0,'이동 거리를 선택하세요.');
    let uncertainty = [];
    for (let i = 0; i < path.length; i++) {
      const floor = path[i], arrival = i === path.length-1;
      this.s.visitor.pos = floor;
      this._emit('move',floor+'층 '+(arrival ? '도착' : '통과'),{floor,arrival});
      if (this.s.escape === floor) {
        this.s.stats.escaped++;
        const skipped = SERVICES[this.s.round].guests.length-this.s.guestIndex-1;
        this.s.stats.skipped += skipped;
        this._emit('escape',floor+'층 탈출구 접촉 · 현재 손님 무보상'+(skipped ? ', 남은 '+skipped+'명 건너뜀' : ''),{floor});
        this._finishService('escape');
        return this.events;
      }
      const entity = this.entityAt(floor);
      if (!entity) continue;
      const source = this._name(entity)+(arrival ? ' 도착' : ' 통과');
      if (entity.type === 'U') this._anxiety(arrival ? 4 : 2,source,floor);
      if (entity.type === 'E') this._anxiety(arrival ? 1 : this.s.visitor.a,source,floor);
      if (entity.type === 'Q' && arrival) {
        const spent = this.s.visitor.a;
        this.s.visitor.a -= spent;
        this._emit('harvest',floor+'층 '+this._name(entity)+' 도착 · 불안 '+spent+' 소비',{floor,source:this._name(entity),amount:spent,before:this.s.visitor.a+spent,after:this.s.visitor.a});
        this._fear(spent,source,floor);
      }
      if (entity.type === 'B' && arrival) this._fear(3,source,floor);
      if (entity.type === 'G' && arrival) {
        const before = entity.uses;
        entity.uses = Math.min(2,entity.uses+1);
        this._emit('charge',floor+'층 '+this._name(entity)+' · 방어 횟수 '+before+' → '+entity.uses+' · 다음 턴부터 사용',{floor,entityId:entity.id,name:this._name(entity),before,after:entity.uses,amount:entity.uses-before,wasted:1-(entity.uses-before)});
      }
      if (TERMINAL.has(this.s.phase)) return this.events;
    }
    if(options.movementOnly) return this.events;
    for (const {floor,power} of this.attackList(path)) {
      const entity = this.entityAt(floor);
      if (entity) this._damage(entity,power);
      else this._emit('miss',floor+'층 공격은 빈층으로 빗나갔습니다.',{floor,power});
      if (TERMINAL.has(this.s.phase)) return this.events;
    }
    this._clearShields();
    uncertainty = this._inactivity(!!options.preview);
    if (!TERMINAL.has(this.s.phase)) {
      this.s.visitor.turn++;
      this.s.phase = 'roll';
      this.s.dice = []; this.s.chosen = null; this.s.chosenSlot = null; this.s.choiceEffect = null;
    }
    this.uncertainty = uncertainty;
    return this.events;
  }

  _previewSummary(before,state,events) {
    const moves=events.filter(e=>e.kind==='move');
    const losses=before.entities.filter(e=>e.floor!=null).map(e=>{
      const after=state.entities.find(x=>x.id===e.id);
      return {id:e.id,floor:e.floor,name:this._name(e),beforeC:e.c,afterC:after?.c??0,beforeP:e.p,afterP:after?.p??0,tokens:e.p-(after?.p??0),destroyed:!after};
    }).filter(e=>e.tokens>0||e.destroyed);
    return {
      destination:moves.at(-1)?.floor??state.visitor?.pos??0,
      fear:events.filter(e=>e.kind==='fear').reduce((sum,e)=>sum+e.amount,0),
      hearts:events.filter(e=>e.kind==='heart').length,
      killed:events.some(e=>e.kind==='kill'),escaped:events.some(e=>e.kind==='escape'),lost:state.phase==='lost',
      retaliation:events.some(e=>e.kind==='hit'||e.kind==='miss'),
      losses,charges:events.filter(e=>e.kind==='charge'),
      anxietyBefore:before.visitor?.a??0,anxietyAfter:state.visitor?.a??0,
      fearAfter:state.visitor?.f??0,heartsAfter:state.visitor?.h??0,
      choiceBonus:events.filter(e=>e.kind==='anxiety'&&e.floor==null).reduce((sum,e)=>sum+e.amount,0)
    };
  }

  preview(slot = this.s.chosenSlot) {
    this._require(['choose','prepare'].includes(this.s.phase),'이동 거리 선택 중에 미리볼 수 있습니다.');
    const clone = this.clone();
    let choiceEvents=[];
    if (this.s.phase === 'choose') {
      clone.choose(slot);
      choiceEvents=copy(clone.events);
    } else {
      this._require(slot === this.s.chosenSlot || slot == null,'이미 확정한 주사위입니다.');
    }
    const selected=copy(clone.s.dice.find(d=>d.slot===clone.s.chosenSlot)||null);
    const plannedPath = clone.path(clone.s.chosen);
    clone.move({preview:true});
    const events=[...choiceEvents,...clone.events];
    const path=events.filter(e=>e.kind==='move').map(e=>e.floor);
    const attacks=events.filter(e=>e.kind==='hit'||e.kind==='miss').map((e,i)=>({...e,order:i+1}));
    return {path,plannedPath,selected,state:clone.s,events,attacks,summary:this._previewSummary(this.s,clone.s,events),uncertainty:clone.uncertainty || []};
  }

  surrender() {
    this._begin();
    this._require(!['won','lost'].includes(this.s.phase),'이미 종료된 판입니다.');
    this.s.phase = 'lost';
    this.s.reason = '이번 판을 포기했습니다.';
    this._emit('lost',this.s.reason);
    return this.events;
  }
}
