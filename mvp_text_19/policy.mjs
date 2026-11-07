// Deliberately accepts only the public view and a current-round preview callback.
// No seed, draw counter, future roll, or unopened shop is used for decisions.
const ARRIVAL = new Set(['saint','choir','crusader','warPriest','cardinal']);
const TYPES = ['paladin','holyPriest','saint','squire','choir','crusader','warPriest','cardinal','sprayer','gourmet','toxicHealer'];
const BASE = { paladin:7, holyPriest:7, saint:8, squire:5, choir:10, crusader:10, warPriest:10, cardinal:7, sprayer:5, gourmet:3, toxicHealer:7 };
const ownParts = e => e ? [{type:e.type,upgraded:e.upgraded}, ...(e.fusion ? [{type:e.fusion.bType,upgraded:e.fusion.bUpgraded}] : [])] : [];
const count = (e,type) => ownParts(e).filter(p=>p.type===type).length;
const arrivalCount = e => ownParts(e).filter(p=>ARRIVAL.has(p.type)).length;
const damagePower = e => ownParts(e).reduce((n,p)=>n+(p.type==='crusader'?(p.upgraded?4:2):['warPriest','cardinal'].includes(p.type)?(p.upgraded?2:1):p.type==='choir'?1:0),0);
const powerOf = (e,type,base,upgraded) => ownParts(e).filter(p=>p.type===type).reduce((n,p)=>n+(p.upgraded?upgraded:base),0);
const totalHp = entities => entities.reduce((n,e)=>n+Math.max(0,e.hp),0);
const label = e => `${e.id} ${e.name??e.type}`;

function collection(view) {
  const counts=Object.fromEntries(TYPES.map(t=>[t,0]));
  for(const e of view.floors.filter(Boolean)) for(const p of ownParts(e)) counts[p.type]++;
  return counts;
}

export function cardValue(type,view) {
  const c=collection(view),n=view.floors.filter(Boolean).length;
  let value=BASE[type];
  if(['choir','crusader','warPriest','cardinal'].includes(type)) value+=Math.max(0,3-c.choir-c.crusader-c.warPriest-c.cardinal)*2.3;
  if(type==='choir') value+=Math.min(3,n)*0.7;
  if(type==='holyPriest') value+=Math.min(3,c.saint+c.paladin+c.choir+c.crusader)*0.7;
  if(type==='paladin') value+=c.paladin===0?4:Math.max(0,n/4-c.paladin);
  if(type==='saint') value+=c.saint===0?5:Math.max(0,n/4-c.saint)*1.3;
  if(type==='squire') value+=Math.min(2,c.saint)*2+Math.min(2,c.paladin)*0.5;
  if(type==='toxicHealer') value+=c.saint+c.toxicHealer===0?5:1;
  if(type==='gourmet') value+=Math.min(3,c.sprayer+c.toxicHealer)*2;
  if(type==='sprayer') value+=Math.min(2,c.gourmet)*1.5;
  if(c[type]>=2) value-=(c[type]-1)*1.2;
  return value;
}

function bodyValue(e,view) {
  return ownParts(e).reduce((n,p)=>n+cardValue(p.type,view)*(p.upgraded?1.3:1),0)*(0.5+0.5*e.hp/e.maxHp);
}

function adjacentPositions(board,a,b) {
  if(a===b||!board[a]||!board[b]) return false;
  if(Math.abs(a-b)===1) return true;
  return board.some((e,i)=>e&&count(e,'cardinal')&&((a===i-2&&b===i+2)||(b===i-2&&a===i+2)));
}

function layoutScore(board,view) {
  const arrivalWeight=[0.55,0.75,0.95,1.15,1.3,1.4,1.05,0.9,0.75,0.6];
  const pathEnemies=(view.node?.enemies??[]).filter(e=>e.pattern==='path').length;
  let score=0;
  for(let x=0;x<10;x++) {
    const e=board[x];
    if(!e) continue;
    score+=damagePower(e)*arrivalWeight[x]*2;
    score+=count(e,'sprayer')*(x<5?(6-x)*0.45:0.25);
    score+=count(e,'gourmet')*(x<6?0.5:0.2);
    score-=pathEnemies*(x<6?(6-x)/6:0)*0.28*(e.maxHp/e.hp);
    for(let y=0;y<10;y++) if(adjacentPositions(board,x,y)) {
      const other=board[y];
      score+=powerOf(e,'choir',1,2)*arrivalCount(other)*arrivalWeight[y]*3.2;
      score+=powerOf(e,'holyPriest',1,2)*arrivalCount(other)*arrivalWeight[y]*0.8;
      score+=powerOf(e,'saint',1,2)*arrivalWeight[x]*(count(other,'paladin')?2.2:0.8)*(1+(1-other.hp/other.maxHp)*0.4);
      score+=count(e,'squire')*arrivalWeight[y]*(powerOf(other,'saint',1,2)*1.8+count(other,'paladin')*0.6+damagePower(other)*0.25);
      if(count(e,'paladin')&&!count(other,'paladin')) score+=Math.min(1,e.hp/3)*(0.6+damagePower(other)*0.12+count(other,'choir')*0.5);
      score+=count(e,'warPriest')*(count(other,'paladin')?0.7:0.25);
      score+=count(e,'toxicHealer')*(1-other.hp/other.maxHp)*0.7;
    }
  }
  return score;
}

