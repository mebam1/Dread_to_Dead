export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

const paths = {
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16.7 7.3-3.2 6.2-6.2 3.2 3.2-6.2Z"/>',
  map:'<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2ZM9 3v15m6-12v15"/>',
  flag:'<path d="M5 21V4c5-4 9 4 15 0v9c-6 4-10-4-15 0"/>',
  swords:'<path d="m3 3 4 1 11 13-1 1L4 7Zm18 0-4 1-5 6m-3 3-3 4 1 1 4-4m4 6 5-5M4 15l5 5m-4-1-2 2m16-2 2 2"/>',
  skull:'<path d="M5 15c-5-14 19-16 14 0l-3 1v4H8v-4Z"/><circle cx="9" cy="11" r="1.3"/><circle cx="15" cy="11" r="1.3"/><path d="m11 15 1-2 1 2"/>',
  crown:'<path d="m3 7 5 4 4-7 4 7 5-4-3 11H6Zm3 14h12"/>',
  fire:'<path d="M13 2c2 7-3 7 1 11 2-2 3-4 3-6 7 9 2 15-5 15S2 16 6 10c0 3 2 4 3 4-1-5 1-8 4-12Z"/>',
  shop:'<path d="m3 9 2-6h14l2 6M4 12v8h16v-8M3 9c0 4 5 4 6 0 1 4 5 4 6 0 1 4 6 4 6 0ZM9 20v-6h5v6"/>',
  upgrade:'<path d="m5 13 7-8 7 8m-7-8v15M4 3h16"/>',
  fusion:'<path d="m3 4 6 6 6 1 6 7m-5 0h5v-5M3 20l6-6m5-5 6-6"/>',
  arrowRight:'<path d="M3 12h17m-6-6 6 6-6 6"/>',
  chevronLeft:'<path d="m15 5-7 7 7 7"/>', chevronRight:'<path d="m9 5 7 7-7 7"/>',
  heart:'<path d="M20 5c-2-2-5-2-8 1-3-3-6-3-8-1-5 5 2 10 8 15 6-5 13-10 8-15Z"/>',
  coins:'<ellipse cx="11" cy="7" rx="8" ry="3"/><path d="M3 7v4c0 4 16 4 16 0V7M3 12v3c0 4 14 5 17 1v-4m-2 8c-4 2-12 1-13-1"/>',
  check:'<path d="m4 13 5 5L20 6"/>', book:'<path d="M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
  dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="currentColor" stroke="none"><circle cx="7.5" cy="7.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="16.5" cy="16.5" r="1.3"/></g>',
  pack:'<rect x="4" y="6" width="16" height="15" rx="3"/><path d="M8 6V4c0-3 8-3 8 0v2M4 12c5 4 11 4 16 0m-8 2v3"/>',
  leaf:'<path d="M4 19C0 9 8 3 21 3c0 11-6 18-15 15Zm1-1L16 8"/>',
  paw:'<path d="M5 17c0-2 3-3 4-6 1-2 4-2 5 0 1 3 5 4 5 7 0 4-4 2-7 2s-7 2-7-3Z"/><path d="M4 8v2m4-6v3m6-4v3m5 1v3"/>',
  cross:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  shield:'<path d="m12 2 8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5Z"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  swap:'<path d="M3 7h17l-4-4m5 14H4l4 4"/>',
  bolt:'<path d="m14 2-11 12h8l-1 8L21 9h-8Z"/>',
  exit:'<path d="M10 4H4v16h6m-1-8h12l-5-5m5 5-5 5"/>',
  move:'<path d="M12 2v20M2 12h20m-14-6 4-4 4 4M6 8l-4 4 4 4m2 2 4 4 4-4m2-10 4 4-4 4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  users:'<circle cx="9" cy="7" r="3"/><path d="M2 20v-2c0-7 14-7 14 0v2Zm14-16c5 0 5 6 1 6m1 4c4 0 4 3 4 5"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', close:'<path d="m5 5 14 14M19 5 5 19"/>',
  settings:'<path d="M3 6h10m5 0h3M3 12h3m5 0h10M3 18h10m5 0h3"/><circle cx="15.5" cy="6" r="2.5"/><circle cx="8.5" cy="12" r="2.5"/><circle cx="15.5" cy="18" r="2.5"/>'
};

export function icon(name, size = 20) {
  return '<svg class="glyph" width="'+Number(size)+'" height="'+Number(size)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+(paths[name] || paths[name==='user'?'users':'compass'])+'</svg>';
}

