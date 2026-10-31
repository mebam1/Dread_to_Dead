"""Continue each individual target's omitted G protection along recorded choices."""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import hashlib
import json

from controls import extract_turns, filter_actions, restore
from engine import RNG_VERSION

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"
TERMINAL = ("visitor_end", "service_end", "observed_stop")


def positive_effects(events):
    result = Counter()
    for event in events:
        if event["event"] == "fear" and event["amount"] > 0:
            source = event["source"]
            result[(source.split(":")[0], "fear", source)] += event["amount"]
        elif event["event"] == "visit" and event.get("supplied", 0) > 0:
            result[(event["target"], "supply", event["mode"])] += event["supplied"]
    return result


def cp(state, target):
    e = state["owned"][target]
    return [e["c"], e["p"]]


def run_case(path, payload, records, start, target):
    origin = records[start]
    service = origin["before"]["service"]
    relevant = [r for r in records[start:] if r["before"]["service"] == service]
    g = restore(origin["before"], payload["seed"])
    omitted = [a for a in origin["decision"]["actions"] if a[0] == "G01" and a[1] == target]
    assert omitted
    identifier = f"{path.stem}:{origin['before']['visitor']['key']}:t{origin['before']['visitor']['turn']}:{target}"
    g.emit("protection_control_metadata", case=identifier, source=path.name,
           source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
           source_index=origin["source_index"], target=target, omitted=omitted,
           state=g.state())
    rows, lost, mismatch, first_target_destruction = [], [], None, None
    for offset, record in enumerate(relevant):
        normal_before = record["before"]
        if offset:
            # A previous end mismatch stops the loop before this boundary.
            if g.phase == "visitor_end":
                g.advance()
            if g.phase != "turn_ready":
                raise AssertionError(f"Unexpected same-service boundary: {identifier}, {g.phase}")
            intent = normal_before["pending_intent"]
            g.record_intent(intent["values"], "Same recorded path after one target-specific protection omission")
            g.begin_turn()
        assert g.service == service
        assert (g.visitor["key"], g.visitor["turn"], g.dice) == (
            normal_before["visitor"]["key"], normal_before["visitor"]["turn"], normal_before["dice"])
        decision = record["decision"]
        requested = decision.get("actions", [])
        if offset == 0:
            requested = [a for a in requested if not (a[0] == "G01" and a[1] == target)]
        before = g.state()
        actions, skipped = filter_actions(g, decision["value"], requested, decision.get("escape_floor"))
        cursor = len(g.logs)
        g.emit("protection_control_decision", source_index=record["source_index"],
               value=decision["value"], actions=actions, skipped=skipped,
               omitted=omitted if offset == 0 else [], before=before)
        g.play(decision["value"], actions, decision.get("arrival_target"), decision.get("escape_floor"))
        events, after = g.logs[cursor:], g.state()
        normal_effects, shadow_effects = positive_effects(record["events"]), positive_effects(events)
        reduced = []
        for key, amount in normal_effects.items():
            remaining = shadow_effects[key]
            if remaining >= amount:
                continue
            owner, kind, source = key
            item = dict(guest=g.visitor["key"], turn=g.visitor["turn"],
                        source_index=record["source_index"], owner=owner, kind=kind, source=source,
                        normal_amount=amount, omitted_amount=remaining, difference=amount-remaining,
                        is_protected_target=owner == target,
                        unavailable_due_to_owner_destroyed=before["owned"][owner]["p"] == 0,
                        normal_owner_CP_before=cp(normal_before, owner),
                        omitted_owner_CP_before=cp(before, owner))
            reduced.append(item)
            if offset > 0:
                lost.append(item)
        if (first_target_destruction is None and after["owned"][target]["p"] == 0
                and record["after"]["owned"][target]["p"] > 0):
            first_target_destruction = dict(guest=g.visitor["key"], turn=g.visitor["turn"],
                normal_CP=cp(record["after"], target), omitted_CP=cp(after, target),
                immediate_omission_turn=offset == 0,
                events=[e for e in events if e["event"] in ("hit", "penalty")
                        and e.get("target") == target and e.get("destroyed")])
        row = dict(guest=g.visitor["key"], turn=g.visitor["turn"], source_index=record["source_index"],
                   before=before, normal_before=normal_before, decision=decision,
                   executed_actions=actions, skipped_actions=skipped,
                   after=after, normal_after=record["after"],
                   events=events, normal_events=record["events"], reduced_positive_effects=reduced)
        rows.append(row)
        normal_phase, shadow_phase = record["after"]["phase"], g.phase
        if ((normal_phase in TERMINAL) != (shadow_phase in TERMINAL)
                or (normal_phase in TERMINAL and normal_phase != shadow_phase)):
            mismatch = dict(guest=g.visitor["key"], turn=g.visitor["turn"],
                            normal_phase=normal_phase, omitted_phase=shadow_phase,
                            normal_FHA=[record["after"]["visitor"][k] for k in ("F", "H", "A")],
                            omitted_FHA=[g.visitor[k] for k in ("F", "H", "A")])
            break
        if g.phase in ("service_end", "observed_stop"):
            break
    outcome = "first_end_mismatch" if mismatch else "matched_observation_cap" if g.phase == "observed_stop" else "matched_service_end"
    if not mismatch and g.phase not in TERMINAL:
        raise AssertionError(f"Source service not completed: {identifier}")
    return dict(case=identifier, source=path.name, seed=payload["seed"], service=service,
                source_index=origin["source_index"], guest=origin["before"]["visitor"]["key"],
                turn=origin["before"]["visitor"]["turn"], target=target, omitted_actions=omitted,
                initial_target_CP=cp(origin["before"], target),
                first_turn_normal_CP=cp(rows[0]["normal_after"], target),
                first_turn_omitted_CP=cp(rows[0]["after"], target),
                first_target_destruction=first_target_destruction,
                lost_later_positive_effects=lost,
                lost_later_target_effects=[e for e in lost if e["is_protected_target"]],
                first_end_mismatch=mismatch, outcome=outcome,
                rows=rows, final=g.state(), logs=g.logs)


