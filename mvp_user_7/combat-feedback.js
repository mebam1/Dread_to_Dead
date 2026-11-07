import {enemyName, esc, patternName} from './ui.js';

const tokenNames = {poison:'독', rage:'분노', exhaustion:'탈진', quick:'속공'};
const outcomeNames = {win:'전투 완승', loss:'전투 패배', escape:'철수'};
const tile = x => Number.isInteger(x) ? x+'번 ' : '';
const sameNodeKey = (node, id) => node+' / '+id;
const shortName = name => name?.replace(/^(검은수달|수달|스컹크) /, '');
const directionText = dir => dir === 'left' ? '왼쪽' : '오른쪽';

/** Enemy IDs restart each battle. A fused companion receives a new ID. */
export function combatNames(events, ctx) {
  const allies = new Map(), enemies = new Map(), originals = new Map();
  const card = type => shortName(ctx.catalog?.companions?.[type]?.name);
  const rememberAlly = (id, type, secondType) => {
    const name = card(type);
    if (!name) return;
    if (secondType) {
      const second = card(secondType);
      allies.set(id, name+' + '+second);
      originals.set(id, {A:name, B:second});
    } else if (!allies.has(id)) allies.set(id, name);
  };
  const rememberStart = event => {
    if (!event) return;
    for (const a of event.allies || []) rememberAlly(a.id, a.type, a.fusion?.bType);
    for (const e of event.enemies || []) enemies.set(sameNodeKey(event.node,e.id),enemyName(e.type));
  };
  rememberStart(ctx.lastBattleStart);
  for (const e of ctx.view?.floors || []) if (e) rememberAlly(e.id,e.type,e.fusion?.bType);
  const viewNode = ctx.view?.node;
  for (const [index,e] of (viewNode?.enemies || []).entries()) {
    enemies.set(sameNodeKey(viewNode.id,'E'+(index+1)),enemyName(e.type));
  }
  for (const e of events) {
    if (e.type === 'battle-start') rememberStart(e);
    if (e.type === 'companion-created' || e.type === 'companion-lost') rememberAlly(e.id,e.companionType);
    if (e.type === 'fused') rememberAlly(e.id,e.parts?.[0]?.type,e.parts?.[1]?.type);
    if (e.type === 'enemy-killed') enemies.set(sameNodeKey(e.node,e.id),enemyName(e.enemyType));
  }
  const duplicateAllies=new Set(), knownNames=new Set();
  for (const name of allies.values()) {
    if (knownNames.has(name)) duplicateAllies.add(name);
    knownNames.add(name);
  }
  return {
    card,
    unit(id,event,part) {
      if (allies.has(id)) {
        const name=allies.get(id);
        const owner=part && originals.has(id)?originals.get(id)[part]+'('+part+')':name;
        return duplicateAllies.has(name)?owner+' ['+id+']':owner;
      }
      if (/^E\d+$/.test(id)) {
        const node = event?.node ?? viewNode?.id;
        return enemies.get(sameNodeKey(node,id)) || '적 '+id.slice(1);
      }
      return id || '';
    }
  };
}

