import { art, attackForecast, esc, guestAttackText, icon, inactiveQuickCoins, token } from './ui.js';

import {mapKinds as kinds, mapRoads as roads} from './adventure-map.js';
const quietPhases = ['map', 'management', 'shop', 'event', 'recovery', 'fusion'];
export const canReorder = phase => quietPhases.includes(phase);
const sessions = new WeakMap();
const htmlArgs = args => encodeURIComponent(JSON.stringify(args));
const disabled = value => value ? ' disabled' : '';

function action(cmd, args, label, { off = false, style = 'primary' } = {}) {
  return `<button type="button" class="dec-button dec-${style}" data-act="${cmd}" data-args="${htmlArgs(args)}"${disabled(off)}>${label}</button>`;
}

function pick(key, value, selected, content, extra = '', off = false) {
  const chosen = String(value) === String(selected);
  return `<button type="button" class="dec-choice ${chosen ? 'is-picked' : ''} ${extra}" data-pick="${key}" data-value="${esc(value)}" aria-pressed="${chosen}"${disabled(off)}>${content}</button>`;
}

function select(label, key, value, options) {
  return `<label class="dec-field"><span>${esc(label)}</span><select data-field="${key}">${options.map(o =>
    `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}${disabled(o.off)}>${esc(o.label)}</option>`).join('')}</select></label>`;
}

function section(title, hint, content) {
  return `<div class="dec-heading"><h2>${esc(title)}</h2>${hint ? `<span>${esc(hint)}</span>` : ''}</div>${content}`;
}

function footer(content) { return `<div class="dec-footer">${content}</div>`; }
function endVisit() { return action('skip', [], '건너뛰기', { style: 'quiet' }); }
function note(text) { return `<p class="dec-note">${esc(text)}</p>`; }
function floorName(view, floor) { return `${floor}층 · ${view.floors[floor - 1]?.name ?? '빈층'}`; }
function hotel(view) { return view.floors.flatMap((entity, i) => entity ? [{ ...entity, floor: i + 1 }] : []); }
function entityOptions(list) { return list.map(e => ({ value: e.id, label: `${e.floor}층 · ${e.name}` })); }
function placeholder(text = '선택하세요') { return { value: '', label: text }; }
function previewArt(type, partner, abilities) {
  return '<span class="dec-preview-card">'+art(type, partner)+inactiveQuickCoins(abilities)+'</span>';
}
function compactCard(catalog, type) {
  const card = catalog.creatures[type];
  return `<div class="dec-card-line">${previewArt(type, null, card.quickAbilities)}<div><strong>${esc(card.name)}</strong><p>${esc(card.baseText)}</p></div></div>`;
}

function detailsCard(catalog, type) {
  const card = catalog.creatures[type];
  return `<dl class="dec-effects"><div><dt>기본</dt><dd>${esc(card.baseText)}</dd></div><div><dt>강화</dt><dd>${esc(card.upgradeText)}</dd></div><div><dt>내구</dt><dd>공략 한계 ${card.limit} · 최대 ${token('tokens', card.maxTokens)}</dd></div></dl>`;
}

function guestBook(node) {
  return `<ol class="dec-guests">${node.guests.map((g, i) => `<li><span class="dec-guest-no">${i + 1}</span><span><button type="button" class="roster-name" data-panel="guest" data-guest-node="${esc(node.id)}" data-guest-index="${i}" aria-haspopup="dialog">${esc(g.name)}</button><small>공포 한계 ${g.t} · ${token('heart',g.h)} · ${esc(guestAttackText(g))}</small></span></li>`).join('')}</ol>`;
}

function mapPanel({view, mapNode}, st) {
  const node = mapNode ?? view.map.find(n => n.reachable || n.current);
  if (!node) return '';
  const detail = node.guests.length
    ? `<details class="dec-disclosure" data-fold="guestOpen"${st.guestOpen ? ' open' : ''}><summary>${icon('book')} 손님 명부 · ${node.guests.length}명</summary>${guestBook(node)}</details>`
    : note({shop:'괴이 카드 여덟 장을 살펴보고 구매한다.', fusion:'두 괴이의 본 효과를 한 층에 결합한다.', recovery:'파훼 토큰 회복 또는 괴이 강화를 고른다.', event:'방문하면 이벤트가 공개된다.'}[node.kind]);
  const visit = node.reachable
    ? action('visit', [node.id], '이 경로 방문 '+icon('arrow-right'))
    : note(node.completed ? '방문 완료' : node.current ? '현재 진행 중' : '지금은 방문할 수 없는 지점입니다.');
  return section(kinds[node.kind][0], `${node.depth}번째 · ${roads[node.col]}`, detail + footer(visit));
}

