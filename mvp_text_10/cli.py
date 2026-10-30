"""Config 10 text MVP. Commands persist games; only public turn information is printed."""
import argparse
import json
import secrets
import sys
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
from engine import Game

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"
NAMES = {"guide":"안내판","radio":"라디오","room":"닫힌 객실",
"SR1":"대답하는 벽","SR2":"금지된 안내방송","SR3":"오지 않은 호출",
"SK1":"미리 적힌 투숙기록","SK2":"빈 이름의 명부","SK3":"반복되는 첫날",
"RK1":"목소리의 투숙대장","RK2":"삭제된 녹취록","RK3":"원본 없는 증언"}
CATALOG = {
"S":"접객원: 통과 불안 +2", "R":"녹음기사: 통과 환청 +2",
"K":"기록원: 도착에 지정 상태 최대2 참조, 개당 공포2",
"SR1":"통과 불안1→환청2; 도착 환청 최대2 소비·개당 공포4",
"SR2":"도착 불안≥1이면 환청 최대2 참조·개당 공포2; 상태 보존",
"SR3":"통과 불안1+환청1→기시감2; 직접 공포 없음",
"SK1":"통과 불안 최대2→기시감 1:1",
"SK2":"도착 min(2,max(불안-기시감,0))만큼 불안 소비·개당 공포4",
"SK3":"도착 기시감 최대2 참조 n→불안+n, 공포2n",
"RK1":"통과 환청 최대2→기시감 1:1",
"RK2":"통과 환청 최대2 제거 q; 같은 방문에 도착하면 공포4q",
"RK3":"도착 min(2,환청,기시감) 참조·공포3n; 상태 보존"}
def name_ok(name):
    if not name or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in name):
        raise ValueError("Game name: ASCII letters, digits, _ or - only")
    return name
def state_path(name):
    return RUNS / (name_ok(name) + ".state.json")
def load(name):
    return Game.from_dict(json.loads(state_path(name).read_text(encoding="utf-8")))
