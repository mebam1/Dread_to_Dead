import {art, attackForecast, esc, familyIcon, guestGainForecast, guestPortrait, icon, token, tokenTypes} from './ui.js';
import {canReorder, renderDecisions} from './decisions.js';
import {openPanel} from './panels.js';
import {animateStrike} from './battle-motion.js';
import {flashFeedback} from './feedback.js';
import {adventureMap} from './adventure-map.js';

const $ = selector => document.querySelector(selector);
const track = $('#track');
const modal = $('#modal');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let session, forecast, selectedFloor = null, busy = false;
let replaying = false;
let pendingQuick = null;
let enlarged = false;
let screen = 'map', selectedNodeId = null;
const names = {map:'경로 선택', management:'전투 준비', choose:'주사위 선택', prepare:'이동 준비',
  acquisition:'괴이 배치', shop:'상점', fusion:'융합', recovery:'회복', event:'이벤트',
  reward:'괴이 보상', die:'주사위 보상', won:'영업 완료', lost:'영업 종료'};
const pad = n => String(n).padStart(2,'0');
const columns = () => [...track.querySelectorAll('.column')];
const currentBattle = view => ['choose','prepare'].includes(view.phase) ? view.battle : null;
const combatScreen = phase => ['management','choose','prepare'].includes(phase);
const message = text => { $('#notice').textContent = text; };
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {cache:'no-store'} :
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || '요청을 처리할 수 없습니다.');
    error.status = res.status;
    throw error;
  }
  return data;
}

function fearText(battle) {
  return '공포 '+battle.fear+'/'+battle.guest.t;
}
function guestCell(floor, guest, battle) {
  const no = '<span class="slot-no">'+pad(floor)+'</span>';
  if (!guest) return no+'<span class="blank-mark" aria-hidden="true"></span>';
  const states=['anxiety','greed','prophecy'].filter(key=>battle?.[key]>0);
  const tokens=states.map(key=>token(key,battle[key])).join('');
  return '<button type="button" class="guest-open" data-panel="guest" aria-haspopup="dialog" aria-label="'+esc(guest.name+' 상세')+'">'+guestPortrait(guest)+no+
    '<span class="guest-tag"><span class="guest-name">'+esc(guest.name.replace(' · 3막 강화',''))+'</span>'+
    '<strong class="guest-fear">'+fearText(battle)+'</strong></span></button>'+
    (tokens?'<span class="guest-status">'+tokens+'</span>':'');
}
function guestAt(floor, guest, battle) {
  const waiting = floor === 0 && Boolean(guest);
  const portrait = $('#arrival-portrait');
  portrait.hidden = !waiting;
  if(waiting) portrait.setAttribute('aria-label',guest.name+' 상세');
  portrait.innerHTML = waiting ? guestPortrait(guest) : '';
  $('.table-foot').classList.toggle('at-entrance',waiting);
  const previous = waiting && battle.guests[battle.index-1];
  const where = session.previousGuestFloor ? session.previousGuestFloor+'층에서 ' : '';
  $('#arrival-history').textContent = waiting
    ? (previous ? where+'손님 '+battle.index+'/'+battle.guests.length+' '+previous.name+' 처치 · ' : '')+'첫 이동은 1층부터'
    : '';
  $('#board-fear').textContent=battle ? fearText(battle) : '';
  for (const col of columns()) {
    const n = Number(col.dataset.floor), el = col.querySelector('.guest-slot'), here = n===floor ? guest : null;
    el.classList.toggle('occupied', Boolean(here));
    el.setAttribute('role',here?'group':'img');
    el.setAttribute('aria-label', n+'층 · '+(here ? here.name+' · '+fearText(battle) : '빈 손님 카드'));
    el.innerHTML = guestCell(n,here,battle);
  }
}
function quickCoins(e, floor, actions, catalog) {
  return (e.quickAbilities ?? []).map(({side, type}) => {
    const ready = actions.some(action => action.id === e.id && action.side === side);
    const card = catalog.creatures[type];
    const origin = e.fusion ? (side === 'base' ? '왼쪽 본체 ' : '오른쪽 재료 ') : '';
    const label = floor+'층 '+origin+card.name+' 속공 · '+(ready ? '앞면 · 사용 가능' : '뒷면 · 사용 불가');
    const effect = side === 'donor' ? e.donorText : card.baseText+(e.upgraded ? ' · '+card.upgradeText : '');
    return '<button type="button" class="quick-coin" data-quick-id="'+esc(e.id)+'" data-quick-side="'+esc(side)+
      '" aria-label="'+esc(label)+'" title="'+esc(label+'\n'+effect)+'"'+(ready ? '' : ' disabled')+'>'+
      icon('quick',16)+icon('coin-back',16)+'</button>';
  }).join('');
}
function paper(e, floor, actions, catalog, label) {
  const corner = '<span class="card-top"><button type="button" class="floor-number floor-open" aria-label="'+esc(label)+' 상세" aria-haspopup="dialog">'+
    pad(floor)+'<small> F</small></button>'+
    (e ? icon(familyIcon(e.type),15) : '')+'</span>';
  if (!e) return corner+'<span class="blank-mark" aria-hidden="true"></span><span class="empty-text">빈 층</span>';
  const effects=['seal','ambush','defense','stepBase','stepDonor'].filter(key=>e[key]>0);
  const coins = quickCoins(e, floor, actions, catalog);
  const statuses = effects.length ? '<div class="extra-tokens">'+effects.map(k=>token(k,e[k])).join('')+'</div>' : '';
  const name = '<strong class="card-name">'+esc(e.name)+(e.fusion && e.upgraded?' +':'')+'</strong>';
  const values = '<div class="card-values">'+token('tokens',e.tokens)+'<span title="공략도 / 공략 한계">'+esc(e.damage)+'/'+e.limit+'</span></div>';
  if (!coins) return corner+art(e.type,e.donor)+name+values+statuses;
  return corner+art(e.type,e.donor)+statuses+name+'<div class="quick-footer">'+values+
    '<span class="quick-coins">'+coins+'</span></div>';
}
function damageSticker({kind, power, absorbed, actual, count}) {
  const empty = kind === 'miss';
  const amount = empty ? power : actual;
  const description = empty ? '빈 층에 위력 '+power+' 공격 · 빗나감' :
    '공격 위력 '+power+' · '+(absorbed ? '방어 '+absorbed+' 흡수 · ' : '')+'공략도 +'+actual;
  const repeat = count > 1 ? ' ×'+count : '';
  return '<span class="damage-sticker" data-kind="'+kind+'" role="img" aria-label="'+esc(description+repeat)+'">'+
    '공략도 <span class="damage-amount"'+(absorbed ? ' data-defended' : '')+'>+'+esc(amount)+'</span>'+repeat+'</span>';
}

