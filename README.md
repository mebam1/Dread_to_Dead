# Dread-to-Dead: Fears Go Round

짙은 안개가 드리운 판타지 세계에서 동료를 모아 세 막을 돌파하는 게임. **현재 공통 규칙은 텍스트 MVP 21(`text-21-v1.1`)**을 기준으로 한다. [핵심 규칙](rules.md) · [용어집](terms.md)

한 수에 동료 한 장을 골라 양 끝이 막힌 10칸 전장의 다른 칸으로 옮긴다. 점유된 칸마다 그 동료가 직전 칸으로 밀리고 통과·도착·복사·반응이 이어진다. 그 뒤 살아 있는 적의 카운터가 1 줄고 0이 된 적이 편성 순서대로 행동한다. 주사위와 라운드는 사용하지 않는다.

Node.js 22 이상에서 [텍스트 MVP 21 실행](mvp_text_21/play.cmd)을 열거나 `node mvp_text_21/cli.mjs play`를 실행한다. 기본 판에서 `방문 1`, `시작`을 입력한 뒤 `검토 #C3 8`로 성가대원이 8번까지 가는 결과를 읽고 `이동 #C3 8`로 확정한다. [실행·저장 안내](mvp_text_21/README.md)

| 찾는 내용 | 문서 |
|---|---|
| 처음 시작할 때의 편성, 한 수의 순서, 동료 11종, 적, 상태, 성장·승패 | [핵심 규칙](rules.md) |
| 카운터·밀림·대신 받기·실제 체력 피해 등 화면·기록의 용어 | [공통 용어](terms.md) |
| 설정 21의 이동·카운터 판정과 고정 배치 예시 | [텍스트 설정 21](mvps/mvp-config-21.md) |
| 21판을 화면으로 옮길 때의 드래그·예고 설계 | [그래픽 MVP 8 제작 명세](mvps/mvp-config-user-8.md) |
| 준비 이동의 가치, 직접·자동 플레이 관찰, 미채택 후보 | [미정·검증 항목](undecided.md) · [동료 능력 체크리스트](ability_checklist.md) |
| 재현할 판정과 과거 시연, 개정 이력 | [MVP 검증 계획](mvps/mvp.md) · [개정 이력](CHANGELOG.md) |

## 그래픽판과 이전 실험

**그래픽 MVP 7**에서는 매 차례 굴린 세 주사위가 왼쪽·오른쪽 한 쌍씩 표시된다. 화살표가 붙은 여섯 개 중 하나를 동료에게 끌어 놓으면 원형 전장에서 그 방향으로 이동한다. 적 공격 예고와 동료의 공격·복사·반응, 방어를 거친 체력 피해와 실제 회복량을 확인할 수 있다. Node.js 22 이상에서 Windows의 [그래픽 MVP 7 실행](mvp_user_7/play.cmd)을 연다. [실행·조작 안내](mvp_user_7/README.md) · [사용자 설정 7](mvps/mvp-config-user-7.md) · [규칙 설정 20](mvps/mvp-config-20.md)

이전 [그래픽 MVP 6](mvp_user_6/README.md)과 [텍스트 MVP 19](mvp_text_19/play.cmd)는 설정 19의 `text-19-v1.3` 엔진을 공유한다. [사용자 설정 6](mvps/mvp-config-user-6.md) · [규칙 설정 19](mvps/mvp-config-19.md)

[화면 문서](ui/)와 [아트 문서](arts.md)에는 그래픽 MVP 5의 호텔 화면 기록이 남아 있다. 설정 18과 그 이전 프로토타입의 문서·실행 기록은 [당시 버전의 문서 목록](https://github.com/mebam1/Dread_to_Dead/blob/b7327ebb8a0383af3c11ffc978e6b798fa2548dc/README.md)에서 열 수 있다.

## 설계 참고 자료

아래 조사는 각 문서가 작성된 판에서 참고한 자료다.

| 작품 | 주제 |
|---|---|
| [Boardlike](competing_products/boardlike.md) | 보드·경로·주사위 선택 레퍼런스 |
| [Deck of Haunts](competing_products/deck_of_haunts.md) | 공포·공간·방문자 대응 레퍼런스 |
| [Slay the Spire](competing_products/slay_the_spire.md) | 능력·선택·정보 전달 레퍼런스 |
| [Balatro](competing_products/balatro.md) | 조합·연쇄·경제 레퍼런스 |
| [Luck be a Landlord](competing_products/luck_be_a_landlord.md) | 획득·자동 효과·조합 레퍼런스 |
| [Clash Royale](competing_products/clash_royal.md) | 역할·대응·자원 배분 레퍼런스 |
| [Darkest Dungeon](competing_products/darkest_dungeon.md) | 공격·방어·회복의 연결과 괴이별 능력 분배 레퍼런스 |
| [Wildfrost](competing_products/wildfrost.md) | 전장 배치와 원정 중 빌드 성장 |
