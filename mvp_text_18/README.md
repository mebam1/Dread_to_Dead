# 텍스트 MVP 18

[설정 18](../mvps/mvp-config-18.md) `text-18-v1.5`의 독립 실행 구현이다. 외부 패키지 설치 없이 Node.js 22 이상으로 실행한다. 이전 텍스트·그래픽 엔진을 참조하지 않는다.

## 실행

Windows에서는 `play.cmd`를 열거나 이 폴더에서 다음을 실행한다.

```powershell
node cli.mjs play
```

기본 저장은 `runs/my_game.json`이다. 종료 후 같은 명령으로 이어간다. 새 시드는 새 저장 경로와 함께 지정한다.

```powershell
node cli.mjs --save runs/new-31002.json play 31002
```

대화형에서는 명령 뒤 선택 이유를 묻는다. `quit`은 대화만 종료하고, `give-up`은 원정을 패배로 끝낸다. 단일 명령 모드는 JSON을 출력하며 진행 명령에 `--reason`을 지정한다.

```powershell
node cli.mjs --save runs/example.json new 31001
node cli.mjs --save runs/example.json visit 2 --reason "다음 경로 선택지를 유지"
node cli.mjs --save runs/example.json start --reason "기본 배치로 전투"
node cli.mjs --save runs/example.json preview
node cli.mjs --save runs/example.json choose 3 --reason "지원형부터 처치"
node cli.mjs --save runs/example.json move --reason "전체 행 결과 확인 후 실행"
```

## 조작

| 단계 | 명령 |
|---|---|
| 지도 | `map`, `visit 노드번호/ID` |
| 전투 전 | `swap 지점 지점`, `start` |
| 굴림 후 | `preview [배분번호]`, `choose 1~6` 또는 `assign 아래D번호 가운데D번호 위D번호` |
| 배분 확정 후 | `active 동료ID A/B 대상ID`, `exit 빈지점`, `preview`, `move` |
| 전투 보상 | `reward 후보번호` 또는 `skip` |
| 새 동료 배치 | `place 지점` 또는 `discard`. 빈칸이 있을 때는 교체할 수 없음 |
| 상점 | `buy 상품번호`, 배치 결정 후 다음 구매, `leave` |
| 강화 | `upgrade 동료ID` 또는 `skip` |
| 융합 | `preview-fusion A_ID B_ID`, `fuse A_ID B_ID` 또는 `skip` |
| 조회 | `show`, `catalog`, `journal [개수]`, `report`, `help` |
| 비교 분기 | `fork 새파일`. 원본을 유지하고 `control`로 표시한 저장 생성 |

배분 번호는 **1=[1,2,3], 2=[1,3,2], 3=[2,1,3], 4=[2,3,1], 5=[3,1,2], 6=[3,2,1]**이다. 배열 순서는 아래·가운데·위, 숫자는 주사위의 눈이 아닌 D1·D2·D3의 ID다. 빈 행에도 주사위를 배분한다.

동료와 주사위·후보·슬롯·지점 번호는 1부터다. JSON의 내부 적 `rows`는 0=아래, 1=가운데, 2=위이며 가스 배열은 0=동료, 1~3=적 행이다. 일반 재배치는 지도·전투 전·상점·융합·강화에서만 가능하다.

## 미리보기와 기록

미리보기는 세 행과 공통 종료를 함께 처리한다. 신성사제·비활동 표적 같은 무작위는 실제 난수를 읽지 않고 조건별 결과로 표시한다. 최대 64개 결과이며 `complete:false`면 일부 분기만 표시한 것이다. 다음 라운드 굴림·미방문 상점·미확정 보상은 공개하지 않는다. 미리보기는 저장과 난수 회차를 바꾸지 않는다.

진행은 저장 잠금과 파일 교체를 사용한다. 불법 명령은 상태·재화·토큰·난수를 바꾸지 않는다. 구판 저장은 가져오지 않는다. 원정 저장에는 재현용 난수 장부가 있으므로 플레이 결정에는 `show`·`map`·`preview`의 공개 정보만 사용한다.

현재 체력은 전투·막 사이 유지하고 모든 상태는 종료 뒤 초기화한다. 15라운드는 밸런스 목표이므로 넘겨도 자동 패배하지 않는다. 일반·엘리트 철수는 이미 얻은 처치 재화를 유지하며 완승 동료 보상 없이 끝난다. 보스 철수는 원정 패배다. 남은 모든 동료가 죽으면 원정 패배다.

## 검증

```powershell
node --test
node verify-campaign.mjs
node validation/placement-control.mjs
node verify-manual.mjs
node analyze-results.mjs
```

회귀 검사는 종료 순서·분노·융합·가스·반응·경제·저장·미리보기 등을 확인한다. `verify-campaign.mjs`는 공개 정보만 쓰는 자동 정책 6원정과 별도 표시한 후반 통제 2전투를 실행한다. 직접 선택한 CLI 진행과 자동 정책, 전투 승리를 가정하는 캠페인 산술 검사는 구분한다. `validation`의 자동 산출물은 재실행하면 갱신된다. 결과와 한계는 [ANALYSIS.md](ANALYSIS.md)에 기록한다.

`manual-step.mjs`는 직접 선택한 명령을 CLI에 전달하고 공개 상태·미리보기만 짧게 출력하는 검증 도구다. 자체적으로 배분이나 경로를 고르지 않는다.
