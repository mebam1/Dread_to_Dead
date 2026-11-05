export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[c]);

const shapes = {
  eye:'<path d="M2 12q10-13 20 0-10 13-20 0Z"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  soul:'<path d="m12 2 6 8 1 5-7 7-7-7 1-5Z"/><path d="m12 6 3 7-3 4-3-4Z"/>',
  dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="16" cy="16" r="1.6"/></g>',
  cards:'<path d="m3 7 3 13 3-1M6 4l3 14"/><rect x="10" y="3" width="11" height="17" rx="1"/><path d="m15.5 8 2 3-2 3-2-3Z"/>',
  map:'<path d="m2 5 6-2 8 3 6-2v15l-6 2-8-3-6 2ZM8 3v15m8-12v15"/>',
  book:'<path d="M3 3h14a2 2 0 0 1 2 2v16H5a2 2 0 0 1-2-2Zm0 15h16M7 4v12m3-9h5m-5 4h4"/>',
  settings:'<path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="2.8" fill="var(--surface,#212723)"/><circle cx="16" cy="17" r="2.8" fill="var(--surface,#212723)"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  'chevron-left':'<path d="m14 5-7 7 7 7"/>','chevron-right':'<path d="m9 5 7 7-7 7"/>','chevron-down':'<path d="m5 9 7 7 7-7"/>',
  'arrow-right':'<path d="M3 12h17m-6-6 6 6-6 6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 4v16M4 12h16"/>',
  swap:'<path d="M3 7h17l-4-4M21 17H4l4 4"/>',fusion:'<path d="m8 3 6 9-6 9-6-9Zm8 0 6 9-6 9-6-9Z"/>',
  skull:'<path d="M5 15a9 9 0 1 1 14 0l-2 2v4H7v-4Z"/><circle cx="8.5" cy="11" r="1.6"/><circle cx="15.5" cy="11" r="1.6"/><path d="m12 13-1 2h2Zm-2 5v3m4-3v3"/>',
  heart:'<path d="M12 21 3.4 12.5C-1 6 6 1 12 7c6-6 13-1 8.6 5.5Z"/>',
  shield:'<path d="m12 2 8 3v7q0 5-8 10-8-5-8-10V5Z"/><path d="M12 5v13"/>',
  breach:'<path d="m12 2 8 4v7l-4 6-4 3-7-6-1-10Z"/><path d="m13 3-4 7 6 1-5 9"/>',
  steps:'<ellipse cx="7" cy="9" rx="3" ry="5" transform="rotate(-20 7 9)"/><path d="m6 16 4-1 1 3-4 1Z"/><ellipse cx="17" cy="12" rx="2.5" ry="4.5" transform="rotate(18 17 12)"/><path d="m14 18 4 1-1 3-4-1Z"/>',
  moon:'<path d="M19 17A9 9 0 0 1 8 4a9 9 0 1 0 11 13Z"/><path d="m17 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
  check:'<path d="m3 13 6 6L21 5"/>',target:'<circle cx="12" cy="12" r="6"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
  key:'<circle cx="7" cy="8" r="4"/><path d="m10 11 10 10m-6-6 4-4m-1 7 3-3"/>',
  seal:'<path d="m12 2 8 5v10l-8 5-8-5V7Z"/><path d="m8 8 8 8m0-8-8 8"/>',
  coin:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.5"/><path d="m12 8 2 4-2 4-2-4Z"/>',
  quick:'<path d="m14 2-9 12h6l-1 8 9-13h-6Z" fill="currentColor"/>',
  'coin-back':'<path d="m4 14 10-10m-7 15L19 7m-7 14 9-9"/>',
  star:'<path d="m12 2 2 7 7 3-7 2-2 8-2-8-7-2 7-3Z"/>',
  layers:'<path d="m2 8 10-5 10 5-10 5Zm0 5 10 5 10-5m-20 5 10 5 10-5"/>',
};
export function icon(name, size=16) {
  return '<svg aria-hidden="true" width="'+Number(size)+'" height="'+Number(size)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round">'+(shapes[name] ?? shapes.star)+'</svg>';
}

export function inactiveQuickCoins(abilities = []) {
  if (!abilities.length) return '';
  const faces = abilities.map(({side}) => {
    const origin = abilities.length > 1 ? (side === 'base' ? '왼쪽 본체 ' : '오른쪽 재료 ') : '';
    const label = origin+'속공 · 뒷면 · 사용 불가';
    return '<span class="quick-coin" role="img" aria-label="'+label+'" title="'+label+'">'+icon('coin-back',16)+'</span>';
  });
  return '<span class="quick-coins">'+faces.join('')+'</span>';
}

export function guestAttackText(guest) {
  return ['adjacent','mirror','bossMirror','final'].includes(guest.pattern)
    ? guest.attackText + ' · 1~10층 안의 대상만 공격' : guest.attackText;
}

export function guestPortrait(guest) {
  const idx = /^N[1-6]$/.test(guest.id) ? Number(guest.id.slice(1))-1 : ({E1:1,E2:4})[guest.id] ?? 5;
  return '<span class="guest-portrait" aria-hidden="true" style="--gx:'+(idx%3)*50+'%;--gy:'+Math.floor(idx/3)*100+'%"></span>';
}

