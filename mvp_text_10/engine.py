"""Config 10 text rules engine. Standard library only; no automatic player."""
import copy
import random
import secrets

NAMES = {
    "guide": "수상한 안내판", "radio": "벽 속 라디오", "room": "닫힌 객실",
    "S": "접객원", "R": "녹음기사", "K": "기록원",
    "SR1": "대답하는 벽", "SR2": "금지된 안내방송", "SR3": "오지 않은 호출",
    "SK1": "미리 적힌 투숙기록", "SK2": "빈 이름의 명부", "SK3": "반복되는 첫날",
    "RK1": "목소리의 투숙대장", "RK2": "삭제된 녹취록", "RK3": "원본 없는 증언",
}
EFFECTS = {
    "guide": "통과 불안+1", "radio": "통과 환청+1", "room": "도착 불안 최대2 소비→공포4/개",
    "S": "통과 불안+2", "R": "통과 환청+2", "K": "도착 지정 상태 최대2 참조→공포2/개",
    "SR1": "통과 불안1→환청2; 도착 환청 최대2 소비→공포4/개",
    "SR2": "도착 불안≥1이면 환청 최대2 참조→공포2/개",
    "SR3": "통과 불안1+환청1→기시감2",
    "SK1": "통과 불안 최대2→기시감1:1",
    "SK2": "도착 min(2,max(불안−기시감,0)) 불안 소비→공포4/개",
    "SK3": "도착 기시감 최대2 참조→불안+n,공포2n",
    "RK1": "통과 환청 최대2→기시감1:1",
    "RK2": "통과 환청 최대2 제거q; 도착 공포4q",
    "RK3": "도착 min(2,환청,기시감) 참조→공포3/개",
}
PAIRS = {frozenset(("S", "R")): "SR", frozenset(("S", "K")): "SK",
         frozenset(("R", "K")): "RK"}

def _tuples(value):
    return tuple(_tuples(x) for x in value) if isinstance(value, (list, tuple)) else value

