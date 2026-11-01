# 사용자 설정 3 증설 가치 — 텍스트 플레이와 분석

[실험 명세: mvp-config-15.md](../mvps/mvp-config-15.md) · [현행 user-3 명세](../mvps/mvp-config-user-3.md) · [진행자·플레이어 절차](runbook.md) · [준비 검사 결과](PREPARATION.md)

> **과거 규칙의 실행기·기록:** 아래 실험은 user-3 v1.0 기준이다. [현행 v1.1](../mvps/mvp-config-user-3.md)의 상점 증설·회복·토큰 이월·개체 강화는 미구현이며, 기존 검사·플레이 결과를 새 규칙의 검증으로 사용하지 않는다.

이 디렉터리는 **user-3 규칙에서 증설에 영혼과 방문 기회를 쓸 만큼 실질적인 이익이 있는지** 확인하기 위한 텍스트 게임과 비교 도구다. 실험 명세는 `mvp-config-15.md`, 실행 디렉터리는 `mvp_text_15`를 사용한다. 과거 설정 14의 비활동·충전 실험 기록과는 구별한다.

엔진은 3막·막당 8번 방문, 일반 손님 3명·엘리트·보스, 괴이 3중 1 보상, 8개 상품 상점, 증설 노드, 주사위 발견·이벤트를 처리한다. 진행기는 현재 공개 정보만 출력하고 선택 이유와 결과를 저장한다. 도구 준비·판정 검사·합성 진단과 실제 정상 AI 플레이 기록을 구분한다.

## 완료한 플레이와 결론

고정한 정상3판을 모두 직접 선택하며 최종 보스까지 완료했다. [증설 분석 보고서](runs/analysis.md)에 같은 체크포인트의 유료/미증설·무료 재배치·빈층·다른 경로 비교를 정리했다.

초기7층은 세 상태 모두 무료 재배치 대안이 같거나 더 좋은 결과를 냈다. 후기10층 한 사례에서는 남은 정예·보스를5턴 줄이고 괴이 파괴2개를 피했다. 증설의 조건부 전투 이익은 확인했지만 보편적 필수성·가격의 순투자 회수는 확정하지 않는다. 상세 범위와 회고 통제의 한계는 보고서를 따른다.

- 정상 판: [31001](runs/notes_31001.md) · [31002](runs/notes_31002.md) · [31003](runs/notes_31003.md)
- [명령 재생·영혼·괴이 장부 검산](runs/audit-normal-summary.md): 세 판 각각22개 검사 통과, 최종 전체 상태 일치, 원본 불변.
- [준비 검사·합성 진단](PREPARATION.md): 판정 검사40개 통과. 인간의 재미 검증과는 구분한다.

## 실행 환경

Node.js 20 이상, 외부 패키지 없이 실행한다. 프로젝트 루트에서 다음 명령을 쓸 수 있다.

```powershell
Set-Location mvp_text_15
node cli.mjs help
node cli.mjs --save runs/normal_31001.json new 31001
node cli.mjs --save runs/normal_31001.json map
```

`new`는 기존 파일을 덮어쓰지 않는다. 다른 판은 새로운 파일명을 사용한다. 기본 파일은 이 디렉터리의 `runs/my_game.json`이다. `--save`를 명시하면 현재 터미널 위치를 기준으로 경로를 해석한다.

도구 확인용 판은 `new 910015 smoke`처럼 세 번째 인자로 분류한다. 변경 저장은 완성된 임시 파일로 교체하며, Windows에서 교체가 제한되면 직전 완전 상태의 복구 사본을 유지한 채 기록한다. 중단된 기록을 복구 사본에서 읽었으면 출력에 `recoveryNotice`를 표시한다.

저장 파일은 진행자의 판정·이어받기 장부다. 웹 게임의 별도 세이브 기능을 추가하는 규칙이 아니며, 실패나 불리한 눈을 본 뒤 이전 상태로 돌아가는 용도로 사용하지 않는다. 플레이어 판단은 `show`, `map`, `preview`가 공개한 정보만 사용한다. 원시 저장 파일에는 진행자 상태가 있으므로 플레이어 판단을 위해 직접 읽지 않는다.

## 직접 플레이하는 순서

1. `show`와 `map`으로 현재 공개된 선택지·자산을 확인한다.
2. `--reason` 또는 앞선 `note`로 선택 이유를 남긴 뒤 노드를 방문한다. 노드 ID는 `map`의 `availableNodes`에 실제로 나온 값을 사용한다.
3. 전투 준비에서 무료 배치를 조정하고 `start`한다. 복구는 전투 준비 최초 진입 때 이미 끝난다.
4. `roll`로 현재 턴의 주사위만 공개하고 `preview`로 세 선택의 실제 결과·불확실한 패널티를 비교한다.
5. `choose` → 필요한 `active`·`exit` → `move`, 또는 같은 결정을 한 번에 기록하는 `play`를 실행한다.
6. 다음 손님은 자동 입장한다. 완승 시 `reward`, 엘리트라면 추가 `die` 결정까지 마친 뒤 지도에 돌아간다.
7. 상점·증설·발견·이벤트는 각 노드의 선택을 적용하거나 떠난다. 전투 뒤 상점이 자동으로 붙지 않는다.

