import { portrait, esc, icon, enemyName, patternName, cardBadges, cardEffects } from './ui.js';
import { combatRanges, renderPreviewFeedback } from './combat-feedback.js';
import { enableTouchDice } from './touch-dice.js';

const positions = Array.from({length: 10}, (_, i) => i + 1);
const tokenNames = { quick: '속공', poison: '독', exhaustion: '탈진', rage: '분노' };
const roles = { attack: '공격', guard: '보호', support: '지원' };
const shortEffects = {
  paladin: '피해 대신 받기', holyPriest: '이웃 방어', saint: '도착 시 이웃 회복',
  squire: '도착 효과 복사', choir: '도착·반응 공격', crusader: '강타·자신 탈진',
  warPriest: '분노·도착 공격', cardinal: '이웃 연결·공격', sprayer: '통과 시 가스',
  gourmet: '독 섭취·공격', toxicHealer: '속공 독·회복',
};
const rearrangePhases = ['management', 'map', 'shop', 'fusion', 'upgrade'];
let previousField = null;
let resumeChoice = null;
const twoDigits = x => String(x).padStart(2, '0');
const hp = e => `${e.hp}/${e.maxHp}`;
const directions = {left: '← 왼쪽', right: '오른쪽 →'};
const forecastAssumption = '표시된 배치를 유지한다고 가정합니다. 이후 차례의 비활동 피해는 예고에서 제외됩니다.';
const bridgeText = (bridge, nameFor) => bridge.map(e => `${twoDigits(e.x)}번 ${e.id ? nameFor(e.id) : '빈칸'}`).join(' ↔ ');

function threatFacts(intent, nameFor) {
  const hits = [], receipts = new Map();
  for (const hit of intent.hits) {
    const last = hits.at(-1);
    if (last && last.x === hit.x && last.targetId === hit.targetId) last.count++;
    else hits.push({...hit, count:1});
    for (const amount of hit.damage || []) {
      const key = `${amount.target}/${amount.redirected}`;
      const entry = receipts.get(key) || {id:amount.target, lost:0, absorbed:0, redirected:amount.redirected};
      entry.lost += amount.hpLoss;
      entry.absorbed += amount.absorbed;
      receipts.set(key, entry);
    }
  }
  const targets = hits.map(({x, targetId, count}) =>
    `${twoDigits(x)}번 ${targetId ? nameFor(targetId) : '빈칸'}${count > 1 ? ` ×${count}` : ''}`).join(' → ');
  const path = intent.path.length ? ` · 이동 ${intent.path.map(twoDigits).join('→')}` : '';
  const exit = intent.exitAt ? ` · ${twoDigits(intent.exitAt)}번 철수 접촉` : '';
  const attack = intent.interrupted ? '행동 전에 전투 종료 또는 처치 예상' : intent.deferred ? '공격 유예' :
    `${patternName(intent.pattern)} · 타격당 ${intent.power}${intent.firstHitBonus ? ` · 첫 타격 +${intent.firstHitBonus}` : ''}`;
  const actual = [...receipts.values()].map(e =>
    `${nameFor(e.id)}${e.redirected ? ' 대신 받기' : ''} · 체력 피해 ${e.lost}${e.absorbed ? ` · 방어 흡수 ${e.absorbed}` : ''}`).join(' / ');
  return {
    round: `${intent.round}라운드`,
    attack: `${twoDigits(intent.from)}번에서 ${attack + path + exit}`,
    targets: targets || '예상 타격 없음',
    actual: actual || (hits.length ? '체력 피해 0' : '')
  };
}

function threatCard(e, nameFor) {
  if (!e.intent) return '';
  const info = threatFacts(e.intent, nameFor);
  return `<button type="button" class="bt-threat" data-threat="${esc(e.id)}">
    <span class="bt-threat-title"><b>${esc(enemyName(e.type))}</b><small>${esc(info.round)}</small></span>
    <span>${esc(info.attack)}</span><strong>${esc(info.targets)}</strong>
    ${info.actual ? `<span class="bt-threat-damage">${esc(info.actual)}</span>` : ''}</button>`;
}

function forecastText(e, nameFor) {
  if (!e?.intent) return '처치 · 다음 공격 없음';
  const f = threatFacts(e.intent, nameFor);
  return [f.round, f.attack, f.targets, f.actual].filter(Boolean).join(' · ');
}

function changedThreats(preview, troops, nameFor) {
  const before = new Map(troops.map(e => [e.id, forecastText(e, nameFor)]));
  const changed = new Set();
  for (const s of preview.scenarios) {
    if (s.outcome) continue;
    for (const e of s.enemies) {
      if (before.has(e.id) && before.get(e.id) !== forecastText(e, nameFor)) changed.add(e.id);
    }
  }
  return changed;
}