function management({ view }) {
  const n = view.node;
  return section('전투 준비', kinds[n.kind][0], guestBook(n) +
    footer(action('start', [], '영업 시작 ' + icon('arrow-right'), { off: !view.floors.some(Boolean) })));
}

function reorder({ view, selectedFloor }, st) {
  const occupied = hotel(view);
  const selected = Number(selectedFloor);
  const from = Number(st.from ?? (view.floors[selected - 1] ? selected : occupied[0]?.floor));
  const to = Number(st.to ?? 0);
  const floors = view.floors.map((_, i) => ({ value: i + 1, label: floorName(view, i + 1), off: i + 1 === from }));
  return `<details class="dec-reorder" data-fold="reorder"${st.reorder ? ' open' : ''}><summary>${icon('swap')} 층 재배치</summary><div class="dec-controls">${select('출발층', 'from', from, occupied.map(e => ({ value: e.floor, label: floorName(view, e.floor) })))}${select('목적층', 'to', to, [placeholder('층 선택'), ...floors])}${action('swap', [from, to], view.floors[to - 1] ? '두 괴이 맞교환' : '빈층으로 이동', { off: !from || !to || from === to, style: 'secondary' })}</div></details>`;
}

function offers({ view, catalog }, st, shop) {
  const cards = shop ? view.shop : view.rewards.map((type, i) => ({ type, slot: i + 1 }));
  const item = cards.find(o => String(o.slot) === st.offer) ?? cards.find(o => !o.sold);
  const list = cards.map(o => {
    const card = catalog.creatures[o.type];
    const stamp = shop ? o.sold ? '품절' : `${o.price} 영혼` : '';
    return pick('offer', o.slot, item?.slot,
      `${art(o.type)}<span class="offer-caption"><strong>${esc(card.name)}</strong>${stamp ? `<small>${stamp}</small>` : ''}</span>${inactiveQuickCoins(card.quickAbilities)}`,
      'dec-offer', o.sold);
  }).join('');
  const detail = item ? detailsCard(catalog, item.type) : '';
  const confirm = shop ? action('buy', [item?.slot], item ? (view.souls < item.price ? '영혼 부족' : item.price + ' 영혼 지불 · 구매') : '모두 품절', { off: !item || item.sold || view.souls < item.price }) :
    action('reward', [item?.slot], (item ? esc(catalog.creatures[item.type].name) + ' ' : '') + '획득', { off: !item });
  return section(shop ? '괴이 상점' : '완승 보상', shop ? `보유 영혼 ${view.souls}` : '괴이 한 장 선택',
    `<div class="dec-offers${shop ? ' shop-stock' : ''}">${list}</div>${detail}${footer((shop ? action('leave', [], '상점 떠나기', { style: 'quiet' }) : '') + confirm)}`);
}

function acquisition({ view, catalog }, st) {
  const incoming = view.pending.entity;
  const full = view.floors.every(Boolean);
  const options = view.floors.flatMap((e, i) => full || !e ? [{ value: i + 1, label: floorName(view, i + 1) }] : []);
  const dest = st.dest ?? '';
  const discard = dest === 'discard';
  const existing = full && Number(dest) ? view.floors[Number(dest) - 1] : null;
  const summary = discard ? `${incoming.name}의 새 카드를 영구 폐기합니다.` : existing ?
    `${existing.name}(${existing.id})와 그 강화·융합 효과를 폐기하고 ${incoming.name}를 놓습니다.` : '';
  const choices = [...options, { value: 'discard', label: '새 괴이 폐기' }];
  return section('획득한 괴이 배치', full ? '만실 · 교체 또는 폐기' : '빈층에 배치하거나 폐기',
    compactCard(catalog, incoming.type) + `<div class="dec-chipset">${choices.map(o => pick('dest', o.value, dest, esc(o.label), 'dec-chip')).join('')}</div>` +
    (summary ? note(summary) : '') + footer(discard ? action('discard', [], '새 괴이 영구 폐기', {style:'danger'}) :
      action('place', [Number(dest)], existing ? '기존 괴이 폐기 후 교체' : '선택한 층에 배치', {off: !dest})));
}

