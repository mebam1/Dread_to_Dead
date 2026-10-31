"""Fixed public-information helper; never reads a seed, stream, or future roll.

This is a bounded two-turn policy for controlled continuations, not a model of
human preference and not an optimal campaign solver.  First-turn alternatives
are all useful B/G allocations.  The second turn evaluates every distance and
useful allocation, then integrates the best available result over independent
3d6.  Neither stage calls begin_turn or consumes the live game's random input.
"""
from __future__ import annotations

from itertools import combinations_with_replacement


POLICY_META = {
    "version": "public-two-turn-v1",
    "horizon": "current turn plus exact expectation of best next independent 3d6",
    "weights": {
        "fear_progress": 12,
        "kill": 1200,
        "immediate_kill_bonus": 80,
        "failure": -10000,
        "current_fraction": 0.2,
        "next_fraction": 0.8,
        "extra_turn_cost": 8,
        "anxiety_first_three": 6,
        "anxiety_remaining": 2,
        "current_C": 0.75,
        "spent_B_with_next_guest": 80,
        "spent_G_with_next_guest": 40,
        "spent_B_last_guest": 15,
        "spent_G_last_guest": 8,
    },
    "P_loss_destroy_weights": {"U": [80, 220], "Q": [50, 100],
                               "B": [60, 100], "G": [45, 80]},
    "pruning": "Only G targets that receive damage this turn; otherwise equivalent arrival target canonicalized. No beam search.",
    "limits": "No full-campaign optimization, hidden-roll lookup, or human preference inference. Weights fixed before runs.",
}

# All memoized quantities are functions of public state only.  Keys deliberately
# omit seed, stream, dice, log history and pending intent.  Values are absolute
# public-state utility, so they can be shared between pre-roll and post-roll
# evaluation of the same state without inspecting the actual roll.
_NEXT_CACHE: dict[tuple, tuple[float, float]] = {}


def remaining(v):
    return 0 if v["H"] == 0 else v["H"] * v["T"] - v["F"]


def _living(g):
    return [i for i in g.board if i and g.living(i)]


def _arrival_enabled(g, value):
    dest = g.board[g.path(value)[-1] - 1]
    return (g.variant in ("MG", "MUG") and dest == "G01"
            and g.living("G01"))


def _bell_kills(g, count):
    fear, hearts = g.visitor["F"], g.visitor["H"]
    for _ in range(count):
        fear += 6
        if fear >= g.visitor["T"]:
            hearts -= 1
            fear = 0
        if hearts == 0:
            return True
    return False


