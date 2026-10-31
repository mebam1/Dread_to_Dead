"""Independent expected-value checks for config 13; not balance tests."""
import hashlib
import random
import tempfile
import unittest
from pathlib import Path

from engine import Game
from diagnostics import make_case, table_checks, active_comparisons, opportunity_checks


def game(variant='MUG', **spec):
    g = Game.new(seed=13001, variant=variant)
    g.start_service()
    visitor = dict(key='check', name='check', T=99, H=1,
                   pattern='none', power=6, reward=2)
    visitor.update(spec)
    g.start_guest(visitor)
    return g


def forced(g, distance):
    g.begin_turn(forced=[distance] * 3)
    g.choose(distance)
    return g


def reject(test, g, fn):
    before = g.state()
    with test.assertRaises((ValueError, TypeError)):
        fn()
    test.assertEqual(g.state(), before)


class SpecificationChecks(unittest.TestCase):
    def test_fixed_start_and_no_purchase_phase_variance(self):
        for variant in ('M0', 'MU', 'MG', 'MUG'):
            g = Game.new(13001, variant)
            self.assertEqual(g.board, ['U01', 'G01', 'Q01', None, 'Q02', 'B01'])
            self.assertEqual(g.cash, 0)
            self.assertEqual({i:e.p for i,e in g.owned.items()}, dict(U01=2,G01=2,Q01=2,Q02=2,B01=1))

    def test_U_arrival_excludes_pass_in_each_variant(self):
        for variant, a in [('M0',1),('MU',4),('MG',1),('MUG',4)]:
            g = game(variant)
            forced(g,1).move()
            self.assertEqual(g.visitor['A'], a)

    def test_U_pass_unchanged_and_Q_arrival_consumes(self):
        for variant in ('M0', 'MU', 'MG', 'MUG'):
            g = game(variant)
            forced(g,3).move()
            self.assertEqual((g.visitor['A'],g.visitor['F']), (0,8))

    def test_wrap_U_arrival_only_and_cap(self):
        g = game()
        g.visitor.update(p=4,A=8)
        forced(g,3).move()
        self.assertEqual((g.visitor['p'],g.visitor['A']), (1,9))

    def test_G_pass_has_no_arrival_shield(self):
        g = game(pattern='fixed', attacks=[[3,6]])
        forced(g,3).move()
        self.assertEqual(g.owned['Q01'].c,6)

    def test_G_arrival_works_with_zero_charges(self):
        g = game(pattern='fixed', attacks=[[3,6]])
        g.owned['G01'].charges=0
        forced(g,2).move(arrival_target='Q01')
        self.assertEqual((g.owned['Q01'].c,g.owned['G01'].charges),(0,0))

    def test_G_active_and_arrival_stack_with_distinct_cost(self):
        g=game(pattern='fixed',attacks=[[3,6],[3,6]])
        forced(g,2)
        g.active('G01','Q01')
        g.move(arrival_target='Q01')
        self.assertEqual((g.owned['Q01'].c,g.owned['Q01'].p,g.owned['G01'].charges),(0,2,1))
        hits=[e for e in g.logs if e['event']=='hit']
        self.assertEqual(sum(e['blocked'] for e in hits),12)
        self.assertEqual(sum(e['active_blocked'] for e in hits),6)
        self.assertEqual(sum(e['arrival_blocked'] for e in hits),6)

    def test_G_arrival_only_absorbs_one_of_two_hits(self):
        g=game(pattern='fixed',attacks=[[3,6],[3,6]])
        forced(g,2).move(arrival_target='Q01')
        self.assertEqual((g.owned['Q01'].c,g.owned['Q01'].p,g.owned['G01'].charges),(6,2,2))

    def test_G_arrival_self_target(self):
        g=game(pattern='double')
        forced(g,2).move(arrival_target='G01')
        self.assertEqual((g.owned['G01'].c,g.owned['G01'].p),(6,2))

    def test_arrival_target_missing_invalid_dead_reject_without_state_change(self):
        g=game()
        forced(g,2)
        reject(self,g,lambda:g.move())
        reject(self,g,lambda:g.move(arrival_target='missing'))
        g.owned['Q01'].p=0
        reject(self,g,lambda:g.move(arrival_target='Q01'))
        self.assertEqual(g.phase,'active')
        g.move(arrival_target='U01')

    def test_P0_G_has_no_arrival_or_active(self):
        g=game(pattern='fixed',attacks=[[3,6]])
        g.owned['G01'].p=0
        forced(g,2)
        reject(self,g,lambda:g.active('G01','Q01'))
        g.move()
        self.assertEqual(g.owned['Q01'].c,6)

    def test_granted_arrival_shield_outlives_G(self):
        g=game(pattern='fixed',attacks=[[2,6],[3,6]])
        g.owned['G01'].c,g.owned['G01'].p=6,1
        forced(g,2).move(arrival_target='Q01')
        self.assertEqual(g.owned['G01'].p,0)
        self.assertEqual((g.owned['Q01'].c,g.owned['Q01'].p),(0,2))

    def test_unused_shield_expires_and_is_not_next_turn_credit(self):
        g=game(pattern='fixed',attacks=[[3,3]])
        forced(g,2).move(arrival_target='Q01')
        self.assertEqual(g.owned['Q01'].shield,0)
        forced(g,1).move()
        self.assertEqual(g.owned['Q01'].c,3)

    def test_active_kill_skips_arrival_target_move_attack_and_extra_spend(self):
        g=game(T=12,H=1,pattern='double')
        g.visitor['F']=6
        g.owned['B01'].charges=1
        g.begin_turn(forced=[2,2,2])
        g.play(2,[('B01',None),('G01','Q01')])
        self.assertEqual((g.phase,g.visitor['p'],g.cash,g.owned['B01'].charges,g.owned['G01'].charges),('visitor_end',0,2,0,2))
        self.assertFalse(any(e['event'] in ('visit','hit') for e in g.logs))
        reject(self,g,lambda:g.active('B01'))

    def test_arrival_kill_cancels_all_attacks(self):
        g=make_case('D4')
        g.play(3)
        self.assertEqual((g.owned['U01'].c,g.owned['U01'].p,g.owned['Q01'].c),(6,1,0))
        self.assertFalse(any(e['event']=='hit' for e in g.logs))

    def test_one_fear_effect_removes_at_most_one_heart(self):
        g=game(T=6,H=3)
        g.visitor['A']=3
        forced(g,3).move()
        self.assertEqual((g.visitor['H'],g.visitor['F'],g.visitor['A'],g.cash),(2,0,2,0))

    def test_separate_bell_activations_remove_separate_hearts(self):
        g=game(T=6,H=2)
        forced(g,1)
        g.active('B01')
        self.assertEqual((g.visitor['H'],g.cash),(1,0))
        g.active('B01')
        self.assertEqual((g.visitor['H'],g.cash,g.owned['B01'].charges),(0,2,0))

    def test_separate_hits_discard_overflow_then_destroyed_target_misses(self):
        g=game(pattern='fixed',attacks=[[3,6],[3,6],[3,20],[3,6]])
        g.owned['Q01'].c=10
        forced(g,4).move()
        self.assertEqual((g.owned['Q01'].c,g.owned['Q01'].p),(0,0))
        self.assertEqual(g.owned['Q02'].p,2)

    def test_dead_U_and_Q_have_no_supply_or_harvest(self):
        g=game()
        g.owned['U01'].p=0
        forced(g,3).move()
        self.assertEqual((g.visitor['A'],g.visitor['F']),(0,0))
        g=game()
        g.owned['Q01'].p=0
        forced(g,3).move()
        self.assertEqual((g.visitor['A'],g.visitor['F']),(2,0))

    def test_intent_required_before_normal_roll_and_frozen_after_roll(self):
        g=game()
        reject(self,g,lambda:g.begin_turn())
        g.record_intent([1,3],'prepare or harvest')
        reject(self,g,lambda:g.record_intent([2],'changed'))
        g.begin_turn()
        reject(self,g,lambda:g.record_intent([2],'peeked'))
        reject(self,g,lambda:g.begin_turn())

    def test_hypothetical_preview_does_not_roll_or_mutate(self):
        g=game()
        before=g.state()
        nlogs=len(g.logs)
        after=g.preview(1,hypothetical=True)
        self.assertEqual((after.visitor['A'],after.visitor['turn']),(4,1))
        self.assertEqual(g.state(),before)
        self.assertEqual(len(g.logs),nlogs)

    def test_public_preview_only_and_does_not_mutate(self):
        g=game()
        g.begin_turn(forced=[1,2,3])
        before=g.state()
        g.preview(3)
        self.assertEqual(g.state(),before)
        reject(self,g,lambda:g.preview(6))
        reject(self,g,lambda:g.choose(6))
        g.choose(3)
        reject(self,g,lambda:g.choose(1))

    def test_invalid_active_rejected_before_spending(self):
        g=game()
        forced(g,1)
        reject(self,g,lambda:g.active('G01','missing'))
        reject(self,g,lambda:g.active('U01'))
        g.owned['G01'].charges=0
        reject(self,g,lambda:g.active('G01','U01'))

    def test_roll_is_paired_by_seed_stream_guest_turn_not_variant(self):
        rolled=[]
        for variant in ('M0','MU','MG','MUG'):
            g=Game.new(seed=13001,variant=variant,stream='normal')
            g.start_service()
            g.record_intent([],'no preference')
            rolled.append(g.begin_turn())
        rng=random.Random(int.from_bytes(hashlib.sha256(b'13001:normal:V1:1').digest(),'big'))
        want=[rng.randint(1,6) for _ in range(3)]
        self.assertEqual(rolled,[want]*4)

    def test_guest_reset_preserves_P_and_charges(self):
        g=game()
        g.owned['U01'].c,g.owned['U01'].p=10,1
        g.owned['G01'].p=0
        g.owned['B01'].charges,g.owned['G01'].charges=0,1
        g.cash=2
        g.visitor.update(F=8,A=4,p=3)
        g.start_guest(dict(key='next',T=12,H=2,pattern='double',power=6,reward=2))
        self.assertEqual((g.visitor['F'],g.visitor['A'],g.visitor['p']),(0,0,0))
        self.assertEqual((g.owned['U01'].c,g.owned['U01'].p,g.owned['G01'].p,g.owned['B01'].charges,g.owned['G01'].charges,g.cash),(0,1,0,0,1,2))

    def test_service_reset_restores_P0_and_charges(self):
        g=Game.new()
        g.owned['G01'].p=0
        g.owned['U01'].c=10
        g.owned['B01'].charges=g.owned['G01'].charges=0
        g.cash=2
        g.start_service()
        self.assertEqual((g.owned['G01'].p,g.owned['U01'].c,g.owned['B01'].charges,g.owned['G01'].charges,g.cash),(2,0,2,2,2))

    def test_eighth_turn_kill_succeeds_and_nonkill_stops(self):
        for kill in (False,True):
            g=game(T=6 if kill else 99)
            g.visitor['turn']=7
            forced(g,1)
            if kill:g.active('B01')
            else:g.move()
            self.assertEqual(g.phase,'visitor_end' if kill else 'failed')
            if not kill:
                reject(self,g,lambda:g.advance())
                reject(self,g,lambda:g.start_service())

    def test_lifecycle_keeps_final_damage_without_extra_reset(self):
        g=Game.new()
        g.start_service()
        for n in range(4):
            self.assertEqual(g.visitor['key'],f'V{n+1}')
            g.visitor.update(T=6,H=1)
            g.owned['B01'].charges=2
            forced(g,1).active('B01')
            g.owned['U01'].c,g.owned['U01'].p=10,1
            g.advance()
            if n in (0,2):
                self.assertEqual((g.owned['U01'].c,g.owned['U01'].p),(0,1))
            elif n==1:
                self.assertEqual(g.phase,'management')
                self.assertEqual((g.owned['U01'].c,g.owned['U01'].p),(10,1))
                g.start_service()
                self.assertEqual((g.owned['U01'].c,g.owned['U01'].p),(0,2))
            else:
                self.assertEqual((g.phase,g.owned['U01'].c,g.owned['U01'].p),('complete',10,1))
        self.assertEqual(g.cash,8)

    def test_save_load_preserves_intent_dice_damage_variant_stream(self):
        g=game('MG')
        g.owned['U01'].c=10
        g.record_intent([2],'protect U',arrival_target='U01')
        g.begin_turn()
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            self.assertTrue(Path(tmp).resolve().is_relative_to(Path(__file__).resolve().parent))
            p=Path(tmp)/'state.json'
            g.save(p)
            other=Game.load(p)
        self.assertEqual(g.state(),other.state())
        self.assertEqual((g.variant,g.stream),(other.variant,other.stream))

    def test_D1_D4_all_48_fixed_branches(self):
        self.assertEqual(len(table_checks()),48)

    def test_invalid_text_does_not_truncate_existing_save(self):
        g=game()
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            p=Path(tmp)/'state.json'
            g.save(p)
            original=p.read_bytes()
            g.emit('note', text='\udcff')
            with self.assertRaises(UnicodeEncodeError):
                g.save(p)
            self.assertEqual(p.read_bytes(),original)
            new_path=Path(tmp)/'not_created.json'
            with self.assertRaises(UnicodeEncodeError):
                g.save(new_path)
            self.assertFalse(new_path.exists())

    def test_D5_seven_arrival_active_comparisons(self):
        self.assertEqual(len(active_comparisons()),7)

    def test_D1_all_216_next_rolls_without_actual_future_lookup(self):
        self.assertEqual([r['winning_next_rolls'] for r in opportunity_checks()],[152,91,0])


if __name__ == '__main__':
    unittest.main()