// The planner has already resolved guards, defense and early turn endings.
// Read its public strikes in order so the board and the die preview agree.
export function attackForecast(preview) {
  const byFloor = new Map();
  const damageByFloor = new Map();
  const steps = [];
  function mark(floor, kind, text) {
    if (!byFloor.has(floor)) byFloor.set(floor, []);
    const marks = byFloor.get(floor);
    const existing = marks.find(m => m.kind === kind && m.text === text);
    if (existing) existing.count++;
    else marks.push({kind, text, count: 1});
  }
  function recordDamage(floor, kind, {power, absorbed = 0, actual = 0}) {
    if (!damageByFloor.has(floor)) damageByFloor.set(floor, []);
    const strikes = damageByFloor.get(floor);
    const last = strikes.at(-1);
    if (last?.kind === kind && last.power === power && last.absorbed === absorbed && last.actual === actual) {
      last.count++;
    } else {
      strikes.push({kind, power, absorbed, actual, count: 1});
    }
  }
  for (const e of preview?.events ?? []) {
    if (e.type === 'miss') {
      mark(e.floor, 'miss', '빗나감');
      recordDamage(e.floor, 'miss', e);
      steps.push(e.floor+'층 빗나감');
    } else if (e.type === 'hit') {
      if (e.penalty) {
        mark(e.receiver, 'penalty', '비활동 피격');
      } else if (e.floor !== e.receiver) {
        mark(e.floor, 'redirect', '공격 → '+e.receiver+'층');
        mark(e.receiver, 'guard', '대리 피격');
        recordDamage(e.receiver, 'guard', e);
        steps.push(e.floor+'층 ('+e.receiver+'층 대리)');
      } else {
        mark(e.floor, 'hit', '공격');
        recordDamage(e.floor, 'hit', e);
        steps.push(e.floor+'층');
      }
    }
  }
  for (const u of preview?.uncertainties ?? []) {
    if (u.type === 'inactivity-target') {
      for (const {floor} of u.options) mark(floor, 'possible', '비활동 후보');
    }
  }
  return {byFloor, damageByFloor, steps};
}

// Gains belong to the guest's position at that moment. In particular, a guard
// on another floor can grant greed while the guest remains on the arrival floor.
export function guestGainForecast(preview, startFloor = 0) {
  const byFloor = new Map();
  let floor = startFloor, visit = 0;
  for (const event of preview?.events ?? []) {
    if (event.type === 'floor-visit') {
      floor = event.floor;
      visit++;
    } else if (event.type === 'gain' && event.amount > 0 && ['anxiety','greed','prophecy'].includes(event.resource)) {
      if (!byFloor.has(floor)) byFloor.set(floor, []);
      const gains = byFloor.get(floor);
      const existing = gains.find(g => g.visit === visit && g.resource === event.resource);
      if (existing) existing.amount += event.amount;
      else gains.push({visit, resource: event.resource, amount: event.amount});
    }
  }
  return byFloor;
}

export const tokenTypes = {
  anxiety:['불안','eye','수확 괴이가 소비해 공포로 바꾸거나 속공 비용으로 쓴다.'],
  greed:['탐욕','coin','네펜데스·따개비의 방어 속공 비용으로 쓴다.'],
  prophecy:['예언','star','주사위 조작이나 예언된 방문의 비용으로 쓴다.'],
  seal:['봉인','seal','괴이의 모든 효과를 막는다. 턴말마다 1 감소한다.'],
  ambush:['잠복','moon','이동 후 공격 전에 1 감소한다. 양수에서 0이 되면 해제 효과가 발생한다.'],
  defense:['방어','shield','이번 턴 받는 공격의 위력을 이 수치만큼 흡수한다.'],
  tokens:['파훼 토큰','breach','공략도가 한계에 닿을 때 하나 소모된다. 0이 되면 괴이가 파괴된다.'],
  souls:['영혼','soul','괴이를 구매하는 재화. 지갑의 잔액은 다음 막에 이월된다.'],
  heart:['심장','heart','공포가 한계에 도달하면 하나 소모된다. 마지막 심장을 제거하면 손님을 처치한다.'],
  stepBase:['도착 불안 누적','steps','발소리가 이 영업에서 쌓은 도착 불안 공급량.'],
  stepDonor:['B 도착 불안 누적','steps','B의 발소리 효과로 이 영업에서 쌓은 도착 불안 공급량.'],
};
export function token(kind, n) {
  const key = Object.hasOwn(tokenTypes,kind) ? kind : Object.keys(tokenTypes).find(k=>tokenTypes[k][0]===kind);
  const [name, glyph, description] = tokenTypes[key] ?? [kind,'star',''];
  return '<span class="token token-'+esc(key)+'" data-token="'+esc(key)+'" tabindex="0" role="button" aria-label="'+esc(name+' '+n+'개. '+description)+'" title="'+esc(name+' · '+description)+'">'+icon(glyph,15)+'<span>×'+esc(n)+'</span></span>';
}
const order=['gaze','steps','owner','mouse','portrait','ratKing','safe','nepenthes','barnacle','collector','runes','roulette','visit','prophet','samara'];
export function art(type, donor=null) {
  const layer=(key,half='')=>{
    const i=order.indexOf(key);
    if(i<0) return '';
    return '<span class="art-plane '+half+'" style="--ax:'+(i%5)*25+'%;--ay:'+Math.floor(i/5)*50+'%"></span>';
  };
  return '<span class="art-window" aria-hidden="true">'+layer(type,donor?'half-left':'')+(donor?layer(donor,'half-right'):'')+'</span>';
}
export const family=type=>order.indexOf(type)<6?'불안':order.indexOf(type)<10?'탐욕':'예언';
export const familyIcon=type=>({'불안':'eye','탐욕':'coin','예언':'star'})[family(type)];
