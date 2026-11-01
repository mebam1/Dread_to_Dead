/** Controlled expansion diagnostics; never a normal campaign or future-roll oracle. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Game, CREATURES, DICE} from './engine.js';

const copy = value => structuredClone(value);
const METRICS = ['fear', 'progress', 'hearts', 'kills', 'tokenLoss', 'destroyed', 'damage', 'absorbed', 'normalAttacks', 'emptyAttacks', 'blankContacts', 'revisits', 'penaltyPending', 'immediateLoss'];
const sum = (events, kind, field) => events.filter(e => e.kind === kind).reduce((total, e) => total + (e[field] || 0), 0);

function turnMetrics(game, preview) {
  const events = preview.events;
  const hearts = events.filter(e => e.kind === 'heart').length;
  let finalFear = game.s.visitor.f;
  for (const event of events) {
    if (event.kind === 'fear') finalFear = event.after;
    if (event.kind === 'heart') finalFear = 0;
  }
  const moves = events.filter(e => e.kind === 'move');
  const hits = events.filter(e => e.kind === 'hit');
  const uncertainty = preview.uncertainPenalty || preview.uncertainty || [];
  return {
    fear: sum(events, 'fear', 'amount'),
    progress: hearts * game.s.visitor.t + finalFear - game.s.visitor.f,
    hearts,
    kills: events.filter(e => e.kind === 'kill').length,
    tokenLoss: hits.reduce((n, e) => n + (e.tokenLoss ?? e.beforeP - e.afterP), 0),
    destroyed: events.filter(e => e.kind === 'destroy').length,
    damage: hits.reduce((n, e) => n + (e.damage ?? e.power - e.absorbed), 0),
    absorbed: hits.reduce((n, e) => n + (e.absorbed || 0), 0),
    normalAttacks: hits.length + events.filter(e => e.kind === 'miss').length,
    emptyAttacks: events.filter(e => e.kind === 'miss').length,
    blankContacts: moves.filter(e => !game.s.entities.some(entity => entity.floor === e.floor && entity.p > 0)).length,
    revisits: moves.length - new Set(moves.map(e => e.floor)).size,
    penaltyPending: uncertainty.length || events.some(e => e.kind === 'penalty_preview') ? 1 : 0,
    immediateLoss: preview.state.phase === 'lost' ? 1 : 0
  };
}

function preference(metrics, policy, slot) {
  if (policy === 'survival') return [-metrics.immediateLoss, -metrics.destroyed, -metrics.tokenLoss, metrics.kills, metrics.hearts, metrics.progress, -metrics.damage, -metrics.penaltyPending, -slot];
  return [-metrics.immediateLoss, metrics.kills, metrics.hearts, metrics.progress, -metrics.destroyed, -metrics.tokenLoss, -metrics.damage, -metrics.penaltyPending, -slot];
}

function higher(left, right) {
  if (!right) return true;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

/** Exactly 6^3 equiprobable face-index triples. Does not call roll() or sample penalty targets. */
export function analyzeTurn(game, {policy = 'progress', actions = []} = {}) {
  if (!['progress', 'survival'].includes(policy)) throw new Error('Policy must be progress or survival.');
  if (!['roll', 'choose'].includes(game.s.phase) || !game.s.visitor || game.s.visitor.h < 1) {
    throw new Error('An active, pre-choice battle state (roll or choose) is required.');
  }
  if (!Array.isArray(actions)) throw new Error('Actions must be an explicit common action array.');
  const original = JSON.stringify(game.s);
  const totals = Object.fromEntries(METRICS.map(key => [key, 0]));
  const choices = {};
  let outcomes = 0;
  for (let face0 = 0; face0 < 6; face0++) for (let face1 = 0; face1 < 6; face1++) for (let face2 = 0; face2 < 6; face2++) {
    const state = copy(game.s);
    state.phase = 'choose';
    state.chosen = null;
    state.chosenSlot = null;
    state.choiceEffect = null;
    state.activity = false;
    state.dice = [face0, face1, face2].map((face, slot) => {
      const type = state.equipped[slot], value = DICE[type].faces[face];
      return {slot, type, face, value, bonus: type === 'anxiety' && value === 3 ? 1 : 0};
    });
    const hypothetical = Game.fromState(state);
    let selected = null;
    for (let slot = 0; slot < 3; slot++) {
      let preview;
      try { preview = hypothetical.preview(slot, copy(actions)); }
      catch (error) { throw new Error(`The common action script is illegal for face triple ${face0},${face1},${face2}, slot ${slot}: ${error.message}`); }
      const metrics = turnMetrics(hypothetical, preview);
      const rank = preference(metrics, policy, slot);
      if (higher(rank, selected?.rank)) selected = {slot, metrics, rank, value: state.dice[slot].value};
    }
    for (const key of METRICS) totals[key] += selected.metrics[key];
    choices[selected.value] = (choices[selected.value] || 0) + 1;
    outcomes++;
  }
  if (JSON.stringify(game.s) !== original) throw new Error('Diagnostic mutated the source state.');
  return {
    classification: 'synthetic-one-turn-diagnostic',
    algorithm: 'Enumerate all 216 face-index triples; choose one revealed die with a fixed one-turn lexicographic policy.',
    policy,
    policyOrder: policy === 'survival' ? 'avoid immediate defeat, destruction, token loss; then kill, hearts, fear progress, damage, penalty risk, lower slot' : 'avoid immediate defeat; then kill, hearts, fear progress, destruction, token loss, damage, penalty risk, lower slot',
    actions: copy(actions),
    denominator: outcomes,
    probabilityMass: outcomes / 216,
    expected: Object.fromEntries(METRICS.map(key => [key, totals[key] / outcomes])),
    integerTotals: totals,
    chosenDistanceCounts: choices,
    stateSummary: {
      floorCount: game.s.floorCount, money: game.s.money, equipped: copy(game.s.equipped),
      visitor: copy(game.s.visitor), inventory: game.s.entities.map(e => ({id: e.id, type: e.type, floor: e.floor, c: e.c, p: e.p, uses: e.uses})),
      inactive: game.s.inactive, inactiveLimit: game.s.inactiveLimit
    },
    limits: [
      'This is a hypothetical current-turn distribution, not the seeded next roll and not normal play.',
      'Only the current turn is optimized; no lookahead, repeated-turn policy, route choice, or shop policy is used.',
      'No direct-use actions are assumed unless an identical explicit action script is supplied for every candidate.',
      'Normal attack outcomes are exact; hidden inactivity penalty targets are not drawn. Pending penalty probability is separate and its possible extra token losses are excluded.',
      'Fear is the total effect amount; progress counts heart thresholds plus surviving fear and removes discarded overflow.',
      'No win-rate, economic payoff, or human enjoyment conclusion follows from these one-turn metrics.'
    ]
  };
}

