"""Seven preregistered config-13 continuations, using one fixed public policy."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from pathlib import Path
import hashlib
import json
import shutil

from diagnostics import make_case
from engine import RNG_VERSION
from planner import POLICY_META, recommend


ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"
BRANCHES = [
    ("D1_U", "D1", 1, [], None),
    ("D1_Q", "D1", 3, [], None),
    ("D3_U", "D3", 1, [], None),
    ("D3_G", "D3", 2, [], "U01"),
    ("D3_Q", "D3", 3, [], None),
    ("D5_Q_active", "D5", 3, [("G01", "U01")], None),
    ("D5_G_arrival", "D5", 2, [], "U01"),
]


def hashes():
    names = [ROOT / "engine.py", ROOT / "planner.py", ROOT / "diagnostics.py",
             ROOT / "controls.py", ROOT.parent / "mvps/mvp-config-13.md",
             ROOT.parent / "undecided.md", ROOT.parent / "rules.md"]
    return {str(p.relative_to(ROOT.parent)).replace("\\", "/"):
            hashlib.sha256(p.read_bytes()).hexdigest() for p in names}


def _actual_arrival(events):
    visits = [e for e in events if e["event"] == "visit" and e["mode"] == "arrival"]
    return (visits[-1]["target"] or "empty") if visits else None


def optimistic_impossibility(g):
    """A safe public bound for the no-supplier state, not a future-dice search.

    Allow every remaining anxiety point to become fear, every remaining bell
    charge to fire, and a bell arrival on every remaining turn without death.
    This deliberately overestimates production. Even that being insufficient
    proves failure within the fixed turn cap.
    """
    if g.phase != "turn_ready" or g.living("U01"):
        return None
    v = g.visitor
    turns_left = 8 - v["turn"]
    harvest_bound = 4 * v["A"] if any(g.living(i) for i in ("Q01", "Q02")) else 0
    bell_alive = g.living("B01")
    active_bound = 6 * g.owned["B01"].charges if bell_alive else 0
    arrival_bound = 2 * turns_left if bell_alive else 0
    needed = v["H"] * v["T"] - v["F"]
    bound = harvest_bound + active_bound + arrival_bound
    if bound >= needed:
        return None
    return dict(reason="proven_impossible_within_turn_cap", guest=v["key"],
                after_turn=v["turn"], turns_left=turns_left,
                F=v["F"], A=v["A"], H=v["H"], T=v["T"],
                U_P=g.owned["U01"].p, bell_alive=bell_alive,
                B_charges=g.owned["B01"].charges,
                harvest_upper_bound=harvest_bound,
                bell_active_upper_bound=active_bound,
                bell_arrival_upper_bound=arrival_bound,
                total_optimistic_fear=bound, required_fear=needed,
                explanation=f"공급자 없음. 남은 불안·벨 액티브·매 턴 벨 도착을 모두 허용해도 공포 상계 {bound} < 필요한 공포 {needed}.")


def _row(g, before, plan, events, intent=None, forced=False):
    return {
        "guest": before["visitor"]["key"],
        "turn": before["visitor"]["turn"],
        "dice": before["dice"],
        "choice": plan["value"],
        "actions": deepcopy(plan["actions"]),
        "arrival_target": plan["arrival_target"],
        "actual_arrival": _actual_arrival(events),
        "intent": deepcopy(intent),
        "forced_first_choice": forced,
        "FHA": [g.visitor[k] for k in ("F", "H", "A")],
        "P": {i: e.p for i, e in g.owned.items()},
        "C": {i: e.c for i, e in g.owned.items()},
        "charges": {i: e.charges for i, e in g.owned.items() if e.kind in ("B", "G")},
        "broken": [e["target"] for e in events if e["event"] == "hit" and e["broken"]],
        "destroyed": [e["target"] for e in events if e["event"] == "hit" and e["destroyed"]],
        "arrival_blocked": sum(e["arrival_blocked"] for e in events if e["event"] == "hit"),
        "active_blocked": sum(e["active_blocked"] for e in events if e["event"] == "hit"),
        "supply": sum(e["supplied"] for e in events if e["event"] == "visit"),
        "harvest_consumed": sum(e["consumed"] for e in events if e["event"] == "visit"),
        "outcome": g.phase,
    }


def run_branch(label, diagnostic, value, actions, arrival_target):
    g = make_case(diagnostic, variant="MUG", seed=13001)
    path = RUNS / f"control_{label}.json"
    meta = dict(mode="controlled_fixed_policy", branch=label, diagnostic=diagnostic,
                seed=13001, variant="MUG", rng_version=RNG_VERSION,
                source_hashes=hashes(), policy=deepcopy(POLICY_META),
                disclosure="Initial state/dice/first choice are forced. Later dice are iid keyed by seed/diagnostic/guest/turn; policy never reads future dice.")
    g.emit("run_metadata", **meta)
    before = g.state()
    first = dict(value=value, actions=actions, arrival_target=arrival_target)
    g.emit("control_forced_choice", plan=first, state=before)
    cursor = len(g.logs)
    g.play(value, actions, arrival_target)
    rows = [_row(g, before, first, g.logs[cursor:], forced=True)]
    g.save(path)
    next_guest_state = None
    impossibility_proof = None
    while True:
        if g.phase == "visitor_end":
            g.advance()
            if g.phase == "turn_ready":
                next_guest_state = g.state()
                g.emit("control_next_guest_start", state=next_guest_state)
            g.save(path)
        if g.phase in ("failed", "management", "complete"):
            break
        if g.phase != "turn_ready":
            raise AssertionError(f"Unexpected phase {g.phase}")
        impossibility_proof = optimistic_impossibility(g)
        if impossibility_proof:
            g.phase = "failed"
            g.emit("proven_impossible", proof=impossibility_proof, state=g.state())
            g.save(path)
            break
        next_guest = g.guest_idx == 0
        intent = recommend(g, unrestricted=True, next_guest=next_guest)
        simulated = g.preview(intent["value"], intent["actions"],
                              arrival_target=intent["arrival_target"], hypothetical=True)
        desires_arrival = _actual_arrival(simulated.logs) is not None
        values = [intent["value"]] if desires_arrival else []
        g.record_intent(values, intent["explanation"], intent["actions"], intent["arrival_target"])
        g.emit("policy_pre_roll", plan=intent)
        # Persist the declared plan before the live random input is requested.
        g.save(path)
        g.begin_turn()
        before = g.state()
        plan = recommend(g, unrestricted=False, next_guest=next_guest)
        g.emit("policy_decision", plan=plan, state=before)
        cursor = len(g.logs)
        g.play(plan["value"], plan["actions"], plan["arrival_target"])
        rows.append(_row(g, before, plan, g.logs[cursor:], intent=intent))
        g.save(path)

    hits = [e for e in g.logs if e["event"] == "hit"]
    actives = Counter(e["owner"] for e in g.logs if e["event"] == "active")
    guests = Counter(row["guest"] for row in rows)
    if next_guest_state is not None:
        guests.setdefault("V2", 0)
    second = [row for row in rows if row["guest"] == "V2"]
    summary = dict(branch=label, diagnostic=diagnostic, mode=meta["mode"],
                   seed=13001, turns=len(rows), guest_turns=dict(guests),
                   kills=sum(e["event"] == "kill" for e in g.logs),
                   breaks=sum(e["broken"] for e in hits),
                   destroyed=sum(e["destroyed"] for e in hits),
                   actives=dict(actives),
                   arrival_blocked=sum(e["arrival_blocked"] for e in hits),
                   active_blocked=sum(e["active_blocked"] for e in hits),
                   next_guest_state=next_guest_state,
                   second_guest_active_uses=sum(len(row["actions"]) for row in second),
                   second_guest_supply=sum(row["supply"] for row in second),
                   second_guest_harvest_consumed=sum(row["harvest_consumed"] for row in second),
                   termination_reason="proven_impossible" if impossibility_proof else
                       ("turn_cap" if g.phase == "failed" else "service_complete"),
                   impossibility_proof=impossibility_proof,
                   final_phase=g.phase, final_state=g.state(),
                   rows=rows, metadata=meta)
    return summary


def main():
    RUNS.mkdir(parents=True, exist_ok=True)
    # Preserve the initially observed cap-only continuation. This is auxiliary
    # evidence of the moderator's missing early stop, not another normal sample.
    prior_summary = RUNS / "control_summary.json"
    old_summary = RUNS / "control_summary_cap_observation.json"
    if prior_summary.exists() and not old_summary.exists():
        prior = json.loads(prior_summary.read_text(encoding="utf-8"))
        if any(r.get("termination_reason") is None for r in prior["results"]):
            shutil.copyfile(prior_summary, old_summary)
            prior_md = RUNS / "control_summary.md"
            if prior_md.exists():
                shutil.copyfile(prior_md, RUNS / "control_summary_cap_observation.md")
            for label, *_ in BRANCHES:
                src = RUNS / f"control_{label}.json"
                if src.exists():
                    shutil.copyfile(src, RUNS / f"control_{label}_cap_observation.json")
    old_md = RUNS / "control_summary_cap_observation.md"
    if old_md.exists():
        text = old_md.read_text(encoding="utf-8")
        for label, *_ in BRANCHES:
            text = text.replace(f"(control_{label}.json)",
                                f"(control_{label}_cap_observation.json)")
        old_md.write_text(text, encoding="utf-8")
    results = [run_branch(*branch) for branch in BRANCHES]
    payload = dict(mode="controlled_fixed_policy", policy=POLICY_META,
                   rng_version=RNG_VERSION, source_hashes=hashes(), results=results)
    (RUNS / "control_summary.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# 설정 13 통제 후속 7분기", "",
             "seed 13001 · MUG · 강제 첫 상태·눈·선택 뒤 고정 공개정보 정책 public-two-turn-v1.", "",
             "후속 정책은 현재 턴과 다음 독립 3d6의 기대값까지만 본다. 미래 실제 눈을 조회하지 않으며 인간의 선호·재미·최적 전략을 나타내지 않는다. 정상 캠페인과 합산하지 않는다.", "",
             "공급자가 파괴된 상태에서는 남은 불안·벨의 모든 횟수·매 턴 벨 도착을 허용한 낙관적 공포 상계가 남은 필요량보다 작으면 진행자가 입증된 완주 불능으로 중단한다. 엔진 규칙이나 정책 가중치를 바꾸지 않았다.", "",
             "| 분기 | 손님별 턴 | 처치 | 파훼 / 파괴 | 도착 / 액티브 흡수 | 종료 |",
             "|---|---|---:|---:|---:|---|"]
    for r in results:
        guests = ", ".join(f"{k} {v}" for k, v in r["guest_turns"].items())
        lines.append(f"| {r['branch']} | {guests} | {r['kills']} | {r['breaks']} / {r['destroyed']} | {r['arrival_blocked']} / {r['active_blocked']} | {r['termination_reason']} |")
    for r in results:
        lines += ["", f"## {r['branch']}", "",
                  f"[원본 이벤트](control_{r['branch']}.json). 첫 행은 강제 선택이며 이후는 고정 정책이다.", "",
                  "| 손님·턴 | 눈 → 선택 | 액티브 | 실제 도착 / 보호 대상 | 종료 F/H/A | 파훼 / 파괴 |",
                  "|---|---|---|---|---|---|"]
        for row in r["rows"]:
            dice = "/".join(map(str, row["dice"]))
            actions = ", ".join(f"{a[0]}→{a[1] or '손님'}" for a in row["actions"]) or "없음"
            fha = "/".join(map(str, row["FHA"]))
            breaks = ",".join(row["broken"]) or "없음"
            destroyed = ",".join(row["destroyed"]) or "없음"
            lines.append(f"| {row['guest']}·{row['turn']} | {dice} → {row['choice']} | {actions} | {row['actual_arrival'] or '도착 전 처치'} / {row['arrival_target'] or '-'} | {fha} | {breaks} / {destroyed} |")
        if r["next_guest_state"]:
            state = r["next_guest_state"]
            assets = ", ".join(f"{i} P{e['p']}" for i, e in state["owned"].items())
            gcharges = state["owned"]["G01"]["charges"]
            lines += ["", f"V2 시작: {assets}, G잔량{gcharges}. 모든 C는0, F/A는0으로 교체했다.",
                      f"V2 실제 공급량 {r['second_guest_supply']}, 수확 소비량 {r['second_guest_harvest_consumed']}, 액티브 사용 {r['second_guest_active_uses']}회."]
        else:
            lines += ["", "첫 진단 손님을 넘기지 못해 V2로 진행하지 않았다."]
        if r["impossibility_proof"]:
            proof = r["impossibility_proof"]
            lines += ["", f"입증 중단: {proof['guest']} {proof['after_turn']}턴 뒤, 남은 {proof['turns_left']}턴. {proof['explanation']}"]
    lines += ["", "최초에는 진행자가 8턴 상한까지만 처리해 확정된 결과 뒤에도 입력을 계속한 분기가 있었다. 그 기록은 [별도 상한 관찰](control_summary_cap_observation.md)과 `*_cap_observation.json`으로 보존했다. 위 7분기 통계에는 입증 중단 이후의 턴을 넣지 않는다. 이 관찰은 진행자의 종료 처리 보완 근거이며, 불리한 상태나 괴이 손실 자체가 재미를 떨어뜨린다는 증거는 아니다.", "",
              "모든 원본에는 정책 가중치·난수 방식·입력 문서와 구현의 SHA-256을 기록했다. 구현 변경 이력을 프로젝트 문서에 추가하지 않았다.", ""]
    (RUNS / "control_summary.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps([{k: r[k] for k in ("branch", "turns", "guest_turns", "kills", "breaks", "destroyed", "arrival_blocked", "active_blocked", "final_phase")} for r in results], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
