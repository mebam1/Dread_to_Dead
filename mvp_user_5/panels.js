import {art, esc, family, guestAttackText, guestPortrait, icon, token, tokenTypes} from './ui.js';

const kinds = {normal:'일반 전투', elite:'엘리트', boss:'보스', fusion:'융합', shop:'상점', recovery:'회복', event:'이벤트'};
const titles = {journal:'영업 기록', guide:'플레이 안내', settings:'설정 및 새 판', floor:'층 카드', guest:'손님 상세'};
const guests = {
  N1:'성급한 투숙객', N2:'복도 점검원', N3:'옆방을 확인하는 손님', N4:'두 번 확인하는 손님',
  N5:'야간 점검원', N6:'거울을 보는 손님', E1:'정예 복도 점검원', E2:'정예 야간 점검원',
  E3:'정예 거울 감찰관', BOSS1:'거울 감찰관', BOSS2:'호텔의 조사관', BOSS3:'호텔의 조사관 · 최종 조사',
};
const panelListeners = new WeakMap();
const item = (term, markup) => '<dt>' + esc(term) + '</dt><dd>' + markup + '</dd>';
const cardName = (catalog, type) => catalog.creatures[type]?.name ?? type;

function floorContent({view, catalog}, floor) {
  const e = view.floors[floor - 1];
  const battle = ['choose','prepare'].includes(view.phase) ? view.battle : null;
  if (!e) {
    const exit = battle?.exit === floor ? '<p>설치한 탈출구가 있다. 손님이 이 층을 방문하면 이번 영업이 끝난다.</p>' : '';
    return '<h3>빈 종이 카드</h3><p>손님은 이 층도 한 칸으로 지나간다. 통과·도착 효과는 없다.</p>' + exit;
  }
  const status = ['seal', 'ambush', 'defense', 'stepBase', 'stepDonor'].filter(key => e[key] > 0)
    .map(key => esc(tokenTypes[key][0]) + ' ' + token(key, e[key])).join(' · ');
  let details = item('본체 효과', esc(e.baseText)) + item(e.upgraded ? '적용 중인 강화' : '강화하면', esc(e.upgradeText));
  if (e.fusion) {
    details += item('융합 계보', '왼쪽 본체 ' + esc(cardName(catalog, e.type)) + ' (' + esc(e.fusion.aId) +
      ') · 오른쪽 재료 ' + esc(cardName(catalog, e.donor)) + ' (' + esc(e.fusion.bId) + ')');
    details += item('B 본 효과', esc(e.donorText));
  }
  if (status) details += item('현재 상태', status);
  if (e.target != null) details += item('잠복 표적', esc(e.target) + '층');
  if (e.partnerTarget != null) details += item('B 잠복 표적', esc(e.partnerTarget) + '층');
  const protectedBy = battle?.guards?.[e.id];
  if (protectedBy) {
    const guard = view.floors.find(entry => entry?.id === protectedBy);
    if (guard) details += item('이번 턴 대리 피격', esc(guard.name) + ' (' + esc(protectedBy) + ')');
  }
  return '<div class="detail-hero">' + art(e.type, e.donor) + '<div><h3>' + esc(e.name) + '</h3><p>' +
    esc(family(e.type)) + ' 계열 · ' + esc(e.id) + ' · ' + (e.upgraded ? '강화됨' : '미강화') + '</p><p>공략도 ' +
    esc(e.damage) + '/' + esc(e.limit) + '</p><p>파훼 토큰 ' + token('tokens', e.tokens) +
    ' / 최대 ' + esc(e.maxTokens) + '</p></div></div><dl class="detail-dl">' + details + '</dl>';
}

function inspectedGuest(view, subject) {
  const battle = ['choose','prepare'].includes(view.phase) ? view.battle : null;
  if (!subject) return battle && {guest:battle.guest, index:battle.index, count:battle.guests.length, battle};
  const {nodeId,index} = subject;
  const node = view.map.find(n => n.id === nodeId);
  const guest = Number.isInteger(index) && node?.guests[index];
  if (!guest) return null;
  const live = battle?.index === index && view.node?.id === nodeId ? battle : null;
  return {guest:live?.guest ?? guest, index, count:node.guests.length, battle:live};
}