function recovery({ view }, st) {
  const living = hotel(view);
  const hurt = living.filter(e => e.tokens < e.maxTokens);
  const basic = living.filter(e => !e.upgraded);
  const mode = st.recovery ?? (hurt.length ? 'heal' : 'upgrade');
  const first = st.healFirst ?? '';
  const second = st.healSecond ?? '';
  const target = basic.find(e => e.id === st.upgrade);
  const healOptions = entityOptions(hurt);
  const firstEntity = hurt.find(e => e.id === first);
  const secondOptions = healOptions.map(o => ({...o, off: o.value === first && firstEntity.maxTokens - firstEntity.tokens < 2}));
  const count = [first, second].filter(Boolean);
  const valid = count.length && count.every(id => {
    const e = hurt.find(x => x.id === id);
    return e && count.filter(x => x === id).length <= e.maxTokens - e.tokens;
  });
  const tabs = pick('recovery','heal',mode,'파훼 토큰 회복','dec-chip') + pick('recovery','upgrade',mode,'개체 강화','dec-chip');
  let body, commit;
  if (mode === 'heal') {
    body = hurt.length ? `<div class="dec-recovery-list">${hurt.map(e => `<span>${e.floor}층 · ${esc(e.name)} ${token('tokens',e.tokens)} / 최대 ${token('tokens',e.maxTokens)}</span>`).join('')}</div><div class="dec-controls">${select('첫 번째 토큰', 'healFirst', first, [placeholder('미배분'), ...healOptions])}${select('두 번째 토큰', 'healSecond', second, [placeholder('미배분'), ...secondOptions])}</div>` : note('모든 개체가 최대 토큰을 보유하고 있습니다.');
    commit = action('heal', count, `토큰 ${count.length}개 회복`, { off: !valid });
  } else {
    body = basic.length ? select('강화 대상', 'upgrade', st.upgrade ?? '', [placeholder('괴이 선택'), ...entityOptions(basic)]) : note('강화할 미강화 개체가 없습니다.');
    if (target) body += note(target.upgradeText);
    commit = action('upgrade', [target?.id], '강화 확정', { off: !target });
  }
  return section('회복', '무료로 한 가지 선택', `<div class="dec-chipset">${tabs}</div>${body}${footer(endVisit() + commit)}`);
}

function equipPanel({ view, catalog }, st, offered) {
  const die = catalog.dice[offered];
  const slot = Number(st.equipSlot);
  const choices = view.dice.map((type, i) => {
    const d = catalog.dice[type];
    return pick('equipSlot', i + 1, slot, `<small>${i + 1}번 자리</small><strong>${esc(d.name)}</strong><small>${d.faces.join(' · ')}</small>`, 'dec-equip');
  }).join('');
  return `<div class="dec-die-offer">${icon('dice',24)}<span><strong>${esc(die.name)}</strong><small>${die.faces.join(' · ')} · ${esc(die.effectText)}</small></span></div><div class="dec-routes">${choices}</div>` +
    footer(action('equip', [slot], '기존 주사위와 교체', { off: !slot }));
}

function eventPanel(ctx, st) {
  const { view, catalog } = ctx;
  const e = view.event;
  if (e.kind === 'luggage') return section('잊힌 투숙객의 짐', '한 가지 선택', equipPanel(ctx, st, e.die) +
    footer(endVisit() + action('cash', [], `영혼 ${e.payout} 받기`, { off: !e.payout, style: 'secondary' })));
  if (e.kind === 'room') return section('봉인된 객실', '괴이 한 장', compactCard(catalog, e.type) + detailsCard(catalog, e.type) +
    footer(endVisit() + action('deal', [], '3 영혼 지불 · 구매', { off: view.souls < 3 })));
  const living = hotel(view);
  const target = living.find(o => o.id === st.contract);
  return section('교단의 계약', `영혼 ${e.payout} 지급`, select('영구 제거할 괴이', 'contract', st.contract ?? '', [placeholder('괴이 선택'), ...entityOptions(living)]) +
    (target ? note(`${target.name}(${target.id})와 그 강화·융합 효과가 영구 제거됩니다.`) : '') +
    footer(endVisit() + action('contract', [target?.id], `괴이 제거 · 영혼 ${e.payout} 받기`, { off: !target || !e.payout || living.length < 2, style: 'danger' })));
}

