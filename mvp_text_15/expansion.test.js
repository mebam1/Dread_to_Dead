import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Game} from './engine.js';
import {analyzeTurn, compareTurns, mechanismFixtures, createPaidSkipBranches, compareSavedTurns, runMechanismDiagnostics} from './expansion.mjs';

test('216 face-index outcomes have exact unit mass, deterministic result and no state mutation', () => {
  const fixture = mechanismFixtures().find(item => item.name === 'long-die-revisit');
  const original = JSON.stringify(fixture.before.s);
  const first = analyzeTurn(fixture.before);
  assert.equal(first.denominator, 216);
  assert.equal(first.probabilityMass, 1);
  assert.equal(Object.values(first.chosenDistanceCounts).reduce((n, count) => n + count, 0), 216);
  assert.deepEqual(analyzeTurn(fixture.before), first);
  assert.equal(JSON.stringify(fixture.before.s), original);
});

test('a paid extra slot can improve immediate output using an anomaly already owned in both branches', () => {
  const item = mechanismFixtures().find(item => item.name === 'extra-owned-harvester');
  const beforeAssets = item.before.s.entities.map(e => [e.id, e.type]);
  assert.deepEqual(item.after.s.entities.map(e => [e.id, e.type]), beforeAssets);
  const comparison = compareTurns(item.before, item.after, item.metadata);
  assert.ok(comparison.delta.fear > 0);
  assert.ok(comparison.delta.progress > 0);
  assert.equal(item.before.s.money - item.after.s.money, 4);
});

test('an odd hotel size can break a particular even-die harvesting alignment', () => {
  const item = mechanismFixtures().find(item => item.name === 'even-die-parity');
  const comparison = compareTurns(item.before, item.after, item.metadata);
  assert.ok(comparison.before.expected.fear > 0);
  assert.equal(comparison.after.expected.fear, 0);
  assert.ok(comparison.delta.fear < 0);
});

test('explicit common protection actions record real absorbed damage separately', () => {
  const item = mechanismFixtures().find(fixture => fixture.name === 'empty-top-floor');
  const guard = item.before.s.entities.find(entity => entity.type === 'G');
  const target = item.before.s.entities.find(entity => entity.type === 'Q');
  const plain = analyzeTurn(item.before);
  const protectedTurn = analyzeTurn(item.before, {actions: [{kind: 'active', entityId: guard.id, targetId: target.id}]});
  assert.equal(plain.expected.absorbed, 0);
  assert.ok(protectedTurn.expected.absorbed > 0);
  assert.ok(protectedTurn.expected.damage < plain.expected.damage);
});

