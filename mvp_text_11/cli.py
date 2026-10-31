"""Config 11 text interface. Standard library only."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import pickle
import sys
sys.stdout.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path
from engine import Game

BASE = Path(__file__).resolve().parent
PROJECT = BASE.parent


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def compact(state):
    """Show only public information; JSONL retains the complete public state."""
    keep = ("phase", "service", "visitor", "turn", "hand", "discard", "draw_count",
            "penalty", "dice", "selected", "mana", "shields", "redirects",
            "placements", "cash", "totals", "options")
    data = {k: state[k] for k in keep if k in state}
    data["board"] = [
        f"{tile['slot']}:{tile['id']} C{tile.get('C')}/L{tile.get('L')} P{tile.get('P')}"
        if tile.get("id") else f"{tile['slot']}:empty" for tile in state.get("board", [])]
    data["deck"] = state.get("deck", [])
    data["reserve"] = [cid for cid in state.get("pool", {}) if cid not in state.get("deck", [])]
    return data


def arguments(items):
    result = {}
    for item in items:
        if "=" not in item:
            raise ValueError("Use key=value arguments.")
        key, raw = item.split("=", 1)
        if key in ("slots", "cards"):
            value = [None if x == "-" else x for x in raw.split(",")] if raw else []
        elif raw.lstrip("-").isdigit():
            value = int(raw)
        elif raw in ("true", "false"):
            value = raw == "true"
        else:
            value = raw
        result[key] = value
    return result


def scenario(name, seed):
    common = {"seed": seed}
    if name in ("d7", "d7-final"):
        return Game.diagnostic(**common, tiles={
            2: {"id": "Q01", "kind": "Q", "C": 0, "P": 2},
            6: {"id": "U01", "kind": "U", "C": 16, "P": 2}},
            hand=["H01", "G01"], draw=[], discard=[], pool=["H01", "G01"],
            dice=[2, 4, 6], A=3, T=12, H=1, pattern="arrival", reward=6,
            visitor_index=1 if name == "d7-final" else 0)
    if name in ("d2-arrival", "d2-offset"):
        return Game.diagnostic(**common, tiles={
            6: {"id": "Q01", "kind": "Q", "C": 18, "P": 1}},
            hand=["H01", "G01"], dice=[2, 4, 6], A=2,
            pattern="arrival" if name.endswith("arrival") else "offset")
    if name in ("d3-t12", "d3-t16"):
        return Game.diagnostic(**common, tiles={
            1: {"id": "U01", "kind": "U", "C": 18, "P": 1},
            2: {"id": "V01", "kind": "V"},
            3: {"id": "Q01", "kind": "Q"}},
            hand=["H01", "B01"], dice=[3, 3, 3], A=0,
            T=int(name[-2:]), pattern="offset", reward=6)
    raise ValueError("Unknown scenario; use d7, d2-arrival, d2-offset, d3-t12, d3-t16.")


def persist(run, game, record):
    tmp = run / "state.tmp"
    tmp.write_bytes(pickle.dumps(game))
    tmp.replace(run / "state.pkl")
    with (run / "play.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Config 11 text MVP; public views never reveal the future draw order.")
    parser.add_argument("--run", default="runs/main")
    parser.add_argument("--seed", type=int, default=1101)
    parser.add_argument("--scenario")
    parser.add_argument("--reason", default="")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("op", nargs="?", default="view")
    parser.add_argument("items", nargs="*")
    args = parser.parse_args()
    run = (BASE / args.run).resolve()
    if not run.is_relative_to(BASE):
        raise ValueError("Run folders must be inside mvp_text_11.")
    if args.op == "new":
        if (run / "state.pkl").exists():
            raise ValueError("Run already exists. Choose a new run name.")
        game = scenario(args.scenario, args.seed) if args.scenario else Game(args.seed)
        run.mkdir(parents=True, exist_ok=True)
        sources = ["rules.md", "undecided.md", "mvps/mvp-config-11.md"]
        metadata = {
            "mode": "agent-play / controlled diagnostic" if args.scenario else "agent-play / random campaign",
            "scenario": args.scenario, "seed": args.seed,
            "sources": {p: hashlib.sha256((PROJECT / p).read_bytes()).hexdigest() for p in sources}}
        (run / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        record = {"time": datetime.now(timezone.utc).isoformat(), "action": {"op": "new"},
                  "reason": args.reason, "before": None, "after": game.public(), "events": game.events[:]}
        persist(run, game, record)
        emit(game.public() if args.full else compact(game.public()))
        return
    state_path = run / "state.pkl"
    if not state_path.exists():
        raise ValueError("Create a run with new first.")
    # Only load state files created by this local program.
    game = pickle.loads(state_path.read_bytes())
    if args.op == "view":
        emit(game.public() if args.full else compact(game.public()))
        return
    if args.op == "events":
        count = int(arguments(args.items).get("last", 20))
        emit(game.events[-count:])
        return
    if args.op == "sequence":
        # Explicit player choices only. Stops on an error; never chooses from a future roll.
        results = []
        for step in args.items:
            name, _, fields = step.partition(":")
            action = {"op": name, **arguments(fields.split(",") if fields else [])}
            before = game.public()
            result = game.command(action)
            after = game.public()
            record = {"time": datetime.now(timezone.utc).isoformat(), "action": action,
                      "reason": args.reason, "before": before, "after": after,
                      "events": result.get("events", [])}
            persist(run, game, record)
            results.append({"action": action, "events": record["events"]})
        emit({"steps": results, "state": game.public() if args.full else compact(game.public())})
        return
    action = {"op": args.op, **arguments(args.items)}
    if args.op == "preview":
        trial = copy.deepcopy(game)
        if "value" in action:
            trial.command({"op": "choose", "value": action["value"]})
        result = trial.command({"op": "preview"})
        result["state"] = result["state"] if args.full else compact(result["state"])
        emit(result)
        return
    before = game.public()
    result = game.command(action)
    after = game.public()
    record = {"time": datetime.now(timezone.utc).isoformat(), "action": action,
              "reason": args.reason, "before": before, "after": after,
              "events": result.get("events", [])}
    persist(run, game, record)
    emit({"events": record["events"], "state": after if args.full else compact(after)})


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError) as error:
        emit({"error": str(error)})
        raise SystemExit(2)