function showGuestGains(host, floor, entries = [], received = false) {
  const reader = floor === 0 ? $('#arrival-portrait') : host.querySelector('.guest-open') ?? host;
  host.querySelector('.guest-gain-preview')?.remove();
  if (!entries.length) {
    reader.removeAttribute('aria-describedby');
    host.removeAttribute('title');
    return;
  }
  const totals = new Map();
  const details = [];
  for (const {resource, amount, visit} of entries) {
    totals.set(resource, (totals.get(resource) ?? 0) + amount);
    const when = received ? '' : visit === 0 ? '이동 전 ' : visit+'번째 칸 ';
    details.push(when+tokenTypes[resource][0]+' ×'+amount);
  }
  const label = (received ? '획득' : '획득 예정')+' · '+details.join(', ');
  const chips = Array.from(totals, ([resource, amount]) =>
    '<span class="guest-gain" data-resource="'+resource+'">'+icon(tokenTypes[resource][1],14)+'×'+amount+'</span>').join('');
  const id = 'guest-gains-'+floor;
  host.insertAdjacentHTML('beforeend','<span id="'+id+'" class="guest-gain-preview'+(received ? ' is-gained' : '')+
    '" role="img" aria-label="'+esc(label)+'">'+chips+'</span>');
  reader.setAttribute('aria-describedby',id);
  host.title = label;
}