예를 들어 공개된 주사위 자리 0을 선택하는 경우다. **모든 상품 슬롯·보상 후보·주사위 자리는 0부터, 호텔 층은 1부터 시작한다.**

```powershell
node cli.mjs --save runs/normal_31001.json start --reason "현재 배치로 첫 손님을 상대한다"
node cli.mjs --save runs/normal_31001.json roll
node cli.mjs --save runs/normal_31001.json preview
node cli.mjs --save runs/normal_31001.json choose 0 --reason "공개된 세 눈 중 수확에 도달하고 파괴를 피하는 경로를 고른다"
node cli.mjs --save runs/normal_31001.json move
```

선택 이유가 없으면 실제 선택 명령을 실행하지 않는다. `note "..."`는 다음 선택에 한 번 사용된다. `move`는 이미 기록한 주사위 선택 이유를 이어받으며, 굴림·정보 확인에는 이유를 요구하지 않는다. 미리보기를 열어 본 것과 실제 액티브 사용을 구별해 기록한다.

## 주요 명령

| 명령 | 처리 |
|---|---|
| `show`, `map` | 현재 공개 정보와 다음 방문 가능 노드 |
| `catalog` | 공개된 괴이 6종·주사위 4종의 전체 이름·효과·내구·면 구성. 저장 파일 없이 열람 가능 |
| `visit ID` | 연결된 노드 방문 확정 |
| `place ID FLOOR`, `store ID` | 허용 화면에서 무료 배치·교환·보관 |
| `start`, `roll` | 준비 종료, 현재 턴 주사위 공개 |
| `preview [SLOT]` | 현재 공개된 눈 또는 이미 확정한 경로의 예고 |
| `choose SLOT`, `active ID [TARGET]`, `exit FLOOR`, `move` | 이동 전 선택·직접 사용·탈출구·실제 이동 |
| `play SLOT --actions JSON` | 하나의 선택 이유로 위 턴 행동을 명시적으로 실행 |
| `buy SLOT` | 상점 상품 1개 구매 |
| `expand`, `expansion-preview [JSON]` | 증설 노드 구매, 같은 가상 조건의 전후 비교 |
| `leave` | 상점·증설·이벤트 종료·스킵. 발견 주사위는 `die skip` |
| `reward INDEX` | 전투 보상 괴이 하나 무료 획득 |
| `die SLOT`, `die skip` | 발견·엘리트 주사위 교체 또는 건너뛰기 |
| `event die SLOT`, `event souls`, `event buy`, `event sacrifice ID`, `event leave` | 현재 사건이 허용하는 선택 |
| `note TEXT`, `journal [COUNT]` | 다음 선택 이유, 최근 행동 기록 |
| `checkpoint LABEL` | 실험용 비교 원본 저장. 본 판 상태는 바꾸지 않음 |
| `give-up` | 포기 패배. 최종 보스 처치 뒤 마지막 보상에서는 불가 |

명령마다 현재 단계가 허용하는 행동만 실행한다. 이벤트 선택이 없는 사건에 `event die`를 하거나 상점에서 `expand`를 하는 식의 입력은 거절한다. `die skip`과 이벤트의 원래 선택지로 돌아가기는 같은 행동이 아니다. 이벤트의 주사위 교체를 확정하지 않았다면 아직 다른 이벤트 대안을 선택할 수 있다.

## JSON 명령으로 진행

PowerShell 인용 문제를 줄이려면 JSON 한 객체를 표준입력 또는 파일로 전달한다. 결과도 JSON으로 출력되어 현재 상태와 선택 기록을 그대로 검토할 수 있다.

```powershell
@'
{"command":"play","args":[0],"actions":[{"kind":"active","entityId":"e4"}],"reason":"이미 공개된 경로를 고르고 호출벨 한 번으로 남은 공포를 보충한다"}
'@ | node cli.mjs --save runs/normal_31001.json --command-json -
```

위 예시는 입력 형식이다. `e4`가 살아 있고 배치되어 있으며 해당 단계에서 사용 가능한지는 실제 공개 상태로 확인해야 한다. 불법 액션이 있으면 명령 전체를 저장하지 않는다. 코드가 선택을 대신하거나 다음 턴 눈을 탐색하지 않는다.

## 증설 비교 준비