function nextThreats(preview, changed, nameFor) {
  const outcomes = {win:'완승', loss:'패배', escape:'철수'};
  const variants = new Map();
  for (const s of preview.scenarios) {
    const lines = [];
    if (s.outcome) lines.push(`전투 종료 (${outcomes[s.outcome] || s.outcome}) · 다음 적 행동 없음`);
    else for (const e of s.enemies)
      if (changed.has(e.id)) lines.push(`${enemyName(e.type)} · ${forecastText(e, nameFor)}`);
    if (!lines.length) lines.push('이동 전과 같은 타격 대상과 피해');
    const key = lines.join('\n');
    if (!variants.has(key)) variants.set(key, {lines, branches:[]});
    variants.get(key).branches.push(s.conditions.map(c =>
      `${c.purpose === '비활동표적' ? '비활동' : '방어'} 대상 ${nameFor(c.targetId)}`).join(' · '));
  }
  if (!variants.size) return '';
  const rows = [...variants.values()].map(({lines, branches}) => {
    const list = `<ul>${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
    if (variants.size === 1) return list;
    const names = [...new Set(branches)].filter(Boolean).join(' / ');
    return `<details><summary>${esc(lines.join(' / '))}</summary><p>${esc(names || '가능한 결과')}</p></details>`;
  }).join('');
  return `<section class="bt-next-threats"><h5>이동 후 적 예고</h5><small>이후 배치 유지 · 비활동 피해 제외</small>${rows}</section>`;
}

function routeEvidence(preview, mover, nameFor) {
  const layouts = new Map();
  for (const scenario of preview.scenarios) {
    const visits = scenario.events.filter(e => e.type === 'visit' && e.source === mover);
    const pushes = scenario.events.filter(e => e.type === 'push' && e.source === mover);
    const arrival = visits.find(e => e.kind === 'arrival');
    const landing = arrival ? `${twoDigits(arrival.x)}번 도착` :
      visits.length ? `${twoDigits(visits.at(-1).x)}번에서 중단` : '이동 없음';
    const path = [visits[0]?.from, ...visits.map(e => e.x)].filter(Number.isInteger).map(twoDigits).join(' → ');
    const pushed = pushes.map(e => `${nameFor(e.target)} ${twoDigits(e.from)}→${twoDigits(e.to)}`).join(' · ');
    const neighbors = arrival?.neighbors?.map(nameFor).join(' · ');
    const bridge = arrival?.bridge?.length ? bridgeText(arrival.bridge, nameFor) : '';
    const key = [landing, path, pushed, neighbors, bridge].join('|');
    if (!layouts.has(key)) layouts.set(key, {visits, pushes, landing, path, pushed, neighbors, bridge});
  }
  return [...layouts.values()];
}

function routeCard(direction, preview, layouts, ctx, changed, nameFor) {
  const destinations = [...new Set(layouts.map(l => l.landing))].join(' / ');
  const facts = layouts.map(layout => `<div class="bt-route-facts">
    <p class="bt-itinerary"><small>방문 순서</small> <b>${esc(layout.path || '—')}</b></p>
    <p><small>밀림</small> ${esc(layout.pushed || '없음')}</p>
    ${layout.neighbors !== undefined ? `<p><small>도착 후 이웃</small> ${esc(layout.neighbors || '없음')}</p>` : ''}
    ${layout.bridge ? `<p><small>추기경 연결 자리</small> ${esc(layout.bridge)}</p>` : ''}
    </div>`).join('');
  return `<article class="bt-route" data-route="${direction}" tabindex="0" aria-label="${directions[direction]} 경로">
    <header><h4>${directions[direction]}</h4><strong>${esc(destinations)}</strong>
      <button type="button" data-show-route="${direction}">전장에서 보기</button></header>
    ${facts}${renderPreviewFeedback(preview, ctx)}
    ${nextThreats(preview, changed, nameFor)}</article>`;
}

function figurine(e, name, enemy, catalog, template, effectId) {
  const counter = enemy ? (e.intent?.counter ?? e.firstCounter) : null;
  const fusionArt = e.fusion ? portrait(e.fusion.bType, 'bt-second-portrait') : '';
  const mark = e.fusion ? '융합' : e.upgraded ? '강화' : '';
  const compact = enemy
    ? (e.intent?.deferred ? '공격 대기·이동' : patternName(e.intent?.pattern ?? e.pattern))
    : e.effects.map(part => shortEffects[part.type] ?? part.text).join(' / ');
  return `<span class="bt-art">${portrait(e.type, 'bt-portrait')}${fusionArt}${cardBadges(e.hp, counter, e.maxHp)}</span>
    <strong class="bt-name">${esc(name)}${mark ? ` <small>${mark}</small>` : ''}</strong>
    <span class="bt-body"${effectId ? ` id="${esc(effectId)}"` : ''}>
      ${effectId ? `<span class="bt-compact-effect">${esc(compact)}</span>` : ''}${cardEffects(e, catalog, template)}</span>`;
}

function statuses(e) {
  const tags = Object.entries(e.tokens || {}).filter(([, n]) => n > 0)
    .map(([key, n]) => `${tokenNames[key]} ${n}`);
  if (e.defense) tags.push(`방어 ${e.defense}`);
  const protection = Array.isArray(e.protection)
    ? e.protection.reduce((sum, entry) => sum + entry.amount, 0) : 0;
  if (protection) tags.push(`보호 ${protection}`);
  if (e.support?.length) tags.push(`지원 +${2 * e.support.length}`);
  return tags.join(' · ');
}

function enemyDescription(e) {
  const intent = e.intent;
  const fields = [roles[e.role], patternName(intent?.pattern || e.pattern),
    `타격당 ${intent?.power ?? e.attack}`, `첫 카운터 ${e.firstCounter} · 주기 ${e.period}`];
  if (intent) {
    fields.push(`다음 행동 ${intent.counter}라운드 후`);
    if (intent.interrupted) fields.push('예정된 행동 전에 전투 종료 또는 처치 예상');
    else if (intent.positions.length) fields.push(`예상 타격 ${intent.positions.join(' → ')}번`);
    else fields.push('현재 위치에서 타격 없음');
    if (intent.path.length) fields.push(`이동 ${intent.path.join(' → ')}번`);
  }
  if (e.role === 'support') fields.push('라운드 시작에 아군의 첫 타격 위력 +2');
  if (e.role === 'guard') fields.push('제공자가 처치되면 남은 보호 소멸');
  if (typeof e.protection === 'number' && e.protection > 0) fields.push(`시작 보호 ${e.protection}`);
  return fields.filter(Boolean).join(' · ');
}

function diceFace(value) {
  const faces = [[], [4], [0,8], [0,4,8], [0,2,6,8], [0,2,4,6,8], [0,2,3,5,6,8]];
  return `<span class="bt-pips" aria-hidden="true">${Array.from({length: 9}, (_, i) => `<i class="${faces[value].includes(i) ? 'lit' : ''}"></i>`).join('')}</span>`;
}

function animateEvents(events, previousSlots, cell) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const slots = new Map(previousSlots), cues = [];
  for (const event of events) {
    const skill = {
      arrival: event.companionType === 'saint' ? '도착 회복' : '도착 공격',
      'arrival-copy': event.companionType === 'saint' ? '회복 복사' : '공격 복사',
      reaction: event.companionType === 'holyPriest' ? '방어 반응' : '반응 공격',
      'rage-reaction': '분노 반응', 'pass-effect': '통과 발동'
    }[event.type];
    const who = event.type === 'visit' || skill ? event.source : event.target;
    const unit = slots.get(who);
    if (!unit) continue;
    if (event.type === 'visit' || event.type === 'push') {
      const x = event.type === 'visit' ? event.x : event.to;
      const text = event.type === 'push' ? '밀림' : event.kind === 'arrival' ? '도착' : '통과';
      cues.push({side:unit.side, x, text, kind:event.type});
      slots.set(who, {...unit, x});
    } else if (skill) {
      const name = unit.name?.replace(/^(검은수달|수달|스컹크) /, '') || who;
      cues.push({side:unit.side, x:event.x ?? unit.x, text:`${name}\n${skill}`, kind:'skill'});
    } else if (event.type === 'damage' && (event.hpLoss || event.absorbed)) {
      cues.push({side:unit.side, x:event.x ?? unit.x, text:event.hpLoss ? '−' + event.hpLoss : '흡수 ' + event.absorbed, kind:'hit'});
    } else if (event.type === 'heal' && event.amount) {
      cues.push({side:unit.side, x:event.x ?? unit.x, text:'+' + event.amount, kind:'heal'});
    }
  }
  cues.forEach((cue, i) => {
    const mark = document.createElement('span');
    mark.className = 'bt-fx bt-fx-' + cue.kind;
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = cue.text;
    mark.style.animationDelay = `${i * Math.min(95, 1200 / cues.length)}ms`;
    mark.addEventListener('animationend', () => mark.remove(), {once:true});
    cell(cue.x, cue.side)?.append(mark);
  });
}

export function renderBattle(root, ctx) {
  const {view} = ctx;
  const b = view.battle;
  const fighting = view.phase === 'prepare' && !!b;
  const preparing = view.phase === 'management';
  const canSwap = rearrangePhases.includes(view.phase);
  const troops = b ? b.enemies.filter(e => e.hp > 0) : preparing
    ? view.node.enemies.map((e, i) => ({ ...e, id: `E${i + 1}`, side: 'enemy', pos: [2,5,8][i], hp: e.maxHp })) : [];
  const fieldKey = [view.seed, view.act, view.node?.id || 'map'].join('/');
  const lastField = previousField?.key === fieldKey ? previousField : null;
  const slots = new Map(troops.map(e => [e.id, {x:e.pos, side:'enemy', name:enemyName(e.type)}]));
  view.floors.forEach((e, i) => { if (e) slots.set(e.id, {x:i + 1, side:'ally', name:e.name}); });
  previousField = {key:fieldKey, slots, revision:ctx.revision};
  const nameFor = id => slots.get(id)?.name || lastField?.slots.get(id)?.name || id;
  const allies = view.floors.filter(Boolean);
  const lastEvents = ctx.events || [];
  const title = fighting ? '전투 중' : preparing ? '전투 준비' : '동료 편성';
  let mode = 'inspect', source = null, previewSeq = 0, busy = false;
  let selectedSlot = null, selectedDirection = null, dragging = false;
  let chosen = null, layouts = null, exitChoice = null;
  const cache = new Map();
  const enemyAt = x => troops.find(e => e.pos === x);
  const templateFor = e => view.node?.enemies?.find(template => template.type === e.type);
  function square(x, enemy) {
    const e = enemy ? enemyAt(x) : view.floors[x - 1];
    const name = e && (enemy ? enemyName(e.type) : e.name);
    const gas = b?.gas[enemy ? 1 : 0][x - 1] || 0;
    const exit = !enemy && b?.exit === x;
    const tags = e ? statuses(e) : '';
    const detail = e ? enemy ? enemyDescription(e) : e.effects.map(p => p.text).join(' / ') : '빈 칸';
    return `<button type="button" class="bt-cell ${e ? 'filled' : 'empty'} ${enemy ? 'enemy' : 'ally'}" data-side="${enemy ? 'enemy' : 'ally'}" data-x="${x}" style="--x:${x}" ${e ? `data-entity="${esc(e.id)}"` : ''}
      aria-label="${enemy ? '적' : '동료'} ${x}번 ${esc(name || '빈 칸')}${e ? ' · 체력 ' + hp(e) : ''}" ${e ? `aria-describedby="bt-effect-${esc(e.id)}"` : ''} title="${esc(detail)}">
      ${e ? figurine(e, name, enemy, ctx.catalog, enemy ? templateFor(e) : null, `bt-effect-${e.id}`) : '<span class="bt-blank" aria-hidden="true">·</span>'}
      ${tags ? `<small class="bt-tags">${esc(tags)}</small>` : ''}
      ${gas || exit ? `<small class="bt-tile-note">${[gas ? '가스 ' + gas : '', exit ? '철수' : ''].filter(Boolean).join(' · ')}</small>` : ''}
      <span class="bt-path-mark" aria-hidden="true"></span><span class="bt-risk-mark" aria-hidden="true"></span></button>`;
  }
  const rounds = fighting ? `<div class="bt-round"><span>라운드 <b>${twoDigits(b.round)}</b></span><i></i><span>차례 <b>${b.turn} / 3</b></span></div>`
    : `<div class="bt-round"><span>생존 동료 <b>${allies.length} / 10</b></span></div>`;
  const quick = view.quickActions || [];
  root.innerHTML = `<section class="bt-panel" aria-label="${title}">
    <header class="bt-head"><div><h2>${title}</h2>${rounds}</div>
      <div class="bt-tools">
        ${fighting && b.exit === null ? `<button type="button" data-op="exit" aria-pressed="false"${view.node.kind === 'boss' ? ' title="보스전에서 철수하면 원정 패배입니다."' : ''}>철수 지점 설치</button>` : ''}
        ${fighting && b.exit !== null ? `<span>철수 ${b.exit}번</span>` : ''}
        ${quick.length ? `<details class="bt-quick"><summary>속공 · ${quick.length}</summary><div>${quick.map((a, i) => `<button type="button" data-quick="${i}">${esc(nameFor(a.id))} ${a.part} → ${esc(nameFor(a.targetId))}<small>독 +${a.poison} · 체력 +${a.heal}</small></button>`).join('')}</div></details>` : ''}
        ${canSwap ? '<button type="button" data-op="expand" hidden>카드 확대</button>' : ''}
        <button type="button" data-op="cancel" hidden>선택 취소</button>
      </div>
      ${fighting ? `<div class="bt-roll"><span><b>이동 주사위</b><small>동료에게 끌어 놓기</small></span><div class="bt-dice" role="group" aria-label="공개된 이동 주사위 세 쌍">
        ${b.dice.map((value, i) => `<div class="bt-die-slot" role="group" aria-label="${i + 1}번 주사위, 눈 ${value}">${Object.keys(directions).map(d =>
          `<button type="button" class="bt-die" draggable="true" data-slot="${i + 1}" data-direction="${d}" aria-label="${i + 1}번 주사위, 눈 ${value}, ${d === 'left' ? '왼쪽' : '오른쪽'} 이동" aria-pressed="false">${diceFace(value)}<span class="bt-die-arrow" aria-hidden="true">${d === 'left' ? '←' : '→'}</span></button>`).join('')}<small>${i + 1}번</small></div>`).join('')}
      </div></div>`
      : preparing ? '<button type="button" class="bt-main" data-op="start">전투 시작 →</button>' : ''}</header>
    ${fighting ? `<section class="bt-intents" aria-label="적 공격 예고">
      <div class="bt-section-label">${icon('swords',17)}<h3>적 공격 예고</h3><small>이동 전 현재 배치 기준 · 비활동 피해 제외</small></div>
      <div class="bt-threat-list">${troops.map(e => threatCard(e, nameFor)).join('')}</div>
    </section>
    <div class="bt-assignment"><p class="bt-instruction" role="status"></p>
      <label>미리 볼 동료 <select data-preview-ally disabled><option value="">동료 선택</option>${allies.map(e =>
        `<option value="${esc(e.id)}">${twoDigits(slots.get(e.id).x)}번 ${esc(e.name)}</option>`).join('')}</select></label></div>` : ''}
    <div class="bt-field"><div class="bt-grid" role="group" aria-label="전장 1번부터 10번. 1번의 왼쪽은 10번, 10번의 오른쪽은 1번">
      ${positions.map(x => `<span class="bt-coord" data-x="${x}" style="--x:${x}">${twoDigits(x)}</span>`).join('')}
      <span class="bt-row-label enemy">적</span><span class="bt-row-label enemy bt-continuation" aria-hidden="true">적</span>
      ${positions.map(x => square(x, true)).join('')}
      <span class="bt-row-label ally">동료</span><span class="bt-row-label ally bt-continuation" aria-hidden="true">동료</span>
      ${positions.map(x => square(x, false)).join('')}
    </div></div>
    ${fighting ? '' : '<p class="bt-instruction" role="status"></p>'}
    <div class="bt-comparison" hidden></div>
    ${fighting ? '<div class="bt-drag-readout" aria-hidden="true" hidden></div>' : ''}
  </section>`;
  const panel = root.querySelector('.bt-panel');
  const find = selector => panel.querySelector(selector);
  const all = selector => [...panel.querySelectorAll(selector)];
  const cell = (x, side = 'ally') => find(`[data-side="${side}"][data-x="${x}"]`);
  const instructions = find('.bt-instruction');
  const comparison = find('.bt-comparison');
  const picker = find('[data-preview-ally]');
  const dragReadout = find('.bt-drag-readout');
  const dice = all('.bt-die');
  if (fighting && lastField && lastField.revision !== ctx.revision)
    animateEvents(lastEvents, lastField.slots, cell);

  function refreshMode() {
    const notes = {die: selectedSlot && `${selectedSlot}번 · 눈 ${b.dice[selectedSlot - 1]} · ${directions[selectedDirection]} · 동료를 누르면 이동`, exit: view.node?.kind === 'boss' ? '빈 동료 칸을 선택하세요. 보스전에서 철수하면 원정 패배입니다.' : '철수 지점을 설치할 빈 동료 칸을 선택하세요.',
      swap: '맞바꿀 동료 또는 빈 칸을 선택하세요.', inspect: canSwap ? '동료를 선택한 뒤 목적지를 눌러 무료로 재배치하세요.' : fighting ? '방향 주사위를 동료에게 놓거나 차례로 누르세요.' : '카드를 선택해 체력과 기술을 확인하세요.'};
    instructions.textContent = notes[mode];
    find('[data-op="cancel"]').hidden = mode === 'inspect';
    find('[data-op="exit"]')?.setAttribute('aria-pressed', String(mode === 'exit'));
    if (canSwap) find('[data-op="expand"]').hidden = mode !== 'swap';
    for (const die of dice) die.setAttribute('aria-pressed', String(Number(die.dataset.slot) === selectedSlot && die.dataset.direction === selectedDirection));
    if (picker) { picker.disabled = mode !== 'die'; picker.value = chosen?.id || ''; }
    panel.dataset.mode = mode;
    all('.bt-cell.ally').forEach(el => {
      const x = Number(el.dataset.x), occupied = !!view.floors[x - 1];
      el.classList.toggle('bt-eligible', (mode === 'die' && occupied) || (mode === 'exit' && !occupied) || (mode === 'swap' && x !== source));
      el.classList.toggle('bt-source', (mode === 'swap' && x === source) || (mode === 'die' && !!chosen && chosen.id === el.dataset.entity));
    });
  }

  function openCard(entity, enemy) {
    const {x} = slots.get(entity.id);
    const name = enemy ? enemyName(entity.type) : entity.name;
    const card = figurine(entity, name, enemy, ctx.catalog, enemy ? templateFor(entity) : null);
    const meta = [`체력 ${hp(entity)}`, statuses(entity), enemy ? enemyDescription(entity) : adjacencyText(entity),
      enemy && fighting ? forecastAssumption : ''].filter(Boolean);
    ctx.showDialog(`${enemy ? '적' : '동료'} ${twoDigits(x)}번`,
      `<div class="bt-card-view">${card}<p class="bt-card-meta">${esc(meta.join(' · '))}</p></div>`);
  }

  async function command(cmd, args = [], keyboard = false) {
    if (busy || !panel.isConnected) return;
    busy = true;
    panel.setAttribute('aria-busy', 'true');
    try {
      const updated = await ctx.action(cmd, args);
      if (updated && cmd === 'move') {
        const header = document.querySelector('.bt-head');
        header?.scrollIntoView({block:'nearest'});
        if (keyboard) header?.querySelector('.bt-die')?.focus({preventScroll:true});
      }
    }
    catch (error) { ctx.notify?.(error.message || '명령을 실행할 수 없습니다.'); }
    finally { busy = false; panel.removeAttribute('aria-busy'); if (panel.isConnected) resumeChoice = null; }
  }

  function resetMarks() {
    all('.bt-cell').forEach(el => {
      el.classList.remove('bt-path', 'bt-landing', 'bt-danger', 'bt-neighbor', 'bt-facing');
      el.querySelector('.bt-path-mark').textContent = '';
      el.querySelector('.bt-risk-mark').textContent = '';
    });
  }

  function bridgeAt(entity) {
    const x = slots.get(entity.id).x;
    if (x < 3 || x > 8 || !entity.effects?.some(e => e.type === 'cardinal')) return [];
    return [x - 2, x + 2].map(tile => ({x:tile, id:view.floors[tile - 1]?.id}));
  }

  function adjacencyText(entity) {
    if (!entity.neighbors) return '';
    const nearby = entity.neighbors.map(id => `${twoDigits(slots.get(id).x)}번 ${nameFor(id)}`);
    const x = slots.get(entity.id).x;
    const facing = enemyAt(x);
    const bridge = bridgeAt(entity);
    return `인접 동료 ${nearby.join(' · ') || '없음'} / 맞은편 ${twoDigits(x)}번 ${facing ? nameFor(facing.id) : '빈칸'}` +
      (bridge.length ? ` / 추기경 연결 자리 ${bridgeText(bridge, nameFor)}` : '');
  }

  function inspectAlly(entity) {
    resetMarks();
    const x = slots.get(entity.id).x;
    for (const id of entity.neighbors || []) {
      const nearby = slots.get(id).x;
      const neighbor = cell(nearby);
      neighbor.classList.add('bt-neighbor');
      neighbor.querySelector('.bt-risk-mark').textContent = Math.abs(x - nearby) === 1 ? '인접' : '추기경 연결';
    }
    for (const endpoint of bridgeAt(entity)) {
      const target = cell(endpoint.x);
      target.classList.add('bt-neighbor');
      target.querySelector('.bt-risk-mark').textContent = '연결 자리';
    }
    const front = cell(x, 'enemy');
    front.classList.add('bt-facing');
    front.querySelector('.bt-risk-mark').textContent = '맞은편';
  }

  function markThreat(entity) {
    resetMarks();
    const tiles = entity.intent?.positions || [];
    for (const x of new Set(tiles)) {
      const dest = cell(x);
      dest.classList.add('bt-danger');
      dest.querySelector('.bt-risk-mark').textContent = `타격 ×${tiles.filter(tile => tile === x).length}`;
    }
  }

  function markRoute() {
    if (!layouts || !chosen) return;
    resetMarks();
    const options = layouts;
    if (!options.length) return;
    const commonSteps = options[0].visits.filter((step, i) =>
      options.every(o => o.visits[i]?.x === step.x && o.visits[i].kind === step.kind));
    const arrow = selectedDirection === 'left' ? '←' : '→';
    commonSteps.forEach((step, index) => {
      const destination = cell(step.x);
      const landing = step.kind === 'arrival';
      destination.classList.add(landing ? 'bt-landing' : 'bt-path');
      destination.querySelector('.bt-path-mark').textContent = `${arrow}${index + 1}${landing ? ' 도착' : ''}`;
    });
    for (const push of options[0].pushes) {
      if (!options.every(o => o.pushes.some(p => p.target === push.target && p.from === push.from && p.to === push.to))) continue;
      cell(push.from).querySelector('.bt-risk-mark').textContent = `${twoDigits(push.from)}→${twoDigits(push.to)} 밀림`;
    }
  }

  function clearPreview() {
    chosen = null; layouts = null; previewSeq++;
    comparison.hidden = true;
    comparison.replaceChildren();
    if (dragReadout) dragReadout.hidden = true;
    resetMarks(); refreshMode();
  }

  function clear() {
    mode = 'inspect'; source = null; selectedSlot = null; selectedDirection = null; dragging = false;
    exitChoice = null; clearPreview();
  }

  function showSummary(text) {
    if (dragging) {
      dragReadout.textContent = text;
      dragReadout.hidden = false;
    } else instructions.textContent = text;
  }

  async function previewAlly(entity, reveal = false) {
    if (chosen?.id === entity.id) {
      markRoute();
      if (reveal) comparison.scrollIntoView({block:'nearest'});
      return;
    }
    const seq = ++previewSeq;
    chosen = entity; layouts = null;
    const slot = selectedSlot, direction = selectedDirection;
    const key = `${entity.id}:${slot}:${direction}`;
    inspectAlly(entity); refreshMode();
    if (dragging) showSummary(`${entity.name} · ${directions[direction]} · 경로 계산 중`);
    comparison.hidden = false;
    comparison.innerHTML = '<p class="bt-loading" role="status">경로와 효과를 계산하고 있습니다…</p>';
    try {
      if (!cache.has(key)) cache.set(key, ctx.request(`/api/preview?id=${encodeURIComponent(entity.id)}&slot=${slot}&direction=${direction}`));
      const data = await cache.get(key);
      if (seq !== previewSeq || !panel.isConnected) return;
      if (data.revision !== ctx.revision) {
        showSummary('다른 탭에서 전투가 진행되었습니다. 현재 전장을 다시 불러오세요.');
        comparison.innerHTML = '<p class="bt-loading" role="status">다른 탭에서 전투가 진행되었습니다. <button type="button" data-op="reload">현재 전장 불러오기</button></p>';
        return;
      }
      layouts = routeEvidence(data, entity.id, nameFor);
      const changed = changedThreats(data, troops, nameFor);
      comparison.innerHTML = `<h3>${icon('move',17)} 이동 예고 <small>${esc(entity.name)} · ${twoDigits(slots.get(entity.id).x)}번 출발 · ${slot}번 주사위 · 눈 ${data.die}</small></h3>${routeCard(direction, data, layouts, ctx, changed, nameFor)}`;
      markRoute();
      if (data.scenarios.length) {
        const ranges = combatRanges(data.scenarios);
        const landing = [...new Set(layouts.map(option => option.landing))].join(' / ');
        showSummary(`${entity.name} · ${directions[direction]} · ${landing} · 적 체력 피해 ${ranges.dealt} · 실제 회복 ${ranges.healed}${data.complete === false ? ' (계산된 분기)' : ''}`);
      } else showSummary('가능한 이동 결과를 계산할 수 없습니다.');
      if (reveal) comparison.scrollIntoView({block:'start'});
    } catch (error) {
      cache.delete(key);
      if (seq !== previewSeq || !panel.isConnected) return;
      showSummary('이동 예고를 불러오지 못했습니다.');
      comparison.innerHTML = `<p class="bt-loading" role="alert">${esc(error.message || '경로를 불러오지 못했습니다.')} <button type="button" data-op="retry">다시 계산</button></p>`;
    }
  }

  function chooseDie(slot, direction, keepAlly = true) {
    const ally = keepAlly && chosen;
    clear();
    selectedSlot = slot; selectedDirection = direction; mode = 'die'; refreshMode();
    if (ally) previewAlly(ally);
  }
  function rememberSelection() {
    return selectedSlot && {id:chosen?.id, slot:selectedSlot, direction:selectedDirection, fieldKey, revision:ctx.revision, round:b.round, turn:b.turn};
  }
  function move(id, keyboard = false) {
    if (busy || !id || mode !== 'die') return;
    const args = [id, selectedSlot, selectedDirection];
    clear();
    command('move', args, keyboard);
  }

  panel.addEventListener('click', event => {
    if (busy) return;
    const target = event.target.closest('button');
    if (!target) {
      const route = event.target.closest('.bt-route');
      if (route) markRoute();
      return;
    }
    if (target.matches('.bt-die')) {
      const slot = Number(target.dataset.slot);
      const direction = target.dataset.direction;
      if (slot === selectedSlot && direction === selectedDirection) clear(); else chooseDie(slot, direction);
      return;
    }
    if (target.dataset.showRoute) {
      markRoute();
      find('.bt-field').scrollIntoView({block:'center'});
      return;
    }
    if (target.dataset.threat) {
      const enemy = troops.find(e => e.id === target.dataset.threat);
      markThreat(enemy);
      openCard(enemy, true);
      return;
    }
    if (target.dataset.quick !== undefined) {
      const a = quick[Number(target.dataset.quick)];
      resumeChoice = rememberSelection();
      command('active', [a.id, a.part, a.targetId]); return;
    }
    switch (target.dataset.op) {
      case 'start': command('start'); return;
      case 'cancel': clear(); return;
      case 'reload': window.location.reload(); return;
      case 'retry': {
        const ally = chosen; clearPreview();
        if (ally) previewAlly(ally, true);
        return;
      }
      case 'exit': {
        const next = mode !== 'exit';
        const candidate = rememberSelection();
        clear();
        if (next) { exitChoice = candidate; mode = 'exit'; refreshMode(); }
        return;
      }
      case 'expand': if (source) openCard(view.floors[source - 1], false); return;
    }
    if (!target.matches('.bt-cell')) return;
    const x = Number(target.dataset.x), ally = target.dataset.side === 'ally', e = ally ? view.floors[x - 1] : enemyAt(x);
    if (mode === 'exit') {
      if (ally && !e) { resumeChoice = exitChoice; command('exit', [x]); }
      return;
    }
    if (mode === 'die' && ally) { if (e) move(e.id, event.detail === 0); return; }
    if (mode === 'swap' && ally) {
      if (source === x) { clear(); return; }
      command('swap', [source, x]); return;
    }
    if (!e) return;
    if (canSwap && ally) { source = x; mode = 'swap'; refreshMode(); }
    else openCard(e, !ally);
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      const die = find('.bt-die[aria-pressed="true"]');
      clear(); die?.focus();
    }
  });
  for (const type of ['pointerover', 'focusin']) {
    panel.addEventListener(type, event => {
      if (busy || dragging || mode === 'exit') return;
      const target = event.target.closest('.bt-route, [data-threat], .bt-cell.filled');
      if (!target || target.contains(event.relatedTarget)) return;
      if (target.dataset.route) { markRoute(); return; }
      const enemy = troops.find(e => e.id === (target.dataset.threat || target.dataset.entity));
      if (enemy && fighting) { markThreat(enemy); return; }
      const ally = allies.find(e => e.id === target.dataset.entity);
      if (ally && mode === 'die' && event.pointerType !== 'touch') previewAlly(ally);
      else if (ally && !chosen) inspectAlly(ally);
    });
  }
  if (fighting) {
    picker.addEventListener('change', () => {
      const ally = allies.find(e => e.id === picker.value);
      if (ally) previewAlly(ally, true); else clearPreview();
    });
    function start(die) {
      if (busy || !panel.isConnected) return false;
      chooseDie(Number(die.dataset.slot), die.dataset.direction, false);
      dragging = true;
      return true;
    }
    function over(dest) {
      if (!dragging || busy) return;
      if (dest?.dataset.entity === chosen?.id) return;
      const ally = dest && view.floors[Number(dest.dataset.x) - 1];
      if (ally) previewAlly(ally); else if (chosen) clearPreview();
    }
    function drop(dest) {
      if (!dragging || busy) return;
      if (dest?.matches('.bt-cell.ally.filled')) move(dest.dataset.entity); else clear();
    }
    function cancel() { if (dragging) clear(); }
    enableTouchDice(panel, {start, over, drop, cancel});
    for (const die of dice) die.addEventListener('dragstart', event => {
      if (!start(die)) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `battle-die-${selectedSlot}-${selectedDirection}`);
    });
    panel.addEventListener('dragover', event => {
      if (!dragging) return;
      event.preventDefault();
      const dest = event.target.closest('.bt-cell.ally.filled');
      event.dataTransfer.dropEffect = dest ? 'move' : 'none';
      over(dest);
    });
    panel.addEventListener('drop', event => {
      if (!dragging) return;
      event.preventDefault();
      drop(event.target.closest('.bt-cell.ally.filled'));
    });
    for (const die of dice) die.addEventListener('dragend', cancel);
  }
  refreshMode();
  const resume = resumeChoice;
  resumeChoice = null;
  if (fighting && resume?.fieldKey === fieldKey && resume.revision + 1 === ctx.revision && resume.round === b.round && resume.turn === b.turn &&
      lastEvents.some(e => e.type === 'quick-cost' || e.type === 'exit-placed')) {
    const ally = allies.find(e => e.id === resume.id);
    chooseDie(resume.slot, resume.direction);
    if (ally) previewAlly(ally);
  }
}
