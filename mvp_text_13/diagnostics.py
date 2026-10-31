"""Specified, controlled config-13 checks; not normal play or preference data."""
from __future__ import annotations
from copy import deepcopy
from itertools import product
from pathlib import Path
import hashlib
import json

from engine import Game

ROOT = Path(__file__).resolve().parent
VARIANTS = ('M0', 'MU', 'MG', 'MUG')


def make_case(name, variant='MUG', seed=13001):
    if name not in ('D1', 'D2', 'D3', 'D4', 'D5'):
        raise ValueError('Unknown diagnostic')
    g = Game.new(seed=seed, variant=variant, stream=name)
    g.start_service()
    fixed = name in ('D1', 'D2')
    spec = dict(key=name, name=name, T=12 if fixed else 16, H=1,
                pattern='fixed' if fixed else 'path', power=6, reward=2)
    if fixed:
        spec['attacks'] = [[3, 6]]
    g.start_guest(spec)
    g.owned['B01'].charges = 0
    g.owned['G01'].charges = 2 if name == 'D5' else 0
    if name == 'D2':
        g.visitor['A'] = 1
    if not fixed:
        g.owned['U01'].c, g.owned['U01'].p = 6, 1
    if name == 'D4':
        g.visitor['F'] = 8
    g.controlled = True
    g.emit('diagnostic_setup', diagnostic=name, state=g.state())
    g.begin_turn(forced=[1, 2, 3])
    return g


def compact(g):
    return dict(phase=g.phase, F=g.visitor['F'], H=g.visitor['H'], A=g.visitor['A'],
                position=g.visitor['p'], cash=g.cash,
                assets={i: dict(C=e.c, P=e.p, charges=e.charges)
                        for i, e in g.owned.items()})


def expected(name, variant, value):
    """Literal arithmetic from the published diagnostic table, independent of engine."""
    supplied = 4 if variant in ('MU', 'MUG') else 1
    guarded = variant in ('MG', 'MUG')
    risky = name in ('D3', 'D4')
    rich = name == 'D2'
    kill = value == 3 and name in ('D2', 'D4')
    a = supplied + int(rich) if value == 1 else (2 + int(rich) if value == 2 else 0)
    f = 0 if kill else (8 if value == 3 or name == 'D4' else 0)
    assets = {'U01': (0, 2), 'G01': (0, 2), 'Q01': (0, 2), 'Q02': (0, 2), 'B01': (0, 1)}
    if risky:
        assets['U01'] = (6, 1) if kill or (value == 2 and guarded) else (0, 0)
        if not kill:
            if value >= 2:
                assets['G01'] = (6, 2)
            if value == 3:
                assets['Q01'] = (6, 2)
    elif not kill:
        assets['Q01'] = (0, 2) if value == 2 and guarded else (6, 2)
    return dict(A=a, F=f, H=0 if kill else 1, cash=2 if kill else 0,
                phase='visitor_end' if kill else 'turn_ready', assets=assets)


def table_checks():
    rows = []
    for name in ('D1', 'D2', 'D3', 'D4'):
        for variant in VARIANTS:
            for value in (1, 2, 3):
                g = make_case(name, variant)
                before = g.state()
                target = ('Q01' if name in ('D1', 'D2') else 'U01') if value == 2 and variant in ('MG', 'MUG') else None
                g.play(value, arrival_target=target)
                result = compact(g)
                actual = {k: result[k] for k in ('A', 'F', 'H', 'cash', 'phase')}
                actual['assets'] = {i: (e.c, e.p) for i, e in g.owned.items()}
                want = expected(name, variant, value)
                assert actual == want, (name, variant, value, actual, want)
                rows.append(dict(case=name, variant=variant, value=value, arrival_target=target,
                                 before=before, after=g.state(), expected=want,
                                 events=deepcopy(g.logs), passed=True))
    return rows


