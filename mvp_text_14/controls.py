"""Config14 controlled replays and observed-state continuations.

Only control work is automated. Normal campaigns are separately played by AI
with pre-roll intent and manual decisions. No implementation changelog is made.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import argparse
import hashlib
import json

from engine import Entity, Game, RNG_VERSION
from planner import POLICY_META, rank_options, public_plan, recommend

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"


def source_hashes():
    files = [ROOT / "engine.py", ROOT / "planner.py", ROOT / "controls.py",
             ROOT.parent / "mvps/mvp-config-14.md", ROOT.parent / "undecided.md"]
    return {str(p.relative_to(ROOT.parent)).replace("\\", "/"):
            hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def restore(state, seed, variant=None):
    g = Game.new(seed, variant or state["variant"], state.get("stream", "normal"))
    for key, value in deepcopy(state).items():
        setattr(g, key, value)
    g.variant = variant or state["variant"]
    g.owned = {i: Entity(**e) for i, e in state["owned"].items()}
    g.purchased = set(state.get("purchased", []))
    g.logs = []
    return g


def extract_turns(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    logs = payload["logs"]
    result = []
    for index, event in enumerate(logs):
        if event["event"] != "manual_decision":
            continue
        before = event["before"]
        events = []
        after = None
        for later in logs[index + 1:]:
            if later["event"] == "manual_decision":
                break
            events.append(later)
            if later["event"] == "turn_end":
                after = later["state"]
                break
        if after is None:
            raise ValueError(f"Decision has no turn_end: {path}, {index}")
        result.append(dict(before=before, after=after, events=events,
                           decision=event, source_index=index))
    return payload, result


def metrics(events):
    return {
        "kills": sum(e["event"] == "kill" for e in events),
        "fear": sum(e["amount"] for e in events if e["event"] == "fear"),
        "supply": sum(e.get("supplied", 0) for e in events if e["event"] == "visit"),
        "harvest": sum(e.get("consumed", 0) for e in events if e["event"] == "visit"),
        "blocked": sum(e.get("blocked", 0) for e in events if e["event"] == "hit"),
        "destroyed": [e["target"] for e in events if e["event"] == "hit" and e.get("destroyed")],
        "fear_sources": [dict(source=e["source"], amount=e["amount"], after=e["after"])
                         for e in events if e["event"] == "fear" and e["amount"] > 0],
        "penalties": [e for e in events if e["event"] == "penalty"],
    }


def filter_actions(g, value, actions, escape_floor=None):
    """Omit only unavailable source actions; no substitute is invented."""
    shadow = g.clone()
    shadow.choose(value)
    if escape_floor is not None:
        shadow.install_escape(escape_floor)
    accepted, skipped = [], []
    for owner, target in actions:
        if shadow.phase != "active":
            break
        try:
            shadow.active(owner, target)
            accepted.append([owner, target])
        except ValueError as exc:
            skipped.append(dict(owner=owner, target=target, reason=str(exc)))
    return accepted, skipped


def replay_c14(path):
    payload, turns = extract_turns(path)
    results = []
    for service in sorted({x["before"]["service"] for x in turns}):
        records = [x for x in turns if x["before"]["service"] == service]
        g = restore(records[0]["before"], payload["seed"], "C14")
        g.emit("control_metadata", mode="C14_fixed_recorded_actions", source=path.name,
               service=service, source_hashes=source_hashes(), state=g.state())
        rows, mismatch = [], None
        for number, record in enumerate(records):
            source = record["before"]
            if number:
                if g.phase == "visitor_end":
                    g.advance()
                if g.phase != "turn_ready":
                    mismatch = dict(reason="boundary_before_next_record", phase=g.phase)
                    break
                intent = source.get("pending_intent") or {}
                g.record_intent(intent.get("values", []), "Recorded-action C14 control; original intent retained only as context")
                g.begin_turn()
                if g.dice != source["dice"] or g.visitor["key"] != source["visitor"]["key"]:
                    raise AssertionError("Paired public input/key drift")
            decision = record["decision"]
            escape = decision.get("escape_floor")
            acts, skipped = filter_actions(g, decision["value"], decision.get("actions", []), escape)
            before = g.state()
            cursor = len(g.logs)
            g.play(decision["value"], acts, decision.get("arrival_target"), escape_floor=escape)
            events = g.logs[cursor:]
            row = dict(guest=g.visitor["key"], turn=g.visitor["turn"],
                       before=before, choice=decision["value"], actions=acts,
                       skipped=skipped, after=g.state(), events=events,
                       actual=metrics(events), normal=metrics(record["events"]),
                       normal_after=record["after"])
            rows.append(row)
            normal_terminal = record["after"]["phase"] in ("visitor_end", "service_end", "observed_stop")
            control_terminal = g.phase in ("visitor_end", "service_end", "observed_stop")
            if normal_terminal != control_terminal or (normal_terminal and g.phase != record["after"]["phase"]):
                mismatch = dict(reason="first_guest_or_service_end_mismatch", guest=g.visitor["key"],
                                turn=g.visitor["turn"], normal_phase=record["after"]["phase"], control_phase=g.phase)
                break
        out = RUNS / f"control_C14_{payload['seed']}_service{service}.json"
        document = dict(mode="recorded_actions_control", seed=payload["seed"], source=path.name,
                        service=service, rows=rows, mismatch=mismatch, final=g.state(), logs=g.logs,
                        interpretation="Stop at first end mismatch; no forced visitor advance and no claim of optimal C14 strategy.")
        out.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
        results.append(dict(file=out.name, seed=payload["seed"], service=service, turns=len(rows),
                            skipped=[dict(guest=r["guest"], turn=r["turn"], actions=r["skipped"])
                                     for r in rows if r["skipped"]], mismatch=mismatch,
                            normal_fear=sum(r["normal"]["fear"] for r in rows),
                            control_fear=sum(r["actual"]["fear"] for r in rows),
                            normal_P={i: e["p"] for i, e in rows[-1]["normal_after"]["owned"].items()},
                            control_P={i: e.p for i, e in g.owned.items()}))
    return results


def execute_plan(g, plan, label):
    before = g.state()
    cursor = len(g.logs)
    g.emit("control_decision", label=label, plan=plan, before=before)
    g.play(plan["value"], plan.get("actions", []), plan.get("arrival_target"),
           escape_floor=plan.get("escape_floor"))
    return dict(before=before, plan=plan, after=g.state(), events=g.logs[cursor:],
                metrics=metrics(g.logs[cursor:]))


def continue_branch(label, source_path, record, first, penalty_enabled=None, start_state=None, variant=None):
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    g = restore(start_state or record["before"], payload["seed"], variant)
    if penalty_enabled is not None:
        g.penalty_enabled = penalty_enabled
    g.emit("control_metadata", mode="observed_snapshot_fixed_policy", label=label,
           source=source_path.name, source_index=record["source_index"], policy=POLICY_META,
           source_hashes=source_hashes(), state=g.state())
    rows = [execute_plan(g, first, "forced_first_comparison")]
    while g.phase not in ("management", "complete", "observed_stop"):
        if g.phase in ("visitor_end", "service_end"):
            g.advance()
            if g.phase in ("management", "complete"):
                break
        if g.phase != "turn_ready":
            raise AssertionError(g.phase)
        intent = recommend(g, unrestricted=True, next_guest=g.guest_idx == 0)
        g.record_intent(intent["ties"], intent["explanation"], intent["actions"], intent["arrival_target"])
        g.emit("control_pre_roll_policy", plan=intent)
        g.begin_turn()
        plan = recommend(g, next_guest=g.guest_idx == 0)
        rows.append(execute_plan(g, plan, "fixed_public_policy"))
    out = RUNS / f"control_{label}.json"
    data = dict(label=label, policy=POLICY_META, source=source_path.name, source_index=record["source_index"],
                rows=rows, logs=g.logs, final=g.state())
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return dict(file=out.name, turns=len(rows), final_phase=g.phase,
                kills=sum(r["metrics"]["kills"] for r in rows), fear=sum(r["metrics"]["fear"] for r in rows),
                final_P={i: e.p for i, e in g.owned.items()}, final_G=g.owned["G01"].charges,
                source_guest=record["before"]["visitor"]["key"], source_turn=record["before"]["visitor"]["turn"])


def observed_controls(paths):
    observations = []
    for path in paths:
        payload, records = extract_turns(path)
        observations += [(path, payload, r) for r in records]
    result = {"D3_kill_or_charge": {"status": "not_observed"},
              "D3_near_penalty": {"status": "not_observed"},
              "D4_escape": {"status": "not_observed"}}
    for path, payload, record in observations:
        g = restore(record["before"], payload["seed"])
        # Causal branches start from the same revealed choices, not a future
        # favorable roll; policy follows from the next turn onward.
        if result["D3_kill_or_charge"]["status"] == "not_observed" and g.guest_idx == 0 and g.living("G01") and g.owned["G01"].charges <= 1:
            plans = rank_options(g, next_guest=True, allow_exit=False)
            kills = [p for p in plans if p["after"].visitor["H"] == 0]
            charges = [p for p in plans if p["after"].visitor["H"] > 0 and
                       any(e["event"] == "charge" and e.get("gained", e.get("amount", 0)) > 0 for e in p["after"].logs)]
            if kills and charges:
                branches = [continue_branch("D3_immediate_kill", path, record, public_plan(kills[0])),
                            continue_branch("D3_charge_first", path, record, public_plan(charges[0]))]
                banks = [p for p in charges if p["after"].owned["G01"].charges > g.owned["G01"].charges]
                if banks and banks[0] is not charges[0]:
                    branches.append(continue_branch("D3_charge_bank", path, record, public_plan(banks[0])))
                result["D3_kill_or_charge"] = dict(status="observed", source=path.name,
                    note="Policy-selected recharge may spend a charge defending G first. Separate bank branch forces net reserve increase when legal, without changing policy weights.",
                    branches=branches)
        if result["D3_near_penalty"]["status"] == "not_observed" and g.idle_limit - g.idle_count == 1:
            plans = rank_options(g, next_guest=g.guest_idx == 0)
            charges = [p for p in plans if any(e["event"] == "charge" for e in p["after"].logs)]
            if charges:
                choice = public_plan(charges[0])
                alternatives = [p for p in plans if p is not charges[0]]
                branches = [continue_branch("D3_near_penalty_charge", path, record, choice),
                            continue_branch("D3_near_penalty_disabled", path, record, choice, False)]
                if alternatives:
                    branches.append(continue_branch("D3_near_penalty_alternative", path, record, public_plan(alternatives[0])))
                result["D3_near_penalty"] = dict(status="observed", source=path.name, branches=branches)
        decision = record["decision"]
        intent = record["before"].get("pending_intent") or {}
        language = decision.get("reason", "") + " " + intent.get("reason", "")
        considered = (decision.get("escape_floor") is not None or intent.get("escape_floor") is not None
                      or any(w in language for w in ("탈출", "퇴각", "영업 종료")))
        if result["D4_escape"]["status"] == "not_observed" and considered:
            plans = rank_options(g, next_guest=g.guest_idx == 0)
            exits = [p for p in plans if p["escape_floor"] is not None]
            fights = [p for p in plans if p["escape_floor"] is None]
            if exits and fights:
                result["D4_escape"] = dict(status="observed", source=path.name,
                    trigger_text=language, trigger="first explicit exit mention; not proof exit was needed",
                    branches=[continue_branch("D4_continue", path, record, public_plan(fights[0])),
                              continue_branch("D4_open_exit", path, record, public_plan(exits[0]))])
    return result


def early_bell_alternative(paths):
    """A strategy alternative at the first replay-confirmed extra-G B rescue.

    Separate from the preregistered fixed-action replay. Only public fixed
    policy is used after the explicitly changed first choice.
    """
    for path in paths:
        payload, records = extract_turns(path)
        for service in sorted({r["before"]["service"] for r in records}):
            replay = json.loads((RUNS / f"control_C14_{payload['seed']}_service{service}.json").read_text(encoding="utf-8"))
            for row in replay["rows"]:
                if not any(a["owner"] == "G01" and a["target"] == "B01" for a in row["skipped"]):
                    continue
                if row["after"]["owned"]["B01"]["p"] != 0 or row["normal_after"]["owned"]["B01"]["p"] <= 0:
                    continue
                record = next(r for r in records if r["before"]["visitor"]["key"] == row["guest"] and r["before"]["visitor"]["turn"] == row["turn"])
                decision = record["decision"]
                normal = {k: decision.get(k) for k in ("value", "actions", "arrival_target", "escape_floor")}
                count = row["before"]["owned"]["B01"]["charges"]
                early = dict(value=decision["value"], actions=[["B01", None]] * count,
                             arrival_target=None, escape_floor=decision.get("escape_floor"))
                return dict(status="observed", source=path.name, guest=row["guest"], turn=row["turn"],
                            interpretation="Exploratory M14 same-state early-B sacrifice alternative plus matched C14 state; fixed public policy thereafter, not optimality proof.",
                            branches=[continue_branch("B_rescue_then_policy", path, record, normal),
                                      continue_branch("B_early_spend_M14_then_policy", path, record, early),
                                      continue_branch("B_early_spend_C14_then_policy", path, record, early,
                                                      start_state=row["before"], variant="C14")])
    return dict(status="not_observed")


def empty_full_control():
    records = []
    for full in (False, True):
        g = Game.diagnostic(dict(key="D4_space", T=16, H=2, pattern="none"), seed=14001,
                            variant="M14", stream="D4_space")
        if full:
            g.board[3] = "Q03"
            g.owned["Q03"] = Entity("Q03", "Q")
        # Record a useful extra-harvest option before the all-destroyed exit
        # boundary. The two demonstrations are independent snapshots.
        g.visitor.update(p=3, A=3)
        g.begin_turn([1, 1, 1])
        out = g.preview(1)
        harvest = dict(before=g.state(), after=out.state(), events=out.logs)
        for e in g.owned.values():
            e.p = 0
        before = g.state()
        try:
            g.play(1, escape_floor=4)
            exit_result = dict(legal=True, phase=g.phase, events=g.logs)
        except ValueError as exc:
            exit_result = dict(legal=False, reason=str(exc), unchanged=g.state() == before)
        stalled = None
        if full:
            g.emit("control_all_destroyed_start", state=g.state(),
                   explanation="Full board, every anomaly P0, no exit exception. Fixed dice [1,1,1] for 24-turn observation.")
            trace = []
            while g.phase != "observed_stop":
                if g.phase == "turn_ready":
                    g.begin_turn([1, 1, 1])
                cursor = len(g.logs)
                g.play(1)
                trace.append(dict(turn=g.visitor["turn"], state=g.state(), events=g.logs[cursor:]))
            penalties = [e for r in trace for e in r["events"] if e["event"] == "penalty"]
            stalled = dict(turns=len(trace), final_phase=g.phase,
                           unchanged_FHA=all([r["state"]["visitor"][k] for k in ("F", "H", "A")] == [0, 2, 3] for r in trace),
                           penalty_count=len(penalties), penalty_targets=[e["target"] for e in penalties],
                           trace=trace,
                           interpretation="Observation cap, not a game defeat rule. Empty-target penalties do not create an exit or attack.")
        records.append(dict(full=full, harvest=harvest, destroyed_exit=exit_result,
                            stalled_observation=stalled, state=g.state()))
    out = RUNS / "control_D4_space.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return dict(file=out.name, records=records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--normal", nargs="*", type=Path)
    args = parser.parse_args()
    RUNS.mkdir(exist_ok=True)
    paths = args.normal or sorted(RUNS.glob("normal_*_M14.json"))
    if not paths:
        raise SystemExit("Normal M14 runs required first")
    for path in paths:
        source = json.loads(path.read_text(encoding="utf-8"))
        if source["phase"] not in ("complete", "observed_stop"):
            raise SystemExit(f"Wait for manual run to end before control replay: {path.name}")
    policy_path = RUNS / "control_policy.json"
    policy_path.write_text(json.dumps(dict(policy=POLICY_META, source_hashes=source_hashes()), ensure_ascii=False, indent=2), encoding="utf-8")
    c14 = [row for path in paths for row in replay_c14(path)]
    observed = observed_controls(paths)
    observed["B_early_spend_alternative"] = early_bell_alternative(paths)
    space = empty_full_control()
    summary = dict(policy=POLICY_META, rng_version=RNG_VERSION, c14=c14, observed=observed,
                   space={"file": space["file"], "empty_exit": space["records"][0]["destroyed_exit"]["legal"],
                          "full_exit": space["records"][1]["destroyed_exit"]["legal"],
                          "full_observed_turns": space["records"][1]["stalled_observation"]["turns"],
                          "full_empty_target_penalties": space["records"][1]["stalled_observation"]["penalty_count"],
                          "full_unchanged_FHA": space["records"][1]["stalled_observation"]["unchanged_FHA"]}, source_hashes=source_hashes())
    (RUNS / "control_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Config 14 통제 비교", "", "정상 수동 AI 기록과 분리한 고정 행동 재생 및 공개정보 고정 정책의 후속 비교다.", "",
             "| C14 기록 | 턴 | 생략된 액티브 턴 수 | 최초 종료 불일치 |", "|---|---:|---:|---|"]
    for r in c14:
        lines.append(f"| {r['file']} | {r['turns']} | {len(r['skipped'])} | {r['mismatch']} |")
    for key, value in observed.items():
        lines += ["", f"## {key}", "", f"상태: {value['status']}"]
        for b in value.get("branches", []):
            lines.append(f"- [{b['file']}]({b['file']}): {b['turns']}턴, 처치{b['kills']}, 종료 {b['final_phase']}, P {b['final_P']}, G {b['final_G']}")
    lines += ["", "## 빈층과 추가 Q", "", f"[독립 통제]({space['file']}): 빈층이면 전멸 후에도 출구 설치·접촉 가능. Q03이 점유하면 P0이어도 설치 불가.",
              "가득 찬 배치에서 전멸한 뒤 강제 눈으로24턴을 실제 진행했다. 공포·심장·불안은 변하지 않았고, 대상 없는 패널티11회도 상태를 바꾸지 못했다. 관찰 상한으로 중단했으며 게임상 자동 패배로 처리한 것이 아니다.",
              "", "정책은 한 턴의 공포·불안·P·잔량과 랜덤 패널티 평균 비용을 고정 가중치로 평가한다. 미래 실제 눈을 읽지 않으며 전체 최적 전략·인간 선호를 입증하지 않는다."]
    (RUNS / "control_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