export function compareTurns(before, after, metadata = {}, options = {}) {
  const left = analyzeTurn(before, options), right = analyzeTurn(after, options);
  return {classification: 'controlled-mechanism-diagnostic', metadata, before: left, after: right,
    delta: Object.fromEntries(METRICS.map(key => [key, right.expected[key] - left.expected[key]]))};
}

function fixture({layout, reserve = [], position, anxiety = 0, pattern = 'double', equipment = ['normal', 'normal', 'normal']}) {
  const game = new Game(31001);
  game.visit(game.availableNodes()[0].id);
  game.startService();
  game.s.entities = [...layout.map((type, i) => type ? {type, floor: i + 1} : null).filter(Boolean), ...reserve.map(type => ({type, floor: null}))]
    .map((e, i) => ({...e, id: `diagnostic-${i + 1}`, c: 0, p: CREATURES[e.type].maxP, uses: CREATURES[e.type].maxUses, shield: 0}));
  game.s.nextId = 100;
  game.s.equipped = [...equipment];
  game.s.visitor = {...game.s.visitor, id: pattern === 'route' ? 'N5' : pattern === 'mirror' ? 'N6' : 'N4', name: '합성 진단용 기존 패턴 손님',
    t: pattern === 'double' ? 12 : 16, h: 2, f: 0, a: anxiety, pos: position, pattern, reward: 2, turn: 1};
  game.s.inactive = 0;
  game.s.inactiveLimit = 3;
  game.s.money = 10;
  return game;
}