function bestLayout(view) {
  const units=view.floors.filter(Boolean);
  const starts=[view.floors.slice()];
  const order=[...units].sort((a,b)=>TYPES.indexOf(a.type)-TYPES.indexOf(b.type)||a.id.localeCompare(b.id));
  for(const list of [order,[...order].reverse()]) for(let offset=0;offset<=10-list.length;offset++) {
    const board=Array(10).fill(null); list.forEach((e,i)=>board[offset+i]=e); starts.push(board);
  }
  let best=view.floors.slice(),bestScore=layoutScore(best,view);
  for(const initial of starts) {
    let board=initial,score=layoutScore(board,view);
    for(let pass=0;pass<12;pass++) {
      let next=board,nextScore=score;
      for(let a=0;a<9;a++) for(let b=a+1;b<10;b++) {
        if(!board[a]&&!board[b]) continue;
        const candidate=board.slice(); [candidate[a],candidate[b]]=[candidate[b],candidate[a]];
        const candidateScore=layoutScore(candidate,view);
        if(candidateScore>nextScore+1e-8) { next=candidate; nextScore=candidateScore; }
      }
      if(next===board) break;
      board=next; score=nextScore;
    }
    if(score>bestScore+1e-8) { best=board; bestScore=score; }
  }
  return best.map(e=>e?.id??null);
}

function scenarioValue(view,result) {
  if(result.outcome==='loss') return -1_000_000;
  let score=result.outcome==='win'?4000:0;
  const units=view.floors.filter(Boolean), after=new Map(result.allies.map(e=>[e.id,e]));
  for(const e of units) {
    const remaining=after.get(e.id),value=bodyValue(e,view);
    if(!remaining) score-=120+value*7;
    else {
      score+=(remaining.hp-e.hp)*(6+value*0.25);
      score-=remaining.tokens.poison*2;
      score-=(remaining.tokens.exhaustion/(remaining.maxHp||1))**3*8;
    }
  }
  for(const enemy of view.battle.enemies.filter(e=>e.hp>0)) {
    const afterEnemy=result.enemies.find(e=>e.id===enemy.id);
    if(!afterEnemy||afterEnemy.hp<=0) score+=70+(enemy.role==='support'?14:enemy.role==='guard'?12:0)+enemy.attack*2;
    else {
      score+=(enemy.hp-afterEnemy.hp)*13;
      const oldProtection=enemy.protection.reduce((n,p)=>n+p.amount,0),newProtection=afterEnemy.protection.reduce((n,p)=>n+p.amount,0);
      score+=(oldProtection-newProtection)*5;
      score+=afterEnemy.tokens.poison*2;
    }
  }
  if(!result.activity&&result.outcome===null) score-=4+result.inactiveCount;
  return score;
}

function summaryOf(view,preview,order) {
  const scenarios=preview.scenarios;
  if(!scenarios.length) return {order,score:-Infinity,complete:false,branches:0,lossProbability:null};
  const outcomes=scenarios.map(s=>({s,value:scenarioValue(view,s),probability:s.conditions.reduce((p,c)=>p/c.options.length,1)}));
  const probability=outcomes.reduce((n,x)=>n+x.probability,0);
  const mean=outcomes.reduce((n,x)=>n+x.value*x.probability,0)/probability;
  const worst=Math.min(...outcomes.map(x=>x.value));
  const score=0.8*mean+0.2*worst-(preview.complete?0:20);
  const currentHp=totalHp(view.floors.filter(Boolean));
  const currentEnemies=view.battle.enemies.filter(e=>e.hp>0).length;
  return {order,score,complete:preview.complete,branches:scenarios.length,coveredProbability:probability,
    lossProbability:outcomes.filter(x=>x.s.outcome==='loss').reduce((n,x)=>n+x.probability,0)/probability,
    wins:scenarios.filter(s=>s.outcome==='win').length,
    allyHp:[Math.min(...scenarios.map(s=>totalHp(s.allies))),Math.max(...scenarios.map(s=>totalHp(s.allies)))],
    hpChange:[Math.min(...scenarios.map(s=>totalHp(s.allies)-currentHp)),Math.max(...scenarios.map(s=>totalHp(s.allies)-currentHp))],
    kills:[Math.min(...scenarios.map(s=>currentEnemies-s.enemies.filter(e=>e.hp>0).length)),Math.max(...scenarios.map(s=>currentEnemies-s.enemies.filter(e=>e.hp>0).length))],
    losses:[Math.min(...scenarios.map(s=>view.floors.filter(Boolean).length-s.allies.length)),Math.max(...scenarios.map(s=>view.floors.filter(Boolean).length-s.allies.length))]};
}

