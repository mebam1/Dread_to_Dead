# Dread-to-Dead — 동료 능력 설계 체크리스트

텍스트 MVP 21 · `text-21-v1.1` · 2026-11-08. 한 동료를 직접 옮길 때, 그 동료가 밀릴 때, 그 자리에 남아 다음 수를 맞을 때를 구분해 능력을 검토한다. [동료 11종의 실행 효과](rules.md#creatures) · [발동과 체력 용어](terms.md) · [후속 설계 후보](undecided.md#u-ability)

## 이동과 연계

| 볼 항목 | 확인할 장면 |
|---|---|
| 발동 주체 | 중간에 놓인 살포대원은 밀리기 전 자리에서 가스를 설치한다. 목적지에 놓인 살포대원은 밀리기만 한다. 두 이동을 나란히 검토해 어느 카드의 효과인지 읽을 수 있는가? |
| 도착과 반응 | 시종은 자기 정면에 복사 공격을 하고, 성가대원은 원래 도착한 동료의 정면에 반응한다. 같은 효과가 융합체에 있을 때도 원본 A와 그 반응 뒤에 B가 실행되는가? |
| 이웃의 변화 | 출발 때의 이웃과 밀림 뒤의 이웃 중 누구에게 실제로 효과가 닿는가? 1·10번 경계나 추기경 양끝의 점유가 바뀌면 보호·회복·반응 대상도 바뀌는가? |
| 한 수의 기회비용 | 지금 공격수를 움직이면 카운터 1인 적을 처치할 수 있는가? 지원 동료를 먼저 움직였다면 다음 수에 실제로 추가된 반응, 막은 반격, 보존한 동료 체력을 확인할 수 있는가? |
| 적의 순서 | 같은 수에 적 둘이 행동하면 앞선 적이 바꾼 배치에서 뒤 적이 표적을 고르는가? 경로형의 벽 반사·재방문, 치유형의 이동 후 이웃도 이 순서로 예측할 수 있는가? |

## 비용·생존·성장

| 볼 항목 | 확인할 장면 |
|---|---|
| 재충전 | 성기사의 한도와 방어, 독 치료사의 속공이 전투 시작과 매 3회 이동 정산 뒤에 준비되는지 본다. 적이 이번 수에 공격하면 기존 방어와 한도 중 얼마를 쓸 수 있는가? |
| 실제 수치 | 타격 위력, 대신 받은 양, 흡수량, 실제 체력 감소를 구별한다. 회복량은 대상의 최대 체력까지 계산하며 독·탈진의 정산으로 다음 입력 전에 달라질 결과도 포함한다. |
| 융합·영입 비용 | 두 기능을 A의 자리에 모으면서 B의 몸과 자리를 잃는다. 강화·공유 자원·원본별 한도를 적용한 뒤에도 별도 동료로 둘 때와 다른 선택을 만드는가? |
| 전투 뒤 지속성 | 생존자는 시작 칸으로 돌아오고 현재 체력은 이월된다. 전투 중 회복, 회복 노드, 만피 동료 교체 중 무엇이 다음 전투의 편성을 바꿨는가? |

검토 기록에는 **판 번호·전투 지점·행동 번호**, 처음 배치와 적 카운터, 비교한 두 이동 순서, 두 번째 수까지의 실제 HP·처치·반응을 남긴다. 미리보기에서 읽은 값과 실제 확정 결과, 사람의 선택과 자동 선택을 구분한다. 새 능력을 시험할 때는 해당 후보의 효과를 별도로 적는다.

## 과거 융합 연구 참고

> 과거 융합 체계를 검토할 때 수집한 외부 작품의 사실 기록이다. 아래 사례는 당시 호텔 프로토타입에서 살펴본 융합 아이디어다. 21판의 융합 판정은 [핵심 규칙](rules.md#fusion)에 있다.

**기존 자료 확인일: 2026-10-29.** 이번 압축에서는 재조사하지 않았다. Plants vs. Zombies Fusion은 팬 제작 게임이며 BWIKI의 버전·번역·수치 차이가 있을 수 있다. 유희왕은 공식 카드 DB를 참조했다. 아래는 직접 플레이나 전체 예외·성능 검증이 아니며, 외형·세부 수치 대신 **대상과 변환 관계**를 참고한다. 당시에는 두 재료가 만드는 새로운 관계를 검토했다.

| 사례·원래 능력 | 자료에 기록된 융합 효과 | 과거 연구의 해석 |
|---|---|---|
| **Fume-shroom + Torchwood → Blowtorch-shroom** (火炬大喷菇): 관통 공격 + 탄환 강화.[^fume][^torch] | 직접 공격하지 않고 지나가는 완두콩 탄환을 흡수해 그 피해 기반의 관통 화염으로 전환. 출력 상한이 있다.[^blowtorch] | 타 능력의 처리 대상이 공격 연료가 되어 공급 위치·양을 바꾼다. |
| **Magnet-shroom + Hypno-shroom → Hypno-magnet** (魅惑磁力菇): 금속 장비 제거 + 자신을 먹는 적의 아군화.[^magnet][^hypno] | 금속을 소비해 대응하는 최면 아군 좀비를 생성하며 수동·다른 금속 유닛의 자동 공급 경로가 있다. 결과 유닛의 전체 기능을 요약한 것은 아니다.[^hypno-magnet] | 제거 대상 자체가 새 존재의 재료로 바뀐다. |
| **Chomper + Hypno-shroom → Hypno Chomper** (魅惑大嘴花): 적을 먹음 + 먹히면 최면.[^chomper][^hypno] | 최면 아군을 먹어 Hypno-shroom 배치 카드를 회수한다. 피격 시 별도 최면·퇴화 효과는 이 해석의 대상이 아니다.[^hypno-chomper] | 공유 사건의 대상·결과를 뒤집는다. 아군 소비·처리가 있어 무상 무한 생산이 아니다. |
| **Sunflower + Magnet-shroom → Solar Magnet** (阳光磁力菇; 앞선 명칭 Magnet-flower): 태양 생산 + 금속 취급.[^sunflower][^magnet] | 태양·금속을 생산하고 금속을 태양으로 전환하며 앞쪽 특정 소비 유닛에 전달한다. 당시 도감 검색 결과의 설명을 참고했다.[^solar-magnet] | 같은 금속이 생산물·수익·다른 능력의 투입물이 된다. 경제 연결만으로 공포 사건까지 완성되지는 않는다. |
| **나츄르 비스트 + 나츄르 팔키온 → 나츄르 엑스트리오**: 덱 2장을 묘지로 보내 마법 무효·파괴 + 묘지 2장을 제외해 함정 무효·파괴.[^naturia-beast][^naturia-barkion] | 엑스트리오는 묘지 1장 제외·덱 1장 묘지 전송 비용으로 마법/함정 발동에 대응. 효과 처리에는 앞면 표시 존재 조건이 있다.[^naturia-exterio] | 대상 병합보다 소비·보충 비용의 결합을 본다. 정상 처리 시 묘지 수는 순감소하지 않지만 최초 묘지 카드와 덱 소모가 필요하다. 비용의 정교함과 괴이의 정체성은 별도다. |

[^fume]: BWIKI [大喷菇](https://wiki.biligame.com/pvzrh/大喷菇).
[^torch]: BWIKI [火炬树桩](https://wiki.biligame.com/pvzrh/火炬树桩).
[^blowtorch]: BWIKI [火炬大喷菇](https://wiki.biligame.com/pvzrh/火炬大喷菇). 팬 제작판 구분: [简介](https://wiki.biligame.com/pvzrh/简介).
[^magnet]: BWIKI [磁力菇](https://wiki.biligame.com/pvzrh/磁力菇).
[^hypno]: BWIKI [魅惑菇](https://wiki.biligame.com/pvzrh/魅惑菇).
[^hypno-magnet]: BWIKI [魅惑磁力菇](https://wiki.biligame.com/pvzrh/魅惑磁力菇).
[^chomper]: BWIKI [大嘴花](https://wiki.biligame.com/pvzrh/大嘴花).
[^hypno-chomper]: BWIKI [魅惑大嘴花](https://wiki.biligame.com/pvzrh/魅惑大嘴花). 세부 소화 시간은 설명 차이 때문에 수치로 채택하지 않았다.
[^sunflower]: BWIKI [向日葵](https://wiki.biligame.com/pvzrh/向日葵).
[^solar-magnet]: BWIKI [阳光磁力菇](https://wiki.biligame.com/pvzrh/阳光磁力菇).
[^naturia-beast]: 유희왕 공식 DB [나츄르 비스트](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=7969&ope=2&request_locale=ko).
[^naturia-barkion]: 유희왕 공식 DB [나츄르 팔키온](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=8260&ope=2&request_locale=ko).
[^naturia-exterio]: 유희왕 공식 DB [나츄르 엑스트리오](https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=8727&ope=2&request_locale=ko).
