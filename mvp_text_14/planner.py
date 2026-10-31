"""Fixed PUBLIC-information policy for controlled continuations only.

This is deliberately a one-turn heuristic, not the normal manual AI player or
an optimal campaign solver.  It never reads seed/stream or asks for future dice.
Random penalty cost is averaged over public eligible targets, never previewed.
"""
from __future__ import annotations

from copy import deepcopy
from itertools import combinations_with_replacement

POLICY_META = {
    "version": "public-one-turn-control14-v2",
    "revision": "Terminal escape gives no credit for unearned fear. Earlier v1 pilot is excluded; normal manual campaigns unaffected.",
    "horizon": "one revealed turn plus explicit asset/resource values",
    "weights": {"fear_progress": 12, "kill": 1200, "immediate_kill_bonus": 80,
                "anxiety_first_three": 10, "anxiety_remaining": 4,
                "current_C": 1, "G_reserve": 35, "B_reserve": 45,
                "turn_cost": 8, "escape_guest_nominal_fear": 12,
                "escape_skipped_next_guest": 200},
    "P_loss_destroy_weights": {"U": [80, 240], "Q": [50, 120],
                              "B": [60, 120], "G": [45, 100]},
    "random_penalty": "Expected direct C/P cost across visible living targets; no actual target queried",
    "guard_plans": "All useful incoming-hit allocations, plus one no-hit shield to expose legal activity reset",
    "limits": "A heuristic control policy, not a full-run optimizer or evidence of human preference. Fixed before control runs.",
}


def remaining(g):
    v = g.visitor
    return 0 if v["H"] == 0 else v["H"] * v["T"] - v["F"]


def living(g):
    return [i for i in g.board if i and g.living(i)]


def _bell_kills(g, count):
    fear, hearts = g.visitor["F"], g.visitor["H"]
    for _ in range(count):
        fear += 6
        if fear >= g.visitor["T"]:
            hearts, fear = hearts - 1, 0
        if hearts == 0:
            return True
    return False