function guestContent({guest, index, count, battle}) {
  const patterns = {double:'연타', route:'경로', adjacent:'이웃', mirror:'거울', bossMirror:'거울'};
  let pattern = patterns[guest.pattern];
  if (guest.pattern === 'final' && battle) pattern = '이번 ' + battle.turn + '턴 · ' + (battle.turn % 2 ? '연타' : '거울');
  const effects = (Array.isArray(guest.effects) ? guest.effects : [guest.effects])
    .filter(text => typeof text === 'string' && text.trim());
  let location = '명부';
  let vitals = '공포 한계 ' + esc(guest.t) + ' · 최대 심장 ' + token('heart',guest.h);
  let state = '<p>현재 상태는 이 손님의 영업 차례에 표시됩니다.</p>';
  if (battle) {
    location = battle.turn + '턴 · ' + (battle.position ? battle.position + '층' : '입장 대기');
    vitals = '공포 ' + esc(battle.fear) + '/' + esc(guest.t) + ' · 심장 ' +
      token('heart',battle.hearts) + ' / 최대 ' + esc(guest.h);
    const tokens = ['anxiety','greed','prophecy'].map(key =>
      '<span>' + esc(tokenTypes[key][0]) + ' ' + token(key,battle[key]) + '</span>').join('');
    state = '<p class="guest-detail-tokens">' + tokens + '</p><p>비활동 ' +
      esc(battle.idle) + '/' + esc(battle.idleLimit) + '턴</p>';
  }
  return '<div class="detail-hero guest-detail-hero"><span class="guest-detail-art" aria-hidden="true">' +
    guestPortrait(guest) + '</span><div><h3>' + esc(guest.name) + '</h3><p>손님 ' + (index+1) + '/' +
    count + ' · ' + esc(location) + '</p><p>' + vitals + '</p></div></div>' +
    '<section class="guest-detail-section"><h3>공격 패턴</h3><p>' +
    (pattern ? '<strong>' + esc(pattern) + '</strong> · ' : '') + esc(guestAttackText(guest)) + '</p></section>' +
    '<section class="guest-detail-section"><h3>고유 효과</h3>' +
    (effects.length ? '<ul>' + effects.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>' : '<p>없음</p>') +
    '</section><section class="guest-detail-section"><h3>현재 상태</h3>' + state + '</section>';
}

function guideContent({catalog}) {
  const cards = Object.values(catalog.creatures).map(card =>
    '<details><summary>' + esc(card.name) + ' · ' + card.price + '영혼</summary><dl class="detail-dl">' +
    item('기본', esc(card.baseText)) + item('강화', esc(card.upgradeText)) +
    item('내구', '공략 한계 ' + card.limit + ' · 파훼 토큰 ' + token('tokens', card.maxTokens)) +
    '</dl></details>').join('');
  return '<h3>모험 지도</h3><p>새 판은 1막 지도에서 시작한다. 노드를 눌러 정보를 확인하고, 연결된 노드 중 다음 방문지를 골라 세 막을 진행한다. 호텔 보기로 괴이 배치를 살펴보고 모험 지도로 돌아갈 수 있다. 전투 준비와 전투에서는 호텔이 바로 열린다. 새로고침한 뒤에는 지도에서 현재 방문의 진행 탭을 눌러 이어간다.</p>' +
    '<h3>호텔 카드 읽기</h3><p>왼쪽부터 1~10층이다. 위에는 손님 카드 또는 빈 카드, 아래에는 괴이 카드 또는 빈 카드가 놓인다. ' +
    '두 행은 함께 움직인다. 손님 카드나 입구 초상을 누르면 공격 패턴·고유 효과·현재 상태를, 아래쪽 카드를 누르면 괴이의 효과와 상태를 읽을 수 있다.</p>' +
    '<h3>한 턴 진행</h3><ol><li>주사위 눈에 마우스를 올리거나 키보드 초점을 맞춰 비교한다. 위쪽 칸에는 손님이 지나갈 길과 그 칸에서 얻을 상태 그림 ×수량이 표시된다. 아래쪽의 검붉은 스티커는 예상 공략도 증가량을 보여 준다. 하늘색 숫자는 방어로 줄어든 값이며, 전부 막으면 +0이다. 빈 층에는 공격 위력과 빗나감이 표시된다. 쓸 주사위를 클릭하거나 탭하면 즉시 확정된다. 키보드에서는 원하는 눈에 초점을 맞추고 Enter 또는 스페이스바를 누른다.</li>' +
    '<li>속공을 쓰려면 괴이 카드 오른쪽 아래의 밝은 금화를 누른다. 대상이 필요하면 강조된 괴이 카드를 선택한다. 어두운 금화는 현재 사용할 수 없다. 융합체의 두 금화는 왼쪽이 원본 A, 오른쪽이 원본 B이며 누른 쪽의 비용만 지불한다. 필요하면 빈층에 탈출구를 놓고 이동을 실행한다.</li>' +
    '<li>손님이 한 칸씩 이동한다. 중간 방문에서는 통과 효과, 마지막 층에서는 도착 효과가 발동한다. 10층 다음은 1층이다.</li>' +
    '<li>손님 카드와 보드 아래에 현재 공포/한계가 표시된다. 공포가 한계에 닿으면 심장이 하나 줄어든다. 마지막 심장을 잃은 손님은 그 층에서 처치된다. 다음 손님은 보드 아래 입구에서 기다렸다가 첫 이동 때 1층으로 들어온다.</li>' +
    '<li>살아남은 손님은 공개한 패턴으로 반격한다. 괴이의 파훼 토큰이 모두 소모되면 그 층이 빈다.</li></ol>' +
    '<h3>공격 범위</h3><p>도착층을 기준으로 공격할 때는 1~10층 안에 있는 대상만 친다. 거울 감찰관이 1층에 도착하면 3층만 공격한다. 경로 공격은 이번 이동에서 실제로 방문한 층을 순서대로 친다.</p>' +
    '<h3>다음 방문 준비</h3><p>정비 중 괴이 카드를 빈층에 끌어 놓으면 이동하고, 다른 괴이 위에 놓으면 두 카드가 자리를 맞바꾼다. 층 재배치 메뉴에서도 같은 조작을 할 수 있다. 새 괴이는 즉시 배치하거나 폐기하고 만실이면 기존 개체 하나와 비교한다. ' +
    '융합 노드에서는 A와 B의 본 효과가 모두 발동한다. 내구는 A에게서 계승한다. 확정하면 두 재료가 사라지고 B의 층이 빈다.</p>' +
    '<p>각 막은 여덟 번 방문한다. 3막 보스를 처치한 뒤 마지막 괴이 보상을 처리하면 승리한다.</p>' +
    '<h3>괴이 도감 · ' + Object.keys(catalog.creatures).length + '종</h3>' + cards;
}

function settingsContent({view}) {
  const locked = ['won', 'lost'].includes(view.phase) ||
    (view.act === 3 && view.node?.kind === 'boss' && ['reward', 'acquisition'].includes(view.phase));
  return '<h3>현재 판</h3><p>판 번호 ' + esc(view.seed) + ' · ' + esc(view.act) + '막 · 방문 완료 ' +
    view.visited.length + '/24</p><h3>새 판</h3><form data-seed-form><label>판 번호 <input name="seed" type="number" min="0" max="' +
    Number.MAX_SAFE_INTEGER + '" step="1" value="' + esc(view.seed) + '" required></label>' +
    '<button type="submit">새 판 시작…</button></form><h3>영업 종료</h3>' +
    '<button type="button" data-giveup' + (locked ? ' disabled' : '') + '>현재 판 포기…</button><div data-confirm></div>';
}

function growthSummary(report) {
  const full = report.firstFull;
  const summary = report.acts.map(a => '<li><strong>' + esc(a.act) + '막</strong> · 이월 ' + esc(a.carried) +
    ' + 시작 자금 ' + esc(a.grant) + ' + 추가 수입 ' + esc(a.earned) + '/9영혼<br>구매 ' + a.purchases.length +
    '장 (' + a.purchases.reduce((n, e) => n + e.paid, 0) + '영혼) · 완승 보상 ' + a.rewards.length +
    '장 · 융합 ' + a.fusions.length + '회 · 강화 ' + a.upgrades.length + '회</li>').join('');
  const fullLabel = full ? full.act + '막 ' + (full.nodeId?.split('-')[1] ?? '') + '번째 방문' : '아직 없음';
  return '<h3>성장 기록</h3><p>첫 만실 · ' + esc(fullLabel) + '</p><ul>' + summary + '</ul>';
}

function ledgerContent(journal, report, {catalog}) {
  const groups = [];
  const names = new Map();
  let group, turn = 0;
  const entity = id => names.has(id) ? names.get(id) + ' (' + id + ')' : id;
  const die = type => catalog.dice[type]?.name ?? type;
  const nameOf = type => cardName(catalog, type);
  for (const e of journal) {
    if (e.type === 'acquired') names.set(e.id, nameOf(e.creature));
    if (e.type === 'fusion') names.set(e.c, e.name);
    if (!group || (e.nodeId && group.nodeId !== e.nodeId)) {
      const [act, depth, col] = (e.nodeId ?? '').split('-');
      group = {nodeId: e.nodeId, name: e.nodeId ? act + '막 ' + depth + '번째 · ' + col : '개업 준비', lines: []};
      groups.push(group);
      turn = 0;
    }
    let line;
    switch (e.type) {
      case 'start': line = '영혼 ' + e.souls + '으로 개업'; break;
      case 'visit': group.name += ' · ' + kinds[e.kind]; break;
      case 'guest-entry': turn = 0; line = (guests[e.guest] ?? e.guest) + ' 입장'; break;
      case 'roll': turn = e.turn; line = (e.reroll ? '재굴림 ' : '굴림 ') + e.rolls.join(' · '); break;
      case 'choose': line = e.slot + '번 주사위 확정 · 눈 ' + e.face; break;
      case 'active': line = entity(e.id) + ' 속공' + (e.target ? ' → ' + entity(e.target) : ''); break;
      case 'fear': line = entity(e.id) + ' 공포 +' + e.amount; break;
      case 'heart': line = '심장 하나 제거 · 남은 심장 ' + e.remaining; break;
      case 'hit':
        line = e.receiver + '층 ' + entity(e.id) + (e.penalty ? ' 비활동 피해 ' : ' 피격 ') + e.actual;
        if (e.absorbed) line += ' · 방어 흡수 ' + e.absorbed;
        if (e.breached) line += ' · 파훼 토큰 −1, 남은 토큰 ' + e.tokens;
        break;
      case 'destroy': line = e.floor + '층 ' + entity(e.id) + ' 영구 파괴'; break;
      case 'kill': line = (guests[e.guest] ?? e.guest) + ' 처치'; break;
      case 'exit-contact': line = e.floor + '층 출구 접촉'; break;
      case 'income': line = '영혼 +' + e.paid + ' · 잔액 ' + e.souls; break;
      case 'battle-end': turn = 0; line = {win:'전투 완승', escape:'손님 탈출', loss:'전멸'}[e.outcome]; break;
      case 'acquired': line = entity(e.id) + ' 획득' + (e.floor ? ' · ' + e.floor + '층 배치' : ''); break;
      case 'placed': line = entity(e.id) + ' · ' + e.floor + '층 배치'; break;
      case 'discard': line = entity(e.id) + ' 폐기'; break;
      case 'purchase': line = nameOf(e.creature) + ' 구입 · ' + e.paid + '영혼'; break;
      case 'contract': line = entity(e.id) + ' 계약으로 제거'; break;
      case 'heal': line = entity(e.id) + ' 파훼 토큰 +' + e.count + ' · 현재 ' + e.tokens; break;
      case 'equip': line = '주사위 ' + e.slot + '번 · ' + die(e.before) + ' → ' + die(e.after); break;
      case 'fusion': line = entity(e.a) + ' + ' + entity(e.b) + ' → ' + entity(e.c); break;
      case 'upgrade': line = entity(e.id) + ' 강화'; break;
      case 'swap': line = entity(e.id) + ' · ' + e.from + '층 → ' + e.to + '층' + (e.other ? ' 맞교환' : ' 이동'); break;
      case 'act-end': line = '다음 막 준비 · 생존 개체 파훼 토큰 복구'; break;
      case 'victory': line = '마지막 보상 처리 · 최종 승리'; break;
      case 'defeat': line = '패배 · ' + ({giveup:'플레이어 포기', 'boss-escape':'보스 탈출', extinction:'괴이 전멸'}[e.reason] ?? e.reason); break;
    }
    if (line) group.lines.push('<li>' + (turn ? esc(turn) + '턴 · ' : '') + esc(line) + '</li>');
  }
  const sections = groups.filter(g => g.lines.length).reverse().map((g, i) =>
    '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(g.name) + '</summary><ol class="log-list">' +
    g.lines.join('') + '</ol></details>').join('');
  return growthSummary(report) + '<h3>방문별 영업 기록</h3>' + sections;
}

export function openPanel(kind, ctx, subject = null) {
  if (!Object.hasOwn(titles, kind)) return;
  if (kind === 'floor' && !(Number.isInteger(subject) && subject >= 1 && subject <= 10)) return;
  const guest = kind === 'guest' ? inspectedGuest(ctx.view, subject) : null;
  if (kind === 'guest' && !guest) return;
  const modal = ctx.modal;
  panelListeners.get(modal)?.abort();
  const lifecycle = new AbortController();
  panelListeners.set(modal, lifecycle);
  const options = {signal: lifecycle.signal};
  const live = () => !lifecycle.signal.aborted && modal.open;
  const body = modal.querySelector('#modal-body');
  const heading = kind === 'floor' ? subject + '층 카드' : titles[kind];
  body.innerHTML = '<header class="dialog-top"><h2 id="panel-heading">' + esc(heading) +
    '</h2><button type="button" class="square" data-dismiss aria-label="닫기">' + icon('close') +
    '</button></header><div class="dialog-content"></div>';
  modal.setAttribute('aria-labelledby', 'panel-heading');
  const content = body.querySelector('.dialog-content');
  if (kind === 'floor') content.innerHTML = floorContent(ctx, subject);
  if (kind === 'guest') content.innerHTML = guestContent(guest);
  if (kind === 'guide') content.innerHTML = guideContent(ctx);
  if (kind === 'settings') content.innerHTML = settingsContent(ctx);
  if (kind === 'journal') content.innerHTML = '<p role="status">영업 기록을 불러오는 중…</p>';
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
  body.querySelector('[data-dismiss]').focus({preventScroll: true});
  modal.addEventListener('close', () => { if (!modal.open) lifecycle.abort(); }, options);
  let pending = false;
  async function commit(action) {
    if (pending || !live()) return;
    pending = true;
    try { await action(); }
    catch (error) {
      if (live()) {
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent = error.message;
        content.append(message);
      }
    } finally { pending = false; }
  }
  function confirm(action, seed) {
    const box = body.querySelector('[data-confirm]');
    const text = action === 'new' ? '현재 저장을 ' + seed + '번 새 판으로 교체할까요?' : '지금 포기하면 이번 판은 패배로 끝납니다. 포기할까요?';
    box.innerHTML = '<p>' + esc(text) + '</p><button type="button" data-cancel>취소</button> ' +
      '<button type="button" data-confirm-action="' + action + '"' + (action === 'new' ? ' data-seed="' + seed + '"' : '') +
      '>' + (action === 'new' ? '새 판 확정' : '포기 확정') + '</button>';
    box.querySelector('[data-cancel]').focus();
  }
  modal.addEventListener('submit', event => {
    if (!event.target.matches('[data-seed-form]')) return;
    event.preventDefault();
    const input = event.target.elements.seed;
    const seed = input.valueAsNumber;
    if (Number.isSafeInteger(seed) && seed >= 0) confirm('new', seed);
    else { input.setCustomValidity('0 이상의 정수 판 번호를 입력하세요.'); input.reportValidity(); input.setCustomValidity(''); }
  }, options);
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      const r = modal.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
      return;
    }
    const button = event.target.closest('button');
    if (!button || !body.contains(button)) return;
    if (button.hasAttribute('data-dismiss')) modal.close();
    else if (button.hasAttribute('data-cancel')) {
      const target = body.querySelector('[data-confirm-action]')?.dataset.confirmAction === 'new' ?
        body.querySelector('[data-seed-form] button') : body.querySelector('[data-giveup]');
      body.querySelector('[data-confirm]').replaceChildren();
      target?.focus();
    } else if (button.hasAttribute('data-giveup')) confirm('giveup');
    else if (button.dataset.confirmAction === 'new') void commit(() => ctx.newGame(Number(button.dataset.seed)));
    else if (button.dataset.confirmAction === 'giveup') void commit(() => ctx.act('give-up', []));
  }, options);
  if (kind === 'journal') {
    Promise.all([ctx.api('/api/journal'), ctx.api('/api/report')]).then(([journal, report]) => {
      if (live()) content.innerHTML = ledgerContent(journal, report, ctx);
    }).catch(error => {
      if (live()) content.textContent = '기록을 읽지 못했습니다. ' + error.message;
    });
  }
}
