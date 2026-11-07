import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, execute, PERMUTATIONS, previewBattle, RULE_VERSION } from '../engine.mjs';

// A first-round control experiment, not a campaign or a prediction of future rolls.
// Each layout receives every equally likely ordered D1/D2/D3 outcome exactly once.
const LAYOUTS = [
  { id: 'default', name: '성녀 1 / 성기사 2 / 성가대원 3', positions: { saint: 1, paladin: 2, choir: 3 } },
  { id: 'choir_center', name: '성녀 1 / 성가대원 2 / 성기사 3', positions: { saint: 1, choir: 2, paladin: 3 } },
];

function fixture(layout) {
  const state = createGame(31001);
  execute(state, 'visit', ['1-1-중'], '통제: 동일 ABC 첫 전투에서 시작 배치만 비교');
  assert.deepEqual(state.node.enemies.map(e => e.type), ['A', 'B', 'C']);
  const companions = state.floors.filter(Boolean);
  state.floors.fill(null);
  for (const companion of companions) state.floors[layout.positions[companion.type] - 1] = companion;
  execute(state, 'start', [], '통제: 새 최대 체력 동료로 첫 라운드 시작');
  return state;
}

function metrics(state, scenario) {
  const initialAllyHp = state.floors.filter(Boolean).reduce((sum, e) => sum + e.hp, 0);
  const allyHp = scenario.allies.reduce((sum, e) => sum + e.hp, 0);
  const events = scenario.events;
  const damage = events.filter(e => e.type === 'damage');
  return {
    companionDeaths: state.floors.filter(Boolean).length - scenario.allies.length,
    enemyKills: scenario.enemies.filter(e => e.hp <= 0).length,
    enemyHpLoss: damage.filter(e => e.side === 'enemy').reduce((sum, e) => sum + e.hpLoss, 0),
    allyHp,
    allyNetHpLoss: initialAllyHp - allyHp,
    allyDamageTaken: damage.filter(e => e.side === 'ally').reduce((sum, e) => sum + e.hpLoss, 0),
    actualHealing: events.filter(e => e.type === 'heal').reduce((sum, e) => sum + e.amount, 0),
    allyDamageAbsorbed: damage.filter(e => e.side === 'ally').reduce((sum, e) => sum + e.absorbed, 0),
    damageRedirected: events.filter(e => e.type === 'redirect').reduce((sum, e) => sum + e.amount, 0),
    enemyProtectionAbsorbed: damage.filter(e => e.side === 'enemy').reduce((sum, e) => sum + e.absorbed, 0),
    outcome: scenario.outcome ?? 'continued',
  };
}

// Lexicographic, fixed before evaluating any roll. A lower choice breaks exact ties.
function compare(a, b) {
  return a.companionDeaths - b.companionDeaths
    || b.enemyKills - a.enemyKills
    || b.enemyHpLoss - a.enemyHpLoss
    || b.allyHp - a.allyHp
    || a.choice - b.choice;
}

function dominates(a, b) {
  const weak = a.companionDeaths <= b.companionDeaths && a.enemyKills >= b.enemyKills
    && a.enemyHpLoss >= b.enemyHpLoss && a.allyHp >= b.allyHp;
  const strict = a.companionDeaths < b.companionDeaths || a.enemyKills > b.enemyKills
    || a.enemyHpLoss > b.enemyHpLoss || a.allyHp > b.allyHp;
  return weak && strict;
}

function evaluate(state, dice) {
  // The actual seeded roll is discarded. No future random result is consulted.
  state.battle.dice = [...dice];
  const before = JSON.stringify(state);
  const alternatives = PERMUTATIONS.map((assignment, index) => {
    const preview = previewBattle(state, assignment);
    assert.equal(preview.complete, true, 'The control requires complete previews.');
    assert.equal(preview.scenarios.length, 1, 'The starter layout must have a deterministic first-round result.');
    const scenario = preview.scenarios[0];
    return { choice: index + 1, assignment, assignedValues: assignment.map(d => dice[d - 1]), ...metrics(state, scenario) };
  });
  assert.equal(JSON.stringify(state), before, 'Preview must not mutate the fixture.');
  const selected = [...alternatives].sort(compare)[0];
  const paretoChoices = alternatives.filter(a => !alternatives.some(b => dominates(b, a))).map(a => a.choice);
  assert.ok(paretoChoices.includes(selected.choice));
  return { selected, paretoChoices, alternatives };
}

const metricNames = [
  'companionDeaths', 'enemyKills', 'enemyHpLoss', 'allyHp', 'allyNetHpLoss',
  'allyDamageTaken', 'actualHealing', 'allyDamageAbsorbed', 'damageRedirected', 'enemyProtectionAbsorbed',
];

