"""JSON-in/text-out facilitator. Intent is saved before the current dice are drawn."""
from pathlib import Path
import json
import sys
from engine import Game


def compact(g):
    return dict(variant=g.variant, phase=g.phase, service=g.service,
                visitor=g.visitor, dice=g.dice,
                entities={i: dict(c=e.c, p=e.p, charges=e.charges)
                          for i, e in g.owned.items()})


def view(g):
    result = compact(g)
    result['options'] = []
    if g.phase not in ('turn_ready', 'choice'):
        return result
    values = range(1, 7) if g.phase == 'turn_ready' else sorted(set(g.dice))
    for r in values:
        dest = g.path(r)[-1]
        owner = g.board[dest - 1]
        targets = [None]
        if owner == 'G01' and g.living(owner) and g.variant in ('MG', 'MUG'):
            targets = [i for i in g.board if i and g.living(i)]
        for target in targets:
            out = g.preview(r, arrival_target=target, hypothetical=g.phase == 'turn_ready')
            result['options'].append(dict(value=r, floor=dest, role=owner,
                guard=target, F=out.visitor['F'], H=out.visitor['H'], A=out.visitor['A'],
                damage={i: [e.c, e.p] for i, e in out.owned.items()
                        if (e.c, e.p) != (g.owned[i].c, g.owned[i].p)}, phase=out.phase))
    return result


def handle(req):
    path = Path(req['path'])
    op = req['op']
    if op == 'new':
        if path.exists():
            raise ValueError('Existing play records are not overwritten')
        g = Game.new(req['seed'], req['variant'])
        g.emit('run_metadata', mode='normal_manual_ai', actor=req.get('actor', 'assistant'),
               prior_exposure=req.get('prior_exposure', 'Rules available; actual exposure must be reported separately.'))
        g.start_service()
        path.parent.mkdir(parents=True, exist_ok=True)
        g.save(path)
        return view(g)
    g = Game.load(path)
    if op == 'intent_roll':
        g.record_intent(req['values'], req['reason'], req.get('actions', ()), req.get('arrival_target'))
        g.save(path)
        g.begin_turn()
        g.save(path)
    elif op == 'play':
        actions = req.get('actions', ())
        target = req.get('arrival_target')
        g.emit('manual_decision', value=req['value'], actions=actions,
               arrival_target=target, reason=req['reason'], before=g.state())
        g.play(req['value'], actions, target)
        while g.phase in ('visitor_end', 'management'):
            if g.phase == 'visitor_end':
                g.advance()
            elif g.phase == 'management':
                g.start_service()
        g.save(path)
    elif op == 'preview':
        out = g.preview(req['value'], req.get('actions', ()), req.get('arrival_target'),
                        hypothetical=g.phase == 'turn_ready')
        return dict(result=compact(out), events=out.logs)
    elif op != 'look':
        raise ValueError('Unknown operation')
    return view(g)


if __name__ == '__main__':
    print(json.dumps(handle(json.load(sys.stdin)), ensure_ascii=False, indent=2))