function loadForecast(ctx, st, path, kind) {
  if (st.request === path) return;
  st.request = path;
  st.forecast = st.error = null;
  if (kind === 'battle') {
    st.battlePreviews ??= new Map();
    st.forecast = st.battlePreviews.get(path) ?? null;
    ctx.preview(st.forecast);
    if (st.forecast) return;
  }
  ctx.api(path).then(response => {
    if (sessions.get(ctx.root) !== st) return;
    const forecast = response.preview ?? response.fusion ?? response;
    if (kind === 'battle') st.battlePreviews.set(path, forecast);
    if (st.request !== path) return;
    st.forecast = forecast;
    if (kind === 'battle') st.ctx.preview(st.forecast);
    if (kind === 'battle') refreshBattleSummary(st);
    else drawPanel(st);
  }).catch(error => {
    if (sessions.get(ctx.root) !== st || st.request !== path) return;
    st.error = error.message || '예고를 불러올 수 없습니다.';
    if (kind === 'battle') refreshBattleSummary(st);
    else drawPanel(st);
  });
}

function fusion(ctx, st) {
  const materials = hotel(ctx.view).filter(e => !e.fusion);
  if (materials.length < 2) return section('괴이 융합', '방문당 한 쌍', note('서로 다른 미융합 개체가 두 장 필요합니다.') + footer(endVisit()));
  const a = st.body ?? '';
  const b = st.donor ?? '';
  const options = entityOptions(materials);
  const candidate = a && b && a !== b;
  if (candidate) loadForecast(ctx, st, '/api/fusion?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b), 'fusion');
  else { st.forecast = null; st.request = null; st.error = null; }
  const f = st.forecast;
  const selectors = `<div class="dec-controls">${select('본체 A', 'body', a, [placeholder('유지할 괴이'), ...options])}${select('재료 B', 'donor', b, [placeholder('함께 융합할 괴이'), ...options.map(o => ({...o, off: o.value === a}))])}<button type="button" class="dec-button dec-quiet" data-local="reverse" ${disabled(!candidate)}>${icon('swap')} 순서 바꾸기</button></div>`;
  const preview = f ? `<div class="dec-fusion-proof"><div class="dec-fusion-art">${previewArt(f.thumbnail.left, f.thumbnail.right, f.quickAbilities)}</div><div><strong>${esc(f.aName)} × ${esc(f.bName)}</strong><p>${f.aFloor}층에 융합체 배치 · ${f.freeFloor}층은 빈층</p><p>공략도 ${f.damage}/${f.stats.limit} · 현재 ${token('tokens', f.tokens)} / 최대 ${token('tokens', f.stats.maxTokens)}</p></div></div><dl class="dec-effects"><div><dt>A 본 효과</dt><dd>${esc(f.bodyEffect)}${f.upgradeEffect ? ' · 강화 ' + esc(f.upgradeEffect) : ''}</dd></div><div><dt>B 본 효과</dt><dd>${esc(f.donorEffect)}</dd></div></dl>`
    : candidate ? previewWait(st) : note('두 괴이의 본 효과를 모두 사용합니다. A의 층과 내구를 계승합니다. 확정한 융합체는 분해하거나 다시 융합할 수 없습니다.');
  return section('괴이 융합', '두 장을 한 장으로', selectors + preview + footer(endVisit() + action('fuse', [a, b], '비가역 융합 확정', {off: !f})));
}

function previewWait(st) {
  return st.error ? `<p class="dec-note" role="alert">${esc(st.error)} <button type="button" class="dec-button dec-quiet" data-local="retry">다시 불러오기</button></p>`
    : '<p class="dec-note" role="status">예고를 불러오는 중…</p>';
}

const pips = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };
function dieFace(face) {
  const nine = Array.from({length:9}, (_, i) => `<i${pips[face]?.includes(i) ? ' class="lit"' : ''}></i>`).join('');
  return `<span aria-hidden="true" class="dec-die-face">${pips[face] ? nine : `<b>${face}</b>`}</span>`;
}

