"""Config 12 controlled comparisons. Never count these as normal campaign samples."""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
from engine import Game, Entity
from policy import choose_turn

SEED = 20261031
ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"
RESULTS = []
CHECKS = []


def spec(key, T=99, H=1, pattern="double", power=6):
    return dict(key=key, name=key, T=T, H=H, pattern=pattern, power=power, reward=2)


def snap(g):
    return dict(phase=g.phase, visitor=copy.deepcopy(g.visitor), cash=g.cash,
                grant=g.grant, earned=g.earned, spent=g.spent, dice=list(g.dice),
                purchased=sorted(g.purchased), board=list(g.board),
                assets={k:dict(kind=v.kind, C=v.c, P=v.p, maxP=v.maxp,
                               charges=v.charges, shield=v.shield)
                        for k,v in g.owned.items()})


def equal(label, value, expected):
    assert value == expected, (label, value, expected)
    CHECKS.append(dict(label=label, actual=value, expected=expected))


def frame(g, r, actions, reason, rows):
    before=snap(g)
    offset=len(g.logs)
    g.play(r, actions)
    rows.append(dict(before=before, dice=list(before.get("dice", getattr(g, "dice", []))),
                     selected=r, actions=actions, reason=reason, after=snap(g),
                     events=copy.deepcopy(g.logs[offset:])))


def fixed(g, dice, r, actions, reason, rows):
    g.begin_turn(forced=dice)
    frame(g,r,actions,reason,rows)


def finish(g, rows, next_visitor=True):
    while g.phase in ("turn_ready", "choice"):
        if g.phase == "turn_ready":
            g.begin_turn()
        r,actions,reason=choose_turn(g,next_visitor=next_visitor)
        frame(g,r,actions,reason,rows)
    return snap(g)


def result(name, g, rows, checkpoints=None, note=""):
    events=g.logs
    metrics=dict(turns=len(rows), kills=sum(e["event"]=="kill" for e in events),
                 breaks=sum(e.get("broken",False) for e in events if e["event"]=="hit"),
                 destroyed=sum(e.get("destroyed",False) for e in events if e["event"]=="hit"),
                 absorbed=sum(e.get("blocked",0) for e in events if e["event"]=="hit"),
                 active={k:sum(e["event"]=="active" and e.get("kind")==k for e in events)
                         for k in ("B","G","R")})
    item=dict(name=name, mode="controlled", seed=SEED, final=snap(g), metrics=metrics,
              turns=rows, checkpoints=checkpoints or {}, note=note,
              events=copy.deepcopy(g.logs))
    RESULTS.append(item)
    return item


def d1():
    for r in (1,3):
        g=Game.diagnostic(["U01",None,"Q01",None,None,None],
                          spec("D1",pattern="none"),seed=SEED)
        rows=[]
        fixed(g,[1,3,6],r,[],"도착 전용 효과와 통과 공급의 비교",rows)
        equal(f"D1-r{r}",(g.visitor["A"],g.visitor["F"]),(1,0) if r==1 else (0,8))
        result(f"D1-r{r}",g,rows,note="이동 효과 단위 진단. 공격·영업 후속 없음.")
    g=Game.diagnostic(["U01",None,None,None,None,None],
                      spec("D1-wrap",pattern="none"),seed=SEED)
    g.visitor["p"]=4
    rows=[]
    fixed(g,[3,3,3],3,[],"6층에서 1층으로 순환하며 1층은 도착만",rows)
    equal("D1-wrap",(g.visitor["p"],g.visitor["A"]),(1,1))
    result("D1-wrap",g,rows)