function markRoute(raw) {
  forecast = raw;
  const path = raw?.path ?? [];
  const {byFloor, damageByFloor} = attackForecast(raw);
  const guestGains = guestGainForecast(raw,session.view.battle?.position ?? 0);
  showGuestGains($('#arrival-gains'),0,guestGains.get(0));
  for (const col of columns()) {
    const n = Number(col.dataset.floor), visits = path.flatMap((f,i)=>f===n?[i+1]:[]);
    const arrival = raw?.events?.some(e=>e.type==='floor-visit' && e.arrival && e.floor===n);
    col.classList.toggle('pass',visits.length>0 && !arrival);
    col.classList.toggle('arrival',Boolean(arrival));
    const slot = col.querySelector('.guest-slot');
    col.querySelector('.route-label')?.remove();
    if (visits.length) slot.insertAdjacentHTML('beforeend',
      '<span class="route-label">'+visits.join('·')+' '+(arrival?'도착':'통과')+'</span>');
    showGuestGains(slot,n,guestGains.get(n));

    const card = col.querySelector('.floor-card');
    const opener = card.querySelector('.floor-open');
    card.querySelector('.attack-tags')?.remove();
    const marks = byFloor.get(n);
    if (!marks) {
      opener.removeAttribute('aria-describedby');
      continue;
    }
    const stickers = (damageByFloor.get(n) ?? []).map(damageSticker).join('');
    // The sticker carries the strike count. Keep labels that explain an empty floor,
    // redirection or a separate inactivity penalty.
    const tags = marks.filter(m => m.kind !== 'hit').map(({kind,text,count}) => {
      const repeat = count > 1 && kind !== 'miss' && kind !== 'guard' ? ' ×'+count : '';
      return '<span class="attack-mark" data-kind="'+kind+'">'+icon(kind==='guard'?'shield':'target',12)+esc(text)+repeat+'</span>';
    }).join('');
    const id = 'attack-floor-'+n;
    card.insertAdjacentHTML('beforeend','<span class="attack-tags" id="'+id+'">'+stickers+tags+'</span>');
    opener.setAttribute('aria-describedby',id);
  }
}
function paintBoard(battle) {
  const v=session.view, oldScroll=track.scrollLeft;
  track.classList.toggle('can-reorder',canReorder(v.phase));
  track.innerHTML=v.floors.map((e,i)=>{
    const f=i+1, label=f+'층 · '+(e?.name ?? '빈 층');
    return '<div class="column" data-floor="'+f+'"><div class="guest-slot" role="img"></div>'+
      '<div class="floor-card '+(e?'filled':'empty')+'" data-inspect="'+f+'" tabindex="-1" role="group" aria-label="'+esc(label)+'">'+
      paper(e,f,v.quickActions ?? [],session.catalog,label)+(battle?.exit===f?'<span class="exit-tag">탈출구</span>':'')+'</div></div>';
  }).join('');
  track.scrollLeft=oldScroll;
  selectFloor(selectedFloor,false);
  guestAt(battle?.position,battle?.guest,battle);
  markRoute(forecast);
  updateRange();
}
function metric(glyph,label,value) {
  return '<div class="metric">'+icon(glyph,24)+'<small>'+label+'</small><strong>'+value+'</strong></div>';
}
function render() {
  const v=session.view;
  const completed=v.visited.filter(id=>id.startsWith(v.act+'-')).length;
  $('#act-label').textContent='제 '+['Ⅰ','Ⅱ','Ⅲ'][v.act-1]+' 막   ·   '+names[v.phase];
  $('#metrics').innerHTML=metric('soul','보유 영혼',v.souls)+metric('cards','배치 괴이',v.floors.filter(Boolean).length+'<small> / 10</small>')+
    metric('map','방문 완료',completed+'<small> / 8</small>');
  const map = screen === 'map';
  const board = screen === 'hotel' || (screen === 'activity' && combatScreen(v.phase));
  const battle=currentBattle(v);
  const mapNode=v.map.find(n=>n.id===selectedNodeId) ?? v.map.find(n=>n.current) ?? v.map.find(n=>n.reachable) ?? v.map.at(-1);
  $('#map-screen').hidden=!map;
  $('#hotel-screen').hidden=!board;
  $('#table').dataset.screen=screen;
  const activity=$('nav [data-view="activity"]');
  activity.hidden=v.phase==='map';
  activity.querySelector('span').textContent=battle?'전투 계속':names[v.phase];
  for (const tab of document.querySelectorAll('nav [data-view]')) {
    const active=tab.dataset.view===screen;
    tab.classList.toggle('current',active);
    if(active) tab.setAttribute('aria-current','page');
    else tab.removeAttribute('aria-current');
  }
  $('#table h1').textContent=map?'모험 지도':board?'괴이 호텔':names[v.phase];
  $('#map-screen').innerHTML=map ? adventureMap(v,mapNode.id) : '';
  if(board) {
    paintBoard(battle);
    $('#location').textContent=battle?(battle.position?battle.position+'층 · ':'입장 대기 · 손님 '+(battle.index+1)+'/'+battle.guests.length+' · ')+battle.guest.name:
      (canReorder(v.phase)?'손님 입장 대기 · 괴이 카드를 끌어 재배치':
        v.phase==='won'?'마지막 영업 완료':v.phase==='lost'?'영업 종료':'손님 입장 대기');
  } else {
    track.replaceChildren();
    $('#arrival-portrait').hidden=true;
    $('#arrival-portrait').replaceChildren();
    $('#arrival-gains').replaceChildren();
  }
  renderDecisions({root:$('#decisions'),view:v,catalog:session.catalog,revision:session.revision,selectedFloor,screen,mapNode,
    act,api,preview:raw=>{if(board && screen!=='map' && !replaying && session.view===v) markRoute(raw);},
    selectFloor,showDetails:n=>panel('floor',n),newGame:()=>panel('settings')});
}

