"""Config 11 text MVP. Standard library only; public data never reveals future draws."""
from __future__ import annotations
import copy
import random

STAFF = {
    "G": {"name": "경비원", "cost": 2, "effect": "지정 괴이 이번 턴 흡수8"},
    "T": {"name": "보안책임자", "cost": 2, "effect": "다음 잔여 타격 전량 이전1회"},
    "H": {"name": "시설기사", "cost": 2, "effect": "불안2 소비, 공략도 최대8 감소"},
    "B": {"name": "방재 담당", "cost": 2, "effect": "배치 통과1회: 불안2 소비, 공략도 최대8 감소"},
    "D": {"name": "기록원", "cost": 1, "effect": "즉시 카드1장 드로우"},
}
ANOMALIES = {
    "U": {"name": "속삭이는 문틈", "L": 20, "P": 2, "pass": "불안+2", "arrival": "-"},
    "V": {"name": "되감기는 복도", "L": 10, "P": 3, "pass": "불안1 이상이면+1", "arrival": "-"},
    "Q": {"name": "이름 없는 객실", "L": 20, "P": 2, "pass": "-", "arrival": "불안 최대3 소비, 공포4n 한 효과"},
    "GT1": {"name": "등 뒤의 경호원", "L": 30, "P": 1, "pass": "-", "arrival": "불안3 소비 공포18"},
    "GT2": {"name": "두 번 울리는 호출벨", "L": 20, "P": 2, "pass": "불안2 소비 공포8", "arrival": "불안1 소비 공포8"},
    "GT3": {"name": "대신 남는 발자국", "L": 10, "P": 3, "pass": "불안을 현재량만큼 최대3 추가", "arrival": "-"},
}
VISITORS = [
    {"id": "V1", "name": "성급한 투숙객", "T": 12, "H": 1, "pattern": "arrival", "power": 6, "reward": 6},
    {"id": "V2", "name": "복도 점검원", "T": 12, "H": 2, "pattern": "path", "power": 4, "reward": 8},
    {"id": "V3", "name": "거울 감찰관", "T": 16, "H": 2, "pattern": "offset", "power": 6, "reward": 10},
]

def require(condition, message):
    if not condition:
        raise ValueError(message)

