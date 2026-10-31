"""Interactive console for the config 11 MVP."""
import contextlib
import io
import json
import shlex
import sys
from cli import main

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
defaults = sys.argv[1:]
print("Config 11 text MVP. Commands: new, view, fusion, arrange, start, roll, choose, card, move, preview, sequence. Type exit to close.")
while True:
    try:
        line = input("mvp11> ")
    except EOFError:
        break
    if line.strip() in ("exit", "quit"):
        break
    if not line.strip():
        continue
    sys.argv = ["cli.py", *defaults, *shlex.split(line)]
    capture = io.StringIO()
    try:
        with contextlib.redirect_stdout(capture):
            main()
        result = json.loads(capture.getvalue())
        if "state" in result:
            events = result.get("events", [])
            for step in result.get("steps", []):
                events.extend(step.get("events", []))
            significant = [e for e in events if e["event"] not in
                           ("visit", "choose", "draw", "turn_start", "supply", "movement_end")]
            print(json.dumps({"events": significant, "state": result["state"]}, ensure_ascii=False))
        else:
            print(json.dumps(result, ensure_ascii=False))
    except (ValueError, KeyError, SystemExit) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