def main():
    paths = sorted(RUNS.glob("normal_*_M14.json"))
    before_hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    cases = []
    for path in paths:
        payload, records = extract_turns(path)
        assert payload["phase"] in ("complete", "observed_stop")
        for index, record in enumerate(records):
            targets = sorted({e["target"] for e in record["events"]
                              if e["event"] == "active" and e.get("kind") == "G"})
            for target in targets:
                cases.append(run_case(path, payload, records, index, target))
    assert before_hashes == {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    scope = ("Each case removes only the recorded G active(s) to one target on one turn, "
             "retaining all later recorded movement and legal actions in the same service. "
             "Unavailable actions are omitted, not replaced; saved charges may remain unused. "
             "Replay stops at the first visitor/service-end mismatch. Guest C reset is applied only "
             "after a matched kill. No service P restoration is crossed. This is not an optimal "
             "alternative strategy; effects can overlap between cases and must not be globally summed.")
    summary = dict(cases=len(cases), replayed_turns=sum(len(c["rows"]) for c in cases),
                   cases_with_target_destruction=sum(c["first_target_destruction"] is not None for c in cases),
                   cases_with_lost_later_target_effect=sum(bool(c["lost_later_target_effects"]) for c in cases),
                   cases_with_end_mismatch=sum(c["first_end_mismatch"] is not None for c in cases))
    result = dict(scope=scope, rng_version=RNG_VERSION, source_hashes=before_hashes,
                  code_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), summary=summary, cases=cases)
    (RUNS / "protection_continuations.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# G 보호 한 건을 생략한 같은 영업 후속 재생", "",
             "같은 턴 같은 대상에게 쓴 G 액티브만 생략하고, 이후 실제 경로와 합법적인 액티브를 유지했다. 실행 불가능해진 액티브는 표시하고 생략했다. 처치·탈출 시점이 처음 달라지면 중단했으며, 양쪽이 처치한 경우에만 다음 손님의 C 초기화를 적용했다. 다음 영업의 P 복구는 넘지 않았다.", "",
             "생략해 남은 방어 횟수를 재배분하는 최적 대안의 검증은 아니다. 서로 다른 보호의 생략이 같은 후속 공격에 영향을 줄 수 있으므로 효과를 합산하지 않는다.", "",
             "| 정상 실행 | 생략 보호 | 직후 정상 C/P → 생략 C/P | 생략 분기의 대상 파괴 | 줄어든 이후 대상 효과 | 최초 종료 불일치 |",
             "|---|---|---|---|---|---|"]
    for c in cases:
        death = c["first_target_destruction"]
        died = f"{death['guest']} T{death['turn']}" if death else "없음"
        lost = "; ".join(f"{e['guest']} T{e['turn']} {e['kind']} {e['normal_amount']}→{e['omitted_amount']}" for e in c["lost_later_target_effects"]) or "없음"
        end = c["first_end_mismatch"]
        boundary = f"{end['guest']} T{end['turn']} {end['normal_phase']} / {end['omitted_phase']}" if end else "없음"
        lines.append(f"| {c['seed']} M14 | {c['guest']} T{c['turn']} {c['target']} | {c['first_turn_normal_CP']} → {c['first_turn_omitted_CP']} | {died} | {lost} | {boundary} |")
    lines += ["", f"{summary['cases']}건의 독립 생략 분기·{summary['replayed_turns']}턴을 재생했다. 전체 상태·사건·생략 액티브·양쪽 결과는 [원본 JSON](protection_continuations.json)에 저장했다.", ""]
    (RUNS / "protection_continuations.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    for c in cases:
        if c["first_target_destruction"] or c["lost_later_positive_effects"] or c["first_end_mismatch"]:
            print(json.dumps({k: c[k] for k in ("case", "first_target_destruction", "lost_later_positive_effects", "first_end_mismatch", "outcome")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