def active_comparisons():
    rows = []
    for variant in ('M0', 'MG', 'MUG'):
        for label, value, uses in [('Q+active', 3, 1), ('G+arrival', 2, 0)]:
            g = make_case('D5', variant)
            target = 'U01' if value == 2 and variant in ('MG', 'MUG') else None
            before = g.state()
            actions = [('G01', 'U01')] * uses
            g.play(value, actions, arrival_target=target)
            up = (6, 1) if uses or variant in ('MG', 'MUG') else (0, 0)
            actual = (g.visitor['F'], g.visitor['A'], g.owned['U01'].c,
                      g.owned['U01'].p, g.owned['G01'].charges,
                      g.owned['G01'].c, g.owned['Q01'].c)
            want = ((8, 0) if value == 3 else (0, 2)) + up + (2 - uses, 6, 6 if value == 3 else 0)
            assert actual == want, (variant, label, actual, want)
            rows.append(dict(case='D5', variant=variant, label=label, before=before,
                             after=g.state(), expected=want, events=deepcopy(g.logs), passed=True))
    g = make_case('D5', 'M0')
    g.play(2, [('G01', 'U01')])
    assert (g.owned['U01'].c, g.owned['U01'].p, g.owned['G01'].charges) == (6, 1, 1)
    rows.append(dict(case='D5', variant='M0', label='G+active_required',
                     after=g.state(), events=deepcopy(g.logs), passed=True))
    return rows


def opportunity_checks():
    results = []
    for variant, value, expected_faces, expected_count in [('MUG', 1, [2, 4], 152), ('MUG', 3, [6], 91), ('M0', 1, [], 0)]:
        g = make_case('D1', variant)
        g.play(value)
        good = []
        for distance in range(1, 7):
            target = 'Q01' if variant == 'MUG' and g.path(distance)[-1] == 2 else None
            after = g.preview(distance, arrival_target=target, hypothetical=True)
            if after.visitor['H'] == 0:
                good.append(distance)
        count = sum(any(x in good for x in dice) for dice in product(range(1, 7), repeat=3))
        assert good == expected_faces and count == expected_count, (variant, value, good, count)
        results.append(dict(variant=variant, first_choice=value, winning_next_faces=good,
                            winning_next_rolls=count, possible_rolls=216,
                            scope='next turn only, no forecast of actual future dice'))
    return results


def main():
    rows = table_checks() + active_comparisons()
    chances = opportunity_checks()
    sources = [ROOT/'engine.py', ROOT/'diagnostics.py', ROOT.parent/'rules.md',
               ROOT.parent/'undecided.md', ROOT.parent/'mvps'/'mvp-config-13.md']
    payload = dict(mode='controlled_specification_checks', seed=13001,
                   checked_branches=len(rows), checks_passed=True,
                   note='D0 boundaries are verified by test_engine.py. These results are not normal campaigns or player preference.',
                   hashes={str(p.relative_to(ROOT.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
                   branches=rows, next_turn_opportunities=chances)
    runs = ROOT/'runs'
    runs.mkdir(exist_ok=True)
    (runs/'diagnostics.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = '# Config 13 통제 판정 검사\n\n'
    summary += f'D1~D4 네 군의 48개 단일 턴 분기와 D5의 7개 비교: **{len(rows)}개 통과**. D0 경계 검사는 `test_engine.py`에서 별도로 수행한다.\n\n'
    summary += '이는 명세의 확정 계산이며 정상 난수의 캠페인이나 도착 선호·재미의 증거가 아니다. 후속 7분기 운영은 별도 기록한다.\n\n'
    summary += '| D1 첫 선택 | 다음 턴 처치 가능한 눈 | 216개 주사위 묶음 중 처치 가능 |\n|---|---|---:|\n'
    for row in chances:
        summary += f"| {row['variant']} 눈{row['first_choice']} | {row['winning_next_faces']} | {row['winning_next_rolls']}/216 |\n"
    summary += '\n공급 준비가 다음 한 턴의 처치 기회를 넓히는 사례다. 전체 완주 확률이나 항상 우세한 전략을 뜻하지 않는다.\n'
    (runs/'diagnostics.md').write_text(summary, encoding='utf-8')
    print(json.dumps(dict(branches=len(rows), next_turn_opportunities=chances), ensure_ascii=False))


if __name__ == '__main__':
    main()
