"""Independent config 14 expected outcomes, including critical boundary interactions."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from engine import Game, Entity


def game(variant='M14', **overrides):
    g = Game.new(14001, variant, stream='check')
    g.start_service()
    spec = dict(key='check', name='check', T=99, H=1, pattern='none', power=6, reward=2)
    spec.update(overrides)
    g.start_guest(spec)
    return g


def play(g, value, actions=(), **kwargs):
    g.begin_turn(forced=[value] * 3)
    g.play(value, actions, **kwargs)
    return g


def selected(g, value):
    g.begin_turn(forced=[value] * 3)
    g.choose(value)
    return g


def idle_game():
    g = game(pattern='double')
    g.visitor['p'] = 4
    g.owned['U01'].p = g.owned['B01'].p = 0
    g.owned['G01'].charges = 0
    return g


def reject(test, g, fn):
    before, logs = g.state(), deepcopy(g.logs)
    with test.assertRaises((ValueError, TypeError)):
        fn()
    test.assertEqual(g.state(), before)
    test.assertEqual(g.logs, logs)


class RulesChecks(unittest.TestCase):
    def test_fixed_start_three_variants(self):
        for variant in ('C13', 'M14', 'C14'):
            g = game(variant)
            self.assertEqual(g.board, ['U01', 'G01', 'Q01', None, 'Q02', 'B01'])
            self.assertEqual((g.cash, g.owned['G01'].charges, g.idle_count, g.idle_limit), (0, 2, 0, 3))

    def test_arrival_supplier_excludes_pass_and_caps(self):
        g = game()
        play(g, 1)
        self.assertEqual(g.visitor['A'], 4)
        g = game()
        g.visitor.update(p=4, A=8)
        play(g, 3)
        self.assertEqual((g.visitor['p'], g.visitor['A']), (1, 9))

    def test_supplier_then_harvest_is_activity_despite_A_zero(self):
        g = game()
        g.idle_count = 2
        play(g, 3)
        self.assertEqual((g.visitor['A'], g.visitor['F'], g.idle_count, g.idle_limit), (0, 8, 0, 3))

    def test_heart_reset_F_zero_is_still_activity(self):
        g = game(T=8, H=2)
        g.idle_count = 2
        play(g, 3)
        self.assertEqual((g.visitor['H'], g.visitor['F'], g.idle_count), (1, 0, 0))

    def test_active_with_zero_absorption_counts_as_activity(self):
        g = idle_game()
        g.idle_count, g.idle_limit = 1, 2
        g.owned['G01'].charges = 1
        play(g, 6, [('G01', 'Q01')])
        self.assertEqual((g.idle_count, g.idle_limit), (0, 3))
        self.assertFalse(any(e['event'] == 'penalty' for e in g.logs))
        self.assertEqual(sum(e.get('blocked', 0) for e in g.logs if e['event'] == 'hit'), 0)

    def test_charge_only_and_cap_waste_are_inactive(self):
        for charges, after in [(0, 1), (2, 2)]:
            g = game()
            g.visitor['p'] = 1
            g.owned['G01'].charges = charges
            play(g, 1)
            self.assertEqual((g.owned['G01'].charges, g.idle_count), (after, 1))

    def test_zero_harvest_and_capped_U_are_inactive(self):
        for pos, A, distance in [(2, 0, 1), (6, 9, 1)]:
            g = game()
            g.visitor.update(p=pos, A=A)
            play(g, distance)
            self.assertEqual(g.idle_count, 1)

    def test_charge_path_with_real_supply_is_active(self):
        g = game()
        g.owned['G01'].charges = 0
        g.idle_count = 2
        play(g, 2)
        self.assertEqual((g.visitor['A'], g.owned['G01'].charges, g.idle_count), (2, 1, 0))

    def test_idle_penalties_at_3_5_7(self):
        g = idle_game()
        times = []
        for t in range(1, 8):
            start = len(g.logs)
            play(g, 6)
            if any(e['event'] == 'penalty' for e in g.logs[start:]):
                times.append(t)
                self.assertEqual((g.idle_count, g.idle_limit), (0, 2))
        self.assertEqual(times, [3, 5, 7])

    def test_activity_interrupts_first_count(self):
        g = idle_game()
        g.owned['G01'].charges = 1
        times = []
        for t in range(1, 7):
            start = len(g.logs)
            play(g, 6, [('G01', 'Q01')] if t == 3 else [])
            if any(e['event'] == 'penalty' for e in g.logs[start:]):
                times.append(t)
        self.assertEqual(times, [6])

    def test_activity_after_first_penalty_restores_three(self):
        g = idle_game()
        times = []
        for t in range(1, 10):
            if t == 4:
                g.owned['G01'].charges = 1
            start = len(g.logs)
            play(g, 6, [('G01', 'Q01')] if t == 4 else [])
            if any(e['event'] == 'penalty' for e in g.logs[start:]):
                times.append(t)
        self.assertEqual(times, [3, 7, 9])

    def test_penalty_8_12_and_threshold_discard(self):
        for c, amount, expected in [(0, 8, (8, 2)), (0, 12, (0, 1)), (4, 8, (0, 1)), (4, 12, (0, 1))]:
            g = idle_game()
            g.owned['Q01'].p = g.owned['Q02'].p = 0
            g.owned['G01'].c = c
            g.penalty_amount = amount
            g.idle_count = 2
            play(g, 6)
            self.assertEqual((g.owned['G01'].c, g.owned['G01'].p), expected)

    def test_penalty_excludes_just_destroyed_target(self):
        g = idle_game()
        g.visitor.update(pattern='fixed', attacks=[[3, 6]])
        g.owned['Q01'].c, g.owned['Q01'].p = 6, 1
        g.owned['Q02'].p = 0
        g.idle_count = 2
        play(g, 6)
        p = [e for e in g.logs if e['event'] == 'penalty'][-1]
        self.assertEqual((g.owned['Q01'].p, p['target'], g.owned['G01'].p), (0, 'G01', 1))

    def test_penalty_has_no_target_when_everyone_dead(self):
        g = idle_game()
        for e in g.owned.values():
            e.p = 0
        g.idle_count = 2
        play(g, 6)
        self.assertEqual((g.phase, g.idle_count, g.idle_limit), ('turn_ready', 0, 2))
        self.assertEqual(g.board[0], 'U01')

    def test_C13_no_idle_penalty(self):
        g = idle_game()
        g.variant = 'C13'
        g.penalty_enabled = False
        for _ in range(7):
            play(g, 6)
        self.assertFalse(any(e['event'] == 'penalty' for e in g.logs))

    def test_invalid_active_atomic_and_not_activity(self):
        g = game()
        selected(g, 1)
        reject(self, g, lambda: g.active('G01', 'missing'))
        reject(self, g, lambda: g.active('U01'))
        g.owned['G01'].charges = 0
        reject(self, g, lambda: g.active('G01', 'U01'))

    def test_combined_bad_action_leaves_whole_turn_unchanged(self):
        g = game()
        g.begin_turn(forced=[1, 2, 3])
        reject(self, g, lambda: g.play(1, [('G01', 'U01'), ('G01', 'missing')]))

    def test_G_charge_only_on_living_arrival(self):
        for variant, expected in [('M14', 1), ('C14', 0)]:
            g = game(variant, pattern='fixed', attacks=[[3, 6]])
            g.owned['G01'].charges = 0
            play(g, 2)
            self.assertEqual((g.owned['G01'].charges, g.owned['Q01'].c), (expected, 6))
        g = game()
        g.owned['G01'].charges = 0
        play(g, 3)
        self.assertEqual(g.owned['G01'].charges, 0)
        g = game()
        g.owned['G01'].p = 0
        g.owned['G01'].charges = 0
        play(g, 2)
        self.assertEqual(g.owned['G01'].charges, 0)

    def test_C13_arrival_guard_still_has_no_charge(self):
        g = game('C13', pattern='fixed', attacks=[[3, 6]])
        g.owned['G01'].charges = 0
        play(g, 2, arrival_target='Q01')
        self.assertEqual((g.owned['G01'].charges, g.owned['Q01'].c), (0, 0))

    def test_G_current_arrival_charge_not_usable_same_turn(self):
        g = game()
        g.visitor['p'] = 1
        g.owned['G01'].charges = 0
        play(g, 1)
        reject(self, g, lambda: g.active('G01', 'U01'))
        selected(g, 1).active('G01', 'U01')
        self.assertEqual(g.owned['G01'].charges, 0)

    def test_G_spend_twice_charge_then_third_use(self):
        g = game(pattern='fixed', attacks=[[3, 6], [3, 6]])
        g.visitor['p'] = 1
        play(g, 1, [('G01', 'Q01'), ('G01', 'Q01')])
        self.assertEqual((g.owned['Q01'].c, g.owned['G01'].charges, g.g_uses), (0, 1, 2))
        play(g, 1, [('G01', 'Q01')])
        self.assertEqual((g.owned['Q01'].c, g.owned['G01'].charges, g.g_uses), (6, 0, 3))

    def test_G_charges_then_dies_cannot_use(self):
        g = game(pattern='fixed', attacks=[[2, 6]])
        g.owned['G01'].charges = 0
        g.owned['G01'].c, g.owned['G01'].p = 6, 1
        play(g, 2)
        self.assertEqual((g.owned['G01'].charges, g.owned['G01'].p), (1, 0))
        selected(g, 1)
        reject(self, g, lambda: g.active('G01', 'U01'))

    def test_G_given_shield_survives_G_destruction(self):
        g = game(pattern='fixed', attacks=[[2, 6], [3, 6]])
        g.owned['G01'].c, g.owned['G01'].p = 6, 1
        play(g, 4, [('G01', 'Q01')])
        self.assertEqual((g.owned['G01'].p, g.owned['Q01'].c), (0, 0))

    def test_defense_minimum_one_vs_two_uses(self):
        for c, expected in [(0, [(0, 0), (6, 1), (0, 1)]), (6, [(0, 0), (0, 0), (6, 1)])]:
            for uses in range(3):
                g = game(pattern='fixed', attacks=[[3, 6], [3, 6]])
                g.visitor['p'] = 3
                g.owned['Q01'].c, g.owned['Q01'].p = c, 1
                play(g, 1, [('G01', 'Q01')] * uses)
                self.assertEqual((g.owned['Q01'].c, g.owned['Q01'].p), expected[uses])

    def test_shield_expires_and_kill_is_not_absorbed_damage(self):
        g = game(T=6, pattern='fixed', attacks=[[3, 6]])
        play(g, 3, [('G01', 'Q01'), ('B01', None)])
        self.assertEqual(g.phase, 'visitor_end')
        self.assertFalse(any(e['event'] == 'hit' for e in g.logs))
        self.assertEqual(g.owned['Q01'].shield, 0)

    def test_guest_preserves_charges_P_and_service_use_count(self):
        g = game()
        play(g, 1, [('G01', 'Q01')])
        g.owned['Q01'].p, g.owned['Q01'].c = 1, 8
        g.idle_count, g.idle_limit = 1, 2
        g.start_guest(dict(key='next', T=16, H=2, pattern='none'))
        self.assertEqual((g.owned['G01'].charges, g.owned['Q01'].p, g.owned['Q01'].c, g.g_uses,
                          g.idle_count, g.idle_limit), (1, 1, 0, 1, 0, 3))

    def test_service_restores_exactly_two_and_dead_assets(self):
        for charges in range(3):
            g = game()
            g.phase = 'management'
            g.owned['G01'].charges = charges
            g.owned['Q01'].p = 0
            g.g_uses = 4
            g.escape_floor = 4
            g.cash = 2
            g.start_service()
            self.assertEqual((g.owned['G01'].charges, g.owned['Q01'].p, g.g_uses,
                              g.escape_floor, g.cash, g.visitor['key']), (2, 2, 0, None, 2, 'V3'))

    def test_escape_install_only_does_not_end_or_reset_inactivity(self):
        g = idle_game()
        g.visitor['p'] = 2
        g.idle_count = 2
        selected(g, 1).install_escape(4)
        self.assertEqual((g.phase, g.idle_count), ('active', 2))
        g.move()
        self.assertEqual(g.phase, 'turn_ready')
        self.assertTrue(any(e['event'] == 'penalty' for e in g.logs))

    def test_escape_arrival_and_pass_stop_at_contact(self):
        for value in (2, 3):
            g = game(pattern='double', T=12)
            g.visitor.update(p=2, A=3)
            g.idle_count = 2
            play(g, value, escape_floor=4)
            self.assertEqual((g.phase, g.visitor['p'], g.visitor['F'], g.visitor['A'], g.cash), ('service_end', 4, 0, 3, 0))
            self.assertFalse(any(e['event'] in ('hit', 'penalty', 'kill') for e in g.logs))
            self.assertFalse(any(e['event'] == 'visit' and e['floor'] == 5 for e in g.logs))

    def test_escape_at_current_position_waits_for_real_visit(self):
        g = game()
        g.visitor['p'] = 4
        selected(g, 1).install_escape(4)
        self.assertEqual(g.phase, 'active')
        g.move()
        self.assertEqual(g.phase, 'turn_ready')
        g = game()
        g.visitor['p'] = 4
        play(g, 6, escape_floor=4)
        self.assertEqual((g.phase, g.visitor['p']), ('service_end', 4))

    def test_escape_rejects_occupied_dead_full_and_duplicate(self):
        g = game()
        selected(g, 1)
        reject(self, g, lambda: g.install_escape(1))
        g.owned['U01'].p = 0
        reject(self, g, lambda: g.install_escape(1))
        g.board[3] = 'Q03'
        g.owned['Q03'] = Entity('Q03', 'Q')
        reject(self, g, lambda: g.install_escape(4))
        g.board[3] = None
        g.install_escape(4)
        reject(self, g, lambda: g.install_escape(4))

    def test_C13_has_no_escape(self):
        g = game('C13')
        selected(g, 1)
        reject(self, g, lambda: g.install_escape(4))

    def test_active_kill_before_escape_and_Q_before_escape(self):
        g = game(T=12, H=1)
        g.visitor['F'] = 6
        g.idle_count = 2
        selected(g, 4).install_escape(4)
        g.active('B01')
        self.assertEqual((g.phase, g.cash, g.visitor['p']), ('visitor_end', 2, 0))
        self.assertFalse(any(e['event'] == 'penalty' for e in g.logs))
        g = game(T=12, H=1)
        g.visitor.update(p=2, A=3)
        play(g, 1, escape_floor=4)
        self.assertEqual((g.phase, g.cash, g.visitor['p']), ('visitor_end', 2, 3))

    def test_escape_preserves_prior_spend_no_reward_no_immediate_reset(self):
        g = game()
        g.owned['U01'].c, g.owned['U01'].p = 9, 1
        g.visitor['p'] = 2
        play(g, 2, [('G01', 'U01'), ('B01', None)], escape_floor=4)
        self.assertEqual((g.phase, g.owned['U01'].c, g.owned['U01'].p, g.owned['G01'].charges,
                          g.owned['B01'].charges, g.cash, g.visitor['F']), ('service_end', 9, 1, 1, 1, 0, 6))
        g.advance()
        self.assertEqual((g.phase, g.owned['U01'].p), ('management', 1))
        g.start_service()
        self.assertEqual((g.visitor['key'], g.owned['U01'].p), ('V3', 2))

    def test_escape_second_guest_skips_to_B_and_final_escape_no_reset(self):
        g = Game.new(14001, 'M14')
        g.start_service()
        g.visitor['H'] = 0
        g.phase = 'visitor_end'
        g.advance()
        self.assertEqual(g.visitor['key'], 'V2')
        play(g, 4, escape_floor=4)
        g.advance()
        g.start_service()
        g.owned['U01'].p = 1
        play(g, 4, escape_floor=4)
        g.advance()
        self.assertEqual((g.phase, g.owned['U01'].p, g.cash), ('complete', 1, 0))

    def test_twentyfourth_turn_is_observation_stop_not_failure(self):
        for kill in (False, True):
            g = game(T=6 if kill else 99)
            g.visitor['turn'] = 23
            play(g, 1, [('B01', None)] if kill else [])
            self.assertEqual(g.phase, 'visitor_end' if kill else 'observed_stop')

    def test_dice_paired_across_variants_and_unaffected_by_penalty_calls(self):
        rolled = []
        for variant in ('C13', 'M14', 'C14'):
            g = Game.new(14001, variant)
            g.start_service()
            g.record_intent([], 'no preference')
            rolled.append(g.begin_turn())
        self.assertEqual(rolled, [rolled[0]] * 3)
        left, right = idle_game(), idle_game()
        left.idle_count = 2
        play(left, 6)
        play(right, 6)
        for g in (left, right):
            g.record_intent([], 'next public roll')
        self.assertEqual(left.begin_turn(), right.begin_turn())

    def test_preview_hides_penalty_draw_and_does_not_mutate(self):
        g = idle_game()
        g.idle_count = 2
        before, logs = g.state(), deepcopy(g.logs)
        out = g.preview(6, hypothetical=True)
        self.assertEqual(g.state(), before)
        self.assertEqual(g.logs, logs)
        self.assertFalse(any(e['event'] == 'penalty' for e in out.logs))
        self.assertTrue(any(e['event'] == 'penalty_preview' for e in out.logs))

    def test_save_roundtrip_including_escape_and_count(self):
        g = idle_game()
        g.idle_count, g.idle_limit, g.escape_floor, g.g_uses = 1, 2, 4, 3
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            p = Path(tmp)/'state.json'
            g.save(p)
            other = Game.load(p)
        self.assertEqual(g.state(), other.state())

    def test_invalid_unicode_does_not_truncate_save(self):
        g = game()
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            p = Path(tmp)/'state.json'
            g.save(p)
            original = p.read_bytes()
            g.emit('note', text='\udcff')
            with self.assertRaises(UnicodeEncodeError):
                g.save(p)
            self.assertEqual(p.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
