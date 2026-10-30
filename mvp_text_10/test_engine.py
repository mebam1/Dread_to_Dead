"""Rule checks for config 10. These deterministic fixtures are not playtest results."""
import copy
import json
import unittest

from engine import Game


def snapshot(g):
    return json.dumps(g.to_dict(), ensure_ascii=False, sort_keys=True)


def card(card_id, slot, state=None):
    result = {"card": card_id, "slot": slot}
    if state is not None:
        result["state"] = state
    return result


class Config10Tests(unittest.TestCase):
    def fixture(self, kind=None, *, a=0, b=0, c=0, F=0, T=100, H=3, eye=4, boss=False):
        g = Game.new(stage="C", seed=751)
        g.board = [None] * 6
        g.tiles = {}
        if kind:
            g.board[eye - 1] = "probe"
            g.tiles["probe"] = {"kind": kind, "hp": 4}
        g.pos, g.F, g.T, g.H = 0, F, T, H
        g.a, g.b, g.c = a, b, c
        g.eyes, g.boss = [eye], boss
        return g

    def hp(self, g, kind):
        values = [tile["hp"] for tile in g.tiles.values() if tile["kind"] == kind]
        return max(values, default=0)

    def test_documented_C_A_small_eye(self):
        g = Game.new(stage="C", variant="A", seed=1)
        g.resolve(2, [])
        self.assertEqual((g.F, g.H, g.cash), (0, 0, 2))
        self.assertEqual(self.hp(g, "SR1"), 4)

    def test_documented_C_A_pass_then_K(self):
        g = Game.new(stage="C", variant="A", seed=1)
        g.resolve(3, [card("K01", 3, "b")])
        self.assertEqual((g.F, g.H, g.cash, g.a, g.b), (4, 1, 0, 0, 3))
        self.assertEqual(self.hp(g, "radio"), 3)

    def test_documented_C_B_broken_input(self):
        g = Game.new(stage="C", variant="B", seed=1)
        g.resolve(2, [card("K01", 2, "a")])
        self.assertEqual((g.F, g.H, g.cash, g.a, g.b), (2, 1, 0, 1, 0))
        self.assertEqual(self.hp(g, "guide"), 3)

    def test_documented_E_immediate_both_visitors(self):
        for boss in (False, True):
            with self.subTest(boss=boss):
                g = Game.new(stage="E", boss=boss, seed=1)
                g.resolve(2, [])
                self.assertEqual((g.F, g.H, g.cash), (0, 0, 2))
                self.assertEqual(self.hp(g, "room"), 1)

    def test_documented_E_delay_both_visitors(self):
        for boss in (False, True):
            with self.subTest(boss=boss):
                g = Game.new(stage="E", boss=boss, seed=1)
                g.resolve(3, [card("K01", 6, "a")])
                self.assertEqual((g.F, g.H, g.cash, g.a, g.b), (6, 1, 0, 2, 1))
                self.assertEqual(self.hp(g, "room"), 0 if boss else 1)
                if boss:
                    self.assertIsNone(g.board[4])

    def test_nonfinal_token_continues_K_and_attack(self):
        g = self.fixture("room", a=2, b=2, F=4, T=8, H=2)
        g.resolve(4, [card("K01", 4, "b")])
        self.assertEqual((g.F, g.H, g.cash, g.b), (4, 1, 4, 2))
        self.assertEqual(self.hp(g, "room"), 3)

    def test_final_token_cancels_later_cards_and_boss_attack(self):
        g = self.fixture("room", a=2, b=2, F=4, T=8, H=1, boss=True)
        g.resolve(4, [card("K01", 4, "b"), card("K02", 4, "b")])
        self.assertEqual((g.F, g.H, g.cash), (0, 0, 4))
        self.assertEqual(self.hp(g, "room"), 4)
        self.assertEqual(g.hand, [])
        self.assertCountEqual(g.discard, ["K01", "K02"])

    def test_exact_threshold_is_zero_income(self):
        g = self.fixture("room", a=2, T=8, H=2)
        g.resolve(4, [])
        self.assertEqual((g.F, g.H, g.cash), (0, 1, 0))

    def test_single_effect_removes_only_one_token(self):
        g = self.fixture("room", a=2, T=2, H=3)
        g.resolve(4, [])
        self.assertEqual((g.F, g.H, g.cash), (0, 2, 6))

    def test_states_and_fear_survive_wrap(self):
        g = self.fixture(a=3, b=2, c=1, F=5, eye=2)
        g.pos = 5
        g.resolve(2, [])
        self.assertEqual((g.pos, g.F, g.a, g.b, g.c), (1, 5, 3, 2, 1))

    def test_boss_counts_each_visited_slot_once(self):
        g = self.fixture(eye=3, boss=True)
        g.board = ["one", "two", "three", None, None, None]
        g.tiles = {key: {"kind": kind, "hp": 4} for key, kind in
                   (("one", "guide"), ("two", "room"), ("three", "radio"))}
        g.resolve(3, [])
        self.assertEqual([g.tiles[key]["hp"] for key in ("one", "two", "three")], [3, 3, 3])

    def test_S_arrives_after_permanent_pass(self):
        g = self.fixture("SR1")
        g.pool["S01"] = "S"
        g.hand = ["S01"]
        g.resolve(4, [card("S01", 4)])
        self.assertEqual((g.F, g.a, g.b), (0, 2, 0))

    def test_R_before_permanent_arrival_can_feed_SR1(self):
        g = self.fixture("SR1")
        g.pool["R01"] = "R"
        g.hand = ["R01"]
        g.resolve(4, [card("R01", 4)])
        self.assertEqual((g.F, g.a, g.b), (8, 0, 0))

    def test_SR1_whole_output_bundle(self):
        g = self.fixture("SR1", a=1, b=8)
        g.resolve(4, [])
        self.assertEqual((g.F, g.a, g.b), (8, 1, 6))

    def test_SR2_preserves_both_inputs_and_requires_anxiety(self):
        for a, expected in ((0, 0), (1, 4)):
            with self.subTest(a=a):
                g = self.fixture("SR2", a=a, b=2)
                g.resolve(4, [])
                self.assertEqual((g.F, g.a, g.b), (expected, a, 2))

    def test_SR3_K_payoff_and_output_capacity(self):
        g = self.fixture("SR3", a=1, b=1)
        g.resolve(4, [card("K01", 4, "c")])
        self.assertEqual((g.F, g.a, g.b, g.c), (4, 0, 0, 2))
        g = self.fixture("SR3", a=1, b=1, c=8)
        g.resolve(4, [])
        self.assertEqual((g.F, g.a, g.b, g.c), (0, 1, 1, 8))

    def test_SK1_capacity_limits_consumption(self):
        g = self.fixture("SK1", a=2, c=8)
        g.resolve(4, [])
        self.assertEqual((g.F, g.a, g.c), (0, 1, 9))

    def test_SK2_consumes_only_positive_difference(self):
        for a, c, expected_a, expected_F in ((3, 2, 2, 4), (1, 2, 1, 0)):
            with self.subTest(a=a, c=c):
                g = self.fixture("SK2", a=a, c=c)
                g.resolve(4, [])
                self.assertEqual((g.F, g.a, g.c), (expected_F, expected_a, c))

    def test_SK3_fear_remains_at_anxiety_cap(self):
        g = self.fixture("SK3", a=9, c=2)
        g.resolve(4, [])
        self.assertEqual((g.F, g.a, g.c), (4, 9, 2))

    def test_RK1_capacity_limits_consumption(self):
        g = self.fixture("RK1", b=2, c=8)
        g.resolve(4, [])
        self.assertEqual((g.F, g.b, g.c), (0, 1, 9))

    def test_RK2_q_excludes_later_R_supply(self):
        g = self.fixture("RK2", b=1)
        g.pool["R01"] = "R"
        g.hand = ["R01"]
        g.resolve(4, [card("R01", 4)])
        self.assertEqual((g.F, g.b), (4, 2))

    def test_RK2_pass_does_not_pay_arrival(self):
        g = self.fixture("RK2", b=3)
        g.board = [None, "probe", None, None, None, None]
        g.resolve(4, [])
        self.assertEqual((g.F, g.b), (0, 1))

    def test_RK3_references_minimum_without_consuming(self):
        g = self.fixture("RK3", b=3, c=1)
        g.resolve(4, [])
        self.assertEqual((g.F, g.b, g.c), (3, 3, 1))

    def test_nonvisited_reserved_card_does_not_fire(self):
        g = self.fixture(a=2, eye=2)
        g.resolve(2, [card("K01", 6, "a")])
        self.assertEqual(g.F, 0)
        self.assertEqual(g.hand, [])
        self.assertCountEqual(g.discard, ["K01", "K02"])

    def test_invalid_actions_are_atomic(self):
        cases = [
            (5, []),
            (2, [card("K01", 2, "a"), card("K02", 2, "a")]),
            (3, [card("K01", 3, "a"), card("K01", 3, "a")]),
            (3, [card("S01", 3)]),
            (3, [card("K01", 0, "a")]),
            (3, [card("K01", 3, "invalid")]),
        ]
        for eye, plays in cases:
            with self.subTest(eye=eye, plays=plays):
                g = Game.new(stage="C", seed=1)
                before = snapshot(g)
                with self.assertRaises(ValueError):
                    g.resolve(eye, plays)
                self.assertEqual(snapshot(g), before)

    def test_preview_is_nonmutating_and_matches_resolve(self):
        g = Game.new(stage="C", seed=1)
        before = snapshot(g)
        preview = g.preview(3, [card("K01", 3, "b")])
        self.assertEqual(snapshot(g), before)
        events = g.resolve(3, [card("K01", 3, "b")])
        self.assertEqual(preview["state"], g.public_state())
        self.assertEqual(preview["events"], events)

    def test_fusion_consumes_pool_and_deck_and_validates_fixed_candidates(self):
        g = Game.new(stage="F", seed=1)
        before = snapshot(g)
        with self.assertRaises(ValueError):
            g.fuse("S01", "R01", "SK1")
        self.assertEqual(snapshot(g), before)
        g.fuse("R01", "S01", "SR3")
        self.assertNotIn("S01", g.pool)
        self.assertNotIn("R01", g.pool)
        self.assertCountEqual(g.deck, ["K01", "K02"])
        self.assertIn("SR3", [tile["kind"] for tile in g.tiles.values()])
        with self.assertRaises(ValueError):
            g.set_deck(["S01"])

    def test_management_is_locked_after_start_and_L_is_fixed(self):
        g = Game.new(stage="F", seed=1)
        g.start()
        for action in (
            lambda: g.fuse("S01", "R01", "SR1"),
            lambda: g.set_deck([]),
            lambda: g.arrange([None] * 6),
        ):
            before = snapshot(g)
            with self.assertRaises(ValueError):
                action()
            self.assertEqual(snapshot(g), before)
        g = Game.new(stage="L", seed=1)
        with self.assertRaises(ValueError):
            g.set_deck([])
        with self.assertRaises(ValueError):
            g.fuse("S01", "R01", "SR1")

    def test_recruitment_budget_limit_and_new_individuals(self):
        g = Game.new(stage="N", seed=1)
        g.recruit("S")
        g.recruit("S")
        self.assertEqual(g.cash, 0)
        self.assertEqual(sum(kind == "S" for kind in g.pool.values()), 3)
        before = snapshot(g)
        with self.assertRaises(ValueError):
            g.recruit("K")
        self.assertEqual(snapshot(g), before)

    def test_exhaustion_draws_remainder_without_shuffling_current_hand(self):
        g = Game.new(stage="C", seed=1)
        g.phase = "draw"
        g.hand, g.draw_pile, g.discard = [], ["K01"], ["K02"]
        g.draw_roll()
        self.assertEqual(g.hand[0], "K01")
        self.assertCountEqual(g.hand, ["K01", "K02"])
        self.assertEqual(len(g.eyes), 2)

    def test_empty_and_one_card_decks_finish_draw(self):
        for deck in ([], ["K01"]):
            with self.subTest(deck=deck):
                g = Game.new(stage="F", seed=1)
                g.set_deck(deck)
                g.start()
                g.draw_roll()
                self.assertCountEqual(g.hand, deck)
                self.assertEqual(len(g.eyes), 2)
                g.resolve(g.eyes[0], [])
                if g.phase != "ended":
                    g.draw_roll()
                    self.assertCountEqual(g.hand, deck)
                    self.assertEqual(len(g.eyes), 2)

    def test_exhaustion_penalty_resets_next_turn(self):
        g = Game.new(stage="L", seed=1)
        g.T = 100
        g.start()
        counts = []
        for _ in range(4):
            g.draw_roll()
            counts.append(len(g.eyes))
            g.resolve(g.eyes[0], [])
        self.assertEqual(counts, [3, 3, 2, 3])

    def test_serialization_preserves_next_draw_and_roll(self):
        g = Game.new(stage="F", seed=99)
        g.start()
        restored = Game.from_dict(json.loads(json.dumps(g.to_dict())))
        g.draw_roll()
        restored.draw_roll()
        self.assertEqual(g.public_state(), restored.public_state())
        public_json = json.dumps(g.public_state()).lower()
        self.assertNotIn("rng_state", public_json)
        self.assertNotIn('"seed"', public_json)

    def test_limit_ends_after_eighth_unfinished_turn(self):
        g = Game.new(stage="F", seed=1)
        g.set_deck([])
        g.arrange([None] * 6)
        g.start()
        for _ in range(8):
            g.draw_roll()
            g.resolve(g.eyes[0], [])
        self.assertEqual(g.phase, "ended")
        self.assertGreater(g.H, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