export function combatEventText(e,names) {
  const source = names.unit(e.source,e,e.part);
  const target = names.unit(e.target,e);
  const trigger = names.unit(e.triggerSource,e,e.triggerPart);
  const location = tile(e.x);
  switch (e.type) {
    case 'drop': return source+' · 눈 '+e.die+' ('+(e.slot || 1)+'번 주사위) '+directionText(e.direction)+' 이동';
    case 'push': return target+' 밀림 · '+e.from+' → '+e.to+'번';
    case 'arrival': return location+source+' 도착 · '+(e.companionType==='saint'?'이웃 회복':'정면 공격');
    case 'arrival-copy': return location+source+' 복사 · '+(trigger || names.card(e.companionType) || '동료')+'의 '+(e.companionType==='saint'?'도착 회복':'도착 공격');
    case 'reaction': return source+' 반응'+(trigger?' · '+trigger+' 도착':'')+' → '+(e.companionType==='holyPriest'?'이웃 방어':'도착 칸 정면 공격');
    case 'rage-reaction': return source+' 반응 · '+trigger+'의 체력 감소로 분노 획득';
    case 'pass-effect': return location+source+' 통과 효과 · '+(e.companionType==='sprayer'?'가스 살포':'독 섭취');
    case 'miss': return source+' → '+location+'빈 '+(e.side==='enemy'?'적':'아군')+' 칸 · 빗나감';
    case 'damage': {
      const attacker = e.label === 'poison' ? '종료 독' : e.label === 'inactivity' ? '비활동' : source;
      const absorbed = e.absorbed ? ' · '+(e.side==='enemy'?'보호':'방어')+' 흡수 '+e.absorbed : '';
      const power=e.amount!==e.hpLoss?' · 원래 피해 '+e.amount:'';
      return (attacker?attacker+' → ':'')+location+target+power+' · 체력 피해 '+e.hpLoss+absorbed+' ('+e.hpBefore+'→'+e.hpAfter+')';
    }
    case 'heal': {
      const requested=e.requested>e.amount?' · 회복 시도 '+e.requested:'';
      return source+' → '+location+target+requested+' · 실제 회복 '+e.amount+' ('+e.hpBefore+'→'+e.hpAfter+')';
    }
    case 'redirect': return source+' 대신 받기 · '+names.unit(e.originalTarget,e)+'의 피해 '+e.amount+' 인수';
    case 'defense': return source+' → '+target+' · 방어 +'+e.amount+' (잔량 '+e.defense+')';
    case 'token': return target+' · '+(tokenNames[e.token] || e.token)+' '+(e.amount>=0?'+':'')+e.amount+' (보유 '+e.after+')';
    case 'rage-consumed': return source+' · 분노 '+e.amount+' 소모';
    case 'gas-installed': return source+' · 적 '+location+'가스 '+e.before+'→'+e.after;
    case 'gas-absorbed': return target+' · '+location+'가스 '+e.amount+' 흡수';
    case 'poison-eaten': return source+' · '+target+'의 독 '+e.amount+' 섭취';
    case 'counterattack': return source+' · '+patternName(e.pattern)+' → '+(e.positions?.length?e.positions.join('·')+'번':'대상 칸 없음');
    case 'path-deferred': return source+' · 경로 공격 연기, 오른쪽 3칸 이동';
    case 'support-granted': return source+' → '+target+' · 첫 타격 위력 +2';
    case 'support-consumed': return source+' · 첫 타격에 지원 +'+e.amount;
    case 'protection-granted': return source+' → '+target+' · 보호 +'+e.amount;
    case 'provider-removed': return source+' 처치로 '+target+'의 '+[e.protection?'보호 '+e.protection:'',e.support?'지원 '+e.support:''].filter(Boolean).join('·')+' 해제';
    case 'enemy-killed': return tile(e.pos)+names.unit(e.id,e)+' 처치 · 재화 +1';
    case 'companion-lost': return location+names.unit(e.id,e)+' 상실'+(e.reason==='exhaustion'?' · 탈진':'');
    case 'inactivity-penalty': return '비활동 · '+target+'에게 방어를 무시하는 피해 '+e.amount;
    case 'exit-placed': return location+'철수 지점 설치';
    case 'exit-contact': return source+' · '+location+'철수 지점 진입';
    case 'quick-cost': return source+' 속공 사용 → '+target;
    case 'round-start': return e.round+'라운드 시작';
    case 'round-end': return e.round+'라운드 종료 · 아군 '+e.allies.length+'명, 적 '+e.enemies.length+'명 생존';
    case 'outcome': return outcomeNames[e.outcome] || '';
    default: return '';
  }
}

export function combatLines(events,ctx) {
  const names=combatNames(events,ctx);
  return events.filter(e=>e.type!=='drop' && e.type!=='push').map(e=>combatEventText(e,names)).filter(Boolean);
}