function switchScreen(next) {
  if(!session || busy || next===screen || (next==='activity' && session.view.phase==='map')) return;
  clearQuick();
  finishDrag();
  document.querySelector('.token-tip')?.remove();
  screen=next;
  forecast=null;
  render();
  if(screen!=='map') revealGuest();
  window.scrollTo({top:0,behavior:'instant'});
}
function updateRange() {
  const cols=columns();
  if (!cols.length) return;
  const box=track.getBoundingClientRect();
  const shown=cols.filter(c=>{const r=c.getBoundingClientRect();return r.right>box.left+5 && r.left<box.right-5;});
  if(shown.length) $('#range').textContent=pad(shown[0].dataset.floor)+'–'+pad(shown.at(-1).dataset.floor);
  $('#prev').disabled=track.scrollLeft<=2;
  $('#next').disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;
}
function reveal(floor) {
  const col=columns()[floor-1];
  if (!col) return;
  const r=col.getBoundingClientRect(), viewport=track.getBoundingClientRect();
  if(r.left<viewport.left-1) track.scrollLeft+=r.left-viewport.left;
  if(r.right>viewport.right+1) track.scrollLeft+=r.right-viewport.right;
}
function revealGuest() {
  const battle=currentBattle(session.view);
  if(battle) reveal(battle.position || 1);
}
function selectFloor(n, scroll=true) {
  selectedFloor=Number(n)>=1 && Number(n)<=10 ? Number(n) : null;
  for(const card of track.querySelectorAll('[data-inspect]')){
    const selected=Number(card.dataset.inspect)===selectedFloor;
    card.classList.toggle('is-selected',selected);
    if(selected) card.setAttribute('aria-current','true');
    else card.removeAttribute('aria-current');
  }
  if(scroll && selectedFloor) reveal(selectedFloor);
}

function targetMode(coin, actions) {
  const {quickId:id, quickSide:side} = coin.dataset;
  const targets = new Set(actions.map(action => action.target));
  pendingQuick = {id, side, targets, coin};
  const source = session.view.floors.find(entity => entity?.id === id);
  const type = side === 'base' ? source.type : source.donor;
  const origin = source.fusion ? (side === 'base' ? '왼쪽 ' : '오른쪽 ') : '';
  $('#quick-instruction').textContent = origin+session.catalog.creatures[type].name+' · 속공을 받을 괴이 카드를 선택하세요.';
  $('#quick-prompt').hidden = false;
  $('#decisions').inert = true;
  track.classList.add('choosing-quick-target');
  coin.setAttribute('data-targeting','');
  for (const card of track.querySelectorAll('.floor-card')) {
    const floor = Number(card.dataset.inspect);
    const entity = session.view.floors[floor-1];
    const opener = card.querySelector('.floor-open');
    if (!targets.has(entity?.id)) { opener.disabled = true; continue; }
    card.classList.add('quick-target');
    opener.removeAttribute('aria-haspopup');
    opener.setAttribute('aria-label',floor+'층 '+entity.name+' · 속공 대상으로 선택');
  }
}