/** Explicit synthetic fixtures isolate geometry; no fixture is counted as a legal campaign. */
export function mechanismFixtures() {
  const cases = [];
  const add = (name, before, setup, interpretation) => {
    const after = before.clone();
    after.s.floorCount++;
    after.s.money -= 4;
    after.s.stats.spent += 4;
    if (setup) {
      const phase = after.s.phase;
      after.s.phase = 'management';
      setup(after);
      after.s.phase = phase;
    }
    cases.push({name, before, after, metadata: {name, classification: 'synthetic', initialPositionIsInjected: true,
      soulCost: 4, nodeOpportunityIncluded: false, fixedStateNotReachabilityProof: true, interpretation}});
  };
  add('empty-top-floor', fixture({layout: ['U', 'Q', 'U', 'Q', 'G', 'B'], position: 5, anxiety: 3}), null,
    'The same six anomalies remain in place. The new top floor is empty; additional room capacity is not itself an effect or damage bonus.');
  add('extra-owned-harvester', fixture({layout: ['U', 'U', 'B', 'G', 'E', 'R'], reserve: ['Q'], position: 1}), game => {
    game.place(game.s.entities.find(e => e.floor == null && e.type === 'Q').id, 7);
  }, 'Both states own the same extra harvester. The paid seventh slot deploys it without replacing an existing anomaly. This is not an optimized six-floor baseline: replacing an existing anomaly at six floors is a separate alternative.');
  const swapped = fixture({layout: ['U', 'U', 'B', 'G', 'E', 'R'], reserve: ['Q'], position: 1});
  swapped.s.phase = 'management';
  swapped.place(swapped.s.entities.find(e => e.floor == null && e.type === 'Q').id, 6);
  swapped.s.phase = 'roll';
  add('six-floor-replacement-alternative', swapped, game => {
    game.place(game.s.entities.find(e => e.floor == null && e.type === 'R').id, 6);
    game.place(game.s.entities.find(e => e.floor == null && e.type === 'Q').id, 7);
  }, 'Concrete alternative: at six floors replace the repair anomaly with the already-owned harvester; at seven floors keep repair on six and harvester on seven. Same inventory, no claim that either placement is globally optimal.');
  add('long-die-revisit', fixture({layout: ['U', 'G', 'Q', null, 'Q', 'B'], position: 0, equipment: ['long', 'long', 'long']}), null,
    'A distance of eight revisits different floors at six and seven floors. Count visits and attacks separately; a longer hotel need not strengthen a long die.');
  add('even-die-parity', fixture({layout: ['B', 'U', 'Q', 'U', 'Q', 'G'], position: 5, anxiety: 3, equipment: ['even', 'even', 'even']}), null,
    'At six floors, even movements from floor five reach odd harvest/attack floors. At seven floors the wrap changes parity and all three distances miss the harvesters from this particular state.');
  add('route-attack-empty-space', fixture({layout: ['U', 'Q', 'U', 'Q', 'G', 'B'], position: 5, anxiety: 3, pattern: 'route'}), null,
    'The same per-visit route attacks can strike an extra empty floor instead of an anomaly, but the total movement/attack count and lost arrivals must also be retained.');
  add('remote-attack-retarget', fixture({layout: ['U', 'Q', 'U', 'Q', 'G', 'B'], position: 5, anxiety: 3, pattern: 'mirror'}), null,
    'Below/above two-floor attack targets wrap with hotel size. Empty space can absorb a target or shift it onto a valuable anomaly; it is not a universal defense bonus.');
  return cases;
}

function newOutputDirectory(outDir) {
  const absolute = path.resolve(outDir);
  if (fs.existsSync(absolute)) throw new Error(`Output already exists; choose a new directory: ${absolute}`);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.mkdirSync(absolute);
  return absolute;
}

