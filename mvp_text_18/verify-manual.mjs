import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createGame,execute,publicView,report} from './engine.mjs';
const dir=fileURLToPath(new URL('./validation/',import.meta.url));
const source=fileURLToPath(new URL('./runs/manual-31001.json',import.meta.url));
const saved=JSON.parse(fs.readFileSync(source,'utf8'));
const decisions=saved.state.journal.filter(e=>e.type==='decision');
const replay=createGame(saved.state.seed);
for(const d of decisions) execute(replay,d.command,d.args,d.reason);
assert.deepEqual(publicView(replay),publicView(saved.state));
assert.deepEqual(replay.rng,saved.state.rng);
assert.deepEqual(replay.stats,saved.state.stats);
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'manual-replayed.save.json',JSON.stringify({...saved,validation:{source:'direct CLI decisions replayed without changing choices'},state:replay})+'\n');
const summary={classification:'direct manual CLI play, partial expedition checkpoint',seed:replay.seed,decisions:decisions.length,...report(replay),replayMatches:true};
fs.writeFileSync(dir+'manual-summary.json',JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(dir+'manual-decisions.jsonl',decisions.map(d=>JSON.stringify({node:d.node,round:d.round,command:d.command,args:d.args,reason:d.reason})).join('\n')+'\n');
const battles=replay.stats.battles;
const lines=['# 직접 선택한 CLI 플레이 기록','',
  '시드 31001. 미공개 저장/RNG를 읽어 선택하지 않고 `show`·`preview`로 판단했다. `manual-step.mjs`는 입력한 명령을 실행하고 공개 결과를 줄여 보여줄 뿐 선택을 자동화하지 않는다. 세 전투·첫 회복·첫 상점까지 직접 진행했으며 원정 완주 사례로 집계하지 않는다. 이후 정상 원정 전체는 별도 자동 정책으로 검증했다.','',
  '| 전투 | 결과 | 라운드 | 처치 | 동료 상실 | 적 HP 피해 | 동료 HP 피해 | 전투 회복 |','|---|---|---:|---:|---:|---:|---:|---:|',
  ...battles.map(b=>`| ${b.node} | ${b.outcome} | ${b.rounds} | ${b.kills} | ${b.companionLosses} | ${b.hpDamageDealt} | ${b.hpDamageTaken} | ${b.healing} |`),'',
  '첫 전투는 기본 배치로 시작했다. 2라운드의 [2,1,3]은 A를 처치하지만 성기사가 사망하므로 [2,3,1]을 선택했다. 이후 공격 기회가 드문 상황에서 6라운드는 성기사 상실을 감수하고 A를 처치했다. 마지막 C는 10라운드에 처리했다.','',
  '두 번째 전투는 성가대원을 중앙에 놓고 AAB 경로를 선택해 4라운드에 상실 없이 이겼다. 배치뿐 아니라 편성·굴림이 다르므로 첫 전투와의 차이를 배치 효과만으로 해석하지 않는다. 같은 조건의 배치 효과는 placement-control.md에서 따로 비교했다.','',
  '회복 노드는 성녀 3/4→4/4, 성기사 3/6→6/6을 방문 즉시 처리했다. 세 번째 전투는 살포요원을 1번에 두었다. 앞 행의 통과가 뒤 행의 독으로 이어졌으며 마지막 A는 성가대원 반응과 종료 독으로 처치했다. 5라운드, 동료 상실 0이었다.','',
  '상점에서 전투사제 1명을 6재화에 구매해 3재화가 남았다. 기존 성기사 3/6·살포요원 2/3은 회복되지 않았다. 현재 저장은 1막 깊이 5 완료, 동료 6명이며 다음 전투부터 이어갈 수 있다.','',
  `총 ${decisions.length}개 직접 결정과 19라운드를 현재 최종 엔진으로 재생해 공개 상태·난수 회차·통계가 일치함을 확인했다. 개발 중 보강된 이벤트 이름/중단행 로그는 재생본에 남겼으며 원래 직접 진행 저장도 보존했다.`, '',
  '## 재생·이어하기','',
  '```powershell','node verify-manual.mjs','node cli.mjs --save runs/manual-31001.json play','```','',
  '원본: `../runs/manual-31001.json`. 최종 엔진 재생본: `manual-replayed.save.json`. 선택 이유 전체: `manual-decisions.jsonl`. 직접 판단 시간과 다른 구현 작업 시간이 섞여 있어 사람 플레이 소요 시간으로 측정하지 않았다.',''];
fs.writeFileSync(dir+'manual-report.md',lines.join('\n'));
console.log(JSON.stringify({decisions:decisions.length,battles:battles.length,rounds:summary.rounds,replayMatches:true}));
