"""Replay and summarize completed config-13 manual campaigns without editing them."""
from __future__ import annotations
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import hashlib
import json

from engine import Game, RNG_VERSION

ROOT = Path(__file__).resolve().parent
RUNS = ROOT/'runs'
EXPECTED = [(seed, variant) for seed in (13001,13002,13003) for variant in ('M0','MUG')]


def canonical(value):
    return json.loads(json.dumps(value, ensure_ascii=False))


def require_equal(actual, expected, label):
    if canonical(actual) != canonical(expected):
        raise AssertionError(label)


def role_at(state, floor):
    owner = state['board'][floor-1]
    if owner is None:
        return 'empty'
    if state['owned'][owner]['p'] <= 0:
        return 'P0:' + owner
    return state['owned'][owner]['kind']


def destination(state, distance):
    return 1 + ((state['visitor']['p'] + distance - 1) % 6)


def intent_category(roles):
    if not roles:
        return 'none'
    if len(roles) == 1:
        return roles[0]
    return 'tie:' + '|'.join(roles)


def show_actions(actions):
    return ', '.join(owner + ('→'+target if target else '') for owner,target in actions) or '-'


def exposure_notes(seed, variant):
    notes = {
        (13002,'M0'): 'Parent reports this actor did not read diagnostic tables before play; original metadata wording is not precise evidence of exposure.',
        (13003,'MUG'): 'Parent reports this actor did not read diagnostic tables before play; original metadata wording is not precise evidence of exposure.',
        (13003,'M0'): 'Parent reports this actor had read diagnostic tables before play.',
        (13002,'MUG'): 'Root played with knowledge of diagnostic tables.',
    }
    return notes.get((seed,variant),'Use original metadata; no additional claim about diagnostic-table exposure.')