function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'}); }
const number = value => Number(value.toFixed(4));

export function mechanismReport(cases, {policy = 'progress'} = {}) {
  return {status: 'PREPARATION_DIAGNOSTICS_ONLY', classification: 'synthetic-mechanism-diagnostics',
    purpose: 'Prepare tools to judge the net value of expansion under user-3; these fixtures are not normal-play findings.',
    sourceRules: '../mvps/mvp-config-user-3.md', configuration: '../mvps/mvp-config-15.md',
    comparisons: cases.map(item => compareTurns(item.before, item.after, item.metadata, {policy})),
    economicLimits: 'Each synthetic 6-to-7 comparison charges four souls, but a single-turn geometry statistic cannot price future shopping or the skipped alternative node. Use legal checkpoint branches and continue both to measure realized payoff.'};
}

export function renderMechanismReport(report) {
  const lines = ['# 증설 메커니즘 진단 준비', '', '> 합성 상태·한 턴 진단 결과입니다. 정상 캠페인 플레이나 증설의 순이익 판정이 아닙니다.', '',
    '각 상태에서 장착 세 주사위의 면 인덱스 조합 216개를 모두 열거합니다. 현재 공개 상태만으로 고정된 한 턴 선택 정책을 적용하며, 미래 시드 눈과 비활동 무작위 표적은 조회하지 않습니다.', '',
    `선택 정책: ${report.comparisons[0]?.before.policy || 'progress'} · 직접 사용 없음 · 각 합성 분기는 6→7층 비용 영혼 4 반영.`, '',
    '| 합성 장면 | 공포 기대값 전→후 | 공포 진행 차이 | 토큰 손실 차이 | 정상 피해 차이 | 보호 흡수 차이 | 일반 타격 차이 | 빈층 이동 차이 | 패널티 예정 확률 차이 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const item of report.comparisons) {
    lines.push(`| ${item.metadata.name} | ${number(item.before.expected.fear)} → ${number(item.after.expected.fear)} | ${number(item.delta.progress)} | ${number(item.delta.tokenLoss)} | ${number(item.delta.damage)} | ${number(item.delta.absorbed)} | ${number(item.delta.normalAttacks)} | ${number(item.delta.blankContacts)} | ${number(item.delta.penaltyPending)} |`);
  }
  lines.push('', '공포는 부여량이며 한계 초과 소멸을 포함합니다. 공포 진행은 제거한 심장×공포 한계와 남은 공포의 변화입니다. 토큰 손실·피해는 정상 공격만 합산하고, 비활동 패널티의 추가 손실은 미확정으로 분리했습니다.', '',
    '## 해석 범위', '',
    '- 빈층 추가·보유 괴이 추가 배치·장거리 재방문·짝수 이동·경로 공격·원격 공격의 방향이 같은지 독립적으로 살펴보는 진단입니다.',
    '- 증설 분기와 미증설 분기에 같은 괴이·장비를 주며, 추가 배치 사례는 두 분기에 원래 보유한 보관 괴이를 사용합니다.',
    '- extra-owned-harvester의 6층 배치는 최적화하지 않았습니다. six-floor-replacement-alternative는 6층에서 수리 괴이를 수확 괴이로 바꾸는 구체적인 대안이며, 모든 재배치의 최선값을 찾은 결과는 아닙니다.',
    '- 합성 위치·불안·적 상태는 도달 가능성이 검증된 정상 플레이 기록이 아닙니다.',
    '- 한 턴의 이득이 다음 전투의 생존·처치·구매 기회로 이어지는지는 별도 실제 상태 분기에서 확인해야 합니다.',
    '- 증설 노드까지 방문한 두 분기의 비교는 다른 종류의 노드를 포기한 기회비용을 측정하지 않습니다.',
    '- 이 보고서로 증설이 항상 유리하거나 불리하다고 결론내리지 않습니다.', '');
  return lines.join('\n');
}