def d2():
    boundary=[]
    for count in (0,1,2):
        g=Game.diagnostic(["U01","E01","Q01","G01","Q02","B01"],
                          spec("D2-current",T=16),seed=SEED)
        g.purchased={"G01","E01"}
        g.owned["Q01"].c=6
        g.owned["Q01"].p=1
        g.owned["B01"].charges=0
        rows=[]
        fixed(g,[3,3,3],3,[("G01","Q01")]*count,
              f"현재 Q01 보호에 G {count}회 배분",rows)
        equal(f"D2-G{count}-current-Q",
              (g.owned["Q01"].c,g.owned["Q01"].p),
              (6,1) if count==2 else (0,0))
        first=snap(g)
        fixed(g,[2,2,2],2,[],"잔여 A1을 Q02에서 수확해 처치",rows)
        equal(f"D2-G{count}-kill",g.visitor["H"],0)
        after_first=snap(g)
        # Counterfactual service boundary is separate from this same-service run.
        at_boundary=copy.deepcopy(g)
        at_boundary.phase="management"
        at_boundary.service=0
        at_boundary.start_service()
        boundary.append(snap(at_boundary))
        g.start_guest(spec("D2-next",T=12,H=2))
        next_start=snap(g)
        guards=[("G01","E01")] if g.owned["G01"].charges else []
        fixed(g,[2,2,2],2,guards,"남겨둔 G가 있으면 다음 손님의 E를 보호",rows)
        equal(f"D2-G{count}-next-E",(g.owned["E01"].c,g.owned["E01"].p),
              (0,0) if count==2 else (6,1))
        next_first=snap(g)
        finish(g,rows,next_visitor=False)
        result(f"D2-G{count}",g,rows,
               dict(after_first_hit=first,after_first_guest=after_first,
                    next_guest_start=next_start,next_first_hit=next_first,
                    service_boundary_variant=boundary[-1]),
               "첫 3턴의 눈만 고정. 이후 현재 눈 정책으로 후속 손님 끝까지 진행.")
    equal("D2-service-reset-assets-identical",
          [b["assets"] for b in boundary],[boundary[0]["assets"]]*3)


def d3():
    for T in (12,16):
        for heal in (False,True):
            g=Game.diagnostic(["U01",None,"Q01","R01",None,None],
                              spec("D3-current",T=T,pattern="offset"),seed=SEED)
            g.visitor.update(p=2,A=5)
            g.owned["U01"].c=10
            rows=[]
            fixed(g,[1,1,1],1,[("R01","U01")] if heal else [],
                  "R의 A2 소비와 U의 파훼 방지 비교",rows)
            first=snap(g)
            if T==12:
                equal(f"D3-T12-R{int(heal)}-kill",(g.visitor["H"],g.cash),(0,2))
            else:
                equal(f"D3-T16-R{int(heal)}-state",
                      (g.owned["U01"].c,g.owned["U01"].p,g.visitor["A"]),
                      (10,2,0) if heal else (0,1,2))
                finish(g,rows,next_visitor=True)
            ended=snap(g)
            next_state=None
            if g.phase=="visitor_end":
                g.start_guest(spec("D3-next",T=12))
                next_state=snap(g)
                if T==12:
                    equal(f"D3-T12-R{int(heal)}-next-U",
                          (g.owned["U01"].c,g.owned["U01"].p),(0,2))
            result(f"D3-T{T}-R{int(heal)}",g,rows,
                   dict(first_turn=first,guest_end=ended,next_guest_start=next_state),
                   "T12는 초기화 이해 확인. T16은 처치/8턴 상한까지 후속 비용 관찰.")


def d4():
    for T in (12,16):
        for node in ("G01","E01"):
            g=Game.new(seed=SEED)
            g.buy(node)
            g.arrange(["U01",node,"Q01",None,"Q02",None])
            g.start_service()
            g.visitor.update(key="D4-current",name="D4-current",T=T)
            rows=[]
            fixed(g,[3,3,3],3,[("G01","Q01")] if node=="G01" else [],
                  "같은 가격·층에서 G 수비와 E 공격 증폭 비교",rows)
            if node=="G01":
                equal(f"D4-T{T}-G",
                      (g.visitor["F"],g.owned["Q01"].c,g.owned["Q01"].p,
                       g.owned["G01"].charges),(8,6,2,1))
            else:
                equal(f"D4-T{T}-E",
                      (g.visitor["H"],g.owned["Q01"].p),
                      (0,2) if T==12 else (1,1))
            first=snap(g)
            finish(g,rows,next_visitor=True)
            first_end=snap(g)
            next_start=None
            if g.phase=="visitor_end":
                g.advance()
                next_start=snap(g)
                finish(g,rows,next_visitor=False)
            result(f"D4-T{T}-{node}",g,rows,
                   dict(first_turn=first,first_guest_end=first_end,next_guest_start=next_start),
                   "B는 보관. 첫 턴의 눈만 고정한 뒤 현재 손님과 V2까지 진행.")