function guestState({ view }) {
  const b = view.battle;
  const pieces = ['anxiety', 'greed', 'prophecy'].map(k => token(k, b[k])).join('');
  return `<div class="dec-guest-state"><button type="button" class="dec-guest-name guest-inspect-name" data-panel="guest" aria-haspopup="dialog">${icon('key', 19)}<strong>${esc(b.guest.name)}</strong></button><span>손님 ${b.index + 1}/${b.guests.length} · ${b.turn}턴 · ${b.position ? b.position + '층' : '입장 전'}</span><span>공포 ${b.fear}/${b.guest.t}</span>${token('heart', b.hearts)}<span class="dec-pieces">${pieces}</span><span>비활동 ${b.idle}/${b.idleLimit}턴</span></div>`;
}

function previewSummary({ view }, st) {
  const f = st.forecast;
  if (!f) return previewWait(st);
  const arrival = f.path.at(-1);
  const hits = f.events.filter(e => e.type === 'hit');
  const details = f.events.flatMap(e => {
    if (e.type === 'hit') {
      const who = e.floor === e.receiver ? `${e.floor}층` : `${e.floor}층 → 대리 ${e.receiver}층`;
      return [`${esc(who)} · ${e.penalty ? '비활동' : '공격'} 위력 ${e.power}${e.absorbed ? ' · 방어 흡수 ' + token('defense', e.absorbed) : ''} · 공략도 +${e.actual} → ${e.damage}${e.breached ? ' · 손실 ' + token('tokens',1) : ''}${e.destroyed ? ' · 영구 파괴' : ''}`];
    }
    if (e.type === 'miss') return [`${e.floor}층 · 공격 위력 ${e.power} · 빈층 빗나감`];
    if (e.type === 'gain' && e.amount) return ['획득 ' + token(e.resource, e.amount)];
    if (e.type === 'fear') return ['공포 +' + e.amount];
    if (e.type === 'heart') return ['심장 하나 제거 · 잔여 ' + token('heart',e.remaining)];
    if (e.type === 'ambush-release') return ['잠복 해제' + (e.sealed ? ' · 봉인으로 무효' : '')];
    return [];
  });
  for (const u of f.uncertainties) {
    if (u.type === 'ambush-target') details.push('예언된 방문 표적 후보 · ' + u.floors.join(', ') + '층');
    if (u.type === 'inactivity-target') {
      for (const o of u.options) details.push(`비활동 피격 후보 ${o.floor}층 · 공략도 ${o.damage} · 잔여 ${token('tokens',o.tokens)}${o.destroyed ? ' · 파괴' : ''}`);
    }
  }
  const outcome = { win:'전투 완승', 'guest-kill':'손님 처치', escape:'출구 접촉', loss: f.reason === 'boss-escape' ? '보스 탈출 · 패배' : '전멸 · 패배' }[f.outcome];
  const loss = hits.filter(e => e.breached).length;
  const glance = outcome ?? `예상 피격 ${hits.length}회 · 손실 ${token('tokens',loss)}`;
  const path = f.path.map((n, i) => i === f.path.length - 1 ? `<strong>${n}층</strong>` : `<span>${n}</span>`).join('<i aria-hidden="true">›</i>');
  const {steps} = attackForecast(f);
  const strikes = steps.length ? steps.map(step=>'<span>'+esc(step)+'</span>').join('<i aria-hidden="true">›</i>') : '<span>없음</span>';
  return `<div class="dec-forecast"><div><span class="dec-caption">${f.slot}번 주사위 · 예상 경로</span><div class="dec-path">${path}</div></div><div class="dec-attack-order"><span class="dec-caption">${icon('target',13)} 손님 공격</span><div class="dec-path">${strikes}</div></div><div class="dec-forecast-total"><strong>${glance}</strong>${f.uncertainties.length ? '<small>무작위 표적 미확정</small>' : ''}</div></div><details class="dec-disclosure" data-fold="forecastOpen"${st.forecastOpen ? ' open' : ''}><summary>판정 상세 · ${arrival ?? view.battle.position}층${icon('chevron-down',14)}</summary><ol class="dec-traces">${details.map(markup => '<li>' + markup + '</li>').join('') || '<li>효과 없음</li>'}</ol></details>`;
}

