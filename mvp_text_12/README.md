# Config 12 텍스트 MVP

Python 3.10 이상, 외부 패키지 없이 실행한다. [config 12](../mvps/mvp-config-12.md)와 [시험 명세](../undecided.md#u-mvp12)를 적용했다.

[정상 플레이와 분석](runs/playthrough.md) · [통제 비교 결과](runs/diagnostics.md)

PowerShell에서 이 폴더로 이동한 뒤 새 저장 파일로 시작한다.

~~~powershell
python -X utf8 -B cli.py --save runs/my_game.json new 20261031
python -X utf8 -B cli.py --save runs/my_game.json buy G01
python -X utf8 -B cli.py --save runs/my_game.json layout U01 G01 Q01 - Q02 B01
python -X utf8 -B cli.py --save runs/my_game.json start
python -X utf8 -B cli.py --save runs/my_game.json roll
python -X utf8 -B cli.py --save runs/my_game.json preview
~~~

매 턴 choose 공개된눈으로 하나를 확정한 뒤, 원하는 만큼 active B01, active G01 대상ID, active R01 대상ID를 입력하고 move로 이동한다. 예: active G01 U01. 액티브 처치가 발생하면 이동을 건너뛰고 next로 진행한다.

- show: 현재 호텔·손님·잔액 확인.
- roll: 다음 턴 주사위 공개. 이미 공개된 턴의 재굴림은 거부한다.
- preview: 현재 눈별 액티브 미사용 결과. 실제 상태는 변경하지 않는다.
- suggest: 현재 공개 정보만 사용하는 고정 정책의 행동 후보.
- next: 처치한 손님 이후로 진행. 첫 영업 종료 후 경영 창, 마지막 손님 후 종료.
- buy 노드ID, layout 여섯층: 경영 창에서만 사용. -는 빈층이며 생략한 보유 괴이는 보관한다.
- start: 경영 확정 후 새 영업 시작. 이때 P·횟수와 P0가 시험 명세대로 복구된다.
- auto: 현재 손님만 고정 정책으로 진행. 구매·배치는 직접 정한다.

저장은 명령마다 이루어진다. runs/main.json은 정상 시연 원본이므로 새 게임에는 다른 파일명을 쓴다.

괴이: U 공급, Q 수확, B 벨 공포, G 방화문 흡수, E 발자국 증폭, R 그림자 회복. 방문자의 F와 구매용 공포 재화는 별개다.

~~~powershell
python -X utf8 -B -m unittest test_engine -v
python -X utf8 -B experiments.py
~~~

두 번째 명령은 고정 진단을 재현하며 runs/diagnostics*.json을 갱신한다. 정상 플레이는 미래 눈을 조회하지 않으며, 진단의 강제 눈과 손상은 통제 입력이다. 자동 정책은 현재 턴 평가이며 최적 전략이나 인간 플레이 모델이 아니다. 생산 불능을 추정해 조기 종료하지 않고 손님당8턴 상한을 적용한다.

이 폴더의 결과는 config12의 P0 복귀 시험값에 한정된다. 구현 변경 이력은 프로젝트 문서에 추가하지 않았다.