function histogram(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function summarize(records, layoutId) {
  const selected = records.map(r => r[layoutId].selected);
  return {
    outcomes: selected.length,
    expected: Object.fromEntries(metricNames.map(name => [name, selected.reduce((sum, row) => sum + row[name], 0) / selected.length])),
    totals: Object.fromEntries(metricNames.map(name => [name, selected.reduce((sum, row) => sum + row[name], 0)])),
    distributions: {
      enemyKills: histogram(selected.map(row => row.enemyKills)),
      companionDeaths: histogram(selected.map(row => row.companionDeaths)),
      allyHp: histogram(selected.map(row => row.allyHp)),
      enemyHpLoss: histogram(selected.map(row => row.enemyHpLoss)),
      outcomes: histogram(selected.map(row => row.outcome)),
    },
    anyCompanionDeathOutcomes: selected.filter(row => row.companionDeaths > 0).length,
    anyEnemyKillOutcomes: selected.filter(row => row.enemyKills > 0).length,
    paretoChoiceCount: histogram(records.map(r => r[layoutId].paretoChoices.length)),
  };
}

export function runPlacementControl() {
  const states = Object.fromEntries(LAYOUTS.map(layout => [layout.id, fixture(layout)]));
  const records = [];
  for (let d1 = 1; d1 <= 6; d1++) for (let d2 = 1; d2 <= 6; d2++) for (let d3 = 1; d3 <= 6; d3++) {
    const dice = [d1, d2, d3];
    records.push({ dice, ...Object.fromEntries(LAYOUTS.map(layout => [layout.id, evaluate(states[layout.id], dice)])) });
  }
  assert.equal(records.length, 216);
  const summary = Object.fromEntries(LAYOUTS.map(layout => [layout.id, summarize(records, layout.id)]));
  const paired = {
    choirCenterDominatesDefault: records.filter(r => dominates(r.choir_center.selected, r.default.selected)).length,
    defaultDominatesChoirCenter: records.filter(r => dominates(r.default.selected, r.choir_center.selected)).length,
    equalObjectives: records.filter(r => ['companionDeaths','enemyKills','enemyHpLoss','allyHp'].every(k => r.default.selected[k] === r.choir_center.selected[k])).length,
    tradeoff: records.filter(r => !dominates(r.default.selected, r.choir_center.selected)
      && !dominates(r.choir_center.selected, r.default.selected)
      && ['companionDeaths','enemyKills','enemyHpLoss','allyHp'].some(k => r.default.selected[k] !== r.choir_center.selected[k])).length,
    expectedChangeChoirCenterMinusDefault: Object.fromEntries(metricNames.map(k => [k, summary.choir_center.expected[k] - summary.default.expected[k]])),
  };
  assert.equal(paired.choirCenterDominatesDefault + paired.defaultDominatesChoirCenter + paired.equalObjectives + paired.tradeoff, 216);
  return {
    classification: 'control-fixture / exhaustive-first-round-comparison',
    ruleVersion: RULE_VERSION,
    source: 'mvps/mvp-config-18.md',
    conditions: {
      seedForPublicMap: 31001, node: '1-1-중', enemyFormation: ['A','B','C'],
      enemyInitialHp: [2,1,3], enemyInitialPosition: '진입 전',
      startingCompanions: '성녀 HP4, 성기사 HP6, 성가대원 HP3; 모두 미강화·미융합·최대 체력',
      layouts: LAYOUTS, initialTotalAllyHp: 13,
      intervention: '첫 굴림만 모든 6^3=216개 순서 있는 결과로 덮어써 같은 조건을 두 배치에 적용',
      probability: '각 굴림 1/216. 모든 여섯 주사위 ID 배분을 비교; 동일 눈의 중복 배분도 포함',
      selectedObjective: ['동료 상실 최소', '적 처치 최대', '적 실제 체력 감소 최대', '라운드 종료 아군 체력 합계 최대', '배분 번호 최소'],
      paretoObjectives: ['동료 상실 최소', '적 처치 최대', '적 실제 체력 감소 최대', '아군 순체력 손실 최소'],
      excludedActions: ['철수 설치', '원정 진행', '후속 라운드의 결과 예측'],
      notes: [
        '전투 시작의 보호·지원과 첫 라운드 공통 종료를 포함한다.',
        '첫 라운드에는 두 시작 편성 모두 무작위 발동이 없으므로 각 배분의 예고 결과는 하나다.',
        '실제 받은 피해와 순체력 손실은 다르며, 실제 회복량을 따로 기록한다.',
        '정상 플레이 로그나 승률 실험이 아니다. 첫 라운드의 배치 영향만 비교한다.',
        '미공개 난수·다음 굴림을 읽지 않고 모든 가능한 첫 굴림을 전수 대조한다.',
      ],
    },
    summary, paired, records,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('./placement-control.json', import.meta.url));
  const result = runPlacementControl();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ output, summary: result.summary, paired: result.paired }, null, 2) + '\n');
}
