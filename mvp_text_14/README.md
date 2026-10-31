# Config 14 텍스트 MVP

[실험 config](../mvps/mvp-config-14.md) · [시험 명세](../undecided.md#u-mvp14) · [플레이 결과와 분석](runs/playthrough.md) · [정상 선택 기록](runs/normal_turns.md) · [보호와 후속 사용](runs/protection_links.md) · [보호 생략 후속 재생](runs/protection_continuations.md) · [통제 진단](runs/diagnostics.md) · [후속 비교](runs/control_summary.md)

Python 3.10 이상, 외부 패키지 없이 실행한다. 이 폴더에서 PowerShell을 열고 새 저장 파일명을 사용한다. `normal_*.json`은 실제 플레이 기록이므로 덮어쓰지 않는다.

```powershell
python -X utf8 -B cli.py --save runs/my_game.json new 14004 M14
python -X utf8 -B cli.py --save runs/my_game.json start
python -X utf8 -B cli.py --save runs/my_game.json preview
python -X utf8 -B cli.py --save runs/my_game.json intent "3,5" "수확으로 처치하고 방어 횟수를 보존한다"
python -X utf8 -B cli.py --save runs/my_game.json roll
python -X utf8 -B cli.py --save runs/my_game.json preview
```

`intent`는 층 번호가 아니라 현재 위치에서의 **희망 이동 거리**다. 눈 공개 전에 이유와 함께 남기고, 공개된 눈을 본 뒤 다른 선택을 해도 된다. `intent - "특별한 희망 없음"`도 가능하다.

- `show`: 현재 손님·괴이·잔량·비활동·탈출구·공개 눈.
- `preview 3 --actions G01:Q01 B01`: 선택과 액티브의 결과를 확인한다. 선택 눈3이 실제 공개돼 있을 때 `play 3 --actions G01:Q01 B01`로 실행한다.
- `play 2 --escape 4`: 빈4층에 탈출구를 설치하고 선택 눈2로 이동한다. 실제 접촉 시에만 영업이 끝난다. 결합 명령에서는 설치를 액티브보다 먼저 처리한다.
- 단계별 진행은 `choose 눈` → `active G01 대상ID` / `active B01` / **`escape 빈층번호`(탈출구 열어주기)** → `move`다. 액티브와 설치 순서를 직접 정할 수 있다.
- C13에서 G에 도착하면 `move 대상ID` 또는 `play 눈 --arrival 대상ID`로 도착 방어 대상을 정한다. M14/C14에는 도착 방어 대상 지정이 없다.
- 처치·탈출 뒤 `next`, 경영 경계에서 `start`를 사용한다. 탈출은 남은 손님을 건너뛰지만 다음 영업 시작 전까지 P·횟수를 복구하지 않는다.
- `note "선택 이유"`: 선택 이유를 추가 기록한다. 변경 명령은 자동 저장한다.

고정 배치는 `U / G / Q01 / 빈층 / Q02 / B`다. C13은 G 도착 즉시 흡수6·비활동/탈출구 없음, M14는 도착 충전·비활동·탈출구 적용, C14는 M14에서 도착 충전만 제거한 통제다. P0 괴이는 층을 점유한다. G 새 충전은 다음 턴부터 사용하며 초기2회 이후에도 충전으로 추가 사용이 가능하다.

비활동 추가량은 주 시험12, 연속3턴 뒤 발동 후 계속 비활동이면2턴마다 발동한다. 활동 뒤 기준은3턴으로 복귀한다. 주사위와 패널티 대상 추첨은 별도 난수 흐름이다. 미리보기는 **랜덤 대상과 실제 최종 C/P를 확정해서 보여주지 않으며**, 후보별 가능한 패널티 결과를 표시한다. 미래 눈도 공개하지 않는다.

손님당24턴은 관찰 상한으로, 게임상 자동 패배나 탈출이 아니다. 실제 처치·탈출·관찰 중단을 구별한다.

JSON 보조 진행기 `manual.py`는 `new`, `intent_roll`, `play`, `preview`, `look`을 받는다. `play` 후 정상 손님/영업 경계를 자동 진행하되 종료 직전 상태와 복구를 각각 기록한다. 입력·출력에 한글이 있으면 `python -X utf8 -B`를 사용한다. 정상 기록은 매 턴 현재 정보로 직접 판단한 AI 시연이며 인간의 재미 검증과 구분한다.

검사·기록 재생은 아래 명령을 사용한다. 진단·통제 명령은 해당 결과 파일을 갱신하며 정상 플레이 원본은 수정하지 않는다.

```powershell
python -X utf8 -B -m unittest test_engine -v
python -X utf8 -B diagnostics.py
python -X utf8 -B controls.py
python -X utf8 -B protection_controls.py
python -X utf8 -B audit.py
```

정상 캠페인은 플레이어 AI가 눈 공개 전 희망을 남긴 뒤 공개된 눈에서 직접 선택했다. `planner.py`의 고정 공개정보 정책은 후속 통제 분기에만 사용한다. 같은 행동의 재생과 다른 선택을 허용한 후속 분기, 강제 상태·강제 눈 진단을 구분해 결과를 읽는다.