export function runMechanismDiagnostics(outDir, options = {}) {
  const report = mechanismReport(mechanismFixtures(), options);
  const directory = newOutputDirectory(outDir);
  writeJson(path.join(directory, 'mechanisms.json'), report);
  fs.writeFileSync(path.join(directory, 'mechanisms.md'), renderMechanismReport(report), {encoding: 'utf8', flag: 'wx'});
  return {directory, classification: report.classification, comparisons: report.comparisons.length};
}

/** Create reusable CLI sessions at the exact same legal expansion-node decision. */
export function createPaidSkipBranches({sourcePath, outDir}) {
  const source = path.resolve(sourcePath), raw = fs.readFileSync(source, 'utf8');
  const envelope = JSON.parse(raw), state = envelope.state;
  if (!state || !['dread-to-dead-text-15', 'dread-to-dead-text-15-checkpoint'].includes(envelope.kind)) throw new Error('A text-15 session or checkpoint envelope is required.');
  const original = Game.fromState(state);
  const node = original.s.maps[original.s.act - 1]?.find(n => n.id === original.s.currentNode);
  if (original.s.phase !== 'expansion' || !node || node.kind !== 'expansion' || node.status !== 'active') throw new Error('Branching requires an active expansion node before the purchase decision.');
  const cost = original.expansionCost();
  if (cost == null || original.s.money < cost) throw new Error('The paid branch must be able to buy the next floor legally.');
  const paid = original.clone(), skip = original.clone();
  paid.expand();
  paid.leave();
  skip.leave();
  const inventory = game => game.s.entities.map(({id, type, floor, c, p, uses}) => ({id, type, floor, c, p, uses}));
  if (JSON.stringify(inventory(paid)) !== JSON.stringify(inventory(skip)) || JSON.stringify(paid.s.equipped) !== JSON.stringify(skip.s.equipped)) throw new Error('Pair must preserve equal assets, placements, durability and equipment.');
  if (JSON.stringify(paid.availableNodes()) !== JSON.stringify(skip.availableNodes())) throw new Error('Pair must have the same next route choices.');
  const directory = newOutputDirectory(outDir), createdAt = new Date().toISOString();
  const metadata = {classification: 'control-branch-preparation', source, sourceSHA256: createHash('sha256').update(raw).digest('hex'), nodeId: node.id,
    seed: state.seed, act: state.act, cost, beforeFloor: state.floorCount, afterFloor: paid.s.floorCount,
    souls: {before: state.money, paid: paid.s.money, skip: skip.s.money},
    pairedControls: ['same seed', 'same inventory/initial placement/durability/equipment', 'same expansion-node visit', 'same legal next-node choices'],
    requiredContinuation: 'Continue both branches to the same public-information policy and planned route. Permit legal branch-specific placements and purchases; record them. Do not inspect one branch future before deciding the other.',
    opportunityLimit: 'This pair conditions on having visited the expansion node. It includes the soul fee and future spending differences, but excludes the alternative node that was not visited.',
    classificationInheritedFromSource: envelope.classification || 'unspecified', normalPlayEvidence: false};
  for (const [label, game] of [['paid', paid], ['skip', skip]]) {
    const session = {kind: 'dread-to-dead-text-15', schemaVersion: 1, protocol: 'user-3 / expansion-value / config-15', classification: 'control-branch',
      createdAt, state: game.s, journal: [{at: createdAt, command: `branch-${label}`, reason: label === 'paid' ? `One legal floor purchased for ${cost} souls, then node completed.` : 'Expansion skipped, then node completed.', metadata}],
      pendingReason: null, checkpoints: [], control: {...metadata, branch: label}};
    writeJson(path.join(directory, `${label}.json`), session);
  }
  writeJson(path.join(directory, 'pair.json'), metadata);
  fs.writeFileSync(path.join(directory, 'README.md'), '# 같은 증설 결정의 유료/미증설 분기\n\n합법적인 증설 노드 상태를 복제한 통제 분기 준비입니다. 정상 플레이 결과가 아닙니다.\n\n' +
    `- 원본: ${source}\n- 노드: ${node.id}\n- 비용: 영혼 ${cost}\n- 층: ${state.floorCount} → ${paid.s.floorCount}\n- 유료/미증설 잔액: ${paid.s.money} / ${skip.s.money}\n\n` +
    '각 세이브는 cli.mjs --save 경로 show로 열 수 있습니다. 이후 같은 경로를 선택하고 배치·구매 차이와 실제 후속 전투를 기록하세요. 미래 눈을 본 뒤 원본 선택을 바꾸지 마세요.\n\n' +
    '이 비교는 같은 증설 노드에 방문한 조건부 효과입니다. 다른 노드를 포기한 경로 기회비용은 별도 비교가 필요합니다.\n', {encoding: 'utf8', flag: 'wx'});
  if (fs.readFileSync(source, 'utf8') !== raw) throw new Error('Source checkpoint changed unexpectedly.');
  return {directory, ...metadata};
}