export function combatTotals(events) {
  const totals = {dealt:0,taken:0,healed:0,absorbed:0,defense:0};
  for(const e of events) {
    if(e.type==='damage') {
      totals[e.side==='enemy'?'dealt':'taken'] += e.hpLoss;
      totals.absorbed += e.absorbed;
    } else if(e.type==='heal') totals.healed += e.amount;
    else if(e.type==='defense') totals.defense += e.amount;
  }
  return totals;
}

export function combatRanges(scenarios) {
  const rows = scenarios.map(s=>combatTotals(s.events));
  const ranges = {};
  for (const key of Object.keys(rows[0] || combatTotals([]))) {
    if (!rows.length) {
      ranges[key]='—';
      continue;
    }
    const values=rows.map(row=>row[key]);
    const min=Math.min(...values), max=Math.max(...values);
    ranges[key]=min===max?String(min):min+'~'+max;
  }
  return ranges;
}

function totalsHtml(scenarios) {
  const ranges = combatRanges(scenarios);
  const fields = [['dealt','적 체력 피해'],['healed','실제 회복']];
  if (scenarios.some(s=>s.events.some(e=>(e.type==='damage' || e.type==='miss') && e.side==='ally'))) fields.push(['taken','아군 체력 피해']);
  if (ranges.defense!=='0') fields.push(['defense','방어 부여']);
  if (ranges.absorbed!=='0') fields.push(['absorbed','방어·보호 흡수']);
  return '<dl class="cf-totals">'+fields.map(([key,label])=>
    '<div class="cf-stat cf-'+key+'"><dt>'+label+'</dt><dd>'+ranges[key]+'</dd></div>').join('')+'</dl>';
}

function listHtml(lines,start=1) {
  return '<ol class="cf-chain" start="'+start+'">'+lines.map(line=>'<li>'+esc(line)+'</li>').join('')+'</ol>';
}

function triggerLabel(e) {
  switch (e.type) {
    case 'arrival': return e.companionType==='saint'?'도착 회복':'도착 공격';
    case 'arrival-copy': return e.companionType==='saint'?'회복 복사':'공격 복사';
    case 'reaction': return e.companionType==='holyPriest'?'반응 방어':'반응 공격';
    case 'rage-reaction': return '분노 반응';
    case 'pass-effect': return e.companionType==='sprayer'?'통과 가스':'통과 독 섭취';
    case 'quick-cost': return '속공';
    case 'counterattack': return patternName(e.pattern);
    default: return '';
  }
}

// Keep all triggered abilities visible even when the detailed event list is folded.
function triggerSequence(events,ctx) {
  const names=combatNames(events,ctx), stages=[], bySource=new Map();
  for (const e of events) {
    const label=triggerLabel(e);
    if (label) {
      const active={actor:names.unit(e.source,e,e.part),label,results:new Map()};
      stages.push(active);
      bySource.set(e.source,active);
    } else if (bySource.has(e.source)) {
      const active=bySource.get(e.source);
      const report = (kind,amount) => active.results.set(kind,(active.results.get(kind) || 0)+amount);
      if (e.type==='damage') report('체력 피해',e.hpLoss);
      if (e.type==='heal') report('실제 회복',e.amount);
      if (e.type==='defense') report('방어',e.amount);
      if (e.type==='miss') report('빗나감',1);
      if (e.type==='token' && e.token==='rage') report('분노',e.amount);
    }
    if (e.type==='round-end' || e.type==='round-start') bySource.clear();
  }
  return stages.map(s=>{
    const actual=[...s.results].map(([kind,n])=>kind==='빗나감'?(n>1?'빗나감 '+n+'회':'빗나감'):kind+' '+n);
    return s.actor+' '+s.label+(actual.length?' · '+actual.join(', '):'');
  });
}

