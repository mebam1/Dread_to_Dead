# Config 11 텍스트 MVP

> **과거 config 11의 텍스트 구현.** 직원 카드·마나·덱·융합과 도착 시 통과+도착, C/P 손상 이월을 사용한다. 현행 괴이 중심 규칙의 구현이나 검증 결과가 아니다.

Python 3.10 이상, 외부 패키지 없음. 판정·시험값은 [당시 명세](../mvps/legacy-specs-11.md), 진행 목적은 [과거 config 11](../mvps/mvp-config-11.md), 실행 결과는 [플레이 기록](runs/playthrough.md)을 따른다.

```powershell
cd C:\Users\mebam\Sol\Dread_to_Dead\mvp_text_11
python console.py --run runs/my_game --seed 1120
```

콘솔에서 다음 명령을 한 줄씩 입력한다. 이미 만든 run은 `new` 없이 이어서 실행할 수 있다.

```text
new
view
fusion a=G01 b=T01 choice=GT2
arrange slots=U01,V01,GT201,Q01,-,-
start
roll
```

공개된 눈 하나를 `choose value=3`처럼 선택한 뒤 직원 카드를 쓰거나 `move`로 이동한다. `roll`은 다음 턴의 드로우와 굴림이다. 첫 손님 처치 후 `start`로 다음 손님, 두 번째 처치 후 경영하고 `start`로 보스를 상대한다. `exit`는 콘솔만 닫으며 저장은 유지한다.

| 명령 예시 | 기능 |
|---|---|
| `choose value=3` | 공개 눈3 확정, 이동·마나3 |
| `card card=G01 target=Q01` | 즉시 흡수 |
| `card card=T01 target=U01 receiver=Q01` | 다음 잔여 타격 이전 |
| `card card=H01 target=U01` | 현재 A2를 소비해 회복 |
| `card card=B01 target=U01 slot=2` | ② 첫 통과에 상태를 검사하는 배치 |
| `card card=D01` | 즉시 추가 드로우 |
| `preview value=3` | 공개 눈3의 이동·공격 결과 예상. 미래 드로우·굴림 없음 |
| `preview` | 선택·카드 사용이 끝난 현재 상태의 이동 예상 |
| `recruit kind=G` / `buy kind=U` | 경영 중 직원4 / 기본 괴이6 구매 |
| `repair target=V01` | 경영 중 C 최대8 수리, 가격3 |
| `deck cards=H01,B01,D01,D02,G02` | 경영 중 실제 덱 편성 |
| `arrange slots=U01,V01,GT201,Q01,U02,-` | 경영 중 배치, 미배치 자산은 보관 |
| `--full view` | 풀·편성·시장 등 전체 공개 정보 |
| `events last=10` | 최근 공개 사건 |

**모집한 직원은 보유 풀에 추가되며 자동 편성되지 않는다.** `deck`과 `reserve`를 확인한 뒤 영업을 시작한다. 융합 후보 ID는 GT101·GT201·GT301, 재모집 직원은 G02 등으로 출력된다.

한 번의 현재 결정을 묶을 수도 있다. 새로 굴린 눈을 확인한 뒤 다음 선택을 입력한다. 목록 인수를 받는 `arrange`·`deck`은 단독 명령으로 사용한다.

```text
--reason "공급 뒤 U를 회복하고 다음 턴을 확인한다" sequence choose:value=5 card:card=B01,target=U01,slot=5 move roll
```

콘솔 없이도 `python cli.py --run runs/my_game view`처럼 동일 명령을 사용한다.

검증 실행:

```powershell
python -m unittest -v test_engine
```

통제 진단은 `python cli.py --run runs/my_d7 --scenario d7 --seed 1107 new`로 시작한다. 시나리오는 `d2-arrival`, `d2-offset`, `d3-t12`, `d3-t16`, `d7`, `d7-final`이다. 통제 시작 눈은 실제 난수 표본과 구분하며 D7의 다음 턴부터는 실제 셔플·굴림을 사용한다.

`runs/<이름>/play.jsonl`은 선택 이유와 공개 상태·효과 기록, `manifest.json`은 시드·참조 문서 해시, `state.pkl`은 이어하기용 내부 저장이다. 공개 기록에 미래 덱 순서나 RNG 상태는 넣지 않는다. 내부 저장은 이 프로그램이 만든 파일만 사용한다. 구현 변경 이력은 작성하지 않았다.
