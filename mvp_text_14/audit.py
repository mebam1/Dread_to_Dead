"""Replay recorded decisions, summarize play, and link protection to later uses."""
from __future__ import annotations
from collections import Counter, deque
from copy import deepcopy
from pathlib import Path
import hashlib
import json

from engine import Game

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / 'runs'


def normalized(x):
    return json.loads(json.dumps(x, ensure_ascii=False))


def equal(a, b, label):
    if normalized(a) != normalized(b):
        raise AssertionError(label)


def advance(g):
    while g.phase in ('visitor_end', 'service_end', 'management'):
        if g.phase == 'management':
            g.start_service()
        else:
            g.advance()


def role(state, floor):
    owner = state['board'][floor - 1]
    if owner is None:
        return 'empty'
    return state['owned'][owner]['kind'] if state['owned'][owner]['p'] else 'P0:' + owner


def audit(path):
    saved = Game.load(path)
    if saved.phase not in ('complete', 'observed_stop'):
        raise AssertionError(f'{path.name}: unfinished {saved.phase}')
    g = Game.new(saved.seed, saved.variant, saved.stream)
    g.start_service()
    frames, current, stage = [], {}, 'intent'
    for event in saved.logs:
        kind = event['event']
        if kind == 'intent':
            assert stage == 'intent'
            g.record_intent(event['values'], event['reason'], event.get('actions', ()), event.get('arrival_target'), event.get('escape_floor'))
            equal(g.state(), event['state'], f'{path.name}: intent')
            current = dict(intent=deepcopy(event), events=[])
            stage = 'roll'
        elif kind == 'turn_start':
            assert stage == 'roll' and not event.get('forced')
            g.begin_turn()
            equal(g.state(), event['state'], f'{path.name}: roll')
            current['before'] = deepcopy(g.state())
            stage = 'decision'
        elif kind == 'manual_decision':
            assert stage == 'decision'
            equal(g.state(), event['before'], f'{path.name}: decision')
            current['decision'] = deepcopy(event)
            current['no_G_active'] = None
            actions = event.get('actions', ())
            if any(a[0] == 'G01' for a in actions):
                off = g.preview(event['value'], [a for a in actions if a[0] != 'G01'],
                                event.get('arrival_target'), escape_floor=event.get('escape_floor'))
                current['no_G_active'] = off.state()
                current['no_G_active_events'] = deepcopy(off.logs)
            n = len(g.logs)
            g.play(event['value'], actions, event.get('arrival_target'), event.get('escape_floor'))
            current['replay_events'] = deepcopy(g.logs[n:])
            stage = 'end'
        elif kind == 'turn_end':
            assert stage == 'end'
            equal(g.state(), event['state'], f'{path.name}: turn end')
            equal(current['replay_events'], current['events'] + [event], f'{path.name}: event trace')
            current['after'] = deepcopy(g.state())
            current['end'] = deepcopy(event)
            current.pop('replay_events')
            frames.append(current)
            current, stage = {}, 'intent'
            advance(g)
        elif stage == 'end':
            current['events'].append(deepcopy(event))
    equal(g.state(), saved.state(), f'{path.name}: final')
    assert stage == 'intent' and not saved.controlled
    assert len(frames) == sum(e['event'] == 'manual_decision' for e in saved.logs)

    uses, harvests, fifo = [], [], deque()
    last_guest = None
    for index, f in enumerate(frames):
        b = f['before']
        guest = (b['service'], b['visitor']['key'])
        if guest != last_guest:
            fifo.clear()
            if b['visitor']['A']:
                fifo.append(dict(source='initial', turn_index=-1, remaining=b['visitor']['A']))
            last_guest = guest
        for ordinal, event in enumerate(f['events']):
            uid = f'{path.stem}:{index}:{ordinal}'
            if event['event'] == 'visit' and event.get('supplied', 0):
                fifo.append(dict(source=event['target'], turn_index=index, remaining=event['supplied']))
                uses.append(dict(id=uid, turn_index=index, service=b['service'], guest=b['visitor']['key'],
                                 turn=b['visitor']['turn'], owner=event['target'], kind='supply', amount=event['supplied']))
            if event['event'] == 'visit' and event.get('consumed', 0):
                need, parts = event['consumed'], []
                while need:
                    lot = fifo[0]
                    take = min(need, lot['remaining'])
                    parts.append(dict(source=lot['source'], turn_index=lot['turn_index'], amount=take))
                    need -= take
                    lot['remaining'] -= take
                    if not lot['remaining']:
                        fifo.popleft()
                harvests.append(dict(id=uid, turn_index=index, service=b['service'], guest=b['visitor']['key'],
                                     turn=b['visitor']['turn'], owner=event['target'], consumed=event['consumed'],
                                     raw_fear=event['consumed'] * 4, supply_parts=parts))
            if event['event'] == 'fear' and event['amount'] > 0:
                uses.append(dict(id=uid, turn_index=index, service=b['service'], guest=b['visitor']['key'],
                                 turn=b['visitor']['turn'], owner=event['source'].split(':')[0],
                                 kind='fear', source=event['source'], amount=event['amount'],
                                 removed_H=event['before'][1]-event['after'][1]))
            if event['event'] == 'active' and event.get('kind') == 'G':
                uses.append(dict(id=uid, turn_index=index, service=b['service'], guest=b['visitor']['key'],
                                 turn=b['visitor']['turn'], owner='G01', kind='guard', target=event.get('target'),
                                 use_number=event['after']['g_uses']))

    guards, turns = [], []
    for index, f in enumerate(frames):
        b, a, d, intent = f['before'], f['after'], f['decision'], f['intent']
        events = f['events']
        arrivals = [e for e in events if e['event'] == 'visit' and e['mode'] == 'arrival']
        hits = [e for e in events if e['event'] == 'hit']
        ga = [e for e in events if e['event'] == 'active' and e.get('kind') == 'G']
        turn = dict(index=index, service=b['service'], guest=b['visitor']['key'], turn=b['visitor']['turn'],
                    before=b, after=a, dice=b['dice'], desired_floors=intent['floors'],
                    desired_roles=sorted({role(b, p) for p in intent['floors']}), intent_reason=intent['reason'],
                    decision=d, events=events, outcome=f['end']['outcome'],
                    actual_role=role(b, arrivals[-1]['floor']) if arrivals else 'no_arrival',
                    G_uses=[e['after']['g_uses'] for e in ga],
                    active_absorbed=sum(e.get('active_blocked', 0) for e in hits),
                    arrival_absorbed=sum(e.get('arrival_blocked', 0) for e in hits))
        turns.append(turn)
        if not ga:
            continue
        off = f['no_G_active']
        for target in sorted({e['target'] for e in ga}):
            protected = a['owned'][target]['p'] > off['owned'][target]['p']
            saved_life = off['owned'][target]['p'] == 0 and a['owned'][target]['p'] > 0
            later = [u for u in uses if u['turn_index'] > index and u['service'] == b['service'] and u['owner'] == target]
            sourced = [h for h in harvests if h['service'] == b['service'] and any(
                p['source'] == target and p['turn_index'] > index for p in h['supply_parts'])]
            guards.append(dict(turn_index=index, service=b['service'], guest=b['visitor']['key'],
                turn=b['visitor']['turn'], target=target,
                use_numbers=[e['after']['g_uses'] for e in ga if e['target']==target],
                blocked=sum(e.get('active_blocked',0) for e in hits if e['target']==target),
                actual_CP=[a['owned'][target]['c'],a['owned'][target]['p']],
                without_G_CP=[off['owned'][target]['c'],off['owned'][target]['p']],
                prevented_P_loss=protected, prevented_destruction=saved_life,
                later_uses=later, harvested_later_supply=sourced,
                causal_scope='All G actives omitted on this turn, same other actions/path. Attack-stage local comparison; future actual uses are linked, not an optimal alternative policy. Multiple guards can share one later event.'))
    return dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), seed=saved.seed,
                variant=saved.variant, final_state=saved.state(),
                replay=dict(states=True, full_events=True, intent_before_roll=True, keyed_dice=True),
                metadata=[e for e in saved.logs if e['event']=='run_metadata'],
                turns=turns, guards=guards, uses=uses, harvests=harvests)