class Game:
    @classmethod
    def new(cls, stage="F", variant="A", boss=False, seed=None):
        if stage not in ("L", "F", "C", "E", "N"):
            raise ValueError("Unknown stage")
        if variant not in ("A", "B"):
            raise ValueError("Unknown variant")
        obj = cls()
        seed = secrets.randbits(128) if seed is None else seed
        obj._deck_rng = random.Random(str(seed) + ":deck")
        obj._dice_rng = random.Random(str(seed) + ":dice")
        obj.stage, obj.variant, obj.boss = stage, variant, bool(boss)
        if stage in ("L", "F", "C", "N") and boss:
            raise ValueError("Boss is available only in E")
        obj.phase = "management"
        obj.pool = {"S01": "S", "R01": "R", "K01": "K", "K02": "K"}
        obj.deck = list(obj.pool)
        obj.tiles = {x: {"kind": x, "hp": 4} for x in ("guide", "radio", "room")}
        obj.board = ["guide", None, "radio", None, "room", None]
        obj.hand, obj.draw_pile, obj.discard = [], [], []
        obj.pos = obj.F = obj.a = obj.b = obj.c = 0
        obj.T, obj.H = 12, 1 if stage == "L" else 2
        obj.cash = 8 if stage == "N" else 0
        obj.mana, obj.turn, obj.recruited = 0, 0, 0
        obj.eyes, obj.history, obj.management_history = [], [], []
        obj.end_reason = None
        obj.stats = dict(turns=0, fear=0, cash=0, damage=0, destroyed=0,
                         tokens=0, cards=0, exhaustions=0, missed=0)
        if stage in ("C", "E"):
            obj.pool = {"K01": "K", "K02": "K"}
            obj.deck = list(obj.pool)
            obj.hand = list(obj.pool)
            obj.phase, obj.turn, obj.T, obj.H = "ready", 1, 6, 1
            if stage == "C":
                obj.tiles["SR1"] = {"kind": "SR1", "hp": 4}
                obj.board = (["guide", "SR1", "radio", "room", None, None] if variant == "A"
                             else ["SR1", "guide", "radio", "room", None, None])
                obj.eyes = [2, 3, 3]
            else:
                obj.pos, obj.F, obj.T, obj.a, obj.b = 3, 2, 8, 2, 1
                obj.tiles["room"]["hp"] = 1
                obj.eyes = [2, 3]
                obj.stats["exhaustions"] = 1
        return obj

    def to_dict(self):
        result = {k: copy.deepcopy(v) for k, v in self.__dict__.items() if not k.startswith("_")}
        result["_deck_rng"] = self._deck_rng.getstate()
        result["_dice_rng"] = self._dice_rng.getstate()
        return result

    @classmethod
    def from_dict(cls, data):
        obj = cls()
        obj.__dict__.update({k: copy.deepcopy(v) for k, v in data.items() if not k.startswith("_")})
        obj._deck_rng, obj._dice_rng = random.Random(), random.Random()
        obj._deck_rng.setstate(_tuples(data["_deck_rng"]))
        obj._dice_rng.setstate(_tuples(data["_dice_rng"]))
        return obj

    def public_state(self):
        return {
            "stage": self.stage, "variant": self.variant, "boss": self.boss,
            "phase": self.phase, "turn": self.turn, "position": self.pos,
            "F": self.F, "T": self.T, "H": self.H,
            "states": {"a": self.a, "b": self.b, "c": self.c},
            "cash": self.cash, "mana": self.mana, "eyes": list(self.eyes),
            "pool": dict(self.pool), "deck": list(self.deck),
            "hand": list(self.hand), "draw_count": len(self.draw_pile),
            "discard": list(self.discard), "board": list(self.board),
            "tiles": copy.deepcopy(self.tiles),
            "storage": [x for x in self.tiles if x not in self.board],
            "stats": dict(self.stats), "end_reason": self.end_reason,
        }

    def _manage(self):
        if self.phase != "management":
            raise ValueError("Management is locked during the encounter")
        if self.stage == "L":
            raise ValueError("L has a fixed learning setup")

    def candidates(self, id1, id2):
        if id1 == id2 or id1 not in self.pool or id2 not in self.pool:
            raise ValueError("Choose two distinct owned staff individuals")
        prefix = PAIRS.get(frozenset((self.pool[id1], self.pool[id2])))
        if not prefix or (self.stage == "F" and prefix != "SR"):
            raise ValueError("This staff pair is outside this experiment's content")
        return [prefix + str(n) for n in (1, 2, 3)]

    def fuse(self, id1, id2, candidate):
        self._manage()
        if candidate not in self.candidates(id1, id2):
            raise ValueError("Candidate is not one of the fixed three")
        for staff in (id1, id2):
            del self.pool[staff]
            if staff in self.deck:
                self.deck.remove(staff)
        tile_id, number = candidate, 2
        while tile_id in self.tiles:
            tile_id = candidate + "_" + str(number)
            number += 1
        self.tiles[tile_id] = {"kind": candidate, "hp": 4}
        self.management_history.append({"action": "fuse", "staff": [id1, id2],
                                        "candidate": candidate, "tile": tile_id})
        return tile_id

    def arrange(self, board):
        self._manage()
        if not isinstance(board, list) or len(board) != 6:
            raise ValueError("Exactly six slots are required")
        ids = [x for x in board if x is not None]
        if any(x not in self.tiles for x in ids) or len(ids) != len(set(ids)):
            raise ValueError("Use owned tiles once each, or null for empty")
        self.board = list(board)
        self.management_history.append({"action": "arrange", "board": list(board)})

    def space_arrange(self, board):
        """Prepare a fresh independent C layout; never move tiles in combat."""
        if self.stage != "C" or self.phase != "ready" or self.turn != 1 or self.history:
            raise ValueError("Only an unplayed C diagnostic may prepare a new layout")
        if not isinstance(board, list) or len(board) != 6:
            raise ValueError("Exactly six slots are required")
        ids = [x for x in board if x is not None]
        if len(ids) != len(set(ids)) or set(ids) != set(self.tiles):
            raise ValueError("C preparation must use the same complete tile set")
        self.board = list(board)
        self.management_history.append({"action": "prepare_C_layout", "board": list(board)})

    def recruit(self, kind):
        self._manage()
        if self.stage != "N" or kind not in ("S", "R", "K"):
            raise ValueError("Recruitment exists only in optional N")
        if self.recruited >= 2 or self.cash < 4:
            raise ValueError("Recruitment limit or budget exceeded")
        # Keep individual IDs unique even when a consumed ID no longer exists.
        used = set(self.pool)
        for item in self.management_history:
            used.update(item.get("staff", []))
            if item.get("action") == "recruit":
                used.add(item["id"])
        n = 1
        while f"{kind}{n:02d}" in used:
            n += 1
        staff = f"{kind}{n:02d}"
        self.pool[staff] = kind
        self.deck.append(staff)
        self.cash -= 4
        self.recruited += 1
        self.management_history.append({"action": "recruit", "id": staff, "kind": kind, "cost": 4})
        return staff

    def set_deck(self, ids):
        self._manage()
        if not isinstance(ids, list) or len(ids) > 20 or len(ids) != len(set(ids)):
            raise ValueError("Deck must contain 0–20 distinct owned individuals")
        if any(x not in self.pool for x in ids):
            raise ValueError("Deck contains unowned staff")
        self.deck = list(ids)
        self.management_history.append({"action": "deck", "deck": list(ids)})

    def start(self):
        if self.phase != "management":
            raise ValueError("Encounter already started")
        self.draw_pile = list(self.deck)
        if self.stage != "L":
            self._deck_rng.shuffle(self.draw_pile)
        self.hand, self.discard, self.eyes = [], [], []
        self.phase = "draw"
        return self.public_state()

    def draw_roll(self):
        if self.phase != "draw":
            raise ValueError("Not at the draw step")
        self.turn += 1
        events, exhausted = [], False
        for _ in range(2):
            if not self.draw_pile:
                if not exhausted:
                    exhausted = True
                    self.stats["exhaustions"] += 1
                    events.append({"type": "exhaustion", "message": "소진: 이번 턴 주사위 3→2"})
                self.draw_pile = list(self.discard)
                self.discard = []
                self._deck_rng.shuffle(self.draw_pile)
                if not self.draw_pile:
                    events.append({"type": "draw_short", "message": "보충할 카드 없음"})
                    break
            card = self.draw_pile.pop(0)
            self.hand.append(card)
            events.append({"type": "draw", "message": "드로우 " + card, "card": card})
        count = 2 if exhausted else 3
        self.eyes = [self._dice_rng.randint(1, 6) for _ in range(count)]
        self.phase = "ready"
        events.append({"type": "roll", "message": "현재 주사위 " + str(self.eyes),
                       "eyes": list(self.eyes)})
        self.history.append({"turn": self.turn, "phase": "draw", "events": events})
        return events

    def _validate(self, eye, plays):
        if self.phase != "ready":
            raise ValueError("Choose only after the current draw and roll")
        if type(eye) is not int or eye not in self.eyes:
            raise ValueError("Choose one of the currently revealed eyes")
        if not isinstance(plays, list):
            raise ValueError("Plays must be a list")
        seen = set()
        for play in plays:
            if not isinstance(play, dict):
                raise ValueError("Each play must be an object")
            card, slot = play.get("card"), play.get("slot")
            if card not in self.hand or card in seen:
                raise ValueError("Card must be in hand and played at most once")
            if type(slot) is not int or not 1 <= slot <= 6:
                raise ValueError("Card slot must be 1–6")
            if self.pool[card] == "K" and play.get("state") not in ("a", "b", "c"):
                raise ValueError("K must choose a, b, or c before movement")
            seen.add(card)
        if len(plays) * 2 > eye:
            raise ValueError("Insufficient mana")
        return copy.deepcopy(plays)

    def resolve(self, eye, plays=None):
        plays = self._validate(eye, [] if plays is None else plays)
        clone = copy.deepcopy(self)
        events = clone._resolve_validated(eye, plays)
        self.__dict__.clear()
        self.__dict__.update(clone.__dict__)
        return events

    def preview(self, eye, plays=None):
        clone = copy.deepcopy(self)
        events = clone.resolve(eye, plays)
        return {"events": events, "state": clone.public_state()}

    def _emit(self, events, typ, message, **extra):
        events.append({"type": typ, "message": message, **extra})

    def _fear(self, amount, source, events):
        before = self.F
        self.F += amount
        self.stats["fear"] += amount
        self._emit(events, "fear", f"{source}: 공포 +{amount} ({before}→{self.F})",
                   source=source, amount=amount, before=before, after=self.F)
        if self.F >= self.T:
            earned = self.F - self.T
            self.cash += earned
            self.stats["cash"] += earned
            self.stats["tokens"] += 1
            self.H -= 1
            self.F = 0
            self._emit(events, "heart_attack", f"심장마비: 남은 토큰 {self.H}, 초과 재화 +{earned}, 공포 0",
                       remaining=self.H, earned=earned)
            if self.H == 0:
                self._emit(events, "visitor_end", "마지막 토큰 제거: 남은 효과·이동·공격 중단")

    def _tile_pass(self, kind, events):
        before = (self.a, self.b, self.c)
        q = 0
        if kind == "guide":
            self.a = min(9, self.a + 1)
        elif kind == "radio":
            self.b = min(9, self.b + 1)
        elif kind == "SR1":
            if self.a >= 1 and self.b <= 7:
                self.a -= 1
                self.b += 2
        elif kind == "SR3":
            if self.a >= 1 and self.b >= 1 and self.c <= 7:
                self.a -= 1
                self.b -= 1
                self.c += 2
        elif kind == "SK1":
            n = min(2, self.a, 9 - self.c)
            self.a -= n
            self.c += n
        elif kind == "RK1":
            n = min(2, self.b, 9 - self.c)
            self.b -= n
            self.c += n
        elif kind == "RK2":
            q = min(2, self.b)
            self.b -= q
        after = (self.a, self.b, self.c)
        if before != after or kind in ("SR1", "SR3", "SK1", "RK1", "RK2"):
            self._emit(events, "tile_pass", f"{NAMES[kind]} 통과: 상태 {before}→{after}",
                       kind=kind, before=before, after=after, q=q)
        return q

    def _tile_arrival(self, kind, q, events):
        amount = None
        if kind == "room":
            n = min(2, self.a)
            self.a -= n
            amount = 4 * n
        elif kind == "SR1":
            n = min(2, self.b)
            self.b -= n
            amount = 4 * n
        elif kind == "SR2":
            amount = 2 * min(2, self.b) if self.a >= 1 else 0
        elif kind == "SK2":
            n = min(2, max(self.a - self.c, 0))
            self.a -= n
            amount = 4 * n
        elif kind == "SK3":
            n = min(2, self.c)
            self.a = min(9, self.a + n)
            amount = 2 * n
        elif kind == "RK2":
            amount = 4 * q
        elif kind == "RK3":
            amount = 3 * min(2, self.b, self.c)
        if amount is not None:
            self._fear(amount, NAMES[kind], events)

    def _resolve_validated(self, eye, plays):
        events, path, triggered = [], [], set()
        self.mana = eye - 2 * len(plays)
        self.stats["cards"] += len(plays)
        self._emit(events, "plan", f"눈 {eye}, 카드 {len(plays)}장, 남은 마나 {self.mana}",
                   eye=eye, plays=copy.deepcopy(plays), mana=self.mana)
        for step in range(eye):
            self.pos = self.pos % 6 + 1
            path.append(self.pos)
            self._emit(events, "move", f"{self.pos}번 칸 방문", slot=self.pos)
            tile_id = self.board[self.pos - 1]
            kind = self.tiles[tile_id]["kind"] if tile_id else None
            q = self._tile_pass(kind, events) if kind else 0
            for index, play in enumerate(plays):
                if play["slot"] != self.pos:
                    continue
                role = self.pool[play["card"]]
                if role in ("S", "R"):
                    attr = "a" if role == "S" else "b"
                    before = getattr(self, attr)
                    setattr(self, attr, min(9, before + 2))
                    triggered.add(index)
                    self._emit(events, "staff_pass", f"{play['card']}: {attr} {before}→{getattr(self, attr)}",
                               card=play["card"], state=attr, before=before, after=getattr(self, attr))
            if step == eye - 1:
                if kind:
                    self._tile_arrival(kind, q, events)
                if self.H > 0:
                    for index, play in enumerate(plays):
                        if play["slot"] == self.pos and self.pool[play["card"]] == "K":
                            triggered.add(index)
                            amount = 2 * min(2, getattr(self, play["state"]))
                            self._fear(amount, play["card"] + ":" + play["state"], events)
                            if self.H == 0:
                                break
            if self.H == 0:
                break
        if self.H > 0:
            for slot in (path if self.boss else [self.pos]):
                tile_id = self.board[slot - 1]
                if tile_id is None:
                    self._emit(events, "attack_miss", f"{slot}번 빈칸 공격: 피해 0", slot=slot)
                    continue
                self.tiles[tile_id]["hp"] -= 1
                self.stats["damage"] += 1
                hp = self.tiles[tile_id]["hp"]
                self._emit(events, "attack", f"{slot}번 {NAMES[self.tiles[tile_id]['kind']]} 피해1, 내구{hp}",
                           slot=slot, tile=tile_id, hp=hp, damage=1)
                if hp <= 0:
                    del self.tiles[tile_id]
                    self.board[slot - 1] = None
                    self.stats["destroyed"] += 1
                    self._emit(events, "destroy", f"{slot}번 타일 파괴", slot=slot, tile=tile_id)
        for index, play in enumerate(plays):
            if index not in triggered:
                self.stats["missed"] += 1
                self._emit(events, "unused_reservation", f"{play['card']} 예약 미발동, 환급 없음",
                           card=play["card"], slot=play["slot"])
        used = [p["card"] for p in plays]
        unused = [x for x in self.hand if x not in used]
        self.discard.extend(used + unused)
        self.hand, self.eyes = [], []
        self.mana = 0
        self.stats["turns"] += 1
        if self.H == 0:
            self.phase, self.end_reason = "ended", "defeated" if self.boss else "killed"
            last_states = {"a": self.a, "b": self.b, "c": self.c}
            self.a = self.b = self.c = 0
            self._emit(events, "state_cleanup", "방문자 종료: 상태 정리", before=last_states)
        elif self.turn >= 8:
            self.phase, self.end_reason = "ended", "observation_limit"
        else:
            self.phase = "draw"
        self.history.append({"turn": self.turn, "phase": "resolve", "eye": eye,
                             "plays": copy.deepcopy(plays), "path": path, "events": copy.deepcopy(events)})
        return events
