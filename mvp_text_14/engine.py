"""Standalone config 14 v0.2 rules engine; standard library only."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from pathlib import Path
import hashlib
import json
import random
import tempfile

MAXP = {"U": 2, "G": 2, "Q": 2, "B": 1}
VARIANTS = ("C13", "M14", "C14")
BOARD = ["U01", "G01", "Q01", None, "Q02", "B01"]
VISITORS = [
    dict(key="V1", name="성급한 투숙객", T=12, H=1, pattern="double", power=6, reward=2),
    dict(key="V2", name="복도 점검원", T=16, H=2, pattern="path", power=6, reward=2),
    dict(key="V3", name="두 번 확인하는 손님", T=12, H=2, pattern="double", power=6, reward=2),
    dict(key="V4", name="거울 감찰관", T=16, H=2, pattern="offset", power=8, reward=2),
]
RNG_VERSION = "sha256-seed-stream-service-guest-turn-kind:python-random-v2"


@dataclass
class Entity:
    id: str
    kind: str
    c: int = 0
    p: int | None = None
    charges: int | None = None
    shield: int = 0
    shield_active: int = 0
    shield_arrival: int = 0
    shield_sources: list = field(default_factory=list)

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
    def new(cls, seed=14001, variant="M14", stream="normal"):
        if type(seed) is not int or variant not in VARIANTS or not isinstance(stream, str) or not stream:
            raise ValueError("Integer seed, known variant, and nonempty stream required")
        g = cls()
        g.seed, g.variant, g.stream = seed, variant, stream
        g.board = BOARD.copy()
        g.owned = {i: Entity(i, i[0]) for i in g.board if i}
        g.cash = g.earned = g.spent = g.grant = 0
        g.purchased = set()
        g.service, g.guest_idx = -1, 0
        g.visitor = None
        g.phase = "management"
        g.dice, g.selected, g.pending_intent = [], None, None
        g.controlled = False
        g.idle_count, g.idle_limit = 0, 3
        g.escape_floor, g.g_uses = None, 0
        g.penalty_amount, g.penalty_enabled = 12, variant != "C13"
        g.activity = dict(fear=False, state=False, active=False)
        g._preview_mode = False
        g.logs = []
        g.emit("initial", rng_version=RNG_VERSION, state=g.state())
        return g

    @classmethod
    def diagnostic(cls, spec, seed=14001, variant="M14", stream="diagnostic"):
        g = cls.new(seed, variant, stream)
        g.controlled = True
        g.service = 0
        g.start_guest(spec)
        return g

    def emit(self, event, **data):
        entry = dict(event=event, service=self.service,
                     guest=self.visitor['key'] if self.visitor else None,
                     turn=self.visitor['turn'] if self.visitor else 0)
        entry.update(data)
        self.logs.append(entry)

    def state(self):
        return dict(phase=self.phase, variant=self.variant, stream=self.stream,
                    service=self.service, guest_idx=self.guest_idx,
                    board=list(self.board), owned={i: asdict(e) for i, e in self.owned.items()},
                    cash=self.cash, earned=self.earned, spent=self.spent, grant=self.grant,
                    purchased=sorted(self.purchased), visitor=deepcopy(self.visitor),
                    dice=list(self.dice), selected=self.selected,
                    idle_count=self.idle_count, idle_limit=self.idle_limit,
                    escape_floor=self.escape_floor, g_uses=self.g_uses,
                    penalty_amount=self.penalty_amount, penalty_enabled=self.penalty_enabled,
                    activity=deepcopy(self.activity),
                    pending_intent=deepcopy(self.pending_intent))

    def save(self, path):
        payload = self.state()
        payload.update(seed=self.seed, logs=self.logs, controlled=self.controlled,
                       rng_version=RNG_VERSION)
        path = Path(path)
        encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as f:
                temporary = Path(f.name)
                f.write(encoded)
            temporary.replace(path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()

    @classmethod
    def load(cls, path):
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("rng_version", RNG_VERSION) != RNG_VERSION:
            raise ValueError("Incompatible RNG version")
        g = cls()
        for key, value in payload.items():
            if key != "rng_version":
                setattr(g, key, value)
        g.owned = {i: Entity(**e) for i, e in payload["owned"].items()}
        g.purchased = set(payload.get("purchased", []))
        g._preview_mode = False
        return g

    @staticmethod
    def _clear_shield(e):
        e.shield = e.shield_active = e.shield_arrival = 0
        e.shield_sources = []

    def start_service(self):
        if self.phase != "management" or self.service >= 1:
            raise ValueError("No new service available")
        before = self.state()
        self.service += 1
        self.guest_idx = 0
        self.escape_floor, self.g_uses = None, 0
        for e in self.owned.values():
            e.c, e.p = 0, e.maxp
            self._clear_shield(e)
            e.charges = 2 if e.kind in ("B", "G") else 0
        self.emit("service_reset", before=before, after=self.state())
        self.start_guest(VISITORS[self.service * 2])

    def start_guest(self, spec):
        """Diagnostic entry as well as the ordinary guest-boundary operation."""
        if self.phase in ("observed_stop", "complete"):
            raise ValueError("Cannot resume ended run")
        if not isinstance(spec, dict):
            raise ValueError("Visitor specification required")
        t, h = spec.get("T", 99), spec.get("H", 1)
        power, reward = spec.get("power", 6), spec.get("reward", 2)
        pattern = spec.get("pattern", "double")
        if any(type(v) is not int for v in (t, h, power, reward)) or t < 1 or h < 1 or power < 0 or reward < 0:
            raise ValueError("Invalid visitor numbers")
        if pattern not in ("none", "double", "path", "offset", "fixed"):
            raise ValueError("Unknown attack pattern")
        attacks = deepcopy(spec.get("attacks", []))
        if pattern == "fixed" and (not isinstance(attacks, (list, tuple)) or
                any(not isinstance(a, (list, tuple)) or len(a) != 2 or
                    type(a[0]) is not int or not 1 <= a[0] <= 6 or
                    type(a[1]) is not int or a[1] < 0 for a in attacks)):
            raise ValueError("Fixed attacks must be [floor 1..6, nonnegative power]")
        before = self.state()
        for e in self.owned.values():
            e.c = 0
            self._clear_shield(e)
        self.visitor = dict(key=spec.get("key", "diagnostic"),
                            name=spec.get("name", spec.get("key", "diagnostic")),
                            T=t, H=h, initial_H=h, pattern=pattern, power=power,
                            attacks=attacks, reward=reward, p=0, F=0, A=0, turn=0)
        self.dice, self.selected, self.pending_intent = [], None, None
        self.idle_count, self.idle_limit = 0, 3
        self.activity = dict(fear=False, state=False, active=False)
        self.phase = "turn_ready"
        self.emit("guest_reset", before=before, after=self.state())

    def advance(self):
        if self.phase == "service_end":
            self.phase = "management" if self.service == 0 else "complete"
            self.emit("service_advance", state=self.state())
            return
        if self.phase != "visitor_end":
            raise ValueError("Only a defeated visitor can advance")
        if self.guest_idx == 0:
            self.guest_idx = 1
            self.start_guest(VISITORS[self.service * 2 + 1])
        else:
            self.phase = "management" if self.service == 0 else "complete"
            self.emit("service_end", state=self.state())

    @staticmethod
    def _actions(actions):
        try:
            result = list(actions)
        except TypeError as exc:
            raise ValueError("Actions must be owner/target pairs") from exc
        if any(not isinstance(a, (list, tuple)) or len(a) != 2 or
               not isinstance(a[0], str) or (a[1] is not None and not isinstance(a[1], str)) for a in result):
            raise ValueError("Actions must be owner/target pairs")
        return [tuple(a) for a in result]

    def record_intent(self, values, reason, actions=(), arrival_target=None, escape_floor=None):
        if self.phase != "turn_ready" or self.pending_intent is not None:
            raise ValueError("Record intent exactly once before revealing this turn's dice")
        if not isinstance(values, (list, tuple)) or any(type(v) is not int or not 1 <= v <= 6 for v in values):
            raise ValueError("Intent values must be movement distances 1..6; empty means no preference")
        if len(set(values)) != len(values) or not isinstance(reason, str) or not reason.strip():
            raise ValueError("Unique preferred values and a nonempty reason required")
        planned = self._actions(actions)
        if arrival_target is not None and not self.living(arrival_target):
            raise ValueError("Intent arrival target must be alive and deployed")
        self.pending_intent = dict(values=list(values),
                                   floors=[self.path(v)[-1] for v in values],
                                   reason=reason, actions=planned,
                                   arrival_target=arrival_target,
                                   escape_floor=escape_floor,
                                   guest=self.visitor["key"], turn=self.visitor["turn"] + 1)
        self.emit("intent", **deepcopy(self.pending_intent), state=self.state())

    def begin_turn(self, forced=None):
        if self.phase != "turn_ready":
            raise ValueError("Roll only at turn start")
        if self.visitor["turn"] >= 24:
            raise ValueError("Turn limit")
        if forced is not None and (not isinstance(forced, (list, tuple)) or len(forced) != 3 or
                                  any(type(x) is not int or not 1 <= x <= 6 for x in forced)):
            raise ValueError("Three d6 values required")
        if forced is None and self.pending_intent is None:
            raise ValueError("Record the desired destination and reason before rolling")
        before = self.state()
        self.visitor["turn"] += 1
        self.activity = dict(fear=False, state=False, active=False)
        if forced is None:
            rng = self._rng("dice")
            self.dice = [rng.randint(1, 6) for _ in range(3)]
        else:
            self.controlled = True
            self.dice = list(forced)
        self.selected = None
        self.phase = "choice"
        self.emit("turn_start", forced=forced is not None, before=before, state=self.state())
        return self.dice.copy()

    def _rng(self, kind):
        key = f'{self.seed}:{self.stream}:{self.service}:{self.visitor["key"]}:{self.visitor["turn"]}:{kind}'
        return random.Random(int.from_bytes(hashlib.sha256(key.encode()).digest(), "big"))

    def mark_activity(self, kind, source, amount=None):
        self.activity[kind] = True
        self.emit("activity", kind=kind, source=source, amount=amount)

    def choose(self, value):
        if self.phase != "choice" or type(value) is not int or value not in self.dice:
            raise ValueError("Choose one of the current dice exactly once")
        path = self.path(value)
        attacks = self.attack_list(path)
        self.selected = value
        self.phase = "active"
        self.emit("choose", value=value, path=path, attacks=attacks)

    def living(self, entity_id):
        return entity_id in self.board and entity_id in self.owned and self.owned[entity_id].p > 0

    def active(self, owner, target=None):
        if self.phase != "active" or not self.living(owner):
            raise ValueError("Owner must be alive, deployed, in active phase")
        e = self.owned[owner]
        if e.kind not in ("B", "G"):
            raise ValueError("No active ability")
        if e.charges < 1:
            raise ValueError("No charges")
        if e.kind == "G" and not self.living(target):
            raise ValueError("Target must be alive and deployed")
        if e.kind == "B" and target is not None:
            raise ValueError("Bell targets the visitor")
        before = self.state()
        e.charges -= 1
        self.mark_activity("active", owner)
        guard_id = None
        if e.kind == "B":
            self.fear(6, owner + ":active")
        else:
            self.g_uses += 1
            guard_id = f's{self.service}:g{self.g_uses}'
            self.owned[target].shield += 6
            self.owned[target].shield_active += 6
            self.owned[target].shield_sources.append(dict(id=guard_id, kind="active", amount=6))
        self.emit("active", owner=owner, kind=e.kind, target=target, guard_id=guard_id,
                  g_use=self.g_uses if e.kind == 'G' else None, before=before, after=self.state())
        if self.phase == "visitor_end":
            self.finish_turn()

    def fear(self, amount, source):
        if type(amount) is not int or amount < 0:
            raise ValueError("Fear amount must be nonnegative")
        v = self.visitor
        if v["H"] <= 0:
            return
        if amount:
            self.mark_activity("fear", source, amount)
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
        if self.visitor is None or type(r) is not int or not 1 <= r <= 6:
            raise ValueError("A visitor and movement distance 1..6 are required")
        return [1 + ((self.visitor["p"] + i - 1) % 6) for i in range(1, r + 1)]

    def install_escape(self, floor):
        if self.phase != "active" or self.variant == "C13":
            raise ValueError("Escape installation is only available before movement in M14/C14")
        if self.escape_floor is not None:
            raise ValueError("An exit is already installed for this service")
        if type(floor) is not int or not 1 <= floor <= 6 or self.board[floor - 1] is not None:
            raise ValueError("Exit requires an empty floor; destroyed anomalies still occupy their floors")
        self.escape_floor = floor
        self.emit("escape_installed", floor=floor)

    def attack_list(self, path):
        if not path:
            return []
        v, d = self.visitor, path[-1]
        if v["pattern"] == "fixed":
            return [tuple(a) for a in v["attacks"]]
        if v["pattern"] == "none":
            floors = []
        elif v["pattern"] == "double":
            floors = [d, d]
        elif v["pattern"] == "path":
            floors = path
        elif v["pattern"] == "offset":
            floors = [1 + ((d - 3) % 6), 1 + ((d + 1) % 6)]
        else:
            raise ValueError("Unknown attack pattern")
        return [(i, v["power"]) for i in floors]

    def hit(self, floor, power):
        if type(floor) is not int or not 1 <= floor <= 6 or type(power) is not int or power < 0:
            raise ValueError("Invalid hit")
        entity_id = self.board[floor - 1]
        if entity_id is None or not self.living(entity_id):
            self.emit("miss", floor=floor, power=power, target=entity_id)
            return
        e = self.owned[entity_id]
        before = asdict(e)
        blocked = min(power, e.shield)
        active_blocked = min(blocked, e.shield_active)
        arrival_blocked = min(blocked - active_blocked, e.shield_arrival)
        e.shield_active -= active_blocked
        e.shield_arrival -= arrival_blocked
        e.shield -= blocked
        remaining = blocked
        allocations = []
        for source in e.shield_sources:
            taken = min(source['amount'], remaining)
            if taken:
                allocations.append(dict(guard_id=source['id'], kind=source['kind'], amount=taken))
                source['amount'] -= taken
                remaining -= taken
        e.c += power - blocked
        broken = False
        if e.c >= 12:
            e.p -= 1
            e.c = 0
            broken = True
        self.emit("hit", floor=floor, target=entity_id, power=power, blocked=blocked,
                  active_blocked=active_blocked, arrival_blocked=arrival_blocked,
                  absorption=allocations,
                  before=before, after=asdict(e), broken=broken, destroyed=e.p == 0)

    def needs_arrival_target(self, value):
        entity_id = self.board[self.path(value)[-1] - 1]
        return self.variant == "C13" and entity_id is not None and \
            self.living(entity_id) and self.owned[entity_id].kind == "G"

    def move(self, arrival_target=None):
        if self.phase != "active":
            raise ValueError("Movement requires selected die and living visitor")
        needs_target = self.needs_arrival_target(self.selected)
        if needs_target and not self.living(arrival_target):
            raise ValueError("Select a living deployed target for G's arrival protection")
        if not needs_target and arrival_target is not None:
            raise ValueError("This movement has no G arrival protection")
        path = self.path(self.selected)
        attacks = self.attack_list(path)
        if needs_target:
            self.emit("arrival_target", owner=self.board[path[-1] - 1], target=arrival_target)
        for step, floor in enumerate(path):
            arrival = step == len(path) - 1
            self.visitor["p"] = floor
            if floor == self.escape_floor:
                self.phase = "service_end"
                self.emit("escape", floor=floor, mode="arrival" if arrival else "pass",
                          remaining_path=path[step + 1:], cancelled_attacks=attacks,
                          skipped_guests=[v['key'] for v in VISITORS[self.service * 2 + self.guest_idx + 1:self.service * 2 + 2]],
                          state=self.state())
                break
            entity_id = self.board[floor - 1]
            before = deepcopy(self.visitor)
            supplied = consumed = overflow = 0
            if entity_id is not None and self.living(entity_id):
                e = self.owned[entity_id]
                if e.kind == "U":
                    amount = 4 if arrival else 2
                    supplied = min(amount, 9 - self.visitor["A"])
                    overflow = amount - supplied
                    self.visitor["A"] += supplied
                    if supplied:
                        self.mark_activity("state", entity_id, supplied)
                elif arrival and e.kind == "Q":
                    consumed = min(3, self.visitor["A"])
                    self.visitor["A"] -= consumed
                    self.fear(4 * consumed, entity_id + ":arrival")
                elif arrival and e.kind == "B":
                    self.fear(2, entity_id + ":arrival")
                elif arrival and e.kind == "G" and self.variant == "C13":
                    target = self.owned[arrival_target]
                    target.shield += 6
                    target.shield_arrival += 6
                    guard_id = f's{self.service}:{self.visitor["key"]}:t{self.visitor["turn"]}:arrival'
                    target.shield_sources.append(dict(id=guard_id, kind="arrival", amount=6))
                    self.emit("arrival_guard", owner=entity_id, target=arrival_target, amount=6,
                              charges=e.charges, guard_id=guard_id)
                    self.mark_activity("state", entity_id + ":arrival_guard", 6)
                elif arrival and e.kind == "G" and self.variant == "M14":
                    old = e.charges
                    e.charges = min(2, e.charges + 1)
                    self.emit("charge", owner=entity_id, before=old, after=e.charges,
                              gained=e.charges - old, overflow=1 - (e.charges - old))
            self.emit("visit", floor=floor, target=entity_id, mode="arrival" if arrival else "pass",
                      before=before, after=deepcopy(self.visitor), supplied=supplied,
                      consumed=consumed, supply_overflow=overflow)
            if self.phase == "visitor_end":
                break
        if self.phase not in ("visitor_end", "service_end"):
            for floor, power in attacks:
                self.hit(floor, power)
        self.finish_turn()

    def finish_turn(self):
        expired = {i: dict(active=e.shield_active, arrival=e.shield_arrival, total=e.shield)
                   for i, e in self.owned.items() if e.shield}
        for e in self.owned.values():
            self._clear_shield(e)
        self.pending_intent = None
        if self.phase not in ("visitor_end", "service_end"):
            self.resolve_inactivity()
            self.phase = "observed_stop" if self.visitor["turn"] >= 24 else "turn_ready"
        self.emit("turn_end", state=self.state(), expired_shields=expired,
                  activity=deepcopy(self.activity),
                  outcome="kill" if self.phase == "visitor_end" else "escape" if self.phase == "service_end" else "observation_cap" if self.phase == "observed_stop" else "continue")

    def resolve_inactivity(self):
        if not self.penalty_enabled:
            return
        previous = (self.idle_count, self.idle_limit)
        if any(self.activity.values()):
            self.idle_count, self.idle_limit = 0, 3
        else:
            self.idle_count += 1
            if self.idle_count >= self.idle_limit:
                self.apply_penalty()
                self.idle_count, self.idle_limit = 0, 2
        self.emit("inactivity", before=previous, after=(self.idle_count, self.idle_limit),
                  activity=deepcopy(self.activity))

    def apply_penalty(self):
        candidates = sorted(i for i in self.board if i and self.living(i))
        if self._preview_mode:
            outcomes = {}
            for target in candidates:
                e = self.owned[target]
                broken = e.c + self.penalty_amount >= 12
                outcomes[target] = dict(c=0 if broken else e.c + self.penalty_amount,
                                        p=e.p - int(broken))
            self.emit("penalty_preview", candidates=candidates, amount=self.penalty_amount,
                      possible_outcomes=outcomes, note="Target not sampled; displayed C/P excludes this uncertain penalty")
            return
        target = self._rng("penalty").choice(candidates) if candidates else None
        before = asdict(self.owned[target]) if target else None
        broken = False
        if target:
            e = self.owned[target]
            e.c += self.penalty_amount
            if e.c >= 12:
                e.p -= 1
                e.c = 0
                broken = True
        self.emit("penalty", candidates=candidates, amount=self.penalty_amount, target=target,
                  before=before, after=asdict(self.owned[target]) if target else None,
                  broken=broken, destroyed=bool(target and self.owned[target].p == 0))

    def play(self, value, actions=(), arrival_target=None, escape_floor=None):
        """Atomic combined command: failed input never leaves a partial turn."""
        actions = self._actions(actions)
        g = self.clone()
        g.choose(value)
        if escape_floor is not None:
            g.install_escape(escape_floor)
        for owner, target in actions:
            if g.phase == "visitor_end":
                break
            g.active(owner, target)
        if g.phase == "active":
            g.move(arrival_target)
        previous_logs = self.logs
        self.__dict__.update(g.__dict__)
        self.logs = previous_logs + g.logs

    def clone(self):
        g = self.__class__.__new__(self.__class__)
        g.__dict__ = deepcopy({key: value for key, value in self.__dict__.items() if key != "logs"})
        g.logs = []
        return g

    def preview(self, value, actions=(), arrival_target=None, hypothetical=False, escape_floor=None):
        if hypothetical:
            if self.phase != "turn_ready" or self.visitor["turn"] >= 24:
                raise ValueError("Hypothetical 1..6 preview is only available before a new roll")
            g = self.clone()
            g.visitor["turn"] += 1
            g.activity = dict(fear=False, state=False, active=False)
            g.phase, g.dice, g.selected = "choice", list(range(1, 7)), None
        else:
            if self.phase != "choice":
                raise ValueError("Preview current public dice only")
            g = self.clone()
        g._preview_mode = True
        g.play(value, actions, arrival_target, escape_floor)
        return g
