"""Transparent, fixed current-turn policy for paired continuations, not a future solver."""
from itertools import combinations_with_replacement
from engine import Game

WEIGHTS = {"U": (22, 65), "Q": (14, 32), "B": (18, 35), "G": (12, 28), "E": (19, 44), "R": (10, 22)}

def active_options(g, value):
    bell = next((i for i in g.board if i and i[0] == "B" and g.living(i)), None)
    guard = next((i for i in g.board if i and i[0] == "G" and g.living(i)), None)
    repair = next((i for i in g.board if i and i[0] == "R" and g.living(i)), None)
    repairs = [()]
    if repair:
        targets = sorted(i for i in g.board if i and g.living(i) and g.owned[i].c > 0)
        for n in range(1, g.visitor["A"] // 2 + 1):
            for seq in combinations_with_replacement(targets, n):
                if all(seq.count(i) <= (g.owned[i].c + 5) // 6 for i in set(seq)):
                    repairs.append(seq)
    guards = [()]
    if guard:
        attacked = {g.board[f - 1] for f, _ in g.attack_list(g.path(value))}
        targets = sorted(i for i in attacked if i and g.living(i))
        for n in range(1, g.owned[guard].charges + 1):
            guards.extend(combinations_with_replacement(targets, n))
    for b in range((g.owned[bell].charges if bell else 0) + 1):
        for rs in repairs:
            for gs in guards:
                yield [(bell, None)] * b + [(repair, i) for i in rs] + [(guard, i) for i in gs]

def progress(v):
    return 0 if v["H"] == 0 else (v["H"] - 1) * v["T"] + v["T"] - v["F"]

def score(before, after, next_visitor):
    v, w = before.visitor, after.visitor
    value = 2 * (progress(v) - progress(w)) + 1.4 * (w["A"] - v["A"])
    killed = w["H"] == 0
    value += 100 if killed else 0
    value -= 500 if after.phase == "failed" else 0
    # C vanishes at a visitor boundary; P/charges matter until service boundary.
    future_assets = next_visitor or not killed
    for i, e in before.owned.items():
        f = after.owned[i]
        pw, dw = WEIGHTS[e.kind]
        if future_assets:
            value -= pw * (e.p - f.p)
            if e.p > 0 and f.p == 0:
                value -= dw
        if not killed:
            value -= 0.65 * (f.c - e.c)
        if e.kind == "B":
            value -= (15 if next_visitor else 4) * (e.charges - f.charges)
        if e.kind == "G":
            value -= (7 if next_visitor else 2) * (e.charges - f.charges)
    return value

def choose_turn(g, next_visitor=True):
    if g.phase != "choice":
        raise ValueError("Policy sees only an already rolled current turn")
    candidates = []
    for value in sorted(set(g.dice)):
        for actions in active_options(g, value):
            after = g.preview(value, actions)
            s = score(g, after, next_visitor)
            candidates.append((s, -len(actions), -value, value, actions, after))
    best = max(candidates, key=lambda x: x[:3])
    s, _, _, value, actions, after = best
    reason = dict(policy="current-turn-v1", next_visitor=next_visitor,
                  score=round(s, 3), current_dice=g.dice.copy(),
                  predicted_phase=after.phase, predicted_visitor=after.visitor,
                  alternatives=[dict(value=x[3], actions=x[4], score=round(x[0], 3))
                                for x in sorted(candidates, key=lambda x: x[:3], reverse=True)[:3]])
    return value, actions, reason

def run_guest(g, next_visitor=True):
    while g.phase in ("turn_ready", "choice"):
        if g.phase == "turn_ready":
            g.begin_turn()
        value, actions, reason = choose_turn(g, next_visitor)
        g.emit("decision", chosen=value, actions=actions, reason=reason)
        g.play(value, actions)
    return g
