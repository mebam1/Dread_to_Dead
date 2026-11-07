import {renderBattle} from './battle.js';
import {renderCampaign} from './campaign.js';
import {combatEventText, combatNames, renderLastBattle} from './combat-feedback.js';
import {cardBadges, cardEffects, esc, icon, nodeName, portrait} from './ui.js';

const $ = id => document.getElementById(id);
const phaseNames = {management:'전투 준비', prepare:'전장', shop:'상점', fusion:'융합', upgrade:'강화', reward:'승리 보상', place:'동료 배치', won:'원정 결과', lost:'원정 결과'};
let game, tab = 'map', busy = false, toastTimer;

async function request(path, options) {
  const response = await fetch(path, {cache:'no-store', ...options});
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '요청을 처리할 수 없습니다.'), {status:response.status});
  return result;
}
function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = !message;
  if (message) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function defaultTab(phase) { return phase === 'map' ? 'map' : 'current'; }
function selectTab(next) {
  if (!game || busy) return;
  tab = next;
  render();
}
function showDialog(title, content) {
  $('dialog-title').textContent = title;
  $('dialog-body').innerHTML = content;
  if (!$('dialog').open) $('dialog').showModal();
}
function closeDialog() { $('dialog').close(); }
$('dialog-close').onclick = closeDialog;
$('dialog').addEventListener('click', e => { if (e.target === $('dialog')) {const r=e.target.getBoundingClientRect();if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) closeDialog();} });
$('brand').onclick = e => {e.preventDefault(); selectTab('map');};
function eventText(e, names) {
  const effect = combatEventText(e, names);
  if (effect) return effect;
  switch (e.type) {
    case 'campaign-start': return '원정 출발';
    case 'act-start': return e.act+'막 진입';
    case 'node-visited': return nodeName(e.kind)+' 방문';
    case 'recovery': return '회복 지점 · 생존 동료 전원 완치';
    case 'player-roll': return '주사위 굴림 · '+(e.dice?.join(' · ') ?? e.die);
    case 'visit': return names.unit(e.source,e)+' · '+e.from+' → '+e.x+'번 '+(e.kind==='arrival'?'도착':'통과');
    case 'battle-finished': return (e.outcome==='win'?'완승':e.outcome==='escape'?'철수':'패배')+' · '+e.rounds+'라운드';
    case 'purchased': return '동료 구매 · 재화 −'+e.price;
    case 'companion-placed': return '동료 배치 · '+e.position+'번';
    case 'upgraded': return '동료 강화 · '+names.unit(e.id,e);
    case 'fused': return '동료 융합 · '+names.unit(e.id,e);
    case 'campaign-won': return '3막 원정 완수';
    case 'campaign-lost': return '원정 종료';
    default: return '';
  }
}
async function openJournal() {
  const rev = game.revision;
  try {
    const [entries, report] = await Promise.all([request('/api/journal'), request('/api/report')]);
    if (game.revision !== rev) return;
    const names = combatNames(entries,game);
    const groups = [[]];
    for (const e of entries) {
      if (e.type === 'decision') groups.push([]);
      const label = eventText(e,names);
      if (label) groups.at(-1).push({e,label});
    }
    const batches = groups.filter(g=>g.length).reverse().map((rows,i)=>{
      const first = rows[0].e;
      const when = (first.node || first.act+'막')+(first.round?' / '+first.round+'R':'');
      return '<details class="cf-journal-group"'+(i===0?' open':'')+'><summary><small>'+esc(when)+'</small>'+esc(rows[0].label)+'</summary>'+
        '<ol class="event-list">'+rows.map(row=>'<li>'+esc(row.label)+'</li>').join('')+'</ol></details>';
    });
    showDialog('원정 기록', '<p>판 번호 '+esc(report.seed)+' · '+report.visited+'/54 지점 · 전투 '+report.battles.length+'회</p>'+batches.join(''));
  } catch (e) { notify(e.message); }
}
function newGame() {
  showDialog('새 원정', '<form class="dialog-form" id="new-form"><label for="seed">판 번호</label><input id="seed" type="number" required min="0" max="9007199254740991" step="1" value="'+esc(game.view.seed)+'"><small>시작하면 현재 저장 기록을 새 원정으로 교체합니다.</small><div class="dialog-actions"><button class="dialog-secondary" type="button" id="cancel-new">취소</button><button class="dialog-primary" type="submit">원정 시작</button></div></form>');
  $('cancel-new').onclick = closeDialog;
  $('new-form').onsubmit = async e => {
    e.preventDefault();
    if (await change('/api/new', {seed:Number($('seed').value)})) closeDialog();
  };
}
function settings() {
  const active = !['won','lost'].includes(game.view.phase);
  showDialog('원정 관리', '<p>판 번호 '+esc(game.view.seed)+' · '+esc(game.view.version)+'</p><p>현재 진행은 선택할 때마다 저장됩니다.</p><div class="dialog-actions">'+(active?'<button class="dialog-secondary" id="give-up">원정 포기</button>':'')+'<button class="dialog-primary" id="show-new">새 원정</button></div>');
  $('show-new').onclick = newGame;
  if (active) $('give-up').onclick = () => {
    showDialog('원정 포기', '<p>현재 원정을 패배로 마칩니다.</p><div class="dialog-actions"><button class="dialog-secondary" id="keep-playing">계속 플레이</button><button class="dialog-primary" id="end-game">포기 확정</button></div>');
    $('keep-playing').onclick = closeDialog;
    $('end-game').onclick = async () => { if (await action('give-up')) closeDialog(); };
  };
}
async function change(path, body) {
  if (busy) return false;
  busy = true;
  $('stage').setAttribute('aria-busy','true');
  try {
    const prior = game.view.phase;
    game = await request(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:game.revision})});
    if (path === '/api/new' || prior !== game.view.phase) tab = defaultTab(game.view.phase);
    const finished = game.events?.find(e=>e.type==='battle-finished');
    if (finished) notify(eventText(finished,combatNames(game.events,game)));
    else if (game.events?.some(e=>e.type==='recovery')) notify('회복 지점에서 생존 동료 전원이 완치되었습니다.');
    render();
    return true;
  } catch (e) {
    if (e.status === 409) {
      try {game = await request('/api/state'); tab = defaultTab(game.view.phase); render();} catch { /* Keep the last visible board. */ }
    }
    notify(e.message);
    return false;
  } finally {busy=false; $('stage').removeAttribute('aria-busy');}
}
const action = (cmd, args = []) => change('/api/action',{cmd,args});
function rosterArt(e) {
  const second = e.fusion ? portrait(e.fusion.bType) : '';
  return `<span class="roster-art">${portrait(e.type)}${second}${cardBadges(e.hp,null,e.maxHp)}</span>`;
}
function openUnit(e) {
  showDialog(e.name, `<div class="info-card">${rosterArt(e)}${cardEffects(e,game.catalog)}
    <p>최대 체력 ${e.maxHp} · 방어 ${e.defense}</p></div>`);
}
function drawRoster() {
  const area=$('roster');
  area.hidden = tab !== 'map';
  if (area.hidden) {area.replaceChildren();return;}
  const allies=game.view.floors.filter(Boolean);
  const cards = allies.map(e => `<button type="button" data-id="${esc(e.id)}" class="roster-card">
    ${rosterArt(e)}<span class="roster-copy"><strong>${esc(e.name)}</strong>${cardEffects(e,game.catalog)}</span></button>`);
  area.innerHTML = `<div class="roster-top"><h2>${icon('users')} 원정 동료 <small>${allies.length} / 10</small></h2>
    <button class="plain-link" data-party>편성 보기 ${icon('arrowRight',15)}</button></div><div class="roster-cards">${cards.join('')}</div>`;
  area.querySelector('[data-party]').onclick=()=>selectTab(['management','prepare'].includes(game.view.phase)?'current':'party');
  for(const el of area.querySelectorAll('[data-id]')) el.onclick=()=>openUnit(allies.find(e=>e.id===el.dataset.id));
}
function render() {
  const {view} = game;
  const fighting = ['management','prepare'].includes(view.phase);
  const tabs = [['map','map','원정 지도']];
  if (!fighting) tabs.push(['party','users','동료 편성']);
  if (view.phase !== 'map') tabs.push(['current',fighting?'swords':'flag',phaseNames[view.phase] || '현재 지점']);
  $('navigation').innerHTML = tabs.map(([key,mark,label])=>'<button type="button" data-tab="'+key+'"'+(tab===key?' class="active" aria-current="page"':'')+'>'+icon(mark,17)+label+'</button>').join('');
  $('navigation').querySelectorAll('button').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
  $('tools').innerHTML='<span class="wallet" title="보유 재화" aria-label="보유 재화 '+view.coins+'">'+icon('coins',18)+view.coins+'</span><button id="journal" aria-label="원정 기록" title="원정 기록">'+icon('book',17)+'</button><button id="settings" aria-label="원정 관리" title="원정 관리">'+icon('settings',17)+'</button>';
  $('journal').onclick=openJournal; $('settings').onclick=settings;
  const ctx={...game,tab,action,request,notify,newGame,showDialog};
  const container=document.createElement('div');
  $('stage').replaceChildren(container);
  if(tab==='party' || (tab==='current' && fighting)) renderBattle(container,ctx);
  else renderCampaign(container,ctx);
  if (tab==='current' || (tab==='map' && view.phase==='map')) {
    const header = tab==='current' && view.phase==='prepare' && container.querySelector('.bt-head');
    const playerAction = ctx.lastBattleEvents?.some(e=>['drop','quick-cost','exit-placed'].includes(e.type));
    if (header && playerAction) {
      header.insertAdjacentHTML('afterend',renderLastBattle(ctx,true));
    } else {
      const stagePosition = ['reward','place','won','lost'].includes(view.phase) ? 'beforebegin' : 'afterend';
      container.insertAdjacentHTML(stagePosition,renderLastBattle(ctx));
    }
  }
  drawRoster();
}
async function load() {
  try { game=await request('/api/state');tab=defaultTab(game.view.phase);render(); }
  catch (e) {
    $('stage').innerHTML='<p>원정을 열지 못했습니다. '+esc(e.message)+'</p><button class="dialog-secondary">다시 열기</button>';
    $('stage').querySelector('button').onclick=load;
  }
}
load();
