# Dread-to-Dead: Fears Go Round

10층을 순환하는 기이한 호텔에 괴이를 배치하는 경영 게임. 3막의 모험 지도에서 경로를 고르고, 손님이 지나는 층의 통과 효과와 마지막 층의 도착 효과를 연결한다. 손님 처치로 얻은 **영혼**으로 새 괴이를 구매하고, 융합 노드에서는 두 괴이의 본 효과를 한 층에 합친다.

**현재 플레이 버전은 그래픽 MVP 5이며 전투와 캠페인은 17판 엔진을 사용한다.** Windows에서 Node.js 20 이상을 설치한 뒤 [게임 실행](mvp_user_5/play.cmd)을 연다. 첫 화면은 현재 막의 모험 지도다. **호텔 보기**나 전투 준비·전투에 들어가면 위쪽 손님 카드 열 장과 아래쪽 괴이 카드 열 장이 나타난다. 한 판은 막마다 8개 노드, 총 24개 노드를 방문한다. [실행·조작 안내](mvp_user_5/README.md)

프로젝트의 메인 화면 명세는 [모험 지도와 노드](ui/adventure.md), [호텔 보기와 전투 준비](ui/prepare.md), [전투 UI](ui/battle.md)로 나뉜다. 카드·토큰·스티커의 모양과 연출은 [아트 문서](arts.md)에 정리한다.

| 문서 | 역할 |
|---|---|
| [rules.md](rules.md) | 공통 공식 룰. 그래픽 MVP 5의 버전별 수치와 예외는 17판 설정에 수록 |
| [terms.md](terms.md) | 층·괴이·영혼·공포·직접 사용·모험 용어 |
| [그래픽 설정 5](mvps/mvp-config-user-5.md) · [텍스트 설정 17](mvps/mvp-config-17.md) | 현재 그래픽 MVP의 화면·입력 기준과 엔진의 게임 판정 |
| [ability_checklist.md](ability_checklist.md) | 괴이 능력·구매·배치의 설계·검토 기준 |
| [괴이·손님 설계 후보](designs/README.md) | 괴이72종·손님 행동72종·보스12종·조합24종의 사용자 검증용 발상안 |
| [undecided.md](undecided.md) | 채택 완료 항목, 후속 검증·콘텐츠 후보, 구분된 과거 시험값 |
| [mvps/mvp.md](mvps/mvp.md) | 현행 검증 계획과 구분된 과거 시연 기록 |
| [mvp_user_3/README.md](mvp_user_3/README.md) | 이전 세로 호텔 프로토타입 실행·조작·검증 기록 |
| [mvp_user_4/README.md](mvp_user_4/README.md) | 후속 실험: 13종 괴이·불안/탐욕/예언·속공·가로 호텔 웹 프로토타입 |
| [mvps/mvp-config-user-4.md](mvps/mvp-config-user-4.md) | user-4 전용 설정·13종 기본/강화 수치·상태와 판정 순서 |
| [mvps/mvp-config-user-3.md](mvps/mvp-config-user-3.md) | user-3 당시의 상점 증설·회복·강화·막 전환 설정 |
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

현재 버전의 검증 방법은 [그래픽 MVP 5 실행 안내](mvp_user_5/README.md#검증)에 있다. 이전 웹 프로토타입의 검사와 플레이 기록은 각 버전의 실행 안내에서 확인한다.
