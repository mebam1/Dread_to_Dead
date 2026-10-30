"""Local text command session. Accept one JSON argv array or a batch of arrays."""
import json
import sys
import traceback
import cli

print("Config10 text MVP ready. Enter JSON command array; quit to finish.",flush=True)
while True:
    try:
        line=input("mvp> ")
    except EOFError:
        break
    if line.strip() in ("quit","exit"):
        break
    try:
        value=json.loads(line)
        commands=value if value and isinstance(value[0],list) else [value]
        for command in commands:
            print("> "+" ".join(command),flush=True)
            sys.argv=["cli.py"]+command
            cli.main()
    except Exception as exc:
        print("ERROR:",repr(exc),flush=True)
    except SystemExit as exc:
        print("CLI exit:",exc.code,flush=True)