function quickActions(ctx, st) {
  const { view, catalog } = ctx;
  const legal = view.quickActions ?? [];
  const all = hotel(view);
  if (!legal.length) return note('현재 사용할 수 있는 속공이 없습니다.');
  const ids = [...new Set(legal.map(a => a.id + ':' + a.side))];
  const source = ids.includes(st.activeSource) ? st.activeSource : ids[0];
  const [id, side] = source.split(':');
  const entity = all.find(e => e.id === id);
  const key = side === 'base' ? entity.type : entity.donor;
  const possible = legal.filter(a => a.id === id && a.side === side);
  const targeted = possible.some(a => a.target);
  const target = possible.find(a => a.target === st.activeTarget)?.target;
  const list = ids.map(code => {
    const [who, part] = code.split(':');
    const e = all.find(x => x.id === who);
    const name = part === 'base' ? e.type : e.donor;
    return { value: code, label: `${e.floor}층 · ${catalog.creatures[name].name}${e.fusion ? (part === 'base' ? ' (본체)' : ' (B)') : ''}` };
  });
  const card = catalog.creatures[key];
  const copy = side === 'donor' ? entity.donorText : card.baseText + (entity.upgraded ? ' · 강화 ' + card.upgradeText : '');
  const targets = possible.filter(a => a.target).map(a => all.find(e => e.id === a.target));
  return `<div class="dec-controls">${select('속공 괴이', 'activeSource', source, list)}${targeted ? select('속공 대상', 'activeTarget', target ?? '', [placeholder('대상 선택'), ...entityOptions(targets)]) : ''}${action('active', target ? [id, side, target] : [id, side], '속공 사용', { style:'secondary', off: targeted && !target })}</div>${note(copy)}`;
}

function battle(ctx, st) {
  const {view, catalog} = ctx;
  const b = view.battle;
  const choosing = view.phase === 'choose';
  const previewSlot = previewDieSlot(st);
  loadForecast(ctx, st, choosing ? '/api/preview?slot='+previewSlot : '/api/preview', 'battle');
  let html = guestState(ctx);
  if (choosing) {
    const dice = b.rolls.map((face, i) => {
      const slot = i + 1;
      const name = esc(catalog.dice[view.dice[i]].name);
      return `<button type="button" class="dec-choice dec-die${String(slot) === previewSlot ? ' is-previewed' : ''}" data-act="choose" data-value="${slot}" data-args="${htmlArgs([slot])}" aria-label="${slot}번 ${name}, ${face}칸 이동 확정">${dieFace(face)}<span><small>${slot}번 · ${name}</small><strong>${face}칸 이동</strong></span></button>`;
    });
    html += `<div class="dec-routes">${dice.join('')}</div>`;
  } else {
    html += `<div class="dec-prepared"><strong>${b.slot}번 · ${esc(catalog.dice[view.dice[b.slot - 1]].name)}</strong><span>원래 눈 ${b.rolls[b.slot - 1]} · 이동 ${b.face}칸</span></div>`;
  }
  html += '<div data-battle-preview>' + previewSummary(ctx, st) + '</div>';
  if (!choosing) {
    const open = view.floors.flatMap((e, i) => e ? [] : [{ value:i + 1, label: (i + 1) + '층' }]);
    const exit = st.exitFloor ?? '';
    const out = b.exit ? note(`탈출구는 ${b.exit}층에 설치되어 있습니다.`) : !open.length ? note('빈층이 없어 출구를 설치할 수 없습니다.') :
      `<div class="dec-controls">${select('탈출구를 설치할 빈층', 'exitFloor', exit, [placeholder('층 선택'), ...open])}${action('exit', [Number(exit)], '출구 설치', {off: !exit, style:'secondary'})}</div>${note(view.node.kind === 'boss' ? '보스가 출구에 닿으면 패배합니다.' : '손님이 출구에 닿으면 완승 보상을 포기하고 전투를 마칩니다.')}`;
    html += `<div class="dec-prep-options"><details class="dec-disclosure" data-fold="quickOpen"${st.quickOpen ? ' open' : ''}><summary>${icon('star')} 속공 · ${new Set((view.quickActions ?? []).map(a=>a.id+':'+a.side)).size}개</summary>${quickActions(ctx, st)}</details><details class="dec-disclosure" data-fold="exitOpen"${st.exitOpen ? ' open' : ''}><summary>${icon('key')} 탈출구</summary>${out}</details></div>`;
    html += footer(action('move', [], '이동 실행 ' + icon('arrow-right')));
  }
  return section(choosing ? '주사위 선택' : '이동 준비', guestAttackText(b.guest), html);
}