test('diagnostic reports remain explicitly synthetic and refuse overwrite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dread15-lab-'));
  try {
    const output = path.join(root, 'first');
    runMechanismDiagnostics(output);
    const report = JSON.parse(fs.readFileSync(path.join(output, 'mechanisms.json'), 'utf8'));
    assert.equal(report.status, 'PREPARATION_DIAGNOSTICS_ONLY');
    assert.equal(report.comparisons.length, 7);
    assert.ok(report.comparisons.every(item => item.before.denominator === 216 && item.metadata.nodeOpportunityIncluded === false));
    assert.throws(() => runMechanismDiagnostics(output), /already exists/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('paid/skip branch utility charges actual price, preserves source/assets and labels counterfactual saves', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dread15-branch-'));
  try {
    // Synthetic checkpoint fixture tests the utility, not campaign reachability.
    const game = new Game(31001);
    const node = game.s.maps[0].find(item => item.kind === 'expansion');
    node.status = 'active';
    game.s.currentNode = node.id;
    game.s.phase = 'expansion';
    game.s.floorCount = 8;
    game.s.money = 12;
    game.s.completed[0] = node.depth - 1;
    const source = path.join(root, 'source.json');
    const raw = JSON.stringify({kind: 'dread-to-dead-text-15-checkpoint', schemaVersion: 1, classification: 'synthetic-test-fixture', state: game.s});
    fs.writeFileSync(source, raw);
    const result = createPaidSkipBranches({sourcePath: source, outDir: path.join(root, 'pair')});
    assert.equal(result.cost, 8);
    const paid = JSON.parse(fs.readFileSync(path.join(root, 'pair', 'paid.json'), 'utf8'));
    const skip = JSON.parse(fs.readFileSync(path.join(root, 'pair', 'skip.json'), 'utf8'));
    assert.equal(paid.classification, 'control-branch');
    assert.equal(skip.classification, 'control-branch');
    assert.equal(paid.state.floorCount, 9);
    assert.equal(skip.state.floorCount, 8);
    assert.equal(paid.state.money, 4);
    assert.equal(skip.state.money, 12);
    assert.deepEqual(paid.state.entities, skip.state.entities);
    assert.deepEqual(Game.fromState(paid.state).availableNodes(), Game.fromState(skip.state).availableNodes());
    assert.equal(fs.readFileSync(source, 'utf8'), raw);
    assert.throws(() => createPaidSkipBranches({sourcePath: source, outDir: path.join(root, 'pair')}), /already exists/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('branch creation rejects wrong phase and unaffordable purchase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dread15-reject-'));
  try {
    const game = new Game(31001), source = path.join(root, 'source.json');
    const save = () => fs.writeFileSync(source, JSON.stringify({kind: 'dread-to-dead-text-15', state: game.s}));
    save();
    assert.throws(() => createPaidSkipBranches({sourcePath: source, outDir: path.join(root, 'wrong')}), /active expansion/);
    const node = game.s.maps[0].find(item => item.kind === 'expansion');
    node.status = 'active'; game.s.currentNode = node.id; game.s.phase = 'expansion'; game.s.money = 0; save();
    assert.throws(() => createPaidSkipBranches({sourcePath: source, outDir: path.join(root, 'poor')}), /legally/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('matched checkpoint comparison records confounders without printing hidden facilitator state or changing inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dread15-compare-'));
  try {
    const game = new Game(31001);
    game.visit(game.availableNodes()[0].id); game.startService();
    game.s.facilitatorSecret = 'DO_NOT_PUBLISH_FUTURE_CONTENTS';
    const other = game.clone(); other.s.floorCount = 7; other.s.money -= 4;
    const files = [path.join(root, 'before.json'), path.join(root, 'after.json')];
    for (const [index, item] of [game, other].entries()) fs.writeFileSync(files[index], JSON.stringify({kind: 'dread-to-dead-text-15-checkpoint', schemaVersion: 1, classification: 'synthetic-test-fixture', state: item.s}));
    const originals = files.map(file => fs.readFileSync(file, 'utf8'));
    const result = compareSavedTurns({beforePath: files[0], afterPath: files[1], outDir: path.join(root, 'comparison')});
    assert.equal(result.classification, 'matched-checkpoint-one-turn-diagnostic');
    assert.deepEqual(result.changedFields, ['floorCount', 'money']);
    const raw = fs.readFileSync(path.join(result.directory, 'comparison.json'), 'utf8');
    const report = JSON.parse(raw);
    assert.equal(report.before.denominator, 216);
    assert.equal(report.after.denominator, 216);
    assert.equal(report.metadata.sameInventory, true);
    assert.equal(report.metadata.sameCurrentVisitorState, true);
    assert.ok(!raw.includes('DO_NOT_PUBLISH_FUTURE_CONTENTS'));
    assert.ok(!raw.includes('"maps"'));
    assert.equal(report.before.state, undefined);
    files.forEach((file, index) => assert.equal(fs.readFileSync(file, 'utf8'), originals[index]));
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('checkpoint comparator rejects unrelated nodes and guest turns', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dread15-context-'));
  try {
    const game = new Game(31001); game.visit(game.availableNodes()[0].id); game.startService();
    const other = game.clone(), files = [path.join(root, 'before.json'), path.join(root, 'after.json')];
    const save = () => [game, other].forEach((item, index) => fs.writeFileSync(files[index], JSON.stringify({kind: 'dread-to-dead-text-15', schemaVersion: 1, state: item.s})));
    other.s.currentNode = 'another-node'; save();
    assert.throws(() => compareSavedTurns({beforePath: files[0], afterPath: files[1], outDir: path.join(root, 'wrong-node')}), /Unmatched context/);
    other.s.currentNode = game.s.currentNode; other.s.visitor.turn++; save();
    assert.throws(() => compareSavedTurns({beforePath: files[0], afterPath: files[1], outDir: path.join(root, 'wrong-turn')}), /Unmatched context/);
    assert.equal(fs.existsSync(path.join(root, 'wrong-node')), false);
    assert.equal(fs.existsSync(path.join(root, 'wrong-turn')), false);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