def save(name, game):
    RUNS.mkdir(exist_ok=True)
    p = state_path(name)
    temp = p.with_suffix(".tmp")
    temp.write_text(json.dumps(game.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(p)
def append(name, command, game, **data):
    RUNS.mkdir(exist_ok=True)
    record={"time":datetime.now(timezone.utc).isoformat(),"command":command,
            "state":game.public_state(), **data}
    with (RUNS/(name_ok(name)+".jsonl")).open("a",encoding="utf-8") as f:
        f.write(json.dumps(record,ensure_ascii=False)+"\n")
def observation_complete(g):
    return g.stage == "C" and g.stats["turns"] >= 1

def render(name,g):
    if observation_complete(g):
        log=RUNS/(name_ok(name)+".jsonl")
        actions=[json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if json.loads(line).get("command")=="step"]
        endpoint=actions[-1]["state"]
        print(f"[{name}] C 관찰 종료 / 실제 {endpoint['stats']['turns']}턴 / F {endpoint['F']}/{endpoint['T']} H {endpoint['H']} / 재화 {endpoint['cash']}")
        print("첫 행동 결과:",json.dumps(endpoint["stats"],ensure_ascii=False))
        print("방문자 생존 여부와 관찰 완료는 별도입니다. 계속하려면 새 진단 분기를 만드세요.")
        return
    print(f"[{name}] {g.stage} / turn {g.turn} / {g.phase} | 위치 {g.pos} | F {g.F}/{g.T} H {g.H} | 불안 {g.a} 환청 {g.b} 기시감 {g.c} | 재화 {g.cash}")
    slots=[]
    for i,t in enumerate(g.board,1):
        if t:
            tile=g.tiles[t]
            slots.append(f"{i}:{t}({tile['hp']}/4)")
        else: slots.append(f"{i}:빈칸")
    print(" → ".join(slots))
    print("풀:",",".join(g.pool), "| 덱:",",".join(g.deck),
          "| 손패:",",".join(g.hand), "| 뽑을덱:",len(g.draw_pile),"버림:",len(g.discard))
    if observation_complete(g):
        print("C 관찰 종료: 첫 행동만 평가하며 방문자 생존 여부는 별도입니다.")
    if g.phase=="ready" and not observation_complete(g):
        opts=[]
        for eye in dict.fromkeys(g.eyes):
            path=[((g.pos+i)%6)+1 for i in range(eye)]
            opts.append(f"{eye}:경로{path}/도착{path[-1]}/마나{eye}")
        print("현재 눈:",g.eyes, " | ".join(opts))
    print("누계:",json.dumps(g.stats,ensure_ascii=False))
def plays_from(tokens):
    plays=[]
    for token in tokens:
        chunks=token.split(":")
        if len(chunks) not in (2,3): raise ValueError("card:slot[:a|b|c]")
        play={"card":chunks[0],"slot":int(chunks[1])}
        if len(chunks)==3: play["state"]=chunks[2]
        plays.append(play)
    return plays
def show_events(events):
    for event in events:
        print(" ",event if isinstance(event,str) else json.dumps(event,ensure_ascii=False))
def family_seed(family):
    RUNS.mkdir(exist_ok=True)
    p=RUNS/".random_families.json"
    data=json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    if family not in data:
        data[family]=secrets.randbits(128)
        p.write_text(json.dumps(data),encoding="utf-8")
    return data[family]
def provenance():
    project=ROOT.parent
    paths=["rules.md","undecided.md","mvps/mvp-config-10.md"]
    return {p:sha256((project/p).read_bytes()).hexdigest() for p in paths}
def main():
    parser=argparse.ArgumentParser(description="Dread-to-Dead config10 text MVP. States a=불안 b=환청 c=기시감.")
    sub=parser.add_subparsers(dest="cmd",required=True)
    p=sub.add_parser("new");p.add_argument("name");p.add_argument("--stage",choices=["L","F","C","E","N"],default="F");p.add_argument("--variant",choices=["A","B"],default="A");p.add_argument("--boss",action="store_true");p.add_argument("--family")
    for cmd in ["show","start","next"]:
        p=sub.add_parser(cmd);p.add_argument("name")
    p=sub.add_parser("fuse");p.add_argument("name");p.add_argument("left");p.add_argument("right");p.add_argument("candidate")
    for cmd in ["arrange","space-arrange","deck"]:
        p=sub.add_parser(cmd);p.add_argument("name");p.add_argument("items",help="comma separated; - = empty")
    p=sub.add_parser("recruit");p.add_argument("name");p.add_argument("kind",choices=["S","R","K"])
    for cmd in ["step","preview"]:
        p=sub.add_parser(cmd);p.add_argument("name");p.add_argument("eye",type=int);p.add_argument("plays",nargs="*");p.add_argument("--why",default="")
    sub.add_parser("catalog")
    sub.add_parser("summary")
    args=parser.parse_args()
    if args.cmd=="catalog":
        for k,v in CATALOG.items():print(k,NAMES.get(k,""),v)
        return
    if args.cmd=="summary":
        for p in sorted(RUNS.glob("*.state.json")):
            g=Game.from_dict(json.loads(p.read_text(encoding="utf-8")))
            report_stats=g.stats
            if observation_complete(g):
                log=p.with_name(p.name.replace(".state.json",".jsonl"))
                actions=[json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if json.loads(line).get("command")=="step"]
                report_stats=actions[-1]["state"]["stats"]
            print(json.dumps({"name":p.name.removesuffix(".state.json"),"stage":g.stage,"phase":"observation_complete" if observation_complete(g) else g.phase,
                              "turns":report_stats["turns"],"F":g.F,"H":g.H,"cash":g.cash,"stats":report_stats,
                              "board":[(t,g.tiles[t]["hp"]) if t else None for t in g.board]},ensure_ascii=False))
        return
    if args.cmd=="new":
        if state_path(args.name).exists():raise ValueError("Existing game; use a new branch name")
        g=Game.new(stage=args.stage,variant=args.variant,boss=args.boss,seed=family_seed(args.family or args.name))
        save(args.name,g)
        append(args.name,"new",g,mode="assistant self-play",family=args.family or args.name,provenance=provenance())
    else:
        g=load(args.name)
        if args.cmd in ("step","next","preview") and observation_complete(g):
            raise ValueError("C 관찰은 첫 행동으로 종료되었습니다. 새 진단 분기를 만드세요.")
        if args.cmd=="show":
            render(args.name,g);return
        if args.cmd=="preview":
            result=g.preview(args.eye,plays_from(args.plays))
            print(json.dumps(result,ensure_ascii=False,indent=2));return
        before=g.public_state()
        events=[]
        if args.cmd=="fuse":g.fuse(args.left,args.right,args.candidate)
        elif args.cmd=="arrange":g.arrange([None if x=="-" else x for x in args.items.split(",")])
        elif args.cmd=="space-arrange":g.space_arrange([None if x=="-" else x for x in args.items.split(",")])
        elif args.cmd=="deck":g.set_deck([] if args.items=="-" else args.items.split(","))
        elif args.cmd=="recruit":g.recruit(args.kind)
        elif args.cmd=="start":
            g.start()
            if g.phase=="draw":events=g.draw_roll() or []
        elif args.cmd=="next":events=g.draw_roll() or []
        elif args.cmd=="step":
            events=g.resolve(args.eye,plays_from(args.plays))
            append(args.name,"step",g,before=before,eye=args.eye,plays=plays_from(args.plays),why=args.why,events=events)
            show_events(events)
            if g.phase=="draw" and not observation_complete(g):
                next_events=g.draw_roll() or []
                append(args.name,"draw_roll",g,events=next_events)
            save(args.name,g)
            render(args.name,g);return
        save(args.name,g)
        append(args.name,args.cmd,g,before=before,args=vars(args),events=events)
        if events:show_events(events)
    render(args.name,g)
if __name__=="__main__":
    try:main()
    except (ValueError,KeyError,RuntimeError,FileNotFoundError) as exc:
        print("ERROR:",str(exc),file=sys.stderr);sys.exit(2)