function previewDieSlot(st) {
  return st.hoverSlot ?? st.focusSlot ?? '1';
}

function refreshBattleSummary(st) {
  // Keep the actual die buttons mounted throughout hover and keyboard comparison.
  const region = st.ctx.root.querySelector('[data-battle-preview]');
  if (!region) return;
  const fold = region.querySelector('[data-fold="forecastOpen"]');
  if (fold) st.forecastOpen = fold.open;
  region.innerHTML = previewSummary(st.ctx, st);
}

function bindDiePreviews(st) {
  const {root} = st.ctx;
  const selector = '[data-act="choose"]';
  const dice = root.querySelectorAll(selector);
  for (const die of dice) {
    const slot = die.dataset.value;
    function inspect(key, value) {
      if (st.busy || !root.contains(die)) return;
      st[key] = value;
      const current = previewDieSlot(st);
      const path = '/api/preview?slot=' + current;
      if (path === st.request) return;
      for (const option of dice) option.classList.toggle('is-previewed', option.dataset.value === current);
      loadForecast(st.ctx, st, path, 'battle');
      refreshBattleSummary(st);
    }
    die.onpointerenter = event => {
      if (event.pointerType !== 'touch') inspect('hoverSlot', slot);
    };
    die.onpointerleave = event => {
      if (event.pointerType !== 'touch') inspect('hoverSlot', event.relatedTarget?.closest?.(selector)?.dataset.value);
    };
    die.onfocus = () => { st.hoverSlot = null; inspect('focusSlot', slot); };
    die.onblur = event => inspect('focusSlot', event.relatedTarget?.closest?.(selector)?.dataset.value);
  }
}

function ending(ctx) {
  const {view} = ctx;
  const reason = { victory:'3막 보스의 마지막 보상 처리를 마쳤습니다.', extinction:'마지막 괴이가 파괴되었습니다.', 'boss-escape':'보스가 출구로 탈출했습니다.', 'give-up':'이번 판의 영업을 중단했습니다.', giveup:'이번 판의 영업을 중단했습니다.' };
  return section(view.phase === 'won' ? '영업 성공' : '영업 종료', view.phase === 'won' ? '승리' : '패배',
    note(reason[view.result] ?? '') + `<div class="dec-end-totals"><span>완료 방문 <strong>${view.visited.length}</strong></span><span>생존 괴이 <strong>${hotel(view).length}</strong></span><span>잔여 영혼 <strong>${view.souls}</strong></span></div>` +
    (ctx.newGame ? footer('<button type="button" class="dec-button dec-primary" data-local="new">새 판 시작 ' + icon('arrow-right') + '</button>') : ''));
}