def summarize(run):
    ts = run['turns']
    events = [e for t in ts for e in t['events']]
    guards = [e for e in events if e['event']=='active' and e.get('kind')=='G']
    absorbed_ids = {a['guard_id'] for e in events if e['event']=='hit' for a in e.get('absorption',[]) if a['amount']}
    return dict(file=run['file'], seed=run['seed'], variant=run['variant'], phase=run['final_state']['phase'],
        turns=len(ts), guest_turns=dict(Counter(t['guest'] for t in ts)),
        kills=sum(e['event']=='kill' for e in events), exits=sum(t['outcome']=='escape' for t in ts),
        breaks=sum(bool(e.get('broken')) for e in events if e['event'] in ('hit','penalty')),
        destroyed=sum(bool(e.get('destroyed')) for e in events if e['event'] in ('hit','penalty')),
        desired_roles=dict(Counter('/'.join(t['desired_roles']) or 'none' for t in ts)),
        arrival_roles=dict(Counter(t['actual_role'] for t in ts)),
        G_uses=sum(len(t['G_uses']) for t in ts), G_extra_uses=sum(n>2 for t in ts for n in t['G_uses']),
        charge_visits=sum(e['event']=='charge' for e in events),
        charges_gained=sum(e.get('gained',0) for e in events if e['event']=='charge'),
        charge_overflow=sum(e.get('overflow',0) for e in events if e['event']=='charge'),
        G_uses_without_absorption=sum(e['guard_id'] not in absorbed_ids for e in guards),
        active_absorbed=sum(t['active_absorbed'] for t in ts),
        arrival_absorbed=sum(t['arrival_absorbed'] for t in ts),
        penalty_events=sum(e['event']=='penalty' for e in events), cash=run['final_state']['cash'])


