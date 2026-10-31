# Config 14 통제 비교

정상 수동 AI 기록과 분리한 고정 행동 재생 및 공개정보 고정 정책의 후속 비교다.

| C14 기록 | 턴 | 생략된 액티브 턴 수 | 최초 종료 불일치 |
|---|---:|---:|---|
| control_C14_14001_service0.json | 8 | 0 | None |
| control_C14_14001_service1.json | 8 | 2 | {'reason': 'first_guest_or_service_end_mismatch', 'guest': 'V4', 'turn': 4, 'normal_phase': 'visitor_end', 'control_phase': 'turn_ready'} |
| control_C14_14002_service0.json | 7 | 1 | None |
| control_C14_14002_service1.json | 7 | 0 | None |
| control_C14_14003_service0.json | 5 | 0 | None |
| control_C14_14003_service1.json | 10 | 0 | None |

## D3_kill_or_charge

상태: observed
- [control_D3_immediate_kill.json](control_D3_immediate_kill.json): 9턴, 처치2, 종료 complete, P {'U01': 1, 'G01': 1, 'Q01': 2, 'Q02': 1, 'B01': 1}, G 0
- [control_D3_charge_first.json](control_D3_charge_first.json): 10턴, 처치2, 종료 complete, P {'U01': 1, 'G01': 1, 'Q01': 2, 'Q02': 1, 'B01': 1}, G 0
- [control_D3_charge_bank.json](control_D3_charge_bank.json): 9턴, 처치2, 종료 complete, P {'U01': 2, 'G01': 0, 'Q01': 2, 'Q02': 1, 'B01': 1}, G 0

## D3_near_penalty

상태: not_observed

## D4_escape

상태: observed
- [control_D4_continue.json](control_D4_continue.json): 4턴, 처치1, 종료 management, P {'U01': 2, 'G01': 1, 'Q01': 2, 'Q02': 2, 'B01': 1}, G 0
- [control_D4_open_exit.json](control_D4_open_exit.json): 1턴, 처치0, 종료 management, P {'U01': 2, 'G01': 2, 'Q01': 2, 'Q02': 2, 'B01': 1}, G 2

## B_early_spend_alternative

상태: observed
- [control_B_rescue_then_policy.json](control_B_rescue_then_policy.json): 3턴, 처치1, 종료 complete, P {'U01': 2, 'G01': 2, 'Q01': 2, 'Q02': 2, 'B01': 1}, G 1
- [control_B_early_spend_M14_then_policy.json](control_B_early_spend_M14_then_policy.json): 4턴, 처치1, 종료 complete, P {'U01': 2, 'G01': 2, 'Q01': 2, 'Q02': 2, 'B01': 0}, G 0
- [control_B_early_spend_C14_then_policy.json](control_B_early_spend_C14_then_policy.json): 6턴, 처치1, 종료 complete, P {'U01': 1, 'G01': 2, 'Q01': 2, 'Q02': 2, 'B01': 0}, G 0

## 빈층과 추가 Q

[독립 통제](control_D4_space.json): 빈층이면 전멸 후에도 출구 설치·접촉 가능. Q03이 점유하면 P0이어도 설치 불가.
가득 찬 배치에서 전멸한 뒤 강제 눈으로24턴을 실제 진행했다. 공포·심장·불안은 변하지 않았고, 대상 없는 패널티11회도 상태를 바꾸지 못했다. 관찰 상한으로 중단했으며 게임상 자동 패배로 처리한 것이 아니다.

정책은 한 턴의 공포·불안·P·잔량과 랜덤 패널티 평균 비용을 고정 가중치로 평가한다. 미래 실제 눈을 읽지 않으며 전체 최적 전략·인간 선호를 입증하지 않는다.
