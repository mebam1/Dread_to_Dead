// Smoke-play the three published seeds through the same decisions and previews as the CLI.
import {createGame, execute, growthReport, previewBattle, publicView} from './engine.mjs';

function value(type, hotel) {
  const priority = {gaze: 13, owner: 14, safe: 11, steps: 10, ratKing: 8, mouse: 7,
    portrait: 6, collector: 6, nepenthes: 5, barnacle: 5, visit: 4};
  const count = hotel.reduce((total, e) => total + Number(e.type === type) + Number(e.donor === type), 0);
  return (priority[type] ?? 3) - 4 * count;
}

function scorePreview(view, preview) {
  if (preview.outcome === 'loss') return -10000;
  if (preview.outcome === 'win' || preview.outcome === 'guest-kill') return 10000;
  const before = view.battle;
  const after = preview.after.battle;
  const fearProgress = (before.hearts - after.hearts) * before.guest.t + after.fear - before.fear;
  let score = 4 * fearProgress;
  score += (after.anxiety - before.anxiety) * 0.9 + (after.prophecy - before.prophecy) * 0.1;
  for (const hit of preview.events.filter(event => event.type === 'hit')) {
    score -= hit.actual * 0.4;
    if (hit.breached) score -= 6;
    if (hit.destroyed) score -= 18;
  }
  return score - preview.uncertainties.filter(item => item.type === 'inactivity-target').length * 3;
}

function pick(view, preview) {
  const living = view.floors.filter(Boolean);
  const sorted = (list, score) => [...list].sort((a, b) => score(b) - score(a));
  const decision = (cmd, args, reason) => ({cmd, args, reason});
  switch (view.phase) {
    case 'map': {
      const weights = {boss: 10, recovery: 6, fusion: 9, shop: view.souls >= 3 ? 8 : 3, elite: 5, normal: 4, event: 2};
      const choices = sorted(view.map.filter(node => node.reachable), node => weights[node.kind]);
      return decision('visit', [choices[0].id], '현재 지갑과 연결된 융합·정비 기회 비교');
    }
    case 'management': return decision('start', [], '현재 배치로 영업');
    case 'choose': {
      const slot = sorted([1, 2, 3], slot => scorePreview(view, preview(slot)))[0];
      return decision('choose', [slot], '공개 예고의 공포·불안과 피격 손실 비교');
    }
    case 'prepare': {
      const safe = living.find(e => (e.type === 'safe' || e.donor === 'safe') && e.ambush === 0 && e.seal === 0);
      if (safe) return decision('active', [safe.id, safe.type === 'safe' ? 'base' : 'donor'], '금고 도착 시 잠복 해제 공포 준비');
      return decision('move', [], '확정 경로 실행');
    }
    case 'fusion': {
      const materials = living.filter(e => !e.fusion);
      if (materials.length < 2) return decision('skip', [], '재료 부족');
      const body = sorted(materials, e => value(e.type, []) + Number(e.upgraded))[0];
      const partner = sorted(materials.filter(e => e !== body), e => value(e.type, []) + Number(e.upgraded))[0];
      return decision('fuse', [body.id, partner.id], '두 원본의 본 효과를 같은 층에서 사용');
    }
    case 'shop': {
      const offer = sorted(view.shop.filter(item => !item.sold && item.price <= view.souls),
        item => value(item.type, living))[0];
      if (offer && living.length < 10) return decision('buy', [offer.slot], '비어 있는 층의 역할 보강');
      return decision('leave', [], '현재 예산·배치로 정산');
    }
    case 'recovery': {
      const hurt = living.filter(e => e.tokens < e.maxTokens);
      if (hurt.length) return decision('heal', hurt.slice(0, 2).map(e => e.id), '손상된 파훼 토큰 회복');
      const target = sorted(living.filter(e => !e.upgraded), e => value(e.type, []))[0];
      return target ? decision('upgrade', [target.id], '주력 개체의 강화') : decision('skip', [], '강화 대상 없음');
    }
    case 'reward': {
      const type = sorted(view.rewards, type => value(type, living))[0];
      return decision('reward', [view.rewards.indexOf(type) + 1], '부족한 공급·수확 역할 우선');
    }
    case 'acquisition': {
      let floor = view.floors.indexOf(null) + 1;
      if (!floor) {
        const worst = sorted(living.filter(e => !e.fusion), e => -value(e.type, living))[0];
        if (!worst || value(worst.type, living) >= value(view.pending.entity.type, living)) {
          return decision('discard', [], '기존 조합 보존');
        }
        floor = view.floors.indexOf(worst) + 1;
      }
      return decision('place', [floor], '호텔에 즉시 배치');
    }
    case 'die':
    case 'event': {
      const slot = view.dice.indexOf('normal') + 1;
      if ((view.offerDie || view.event?.die) && slot) return decision('equip', [slot], '일반 주사위 교체');
      if (view.event?.kind === 'room' && view.souls >= 3) return decision('deal', [], '공개 괴이 구입');
      if (view.event?.kind === 'luggage' && view.event.payout) return decision('cash', [], '영혼 확보');
      return decision('skip', [], '제시된 교체·거래를 건너뜀');
    }
    default: throw new Error('처리되지 않은 결정 단계: ' + view.phase);
  }
}

let reachedFinalSettlement = false;
for (const seed of [31001, 31002, 31003]) {
  const state = createGame(seed);
  let view = publicView(state);
  let decisions = 0;
  while (view.phase !== 'won' && view.phase !== 'lost') {
    if (++decisions > 5000) throw new Error(seed + ' 검증의 결정 횟수 초과');
    const {cmd, args, reason} = pick(view, slot => previewBattle(state, slot));
    view = execute(state, cmd, args, reason);
    if (view.floors.length !== 10 || view.actIncome < 0 || view.actIncome > 9 || view.souls < 0) {
      throw new Error(seed + ' 호텔·영혼 장부 오류');
    }
  }
  const count = type => state.journal.filter(event => event.type === type).length;
  if (view.phase === 'won') {
    if (view.visited.length !== 24 || view.pending !== null) throw new Error('최종 보상 처리 전 승리');
    reachedFinalSettlement = true;
  }
  const report = growthReport(state);
  const balance = report.acts.reduce((wallet, act) =>
    wallet + act.grant + act.earned - act.purchases.reduce((sum, purchase) => sum + purchase.paid, 0), 0);
  if (balance !== view.souls) throw new Error('실제 잔액과 성장 보고서의 입출금이 다릅니다.');
  console.log(JSON.stringify({seed, outcome: view.result, visits: view.visited.length,
    moves: state.journal.filter(e => e.type === 'decision' && e.command === 'move').length,
    kills: count('kill'), fusions: count('fusion'), purchases: count('purchase'),
    lostCreatures: count('destroy'), souls: view.souls,
    acts: report.acts.map(act => ({act: act.act, earned: act.earned,
      purchases: act.purchases.length, fusions: act.fusions.length}))}));
}
if (!reachedFinalSettlement) throw new Error('세 판에서 최종 보상·승리 경계까지 도달하지 못했습니다.');