def d5():
    for node in ("R01","E01",None):
        g=Game.new(seed=SEED)
        g.buy("G01")
        g.cash=4
        g.grant+=4
        g.controlled=True
        g.emit("controlled_checkpoint", injected_cash=4, not_earned=True)
        g.service=0
        g.phase="management"
        checkpoint=snap(g)
        if node:
            g.buy(node)
        g.arrange(["U01","E01" if node=="E01" else "G01","Q01",
                   "G01" if node=="E01" else ("R01" if node=="R01" else None),
                   "Q02","B01"])
        layout=snap(g)
        g.start_service()
        initial=snap(g)
        rows=[]
        finish(g,rows,next_visitor=True)
        first_end=snap(g)
        if g.phase=="visitor_end":
            g.advance()
            finish(g,rows,next_visitor=False)
        if g.phase=="visitor_end":
            g.advance()
        result(f"D5-{node or 'hold'}",g,rows,
               dict(management_checkpoint=checkpoint,chosen_layout=layout,
                    service_start=initial,first_guest_end=first_end),
               "주입된 A 완료 경영 상태: 가상 보상4는 정상 캠페인 수익이 아님. 저축은 무구매 대조군.")


def d6():
    g=Game.diagnostic(["U01","E01","Q01","G01","Q02","B01"],
                      spec("D6-ended",T=12),seed=SEED)
    g.owned["U01"].c=10
    g.owned["U01"].p=1
    g.owned["E01"].p=0
    g.owned["B01"].charges=0
    g.owned["G01"].charges=1
    g.purchased={"G01","E01"}
    g.cash=2
    g.grant=2
    g.visitor["H"]=0
    g.phase="visitor_end"
    before=snap(g)
    same=copy.deepcopy(g)
    same.start_guest(spec("D6-next",T=12))
    equal("D6-next-guest",
          (same.owned["U01"].c,same.owned["U01"].p,same.owned["E01"].p,
           same.owned["B01"].charges,same.owned["G01"].charges,same.cash),
          (0,1,0,0,1,2))
    new=copy.deepcopy(g)
    new.phase="management"
    new.service=0
    new.arrange(["U01",None,"Q01","G01","Q02","B01"])
    stored=snap(new)
    equal("D6-store-no-refill",
          (new.owned["E01"].p,new.owned["B01"].charges,new.owned["G01"].charges),
          (0,0,1))
    new.start_service()
    equal("D6-new-service",
          (new.owned["U01"].c,new.owned["U01"].p,new.owned["E01"].p,
           new.owned["B01"].charges,new.owned["G01"].charges,new.cash),
          (0,2,1,2,2,2))
    result("D6",new,[],dict(before=before,next_guest=snap(same),
                           after_store=stored,new_service=snap(new)),
           "처치 후 경계 단위 진단. 보상 획득·정상 영업 완주로 집계하지 않음.")


def main():
    for f in (d1,d2,d3,d4,d5,d6):
        f()
    RUNS.mkdir(exist_ok=True)
    hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (ROOT.parent/"rules.md",ROOT.parent/"undecided.md",
                      ROOT.parent/"mvps"/"mvp-config-12.md",ROOT/"engine.py",ROOT/"policy.py")}
    payload=dict(seed=SEED,mode="controlled_diagnostics",hashes=hashes,
                 fixed_checks=CHECKS,runs=RESULTS)
    (RUNS/"diagnostics.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    summary=[]
    for r in RESULTS:
        end=r["checkpoints"].get("guest_end") or r["final"]
        summary.append(dict(name=r["name"],phase=end["phase"],metrics=r["metrics"],turns=len(r["turns"]),
                            visitor=end["visitor"],cash=end["cash"],
                            assets=end["assets"]))
    (RUNS/"diagnostics_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(dict(fixed_checks=len(CHECKS),runs=len(RESULTS),summary=summary),
                     ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
