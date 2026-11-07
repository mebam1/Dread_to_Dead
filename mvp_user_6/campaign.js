import { portrait, esc, enemyName, icon, nodeName, cardBadges, cardEffects } from './ui.js';

const regions = ['', '안개숲', '잿빛 고개', '검은 능선'];
const marks = { normal:'swords', elite:'skull', boss:'crown', recovery:'fire', shop:'shop', upgrade:'upgrade', fusion:'fusion' };
const lanes = { 좌:'왼쪽 길', 중:'가운데 길', 우:'오른쪽 길', 공통:'합류 지점' };
const roles = { attack:'공격', guard:'보호', support:'지원' };
const serviceText = {
  recovery:'생존한 동료 모두의 체력을 최대로 회복합니다.',
  shop:'동료 여덟 명이 기다립니다. 각 동료는 재화 6개로 영입할 수 있습니다.',
  upgrade:'동료 한 명의 원본 효과를 무료로 강화합니다. 융합 동료는 원본 A를 강화합니다.',
  fusion:'미융합 동료 둘을 한 자리에 합칩니다. 첫 동료의 체력과 두 동료의 기술을 계승합니다.',
};
const stepX = 121;
const firstX = 55;
const trackY = { 좌:53, 중:139, 우:225, 공통:139 };
const mapWidth = firstX * 2 + 17 * stepX;
const posX = n => firstX + (n.depth - 1) * stepX;
const pad = value => String(value).padStart(2, '0');
const safe = value => esc(String(value ?? ''));
const classForNode = n => n.completed ? 'done' : n.reachable ? 'open' : 'future';
const selectedRoute = { key:null, id:null, scroll:0 };

