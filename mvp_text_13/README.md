# Config 13 텍스트 MVP

[실험 config](../mvps/mvp-config-13.md) · [시험 명세](../undecided.md#u-mvp13) · [플레이 결과와 분석](runs/playthrough.md) · [통제 진단](runs/diagnostics.md) · [후속 7분기](runs/control_summary.md)

Python 3.10 이상, 외부 패키지 없이 실행한다. 이 폴더에서 PowerShell을 열고 새 저장 파일명을 사용한다. `normal_*.json`은 실제 시연 기록이므로 덮어쓰지 않는다.

```powershell
python -X utf8 -B cli.py --save runs/my_game.json new 13004 MUG
python -X utf8 -B cli.py --save runs/my_game.json start
python -X utf8 -B cli.py --save runs/my_game.json preview
python -X utf8 -B cli.py --save runs/my_game.json intent "3,5" "Q에 도착해 벨과 수확을 연결하고 싶다" --actions B01
python -X utf8 -B cli.py --save runs/my_game.json roll
python -X utf8 -B cli.py --save runs/my_game.json preview
```

`intent`의 숫자는 층 번호가 아니라 **현재 위치에서의 이동 거리**다. 매 턴 눈을 보기 전에 먼저 희망 거리·이유를 기록한다. 공개된 눈을 본 뒤에는 희망과 다른 행동을 선택해도 된다. `intent - "특별한 희망 없음"`도 가능하다.

- `show`: 현재 호텔·손님·액티브 잔량·공개 눈.
- `preview`: 눈 공개 전에는 거리1~6의 가상 결과, 공개 후에는 현재 눈만 미리보기. 미래 난수는 조회하지 않는다.
- `preview 3 --actions B01 G01:U01`: 해당 행동 조합의 결과를 확인한다. 불법 행동은 거부한다.
- `play 3 --actions B01`: **실제로 공개된 눈3이 있을 때만** 선택·액티브·이동을 함께 처리한다. 액티브가 없으면 `play 3`.
- `play 2 --arrival U01`: 선택한 이동이 살아 있는 G에 도착하는 경우 보호할 대상을 지정한다. 실제 거리는 현재 위치에 따라 다르다.
- 단계별 진행도 가능하다: `choose 눈` → `active B01` 또는 `active G01 U01` → `move` 또는 G 도착이면 `move 대상ID`.
- 처치 뒤 `next`: 다음 손님 또는 경영 경계로 진행한다. 경영 상태에서는 `start`로 다음 영업을 시작한다.
- `note "이유"`: 실제 선택 이유를 추가로 기록한다. 각 변경 명령은 자동 저장한다.

고정 배치는 `U/G/Q01/빈층/Q02/B`다. M0는 U 도착+1·G 도착 없음, MU는 U 도착+4만, MG는 G 도착 흡수6만, MUG는 두 변경 모두를 적용한다. U 통과+2와 기존 B/G 액티브는 모든 군에서 같다. 구매·재배치는 이번 실험에서 잠겨 있다.

```powershell
python -X utf8 -B -m unittest test_engine -v
python -X utf8 -B diagnostics.py
python -X utf8 -B controls.py
python -X utf8 -B audit.py
```

`diagnostics.py`는 강제 상태의 판정과 다음 턴의 전체216개 주사위 묶음을 검산한다. `controls.py`는 고정된 공개정보 2턴 기대값 정책으로 통제 후속7분기를 재현하며 해당 결과 파일을 갱신한다. 정상6캠페인은 AI가 매 턴 직접 판단한 기록이며 이 정책의 자동 실행이 아니다. `audit.py`는 그 기록의 사전 희망·공개 눈·선택·결과를 재생하고 요약한다.

손님당8턴 상한을 적용한다. 기본 CLI는 상한 전에 임의로 패배를 추정하지 않는다. 통제 진행자는 공급자가 없을 때 남은 불안과 벨로 만들 수 있는 낙관적 공포 상계가 필요량보다 작은 경우에만 입증 중단했다. 이를 일반적인 불리함·선택지 감소와 구분한다.

PowerShell에서 JSON을 표준입력으로 전달하는 보조 진행기 `manual.py`를 사용할 때도 `python -X utf8 -B`를 사용한다. 실제 시연의 실패·미도달·판단 이유는 보존하며, 인간의 이해·선호·재미 검증과 구별한다.
