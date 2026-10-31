"""Independent config-12 rule regression checks; no balance claims."""
import tempfile
import unittest
from pathlib import Path
from engine import Game, Entity


DEFAULT = dict(key='check', name='check', T=99, H=1, pattern='none', power=6, reward=2)


def diagnostic(layout, **overrides):
    spec = dict(DEFAULT, **overrides)
    return Game.diagnostic(layout, spec, seed=20261031)


def selected(g, distance=1):
    g.begin_turn([distance] * 3)
    g.choose(distance)
    return g


def reject_unchanged(test, g, fn):
    before = g.state()
    with test.assertRaises(Exception):
        fn()
    test.assertEqual(g.state(), before)


class RuleChecks(unittest.TestCase):
    def test_arrival_skips_pass(self):
        g = diagnostic(['U01', None, None, None, None, None])
        selected(g).move()
        self.assertEqual(g.visitor['A'], 1)

    def test_pass_supply_arrival_harvest(self):
        g = diagnostic(['U01', None, 'Q01', None, None, None])
        selected(g, 3).move()
        self.assertEqual((g.visitor['A'], g.visitor['F']), (0, 8))

    def test_top_wrap_is_arrival_only(self):
        g = diagnostic(['U01', None, None, None, None, None])
        g.visitor['p'] = 4
        selected(g, 3).move()
        self.assertEqual((g.visitor['p'], g.visitor['A']), (1, 1))

    def test_supply_cap_and_amplifier_empty(self):
        for a, expected in [(0, 0), (8, 9), (9, 9)]:
            g = diagnostic(['E01', None, None, None, None, None])
            g.visitor['A'] = a
            selected(g, 2).move()
            self.assertEqual(g.visitor['A'], expected)
        g = diagnostic(['U01', None, None, None, None, None])
        g.visitor['A'] = 8
        selected(g, 2).move()
        self.assertEqual(g.visitor['A'], 9)

    def test_one_fear_effect_only_one_heart(self):
        g = diagnostic(['Q01', None, None, None, None, None], T=6, H=3)
        g.visitor['A'] = 3
        selected(g).move()
        self.assertEqual((g.visitor['A'], g.visitor['F'], g.visitor['H']), (0, 0, 2))
        self.assertEqual(g.cash, 0)

    def test_b_repeats_and_stops_everything_after_final_heart(self):
        g = diagnostic(['B01', None, None, None, None, None], T=6, H=2, pattern='double')
        selected(g)
        g.active('B01')
        self.assertEqual((g.visitor['H'], g.owned['B01'].charges, g.cash), (1, 1, 0))
        g.active('B01')
        self.assertEqual((g.visitor['H'], g.visitor['p'], g.owned['B01'].charges, g.cash), (0, 0, 0, 2))
        self.assertEqual(g.phase, 'visitor_end')
        reject_unchanged(self, g, lambda: g.active('B01'))

    def test_play_sequence_stops_after_active_kill(self):
        g = diagnostic(['B01', None, None, None, None, None], T=6, H=1, pattern='double')
        g.begin_turn([1, 1, 1])
        g.play(1, [('B01', None), ('B01', None)])
        self.assertEqual((g.owned['B01'].charges, g.visitor['p'], g.owned['B01'].p, g.cash), (1, 0, 1, 2))

    def test_active_requires_selected_eye_and_cannot_reselect(self):
        g = diagnostic(['B01', None, None, None, None, None])
        reject_unchanged(self, g, lambda: g.active('B01'))
        g.begin_turn([1, 2, 3])
        reject_unchanged(self, g, lambda: g.choose(6))
        g.choose(1)
        reject_unchanged(self, g, lambda: g.choose(2))

    def test_guard_twice_absorbs_two_distinct_hits(self):
        g = diagnostic(['Q01', 'G01', None, None, None, None], pattern='double')
        selected(g)
        g.active('G01', 'Q01')
        g.active('G01', 'Q01')
        g.move()
        self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p, g.owned['G01'].charges), (0, 2, 0))
        self.assertEqual(g.owned['Q01'].shield, 0)

    def test_guard_self_and_invalid_target(self):
        g = diagnostic(['G01', None, None, None, None, None], pattern='double')
        selected(g)
        reject_unchanged(self, g, lambda: g.active('G01', 'missing'))
        g.active('G01', 'G01')
        g.move()
        self.assertEqual((g.owned['G01'].c, g.owned['G01'].p), (6, 2))

    def test_granted_shield_outlives_caster(self):
        g = diagnostic(['G01', None, 'Q01', None, None, None], pattern='path')
        g.owned['G01'].c, g.owned['G01'].p = 6, 1
        selected(g, 3)
        g.active('G01', 'Q01')
        g.move()
        self.assertEqual(g.owned['G01'].p, 0)
        self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p), (0, 2))

    def test_hits_discard_overflow_separately(self):
        g = diagnostic(['Q01', None, None, None, None, None], pattern='double')
        g.owned['Q01'].c = 10
        selected(g).move()
        self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p), (6, 1))

    def test_first_hit_destroys_second_misses(self):
        g = diagnostic(['Q01', 'U01', None, None, None, None], pattern='double')
        g.owned['Q01'].c, g.owned['Q01'].p = 6, 1
        selected(g).move()
        self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p), (0, 0))
        self.assertEqual((g.owned['U01'].c, g.owned['U01'].p), (0, 2))

    def test_r_repeat_pays_each_time_and_never_heals_p(self):
        g = diagnostic(['Q01', 'R01', None, None, None, None])
        g.owned['Q01'].c, g.owned['Q01'].p = 10, 1
        g.visitor['A'] = 4
        selected(g)
        g.active('R01', 'Q01')
        g.active('R01', 'Q01')
        self.assertEqual((g.visitor['A'], g.owned['Q01'].c, g.owned['Q01'].p), (0, 0, 1))
        reject_unchanged(self, g, lambda: g.active('R01', 'Q01'))

    def test_r_insufficient_a_and_zero_c_are_rejected(self):
        g = diagnostic(['Q01', 'R01', None, None, None, None])
        g.owned['Q01'].c = 6
        g.visitor['A'] = 1
        selected(g)
        reject_unchanged(self, g, lambda: g.active('R01', 'Q01'))
        g.visitor['A'] = 4
        g.owned['Q01'].c = 0
        reject_unchanged(self, g, lambda: g.active('R01', 'Q01'))

    def test_stored_dead_sources_and_dead_targets_disabled(self):
        g = diagnostic(['Q01', 'G01', None, None, None, None])
        g.owned['B01'] = Entity('B01', 'B')
        selected(g)
        reject_unchanged(self, g, lambda: g.active('B01'))
        g.owned['G01'].p = 0
        reject_unchanged(self, g, lambda: g.active('G01', 'Q01'))
        g.owned['G01'].p, g.owned['Q01'].p = 2, 0
        reject_unchanged(self, g, lambda: g.active('G01', 'Q01'))

    def test_web_prerequisite_budget_inventory_and_cross_branch(self):
        g = Game.new()
        reject_unchanged(self, g, lambda: g.buy('R01'))
        reject_unchanged(self, g, lambda: g.buy('Q03'))
        g.buy('G01')
        self.assertEqual(g.cash, 0)
        reject_unchanged(self, g, lambda: g.buy('E01'))
        g.cash = 8
        reject_unchanged(self, g, lambda: g.buy('G01'))
        g.owned['G01'].p = 0
        g.buy('R01')
        g.buy('E01')
        self.assertEqual(g.cash, 0)
        self.assertTrue({'G01', 'R01', 'E01'} <= g.purchased)

    def test_management_locked_during_service(self):
        g = Game.new()
        g.start_service()
        reject_unchanged(self, g, lambda: g.buy('E01'))
        reject_unchanged(self, g, lambda: g.arrange([None] * 6))
        reject_unchanged(self, g, lambda: g.start_service())

    def test_arrange_no_duplicate_or_unowned_and_no_recharge(self):
        g = Game.new()
        reject_unchanged(self, g, lambda: g.arrange(['U01'] * 6))
        reject_unchanged(self, g, lambda: g.arrange(['R01', None, None, None, None, None]))
        g.owned['B01'].charges = 0
        g.owned['U01'].c, g.owned['U01'].p = 8, 1
        g.arrange([None, 'U01', 'Q01', 'Q02', None, None])
        self.assertEqual((g.owned['B01'].charges, g.owned['U01'].c, g.owned['U01'].p), (0, 8, 1))

    def test_guest_reset_only_c_and_temporary_values(self):
        g = diagnostic(['U01', 'E01', 'B01', 'G01', None, None])
        g.owned['U01'].c, g.owned['U01'].p = 10, 1
        g.owned['E01'].p = 0
        g.owned['B01'].charges, g.owned['G01'].charges = 0, 1
        g.owned['U01'].shield = 6
        g.cash = 2
        g.purchased = {'G01', 'E01'}
        g.start_guest(dict(DEFAULT, key='next'))
        self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['U01'].shield), (0, 1, 0))
        self.assertEqual((g.owned['E01'].p, g.owned['B01'].charges, g.owned['G01'].charges, g.cash), (0, 0, 1, 2))
        self.assertEqual(g.purchased, {'G01', 'E01'})

    def test_service_reset_restores_p0_stored_and_charges(self):
        g = Game.new()
        g.buy('G01')
        g.owned['E01'] = Entity('E01', 'E')
        g.purchased.add('E01')
        g.owned['U01'].c, g.owned['U01'].p = 10, 1
        g.owned['E01'].p = 0
        g.owned['B01'].charges, g.owned['G01'].charges = 0, 1
        g.cash = 2
        g.start_service()
        self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['E01'].p), (0, 2, 1))
        self.assertEqual((g.owned['B01'].charges, g.owned['G01'].charges, g.cash), (2, 2, 2))
        self.assertEqual(g.purchased, {'G01', 'E01'})

    def test_final_turn_kill_succeeds_and_nonkill_fails(self):
        g = diagnostic(['B01', None, None, None, None, None], T=6)
        g.visitor['turn'] = 7
        selected(g)
        g.active('B01')
        self.assertEqual(g.phase, 'visitor_end')
        g = diagnostic([None] * 6)
        g.visitor['turn'] = 7
        selected(g).move()
        self.assertEqual(g.phase, 'failed')
        reject_unchanged(self, g, lambda: g.advance())
        reject_unchanged(self, g, lambda: g.start_service())

    def test_save_load_preserves_damage_charge_purchase_and_current_dice(self):
        g = diagnostic(['U01', 'G01', None, None, None, None])
        g.owned['U01'].c, g.owned['U01'].p = 10, 1
        g.owned['G01'].charges = 1
        g.cash, g.purchased = 2, {'G01'}
        g.begin_turn([1, 3, 6])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'state.json'
            g.save(path)
            loaded = Game.load(path)
        self.assertEqual(loaded.state(), g.state())

    def test_d2_zero_one_two_guard_expected_outcomes(self):
        for uses, expected in [(0, (0, 0)), (1, (0, 0)), (2, (6, 1))]:
            g = diagnostic(['U01', 'E01', 'Q01', 'G01', 'Q02', 'B01'], T=16, pattern='double')
            g.owned['Q01'].c, g.owned['Q01'].p = 6, 1
            g.owned['B01'].charges = 0
            selected(g, 3)
            for _ in range(uses):
                g.active('G01', 'Q01')
            g.move()
            self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p), expected)
            self.assertEqual((g.visitor['F'], g.visitor['A']), (12, 1))
            selected(g, 2).move()
            self.assertEqual((g.phase, g.cash), ('visitor_end', 2))

    def test_d3_heal_and_threshold_context(self):
        for threshold in [12, 16]:
            for heal in [False, True]:
                g = diagnostic(['U01', None, 'Q01', 'R01', None, None], T=threshold, pattern='offset')
                g.owned['U01'].c = 10
                g.visitor['p'], g.visitor['A'] = 2, 5
                selected(g)
                if heal:
                    g.active('R01', 'U01')
                g.move()
                if threshold == 12:
                    self.assertEqual((g.phase, g.cash, g.owned['U01'].p), ('visitor_end', 2, 2))
                else:
                    self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.visitor['A']), (10, 2, 0) if heal else (0, 1, 2))

    def test_d4_purchase_effect_changes_damage_and_progress(self):
        for kind in ['G', 'E']:
            for threshold in [12, 16]:
                g = diagnostic(['U01', kind + '01', 'Q01', None, 'Q02', None], T=threshold, pattern='double')
                selected(g, 3)
                if kind == 'G':
                    g.active('G01', 'Q01')
                g.move()
                if kind == 'G':
                    self.assertEqual((g.visitor['F'], g.owned['Q01'].c, g.owned['Q01'].p, g.owned['G01'].charges), (8, 6, 2, 1))
                elif threshold == 12:
                    self.assertEqual((g.phase, g.owned['Q01'].p), ('visitor_end', 2))
                else:
                    self.assertEqual((g.visitor['F'], g.owned['Q01'].c, g.owned['Q01'].p), (12, 0, 1))

    def test_normal_lifecycle_delays_service_reset_and_preserves_final_damage(self):
        g = Game.new()
        g.start_service()
        for visitor in range(4):
            self.assertEqual(g.visitor['key'], 'V' + str(visitor + 1))
            g.visitor['T'], g.visitor['H'] = 6, 1
            g.owned['B01'].charges = 2
            selected(g)
            g.active('B01')
            g.owned['U01'].c, g.owned['U01'].p = 10, 1
            g.advance()
            if visitor in (0, 2):
                self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['B01'].charges), (0, 1, 1))
                self.assertEqual(g.phase, 'turn_ready')
            elif visitor == 1:
                self.assertEqual(g.phase, 'management')
                self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['B01'].charges), (10, 1, 1))
                g.start_service()
                self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['B01'].charges), (0, 2, 2))
            else:
                self.assertEqual(g.phase, 'complete')
                self.assertEqual((g.owned['U01'].c, g.owned['U01'].p, g.owned['B01'].charges), (10, 1, 1))
                reject_unchanged(self, g, lambda: g.start_service())
        self.assertEqual((g.cash, g.earned), (12, 8))

    def test_unused_shield_expires_and_dead_floor_has_no_effect(self):
        g = diagnostic(['U01', 'G01', None, None, None, None])
        g.owned['U01'].p = 0
        selected(g)
        g.active('G01', 'G01')
        g.move()
        self.assertEqual(g.visitor['A'], 0)
        self.assertEqual(g.owned['G01'].shield, 0)

    def test_preview_does_not_change_live_state_or_reveal_later_turn(self):
        g = diagnostic(['U01', None, 'Q01', None, None, None])
        g.begin_turn([1, 3, 6])
        before = g.state()
        preview = g.preview(3)
        self.assertEqual(g.state(), before)
        self.assertEqual((preview.visitor['F'], preview.visitor['turn']), (8, 1))

    def test_normal_dice_reproducible_per_visitor_turn(self):
        a = diagnostic(['U01', None, None, None, None, None], key='paired')
        b = diagnostic(['U01', None, None, None, None, None], key='paired')
        self.assertEqual(a.begin_turn(), b.begin_turn())
        self.assertTrue(all(1 <= x <= 6 for x in a.state()['dice']))


if __name__ == '__main__':
    unittest.main()