function upgradeValue(e,view) {
  const values={paladin:8,holyPriest:8,saint:10,squire:4,choir:11,crusader:13,warPriest:9,cardinal:7,sprayer:9,gourmet:6,toxicHealer:7};
  return values[e.type]+(e.fusion?2:0)+(e.type==='saint'&&view.floors.some(a=>a&&a.hp<a.maxHp)?2:0);
}

export function makePolicy({fixedCompanion=false}={}) {
  let layoutNode=null,targetLayout=null;
  return {
    name:fixedCompanion?'fixed-companion':'preview-heuristic',
    decide(view,preview) {
      const allies=view.floors.filter(Boolean);
      if(view.phase==='map') {
        const candidates=view.map.filter(n=>n.reachable).map(n=>{
          let score=n.col==='중'?0.1:0;
          if(n.kind==='upgrade') score+=allies.some(e=>!e.upgraded)?3:0;
          if(n.kind==='fusion') score+=allies.length>=6?2:0;
          score-=n.enemies.reduce((sum,e)=>sum+e.maxHp*0.7+e.attack*(e.pattern==='path'?3.5:1.7)+(e.protection??0)*0.7+(e.role==='support'?0.6:0),0);
          return {node:n,score};
        }).sort((a,b)=>b.score-a.score);
        const n=candidates[0].node;
        return {command:'visit',args:[n.id],reason:`공개 편성·공격 패턴·정비 효과를 비교하여 ${n.depth} 깊이 ${n.col} ${n.kind} 선택. 미방문 재고는 사용하지 않음.`};
      }
      if(view.phase==='management') {
        if(layoutNode!==view.node.id) { layoutNode=view.node.id; targetLayout=bestLayout(view); }
        for(let i=0;i<10;i++) if((view.floors[i]?.id??null)!==targetLayout[i]&&targetLayout[i]) {
          const j=view.floors.findIndex(e=>e?.id===targetLayout[i]);
          return {command:'swap',args:[i+1,j+1],reason:`성가대원 도착 반응·성녀 회복·성기사 보호의 인접 연계를 만들고 첫 진입 경로 노출을 줄이도록 ${targetLayout[i]}을 ${i+1}번에 배치.`};
        }
        return {command:'start',args:[],reason:'공개 적 편성과 동료 체력을 확인하고 현재 인접 배치로 전투 시작.'};
      }
      if(view.phase==='prepare') {
        const healing=view.quickActions.map(action=>{
          const target=allies.find(e=>e.id===action.targetId);
          const gain=Math.min(action.heal,target.maxHp-target.hp);
          return {action,target,gain};
        }).filter(x=>x.gain>x.action.poison&&x.target.tokens.poison===0).sort((a,b)=>b.gain-a.gain||a.target.hp-b.target.hp);
        if(healing.length) {
          const {action,target,gain}=healing[0];
          return {command:'active',args:[action.id,action.part,action.targetId],reason:`${label(target)}에 회복 ${gain}, 종료 독 비용 ${action.poison}을 감수하여 순 체력 회복. 독이 누적된 대상은 추가 치료하지 않음.`};
        }
        const dice=view.battle.dice;
        const alternatives=allies.flatMap(e=>{
          const byFace=new Map();
          return dice.map((die,i)=>{
            const slot=i+1;
            if(!byFace.has(die)) byFace.set(die,summaryOf(view,preview(e.id,slot),e.id));
            return {...byFace.get(die),slot,die};
          });
        });
        const fixedId=fixedCompanion ? allies.map(e=>e.id).sort()[0] : null;
        const candidates=fixedId ? alternatives.filter(a=>a.order===fixedId) : alternatives;
        const chosen=candidates.reduce((best,a)=>a.score>best.score?a:best);
        return {command:'move',args:[chosen.order,chosen.slot],reason:`${chosen.slot}번 주사위(눈 ${chosen.die})로 ${chosen.order} 이동. 예상 처치 ${chosen.kills.join('~')}, 상실 ${chosen.losses.join('~')}.`,
          analysis:{phase:'drop',dice:[...dice],slot:chosen.slot,die:chosen.die,chosen:chosen.order,alternatives}};
      }
      if(view.phase==='reward') {
        const options=view.rewards.map(item=>({...item,value:cardValue(item.type,view)})).sort((a,b)=>b.value-a.value);
        return {command:'reward',args:[options[0].slot],reason:`보유 효과의 피해·회복·보호 공급을 고려해 ${options[0].name} 선택(정적 가치 ${options[0].value.toFixed(1)}).`};
      }
      if(view.phase==='place') {
        const empty=view.floors.findIndex(e=>!e);
        if(empty>=0) return {command:'place',args:[empty+1],reason:'빈 지점에 새 동료 배치. 다음 전투 준비에서 인접 연계에 맞춰 재배치.'};
        const worst=allies.map(e=>({e,value:bodyValue(e,view)})).sort((a,b)=>a.value-b.value)[0];
        const newcomer=view.pending.entity;
        if(bodyValue(newcomer,view)>worst.value+0.5) return {command:'place',args:[view.floors.findIndex(e=>e.id===worst.e.id)+1],reason:`열 지점이 가득 찼으므로 손상과 기존 효과를 비교하여 ${label(worst.e)}을 새 ${newcomer.name}으로 교체.`};
        return {command:'discard',args:[],reason:'열 지점이 가득 차 있고 새 동료보다 기존 편성이 유리하여 획득 포기. 구매였다면 비용은 환불하지 않음.'};
      }
      if(view.phase==='shop') {
        const options=view.shop.filter(item=>!item.purchased&&item.price<=view.coins).map(item=>({...item,value:cardValue(item.type,view)})).sort((a,b)=>b.value-a.value);
        if(options.length) {
          const choice=options[0],worst=Math.min(...allies.map(e=>bodyValue(e,view)));
          if(allies.length<10||choice.value>worst+0.5) return {command:'buy',args:[choice.slot],reason:`공개된 재고 중 ${choice.name}으로 피해·생존 효과를 보강. 가격 ${choice.price}, 현재 재화 ${view.coins}.`};
        }
        return {command:'leave',args:[],reason:'구매할 재화가 부족하거나 기존 편성을 개선하는 공개 재고가 없어 상점 종료.'};
      }
      if(view.phase==='upgrade') {
        const choices=allies.filter(e=>!e.upgraded).sort((a,b)=>upgradeValue(b,view)-upgradeValue(a,view));
        if(choices.length) return {command:'upgrade',args:[choices[0].id],reason:`${label(choices[0])} 원본 A의 효과/최대 체력 강화. 현재 체력은 회복되지 않음을 감안.`};
        return {command:'skip',args:[],reason:'강화할 미강화 원본 A가 없어 정비 종료.'};
      }
      if(view.phase==='fusion') {
        const options=[];
        if(allies.length>=6) for(const a of allies.filter(e=>!e.fusion)) for(const b of allies.filter(e=>!e.fusion&&e.id!==a.id)) {
          let value=(a.maxHp-b.maxHp)*0.9+(b.maxHp-b.hp)*1.5+arrivalCount(a)*arrivalCount(b)*1.4;
          if(b.type==='crusader') value+=(a.maxHp-40)*1.5;
          if(a.type==='paladin'&&damagePower(b)>0) value+=4;
          if(b.type==='choir'&&arrivalCount(a)) value-=2;
          value-=b.hp*0.8;
          options.push({a,b,value});
        }
        options.sort((a,b)=>b.value-a.value);
        if(options[0]?.value>1) {
          const {a,b}=options[0];
          return {command:'fuse',args:[a.id,b.id],reason:`${label(a)}의 체력 ${a.hp}/${a.maxHp}을 몸체 A로 유지하고 ${label(b)}의 본 효과를 합침. 손상된 B와 공간 비용을 비교해 밀집한 복수 효과 구성.`};
        }
        return {command:'skip',args:[],reason:'융합으로 잃는 별도 몸체·인접 연계의 가치가 높아 현재 편성 유지.'};
      }
      throw Error(`정책이 처리하지 않는 단계: ${view.phase}`);
    },
  };
}

export const POLICY_DESCRIPTION = {
  information: '공개된 지도·동료·적 패턴과 매 차례 공개된 주사위 세 개 × 생존 동료의 이동 미리보기를 사용한다.',
  selection: '후보별 조건부 결과의 평균과 최악 점수를 8:2로 반영한다.',
  baseline: '대조군은 생존 동료 중 ID 순서가 가장 이른 동료를 선택하고 그 동료에 가장 높은 점수의 주사위를 쓴다.',
};
