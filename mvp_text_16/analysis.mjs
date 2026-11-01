import {CREATURES,STARTERS,RULE_VERSION} from './catalog.mjs';

/** Reports observations only. Counts do not certify growth value or build diversity. */
export function analyze(state,classification='normal',journal=[]){
  const records=new Map(STARTERS.map(([type,floor],i)=>['e'+(i+1),{id:'e'+(i+1),type,origin:'start',initialFloor:floor}]));
  const evidence=id=>{
    if(!records.has(id))records.set(id,{id,type:state.entities.find(e=>e.id===id)?.type,origin:'unknown'});
    const r=records.get(id);
    r.effects??={fear:0,anxiety:0,greed:0,prophecy:0,shieldGranted:0,shieldAbsorbedOnBody:0,damageTaken:0,hitsTaken:0,tokensLost:0,repaired:0,paidActives:0,redirectedHitsTaken:0,dieAdjustments:0,rerolls:0};
    return r;
  };
  const expansions=[];
  for(const [index,e] of state.history.entries()){
    if(['purchase','creature_reward','event_buy'].includes(e.kind)){
      records.set(e.entityId,{id:e.entityId,type:e.type,origin:{purchase:'shop',creature_reward:'free_reward',event_buy:'event'}[e.kind],nodeId:e.nodeId,price:e.price??0,
        finalReward:e.kind==='creature_reward'&&e.nodeId==='a3-d8-c1',candidates:e.candidates});
    }
    if(e.sourceId){
      const r=evidence(e.sourceId);r.type??=e.sourceType;
      if(e.kind==='fear')r.effects.fear+=e.amount;
      if(['anxiety','resource'].includes(e.kind))r.effects[{a:'anxiety',greed:'greed',prophecy:'prophecy'}[e.resource]]+=e.amount;
      if(e.kind==='shield')r.effects.shieldGranted+=e.amount;
      if(e.kind==='repair')r.effects.repaired+=e.amount;
      if(e.kind==='cost')r.effects.paidActives++;
      if(e.kind==='die_adjust')r.effects.dieAdjustments++;
      if(e.kind==='reroll')r.effects.rerolls++;
      if(!r.firstEffect&&['fear','anxiety','resource','shield','repair','guard','status','reroll','die_adjust'].includes(e.kind)&&(!('amount' in e)||e.amount>0))
        r.firstEffect={nodeId:e.nodeId,turn:e.turn,kind:e.kind};
    }
    if(e.kind==='hit'){
      const r=evidence(e.targetId);r.effects.shieldAbsorbedOnBody+=e.absorbed;
      r.effects.damageTaken+=e.damage;r.effects.hitsTaken++;r.effects.tokensLost+=e.before.p-e.after.p;
      if(!r.firstEffect&&(e.damage>0||e.absorbed>0))r.firstEffect={nodeId:e.nodeId,turn:e.turn,kind:'body_hit'};
      if(e.redirected)r.effects.redirectedHitsTaken++;
    }
    if(e.kind==='place')evidence(e.entityId).lastPlacement={nodeId:e.nodeId,floor:e.floor};
    if(e.kind==='upgrade')evidence(e.entityId).upgraded=true;
    if(e.kind==='destroy')evidence(e.entityId).destroyed=true;
    if(e.kind==='expand')expansions.push({index,nodeId:e.nodeId,before:e.before,after:e.after,cost:e.cost,moneyAfter:e.moneyAfter});
  }
  const entities=[...records.values()].map(r=>({...r,name:CREATURES[r.type]?.name??r.type,remaining:state.entities.find(e=>e.id===r.id)??null}));
  const byOrigin=origin=>entities.filter(e=>e.origin===origin);
  const shop=byOrigin('shop'),free=byOrigin('free_reward'),history=state.history;
  const actualFear={anxietyHarvest:history.filter(e=>e.kind==='fear'&&e.sourceType==='owner').reduce((s,e)=>s+e.amount,0),
    automaticProphecy:history.filter(e=>e.kind==='fear'&&e.source==='예언 자동 공포').reduce((s,e)=>s+e.amount,0)};
  return {rules:RULE_VERSION,classification,evidenceOnly:true,phase:state.phase,seed:state.seed,completed:state.completed,
    goals:{
      expansion:{purchases:expansions.map((e,i)=>({...e,placementsInNewSpace:history.slice(e.index+1,expansions[i+1]?.index).filter(x=>x.kind==='place'&&x.floor>e.before).map(x=>({entityId:x.entityId,floor:x.floor,nodeId:x.nodeId}))})),verdict:'Compare actual alternatives and free rearrangement; purchase count alone is not value.'},
      shop:{acquired:shop,unobservedContribution:shop.filter(e=>!e.firstEffect).map(e=>e.id),verdict:'Acquisition and effects are evidence; waiting/free-reward and soul-cost alternatives need review.'},
      freeReward:{acquired:free,combatEligible:free.filter(e=>!e.finalReward).length,unobservedContribution:free.filter(e=>!e.finalReward&&!e.firstEffect).map(e=>e.id),verdict:'Final-boss reward is excluded from later combat value.'},
      distinctClears:{clearCase:state.phase==='won'&&classification==='normal',actualFear,usedEntities:entities.filter(e=>e.firstEffect),verdict:'One run cannot establish two different clearing combinations.'}
    },decisions:journal.filter(j=>j.reason).map(({sequence,command,args,reason,before,after})=>({sequence,command,args,reason,before,after})),stats:state.stats,
    notice:'Granted shielding is not attributed as actual absorption by its provider. Effects and clear cases do not establish human enjoyment or causal value by themselves.'};
}