function readSnapshot(file) {
  const absolute = path.resolve(file), raw = fs.readFileSync(absolute, 'utf8');
  const envelope = JSON.parse(raw);
  if (!['dread-to-dead-text-15', 'dread-to-dead-text-15-checkpoint'].includes(envelope.kind) || envelope.schemaVersion !== 1 || !envelope.state) {
    throw new Error('Compare requires schema-version-1 text-15 sessions or checkpoints.');
  }
  const game = Game.fromState(envelope.state);
  if (!['roll', 'choose'].includes(game.s.phase) || !game.s.visitor || game.s.visitor.h < 1) {
    throw new Error('Compare requires active pre-choice battle checkpoints (roll or choose).');
  }
  return {absolute, raw, envelope, game};
}

function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

/** Compare two matched real checkpoint boundaries without exposing either full facilitator state. */
export function compareSavedTurns({beforePath, afterPath, outDir, policy = 'progress'}) {
  const before = readSnapshot(beforePath), after = readSnapshot(afterPath);
  const a = before.game.s, b = after.game.s;
  const context = state => ({seed: state.seed, act: state.act, nodeId: state.currentNode, guestIndex: state.guestIndex,
    guestId: state.visitor.id, turn: state.visitor.turn, threshold: state.visitor.t, pattern: state.visitor.pattern});
  if (!a.currentNode || !same(context(a), context(b))) {
    throw new Error('Unmatched context: both checkpoints need the same seed, act, node, guest ordinal/id, turn, threshold and attack pattern.');
  }
  const changed = [];
  for (const key of ['floorCount', 'money', 'equipped']) if (!same(a[key], b[key])) changed.push(key);
  for (const key of ['pos', 'a', 'f', 'h', 'power', 'attackBonus', 'doublePower', 'mirrorPower']) {
    if (!same(a.visitor[key], b.visitor[key])) changed.push(`visitor.${key}`);
  }
  const publicInventory = state => state.entities.map(({id, type, floor, c, p, uses, shield}) => ({id, type, floor, c, p, uses, shield}));
  const inventoryIdentity = state => state.entities.map(({id, type}) => ({id, type}));
  if (!same(inventoryIdentity(a), inventoryIdentity(b))) changed.push('inventory');
  if (!same(publicInventory(a), publicInventory(b))) changed.push('placement/durability/charges');
  for (const key of ['escape', 'inactive', 'inactiveLimit']) if (!same(a[key], b[key])) changed.push(key);
  const metadata = {
    classification: 'matched-checkpoint-comparison', context: context(a),
    sources: [before, after].map(source => ({path: source.absolute, sha256: createHash('sha256').update(source.raw).digest('hex'), classification: source.envelope.classification || 'unspecified'})),
    changedFields: changed,
    floors: {before: a.floorCount, after: b.floorCount}, souls: {before: a.money, after: b.money},
    sameInventory: same(inventoryIdentity(a), inventoryIdentity(b)),
    sameEquipment: same(a.equipped, b.equipped),
    sameCurrentVisitorState: same(['pos', 'a', 'f', 'h'].map(key => a.visitor[key]), ['pos', 'a', 'f', 'h'].map(key => b.visitor[key])),
    interpretation: 'Matched decision boundary, not automatically a pure floor-count intervention. Placement, equipment, durability, visitor-state and budget differences are recorded as confounders.',
    normalPlayEvidence: false,
    economicLimit: 'Current-turn exact expectations do not measure future shop purchases, campaign outcome or the opportunity cost of the unvisited alternative node.'
  };
  const report = {...compareTurns(before.game, after.game, metadata, {policy}),
    classification: 'matched-checkpoint-one-turn-diagnostic', status: 'ONE_TURN_DIAGNOSTIC_NOT_NET_VALUE'};
  const directory = newOutputDirectory(outDir);
  writeJson(path.join(directory, 'comparison.json'), report);
  const lines = ['# 같은 전투 경계의 증설 비교', '', '> 현재 턴의 가상 분포를 비교한 통제 진단입니다. 캠페인 증설 순이익·승률·정상 플레이 결론이 아닙니다.', '',
    `- 노드: ${a.currentNode} · 손님 순번 ${a.guestIndex + 1} · 턴 ${a.visitor.turn}`,
    `- 층: ${a.floorCount} → ${b.floorCount} · 영혼 잔액: ${a.money} → ${b.money}`,
    `- 달라진 항목: ${changed.join(', ') || '없음'}`,
    `- 같은 괴이 보유: ${metadata.sameInventory} · 같은 장비: ${metadata.sameEquipment} · 같은 현재 손님 상태: ${metadata.sameCurrentVisitorState}`, '',
    `정책 ${policy}, 현재 면 조합 216개를 전수 열거합니다. 미래 난수와 비활동 표적은 추첨하지 않습니다. 배치·장비·손님 상태 등도 달랐다면 층 수 하나의 인과 효과로 해석하지 않습니다.`, '',
    '| 한 턴 지표 | 이전 | 이후 | 차이 |', '|---|---:|---:|---:|'];
  for (const key of METRICS) lines.push(`| ${key} | ${number(report.before.expected[key])} | ${number(report.after.expected[key])} | ${number(report.delta[key])} |`);
  lines.push('', '정상 공격의 피해·토큰 손실과 비활동 패널티 예정 확률을 분리합니다. 패널티 표적에 따른 추가 손실은 확정하지 않습니다. 현재 영혼 차이는 표시하지만 미래 구매 기회와 경로 기회비용은 이 한 턴 표로 가격 매기지 않습니다.', '');
  fs.writeFileSync(path.join(directory, 'comparison.md'), lines.join('\n'), {encoding: 'utf8', flag: 'wx'});
  for (const source of [before, after]) if (fs.readFileSync(source.absolute, 'utf8') !== source.raw) throw new Error('A source checkpoint changed unexpectedly.');
  return {directory, classification: report.classification, context: metadata.context, changedFields: changed, files: ['comparison.json', 'comparison.md']};
}

function argument(args, flag) {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1];
}

function main(args) {
  const command = args[0];
  const outDir = argument(args, '--out');
  if (!outDir) throw new Error('Use a new --out directory; existing records are never overwritten.');
  if (command === 'diagnostics') return runMechanismDiagnostics(outDir, {policy: argument(args, '--policy') || 'progress'});
  if (command === 'branch') {
    const sourcePath = argument(args, '--save');
    if (!sourcePath) throw new Error('branch requires --save SESSION_OR_CHECKPOINT.');
    return createPaidSkipBranches({sourcePath, outDir});
  }
  if (command === 'compare') {
    const beforePath = argument(args, '--before'), afterPath = argument(args, '--after');
    if (!beforePath || !afterPath) throw new Error('compare requires --before FILE and --after FILE.');
    return compareSavedTurns({beforePath, afterPath, outDir, policy: argument(args, '--policy') || 'progress'});
  }
  throw new Error('Commands: diagnostics --out NEW_DIR [--policy progress|survival]; branch --save FILE --out NEW_DIR; compare --before FILE --after FILE --out NEW_DIR [--policy progress|survival]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
