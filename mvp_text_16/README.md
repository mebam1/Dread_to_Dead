# user-4 — 텍스트 실험 16

[실험 설정 16](../mvps/mvp-config-16.md) · [사용자 설정 4](../mvps/mvp-config-user-4.md)

실행 규칙은 **text-16-v1.0**이다. 불안·탐욕·예언의 괴이 12종, 개체별 내구·강화, 봉인·화재, 확정 후 리롤·눈 조작을 지원한다. 지도·상점·회복·무료 보상·3막 승패를 연결한 독립 실행기이며 Node.js 20 이상에서 외부 패키지 없이 작동한다.

네 가지 관찰 목표는 **증설, 상점 구매, 무료 보상, 서로 다른 클리어 조합의 가치**다. 정상 직접 플레이 31001·31002·31003은 모두 최종 보스까지 처치했다. 룰렛형과 룬형의 예언 구성은 완주했지만, 불안 엔진을 유지한 최종 클리어는 확인하지 못했다. [직접 플레이와 결과 분석](PLAYTHROUGH.md)에 탈출·파괴·구매 실패와 비교 분기를 함께 기록했다.

## 실행

프로젝트 루트의 PowerShell에서:

```powershell
Set-Location mvp_text_16
node cli.mjs help
node cli.mjs catalog
node cli.mjs --save runs/normal_31001.json new 31001
node cli.mjs --save runs/normal_31001.json map
node cli.mjs --save runs/normal_31001.json visit a1-d1-c1 --reason "첫 전투를 선택한다"
node cli.mjs --save runs/normal_31001.json start --reason "현재 배치로 시작한다"
node cli.mjs --save runs/normal_31001.json roll
node cli.mjs --save runs/normal_31001.json preview
```

공개된 결과를 보고 자리 하나를 선택한다. SLOT·INDEX는 0부터, 호텔 층은 1부터 시작한다.

```powershell
node cli.mjs --save runs/normal_31001.json choose 0 --reason "이 공개 경로의 손실과 공급을 비교해 선택한다"
node cli.mjs --save runs/normal_31001.json move
```

선택 명령에는 --reason 또는 앞선 note가 필요하다. new는 기존 저장을 덮어쓰지 않는다. 기본 저장 경로는 이 디렉터리의 runs/my_game.json이며 --save를 명시하면 현재 터미널 위치를 기준으로 해석한다.

## 실험 기본값

| 항목 | 값 |
|---|---|
| 시작 | 6층·영혼 4·일반 주사위 3개 |
| 시작 개체 | e1 문틈의 시선 1층 / e2 시선의 주인 3층 / e3 룬 문자 벽 5층 / e4 유혹하는 금고 6층 |
| 자원 | 현재 손님에게 불안 0~20, 탐욕 0~2, 예언 0~10. 새 손님은 모두 0 |
| 따개비 | 전투 준비 초기 0회·저장 최대 2회 |
| 수집가 | 전투 준비 초기·최대 1회 |
| 괴이 상태 | 봉인·화재 0~9. 부여 턴을 포함해 턴 종료마다 -1. 새 손님에서 0 |
| 유인 | 전투 준비에 꺼짐, 같은 전투 손님 사이 유지. 봉인 중 발동만 무효 |
| 방어·대리 피격 | 현재 턴만. 대리 수신자를 먼저 정하고 수신자의 방어로 흡수 |
| 발소리 강화 | 현재·최대 토큰 모두 1 증가 |
| 리롤 선택 효과 | 새 굴림 회차의 새 확정마다 한 번. 사마라로 눈만 바꾸면 재실행하지 않음 |

이 값들은 user-4에서 미정이던 연결 규칙을 실험16에 고정한 것이다. 자세한 대상·경계·비활동 판정은 실험 설정을 따른다.

## 모든 액티브는 확정 후

**굴림 → 하나 확정 → 액티브 → 이동**이다. 금고의 유인 켜기·끄기도 같은 시점에 사용한다.

예언가를 사용하면 예언 4(강화 3)를 지불하고 같은 턴의 굴림 단계로 돌아간다. 이후 roll → choose를 다시 실행해야 다른 액티브·이동을 사용할 수 있다. 리롤은 이미 쓴 자원·방어·봉인을 취소하지 않고, 자동 예언·상태 감소·손님 공격·턴 수를 추가 처리하지 않는다.

사마라는 확정한 눈을 1 줄인다. 눈 1에는 사용할 수 없고 강화는 비용 할인이 아니라 공략 한계 14다.

preview의 actions에 예언가를 넣으면 비용과 굴림 복귀까지만 표시한다. 아직 굴리지 않은 눈은 공개하지 않는다. 리롤 이후의 액션을 같은 계획에 넣으면 거절한다.

## 명령

| 명령 | 동작 |
|---|---|
| show / map / catalog | 현재 공개 정보 / 현재 막 지도 / 12종·주사위 효과 |
| visit NODE_ID | 연결된 노드 방문 |
| place ID FLOOR / store ID | 무료 배치·교환·보관 |
| start / roll / choose SLOT / move | 전투 준비·굴림·확정·이동 |
| active ID [TARGET_ID] | 비용·봉인·대상 조건 검사 후 액티브 |
| preview [SLOT] | 현재 공개된 눈과 계획의 실제 경로·피해·상태 예고 |
| play SLOT --actions JSON | 선택·명시한 액티브·이동. 리롤이 마지막 액션이면 굴림 단계에서 멈춤 |
| exit FLOOR | 이동 전 빈층 출구 설치 |
| buy SLOT / expand / leave | 상점 구매·빈층 증설·퇴장 |
| expansion-preview [JSON] | 같은 가상 조건의 층 증가 전후 이동 비교 |
| reward INDEX | 전투 무료 괴이 선택 |
| recover JSON / upgrade ID / recover-skip | 회복 노드의 토큰 배분·강화·스킵 |
| die SLOT / die skip | 주사위 교체·거절 |
| event OPTION [ARG] | die SLOT / souls / buy / sacrifice ID / leave |
| note TEXT / journal [COUNT] | 다음 선택 이유 / 최근 결정 기록 |
| checkpoint LABEL | 현재 상태를 통제 분기의 원본으로 보존 |
| fork CHECKPOINT_FILE | 새 --save에 control 분기 생성 |
| report | 네 목표별 실제 관찰 수치·개체 기여·미확인 사항 |
| give-up | 포기 패배 |

