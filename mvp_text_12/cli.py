"""Persistent text console: python -B cli.py --save runs/main.json COMMAND ..."""
import argparse
import json
from pathlib import Path
from engine import Game, WEB, VISITORS
from policy import choose_turn, run_guest

def show(g):
    print(f"phase={g.phase} service={g.service} cash={g.cash} bought={sorted(g.purchased)}")
    if g.visitor:
        print("visitor:", json.dumps(g.visitor, ensure_ascii=False))
    print("dice:", g.dice, "selected:", g.selected)
    for floor, i in enumerate(g.board, 1):
        if i:
            e = g.owned[i]
            print(f"{floor}: {i} C={e.c}/12 P={e.p}/{e.maxp} charges={e.charges} shield={e.shield}")
        else:
            print(f"{floor}: empty")
    print("stored:", [i for i in g.owned if i not in g.board])

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--save", default="runs/main.json")
    p.add_argument("command", choices=["new", "show", "buy", "layout", "start", "roll", "choose",
                                      "active", "move", "next", "preview", "suggest", "auto", "note"])
    p.add_argument("args", nargs="*")
    args = p.parse_args()
    path = Path(args.save)
    path.parent.mkdir(parents=True, exist_ok=True)
    if args.command == "new":
        if path.exists():
            raise ValueError("Save already exists; choose another path")
        g = Game.new(int(args.args[0]) if args.args else 20261031)
    else:
        g = Game.load(path)
    c, a = args.command, args.args
    if c == "buy": g.buy(a[0])
    elif c == "layout": g.arrange([None if i == "-" else i for i in a])
    elif c == "start": g.start_service()
    elif c == "roll": g.begin_turn()
    elif c == "choose": g.choose(int(a[0]))
    elif c == "active": g.active(a[0], a[1] if len(a) > 1 else None)
    elif c == "move": g.move()
    elif c == "next": g.advance()
    elif c == "note": g.emit("player_note", text=" ".join(a))
    elif c == "preview":
        for value in sorted(set(g.dice)):
            sample = g.preview(value)
            print(f"\nNO-ACTIVE PREVIEW die={value} path={g.path(value)} attacks={g.attack_list(g.path(value))}")
            show(sample)
    elif c == "suggest":
        print(json.dumps(choose_turn(g, g.guest_idx == 0), ensure_ascii=False, indent=2))
    elif c == "auto": run_guest(g, g.guest_idx == 0)
    if c not in ("preview", "suggest", "show"):
        g.save(path)
    show(g)
if __name__ == "__main__":
    main()
