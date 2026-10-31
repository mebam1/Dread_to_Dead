"""Config 14 controlled play: explicit expected outcomes, never normal preference data."""
from __future__ import annotations

from copy import deepcopy
from itertools import product
from pathlib import Path
import hashlib
import json

from engine import Game

ROOT = Path(__file__).resolve().parent


def base(case, *, variant='M14', T=16, attacks=((3, 6),)):
    g = Game.new(14001, variant, stream=case)
    g.start_service()
    g.start_guest(dict(key=case, name=case, T=T, H=1, pattern='fixed',
                       attacks=list(attacks), power=6, reward=2))
    g.controlled = True
    g.owned['B01'].charges = 0
    return g


def snapshot(g):
    return dict(phase=g.phase, position=g.visitor['p'], F=g.visitor['F'],
                H=g.visitor['H'], A=g.visitor['A'], cash=g.cash,
                idle=[g.idle_count, g.idle_limit], g_uses=g.g_uses,
                assets={i: dict(C=e.c, P=e.p, charges=e.charges) for i, e in g.owned.items()})


def turn(g, value, actions=(), dice=None, **kwargs):
    before = g.state()
    start = len(g.logs)
    g.begin_turn(forced=list(dice or [value] * 3))
    g.play(value, actions, **kwargs)
    return dict(before=before, value=value, actions=list(actions), after=g.state(),
                events=deepcopy(g.logs[start:]))


def d1(variant='M14', F=0, C=0, charges=0):
    g = base('D1', variant=variant)
    g.visitor.update(p=1, A=3, F=F)
    g.owned['Q01'].p = 1
    g.owned['Q01'].c = C
    g.owned['G01'].charges = charges
    g.emit('diagnostic_setup', state=g.state())
    return g


def d1_sequences():
    rows = []
    for label, variant, first in [('charge_G', 'M14', 1), ('no_charge_G', 'C14', 1), ('Q_first', 'M14', 2)]:
        g = d1(variant)
        trace = [turn(g, first, dice=[1, 2, 2])]
        if first == 1:
            assert (g.visitor['A'], g.visitor['F'], g.owned['Q01'].c, g.owned['Q01'].p) == (3, 0, 6, 1)
        else:
            assert (g.visitor['A'], g.visitor['F'], g.owned['Q01'].c, g.owned['Q01'].p) == (0, 12, 6, 1)
        actions = [('G01', 'Q01')] if variant == 'M14' and first == 1 else []
        trace.append(turn(g, 1, actions))
        assert g.visitor['F'] == 12
        assert g.owned['Q01'].p == int(bool(actions))
        if first == 1:
            trace.append(turn(g, 6))
            if variant == 'M14':
                assert (g.visitor['H'], g.visitor['A'], g.cash, g.owned['Q01'].p) == (0, 0, 2, 1)
            else:
                assert (g.visitor['H'], g.visitor['F'], g.visitor['A'], g.cash) == (1, 12, 2, 0)
        rows.append(dict(case='D1', label=label, turns=trace, final=snapshot(g), passed=True))
    # State changes specified by config, with and without using existing protection.
    for label, changes in [('F4', dict(F=4)), ('C6', dict(C=6)), ('G1', dict(charges=1)), ('G2', dict(charges=2))]:
        for distance in (1, 2):
            for protect in ([False, True] if label in ('G1', 'G2') else [False]):
                g = d1(**changes)
                actions = [('G01', 'Q01')] if protect else []
                trace = [turn(g, distance, actions, dice=[1, 2, 2])]
                kill = label == 'F4' and distance == 2
                assert (g.visitor['H'] == 0) == kill
                assert g.owned['Q01'].p == (0 if label == 'C6' else 1)
                if not kill and label != 'C6':
                    assert g.owned['Q01'].c == (0 if protect else 6)
                if label in ('G1', 'G2'):
                    expected = min(2, changes['charges'] - int(protect) + int(distance == 1))
                    assert g.owned['G01'].charges == expected
                rows.append(dict(case='D1_state', label=f'{label}_distance{distance}_guard{int(protect)}',
                                 turns=trace, final=snapshot(g), passed=True))
    return rows


def next_roll_opportunities():
    """Enumerate actual legal next actions per each of the 216 public roll tuples."""
    rows = []
    for label, variant, first in [('charge_G', 'M14', 1), ('no_charge_G', 'C14', 1), ('Q_first', 'M14', 2)]:
        g = d1(variant)
        turn(g, first, dice=[1, 2, 2])
        outcomes = {}
        for distance in range(1, 7):
            plans = [[]]
            if g.owned['G01'].charges:
                plans += [[('G01', target)] for target in g.board if target and g.living(target)]
            outcomes[distance] = []
            for actions in plans:
                branch = g.clone()
                turn(branch, distance, actions)
                outcomes[distance].append(dict(actions=actions, kill=branch.visitor['H'] == 0,
                    Q01_alive=branch.owned['Q01'].p > 0, g_charges=branch.owned['G01'].charges,
                    F=branch.visitor['F'], H=branch.visitor['H'], A=branch.visitor['A']))
        count_kill = count_alive = count_both = 0
        roll_rows = []
        for dice in product(range(1, 7), repeat=3):
            legal = [(face, outcome) for face in sorted(set(dice)) for outcome in outcomes[face]]
            kill = any(o['kill'] for _, o in legal)
            alive = any(o['Q01_alive'] for _, o in legal)
            both = any(o['kill'] and o['Q01_alive'] for _, o in legal)
            count_kill += kill
            count_alive += alive
            count_both += both
            roll_rows.append(dict(dice=dice, kill_possible=kill, Q01_alive_possible=alive,
                                 same_action_both=both))
        expected = {'charge_G': (0, 216, 0), 'no_charge_G': (0, 0, 0), 'Q_first': (91, 91, 91)}[label]
        assert (count_kill, count_alive, count_both) == expected
        rows.append(dict(case='D1_216', label=label, possible_rolls=216,
                         kill_possible=count_kill, Q01_alive_possible=count_alive,
                         same_action_both=count_both, face_actions=outcomes, rolls=roll_rows, passed=True))
    return rows