function commandButton(cmd, args, label, className='cm-button', disabled=false) {
  return `<button type="button" class="${className}" data-cmd="${cmd}" data-args="${safe(JSON.stringify(args))}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

function chartMarkup(view) {
  const routes = view.map;
  const byId = new Map(routes.map(n => [n.id, n]));
  const lines = routes.map(n => n.next.map(id => {
    const end = byId.get(id);
    if (!end) return '';
    return `<line x1="${posX(n)}" y1="${trackY[n.col]}" x2="${posX(end)}" y2="${trackY[end.col]}"
      data-from="${safe(n.id)}" data-to="${safe(end.id)}" class="${n.completed && end.completed ? 'walked' : ''}"/>`;
  }).join('')).join('');
  const nodes = routes.map(n => {
    const state = n.reachable ? '방문 가능' : n.completed ? '방문 완료' : '경로 확인';
    return `<button type="button" data-inspect="${safe(n.id)}" class="cm-node ${classForNode(n)} kind-${n.kind}" style="left:${posX(n)}px;top:${trackY[n.col]}px"
       aria-pressed="false" title="${n.depth}번째 지점 · ${lanes[n.col]} · ${nodeName(n.kind)}" aria-label="${n.depth}번째 지점 ${lanes[n.col]}, ${nodeName(n.kind)}, ${state}">
       <span class="cm-node-mark">${icon(marks[n.kind],20)}</span>${n.completed ? `<span class="cm-node-done">${icon('check',10)}</span>` : ''}</button>`;
  }).join('');
  const ruler = Array.from({length:18}, (_, i) => `<span class="cm-tick" style="left:${firstX + i * stepX}px">${pad(i+1)}</span>`).join('');
  return `<div class="cm-scroll" tabindex="0" aria-label="18개 지점 경로 지도. 좌우로 스크롤해 경로를 확인하세요.">
    <div class="cm-canvas" style="width:${mapWidth}px"><svg width="${mapWidth}" height="265" aria-hidden="true">${lines}</svg>${nodes}${ruler}</div></div>`;
}

function thumbnail(entity, counter=null) {
  const hp=entity.hp ?? entity.maxHp;
  return `<span class="cm-thumb">${portrait(entity.type)}${cardBadges(hp,counter,entity.maxHp ?? hp)}</span>`;
}

function enemyRows(node, ctx) {
  const live = ctx.view.node?.id === node.id ? ctx.view.battle : null;
  const enemies = live?.enemies ?? node.enemies;
  const heading = live ? '전투 중인 적 편성' : '입장 시 적 편성';
  return `<div class="cm-enemy-title"><h3>${heading}</h3><span>지점 ${pad(node.depth)} · ${lanes[node.col]}</span></div>
    <ul class="cm-enemies">${enemies.map((e,i) => {
      const counter = live ? (e.hp>0 ? e.intent.counter : null) : e.firstCounter;
      return `<li><div class="cm-enemy-face">${thumbnail(e,counter)}<div><strong>${safe(enemyName(e.type))}</strong>
        <small>${safe(roles[e.role])}형 · ${e.hp===0?'처치됨':`${e.period}R 주기`}</small></div></div>
        ${cardEffects(e,ctx.catalog,node.enemies[i])}</li>`;
    }).join('')}</ul>`;
}

function nodeDetail(view, node) {
  const current = view.node?.id === node.id && !node.completed;
  const state = node.reachable ? '이동 가능' : node.completed ? '방문 완료' : current ? '현재 지점' : '미방문';
  const passed = view.node && node.depth <= view.node.depth;
  const offRoute = view.node && node.depth === view.node.depth + 1 && !view.node.next.includes(node.id);
  const message = current ? '현재 머무르는 지점입니다.' : node.completed ? '이미 방문한 지점입니다.' :
    passed ? '다른 갈래를 선택한 지점입니다.' : offRoute ? '현재 지점에서 이어지는 길이 없습니다.' : '연결된 길을 따라 이 지점에 도달할 수 있습니다.';
  return `<div class="cm-inspector-kicker">${icon('compass',16)} 지역 정보 <span>${state}</span></div>
    <div class="cm-detail-head"><span class="cm-detail-sigil">${icon(marks[node.kind],26)}</span>
      <div><p>지점 ${pad(node.depth)} · ${lanes[node.col]}</p><h2>${nodeName(node.kind)}</h2></div></div>
    ${node.enemies.length ? `<dl class="cm-site-stats"><div><dt>상대 편성</dt><dd>${node.enemies.length}명</dd></div>
      <div><dt>처치 재화</dt><dd>적 한 명당 1개</dd></div></dl>` : `<p class="cm-service-note">${safe(serviceText[node.kind])}</p>`}
    ${node.enemies.length ? '<div class="cm-prize">완승 보상 <strong>동료 1명 선택</strong></div>' : ''}
    ${node.reachable ? commandButton('visit',[node.id],`이 지점으로 이동 ${icon('arrowRight',17)}`,'cm-button cm-visit') :
      `<div class="cm-inspect-status">${message}</div>`}`;
}

function renderMap(host, ctx) {
  const v=ctx.view, reachable=v.map.filter(n=>n.reachable);
  const preferred = reachable.find(n=>n.col==='중') ?? reachable[0] ?? v.map.find(n=>n.id===v.node?.id) ?? v.map[0];
  const key = [v.seed,v.act,v.phase,v.node?.id,v.visited.length].join('/');
  if (key!==selectedRoute.key) {
    selectedRoute.key=key;
    selectedRoute.id=preferred.id;
    selectedRoute.scroll=Math.max(0,posX(preferred)-firstX-stepX);
  }
  host.innerHTML = `<div class="cm-map-layout">
    <section class="cm-map-panel" aria-label="원정 경로">
      <header class="cm-map-head"><div><p class="cm-overline"><span class="cm-short-line"></span>제${v.act}막 · 원정 지도</p>
        <h1>${regions[v.act]}</h1></div>
        <div class="cm-map-depth"><span>탐험 진행</span><strong>${pad(v.map.filter(n=>n.completed).length)} <i>/ 18</i></strong></div></header>
      ${chartMarkup(v)}
      <footer class="cm-chart-foot"><div class="cm-legend" aria-label="지도 범례">
        ${Object.keys(marks).map(k=>`<span title="${nodeName(k)}">${icon(marks[k],13)} ${nodeName(k)}</span>`).join('')}
      </div><div class="cm-arrows"><button type="button" data-scroll="-1" aria-label="이전 경로">${icon('chevronLeft',16)}</button><button type="button" data-scroll="1" aria-label="다음 경로">${icon('chevronRight',16)}</button></div></footer>
    </section>
    <aside class="cm-inspector" aria-label="선택한 지점 정보"></aside>
    <section class="cm-encounter" aria-label="적 편성"></section></div>`;

  const scroll=host.querySelector('.cm-scroll'), details=host.querySelector('.cm-inspector');
  const scrollButtons=host.querySelectorAll('[data-scroll]');
  function updateArrows() {
    scrollButtons[0].disabled=scroll.scrollLeft<2;
    scrollButtons[1].disabled=scroll.scrollLeft>=scroll.scrollWidth-scroll.clientWidth-2;
  }
  function select(id) {
    const n=v.map.find(it=>it.id===id) ?? preferred;
    selectedRoute.id=n.id;
    for (const b of host.querySelectorAll('[data-inspect]')) b.setAttribute('aria-pressed',String(b.dataset.inspect===n.id));
    for (const l of host.querySelectorAll('.cm-canvas line')) l.classList.toggle('linked',l.dataset.from===n.id || l.dataset.to===n.id);
    details.innerHTML=nodeDetail(v,n);
    const encounter=host.querySelector('.cm-encounter');
    encounter.hidden=!n.enemies.length;
    encounter.innerHTML=n.enemies.length ? enemyRows(n,ctx) : '';
  }
  select(selectedRoute.id);
  scroll.scrollLeft=selectedRoute.scroll;
  updateArrows();
  scroll.addEventListener('scroll',()=>{ selectedRoute.scroll=scroll.scrollLeft; updateArrows(); },{passive:true});
  host.addEventListener('click',e=>{
    const choice=e.target.closest('[data-inspect]');
    if (choice) select(choice.dataset.inspect);
    const arrow=e.target.closest('[data-scroll]');
    if (arrow) scroll.scrollBy({left:Number(arrow.dataset.scroll)*Math.max(stepX,scroll.clientWidth-stepX), behavior:'smooth'});
  });
}

function pageHead(view, title, note) {
  return `<header class="cm-page-head"><p class="cm-overline"><span class="cm-short-line"></span>${regions[view.act]} · 지점 ${pad(view.node?.depth ?? 1)}</p>
    <h1>${title}</h1>${note ? `<p class="cm-subtitle">${note}</p>` : ''}</header>`;
}

function catalogCard(type, catalog) { return catalog.companions[type]; }
function allyCard(item, catalog, footer='', detail='') {
  return `<article class="cm-ally-card"><div class="cm-card-portrait">${thumbnail(item)}</div>
    <div class="cm-card-body"><h3>${safe(item.name)}</h3>${cardEffects(item,catalog)}${detail}</div>
    ${footer?`<div class="cm-card-foot">${footer}</div>`:''}</article>`;
}
function offerCard(item, ctx, isShop) {
  const canAfford=ctx.view.coins>=item.price;
  const button=isShop ? commandButton('buy',[item.slot],item.purchased?'영입 완료':`${icon('coins',15)} ${item.price} · 영입`,'cm-button',item.purchased || !canAfford)
    : commandButton('reward',[item.slot],'동료 선택');
  return allyCard(item,ctx.catalog,button);
}

function servicePage(host,ctx) {
  const v=ctx.view, phase=v.phase;
  if (phase==='shop' || phase==='reward') {
    const shop=phase==='shop';
    const title=shop?'길목 상점':'전투 보상';
    const note=shop?`보유 재화 ${v.coins}개 · 영입 비용 6개`:'함께할 동료 한 명을 선택하세요.';
    host.innerHTML=pageHead(v,title,note)+`<div class="cm-offers">${(shop?v.shop:v.rewards).map(e=>offerCard(e,ctx,shop)).join('')}</div>
      <div class="cm-actions">${commandButton(shop?'leave':'skip',[],shop?'상점 나가기':'보상 건너뛰기','cm-quiet')}</div>`;
    return;
  }
  if (phase==='place') {
    const ally=v.pending.entity, replace=v.floors.every(Boolean);
    const text=replace?'모든 칸이 차 있습니다. 교체할 동료를 고르세요. 기존 동료는 원정을 떠납니다.':'새 동료를 배치할 빈 칸을 선택하세요.';
    host.innerHTML=pageHead(v,'동료 배치',text)+`<div class="cm-new-ally"><div class="cm-enemy-face">${thumbnail(ally)}<div><small>합류한 동료</small><strong>${safe(ally.name)}</strong></div></div>
      ${cardEffects(ally,ctx.catalog)}</div>
      <div class="cm-placement">${v.floors.map((e,i)=>e ?
        `<div class="cm-place-card">${allyCard({...e,name:`${i+1}번 · ${e.name}`},ctx.catalog,
          replace?commandButton('place',[i+1],'이 동료와 교체'): '')}</div>` :
        commandButton('place',[i+1],`<strong>${pad(i+1)}</strong><span class="cm-empty">＋</span><span>빈 칸에 배치</span>`,'cm-place-slot')).join('')}</div>
      <div class="cm-actions">${commandButton('discard',[],'새 동료 포기','cm-quiet')}</div>`;
    return;
  }
  if (phase==='upgrade') {
    host.innerHTML=pageHead(v,'동료 강화','동료 한 명의 원본 A를 무료로 강화합니다. 현재 체력은 유지됩니다.')+
      `<div class="cm-offers">${v.floors.filter(Boolean).map(e=>allyCard(e,ctx.catalog,
        commandButton('upgrade',[e.id],e.upgraded?'강화 완료':'강화하기','cm-button',e.upgraded),
        e.upgraded?'':`<div class="cm-upgrade-note"><b>강화 후</b> ${safe(catalogCard(e.type,ctx.catalog).upgradeText)}</div>`)).join('')}</div>
      <div class="cm-actions">${commandButton('skip',[],'강화 건너뛰기','cm-quiet')}</div>`;
    return;
  }
  if (phase==='fusion') {
    renderFusion(host,ctx);
    return;
  }
  if (phase==='won'||phase==='lost') {
    const won=phase==='won';
    host.innerHTML=`<section class="cm-result">${icon(won?'crown':'flag',40)}${pageHead(v,won?'원정 완수':'원정 종료',won?'세 막의 보스를 모두 쓰러뜨렸습니다.':'이번 원정의 탐험 기록입니다.')}
      <dl><div><dt>완료한 지점</dt><dd>${v.visited.length} / 54</dd></div><div><dt>남은 동료</dt><dd>${v.floors.filter(Boolean).length}명</dd></div><div><dt>남은 재화</dt><dd>${v.coins}</dd></div></dl>
      <button type="button" data-new class="cm-button">새 원정 시작 ${icon('arrowRight',16)}</button></section>`;
  }
}

function renderFusion(host,ctx) {
  const v=ctx.view, candidates=v.floors.filter(e=>e&&!e.fusion);
  host.innerHTML=pageHead(v,'동료 융합','두 동료의 기술을 합칩니다. 결과는 첫 동료의 칸과 체력을 계승하며 다시 융합할 수 없습니다.')+
    (candidates.length<2?'<p class="cm-service-note">미융합 동료가 두 명 필요합니다.</p>':
    `<div class="cm-fusion"><div class="cm-fusion-inputs">${['A · 몸체','B · 기술'].map((label,i)=>`<label>${label}
      <select data-part="${i}">${candidates.map((e,j)=>`<option value="${safe(e.id)}" ${j===i?'selected':''}>${safe(e.name)} · ${v.floors.indexOf(e)+1}번 · ${e.hp}/${e.maxHp}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="cm-fusion-preview" aria-live="polite"></div></div>`)+
    `<div class="cm-actions">${commandButton('skip',[],'융합 건너뛰기','cm-quiet')}</div>`;
  if (candidates.length<2) return;
  const [first,second]=host.querySelectorAll('[data-part]'), output=host.querySelector('.cm-fusion-preview');
  let version=0;
  async function preview() {
    const a=first.value,b=second.value, seq=++version;
    if (a===b) { output.textContent='서로 다른 동료를 선택하세요.'; return; }
    output.textContent='융합 결과를 확인하는 중…';
    try {
      const result=await ctx.request(`/api/fusion?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      if (seq!==version||!output.isConnected) return;
      const [body,skill]=result.parts.map(part=>candidates.find(e=>e.id===part.id));
      const combined={...body,hp:result.hp,maxHp:result.maxHp,name:`${body.name} + ${skill.name}`,
        fusion:{bType:skill.type,bUpgraded:skill.upgraded},effects:result.parts.map(p=>({...p,text:p.effect}))};
      output.innerHTML=`<div class="cm-fusion-originals">${[body,skill].map((e,i)=>`<section class="cm-fusion-part"><h3>원본 ${i?'B':'A'}</h3>${allyCard(e,ctx.catalog)}</section>`).join('')}</div>
        <h3>융합 결과 · ${result.position}번 칸</h3>${allyCard(combined,ctx.catalog,commandButton('fuse',[a,b],'이 조합으로 융합'))}`;
    } catch (error) { if (seq===version) output.textContent=error.message; }
  }
  host.addEventListener('change',preview);
  preview();
}

export function renderCampaign(root,ctx) {
  const host=document.createElement('section');
  host.className='cm-expedition';
  root.replaceChildren(host);
  if (ctx.view.phase==='map'||ctx.tab==='map') renderMap(host,ctx);
  else servicePage(host,ctx);
  let busy=false;
  host.addEventListener('click',async e=>{
    const button=e.target.closest('button');
    if (!button || button.disabled || busy) return;
    if (button.hasAttribute('data-new')) { ctx.newGame(); return; }
    if (!button.dataset.cmd) return;
    busy=true;
    button.disabled=true;
    try { await ctx.action(button.dataset.cmd,JSON.parse(button.dataset.args)); }
    catch (error) { ctx.notify(error.message); }
    finally { busy=false; if(button.isConnected) button.disabled=false; }
  });
}