function clearQuick(restoreFocus = false) {
  if (!pendingQuick) return;
  const {coin} = pendingQuick;
  pendingQuick = null;
  coin.removeAttribute('data-targeting');
  for (const card of track.querySelectorAll('.floor-card')) {
    card.classList.remove('quick-target');
    const opener = card.querySelector('.floor-open');
    opener.disabled = false;
    opener.setAttribute('aria-haspopup','dialog');
    opener.setAttribute('aria-label',card.getAttribute('aria-label')+' 상세');
  }
  track.classList.remove('choosing-quick-target');
  $('#quick-prompt').hidden = true;
  $('#decisions').inert = busy;
  if (restoreFocus) coin.focus();
}

function useCoin(coin, keyboard) {
  if (busy || coin.disabled) return;
  const {quickId:id, quickSide:side} = coin.dataset;
  const actions = session.view.quickActions.filter(a => a.id === id && a.side === side);
  if (!actions.length) return;
  const cancel = pendingQuick?.coin === coin;
  clearQuick();
  if (cancel) return;
  if (actions[0].target) {
    targetMode(coin,actions);
    if (keyboard) track.querySelector('.quick-target .floor-open')?.focus();
  } else {
    act('active',[id,side]).catch(error => message(error.message));
  }
}
track.addEventListener('scroll',updateRange,{passive:true});
new ResizeObserver(updateRange).observe(track);
for (const [key,dir] of [['prev',-1],['next',1]]) $('#'+key).onclick=()=>{
  track.scrollBy({left:dir*track.clientWidth,behavior:reducedMotion.matches?'instant':'smooth'});
};
$('#zoom').onclick=()=>{
  enlarged=!enlarged;$('.table-frame').classList.toggle('large',enlarged);
  $('#zoom').textContent=enlarged?'기본 크기':'카드 확대';
  $('#zoom').setAttribute('aria-pressed',String(enlarged));updateRange();
};

const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function showVisit(event, stats, cols) {
  const from=stats.position, to=event.floor;
  reveal(to);
  const target=cols[to-1].querySelector('.guest-slot');
  const source=cols[from-1]?.querySelector('.guest-slot');
  const width=target.offsetWidth;
  const dx=!source || (from===10 && to===1) ? -width*.42 :
    Math.max(-width*1.25,Math.min(width*1.25,source.getBoundingClientRect().left-target.getBoundingClientRect().left));
  stats.position=to;
  guestAt(to,stats.guest,stats);
  $('#location').textContent=stats.guest.name+' · '+to+'층 '+(event.arrival?'도착':'통과');
  const motion=target.animate([{transform:'translateX('+dx+'px)',opacity:.65},{transform:'none',opacity:1}],
    {duration:135,easing:'ease-out'});
  target.style.zIndex='4';
  try { await motion.finished; } finally { target.style.zIndex=''; }
  await delay(event.arrival?140:60);
}

