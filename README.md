# Dread-to-Dead: Fears Go Round

짙은 안개가 드리운 판타지 세계를 모험하는 사냥꾼 게임. 동료 11종을 10지점에 배치하고, 매 차례 3d6을 굴려 그중 하나로 동료 한 명을 이동시킨다. 이동 경로에 따라 통과·도착·인접 효과가 이어진다. 맞은편 적 세 명은 개별 체력과 공격 카운터를 갖는다.

**그래픽 MVP 6과 텍스트 MVP 19**는 설정 19의 `text-19-v1.3` 엔진을 공유한다. Node.js 22 이상에서 Windows의 [그래픽 게임 실행](mvp_user_6/play.cmd) 또는 [텍스트 게임 실행](mvp_text_19/play.cmd)을 연다. 막당 18개, 세 막에서 총 54개 지점을 방문한다. [그래픽 실행·조작 안내](mvp_user_6/README.md) · [사용자 설정 6](mvps/mvp-config-user-6.md) · [규칙 설정 19](mvps/mvp-config-19.md)

이전 [그래픽 MVP 5](mvp_user_5/README.md)는 17판 호텔 규칙을 사용하는 프로토타입이다.

기존 [화면 명세](ui/)와 [아트 문서](arts.md)는 이전 그래픽 실험 자료다.

| 문서 | 역할 |
|---|---|
| [rules.md](rules.md) | 설정 18 기준 규칙 |
| [terms.md](terms.md) | 동료·체력·토큰·행·지점·원정 용어 |
| [설정 18](mvps/mvp-config-18.md) · [텍스트 MVP 18](mvp_text_18/README.md) | 주사위 세 개를 적 세 행에 배분하는 실험의 수치·판정과 실행 방법 |
| [그래픽 설정 5](mvps/mvp-config-user-5.md) · [텍스트 설정 17](mvps/mvp-config-17.md) | 이전 그래픽 MVP의 화면·입력 기준과 당시 엔진 판정 |
| [ability_checklist.md](ability_checklist.md) | 괴이 능력·구매·배치의 설계·검토 기준 |
| [undecided.md](undecided.md) | 18판에서 남은 밸런스 검증·후속 콘텐츠·표시 과제 |
| [mvps/mvp.md](mvps/mvp.md) | 현행 검증 계획과 구분된 과거 시연 기록 |
| [mvp_user_3/README.md](mvp_user_3/README.md) | 이전 세로 호텔 프로토타입 실행·조작·검증 기록 |
| [mvp_user_4/README.md](mvp_user_4/README.md) | 후속 실험: 13종 괴이·불안/탐욕/예언·속공·가로 호텔 웹 프로토타입 |
| [mvps/mvp-config-user-4.md](mvps/mvp-config-user-4.md) | user-4 전용 설정·13종 기본/강화 수치·상태와 판정 순서 |
| [mvps/mvp-config-user-3.md](mvps/mvp-config-user-3.md) | user-3 당시의 상점 증설·회복·강화·막 전환 설정 |
| 과거 사용자 설정 [1](mvps/mvp-config-user-1.md) · [2](mvps/mvp-config-user-2.md) | 8전투·블러드 웹을 사용한 이전 실험 조건 |
| [mvps/mvp-config-15.md](mvps/mvp-config-15.md) | user-3 v1.0에서 증설의 실질 이익을 판단한 텍스트 실험 절차 |
| [설정 15 텍스트 실험](mvp_text_15/README.md) | 직접 AI 플레이3판·증설/미증설·재배치·경로 비교와 실질 이익 분석 |
| [mvps/mvp-config-14.md](mvps/mvp-config-14.md) | 과거 비활동 패널티·탈출구·G 도착 충전의 실험 절차와 실행 시 시험안 |
| [mvps/mvp-config-13.md](mvps/mvp-config-13.md) | 공급·수확·수비 도착지 경쟁의 당시 시험안 |
| [mvps/mvp-config-12.md](mvps/mvp-config-12.md) | 괴이 액티브·블러드 웹·초기화 실험의 당시 시험안 |
| 과거 config [9](mvps/mvp-config-9.md) · [10](mvps/mvp-config-10.md) · [11](mvps/mvp-config-11.md) | 이전 규칙의 실험·관찰 절차 |
| 과거 명세 [9·10](mvps/legacy-specs-9-10.md) · [11](mvps/legacy-specs-11.md) | 당시 시험값·판정 보관 |
| [Boardlike](competing_products/boardlike.md) | 보드·경로·주사위 선택 레퍼런스 |
| [Deck of Haunts](competing_products/deck_of_haunts.md) | 공포·공간·방문자 대응 레퍼런스 |
| [Slay the Spire](competing_products/slay_the_spire.md) | 능력·선택·정보 전달 레퍼런스 |
| [Balatro](competing_products/balatro.md) | 조합·연쇄·경제 레퍼런스 |
| [Luck be a Landlord](competing_products/luck_be_a_landlord.md) | 획득·자동 효과·조합 레퍼런스 |
| [Clash Royale](competing_products/clash_royal.md) | 역할·대응·자원 배분 레퍼런스 |
| [Darkest Dungeon](competing_products/darkest_dungeon.md) | 공격·방어·회복의 연결과 괴이별 능력 분배 레퍼런스 |
| [CHANGELOG.md](CHANGELOG.md) | 주요 개정 이력 |

그래픽판의 검증 방법은 [MVP 6 실행 안내](mvp_user_6/README.md)에 있다. 이전 프로토타입의 검사와 플레이 기록은 각 버전의 실행 안내에서 확인한다.