def _action_plans(g, value):
    alive = _living(g)
    bell = "B01" if "B01" in alive else None
    guard = "G01" if "G01" in alive else None
    attacked = {}
    for floor, power in g.attack_list(g.path(value)):
        target = g.board[floor - 1]
        if target in alive:
            attacked[target] = attacked.get(target, 0) + power
    guard_targets = sorted(attacked)
    guard_sets = [()]
    if guard:
        for n in range(1, g.owned[guard].charges + 1):
            for seq in combinations_with_replacement(guard_targets, n):
                # Absorption beyond every scheduled hit has no current or
                # future effect. Excluding it cannot discard a useful plan.
                if all(seq.count(i) <= (attacked[i] + 5) // 6 for i in set(seq)):
                    guard_sets.append(seq)
    arrivals = [None]
    if _arrival_enabled(g, value):
        # With no incoming hit all legal arrival targets have the same state
        # after turn-end expiration; keep one canonical valid target.
        arrivals = guard_targets or alive[:1]
    max_bell = g.owned[bell].charges if bell else 0
    for n in range(max_bell + 1):
        bells = [(bell, None)] * n
        if _bell_kills(g, n):
            # Never spend guard charges after an earlier Bell has killed.
            yield bells, None
            break
        for guards in guard_sets:
            actions = bells + [(guard, target) for target in guards]
            for arrival in arrivals:
                yield actions, arrival


def _state_key(g, next_guest):
    v = g.visitor
    return (
        g.variant, g.phase, bool(next_guest), tuple(g.board),
        tuple((k, repr(v.get(k))) for k in ("T", "H", "initial_H", "F", "A", "p",
                                          "turn", "pattern", "power", "attacks")),
        tuple((i, e.kind, e.c, e.p, e.charges, e.shield)
              for i, e in sorted(g.owned.items())),
    )


def state_utility(g, next_guest=True):
    """Transparent terminal evaluator, including asset/charge future costs."""
    if g.phase == "failed":
        return -10000.0
    v = g.visitor
    killed = v["H"] == 0
    value = 12 * (v["initial_H"] * v["T"] - remaining(v))
    if killed:
        value += 1200
    if not killed and any(g.living(i) for i in ("Q01", "Q02")):
        value += 6 * min(3, v["A"]) + 2 * max(0, v["A"] - 3)
    if not killed or next_guest:
        for e in g.owned.values():
            pw, dw = POLICY_META["P_loss_destroy_weights"][e.kind]
            value -= pw * (e.maxp - e.p)
            if e.p == 0:
                value -= dw
            if e.kind == "B":
                value -= (80 if next_guest else 15) * (2 - e.charges)
            if e.kind == "G":
                value -= (40 if next_guest else 8) * (2 - e.charges)
    if not killed:
        value -= 0.75 * sum(e.c for e in g.owned.values() if e.p > 0)
    return float(value)


def enumerate_options(g, values=None):
    """Return public candidates with their simulated `after` Game.

    turn_ready means hypothetical current choices 1..6 before rolling.  choice
    means only the already public dice.  Explicit values never expand a rolled
    choice beyond its public candidates.  Returned states are clones.
    """
    if g.phase not in ("turn_ready", "choice"):
        raise ValueError("Planning requires a ready turn or current public choice")
    allowed = set(range(1, 7)) if g.phase == "turn_ready" else set(g.dice)
    values = sorted(allowed if values is None else set(values))
    if not set(values) <= allowed:
        raise ValueError("Cannot plan an unavailable distance after the roll")
    options = []
    for value in values:
        for actions, arrival in _action_plans(g, value):
            after = g.preview(value, actions, arrival_target=arrival,
                              hypothetical=g.phase == "turn_ready")
            options.append(dict(value=value, actions=actions,
                                arrival_target=arrival, after=after))
    return options


def _tie_key(plan):
    # Resource use already enters utility. This breaks exact remaining ties
    # consistently, without favoring a role or choosing according to a seed.
    return (-len(plan["actions"]), -plan["value"],
            str(plan["arrival_target"] or ""))


def _expected_next(g, next_guest):
    key = _state_key(g, next_guest)
    cached = _NEXT_CACHE.get(key)
    if cached is not None:
        return cached
    if g.phase != "turn_ready":
        answer = (state_utility(g, next_guest), float(g.visitor["H"] == 0))
    else:
        best = {}
        for option in enumerate_options(g):
            value = state_utility(option["after"], next_guest)
            die = option["value"]
            candidate = (value, _tie_key(option), option["after"].visitor["H"] == 0)
            if die not in best or candidate[:2] > best[die][:2]:
                best[die] = candidate
        # Sorted six faces count multiplicities. The maximum rank of 3 iid d6
        # draws is i with probability ((i+1)^3-i^3)/216, including tied scores.
        scores = sorted(x[0] for x in best.values())
        expected = sum(score * ((i + 1) ** 3 - i ** 3) / 216
                       for i, score in enumerate(scores))
        kill_faces = sum(int(x[2]) for x in best.values())
        answer = (expected, 1 - ((6 - kill_faces) / 6) ** 3)
    if len(_NEXT_CACHE) >= 30000:
        _NEXT_CACHE.clear()
    _NEXT_CACHE[key] = answer
    return answer


def _public_plan(plan):
    after = plan["after"]
    v = after.visitor
    return {
        "value": plan["value"],
        "actions": [list(a) for a in plan["actions"]],
        "arrival_target": plan["arrival_target"],
        "score": round(plan["score"], 6),
        "current_utility": round(plan["current_utility"], 6),
        "next_expected_utility": round(plan["next_expected_utility"], 6),
        "next_turn_kill_probability": round(plan["next_turn_kill_probability"], 6),
        "predicted_phase": after.phase,
        "predicted_visitor": {k: v[k] for k in ("p", "F", "H", "A", "turn")},
        "predicted_assets": {i: {"C": e.c, "P": e.p, "charges": e.charges}
                             for i, e in after.owned.items()},
    }


def recommend(g, unrestricted=False, next_guest=True):
    """Return a serializable public plan and the best plan for each distance."""
    if unrestricted and g.phase != "turn_ready":
        raise ValueError("Unrestricted intent must be recorded before revealing dice")
    if not unrestricted and g.phase != "choice":
        raise ValueError("A choice recommendation requires the current public dice")
    options = enumerate_options(g)
    best_by_value = {}
    for plan in options:
        after = plan["after"]
        current = state_utility(after, next_guest)
        if after.phase == "visitor_end":
            expected, kill_probability = current, 1.0
            score = current + 80
        elif after.phase == "failed":
            expected, kill_probability = current, 0.0
            score = current
        else:
            expected, kill_probability = _expected_next(after, next_guest)
            score = 0.2 * current + 0.8 * expected - 8
        plan.update(score=score, current_utility=current,
                    next_expected_utility=expected,
                    next_turn_kill_probability=kill_probability)
        die = plan["value"]
        if die not in best_by_value or (score, _tie_key(plan)) > (
                best_by_value[die]["score"], _tie_key(best_by_value[die])):
            best_by_value[die] = plan
    ranked = sorted(best_by_value.values(),
                    key=lambda p: (p["score"], _tie_key(p)), reverse=True)
    best = ranked[0]
    answer = _public_plan(best)
    answer["policy"] = POLICY_META["version"]
    answer["unrestricted"] = unrestricted
    answer["next_guest"] = next_guest
    answer["ties"] = sorted(p["value"] for p in ranked
                            if abs(p["score"] - best["score"]) < 1e-9)
    answer["alternatives"] = [_public_plan(p) for p in ranked]
    dest = g.path(best["value"])[-1]
    entity = g.board[dest - 1]
    role = entity[0] if entity and g.living(entity) else "empty"
    answer["destination_floor"] = dest
    answer["destination_role"] = role
    if best["after"].phase == "visitor_end":
        answer["explanation"] = (
            f"거리 {best['value']} 계획으로 이번 턴 처치. 남은 횟수·자산 비용을 포함해 비교했다. "
            "액티브로 먼저 처치하면 실제 도착은 생략된다.")
    else:
        answer["explanation"] = (
            f"{dest}층 {role}: 처리 후 F/H/A="
            f"{best['after'].visitor['F']}/{best['after'].visitor['H']}/{best['after'].visitor['A']}. "
            f"다음 독립 3d6에서 이 정책의 한 턴 처치 기회 "
            f"{100 * best['next_turn_kill_probability']:.1f}%와 자산·횟수 비용을 비교했다.")
    return answer


def clear_cache():
    """Optional memory reset; never changes a decision or random input."""
    _NEXT_CACHE.clear()