// Consume the committed journal in order. Each visual completes on its floor before
// the next visit, attack or guest can be displayed.
async function replayBattleEvents(events,view) {
  if(!currentBattle(view) || reducedMotion.matches) return;
  if(events.some(e=>e.type==='floor-visit' || e.type==='fear' || (e.type==='gain' && e.amount>0))) {
    $('.board-body').scrollIntoView({block:'nearest',behavior:'instant'});
  }
  const stats={...view.battle};
  const cols=columns();
  const guestSlot=()=>stats.position ? cols[stats.position-1].querySelector('.guest-slot') : $('#arrival-portrait');
  const sourceCards=new Map(view.floors.flatMap((entity,i)=>entity ? [[entity.id,cols[i].querySelector('.floor-card')]] : []));
  for(const e of events) {
    if(e.type==='guest-entry') break;
    if(e.type==='floor-visit') {
      await showVisit(e,stats,cols);
    } else if(e.type==='hit' || e.type==='miss') {
      if(!e.penalty) await animateStrike({track,guestSlot:guestSlot(),targetFloor:e.receiver ?? e.floor});
    } else if(e.type==='fear' || e.type==='gain' || e.type==='spend') {
      if(!e.amount) continue;
      const fear=e.type==='fear';
      if(fear) stats.fear=Math.min(stats.fear+e.amount,stats.guest.t);
      else stats[e.resource]=e.total;
      guestAt(stats.position,stats.guest,stats);
      if(e.type!=='spend') {
        const slot=guestSlot();
        const holder=stats.position ? slot : $('#arrival-gains');
        if (!fear) showGuestGains(holder,stats.position,[e],true);
        try {
          await flashFeedback(slot,sourceCards.get(fear?e.id:e.source),fear?'fear':e.resource);
        } finally {
          if (!fear) showGuestGains(holder,stats.position);
        }
      }
    } else if(e.type==='heart') {
      stats.hearts=e.remaining;
      if(e.remaining) {
        stats.fear=0;
        guestAt(stats.position,stats.guest,stats);
      }
    } else if(e.type==='kill') {
      const slot=guestSlot();
      slot.insertAdjacentHTML('beforeend','<strong class="kill-stamp">처치</strong>');
      slot.setAttribute('aria-label',stats.position+'층 · '+stats.guest.name+' 처치');
      $('#location').textContent=stats.position+'층에서 '+stats.guest.name+' 처치';
      $('#board-fear').textContent='마지막 심장 소진';
      await delay(650);
    }
  }
}
function outcomeText(events,visits,battle) {
  const hits=events.filter(e=>e.type==='hit' && e.breached);
  const items=[];
  const active=events.find(e=>e.type==='active');
  if (active) {
    const cost=events.find(e=>e.type==='spend' && e.amount);
    const label=session.catalog.creatures[active.ability].name+' 속공 발동';
    items.push(cost ? label+' · '+tokenTypes[cost.resource][0]+' '+cost.amount+' 지불' : label);
  }
  const kill=events.find(e=>e.type==='kill');
  for(const e of events) {
    if(e.type==='destroy') items.push(e.floor+'층 괴이 파괴');
    if(e.type==='heart' && e.remaining>0) items.push(battle.guest.name+' 심장 '+e.remaining+'개 남음');
    if(e.type==='kill') items.push((visits.at(-1)?.floor ?? battle.position)+'층에서 '+battle.guest.name+' 처치');
    if(e.type==='guest-entry' && kill) {
      items.push('다음 손님 '+(e.index+1)+'/'+battle.guests.length+' '+battle.guests[e.index].name+' 입장 대기');
    }
  }
  if(hits.length) items.push('파훼 토큰 '+hits.length+'개 소모');
  const swap=events.find(e=>e.type==='swap');
  if(swap) items.push(swap.from+'층 → '+swap.to+'층 · '+(swap.other?'두 괴이 맞교환':'빈 층으로 이동'));
  if(visits.length) items.unshift('손님 이동 '+visits.map(e=>e.floor+'층').join(' → '));
  return items.join(' · ');
}
async function commit(path,body) {
  if (busy) return;
  busy=true; document.body.dataset.busy=''; $('#decisions').inert=true;
  clearQuick();
  // Block a second activation while the server commits or the turn is playing out.
  const lockedCoins=track.querySelectorAll('button[data-quick-id]:enabled');
  for (const coin of lockedCoins) coin.disabled=true;
  document.querySelector('.token-tip')?.remove();
  try{
    const before=session.view;
    const next=await api(path,{...body,revision:session.revision});
    const events=next.events ?? [];
    const visits=events.filter(e=>e.type==='floor-visit');
    replaying=true;
    try {
      if(!$('#hotel-screen').hidden) {
        if(visits.length || events.some(e=>e.type==='gain')) markRoute(null);
        await replayBattleEvents(events,before);
      }
    } catch(error) {
      // The server has committed this action even if the browser canceled an animation.
      console.warn('전투 연출 중단',error);
    } finally { replaying=false; }
    const newGame=path==='/api/new';
    if(newGame || before.phase!==next.view.phase) {
      screen=next.view.phase==='map'?'map':'activity';
      selectedNodeId=null;
    }
    const previousScreen=$('#table').dataset.screen;
    session=next; forecast=null; selectedFloor=null;
    modal.close();
    render();
    if(previousScreen!==screen || newGame) window.scrollTo({top:0,behavior:'instant'});
    if(visits.length || body.cmd==='start') revealGuest();
    message(outcomeText(events,visits,before.battle));
  }catch(error){
    if(error.status===409){session=await api('/api/state');screen='map';selectedNodeId=null;forecast=null;modal.close();render();}
    message(error.message); throw error;
  }finally{
    busy=false;delete document.body.dataset.busy;$('#decisions').inert=false;
    // A rejected request leaves the old buttons mounted. A committed view renders new ones.
    for (const coin of lockedCoins) if (coin.isConnected) coin.disabled=false;
  }
}
const act=(cmd,args=[])=>commit('/api/action',{cmd,args});
let drag=null, suppressDragClick=false, scrollFrame=0;

