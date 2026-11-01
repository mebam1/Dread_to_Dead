# Dread-to-Dead: Fears Go Round

엘리베이터로 층을 순환하는 기이한 호텔을 설계하는 경영 게임. 층마다 괴이 하나를 배치하고, 경유 층의 통과 효과와 최종 층의 도착 효과를 연결한다. 손님 처치로 얻은 **영혼**을 상점의 괴이 구매와 호텔 증설에 사용하고, 3막의 경로를 선택해 마지막 보스를 처치한다.

**현재 플레이·규칙 기준은 [mvp_user_3](mvp_user_3/README.md)**다. Windows에서 Node.js 20 이상을 설치한 뒤 [play.cmd](mvp_user_3/play.cmd)를 실행한다. 한 판은 막마다 8개 노드, 총 24개 노드를 방문하며 전투 횟수는 경로에 따라 달라진다. 같은 막에서는 괴이의 파훼 토큰 손상이 이어지고, 1막→2막·2막→3막 전환 시 생존한 배치·보관 괴이의 토큰을 최대치로 복구한다. 파괴된 괴이는 돌아오지 않는다.

| 문서 | 역할 |
|---|---|
| [rules.md](rules.md) | mvp_user_3에서 채택한 현행 판정·수치·진행 규칙 |
| [terms.md](terms.md) | 층·괴이·영혼·공포·직접 사용·모험 용어 |
| [arts.md](arts.md) | 층과 엘리베이터 루프의 표현·정보 전달 원칙 |
| [ability_checklist.md](ability_checklist.md) | 괴이 능력·구매·배치의 설계·검토 기준 |
| [괴이·손님 설계 후보](designs/README.md) | 괴이72종·손님 행동72종·보스12종·조합24종의 사용자 검증용 발상안 |
| [undecided.md](undecided.md) | 채택 완료 항목, 후속 검증·콘텐츠 후보, 구분된 과거 시험값 |
| [mvps/mvp.md](mvps/mvp.md) | 현행 검증 계획과 구분된 과거 시연 기록 |
| [mvp_user_3/README.md](mvp_user_3/README.md) | 현재 웹 프로토타입 실행·조작·검증 범위 |
| [mvps/mvp-config-user-3.md](mvps/mvp-config-user-3.md) | 현행 user-3 설정: 상점 증설·회복·강화·같은 막 손상 이월·새 막 토큰 복구 |
| [모험](ui/adventure.md) · [준비](ui/prepare.md) · [전투](ui/battle.md) | 현행 화면·조작·예고·전체 호텔 표시 명세 |
| 과거 사용자 설정 [1](mvps/mvp-config-user-1.md) · [2](mvps/mvp-config-user-2.md) | 8전투·블러드 웹을 사용한 이전 실험 조건 |
| [mvps/mvp-config-15.md](mvps/mvp-config-15.md) | user-3 v1.0에서 증설의 실질 이익을 판단한 텍스트 실험 절차 |
| [설정 15 텍스트 실험](mvp_text_15/README.md) | 직접 AI 플레이3판·증설/미증설·재배치·경로 비교와 실질 이익 분석 |
| [mvps/mvp-config-14.md](mvps/mvp-config-14.md) | 과거 비활동 패널티·탈출구·G 도착 충전의 실험 절차와 실행 시 시험안 |
| [설정 14 텍스트 MVP](mvp_text_14/README.md) | 보호·충전과 실제 후속 공격의 AI 플레이·통제 비교·개선점 |
| [mvps/mvp-config-13.md](mvps/mvp-config-13.md) | 공급·수확·수비 도착지 경쟁의 당시 시험안 |
| [설정 13 텍스트 MVP](mvp_text_13/README.md) | 도착지 경쟁의 AI 진행 기록·통제 비교 |
| [mvps/mvp-config-12.md](mvps/mvp-config-12.md) | 괴이 액티브·블러드 웹·초기화 실험의 당시 시험안 |
| [설정 12 텍스트 MVP](mvp_text_12/README.md) | 괴이 중심 구현·AI 진행 기록·통제 진단 |
| 과거 config [9](mvps/mvp-config-9.md) · [10](mvps/mvp-config-10.md) · [11](mvps/mvp-config-11.md) | 이전 규칙의 실험·관찰 절차 |
| 과거 명세 [9·10](mvps/legacy-specs-9-10.md) · [11](mvps/legacy-specs-11.md) | 당시 시험값·판정 보관 |
| [설정 11 텍스트 MVP](mvp_text_11/README.md) | 직원·덱을 사용한 과거 구현과 플레이 기록 |
| [Boardlike](competing_products/boardlike.md) | 보드·경로·주사위 선택 레퍼런스 |
| [Deck of Haunts](competing_products/deck_of_haunts.md) | 공포·공간·방문자 대응 레퍼런스 |
| [Slay the Spire](competing_products/slay_the_spire.md) | 능력·선택·정보 전달 레퍼런스 |
| [Balatro](competing_products/balatro.md) | 조합·연쇄·경제 레퍼런스 |
| [Luck be a Landlord](competing_products/luck_be_a_landlord.md) | 획득·자동 효과·조합 레퍼런스 |
| [Clash Royale](competing_products/clash_royal.md) | 역할·대응·자원 배분 레퍼런스 |
| [Darkest Dungeon](competing_products/darkest_dungeon.md) | 공격·방어·회복의 연결과 괴이별 능력 분배 레퍼런스 |
| [CHANGELOG.md](CHANGELOG.md) | 주요 개정 이력 |

2026-11-01 기준 [사용자 설정 3](mvps/mvp-config-user-3.md)과 [핵심 규칙](rules.md)에 현재 실행 규칙 `user-3-v1.1-act-reset`을 채택했다. 설계 후보의 추가 능력과 과거 config의 블러드 웹·공포 재화·8전투 구조는 현행 규칙에 포함되지 않는다. 과거 설정과 플레이 기록은 당시 조건을 보존하며 현재 규칙의 검증 결과로 합산하지 않는다.

현재 경계·오프라인 UI 검사는 88개가 통과했다. 실제 브라우저 시각 검증과 새 막 토큰 복구를 적용한 전체 캠페인 재검증은 남아 있다. 자동 검사·AI 시연은 인간의 재미 검증과 구분한다. 상세 범위는 [프로토타입 검증 기록](mvp_user_3/README.md#검증과-확인-범위)을 따른다.