효과의 실제 숫자와 대상 ID는 show·catalog에서 확인한다. 슬롯·개체를 추정해 입력한 불법 명령은 전체를 저장하지 않는다.

## JSON 입력

PowerShell 인용 문제를 줄이려면 표준입력에 명령 객체 하나를 전달한다.

```powershell
@'
{"command":"preview","args":[0],"actions":[{"kind":"active","entityId":"e4"}]}
'@ | node cli.mjs --save runs/normal_31001.json --command-json -
```

위 예시는 e4 금고가 사용 가능한 상태에서 유인을 켰을 때의 공개 경로 예고다. 실제 사용은 active e4를 별도로 실행하거나 play의 actions에 넣는다. 대상형 액티브에는 targetId를 지정한다.

회복 배분은 {"command":"recover","args":[{"e1":1,"e2":1}],"reason":"손상 토큰을 나눈다"}처럼 전달할 수 있다.

## 비교와 기록

상점·보상 확정 전에 checkpoint를 남긴다. fork는 새로운 저장 파일만 사용하며 원본·체크포인트를 변경하지 않는다.

```powershell
node cli.mjs --save runs/normal_31001.json checkpoint before-shop
node cli.mjs --save runs/control_expand.json fork runs/checkpoints/normal_31001-before-shop.json --reason "같은 공개 상태에서 증설 대안을 비교한다"
node cli.mjs --save runs/control_expand.json report
```

- **증설:** 비교 분기에서 실제로 가능한 층 구매·괴이 구매·저축·무료 재배치를 비교한다. expansion-preview는 가상 위치·주사위 자리/면·자원으로 경로만 비교하며 자동 예언·반격·미래 눈을 포함하지 않는다.
- **상점·무료 보상:** 개체마다 origin과 획득 노드가 남는다. 공포·상태 공급·방어 부여·몸의 실제 흡수/피해·수리·리롤·눈 조작·파괴를 추적한다.
- **조합:** report는 주 공포원과 실제 사용 개체를 제시한다. 이름만 다른 구성이나 한 판의 클리어로 조합 다양성을 선언하지 않는다.
- 방어를 부여한 양과 실제 흡수량은 다르다. 흡수는 수신자의 몸에 기록하며 공급자에게 임의로 배분하지 않는다. 몸빵 기록 역시 이익의 인과적 증명은 아니다.
- 원시 저장에는 진행자용 미래 상태가 포함된다. 정상 플레이 판단은 show/map/preview로 공개된 정보만 사용한다. 비교 분기의 사후 판단은 정상 첫 선택과 구분한다.

## 화재 진단

12종에는 정상 화재 부여 수단이 없으므로 새 적 패턴을 임의로 추가하지 않았다. diagnostic 판에서만 diagnostic-status ID fire|seal AMOUNT로 주입할 수 있다. normal·smoke·control에서는 이 명령을 거절한다. 진단 결과를 정상 클리어 기록에 섞지 않는다.

## 확인 범위

```powershell
npm test
```

엔진·CLI 검사 **44개**가 통과했다. 12종·강화, 상태·내구·대리 피격, 확정 후 리롤, 예고 순수성, 경제·출처·회복·승패, 저장·정보 경계·분기를 확인했다. 합성 캠페인은 적 한계를 낮추고 예언을 주입한 경계 검사로 24회 방문·57명 처치·최종 승리 전환을 확인했다.

정상 캠페인 3판과 사후 비교 2건을 별도로 기록했다. 증설 생략·기보유 시설 재배치가 구매를 대체한 사례도 있어 네 목표를 일괄 달성했다고 판정하지 않았다. 세 판은 일반적인 승률 추정 자료가 아니다. 구현 검사·합성 캠페인은 이 정상 플레이 결과와 구분한다.

`node audit-playthroughs.mjs`로 정상 판과 비교 분기의 962개 기록 항목을 재현했으며, 각 단계와 마지막 전체 상태가 일치했다. CLI 입력·저장 검사는 실제 Node 프로세스로 실행했다. [검증 요약](validation/summary.json)과 [플레이 집계](validation/play-summary.json)를 참고한다.

## 파일

- engine.js: 12종 전투·상태·리롤·예고
- campaign.mjs: 로컬에 고정한 3막 지도·경제·회복·보상
- core.mjs / catalog.mjs: 개체·자원·내구·고정 수치
- cli.mjs: 공개 정보 진행·저장·체크포인트·분기
- analysis.mjs: 출처별 기여와 네 목표의 관찰 보고서
- manual.mjs: 직접 지정한 명령 전달·공개 정보 요약
- audit-playthroughs.mjs: 완료된 정상 판과 사후 비교의 기록 재현·집계
- PLAYTHROUGH.md / playthroughs/: 결과 분석·정상 장부·비교 분기·체크포인트
- engine.test.js / cli.test.js: 합성 판정·실제 CLI 프로세스 검사
