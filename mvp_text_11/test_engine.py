"""Config 11 contract and diagnostic tests; no gameplay result is inferred from these."""
import copy
import pickle
import unittest

from engine import Game


def fixture(tiles=None, **kw):
    return Game.diagnostic(tiles=tiles or {}, **kw)


def tile(kind="U", **kw):
    return {"id": kw.pop("id", kind + "01"), "kind": kind, **kw}


def act(game, op, **kw):
    return game.command({"op": op, **kw})


def cp(game, asset):
    item = game.assets.get(asset, {})
    return item.get("C", 0), item.get("P", 0)


def select(game, value):
    act(game, "choose", value=value)


def use(game, card, **kw):
    act(game, "card", card=card, **kw)


class DiagnosticTests(unittest.TestCase):
    def assert_atomic_error(self, game, op, **kw):
        before = copy.deepcopy(game.__dict__)
        before["rng"] = game.rng.getstate()
        with self.assertRaises(ValueError):
            act(game, op, **kw)
        after = copy.deepcopy(game.__dict__)
        after["rng"] = game.rng.getstate()
        self.assertEqual(after, before)

    def test_D1_single_hit_discards_overflow(self):
        g = fixture({1: tile(C=18, L=20, P=3)})
        g.hit(1, 36)
        self.assertEqual(cp(g, "U01"), (0, 2))

    def test_D1_three_hits_each_check_limit(self):
        g = fixture({1: tile(C=18, L=20, P=3)})
        actual = []
        for _ in range(3):
            g.hit(1, 12)
            actual.append(cp(g, "U01"))
        self.assertEqual(actual, [(0, 2), (12, 2), (0, 1)])

    def test_D1b_absorb_then_redirect_once(self):
        g = fixture({1: tile(C=18), 2: tile("Q")}, hand=["G01", "T01"], dice=[6])
        select(g, 6)
        use(g, "G01", target="U01")
        use(g, "T01", target="U01", receiver="Q01")
        g.hit(1, 12)
        self.assertEqual(cp(g, "U01"), (18, 2))
        self.assertEqual(cp(g, "Q01"), (4, 2))
        g.hit(1, 12)
        self.assertEqual(cp(g, "U01"), (0, 1))
        self.assertEqual(cp(g, "Q01"), (4, 2))

    def test_full_absorption_preserves_redirect(self):
        g = fixture({1: tile(), 2: tile("Q")}, hand=["G01", "T01"], dice=[6])
        select(g, 6)
        use(g, "G01", target="U01")
        use(g, "T01", target="U01", receiver="Q01")
        g.hit(1, 6)
        self.assertEqual(cp(g, "Q01"), (0, 2))
        g.hit(1, 6)
        self.assertEqual(cp(g, "U01"), (0, 2))
        self.assertEqual(cp(g, "Q01"), (4, 2))

    def test_receiver_shield_and_no_redirect_recursion(self):
        g = fixture({1: tile(), 2: tile("Q"), 3: tile("V")},
                    hand=["G01", "T01", "T02"], dice=[6])
        select(g, 6)
        use(g, "G01", target="Q01")
        use(g, "T01", target="U01", receiver="Q01")
        use(g, "T02", target="Q01", receiver="V01")
        g.hit(1, 12)
        self.assertEqual(cp(g, "Q01"), (4, 2))
        self.assertEqual(cp(g, "V01"), (0, 3))
        g.hit(2, 1)
        self.assertEqual(cp(g, "Q01"), (4, 2))
        self.assertEqual(cp(g, "V01"), (1, 3))

    def test_dead_recipient_falls_back_without_second_origin_absorb(self):
        g = fixture({1: tile(), 2: tile("Q", P=1)}, hand=["G01", "T01"], dice=[6])
        select(g, 6)
        use(g, "G01", target="U01")
        use(g, "T01", target="U01", receiver="Q01")
        g.hit(2, 99)
        g.hit(1, 12)
        self.assertEqual(cp(g, "U01"), (4, 2))

    def test_duplicate_origin_redirect_rejected_atomically(self):
        g = fixture({1: tile(), 2: tile("Q"), 3: tile("V")},
                    hand=["T01", "T02"], dice=[6])
        select(g, 6)
        use(g, "T01", target="U01", receiver="Q01")
        self.assert_atomic_error(g, "card", card="T02", target="U01", receiver="V01")

    def test_stored_assets_cannot_receive_support(self):
        for card, args in [
            ("G01", {"target": "S01"}),
            ("H01", {"target": "S01"}),
            ("B01", {"target": "S01", "slot": 1}),
            ("T01", {"target": "U01", "receiver": "S01"}),
            ("T01", {"target": "S01", "receiver": "U01"}),
        ]:
            with self.subTest(card=card, args=args):
                g = fixture({1: tile(C=18)}, hand=[card], dice=[6], A=2)
                g.assets["S01"] = copy.deepcopy(g.assets["U01"])
                select(g, 6)
                self.assert_atomic_error(g, "card", card=card, **args)

    def test_D2_remote_immediate_support(self):
        g = fixture({6: tile("Q", C=18, P=1)}, hand=["H01", "G01"],
                    dice=[4, 4, 4], A=2, pattern="offset")
        select(g, 4)
        use(g, "H01", target="Q01")
        self.assertEqual((g.visitor["A"], cp(g, "Q01")), (0, (10, 1)))
        act(g, "move")
        self.assertEqual(cp(g, "Q01"), (16, 1))
        self.assertEqual(g.visitor["position"], 4)

    def test_D2_without_remote_support_destroyed(self):
        g = fixture({6: tile("Q", C=18, P=1)}, hand=["H01", "G01"],
                    dice=[4, 4, 4], A=2, pattern="offset")
        select(g, 4)
        act(g, "move")
        self.assertEqual(cp(g, "Q01")[1], 0)

    def test_D2P_attack_pattern_changes_safe_choice(self):
        results = {}
        for pattern in ("arrival", "offset"):
            for value in (2, 4, 6):
                g = fixture({6: tile("Q", C=18, P=1)}, hand=["H01", "G01"],
                            dice=[2, 4, 6], A=2, pattern=pattern)
                select(g, value)
                act(g, "move")
                results[(pattern, value)] = cp(g, "Q01")[1]
        self.assertEqual(results, {
            ("arrival", 2): 1, ("arrival", 4): 1, ("arrival", 6): 0,
            ("offset", 2): 0, ("offset", 4): 0, ("offset", 6): 1,
        })

    def d3(self, threshold=12):
        return fixture({1: tile(C=18, P=1), 2: tile("V"), 3: tile("Q")},
                       hand=["H01", "B01"], dice=[3, 3, 3],
                       T=threshold, pattern="offset")

    def test_D3_immediate_invalid_but_placement_waits_for_supply(self):
        for threshold in (12, 16):
            with self.subTest(T=threshold):
                g = self.d3(threshold)
                select(g, 3)
                self.assert_atomic_error(g, "card", card="H01", target="U01")
                use(g, "B01", slot=2, target="U01")
                act(g, "move")
                self.assertEqual(cp(g, "U01"), (16, 1))
                self.assertEqual((g.visitor["A"], g.visitor["F"], g.visitor["H"]), (0, 4, 1))
                self.assertEqual(g.cash, 0)

    def test_D3_unspent_state_kills_or_loses_supplier(self):
        low, high = self.d3(12), self.d3(16)
        for g in (low, high):
            select(g, 3)
            act(g, "move")
        self.assertEqual((low.visitor["H"], low.cash, cp(low, "U01")), (0, 6, (18, 1)))
        self.assertEqual((high.visitor["H"], high.visitor["F"], high.cash), (1, 12, 0))
        self.assertEqual(cp(high, "U01")[1], 0)

    def test_D4_placement_fires_only_on_first_visit(self):
        g = fixture({1: tile(C=16)}, n=4, hand=["B01", "G01"], dice=[6, 3, 2])
        select(g, 6)
        use(g, "B01", slot=1, target="U01")
        act(g, "move")
        self.assertEqual((g.visitor["position"], g.visitor["A"], cp(g, "U01")), (2, 2, (8, 2)))

    def test_placement_fizzle_removed_before_later_supply_and_revisit(self):
        g = fixture({3: tile(C=16)}, n=4, hand=["B01"], dice=[6])
        select(g, 6)
        use(g, "B01", slot=1, target="U01")
        act(g, "move")
        self.assertEqual((g.visitor["A"], cp(g, "U01")), (2, (16, 2)))

    def test_placement_zero_damage_target_consumes_no_state(self):
        g = fixture({6: tile()}, hand=["B01"], dice=[2], A=2)
        select(g, 2)
        use(g, "B01", slot=1, target="U01")
        act(g, "move")
        self.assertEqual((g.visitor["A"], cp(g, "U01")), (2, (0, 2)))

    def test_D5_draw_chain_penalty_and_immediate_use(self):
        g = fixture({6: tile("Q")}, hand=["D01", "D02"], draw=[],
                    discard=["G01"], pool=["D01", "D02", "G01"],
                    dice=[6], A=3, T=12)
        select(g, 6)
        use(g, "D01")
        use(g, "D02")
        self.assertEqual((g.hand, g.discard, g.mana, g.penalty), (["G01", "D01"], ["D02"], 4, 2))
        self.assertEqual(g.dice, [6])
        use(g, "G01", target="Q01")
        self.assertEqual(g.mana, 2)
        act(g, "move")
        self.assertEqual((g.visitor["H"], g.cash, g.penalty), (0, 6, 2))

    def test_D5_queue_consumes_one_per_roll(self):
        cards = ["G01", "T01", "H01", "B01", "D01", "D02"]
        g = fixture({}, hand=[], draw=cards, pool=cards, penalty=2)
        counts = []
        for _ in range(3):
            g.draw(2)
            g.roll_only()
            counts.append(len(g.dice))
            g.discard.extend(g.hand)
            g.hand = []
        self.assertEqual(counts, [2, 2, 3])
        self.assertEqual(g.penalty, 0)

    def test_D5_empty_draw_request_is_one_penalty_and_K1_floor(self):
        g = fixture({}, hand=[], draw=[], discard=[], pool=[], K=1)
        g.draw(2)
        self.assertEqual((g.penalty, g.hand), (1, []))
        g.draw(1)
        self.assertEqual(g.penalty, 2)
        g.roll_only()
        self.assertEqual((len(g.dice), g.penalty), (1, 1))
        g.roll_only()
        self.assertEqual((len(g.dice), g.penalty), (1, 0))
        self.assertEqual((g.totals["penalty_consumed"], g.totals["penalized_rolls"]), (2, 0))

    def test_inflight_card_and_current_hand_excluded_from_shuffle(self):
        g = fixture({}, hand=["D01", "G01"], draw=[], discard=[],
                    pool=["D01", "G01"], dice=[6])
        select(g, 6)
        use(g, "D01")
        self.assertEqual((g.hand, g.discard, g.penalty, g.mana), (["G01"], ["D01"], 1, 5))
        self.assertEqual(g.active, [])

    def test_redrawn_same_individual_can_be_used_again(self):
        g = fixture({}, hand=["D01", "D02"], discard=["G01"],
                    pool=["D01", "D02", "G01"], dice=[6])
        select(g, 6)
        use(g, "D01")
        use(g, "D02")
        use(g, "D01")
        self.assertEqual((g.hand, g.discard, g.penalty, g.mana), (["G01", "D02"], ["D01"], 3, 3))
        self.assertCountEqual(g.hand + g.discard + g.draw_pile + g.active, ["D01", "D02", "G01"])

    def test_D6_big_hit_and_real_chain_remove_different_tokens(self):
        results = []
        for kind in ("GT1", "GT2"):
            g = fixture({2: tile(kind)}, hand=["G01", "H01"],
                        dice=[2, 2, 2], A=3, T=8, H=2)
            select(g, 2)
            act(g, "move")
            results.append((g.visitor["H"], g.visitor["F"], g.cash, cp(g, kind + "01")[0]))
        self.assertEqual(results, [(1, 0, 0, 6), (0, 0, 6, 0)])

    def test_D6_final_kill_stops_arrival_state_consumption(self):
        g = fixture({2: tile("GT2")}, hand=["G01", "H01"],
                    dice=[2], A=3, T=8, H=1)
        select(g, 2)
        act(g, "move")
        self.assertEqual((g.visitor["H"], g.visitor["A"], g.cash), (0, 1, 6))
        g.fear(99)
        self.assertEqual(g.cash, 6)

    def test_D7_immediate_kill_vs_safe_first_heal(self):
        def make():
            return fixture({2: tile("Q"), 6: tile(C=16)}, hand=["H01", "G01"],
                           pool=["H01", "G01"], dice=[2, 4, 6], A=3, T=12)
        immediate, delay = make(), make()
        select(immediate, 2)
        act(immediate, "move")
        select(delay, 4)
        use(delay, "H01", target="U01")
        act(delay, "move")
        self.assertEqual((immediate.cash, immediate.visitor["H"], cp(immediate, "U01")), (6, 0, (16, 2)))
        self.assertEqual((delay.cash, delay.visitor["H"], delay.visitor["F"], delay.visitor["A"], cp(delay, "U01")),
                         (0, 1, 0, 1, (8, 2)))

    def test_support_never_repairs_tokens_or_resurrects(self):
        g = fixture({6: tile(C=3, P=1)}, hand=["H01"], dice=[2], A=2)
        select(g, 2)
        use(g, "H01", target="U01")
        self.assertEqual(cp(g, "U01"), (0, 1))
        g.hit(6, 99)
        g.hand = ["H01"]
        g.mana = 2
        g.visitor["A"] = 2
        self.assert_atomic_error(g, "card", card="H01", target="U01")

    def test_revisited_attack_targets_are_separate_hits(self):
        g = fixture({1: tile("GT3", C=8, L=10, P=3)}, n=1, dice=[3],
                    pattern="path", power=12)
        select(g, 3)
        act(g, "move")
        self.assertEqual(cp(g, "GT301")[1], 0)

    def test_visitor_state_persists_across_laps(self):
        g = fixture({1: tile("V")}, n=3, dice=[6], A=1, F=5)
        select(g, 6)
        act(g, "move")
        self.assertEqual((g.visitor["A"], g.visitor["F"]), (3, 5))

    def test_state_clamp_and_zero_amplifier(self):
        for kind, start, expected in (("U", 8, 9), ("V", 0, 0), ("GT3", 0, 0), ("GT3", 8, 9)):
            with self.subTest(kind=kind, A=start):
                g = fixture({1: tile(kind)}, dice=[2], A=start)
                select(g, 2)
                act(g, "move")
                self.assertEqual(g.visitor["A"], expected)


    def test_unvisited_placement_expires_at_turn_end(self):
        g = fixture({6: tile(C=16), 5: tile("Q")}, hand=["B01"], dice=[2], A=2)
        select(g, 2)
        use(g, "B01", slot=3, target="U01")
        act(g, "move")
        self.assertEqual(g.placements, [])
        g.phase, g.dice = "choose", [1]
        select(g, 1)
        act(g, "move")
        self.assertEqual((cp(g, "U01"), g.visitor["A"]), ((16, 2), 2))

    def test_original_destroyed_or_empty_hit_does_not_retarget(self):
        g = fixture({1: tile(P=1), 2: tile("Q")}, hand=["T01"], dice=[2])
        select(g, 2)
        use(g, "T01", target="U01", receiver="Q01")
        g.assets["U01"]["P"] = 0
        g.hit(1, 9)
        g.hit(3, 9)
        self.assertEqual(cp(g, "Q01"), (0, 2))

    def test_turn_eight_kill_wins_before_observation_cap(self):
        kill = fixture({2: tile("Q")}, dice=[2], A=3, T=12)
        kill.turn = 8
        select(kill, 2)
        act(kill, "move")
        self.assertEqual((kill.phase, kill.cash, kill.results[-1]["outcome"]), ("between", 6, "kill"))
        stalled = fixture({2: tile("Q")}, dice=[1], A=3, T=12)
        stalled.turn = 8
        select(stalled, 1)
        act(stalled, "move")
        self.assertEqual((stalled.phase, stalled.cash, stalled.results[-1]["outcome"]), ("stopped", 0, "turn_limit"))
        self.assert_atomic_error(stalled, "start")

    def test_preview_does_not_consume_rng_or_modify_game(self):
        g = fixture({1: tile(), 2: tile("V"), 4: tile("Q")}, hand=["G01"], dice=[2, 4, 6], T=12)
        before = copy.deepcopy(g.__dict__)
        before["rng"] = g.rng.getstate()
        response = act(g, "preview", value=4)
        after = copy.deepcopy(g.__dict__)
        after["rng"] = g.rng.getstate()
        self.assertEqual(after, before)
        self.assertTrue(response["preview"])
        self.assertEqual(response["state"]["cash"], 6)
        public = g.public()
        self.assertNotIn("rng", public)
        self.assertNotIn("draw_pile", public)
        self.assertEqual(public["draw_count"], len(g.draw_pile))

    def test_same_service_preserves_penalty_damage_and_clears_visitor(self):
        g = fixture({1: tile(C=7, P=1), 2: tile("Q")}, hand=["G01", "D01"],
                    pool=["G01", "D01"], dice=[2], A=1, T=12, penalty=2)
        select(g, 2)
        act(g, "move")
        self.assertEqual(g.phase, "between")
        self.assert_atomic_error(g, "repair", target="U01")
        self.assert_atomic_error(g, "arrange", slots=g.slots)
        act(g, "start")
        self.assertEqual((g.visitor["id"], g.visitor["F"], g.visitor["A"], g.visitor["position"]), ("V2", 0, 0, 0))
        self.assertEqual((g.penalty, cp(g, "U01")), (2, (7, 1)))
        self.assertEqual((g.hand, g.discard, len(g.draw_pile)), ([], [], 2))
        self.assertEqual(g.totals["exhaustions"], 0)
        act(g, "roll")
        self.assertEqual((len(g.dice), g.penalty), (2, 1))

    def test_service_end_resets_penalty_only_and_opens_market(self):
        g = fixture({1: tile(C=7, P=1), 2: tile("Q")}, pool=["G01", "D01"],
                    dice=[2], A=1, T=12, penalty=3, visitor_index=1)
        select(g, 2)
        act(g, "move")
        self.assertEqual((g.phase, g.penalty, cp(g, "U01"), g.cash), ("management", 0, (7, 1), 6))
        act(g, "repair", target="U01")
        self.assertEqual((cp(g, "U01"), g.cash), ((0, 1), 3))
        act(g, "start")
        self.assertEqual((g.service, g.visitor["id"], g.visitor["T"], g.visitor["H"]), ("B", "V3", 16, 2))
        self.assertEqual((g.penalty, cp(g, "U01")), (0, (0, 1)))

    def test_final_service_marks_complete_and_clears_penalty(self):
        g = fixture({2: tile("Q")}, dice=[2], A=3, T=12, penalty=2, visitor_index=2)
        select(g, 2)
        act(g, "move")
        self.assertEqual((g.phase, g.penalty, g.cash), ("complete", 0, 6))
        self.assert_atomic_error(g, "start")

    def test_fusion_consumes_exact_two_and_order_is_symmetric(self):
        for choice in ("GT1", "GT2", "GT3"):
            results = []
            for a, b in (("G01", "T01"), ("T01", "G01")):
                g = Game(1101)
                act(g, "fusion", a=a, b=b, choice=choice)
                self.assertEqual(set(g.pool), {"H01", "B01", "D01", "D02"})
                self.assertEqual(set(g.deck), set(g.pool))
                self.assertEqual(g.cash, 0)
                self.assertEqual(len(g.assets), 4)
                self.assertNotIn(choice + "01", g.slots)
                results.append(g.assets[choice + "01"])
            self.assertEqual(results[0], results[1])

    def test_invalid_fusion_does_not_consume_staff(self):
        g = Game(1101)
        self.assert_atomic_error(g, "fusion", a="G01", b="G01", choice="GT2")
        self.assert_atomic_error(g, "fusion", a="G01", b="H01", choice="GT2")
        self.assert_atomic_error(g, "fusion", a="G01", b="T01", choice="GT4")

    def test_recruit_prices_stocks_and_individual_ids(self):
        g = Game(1101)
        self.assert_atomic_error(g, "recruit", kind="G")
        g.cash = 20
        act(g, "fusion", a="G01", b="T01", choice="GT2")
        act(g, "recruit", kind="G")
        self.assertIn("G02", g.pool)
        self.assertNotIn("G02", g.deck)
        self.assertEqual(g.cash, 16)
        self.assert_atomic_error(g, "recruit", kind="G")
        act(g, "recruit", kind="T")
        self.assertEqual(g.cash, 12)
        self.assert_atomic_error(g, "recruit", kind="H")
        act(g, "fusion", a="G02", b="T02", choice="GT2")
        self.assertIn("GT202", g.assets)
        self.assertNotIn("G02", g.pool)
        self.assertEqual(g.cash, 12)

    def test_buy_and_repair_spend_once_without_restoring_tokens(self):
        g = Game(1101)
        g.cash = 20
        act(g, "buy", kind="Q")
        self.assertEqual((g.cash, cp(g, "Q02")), (14, (0, 2)))
        self.assertNotIn("Q02", g.slots)
        self.assert_atomic_error(g, "buy", kind="Q")
        g.assets["U01"].update(C=18, P=1)
        act(g, "repair", target="U01")
        self.assertEqual((g.cash, cp(g, "U01")), (11, (10, 1)))
        self.assert_atomic_error(g, "repair", target="U01")
        g.assets["V01"]["P"] = 0
        self.assert_atomic_error(g, "repair", target="V01")

    def test_deck_ownership_management_lock_and_empty_deck(self):
        g = Game(1101)
        self.assert_atomic_error(g, "deck", cards=["G01", "G01"])
        self.assert_atomic_error(g, "deck", cards=["G99"])
        self.assert_atomic_error(g, "arrange", slots=["U01", "U01", None, None, None, None])
        act(g, "deck", cards=[])
        act(g, "start")
        self.assertEqual(g.phase, "roll")
        self.assert_atomic_error(g, "deck", cards=["G01"])
        act(g, "roll")
        self.assertEqual((g.hand, len(g.dice), g.penalty, g.totals["exhaustions"]), ([], 2, 0, 1))

    def test_postkill_stops_remaining_movement_and_all_attack(self):
        g = fixture({2: tile("GT2"), 4: tile()}, dice=[6], A=3, T=8)
        select(g, 6)
        act(g, "move")
        visits = [e["slot"] for e in g.events if e["event"] == "visit"]
        self.assertEqual(visits, [1, 2])
        self.assertFalse(any(e["event"] == "hit" for e in g.events))
        self.assertEqual((g.visitor["A"], g.cash), (1, 6))


    def test_old_save_set_ids_and_missing_counter_migrate(self):
        g = Game(1101)
        g.cash = 8
        g.issued_ids = set(g.issued_ids)
        del g.totals["penalty_consumed"]
        restored = pickle.loads(pickle.dumps(g))
        act(restored, "recruit", kind="G")
        act(restored, "fusion", a="G01", b="T01", choice="GT2")
        self.assertIn("G02", restored.pool)
        self.assertIn("GT201", restored.assets)
        self.assertEqual(restored.cash, 4)
        self.assertEqual(restored.totals["penalty_consumed"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)

