# Dread-to-Dead · 텍스트 플레이 17

10층 호텔을 운영해 세 막의 보스를 처치한다. 융합 노드에서는 괴이 둘을 하나로 합치고, 새 괴이를 얻을 때는 그 자리에서 배치·교체·폐기를 결정한다. 승패와 턴 판정은 [설정 17](../mvps/mvp-config-17.md)을 따른다. Node.js 20 이상이면 패키지 설치 없이 실행할 수 있다.

## 바로 시작하기

Windows에서는 이 폴더의 `play.cmd`를 더블클릭한다. 터미널에서는 저장소 루트의 PowerShell에서 다음 두 줄을 실행한다.

```powershell
Set-Location mvp_text_17
npm start
```

첫 실행은 판 번호 31001로 시작한다. 이후 같은 명령을 실행하면 마지막으로 확정한 결정에서 이어진다. 기본 저장은 이 디렉터리의 `runs/my_game.json`이다. 다른 판은 `node cli.mjs --save runs/second.json play 31002`로 시작한다.

아래는 첫 주사위를 고르기까지의 입력 예다. 명령 뒤에 이유를 쓰거나, 명령만 입력한 다음 한 줄로 이유를 답한다. 이유를 묻는 자리에서 빈 줄을 입력하면 취소된다.

```text
map
visit 1 --reason 첫 손님의 공격 위치를 보고 선택했다
start --reason 문틈과 시선의 주인을 이 배치로 시험한다
preview
choose 2 --reason 두 번째 주사위의 경로를 선택한다
preview
move --reason 예고된 경로로 이동한다
```

`preview`는 선택 전에는 세 경로를, 선택 후에는 현재 속공·출구를 반영한 경로를 보여준다. `help`에는 현재 단계의 명령이 나온다. `quit`는 저장을 남기고 대화를 닫는다. `exit 층`은 전투에서 사용하는 탈출구 설치 명령이다.

## 진행 명령

주사위 자리·후보·상품·층·방문 가능 노드 번호는 **1부터** 센다. 괴이 ID는 호텔에 표시된 `e1` 같은 값을 쓴다.

| 상황 | 입력과 판정 |
|---|---|
| 현재 정보 확인 | `show` 상세 호텔·전투·제시물, `map` 공개 지도와 손님 수치, `catalog` 괴이 15종의 본 효과·강화와 주사위 4종, `journal [개수]` 최근 기록, `report` 막별 구매력·보상·융합·후속 전투 기여 |
| 지도·배치 | `visit 1` 또는 `visit 1-1-중`. 정비 중 `swap 1 2`로 이동·교환. 준비를 끝낼 때 `start` |
| 전투 | `choose 자리` → 필요하면 `active ID base [대상ID]`(일반 괴이 또는 융합 원본 A의 속공), `active ID donor [대상ID]`(원본 B의 속공), `exit 빈층`(출구 설치) → `move`. 주사위는 새 턴·재굴림에 자동 공개 |
| 보상·획득 | `reward 후보번호`로 하나 선택한 뒤 `place 층` 또는 `discard`. 만실에서 `place`하면 그 층의 기존 괴이를 폐기하고 새 괴이를 놓음 |
| 융합 | `preview-fusion A_ID B_ID`는 지도와 융합 노드에서 비교 가능. 해당 노드에서 `fuse A_ID B_ID`로 확정하거나 `skip`. A의 층·내구에 두 원본의 본 효과(각각의 효과 강화 포함)를 결합 |
| 상점 | `buy 슬롯` → 획득 처분 → 상점 복귀. `leave`로 방문 종료 |
| 회복 | `heal ID [ID]`로 토큰 1~2개 배분. 같은 ID를 두 번 지정 가능. `upgrade ID`로 한 개체 강화 또는 `skip` |
| 이벤트 | 짐은 `equip 자리` 또는 `cash`, 봉인된 객실은 `deal`, 계약은 `contract ID`. 모두 `skip` 가능 |
| 엘리트 주사위 | 괴이 보상 처분 후 `equip 자리` 또는 `skip` |
| 중단·분기 | `give-up`은 판 포기. `fork 새파일`은 현재 결정까지의 사본을 비교 분기로 저장한다. 분기 뒤에도 현재 대화는 원본에서 계속된다. |

## 에이전트용 단일 명령

각 호출은 동일한 저장에 한 결정을 확정하거나 공개 정보 하나를 읽는다. 조회와 예상은 난수를 소비하지 않는다. 출력은 JSON이며 `help`는 일반 텍스트다. 실패 시 종료 코드는 1이다.

```powershell
$run17 = 'runs/normal_31001.json'
node cli.mjs --save $run17 new 31001
node cli.mjs --save $run17 map
node cli.mjs --save $run17 visit 1 --reason "첫 전투"
node cli.mjs --save $run17 start --reason "초기 배치로 시작"
node cli.mjs --save $run17 preview 2
node cli.mjs --save $run17 choose 2 --reason "두 번째 경로 선택"
node cli.mjs --save $run17 move --reason "속공 없이 진행"
node cli.mjs --save $run17 report
node cli.mjs --save $run17 fork runs/control_31001.json
```

원본 분류는 `normal`, 비교 분류는 `control`이다. 비교 분기를 진행하려면 새 파일을 `--save`로 지정한다. 기존 파일에 대한 `new`·`fork`는 거절된다. 플레이어는 공개 명령으로 정보를 읽고, 진행자 저장에는 손대지 않는다.

기록 도중 다른 명령이 같은 저장을 사용하면 끝난 뒤 다시 시도한다. 비정상 종료로 `.lock` 파일이 남은 경우에는 그 안의 PID가 이미 종료됐는지 확인한 다음 해당 잠금 파일만 제거한다. Windows에서 이름 교체가 제한되면 진행기가 완전히 작성된 `.next` 파일을 `.commit` 표시로 확정한다. 다음 기록 시 자동으로 주 파일에 반영하므로 두 파일은 함께 보존한다.

## 검증

```powershell
npm test
npm run verify
```

첫 명령은 판정과 저장·이어하기·예고·분기 검사를 실행한다. 두 번째 명령은 공개 정보만 읽는 고정 정책으로 지정 판 번호를 끝까지 진행해 방문 수·승패·융합·구매 수를 출력한다. 두 원본의 본 효과를 합치는 v1.1 규칙에서 31001과 31002는 24회 방문 후 승리했고, 31003은 23회 방문 후 전멸했다.