class Game:
    def __init__(self, seed=20261031):
        self.rng = random.Random(seed)
        self.n, self.K, self.draw_amount, self.turn_limit = 6, 3, 2, 8
        self.phase, self.service, self.visitor_index = "management", "A", -1
        self.visitor = None
        self.turn, self.cash, self.penalty = 0, 0, 0
        self.pool = {x: x[0] for x in ["G01", "T01", "H01", "B01", "D01", "D02"]}
        self.deck = list(self.pool)
        self.issued_ids = list(self.pool) + ["U01", "V01", "Q01"]
        self.assets = {}
        for kind in ("U", "V", "Q"):
            self.assets[kind + "01"] = self.make_asset(kind)
        self.slots = ["U01", "V01", None, "Q01", None, None]
        self.hand, self.draw_pile, self.discard, self.active = [], [], [], []
        self.dice, self.selected, self.mana = [], None, 0
        self.shields, self.redirects, self.placements = {}, {}, []
        self.events, self.results = [], []
        self.totals = dict(turns=0, fear=0, damage=0, absorbed=0, healed=0,
                           breaks=0, destroyed=0, kills=0, reward=0,
                           exhaustions=0, penalized_rolls=0, penalty_consumed=0, card_uses=0)
        self._reset_market()
        self.emit("created", mode="automatic_rules_demo", config="11")

    def __setstate__(self, state):
        self.__dict__.update(state)
        if not isinstance(self.issued_ids, list):
            self.issued_ids = sorted(self.issued_ids)
        self.totals.setdefault("penalty_consumed", self.totals.get("penalized_rolls", 0))
    @staticmethod
    def make_asset(kind, **overrides):
        require(kind in ANOMALIES, "알 수 없는 괴이 종류")
        spec = ANOMALIES[kind]
        data = dict(kind=kind, C=0, L=spec["L"], P=spec["P"], maxP=spec["P"])
        data.update(overrides)
        return data

    @classmethod
    def diagnostic(cls, seed=1107, n=6, tiles=None, hand=None, draw=None, discard=None,
                   pool=None, dice=None, A=0, F=0, T=99, H=1, pattern="arrival",
                   power=6, reward=6, position=0, penalty=0, K=3, visitor_index=0):
        g = cls(seed)
        g.n, g.K = n, K
        g.assets, g.slots = {}, [None] * n
        if isinstance(tiles, list):
            tiles = {v["slot"]: v for v in tiles}
        for slot, spec in (tiles or {}).items():
            spec = dict(spec)
            kind = spec.pop("kind")
            aid = spec.pop("id", kind + "01")
            spec.pop("slot", None)
            g.assets[aid] = g.make_asset(kind, **spec)
            g.slots[int(slot)-1] = aid
        g.hand, g.draw_pile, g.discard = list(hand or []), list(draw or []), list(discard or [])
        ids = list(dict.fromkeys(list(pool or []) + g.hand + g.draw_pile + g.discard))
        g.pool = {x: x[0] for x in ids}
        g.deck = ids[:]
        g.issued_ids.extend(x for x in ids if x not in g.issued_ids)
        g.issued_ids.extend(x for x in g.assets if x not in g.issued_ids)
        g.visitor_index = visitor_index
        g.service = "B" if visitor_index == 2 else "A"
        g.visitor = dict(id="D", name="통제 진단", T=T, H=H, F=F, A=A, position=position,
                         pattern=pattern, power=power, reward=reward, paid=False)
        g.penalty, g.dice, g.turn, g.phase = penalty, list(dice or [3, 3, 3]), 1, "choose"
        g.totals["turns"] = 1
        g.events = []
        g.emit("diagnostic", controlled=True)
        return g

    def _reset_market(self):
        self.recruit_stock = {k: 1 for k in STAFF}
        self.buy_stock = {k: 1 for k in ("U", "V", "Q")}
        self.recruited = 0
        self.repaired = []

    def emit(self, event, **data):
        self.events.append(dict(event=event, service=self.service,
                                visitor=self.visitor["id"] if self.visitor else None,
                                turn=self.turn, **copy.deepcopy(data)))

    def live(self, aid):
        return aid in self.assets and self.assets[aid]["P"] > 0

    def deployed(self, aid):
        return self.live(aid) and aid in self.slots

    def wrap(self, slot):
        return (slot - 1) % self.n + 1

    def path(self, value):
        pos = self.visitor["position"] if self.visitor else 0
        return [self.wrap(pos + i) for i in range(1, value + 1)]

    def attack_list(self, path):
        if not path or not self.visitor:
            return []
        pattern, d = self.visitor["pattern"], path[-1]
        targets = path if pattern == "path" else ([self.wrap(d-2), self.wrap(d+2)] if pattern == "offset" else [d])
        return [{"slot": slot, "power": self.visitor["power"]} for slot in targets]

    def public(self):
        board = []
        for i, aid in enumerate(self.slots, 1):
            board.append(dict(slot=i, id=aid, **(copy.deepcopy(self.assets[aid]) if aid else {})))
        options = []
        if self.phase in ("choose", "cards"):
            for value in sorted(set(self.dice if self.phase == "choose" else [self.selected])):
                path = self.path(value)
                options.append(dict(value=value, path=path, attacks=self.attack_list(path)))
        return copy.deepcopy(dict(
            phase=self.phase, service=self.service, visitor=self.visitor, visitor_index=self.visitor_index,
            turn=self.turn, n=self.n, K=self.K, cash=self.cash, board=board, assets=self.assets,
            pool=self.pool, deck=self.deck, hand=self.hand, discard=self.discard, active=self.active,
            draw_count=len(self.draw_pile), penalty=self.penalty, dice=self.dice,
            selected=self.selected, mana=self.mana, shields=self.shields,
            redirects=self.redirects, placements=self.placements, options=options,
            totals=self.totals, results=self.results,
            market=dict(recruit_stock=self.recruit_stock, buy_stock=self.buy_stock,
                        recruited=self.recruited, repaired=self.repaired)))

    def command(self, action):
        require(isinstance(action, dict), "명령은 JSON 객체여야 합니다")
        op = action.get("op")
        if op == "state":
            return {"state": self.public(), "events": []}
        if op == "catalog":
            return {"staff": copy.deepcopy(STAFF), "anomalies": copy.deepcopy(ANOMALIES),
                    "visitors": copy.deepcopy(VISITORS)}
        if op == "preview":
            require(self.phase in ("choose", "cards"), "굴린 뒤 미리보기 가능")
            simulation = copy.deepcopy(self)
            start = len(simulation.events)
            if simulation.phase == "choose":
                simulation._choose(action.get("value"))
            simulation._move()
            return dict(state=simulation.public(), events=simulation.events[start:], preview=True)
        snapshot = copy.deepcopy(self.__dict__)
        start = len(self.events)
        try:
            if op in ("arrange", "fusion", "deck", "recruit", "buy", "repair"):
                require(self.phase == "management", "경영 단계에만 가능합니다")
                self._manage(action)
            elif op == "start":
                self._start()
            elif op == "roll":
                require(self.phase == "roll", "턴 시작 단계가 아닙니다")
                require(self.turn < self.turn_limit, "관찰 상한")
                self.turn += 1
                self.totals["turns"] += 1
                before = self.penalty
                self.draw(self.draw_amount)
                self.roll_only()
                self.phase = "choose"
                self.emit("turn_start", penalty_entered=before, hand=self.hand, dice=self.dice)
            elif op == "choose":
                self._choose(action.get("value"))
            elif op == "card":
                self._card(action)
            elif op == "move":
                self._move()
            elif op == "stop":
                require(self.phase not in ("complete", "stopped"), "이미 종료됐습니다")
                self.phase = "stopped"
                self.emit("stop", reason="participant_stop")
            else:
                raise ValueError("알 수 없는 명령: " + str(op))
        except (ValueError, TypeError, KeyError, IndexError) as error:
            self.__dict__ = snapshot
            raise ValueError(str(error)) from error
        return {"state": self.public(), "events": copy.deepcopy(self.events[start:])}

    def _manage(self, a):
        op = a["op"]
        if op == "arrange":
            slots = a["slots"]
            require(isinstance(slots, list) and len(slots) == self.n, "전체 슬롯 배열 필요")
            placed = [x for x in slots if x is not None]
            require(len(placed) == len(set(placed)) and all(self.live(x) for x in placed), "중복 또는 생존하지 않은 괴이")
            self.slots = slots[:]
            self.emit("arrange", slots=self.slots)
        elif op == "deck":
            cards = a["cards"]
            require(isinstance(cards, list) and len(cards) <= 20 and len(cards) == len(set(cards)), "덱은 서로 다른 개체 0~20장")
            require(all(x in self.pool for x in cards), "보유하지 않은 직원")
            self.deck = cards[:]
            self.emit("deck", cards=cards)
        elif op == "fusion":
            x, y, choice = a["a"], a["b"], a["choice"]
            require(x != y and x in self.pool and y in self.pool, "직원 개체 두 명 필요")
            require({self.pool[x], self.pool[y]} == {"G", "T"}, "이번 MVP의 구현 조합은 G+T입니다")
            require(choice in ("GT1", "GT2", "GT3"), "고정 후보 GT1/GT2/GT3 중 선택")
            for card in (x, y):
                del self.pool[card]
                if card in self.deck:
                    self.deck.remove(card)
            aid = self._next_id(choice, self.assets)
            self.assets[aid] = self.make_asset(choice)
            self.emit("fusion", materials=[x, y], choice=choice, acquired=aid)
        elif op == "recruit":
            kind = a["kind"]
            require(kind in self.recruit_stock and self.recruit_stock[kind] > 0 and self.recruited < 2, "모집 재고 또는 총량 초과")
            require(self.cash >= 4, "재화 부족")
            self.cash -= 4
            self.recruited += 1
            self.recruit_stock[kind] -= 1
            cid = self._next_id(kind, self.pool)
            self.pool[cid] = kind
            self.emit("recruit", acquired=cid, cost=4, auto_deck=False)
        elif op == "buy":
            kind = a["kind"]
            require(kind in self.buy_stock and self.buy_stock[kind] > 0, "구매 재고 없음")
            require(self.cash >= 6, "재화 부족")
            self.cash -= 6
            self.buy_stock[kind] -= 1
            aid = self._next_id(kind, self.assets)
            self.assets[aid] = self.make_asset(kind)
            self.emit("buy", acquired=aid, cost=6)
        elif op == "repair":
            aid = a["target"]
            require(self.live(aid) and self.assets[aid]["C"] > 0 and aid not in self.repaired, "수리 불가")
            require(self.cash >= 3, "재화 부족")
            self.cash -= 3
            self.repaired.append(aid)
            before = self.assets[aid]["C"]
            self.assets[aid]["C"] = max(0, before - 8)
            self.emit("repair", target=aid, C_before=before, C_after=self.assets[aid]["C"], cost=3)

    def _next_id(self, kind, collection):
        number = 1
        while kind + f"{number:02d}" in collection or kind + f"{number:02d}" in self.issued_ids:
            number += 1
        result = kind + f"{number:02d}"
        self.issued_ids.append(result)
        return result

    def _start(self):
        require(self.phase in ("management", "between"), "손님을 시작할 단계가 아닙니다")
        index = self.visitor_index + 1
        require(index < len(VISITORS), "다음 손님 없음")
        self.visitor_index = index
        self.service = "A" if index < 2 else "B"
        self.visitor = copy.deepcopy(VISITORS[index])
        self.visitor.update(F=0, A=0, position=0, paid=False)
        self.hand, self.discard, self.active = [], [], []
        self.draw_pile = self.deck[:]
        self.rng.shuffle(self.draw_pile)
        self.dice, self.selected, self.mana = [], None, 0
        self.shields, self.redirects, self.placements = {}, {}, []
        self.turn, self.phase = 0, "roll"
        self.emit("visitor_start", deck_count=len(self.deck), penalty=self.penalty,
                  initial_shuffle_exhaustion=False)
        if self._no_production():
            self.phase = "stopped"
            self.emit("stop", reason="production_unavailable")

    def draw(self, count):
        drawn = []
        for _ in range(count):
            if not self.draw_pile:
                self.penalty += 1
                self.totals["exhaustions"] += 1
                self.emit("exhaustion", penalty=self.penalty, refill_count=len(self.discard))
                if not self.discard:
                    break
                self.draw_pile, self.discard = self.discard, []
                self.rng.shuffle(self.draw_pile)
            card = self.draw_pile.pop(0)
            self.hand.append(card)
            drawn.append(card)
            self.emit("draw", card=card)
        return drawn

    def roll_only(self):
        before = self.penalty
        count = self.K
        if self.penalty > 0:
            count = max(1, self.K - 1)
            self.penalty -= 1
            self.totals["penalty_consumed"] = self.totals.get("penalty_consumed", 0) + 1
            if count < self.K:
                self.totals["penalized_rolls"] += 1
        self.dice = [self.rng.randint(1, 6) for _ in range(count)]
        self.emit("roll", dice=self.dice, count=count, penalty_before=before, penalty_after=self.penalty)
        return self.dice[:]

    def _choose(self, value):
        require(self.phase == "choose" and value in self.dice, "현재 후보에서 눈 하나를 선택하세요")
        self.selected, self.mana, self.phase = value, value, "cards"
        self.emit("choose", value=value, path=self.path(value), mana=self.mana,
                  attacks=self.attack_list(self.path(value)))

    def _card(self, a):
        require(self.phase == "cards", "직원 사용 단계가 아닙니다")
        cid = a["card"]
        require(cid in self.hand, "손패에 없는 카드")
        kind = self.pool[cid]
        cost = STAFF[kind]["cost"]
        require(self.mana >= cost, "마나 부족")
        target = a.get("target")
        if kind != "D":
            require(self.deployed(target), "보드에 배치된 생존 괴이만 지원 가능")
        if kind == "H":
            require(self.visitor["A"] >= 2 and self.assets[target]["C"] > 0, "불안2와 공략도 양수 필요")
        if kind == "T":
            receiver = a.get("receiver")
            require(receiver != target and self.deployed(receiver), "서로 다른 배치된 생존 수신자 필요")
            require(target not in self.redirects, "대상에 이전 표식이 이미 있습니다")
        if kind == "B":
            slot = a.get("slot")
            require(isinstance(slot, int) and 1 <= slot <= self.n, "유효한 배치 슬롯 필요")
        self.hand.remove(cid)
        self.active.append(cid)
        self.mana -= cost
        self.totals["card_uses"] += 1
        self.emit("card", card=cid, kind=kind, cost=cost, target=target,
                  receiver=a.get("receiver"), slot=a.get("slot"), mana=self.mana)
        if kind == "G":
            self.shields[target] = self.shields.get(target, 0) + 8
        elif kind == "T":
            self.redirects[target] = receiver
        elif kind == "H":
            self._heal(target, cid)
        elif kind == "B":
            self.placements.append(dict(card=cid, slot=slot, target=target))
        elif kind == "D":
            self.draw(1)
        self.active.remove(cid)
        self.discard.append(cid)

    def _heal(self, aid, source):
        beforeA, beforeC = self.visitor["A"], self.assets[aid]["C"]
        self.visitor["A"] -= 2
        self.assets[aid]["C"] = max(0, beforeC - 8)
        self.totals["healed"] += beforeC - self.assets[aid]["C"]
        self.emit("heal", source=source, target=aid, A_before=beforeA,
                  A_after=self.visitor["A"], C_before=beforeC, C_after=self.assets[aid]["C"])

    def _supply(self, amount, source):
        before = self.visitor["A"]
        self.visitor["A"] = min(9, before + amount)
        self.emit("supply", source=source, A_before=before, A_after=self.visitor["A"])

    def _effect(self, aid, trigger):
        if not self.live(aid) or self.visitor["H"] == 0:
            return
        kind, A = self.assets[aid]["kind"], self.visitor["A"]
        if trigger == "pass":
            if kind == "U":
                self._supply(2, aid)
            elif kind == "V" and A >= 1:
                self._supply(1, aid)
            elif kind == "GT3":
                self._supply(min(3, A, 9-A), aid)
            elif kind == "GT2" and A >= 2:
                self.visitor["A"] -= 2
                self.fear(8, aid, trigger, A, 2)
        elif trigger == "arrival":
            if kind == "Q":
                used = min(3, A)
                self.visitor["A"] -= used
                self.fear(4*used, aid, trigger, A, used)
            elif kind == "GT1" and A >= 3:
                self.visitor["A"] -= 3
                self.fear(18, aid, trigger, A, 3)
            elif kind == "GT2" and A >= 1:
                self.visitor["A"] -= 1
                self.fear(8, aid, trigger, A, 1)

    def fear(self, amount, source="test", trigger="test", A_before=None, consumed=0):
        v = self.visitor
        if v["H"] <= 0:
            return
        beforeF, beforeH = v["F"], v["H"]
        v["F"] += amount
        overflow = 0
        if v["F"] >= v["T"]:
            overflow = v["F"] - v["T"]
            v["F"], v["H"] = 0, v["H"] - 1
        self.totals["fear"] += amount
        self.emit("fear", source=source, trigger=trigger, amount=amount, A_before=A_before,
                  consumed=consumed, A_after=v["A"], F_before=beforeF, F_after=v["F"],
                  H_before=beforeH, H_after=v["H"], overflow=overflow)
        if v["H"] == 0 and not v["paid"]:
            v["paid"] = True
            self.cash += v["reward"]
            self.totals["reward"] += v["reward"]
            self.totals["kills"] += 1
            self.emit("kill", reward=v["reward"], cash=self.cash, cancelled_remaining=True)

    def hit(self, slot, power):
        aid = self.slots[slot - 1]
        if not self.live(aid):
            self.emit("hit", slot=slot, original=aid, power=power, missed=True)
            return
        original = aid
        original_before = copy.deepcopy(self.assets[aid])
        absorbed_original = min(power, self.shields.get(aid, 0))
        self.shields[aid] = self.shields.get(aid, 0) - absorbed_original
        remaining = power - absorbed_original
        redirected = None
        fallback = False
        absorbed_receiver = 0
        if remaining > 0 and aid in self.redirects:
            redirected = self.redirects.pop(aid)
            if self.deployed(redirected):
                aid = redirected
                absorbed_receiver = min(remaining, self.shields.get(aid, 0))
                self.shields[aid] = self.shields.get(aid, 0) - absorbed_receiver
                remaining -= absorbed_receiver
            else:
                fallback = True
        asset = self.assets[aid]
        beforeC, beforeP = asset["C"], asset["P"]
        asset["C"] += remaining
        overflow = 0
        if asset["C"] >= asset["L"]:
            overflow = asset["C"] - asset["L"]
            asset["C"], asset["P"] = 0, asset["P"] - 1
            self.totals["breaks"] += 1
            if asset["P"] == 0:
                self.totals["destroyed"] += 1
        self.totals["damage"] += remaining
        self.totals["absorbed"] += absorbed_original + absorbed_receiver
        self.emit("hit", slot=slot, original=original, power=power,
                  original_before=original_before, absorbed_original=absorbed_original,
                  redirect=redirected, redirect_fallback=fallback,
                  absorbed_receiver=absorbed_receiver, target=aid, increase=remaining,
                  C_before=beforeC, C_after=asset["C"], P_before=beforeP, P_after=asset["P"],
                  overflow=overflow, destroyed=asset["P"] == 0)

    def _move(self):
        require(self.phase == "cards", "눈을 선택한 뒤 이동하세요")
        self.phase = "resolving"
        path, visited = self.path(self.selected), []
        for slot in path:
            self.visitor["position"] = slot
            visited.append(slot)
            self.emit("visit", slot=slot)
            aid = self.slots[slot - 1]
            if aid:
                self._effect(aid, "pass")
            if self.visitor["H"] == 0:
                break
            for placement in self.placements[:]:
                if placement["slot"] == slot:
                    self.placements.remove(placement)
                    target = placement["target"]
                    success = self.deployed(target) and self.assets[target]["C"] > 0 and self.visitor["A"] >= 2
                    self.emit("placement", **placement, success=success)
                    if success:
                        self._heal(target, placement["card"])
            if slot == path[-1] and len(visited) == len(path) and aid:
                self._effect(aid, "arrival")
            if self.visitor["H"] == 0:
                break
        if self.visitor["H"] > 0:
            for attack in self.attack_list(visited):
                self.hit(attack["slot"], attack["power"])
        self.emit("movement_end", visited=visited, attack_cancelled=self.visitor["H"] == 0)
        self.discard.extend(self.hand)
        self.hand = []
        self.mana = 0
        self.shields, self.redirects, self.placements = {}, {}, []
        self.selected = None
        if self.visitor["H"] == 0:
            self.results.append(dict(visitor=self.visitor["id"], turns=self.turn, outcome="kill",
                                     reward=self.visitor["reward"], penalty=self.penalty,
                                     assets=copy.deepcopy(self.assets)))
            if self.visitor_index == 0:
                self.phase = "between"
            elif self.visitor_index == 1:
                self.finish_service()
                self.phase = "management"
                self._reset_market()
            else:
                self.finish_service()
                self.phase = "complete"
        elif self.turn >= self.turn_limit:
            self.phase = "stopped"
            self.results.append(dict(visitor=self.visitor["id"], turns=self.turn, outcome="turn_limit"))
            self.emit("stop", reason="turn_limit")
        elif self._no_production():
            self.phase = "stopped"
            self.results.append(dict(visitor=self.visitor["id"], turns=self.turn, outcome="production_unavailable"))
            self.emit("stop", reason="production_unavailable")
        else:
            self.phase = "roll"

    def _no_production(self):
        kinds = {self.assets[x]["kind"] for x in self.slots if self.live(x)}
        return not (kinds & {"Q", "GT1", "GT2"}) or (self.visitor["A"] == 0 and "U" not in kinds)

    def finish_service(self):
        before = self.penalty
        self.penalty = 0
        self.emit("service_end", penalty_before=before, penalty_after=0)

