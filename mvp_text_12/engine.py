"""Config 12 text engine. Standard library only; all numbers are trial values."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from copy import deepcopy
from pathlib import Path
import hashlib
import json
import random

MAXP = {"U": 2, "Q": 2, "B": 1, "G": 2, "E": 1, "R": 2}
WEB = {"G01": None, "E01": None, "R01": "G01", "Q03": "E01"}
VISITORS = [
    dict(key="V1", name="성급한 투숙객", T=12, H=1, pattern="double", power=6, reward=2),
    dict(key="V2", name="복도 점검원", T=16, H=2, pattern="path", power=6, reward=2),
    dict(key="V3", name="두 번 확인하는 손님", T=12, H=2, pattern="double", power=6, reward=2),
    dict(key="V4", name="거울 감찰관", T=16, H=2, pattern="offset", power=8, reward=2),
]

@dataclass
class Entity:
    id: str
    kind: str
    c: int = 0
    p: int | None = None
    charges: int | None = None
    shield: int = 0
    def __post_init__(self):
        if self.kind not in MAXP:
            raise ValueError("Unknown anomaly")
        if self.p is None:
            self.p = self.maxp
        if self.charges is None:
            self.charges = 2 if self.kind in ("B", "G") else 0
    @property
    def maxp(self):
        return MAXP[self.kind]

class Game:
    @classmethod
    def new(cls, seed=20261031):
        g = cls()
        g.seed = seed
        g.owned = {i: Entity(i, i[0]) for i in ("U01", "Q01", "Q02", "B01")}
        g.board = ["U01", None, "Q01", None, "Q02", "B01"]
        g.cash, g.earned, g.spent, g.grant = 4, 0, 0, 4
        g.purchased = set()
        g.service, g.guest_idx = -1, 0
        g.visitor = None
        g.phase = "management"
        g.dice, g.selected = [], None
        g.logs = []
        g.controlled = False
        g.emit("initial", state=g.state())
        return g

    @classmethod
    def diagnostic(cls, layout, spec, seed=20261031):
        g = cls.new(seed)
        g.controlled = True
        g.owned = {i: Entity(i, i[0]) for i in layout if i is not None}
        g.board = list(layout)
        g.cash = g.earned = g.spent = g.grant = 0
        g.service = 0
        g.start_guest(spec)
        return g

    def emit(self, event, **data):
        self.logs.append(dict(event=event, **data))

    def state(self):
        return dict(phase=self.phase, service=self.service, guest_idx=self.guest_idx,
                    board=list(self.board), owned={i: asdict(e) for i, e in self.owned.items()},
                    cash=self.cash, earned=self.earned, spent=self.spent, grant=self.grant,
                    purchased=sorted(self.purchased), visitor=deepcopy(self.visitor),
                    dice=list(self.dice), selected=self.selected)

    def save(self, path):
        payload = self.state()
        payload.update(seed=self.seed, logs=self.logs, controlled=self.controlled)
        Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path):
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        g = cls()
        for key, value in payload.items():
            setattr(g, key, value)
        g.owned = {i: Entity(**e) for i, e in payload["owned"].items()}
        g.purchased = set(payload["purchased"])
        return g

    def buy(self, node):
        if self.phase != "management":
            raise ValueError("Purchases require management")
        if node not in WEB or node in self.purchased:
            raise ValueError("Unknown or already bought node")
        if WEB[node] is not None and WEB[node] not in self.purchased:
            raise ValueError("Parent node not bought")
        if self.cash < 4:
            raise ValueError("Insufficient currency")
        before = self.cash
        self.cash -= 4
        self.spent += 4
        self.purchased.add(node)
        self.owned[node] = Entity(node, node[0])
        self.emit("buy", node=node, cost=4, before=before, after=self.cash)

    def arrange(self, layout):
        if self.phase != "management":
            raise ValueError("Arrangement requires management")
        present = [i for i in layout if i is not None]
        if len(layout) != 6 or len(set(present)) != len(present) or any(i not in self.owned for i in present):
            raise ValueError("Invalid six-floor layout")
        self.board = list(layout)
        self.emit("layout", board=self.board.copy())

    def start_service(self):
        if self.phase != "management" or self.service >= 1:
            raise ValueError("No new service available")
        before = self.state()
        self.service += 1
        self.guest_idx = 0
        for e in self.owned.values():
            e.c, e.p, e.shield = 0, e.maxp, 0
            e.charges = 2 if e.kind in ("B", "G") else 0
        self.emit("service_reset", before=before, after=self.state())
        self.start_guest(VISITORS[self.service * 2])

    def start_guest(self, spec):
        """Low-level diagnostic entry; normal games use advance/start_service."""
        if self.phase in ("failed", "complete"):
            raise ValueError("Cannot resume ended run")
        before = self.state()
        for e in self.owned.values():
            e.c, e.shield = 0, 0
        self.visitor = dict(key=spec.get("key", "diagnostic"),
                            name=spec.get("name", spec.get("key", "diagnostic")),
                            T=spec.get("T", 99), H=spec.get("H", 1),
                            initial_H=spec.get("H", 1),
                            pattern=spec.get("pattern", "double"), power=spec.get("power", 6),
                            reward=spec.get("reward", 2), p=0, F=0, A=0, turn=0)
        self.dice, self.selected = [], None
        self.phase = "turn_ready"
        self.emit("guest_reset", before=before, after=self.state())

    def advance(self):
        if self.phase != "visitor_end":
            raise ValueError("Only a defeated visitor can advance")
        if self.guest_idx == 0:
            self.guest_idx = 1
            self.start_guest(VISITORS[self.service * 2 + 1])
        else:
            self.phase = "management" if self.service == 0 else "complete"
            self.emit("service_end", state=self.state())

    def begin_turn(self, forced=None):
        if self.phase != "turn_ready":
            raise ValueError("Roll only at turn start")
        if self.visitor["turn"] >= 8:
            raise ValueError("Turn limit")
        if forced is not None and (len(forced) != 3 or any(type(x) is not int or not 1 <= x <= 6 for x in forced)):
            raise ValueError("Three d6 values required")
        self.visitor["turn"] += 1
        if forced is None:
            key = f'{self.seed}:{self.visitor["key"]}:{self.visitor["turn"]}'
            seed = int.from_bytes(hashlib.sha256(key.encode()).digest(), "big")
            rng = random.Random(seed)
            self.dice = [rng.randint(1, 6) for _ in range(3)]
        else:
            self.controlled = True
            self.dice = list(forced)
        self.selected = None
        self.phase = "choice"
        self.emit("turn_start", forced=forced is not None, state=self.state())
        return self.dice.copy()

    def choose(self, value):
        if self.phase != "choice" or value not in self.dice:
            raise ValueError("Choose one of the current dice exactly once")
        self.selected = value
        self.phase = "active"
        self.emit("choose", value=value, path=self.path(value),
                  attacks=self.attack_list(self.path(value)))

    def living(self, entity_id):
        return entity_id in self.board and entity_id in self.owned and self.owned[entity_id].p > 0

    def active(self, owner, target=None):
        if self.phase != "active" or not self.living(owner):
            raise ValueError("Owner must be alive, deployed, in active phase")
        e = self.owned[owner]
        if e.kind not in ("B", "G", "R"):
            raise ValueError("No active ability")
        if e.kind in ("B", "G") and e.charges < 1:
            raise ValueError("No charges")
        if e.kind in ("G", "R") and not self.living(target):
            raise ValueError("Target must be alive and deployed")
        if e.kind == "B" and target is not None:
            raise ValueError("Bell targets the visitor")
        if e.kind == "R" and (self.visitor["A"] < 2 or self.owned[target].c <= 0):
            raise ValueError("R needs A2 and positive C")
        before = self.state()
        if e.kind in ("B", "G"):
            e.charges -= 1
        if e.kind == "B":
            self.fear(6, owner + ":active")
        elif e.kind == "G":
            self.owned[target].shield += 6
        else:
            self.visitor["A"] -= 2
            self.owned[target].c = max(0, self.owned[target].c - 6)
        self.emit("active", owner=owner, kind=e.kind, target=target, before=before, after=self.state())
        if self.phase == "visitor_end":
            self.finish_turn()

    def fear(self, amount, source):
        v = self.visitor
        if v["H"] <= 0:
            return
        before = (v["F"], v["H"])
        v["F"] += amount
        overflow = 0
        if v["F"] >= v["T"]:
            overflow = v["F"] - v["T"]
            v["H"] -= 1
            v["F"] = 0
        self.emit("fear", source=source, amount=amount, before=before,
                  after=(v["F"], v["H"]), overflow=overflow)
        if v["H"] == 0:
            self.cash += v["reward"]
            self.earned += v["reward"]
            self.phase = "visitor_end"
            self.emit("kill", key=v["key"], reward=v["reward"], cash=self.cash)

    def path(self, r):
        return [1 + ((self.visitor["p"] + i - 1) % 6) for i in range(1, r + 1)]

    def attack_list(self, path):
        if not path:
            return []
        v, d = self.visitor, path[-1]
        if v["pattern"] == "none":
            floors = []
        elif v["pattern"] == "double":
            floors = [d, d]
        elif v["pattern"] == "path":
            floors = path
        elif v["pattern"] == "offset":
            floors = [1 + ((d - 2 - 1) % 6), 1 + ((d + 2 - 1) % 6)]
        else:
            raise ValueError("Unknown attack pattern")
        return [(i, v["power"]) for i in floors]

    def hit(self, floor, power):
        entity_id = self.board[floor - 1]
        if entity_id is None or not self.living(entity_id):
            self.emit("miss", floor=floor, power=power, target=entity_id)
            return
        e = self.owned[entity_id]
        before = asdict(e)
        blocked = min(power, e.shield)
        e.shield -= blocked
        e.c += power - blocked
        broken = False
        if e.c >= 12:
            e.p -= 1
            e.c = 0
            broken = True
        self.emit("hit", floor=floor, target=entity_id, power=power, blocked=blocked,
                  before=before, after=asdict(e), broken=broken, destroyed=e.p == 0)

    def move(self):
        if self.phase != "active":
            raise ValueError("Movement requires selected die and living visitor")
        path = self.path(self.selected)
        for step, floor in enumerate(path):
            arrival = step == len(path) - 1
            self.visitor["p"] = floor
            entity_id = self.board[floor - 1]
            before = deepcopy(self.visitor)
            if entity_id is not None and self.living(entity_id):
                e = self.owned[entity_id]
                if e.kind == "U":
                    self.visitor["A"] = min(9, self.visitor["A"] + (1 if arrival else 2))
                elif e.kind == "E":
                    a = self.visitor["A"]
                    self.visitor["A"] = min(9, a + (1 if arrival else min(2, a, 9 - a)))
                elif arrival and e.kind == "Q":
                    n = min(3, self.visitor["A"])
                    self.visitor["A"] -= n
                    self.fear(4 * n, entity_id + ":arrival")
                elif arrival and e.kind == "B":
                    self.fear(2, entity_id + ":arrival")
            self.emit("visit", floor=floor, target=entity_id, mode="arrival" if arrival else "pass",
                      before=before, after=deepcopy(self.visitor))
            if self.phase == "visitor_end":
                break
        if self.phase != "visitor_end":
            for floor, power in self.attack_list(path):
                self.hit(floor, power)
        self.finish_turn()

    def finish_turn(self):
        for e in self.owned.values():
            e.shield = 0
        if self.phase != "visitor_end":
            self.phase = "failed" if self.visitor["turn"] >= 8 else "turn_ready"
        self.emit("turn_end", state=self.state(),
                  outcome="kill" if self.phase == "visitor_end" else "cap" if self.phase == "failed" else "continue")

    def play(self, value, actions=()):
        self.choose(value)
        for owner, target in actions:
            if self.phase == "visitor_end":
                break
            self.active(owner, target)
        if self.phase == "active":
            self.move()

    def clone(self):
        g = deepcopy(self)
        g.logs = []
        return g

    def preview(self, value, actions=()):
        if self.phase != "choice":
            raise ValueError("Preview current public dice only")
        g = self.clone()
        g.play(value, actions)
        return g