정상 판에서 증설 노드에 들어가면 **구매 전** `checkpoint`를 만든다. 본 판의 선택은 공개 정보와 그때의 이유로 계속 진행하며, 비교는 별도 `control-branch`로 관리한다.

```powershell
node cli.mjs --save runs/normal_31001.json checkpoint first-expansion
node cli.mjs --save runs/normal_31001.json expansion-preview
node cli.mjs --save runs/normal_31001.json expand --reason "보관 괴이를 새 층에 배치할 이득이 영혼 4보다 크다고 예상한다"
node cli.mjs --save runs/normal_31001.json leave --reason "구매한 층에 맞춘 배치를 마쳐 다음 노드로 간다"
```

이유 예시는 정답이 아니다. 보관 괴이가 없거나 순환이 불리하면 스킵도 정상 선택이다. 증설 효과는 아래를 분리한다.

- **배치 공간:** 실제로 추가 배치한 괴이와 그 괴이의 공급·공포·보호·수리·충전.
- **기하 변화:** 같은 괴이와 같은 행동에서 달라진 통과·도착·재방문·공격 대상.
- **경제 비용:** 영혼 4/6/8/10과 그 때문에 못 산 상품·후속 증설.
- **방문 비용:** 증설 노드 대신 갈 수 있었던 다음 경로·보상. 같은 노드 안의 구매/스킵 비교와 다른 경로 비교를 섞지 않는다.

비교 도구의 정확한 명령과 해석은 [실험 명세](../mvps/mvp-config-15.md)와 [runbook](runbook.md)을 따른다. 216개 면 조합을 계산하는 분석은 알려진 주사위 분포에 대한 가상 진단이며 실제 미래 눈을 예측하는 플레이가 아니다.

### 비교 도구 명령

```powershell
node expansion.mjs diagnostics --out runs/diagnostics/new-mechanism-run
node expansion.mjs branch --save runs/checkpoints/normal_31001-first-expansion.json --out runs/controls/first-expansion
node expansion.mjs compare --before runs/checkpoints/skip-turn-start.json --after runs/checkpoints/paid-turn-start.json --out runs/diagnostics/first-matched-turn
```

위 파일명은 예시다. `branch`에는 실제로 만든 증설 노드 구매 전 세션·체크포인트 경로를 넣는다. `compare`에는 같은 난수 번호·막·노드·손님 순번·턴의 `roll` 또는 `choose` 상태 두 개를 넣는다. 별도 정상 판이나 다른 손님의 상태는 비교를 거절한다. `--policy survival`로 현재 턴의 손실 회피 우선 정책을 고를 수 있으며 기본은 현재 공포 진행 우선이다.

`compare`는 미래 눈 대신 216개 가상 면 조합을 열거해 지표·차이·변경된 배치/장비/손님 상태/잔액을 `comparison.md`와 JSON에 기록한다. 진행자 원시 상태나 미공개 지도·보상은 출력하지 않는다. 같은 전투 경계라도 현재 손님 상태·자산이 달랐다면 층 수 하나의 효과로 해석하지 않는다. 원본 세이브는 유지하며 결과 디렉터리가 이미 있으면 덮어쓰지 않는다.

추가 배치 사례의 미증설 배치를 최선으로 가정하지 않는다. 진단에는 6층에서 다른 괴이를 수확 괴이로 교체하는 구체적 대안도 포함하지만, 모든 재배치의 최적해를 찾은 결과는 아니다.

## 파일과 검증

| 파일 | 역할 |
|---|---|
| `engine.js` | user-3 규칙, 공개 정보와 실제 판정·결정론 난수 |
| `cli.mjs` | 상태 장부·이유 기록·텍스트 명령·공개 출력 |
| `expansion.mjs` | 증설 전후와 통제 분기 분석 |
| `manual.mjs` | 명시한 CLI 명령 실행과 현재 턴의 굴림·미리보기 출력 보조. 선택 정책 없음 |
| `audit.mjs` | 완료한 정상3판의 명령 재생·가격·자산·최종 상태 검산 |
| `*.test.js` | 강제 상태를 포함한 판정·보안 경계 검사 |
| `runbook.md` | 진행자와 플레이어를 겸하는 AI의 실행·기록 절차 |
| `runs/` | 정상 판, 통제 분기, 스냅샷·결과. 분류를 명시해 저장 |

```powershell
npm test
node audit.mjs
node cli.mjs help
```

정상 플레이는 명세의 고정 번호 **31001·31002·31003**을 사용하고 성공·실패·탈출·스킵을 모두 남긴다. 도구 검사용 작은 실행은 별도 `smoke` 파일명·분류를 사용한다. 완료하지 않은 판을 완주로, 고정 자동 정책의 출력을 AI가 매번 직접 선택한 시연으로 보고하지 않는다.