const nodeNames = {normal:'일반 전투', elite:'엘리트 전투', boss:'보스 전투', recovery:'회복', shop:'상점', fusion:'융합', upgrade:'강화'};
export const nodeName = kind => nodeNames[kind] || '지점';
const patternNames = {double:'연속 타격', alternate:'연타·거울 교대', mirror:'거울 공격', neighbor:'이웃 공격', path:'경로 공격', strikeMove:'타격 후 이동'};
export const patternName = key => patternNames[key] || '대기';
const enemyNames = {A:'잿빛 늑대', B:'길잡이 까마귀', C:'철갑 멧돼지', D:'붉은 늑대', E:'안개 까마귀', F:'거울 사슴'};
export function enemyName(value) {
  const key = typeof value === 'string' ? value : value?.type;
  if (enemyNames[key]) return enemyNames[key];
  const match = /^(EL|BO)(\d)-([MGS])$/.exec(key);
  return match ? ({M:match[1]==='BO'?'숲의 군주':'정예 우두머리', G:'철갑 수문장', S:'안개 길잡이'}[match[3]]) : '적';
}

const tiles = ['paladin','holyPriest','saint','squire','choir','crusader','warPriest','cardinal','sprayer','gourmet','toxicHealer','A','B','C','D','F'];
export function portrait(type, extraClass = '') {
  const key = type === 'E' || /-S$/.test(type) ? 'B' : /-G$/.test(type) ? 'C' : /-M$/.test(type) ? (type.startsWith('BO')?'F':'D') : type;
  const i = Math.max(0, tiles.indexOf(key));
  return '<span aria-hidden="true" class="portrait '+esc(extraClass)+'" style="--px:'+((i%4)*100/3)+'%;--py:'+(Math.floor(i/4)*100/3)+'%"></span>';
}

export function cardBadges(hp, counter = null, maxHp = hp) {
  const health = '현재 체력 '+hp+' / '+maxHp;
  const heart = `<span class="card-hp" data-hp="${esc(hp)}" role="img" aria-label="${esc(health)}" title="${esc(health)}">
    <svg viewBox="0 0 48 44" aria-hidden="true"><path d="M24 41C20 38 2 26 2 14 2 2 15-2 24 8 33-2 46 2 46 14c0 12-18 24-22 27Z" fill="#ae3734" stroke="#fff0d8" stroke-width="2.2"/></svg><span>${esc(hp)}</span></span>`;
  const countdown = counter == null ? '' : `<span class="card-counter" data-counter="${esc(counter)}" role="img" aria-label="공격까지 ${esc(counter)}라운드" title="공격까지 ${esc(counter)}라운드">${esc(counter)}</span>`;
  return `<span class="card-badges">${heart}${countdown}</span>`;
}

function enemyEffects(enemy, template) {
  const {intent, pattern, role} = enemy;
  const power = intent?.power ?? enemy.attack;
  const attacks = {
    double:`정면을 2번 타격. 한 타당 ${power} 피해.`,
    strikeMove:`정면에 ${power} 피해를 주고 오른쪽으로 3칸 이동.`,
    neighbor:`정면 왼쪽 칸, 정면 칸 순으로 ${power}씩 타격.`,
    mirror:`왼쪽과 오른쪽 두 칸 거리에 각각 ${power} 피해.`,
    path:`3칸 이동하며 방문한 칸마다 ${power} 피해.`
  };
  const next = intent?.pattern ?? (pattern === 'alternate' ? 'double' : pattern);
  const lines = [intent?.deferred ? '이번에는 공격 없이 3칸 이동. 다음 라운드에 재시도.' : attacks[next]];
  if (enemy.type === 'D') lines.push('연속 타격과 타격 후 이동을 번갈아 사용.');
  if (pattern === 'alternate') lines.push('연속 타격과 거울 공격을 번갈아 사용.');
  if (role === 'support') lines.push('라운드 시작에 아군의 첫 타격 위력 +2.');
  if (role === 'guard') {
    const granted = template?.protection ?? enemy.protection;
    lines.push(typeof granted === 'number' ? `전투 시작 시 아군 보호 +${granted}.` : '전투 시작 시 아군에게 보호 부여.');
  }
  return lines;
}

export function cardEffects(entity, catalog, template) {
  if (entity.role) {
    return '<span class="card-effects">'+enemyEffects(entity,template).map(line=>'<span>'+esc(line)+'</span>').join('')+'</span>';
  }
  // The catalog carries the rule text. Resolve fusion originals separately so their upgrades follow their owners.
  const parts = entity.effects ?? [entity, ...(entity.fusion ? [{type:entity.fusion.bType, upgraded:entity.fusion.bUpgraded}] : [])];
  const lines = parts.map(part => {
    const card = catalog.companions[part.type];
    const heading = parts.length > 1 ? '<b>'+esc(card.name)+'</b> ' : '';
    const base = (part.upgraded ? '기본 · ' : '') + card.baseText;
    const upgrade = part.upgraded ? '<span class="card-upgrade-effect"><b>강화</b> '+esc(card.upgradeText)+'</span>' : '';
    return '<span>'+heading+esc(base)+upgrade+'</span>';
  });
  return '<span class="card-effects">'+lines.join('')+'</span>';
}