function updateDropTarget(x,y) {
  const card=document.elementFromPoint(x,y)?.closest('.floor-card');
  const target=card && track.contains(card) && card!==drag.source ? card : null;
  if(drag.target!==target){
    drag.target?.classList.remove('drop-target');
    drag.target=target;
    target?.classList.add('drop-target');
  }
}

// Holding a card at the edge reveals floors beyond the current viewport.
function scrollWhileDragging() {
  scrollFrame=0;
  if(!drag?.ghost) return;
  const r=track.getBoundingClientRect();
  const row=drag.source.getBoundingClientRect();
  if(drag.y<row.top || drag.y>row.bottom || drag.x<r.left || drag.x>r.right) return;
  const edge=36;
  const direction=drag.x<r.left+edge ? -1 : drag.x>r.right-edge ? 1 : 0;
  if(!direction) return;
  const previous=track.scrollLeft;
  track.scrollLeft+=direction*9;
  if(previous!==track.scrollLeft){
    updateDropTarget(drag.x,drag.y);
    scrollFrame=requestAnimationFrame(scrollWhileDragging);
  }
}

function finishDrag() {
  if(!drag) return;
  const {source,target,ghost,pointer}=drag;
  drag=null;
  cancelAnimationFrame(scrollFrame);
  scrollFrame=0;
  source.classList.remove('drag-source');
  target?.classList.remove('drop-target');
  ghost?.remove();
  track.classList.remove('is-dragging');
  if(track.hasPointerCapture(pointer)) track.releasePointerCapture(pointer);
}

document.addEventListener('pointerdown',event=>{
  if(!event.isPrimary || event.button!==0) return;
  suppressDragClick=false;
  const source=event.target.closest('#track.can-reorder .floor-card.filled');
  if(!source || busy || pendingQuick || event.target.closest('[data-token],[data-quick-id]')) return;
  finishDrag();
  const r=source.getBoundingClientRect();
  drag={source,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,
    offsetX:event.clientX-r.left,offsetY:event.clientY-r.top,revision:session.revision};
});
document.addEventListener('pointermove',event=>{
  if(drag?.pointer!==event.pointerId) return;
  if(busy || !drag.source.isConnected) return finishDrag();
  const {clientX:x,clientY:y}=event;
  if(!drag.ghost){
    if(Math.hypot(x-drag.startX,y-drag.startY)<7) return;
    const source=drag.source;
    const ghost=source.cloneNode(true);
    ghost.className='floor-card drag-ghost';
    ghost.inert=true;
    ghost.setAttribute('aria-hidden','true');
    ghost.style.width=source.offsetWidth+'px';
    ghost.style.height=source.offsetHeight+'px';
    ghost.style.setProperty('--lower',ghost.style.height);
    ghost.style.transformOrigin=drag.offsetX+'px '+drag.offsetY+'px';
    document.body.append(ghost);
    drag.ghost=ghost;
    suppressDragClick=true;
    track.classList.add('is-dragging');
    source.classList.add('drag-source');
    track.setPointerCapture(event.pointerId);
  }
  drag.x=x; drag.y=y;
  drag.ghost.style.left=x-drag.offsetX+'px';
  drag.ghost.style.top=y-drag.offsetY+'px';
  updateDropTarget(x,y);
  if(!scrollFrame) scrollFrame=requestAnimationFrame(scrollWhileDragging);
});
document.addEventListener('pointerup',event=>{
  if(drag?.pointer!==event.pointerId) return;
  if(drag.ghost) updateDropTarget(event.clientX,event.clientY);
  const {source,target,revision}=drag;
  finishDrag();
  if(target && !busy && revision===session.revision && canReorder(session.view.phase)){
    act('swap',[Number(source.dataset.inspect),Number(target.dataset.inspect)]).catch(error=>message(error.message));
  }
});
for(const name of ['pointercancel','lostpointercapture']){
  document.addEventListener(name,event=>{
    if(drag?.pointer===event.pointerId && (name==='pointercancel' || event.target===track)) finishDrag();
  });
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape') { finishDrag(); clearQuick(true); }
});
window.addEventListener('blur',finishDrag);