def replay(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if data['phase'] not in ('complete','failed'):
        return None
    g = Game.new(data['seed'], data['variant'], data['stream'])
    initial = next(e for e in data['logs'] if e['event']=='initial')
    require_equal(g.state(),initial['state'],path.name+':initial')
    g.start_service()
    stage = 'intent'
    frames = []
    current = {}
    for e in data['logs']:
        kind=e['event']
        if kind == 'intent':
            assert stage == 'intent', (path.name,stage,kind)
            g.record_intent(e['values'],e['reason'],e.get('actions',()),e.get('arrival_target'))
            require_equal(g.state(),e['state'],path.name+':intent')
            current = dict(intent=deepcopy(e), events=[])
            stage='roll'
        elif kind == 'turn_start':
            assert stage == 'roll', (path.name,stage,kind)
            assert not e.get('forced'), path.name+':forced normal roll'
            dice=g.begin_turn()
            require_equal(g.state(),e['state'],path.name+':turn_start')
            current['before']=deepcopy(e['state'])
            current['dice']=dice
            stage='decision'
        elif kind == 'manual_decision':
            assert stage == 'decision', (path.name,stage,kind)
            require_equal(g.state(),e['before'],path.name+':decision_before')
            current['decision']=deepcopy(e)
            current['without_arrival_guard']=None
            if g.needs_arrival_target(e['value']):
                off=g.clone()
                off.variant='MU' if g.variant=='MUG' else 'M0'
                off.play(e['value'],e.get('actions',()),arrival_target=None)
                current['without_arrival_guard']=off.state()
            replay_event_start=len(g.logs)
            g.play(e['value'],e.get('actions',()),e.get('arrival_target'))
            current['replayed_events']=deepcopy(g.logs[replay_event_start:])
            stage='end'
        elif kind == 'turn_end':
            assert stage == 'end', (path.name,stage,kind)
            require_equal(g.state(),e['state'],path.name+':turn_end')
            require_equal(current['replayed_events'],current['events']+[e],path.name+':complete_turn_event_trace')
            current['after']=deepcopy(e['state'])
            current['end']=deepcopy(e)
            frames.append(current)
            current={}
            while g.phase in ('visitor_end','management'):
                if g.phase == 'visitor_end':
                    g.advance()
                else:
                    g.start_service()
            stage='intent'
        elif stage == 'end':
            current['events'].append(deepcopy(e))
    assert stage == 'intent', (path.name,stage)
    require_equal(g.state(),Game.load(path).state(),path.name+':final')
    assert not data['controlled'], path.name+':controlled normal campaign'
    assert len(frames)==sum(e['event']=='intent' for e in data['logs'])
    assert len(frames)==sum(e['event']=='manual_decision' for e in data['logs'])
    turns=[]
    guards=[]
    for frame in frames:
        b,a,i,d=frame['before'],frame['after'],frame['intent'],frame['decision']
        available=[dict(value=value,floor=destination(b,value),role=role_at(b,destination(b,value)))
                   for value in sorted(set(frame['dice']))]
        live_roles=sorted({x['role'] for x in available if x['role'] in ('U','Q','G','B')})
        core_roles=sorted(set(live_roles)&{'U','Q','G'})
        desired_roles=sorted({role_at(i['state'],floor) for floor in i['floors']})
        floor=destination(b,d['value'])
        selected_role=role_at(b,floor)
        arrival=next((e for e in frame['events'] if e['event']=='visit' and e['mode']=='arrival'),None)
        actual_role=role_at(b,arrival['floor']) if arrival else 'skipped_active_kill'
        actual_actions=[(e['owner'],e.get('target')) for e in frame['events'] if e['event']=='active']
        hits=[e for e in frame['events'] if e['event']=='hit']
        turn=dict(guest=b['visitor']['key'],turn=b['visitor']['turn'],
                  before=deepcopy(b),after=deepcopy(a),
                  desired_values=i['values'],desired_floors=i['floors'],desired_roles=desired_roles,
                  desired_category=intent_category(desired_roles),floor_tie=len(i['values'])>1,
                  intent_reason=i['reason'],planned_actions=i.get('actions',()),
                  dice=frame['dice'],available=available,available_live_roles=live_roles,
                  multiple_live_roles=len(live_roles)>=2,multiple_core_roles=len(core_roles)>=2,
                  desired_exact_available=any(value in frame['dice'] for value in i['values']) if i['values'] else None,
                  desired_role_available=bool(set(desired_roles)&set(live_roles)) if desired_roles else None,
                  value=d['value'],selected_floor=floor,selected_role=selected_role,
                  actual_floor=arrival['floor'] if arrival else None,actual_role=actual_role,
                  chose_desired_exact=d['value'] in i['values'] if i['values'] else None,
                  chose_desired_role=selected_role in desired_roles if desired_roles else None,
                  decision_reason=d['reason'],requested_actions=d.get('actions',()),
                  actual_actions=actual_actions,arrival_target=d.get('arrival_target'),
                  actual_arrival_guard=sum(e.get('arrival_blocked',0) for e in hits),
                  actual_active_guard=sum(e.get('active_blocked',0) for e in hits),
                  breaks=sum(bool(e.get('broken')) for e in hits),
                  destroyed=sum(bool(e.get('destroyed')) for e in hits),
                  visits=[e for e in frame['events'] if e['event']=='visit'],
                  hits=hits, fear=[e for e in frame['events'] if e['event']=='fear'],
                  outcome=frame['end']['outcome'])
        turns.append(turn)
        if actual_role=='G' and frame['without_arrival_guard'] is not None:
            off=frame['without_arrival_guard']
            guard=dict(guest=turn['guest'],turn=turn['turn'],value=d['value'],dice=frame['dice'],
                       target=d.get('arrival_target'),actual_arrival_absorbed=turn['actual_arrival_guard'],
                       prevented_P_loss={owner:a['owned'][owner]['p']-off['owned'][owner]['p']
                                         for owner in a['owned'] if a['owned'][owner]['p']!=off['owned'][owner]['p']},
                       actual_asset_CP={owner:[e['c'],e['p']] for owner,e in a['owned'].items()},
                       no_arrival_asset_CP={owner:[e['c'],e['p']] for owner,e in off['owned'].items()},
                       desired_G='G' in desired_roles,desired_only_G=desired_roles==['G'],
                       forced_by_unique_die=len(set(frame['dice']))==1,
                       other_live_roles=[r for r in live_roles if r!='G'],
                       planned_G_active_before_roll=sum(x[0]=='G01' for x in i.get('actions',())),
                       actual_G_active=sum(x[0]=='G01' for x in actual_actions),
                       before_G_charges=b['owned']['G01']['charges'],
                       intent_reason=i['reason'],decision_reason=d['reason'],
                       counterfactual='Same pre-choice state, selected movement and active actions; MUG→MU or MG→M0, no arrival target. Only current turn.')
            guards.append(guard)
    return dict(file=path.name,source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                seed=data['seed'],variant=data['variant'],phase=data['phase'],
                original_metadata=[e for e in data['logs'] if e['event']=='run_metadata'],
                additional_exposure_note=exposure_notes(data['seed'],data['variant']),
                execution_time_code_hashes=data.get('hashes'),
                execution_hash_note='Original normal JSON does not store execution-time hashes.' if not data.get('hashes') else 'Copied from original artifact.',
                replay=dict(current_engine_states_match=True,intent_before_roll_order=True,
                            genuine_keyed_dice_match=True,complete_turn_event_traces_match=True,normal_forced_rolls=0),
                final_state=deepcopy(g.state()),turns=turns,arrival_guard_cases=guards)


def summarize_runs(runs):
    rows=[]
    for run in runs:
        turns=run['turns']
        opportunities=[t for t in turns if t['multiple_live_roles']]
        core=[t for t in turns if t['multiple_core_roles']]
        rows.append(dict(file=run['file'],seed=run['seed'],variant=run['variant'],phase=run['phase'],
                         turns=len(turns),visitor_turns=dict(Counter(t['guest'] for t in turns)),
                         kills=sum(t['outcome']=='kill' for t in turns),
                         breaks=sum(t['breaks'] for t in turns),destroyed=sum(t['destroyed'] for t in turns),
                         intent_roles=dict(Counter(t['desired_category'] for t in turns)),
                         intent_floor_ties=sum(t['floor_tie'] for t in turns),
                         actual_arrival_roles=dict(Counter(t['actual_role'] for t in turns)),
                         actual_active_counts=dict(Counter(owner for t in turns for owner,target in t['actual_actions'])),
                         actual_arrival_absorbed=sum(t['actual_arrival_guard'] for t in turns),
                         live_role_opportunities=len(opportunities),core_role_opportunities=len(core),
                         opportunity_intent_exact_available=sum(t['desired_exact_available'] is True for t in opportunities),
                         opportunity_intent_role_available=sum(t['desired_role_available'] is True for t in opportunities),
                         opportunity_selected_roles=dict(Counter(t['selected_role'] for t in opportunities)),
                         opportunity_actual_arrival_roles=dict(Counter(t['actual_role'] for t in opportunities)),
                         core_opportunity_selected_roles=dict(Counter(t['selected_role'] for t in core)),
                         cash=run['final_state']['cash']))
    return rows


def paired_dice_checks(runs):
    group={(r['seed'],r['variant']):r for r in runs}
    result=[]
    for seed in (13001,13002,13003):
        if (seed,'M0') not in group or (seed,'MUG') not in group:
            continue
        a={(t['guest'],t['turn']):t['dice'] for t in group[seed,'M0']['turns']}
        b={(t['guest'],t['turn']):t['dice'] for t in group[seed,'MUG']['turns']}
        common=sorted(set(a)&set(b))
        for key in common:
            require_equal(a[key],b[key],f'paired seed {seed} {key}')
        result.append(dict(seed=seed,matching_common_guest_turns=len(common),passed=True))
    return result


def cell(value):
    return str(value).replace('|','\\|').replace('\r','').replace('\n','<br>')


def make_markdown(runs,summary,complete):
    lines=['# Config 13 정상 수동 AI 진행 기록','',
           '각 원본은 수정하지 않고 현재 엔진으로 기록된 행동을 재생했다. 모든 intent→공개 눈→manual_decision→턴 종료 상태와 최종 상태를 검사한다. 분석 문장이 아닌 원본 선택 이유를 그대로 싣는다.','',
           '모든 예정 캠페인 완료: '+('예' if complete else '아니오 — 아래는 완료된 파일만 집계')+'.',
           '', '| seed·군 | 턴 | 처치 | 파훼/파괴 | 희망 역할(동률 별도) | 실제 도착(이동 생략 별도) |',
           '|---|---:|---:|---|---|---|']
    for s in summary:
        lines.append('| '+ ' | '.join(map(cell,[f"{s['seed']} {s['variant']}",s['turns'],s['kills'],f"{s['breaks']}/{s['destroyed']}",s['intent_roles'],s['actual_arrival_roles']]))+' |')
    lines += ['', '희망 역할은 같은 역할의 두 Q 동률을 Q로 집계하되 서로 다른 역할의 동률은 별도 항목으로 남긴다. 가용 역할은 현재 눈으로 도달 가능한 살아 있는 U/Q/G/B의 종류다. M0의 G도 위치 역할로 포함되며 도착 방어가 있다는 뜻은 아니다. 빈층·P0층은 별도 표기한다.','']
    for run in runs:
        lines += [f"## {run['seed']} · {run['variant']}",'',
                  '| 손님·턴 | 희망 층/역할 | 공개 눈 → 선택 | 실제 도착 | 실제 액티브 | 도착 방어 대상/흡수 | 종료 F/H/A |',
                  '|---|---|---|---|---|---|---|']
        for t in run['turns']:
            v=t['after']['visitor']
            row=[f"{t['guest']}·{t['turn']}",f"{t['desired_floors']} / {t['desired_category']}",
                 f"{t['dice']} → {t['value']}",f"{t['actual_floor']} / {t['actual_role']}",
                 show_actions(t['actual_actions']),f"{t['arrival_target'] or '-'} / {t['actual_arrival_guard']}",
                 f"{v['F']}/{v['H']}/{v['A']}"]
            lines.append('| '+' | '.join(map(cell,row))+' |')
        lines += ['', '### 원본 이유','']
        for t in run['turns']:
            lines += [f"**{t['guest']}·{t['turn']} 눈 공개 전:** {t['intent_reason']}",'',
                      f"**공개 후 선택:** {t['decision_reason']}",'']
        lines += ['### G 도착의 같은 경로 비교','']
        if not run['arrival_guard_cases']:
            lines += ['도착 방어가 발동한 G 도착 없음.','']
        for x in run['arrival_guard_cases']:
            lines += [f"- {x['guest']}·{x['turn']}: 대상 {x['target']}, 실제 도착 흡수 {x['actual_arrival_absorbed']}, 방지한 P 손실 {x['prevented_P_loss']}, 희망 G {x['desired_G']}, 단일 눈 강제 {x['forced_by_unique_die']}. 같은 상태·액티브·경로에서 도착 방어만 끈 비교다."]
        lines.append('')
    return '\n'.join(lines)


def main():
    runs=[]
    pending=[]
    for seed,variant in EXPECTED:
        path=RUNS/f'normal_{seed}_{variant}.json'
        if not path.exists():
            pending.append(dict(file=path.name,phase='missing'))
            continue
        run=replay(path)
        if run is None:
            data=json.loads(path.read_text(encoding='utf-8'))
            pending.append(dict(file=path.name,phase=data['phase']))
        else:
            runs.append(run)
    summary=summarize_runs(runs)
    paired=paired_dice_checks(runs)
    hashfiles=[ROOT/'engine.py',ROOT/'manual.py',ROOT/'cli.py',ROOT/'planner.py',ROOT/'audit.py',ROOT/'diagnostics.py',ROOT/'test_engine.py',
               ROOT.parent/'rules.md',ROOT.parent/'undecided.md',ROOT.parent/'mvps'/'mvp-config-13.md']
    payload=dict(mode='completed_normal_manual_AI_audit',rng_version=RNG_VERSION,
                 all_six_complete=not pending,pending=pending,
                 current_audit_code_hashes={str(p.relative_to(ROOT.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in hashfiles if p.exists()},
                 hash_scope='Hashes measured at audit time. Do not substitute them for missing original execution-time hashes.',
                 summaries=summary,paired_dice=paired,runs=runs)
    (RUNS/'normal_summary.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    (RUNS/'normal_turns.md').write_text(make_markdown(runs,summary,not pending),encoding='utf-8')
    print(json.dumps(dict(all_six_complete=not pending,pending=pending,summaries=summary,paired_dice=paired),ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