function drawPanel(st) {
  const ctx = st.ctx;
  const root = ctx.root;
  // A native disclosure changes .open immediately but queues its toggle event.
  // Capture it before a select change or completed preview can replace the element.
  if (st.rendered) {
    for (const fold of root.querySelectorAll('[data-fold]')) st[fold.dataset.fold] = fold.open;
  }
  const current = root.ownerDocument.activeElement;
  const focus = root.contains(current) ? [current.dataset?.pick, current.dataset?.value, current.dataset?.field] : null;
  let html;
  if (st.screen === 'map') html = mapPanel(ctx, st);
  else if (st.screen === 'hotel' && !['management','choose','prepare'].includes(ctx.view.phase)) html = '';
  else switch (ctx.view.phase) {
    case 'management': html = management(ctx); break;
    case 'shop': html = offers(ctx, st, true); break;
    case 'reward': html = offers(ctx, st, false); break;
    case 'acquisition': html = acquisition(ctx, st); break;
    case 'recovery': html = recovery(ctx, st); break;
    case 'event': html = eventPanel(ctx, st); break;
    case 'fusion': html = fusion(ctx, st); break;
    case 'die': html = section('엘리트 주사위 보상', '세 자리 중 하나와 교체', equipPanel(ctx, st, ctx.view.offerDie) + footer(endVisit())); break;
    case 'choose':
    case 'prepare': html = battle(ctx, st); break;
    case 'won':
    case 'lost': html = ending(ctx); break;
    default: html = note('현재 결정을 불러올 수 없습니다.');
  }
  if (st.screen !== 'map' && (st.screen === 'hotel' || ctx.view.phase === 'management') && canReorder(ctx.view.phase)) html += reorder(ctx, st);
  root.innerHTML = `<div class="dec-panel">${html}<div class="dec-error" role="alert"></div></div>`;
  st.rendered = true;
  if (ctx.view.phase === 'choose' && st.screen !== 'map') bindDiePreviews(st);
  // Preserve keyboard focus during local comparisons and asynchronous forecasts.
  if (focus && (focus[0] || focus[2])) {
    const next = [...root.querySelectorAll('[data-pick],[data-field]')].find(el => focus[2] ?
      el.dataset.field === focus[2] : el.dataset.pick === focus[0] && el.dataset.value === focus[1]);
    next?.focus({ preventScroll: true });
  }
  for (const fold of root.querySelectorAll('[data-fold]')) {
    fold.ontoggle = () => { if (root.contains(fold)) st[fold.dataset.fold] = fold.open; };
  }
}

function updateChoice(st, key, value) {
  st[key] = value;
  if (['from','to','dest','exitFloor'].includes(key)) st.ctx.selectFloor?.(value);
  if (key === 'from' && value === st.to) st.to = '';
  if (key === 'body' && value === st.donor) st.donor = '';
  if (key === 'activeSource') st.activeTarget = '';
  if (key === 'healFirst' && value === st.healSecond) {
    const e = hotel(st.ctx.view).find(e => e.id === value);
    if (!e || e.maxTokens - e.tokens < 2) st.healSecond = '';
  }
  drawPanel(st);
}

export function renderDecisions(ctx) {
  const { root, view } = ctx;
  const screen = ctx.screen ?? (view.phase === 'map' ? 'map' : 'activity');
  let st = sessions.get(root);
  if (!st || st.view !== view || st.revision !== ctx.revision || st.screen !== screen) {
    // Server decisions replace the public view. A previous request cannot overwrite a new turn.
    const previous = st;
    st = { view, revision: ctx.revision, screen, ctx };
    if (previous?.view?.phase === 'prepare' && view.phase === 'prepare') {
      st.quickOpen = previous.quickOpen;
      st.activeSource = previous.activeSource;
    }
    sessions.set(root, st);
  }
  st.ctx = ctx;
  root.onclick = async event => {
    const btn = event.target.closest('button');
    if (!btn || !root.contains(btn) || btn.disabled || st.busy) return;
    if (btn.dataset.pick) return updateChoice(st, btn.dataset.pick, btn.dataset.value);
    if (btn.dataset.local === 'new') return ctx.newGame?.();
    if (btn.dataset.local === 'retry') { st.request = null; return drawPanel(st); }
    if (btn.dataset.local === 'reverse') { [st.body, st.donor] = [st.donor, st.body]; return drawPanel(st); }
    if (!btn.dataset.act) return;
    st.busy = true;
    btn.disabled = true;
    try {
      await ctx.act(btn.dataset.act, JSON.parse(decodeURIComponent(btn.dataset.args)));
    } catch (error) {
      const box = root.querySelector('.dec-error');
      if (sessions.get(root) === st && box) box.textContent = error.message;
    } finally {
      st.busy = false;
      if (root.contains(btn)) btn.disabled = false;
    }
  };
  root.onchange = event => {
    const key = event.target.dataset.field;
    if (key) updateChoice(st, key, event.target.value);
  };
  drawPanel(st);
}