def action_plans(g, value):
    alive = living(g)
    bell = "B01" if "B01" in alive else None
    guard = "G01" if "G01" in alive else None
    attacked = {}
    for floor, power in g.attack_list(g.path(value)):
        target = g.board[floor - 1]
        if target in alive:
            attacked[target] = attacked.get(target, 0) + power
    targets = sorted(attacked)
    guard_sets = [()]
    if guard:
        for count in range(1, g.owned[guard].charges + 1):
            for seq in combinations_with_replacement(targets, count):
                if all(seq.count(i) <= (attacked[i] + 5) // 6 for i in set(seq)):
                    guard_sets.append(seq)
        # A legal unused shield can matter to inactivity. Keep one canonical
        # option instead of silently redefining activity as actual absorption.
        if g.owned[guard].charges and guard not in targets:
            guard_sets.append((guard,))
    dest = g.board[g.path(value)[-1] - 1]
    arrivals = [None]
    if g.variant == "C13" and dest == "G01" and g.living("G01"):
        arrivals = targets or alive[:1]
    max_bell = g.owned[bell].charges if bell else 0
    for count in range(max_bell + 1):
        bells = [(bell, None)] * count
        if _bell_kills(g, count):
            yield bells, None
            break
        for guards in guard_sets:
            for arrival in arrivals:
                yield bells + [(guard, i) for i in guards], arrival


def state_utility(g, next_guest=True):
    v = g.visitor
    if g.phase == "service_end" or getattr(g, "end_reason", None) == "escape":
        # All partial fear is discarded on escape. Rewarding lower remaining
        # fear here would wrongly encourage useless Bell use before exiting.
        return -12 * v["initial_H"] * v["T"] - (200 if next_guest else 0)
    if g.phase == "observed_stop":
        return -3000.0
    killed = v["H"] == 0
    value = 12 * (v["initial_H"] * v["T"] - remaining(g))
    if killed:
        value += 1200
    if not killed and any(e.kind == "Q" and e.p > 0 for e in g.owned.values()):
        value += 10 * min(3, v["A"]) + 4 * max(0, v["A"] - 3)
    if not killed or next_guest:
        for e in g.owned.values():
            p_weight, destroy_weight = POLICY_META["P_loss_destroy_weights"][e.kind]
            value -= p_weight * (e.maxp - e.p)
            if e.p == 0:
                value -= destroy_weight
            if e.kind in ("B", "G") and e.p > 0:
                value += (45 if e.kind == "B" else 35) * e.charges
    if not killed:
        value -= sum(e.c for e in g.owned.values() if e.p > 0)
    return float(value)


def penalty_expected_cost(g, next_guest=True):
    previews = [e for e in g.logs if e["event"] == "penalty_preview"]
    if not previews:
        return 0.0
    event = previews[-1]
    candidates = event.get("candidates", living(g))
    if not candidates:
        return 0.0
    delta = event.get("delta", event.get("amount", getattr(g, "penalty_amount", 12)))
    base = state_utility(g, next_guest)
    changes = []
    for target in candidates:
        clone = deepcopy(g)
        entity = clone.owned[target]
        entity.c += delta
        if entity.c >= 12:
            entity.c, entity.p = 0, entity.p - 1
        changes.append(state_utility(clone, next_guest) - base)
    return sum(changes) / len(changes)


def enumerate_options(g, values=None, allow_exit=True):
    if g.phase not in ("turn_ready", "choice"):
        raise ValueError("Need a ready or revealed turn")
    allowed = set(range(1, 7)) if g.phase == "turn_ready" else set(g.dice)
    requested = sorted(allowed if values is None else set(values))
    if not set(requested) <= allowed:
        raise ValueError("Cannot choose an unrevealed distance")
    exits = [None]
    if allow_exit and g.variant != "C13" and g.escape_floor is None:
        exits += [i + 1 for i, owner in enumerate(g.board) if owner is None]
    result = []
    for value in requested:
        for actions, arrival in action_plans(g, value):
            for escape in exits:
                after = g.preview(value, actions, arrival_target=arrival,
                                  hypothetical=g.phase == "turn_ready", escape_floor=escape)
                result.append(dict(value=value, actions=actions, arrival_target=arrival,
                                   escape_floor=escape, after=after))
    return result


def tie_key(plan):
    return (-len(plan["actions"]), plan["escape_floor"] is None, -plan["value"],
            str(plan["arrival_target"] or ""), repr(plan["actions"]))


def rank_options(g, values=None, next_guest=True, allow_exit=True):
    options = enumerate_options(g, values, allow_exit)
    for plan in options:
        after = plan["after"]
        utility = state_utility(after, next_guest)
        penalty = penalty_expected_cost(after, next_guest)
        plan["score"] = utility + penalty + (80 if after.visitor["H"] == 0 else -8)
        plan["current_utility"], plan["expected_penalty_cost"] = utility, penalty
    return sorted(options, key=lambda p: (p["score"], tie_key(p)), reverse=True)


def public_plan(plan):
    after = plan["after"]
    return {"value": plan["value"], "actions": [list(a) for a in plan["actions"]],
            "arrival_target": plan["arrival_target"], "escape_floor": plan["escape_floor"],
            "score": round(plan["score"], 6),
            "expected_penalty_cost": round(plan["expected_penalty_cost"], 6),
            "predicted_phase": after.phase,
            "predicted_FHA": [after.visitor[k] for k in ("F", "H", "A")],
            "predicted_assets": {i: [e.c, e.p, e.charges] for i, e in after.owned.items()}}


def recommend(g, unrestricted=False, next_guest=True):
    if unrestricted != (g.phase == "turn_ready"):
        raise ValueError("Intent before reveal, decision after reveal")
    ranked = rank_options(g, next_guest=next_guest)
    answer = public_plan(ranked[0])
    score = ranked[0]["score"]
    answer.update(policy=POLICY_META["version"], unrestricted=unrestricted,
                  next_guest=next_guest,
                  ties=sorted({p["value"] for p in ranked if abs(p["score"]-score)<1e-9}),
                  explanation="현재 공개 경로의 공포·불안·P·잔량과 패널티 대상별 평균 비용을 고정 가중치로 비교했다.")
    return answer