function sequenceHtml(scenarios,ctx) {
  const distinct=new Map();
  for (const s of scenarios) {
    const sequence=triggerSequence(s.events,ctx);
    if (sequence.length) distinct.set(JSON.stringify(sequence),sequence);
  }
  if (!distinct.size) return '';
  if (scenarios.some(s=>!s.events.some(e=>triggerLabel(e)))) distinct.set('empty',['발동 없음']);
  const label=distinct.size>1?'가능한 발동 순서':'발동 순서';
  return '<div class="cf-sequences"><strong>'+label+'</strong>'+[...distinct.values()].map(sequence=>
    '<ol class="cf-sequence">'+sequence.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol>').join('')+'</div>';
}

function branchTitle(scenario,names,node) {
  return scenario.conditions.map(choice=>{
    const purpose=choice.purpose==='비활동표적'?'비활동 대상':'방어 대상';
    return purpose+' '+names.unit(choice.targetId,{node});
  }).join(' · ');
}

export function renderPreviewFeedback(preview,ctx) {
  const scenarios=preview.scenarios || [];
  if (!scenarios.length) return '<p class="cf-empty">계산된 결과가 없습니다.</p>';
  const totals=totalsHtml(scenarios);
  let effects;
  if(scenarios.length===1) {
    effects=compactChain(combatLines(scenarios[0].events,ctx));
  } else {
    const names=combatNames([],ctx), node=ctx.view?.node?.id;
    // Keep each sequence attached to its random target; summing branches would invent damage.
    effects='<details class="cf-branches"><summary>무작위 대상별 효과 '+scenarios.length+'가지</summary>'+
      scenarios.map((s,i)=>'<details class="cf-branch"><summary>'+esc(branchTitle(s,names,node) || '결과 '+(i+1))+'</summary>'+
        listHtml(combatLines(s.events,ctx))+'</details>').join('')+'</details>';
  }
  const limited=preview.complete===false?'<p class="cf-note">계산된 분기에서의 수치입니다. 추가 결과가 있을 수 있습니다.</p>':'';
  return '<div class="cf-preview">'+totals+limited+sequenceHtml(scenarios,ctx)+effects+'</div>';
}

function compactChain(lines) {
  if (!lines.length) return '<p class="cf-empty">발동한 전투 효과 없음</p>';
  const visible=5;
  const tail=lines.length>visible?'<details class="cf-more"><summary>이후 효과 '+(lines.length-visible)+'개</summary>'+listHtml(lines.slice(visible),visible+1)+'</details>':'';
  return listHtml(lines.slice(0,visible))+tail;
}

export function renderLastBattle(ctx,compact=false) {
  const events=ctx.lastBattleEvents || [];
  if (!events.length) return '';
  const names=combatNames(events,ctx);
  const drop=events.find(e=>e.type==='drop');
  const quick=events.find(e=>e.type==='quick-cost');
  const outcome=events.find(e=>e.type==='outcome');
  const start=events.some(e=>e.type==='battle-start');
  const exit=events.find(e=>e.type==='exit-placed');
  if (!drop && !quick && !exit && !start && !outcome) return '';
  const headline=drop?combatEventText(drop,names):quick?combatEventText(quick,names):exit?combatEventText(exit,names):'라운드 시작 효과';
  const lines=events.filter(e=>e!==drop && e!==quick && e!==outcome).map(e=>combatEventText(e,names)).filter(Boolean);
  const title=outcome?(outcomeNames[outcome.outcome] || '전투 종료')+' · 마지막 행동':start?'전투 시작 결과':'직전 행동 결과';
  const visits=drop?events.filter(e=>e.type==='visit' && e.source===drop.source):[];
  const path=visits.length?'<p class="cf-route">실제 경로 '+[visits[0].from,...visits.map(e=>e.x)].join(' → ')+'</p>':'';
  const summary=totalsHtml([{events}])+sequenceHtml([{events}],ctx);
  const detail=compact?'<details class="cf-breakdown"><summary>처리 내역 보기</summary>'+path+listHtml(lines)+'</details>':compactChain(lines);
  return '<section class="cf-last'+(compact?' cf-last-inline':'')+'" data-last-action aria-label="'+title+'"><div class="cf-last-heading"><h2>'+title+'</h2><span>'+esc(headline)+'</span></div>'+
    (compact?'':path)+summary+detail+'</section>';
}
