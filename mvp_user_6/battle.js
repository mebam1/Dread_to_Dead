import { portrait, esc, enemyName, patternName, cardBadges, cardEffects } from './ui.js';

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
const twoDigits = x => String(x).padStart(2, '0');
const hp = e => `${e.hp}/${e.maxHp}`;

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
    fields.push(`다음 공격 ${intent.counter}라운드 후`);
    if (intent.positions.length) fields.push(`예상 타격 ${intent.positions.join(' → ')}번`);
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
    const who = event.type === 'visit' ? event.source : event.target;
    const unit = slots.get(who);
    if (!unit) continue;
    if (event.type === 'visit' || event.type === 'push') {
      const x = event.type === 'visit' ? event.x : event.to;
      const text = event.type === 'push' ? '밀림' : event.kind === 'arrival' ? '도착' : '통과';
      cues.push({side:unit.side, x, text, kind:event.type});
      slots.set(who, {side:unit.side, x});
    } else if (event.type === 'damage' && (event.hpLoss || event.absorbed)) {
      cues.push({side:unit.side, x:unit.x, text:event.hpLoss ? '−' + event.hpLoss : '방어', kind:'hit'});
    } else if (event.type === 'heal' && event.amount) {
      cues.push({side:unit.side, x:unit.x, text:'+' + event.amount, kind:'heal'});
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
  let selectedSlot = null, dragSlot = null;
  let currentInfo = null;
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
      ${fighting ? `<div class="bt-roll"><span><b>이동 주사위</b><small>하나를 동료에게 끌어 놓기</small></span><div class="bt-dice" role="group" aria-label="공개된 이동 주사위 세 개">
        ${b.dice.map((value, i) => `<div class="bt-die-slot"><button type="button" class="bt-die" draggable="true" data-slot="${i + 1}" aria-label="주사위 ${value}, ${i + 1}번 주사위 선택" aria-pressed="false">${diceFace(value)}</button><small>${i + 1}번</small></div>`).join('')}
      </div></div>`
      : preparing ? '<button type="button" class="bt-main" data-op="start">전투 시작 →</button>' : ''}</header>
    <div class="bt-field"><div class="bt-grid" role="group" aria-label="전장 1번부터 10번">
      ${positions.map(x => `<span class="bt-coord" data-x="${x}" style="--x:${x}">${twoDigits(x)}</span>`).join('')}
      <span class="bt-row-label enemy">적</span><span class="bt-row-label enemy bt-continuation" aria-hidden="true">적</span>
      ${positions.map(x => square(x, true)).join('')}
      <span class="bt-row-label ally">동료</span><span class="bt-row-label ally bt-continuation" aria-hidden="true">동료</span>
      ${positions.map(x => square(x, false)).join('')}
    </div></div>
    <span class="bt-instruction bt-sr-only" role="status"></span>
  </section>`;
  const panel = root.querySelector('.bt-panel');
  const find = selector => panel.querySelector(selector);
  const all = selector => [...panel.querySelectorAll(selector)];
  const cell = (x, side = 'ally') => find(`[data-side="${side}"][data-x="${x}"]`);
  const instructions = find('.bt-instruction');
  const dice = all('.bt-die');
  const dieLabel = slot => `${slot}번 주사위 · 눈 ${b.dice[slot - 1]}`;
  if (fighting && lastField && lastField.revision !== ctx.revision)
    animateEvents(lastEvents, lastField.slots, cell);

  function refreshMode() {
    const notes = {die: selectedSlot && `${dieLabel(selectedSlot)} · 이동할 동료를 누르세요.`, exit: view.node?.kind === 'boss' ? '빈 동료 칸을 선택하세요. 보스전에서 철수하면 원정 패배입니다.' : '철수 지점을 설치할 빈 동료 칸을 선택하세요.',
      swap: '맞바꿀 동료 또는 빈 칸을 선택하세요.', inspect: canSwap ? '동료를 선택한 뒤 목적지를 눌러 무료로 재배치하세요.' : fighting ? '주사위 하나를 고른 뒤 이동할 동료를 선택하세요.' : '카드를 선택해 체력과 기술을 확인하세요.'};
    instructions.textContent = notes[mode];
    find('[data-op="cancel"]').hidden = mode === 'inspect';
    find('[data-op="exit"]')?.setAttribute('aria-pressed', String(mode === 'exit'));
    if (canSwap) find('[data-op="expand"]').hidden = mode !== 'swap';
    for (const die of dice) die.setAttribute('aria-pressed', String(Number(die.dataset.slot) === selectedSlot));
    panel.dataset.mode = mode;
    all('.bt-cell.ally').forEach(el => {
      const x = Number(el.dataset.x), occupied = !!view.floors[x - 1];
      el.classList.toggle('bt-eligible', (mode === 'die' && occupied) || (mode === 'exit' && !occupied) || (mode === 'swap' && x !== source));
      el.classList.toggle('bt-source', mode === 'swap' && x === source);
    });
  }

  function openCard(entity, enemy) {
    const {x} = slots.get(entity.id);
    const name = enemy ? enemyName(entity.type) : entity.name;
    const card = figurine(entity, name, enemy, ctx.catalog, enemy ? templateFor(entity) : null);
    const meta = [`체력 ${hp(entity)}`, statuses(entity), enemy ? enemyDescription(entity) : ''].filter(Boolean);
    ctx.showDialog(`${enemy ? '적' : '동료'} ${twoDigits(x)}번`,
      `<div class="bt-card-view">${card}<p class="bt-card-meta">${esc(meta.join(' · '))}</p></div>`);
  }

  async function command(cmd, args = []) {
    if (busy || !panel.isConnected) return;
    busy = true;
    panel.setAttribute('aria-busy', 'true');
    try { await ctx.action(cmd, args); }
    catch (error) { ctx.notify?.(error.message || '명령을 실행할 수 없습니다.'); }
    finally { busy = false; panel.removeAttribute('aria-busy'); }
  }

  function resetMarks() {
    all('.bt-cell').forEach(e => {
      e.classList.remove('bt-path', 'bt-landing', 'bt-previewed', 'bt-danger');
      e.querySelector('.bt-path-mark').textContent = '';
      e.querySelector('.bt-risk-mark').textContent = '';
    });
  }
  function clear() {
    mode = 'inspect'; source = null; selectedSlot = null; dragSlot = null; currentInfo = null; previewSeq++;
    resetMarks(); refreshMode();
  }

  async function inspect(el) {
    const x = Number(el.dataset.x), enemy = el.dataset.side === 'enemy';
    const e = enemy ? enemyAt(x) : view.floors[x - 1];
    if (!fighting || !e || busy || mode === 'exit' || mode === 'swap') return;
    if (currentInfo === e.id) return;
    currentInfo = e.id;
    const seq = ++previewSeq;
    resetMarks();
    if (enemy) {
      const tiles = e.intent?.positions || [];
      for (const x of new Set(tiles)) {
        const mark = cell(x);
        mark.classList.add('bt-danger');
        mark.querySelector('.bt-risk-mark').textContent = `피격 ×${tiles.filter(tile => tile === x).length}`;
      }
      return;
    }
    if (!selectedSlot) return;
    el.classList.add('bt-previewed');
    const slot = selectedSlot;
    const key = `${e.id}:${slot}`;
    try {
      if (!cache.has(key)) cache.set(key, ctx.request(`/api/preview?id=${encodeURIComponent(e.id)}&slot=${slot}`));
      const data = await cache.get(key);
      if (seq !== previewSeq || !panel.isConnected) return;
      const p = data.preview || data;
      const path = p.scenarios[0]?.events.filter(event => event.type === 'visit' && event.source === e.id) || [];
      path.forEach((event, i) => {
        const dest = cell(event.x);
        dest.classList.add(event.kind === 'arrival' ? 'bt-landing' : 'bt-path');
        dest.querySelector('.bt-path-mark').textContent = event.kind === 'arrival' ? '도착' : String(i + 1);
      });
      const landing = path.at(-1);
      if (landing) instructions.textContent = `${dieLabel(slot)} · ${e.name} · ${landing.x}번 도착`;
    } catch (error) {
      cache.delete(key);
      if (seq !== previewSeq || !panel.isConnected) return;
      currentInfo = null;
      ctx.notify(error.message || '이동 경로를 불러오지 못했습니다.');
    }
  }
  function setMode(next) { clear(); mode = next; refreshMode(); }
  function chooseDie(slot) {
    const candidate = currentInfo;
    clear();
    selectedSlot = slot; mode = 'die'; refreshMode();
    const ally = allies.find(e => e.id === candidate);
    if (ally) inspect(cell(slots.get(ally.id).x));
  }
  panel.addEventListener('click', event => {
    if (busy) return;
    const target = event.target.closest('button');
    if (!target) return;
    if (target.matches('.bt-die')) {
      const slot = Number(target.dataset.slot);
      if (slot === selectedSlot) clear(); else chooseDie(slot);
      return;
    }
    if (target.dataset.quick !== undefined) {
      const a = quick[Number(target.dataset.quick)]; command('active', [a.id, a.part, a.targetId]); return;
    }
    switch (target.dataset.op) {
      case 'start': command('start'); return;
      case 'cancel': clear(); return;
      case 'exit': setMode(mode === 'exit' ? 'inspect' : 'exit'); return;
      case 'expand': if (source) openCard(view.floors[source - 1], false); return;
    }
    if (!target.matches('.bt-cell')) return;
    const x = Number(target.dataset.x), ally = target.dataset.side === 'ally', e = ally ? view.floors[x - 1] : enemyAt(x);
    if (mode === 'exit') { if (ally && !e) command('exit', [x]); return; }
    if (mode === 'die') { if (ally && e) command('move', [e.id, selectedSlot]); return; }
    if (mode === 'swap' && ally) {
      if (source === x) { clear(); return; }
      command('swap', [source, x]); return;
    }
    if (!e) return;
    if (canSwap && ally) { source = x; mode = 'swap'; refreshMode(); }
    else openCard(e, !ally);
  });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); clear(); } });
  for (const type of ['pointerover', 'focusin']) {
    panel.addEventListener(type, event => {
      const target = event.target.closest('.bt-cell.filled');
      if (target && !target.contains(event.relatedTarget)) inspect(target);
    });
  }
  if (fighting) {
    for (const die of dice) die.addEventListener('dragstart', event => {
      if (busy) { event.preventDefault(); return; }
      chooseDie(Number(die.dataset.slot)); dragSlot = selectedSlot;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `battle-die-${dragSlot}`);
    });
    panel.addEventListener('dragover', event => {
      if (!dragSlot) return;
      event.preventDefault();
      const dest = event.target.closest('.bt-cell.ally.filled');
      event.dataTransfer.dropEffect = dest ? 'move' : 'none';
      if (dest) inspect(dest);
    });
    panel.addEventListener('drop', event => {
      if (!dragSlot) return;
      const slot = dragSlot;
      event.preventDefault(); dragSlot = null;
      const dest = event.target.closest('.bt-cell.ally.filled');
      if (dest) command('move', [dest.dataset.entity, slot]);
      else clear();
    });
    for (const die of dice) die.addEventListener('dragend', () => { dragSlot = null; if (!busy) clear(); });
  }
  refreshMode();
}