function panel(kind,subject=null){
  if(busy||!session)return;
  clearQuick();
  Promise.resolve(openPanel(kind,{view:session.view,catalog:session.catalog,api,act,
    newGame:seed=>commit('/api/new',{seed}),modal},subject)).catch(error=>message(error.message));
}
let tipTimer;
function showToken(el){
  const def=tokenTypes[el.dataset.token];
  if(!def) return;
  document.querySelector('.token-tip')?.remove();
  clearTimeout(tipTimer);
  const tip=document.createElement('aside'); tip.className='token-tip';tip.setAttribute('role','status');
  tip.textContent=def[0]+' '+el.textContent+' · '+def[2];
  (modal.open?modal:document.body).append(tip);
  tipTimer=setTimeout(()=>tip.remove(),4200);
}
document.addEventListener('click',event=>{
  if(suppressDragClick && event.detail>0){event.preventDefault();event.stopPropagation();return;}
  const nav=event.target.closest('[data-view],[data-home]');
  if(nav) { event.preventDefault(); switchScreen(nav.dataset.view ?? 'map'); return; }
  const node=event.target.closest('[data-map-node]');
  if(node && screen==='map' && !busy) {
    selectedNodeId=node.dataset.mapNode;
    render();
    $('#map-screen [aria-pressed="true"]')?.focus({preventScroll:true});
    const details=$('#decisions');
    if(event.detail>0 && details.getBoundingClientRect().bottom<0) details.scrollIntoView({block:'start',behavior:'instant'});
    return;
  }
  if(event.target.closest('[data-cancel-quick]')) { clearQuick(true); return; }
  const coin=event.target.closest('button[data-quick-id]');
  if(coin) { useCoin(coin,event.detail===0); return; }
  const t=event.target.closest('[data-token]');
  if(t){event.stopPropagation();showToken(t);return;}
  const card=event.target.closest('#track .floor-card');
  if(pendingQuick && card) {
    const entity=session.view.floors[Number(card.dataset.inspect)-1];
    if(pendingQuick.targets.has(entity?.id)) {
      act('active',[pendingQuick.id,pendingQuick.side,entity.id]).catch(error=>message(error.message));
    }
    return;
  }
  const trigger=event.target.closest('[data-panel],[data-inspect]');
  if(!trigger)return;
  if(trigger.dataset.inspect){selectFloor(trigger.dataset.inspect);panel('floor',selectedFloor);}
  else if(trigger.dataset.panel==='guest' && trigger.hasAttribute('data-guest-node')) {
    panel('guest',{nodeId:trigger.dataset.guestNode,index:Number(trigger.dataset.guestIndex)});
  }
  else panel(trigger.dataset.panel);
},true);
document.addEventListener('focusin',e=>{if(e.target.matches('[data-token]'))showToken(e.target);});
document.addEventListener('keydown',e=>{
  if(['Enter',' '].includes(e.key)&&e.target.matches('[data-inspect],[data-token]')){
    e.preventDefault();e.target.click();
  }
});
try {
  session=await api('/api/state');
  render();
  revealGuest();
} catch(error) { message('호텔을 불러오지 못했습니다. '+error.message); }