def d2_loop():
    rows = []
    for use in (True, False):
        g = Game.new(14001, 'M14', stream='D2')
        g.start_service()
        g.start_guest(dict(key='V4', T=16, H=2, pattern='offset', power=8, reward=2))
        g.visitor['p'] = 2
        for i, e in g.owned.items():
            if i != 'G01':
                e.p = 0
        g.owned['G01'].charges = 1
        g.controlled = True
        g.emit('diagnostic_setup', state=g.state())
        trace = []
        for _ in range(7):
            trace.append(turn(g, 6, [('G01', 'G01')] if use else []))
            if use:
                assert (g.visitor['F'], g.visitor['A'], g.owned['G01'].p, g.owned['G01'].c,
                        g.owned['G01'].charges, g.idle_count) == (0, 0, 2, 0, 1, 0)
        penalties = [x for x in g.logs if x['event'] == 'penalty']
        if use:
            assert not penalties
            assert g.g_uses == 7
            assert sum(x.get('blocked', 0) for x in g.logs if x['event'] == 'hit') == 0
        else:
            assert g.owned['G01'].p == 0
        rows.append(dict(case='D2', label='active_charge_loop' if use else 'charge_only',
                         turns=trace, final=snapshot(g), penalties=penalties, passed=True))
    return rows


def d5_support():
    rows = []
    for target, floor, position, next_value in [('U01', 1, 2, 6), ('B01', 6, 3, 2)]:
        modes = ['protect', 'omit'] + (['bell_first_sacrifice'] if target == 'B01' else [])
        for mode in modes:
            g = base('D5_' + target, T=12, attacks=((floor, 6),))
            g.visitor['p'] = position
            g.owned['G01'].charges = 1
            g.owned[target].c, g.owned[target].p = 6, 1
            g.owned['B01'].charges = int(target == 'B01')
            g.emit('diagnostic_setup', state=g.state())
            actions = [('G01', target)] if mode == 'protect' else [('B01', None)] if mode == 'bell_first_sacrifice' else []
            trace = [turn(g, 1, actions)]
            assert g.owned[target].p == int(mode == 'protect')
            actions = [('B01', None)] if target == 'B01' and mode == 'protect' else []
            trace.append(turn(g, next_value, actions))
            expected_f = 8 if mode == 'protect' else 6 if mode == 'bell_first_sacrifice' else 0
            assert g.visitor['F'] == expected_f
            assert g.owned[target].p == 0  # the preserved action occurs before the next lethal hit
            rows.append(dict(case='D5', label=f'{target}_{mode}', turns=trace,
                             final=snapshot(g), passed=True))
    return rows


def main():
    sequences = d1_sequences() + d2_loop() + d5_support()
    opportunities = next_roll_opportunities()
    sources = [ROOT/'engine.py', ROOT/'diagnostics.py', ROOT.parent/'rules.md',
               ROOT.parent/'undecided.md', ROOT.parent/'mvps/mvp-config-14.md']
    payload = dict(mode='specified_controlled_diagnostics',
                   note='Forced states and dice; these are not normal play, preference, or win-rate samples.',
                   hashes={str(p.relative_to(ROOT.parent)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
                   sequences=sequences, opportunities=opportunities)
    out = ROOT/'runs'
    out.mkdir(exist_ok=True)
    (out/'diagnostics.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Config 14 통제 진단 결과', '',
             '강제 상태·강제 눈을 사용하는 판정 및 작동 검사다. 정상 플레이·인간 선호·전체 승률과 합산하지 않는다.', '',
             f'- 고정 진행 {len(sequences)}분기, 총 {sum(len(r["turns"]) for r in sequences)}턴의 기대값 확인.',
             '- D1: 충전→Q 보호 후 다음 턴 추가 수확8로 처치. 같은 경로의 충전 없음은 F12/H1·A2가 남음.',
             '- D1의 보호 턴 수확12는 양쪽 모두 실행하므로 방어 기여로 세지 않음.',
             '- D2: 액티브→재충전7턴 동안 실제 흡수0·공포0·G잔량1·비활동0 유지. 충전만 하면 G는 패널티로 파괴.',
             '- D5: 보호한 U는 다음 턴 A2→공포8. 보호한 B는 다음 턴 액티브6+도착2. B 선사용 희생은 공포6.', '',
             '| D1 첫 선택 | 다음216묶음 중 처치 가능 | Q01 보존 가능 | 같은 행동으로 둘 다 |',
             '|---|---:|---:|---:|']
    for r in opportunities:
        lines.append(f'| {r["label"]} | {r["kill_possible"]}/216 | {r["Q01_alive_possible"]}/216 | {r["same_action_both"]}/216 |')
    lines += ['', '가능한 최선의 한 행동이 존재하는 묶음 수다. 서로 다른 행동의 이익을 합치지 않는다. 실제 미래 눈은 조회하지 않았다.', '',
              '전체 상태·선택·타격·공포·충전·패널티 사건은 [diagnostics.json](diagnostics.json)에 보관한다.']
    (out/'diagnostics.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(json.dumps(dict(sequences=len(sequences), turns=sum(len(r['turns']) for r in sequences),
                         roll_enumerations=len(opportunities)*216, checks='PASS'), ensure_ascii=False))


if __name__ == '__main__':
    main()
