"""Persistent command-line console for config 13."""
import argparse
import json
from pathlib import Path

from engine import Game, VARIANTS


def show(g):
    print(f"phase={g.phase} variant={g.variant} service={g.service} cash={g.cash}")
    if g.visitor:
        print("visitor:", json.dumps(g.visitor, ensure_ascii=False))
    print("dice:", g.dice, "selected:", g.selected)
    print("intent:", json.dumps(g.pending_intent, ensure_ascii=False))
    for floor, entity_id in enumerate(g.board, 1):
        if entity_id:
            e = g.owned[entity_id]
            print(f"{floor}: {entity_id} C={e.c}/12 P={e.p}/{e.maxp} "
                  f"charges={e.charges} shield={e.shield} "
                  f"(active={e.shield_active}, arrival={e.shield_arrival})")
        else:
            print(f"{floor}: empty")


def parse_actions(items):
    result = []
    for item in items:
        parts = item.split(":")
        if len(parts) not in (1, 2):
            raise ValueError("Action notation: B01 or G01:U01")
        result.append((parts[0], parts[1] if len(parts) == 2 else None))
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--save", default="runs/my_game.json")
    sub = p.add_subparsers(dest="command", required=True)
    new = sub.add_parser("new")
    new.add_argument("seed", type=int, nargs="?", default=13001)
    new.add_argument("variant", choices=VARIANTS, nargs="?", default="MUG")
    new.add_argument("--stream", default="normal")
    for name in ("show", "start", "roll", "next"):
        sub.add_parser(name)
    intent = sub.add_parser("intent")
    intent.add_argument("values", help="comma-separated desired movement distances, or - for no preference")
    intent.add_argument("reason")
    intent.add_argument("--actions", nargs="*", default=[])
    intent.add_argument("--arrival", default=None)
    choose = sub.add_parser("choose")
    choose.add_argument("value", type=int)
    active = sub.add_parser("active")
    active.add_argument("owner")
    active.add_argument("target", nargs="?")
    move = sub.add_parser("move")
    move.add_argument("target", nargs="?")
    play = sub.add_parser("play")
    play.add_argument("value", type=int)
    play.add_argument("--actions", nargs="*", default=[])
    play.add_argument("--arrival")
    preview = sub.add_parser("preview")
    preview.add_argument("value", type=int, nargs="?")
    preview.add_argument("--actions", nargs="*", default=[])
    preview.add_argument("--arrival")
    note = sub.add_parser("note")
    note.add_argument("text")
    args = p.parse_args()
    path = Path(args.save)
    if args.command == "new":
        if path.exists():
            raise ValueError("Save already exists; choose another path")
        g = Game.new(args.seed, args.variant, args.stream)
    else:
        g = Game.load(path)
    c = args.command
    if c == "start":
        g.start_service()
    elif c == "intent":
        values = [] if args.values == "-" else [int(v) for v in args.values.split(",")]
        g.record_intent(values, args.reason, parse_actions(args.actions), args.arrival)
    elif c == "roll":
        g.begin_turn()
    elif c == "choose":
        g.choose(args.value)
    elif c == "active":
        g.active(args.owner, args.target)
    elif c == "move":
        g.move(args.target)
    elif c == "play":
        g.play(args.value, parse_actions(args.actions), args.arrival)
    elif c == "next":
        g.advance()
    elif c == "note":
        g.emit("player_note", text=args.text)
    elif c == "preview":
        hypothetical = g.phase == "turn_ready"
        values = [args.value] if args.value is not None else (list(range(1, 7)) if hypothetical else sorted(set(g.dice)))
        actions = parse_actions(args.actions)
        for value in values:
            targets = [args.arrival]
            if args.arrival is None and g.needs_arrival_target(value):
                targets = [i for i in g.board if i and g.living(i)]
            for target in targets:
                sample = g.preview(value, actions, target, hypothetical)
                print(f"\n{'HYPOTHETICAL' if hypothetical else 'PUBLIC'} PREVIEW "
                      f"die={value} arrival_target={target} path={g.path(value)} "
                      f"attacks={g.attack_list(g.path(value))}")
                show(sample)
    if c not in ("preview", "show"):
        g.save(path)
    show(g)


if __name__ == "__main__":
    main()