def main():
    runs = [audit(p) for p in sorted(RUNS.glob('normal_*.json')) if p.name != 'normal_summary.json']
    summary = [summarize(r) for r in runs]
    pairs = []
    for seed in (14001,14002,14003):
        selected = [r for r in runs if r['seed']==seed]
        if len(selected)==2:
            left, right = [{(t['service'],t['guest'],t['turn']):t['dice'] for t in r['turns']} for r in selected]
            shared = set(left)&set(right)
            assert all(left[k]==right[k] for k in shared)
            pairs.append(dict(seed=seed, shared_turns=len(shared), matched=True))
    result = dict(summary=summary, runs=runs,
                  paired_dice=pairs,
                  note='FIFO supply attribution is bookkeeping, not a new game rule. Do not sum overlapping guard-linked attacks.')
    RUNS.mkdir(exist_ok=True)
    (RUNS/'normal_summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    lines=['# 정상 플레이 선택 기록', '', '진행·플레이 모두 AI. 정상 난수와 눈 공개 전 희망을 재생 검사했다.', '']
    for r in runs:
        lines += [f"## {r['seed']} {r['variant']}", '']
        for t in r['turns']:
            lines += [f"### {t['guest']} 턴 {t['turn']}",
                      f"- 눈 전 희망 {t['desired_floors']}: {t['intent_reason']}",
                      f"- 공개 눈 {t['dice']}, 선택 {t['decision']['value']}, 액티브 {t['decision'].get('actions',[])}", 
                      f"- 선택 이유: {t['decision']['reason']}",
                      f"- 결과: {t['outcome']}, F/H/A={t['after']['visitor']['F']}/{t['after']['visitor']['H']}/{t['after']['visitor']['A']}, G잔량 {t['after']['owned']['G01']['charges']}, 영업 누적 {t['after']['g_uses']}", '']
    (RUNS/'normal_turns.md').write_text('\n'.join(lines), encoding='utf-8')
    links = ['# G 액티브 보호와 후속 사용', '',
             '같은 턴 G 액티브를 생략한 국소 비교다. C13 도착 방어는 흡수 합계에는 포함하지만 이 생략 표에서는 제외한다. 다른 행동·경로는 고정한다. 후속 사용은 실제 기록이며 최적 대안의 부재를 뜻하지 않는다. 같은 후속 공격을 여러 보호 사건에 중복 합산하지 않는다.', '',
             '| 실행 | 보호 턴 | 대상 / 영업 사용 번호 | 실제 흡수 | 실제 C/P → 방어 생략 C/P | 파괴 방지 | 이후 실제 사용 |',
             '|---|---|---|---:|---|---|---|']
    for r in runs:
        for guard in r['guards']:
            later = '; '.join(f"{u['guest']} T{u['turn']} {u['kind']} {u.get('amount', u.get('target',''))}" for u in guard['later_uses']) or '없음'
            links.append(f"| {r['seed']} {r['variant']} | {guard['guest']} T{guard['turn']} | {guard['target']} / {guard['use_numbers']} | {guard['blocked']} | {guard['actual_CP']} → {guard['without_G_CP']} | {'예' if guard['prevented_destruction'] else '아니오'} | {later} |")
    links += ['', 'U의 후속 공급이 어느 Q 수확에 소비됐는지는 normal_summary.json의 harvested_later_supply에 연결했다. FIFO는 공급 출처를 표시하는 회계 방법이며 새 게임 규칙이나 유일한 인과 배분은 아니다.']
    (RUNS/'protection_links.md').write_text('\n'.join(links), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
