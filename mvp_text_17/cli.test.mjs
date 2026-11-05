import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));

function gameFiles(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotel-text17-'));
  t.after(() => {
    for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
    fs.rmdirSync(dir);
  });
  return { dir, file: path.join(dir, 'run.json') };
}

function invoke(file, args, input) {
  const result = spawnSync(process.execPath, [cli, '--save', file, ...args], {
    encoding: 'utf8', input, timeout: 10000, windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function success(file, ...args) {
  const result = invoke(file, args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function failure(file, args, message) {
  const result = invoke(file, args);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, message);
}

test('new protects an existing run, inspection is public and read-only, and a failed choice leaves the save intact', t => {
  const { file } = gameFiles(t);
  const roster = success(file, 'catalog').catalog;
  assert.equal(Object.keys(roster.creatures).length, 15);
  assert.equal(Object.keys(roster.dice).length, 4);
  const fresh = success(file, 'new', '31001');
  assert.equal(fresh.view.floors.length, 10);
  assert.equal(fresh.view.reachable.length, 3);
  const initial = fs.readFileSync(file, 'utf8');
  const map = success(file, 'map').map;
  assert.equal(map.length, 20);
  assert.ok(map.every(n => !Object.hasOwn(n, 'stock') && !Object.hasOwn(n, 'event')));
  assert.doesNotMatch(JSON.stringify(fresh), /"rng"|"journal"|"state"/);
  const report = success(file, 'report').report;
  assert.equal(report.acts[0].grant, 2);
  assert.equal(report.acts[0].earned, 0);
  failure(file, ['new', '31002'], /이미 존재/);
  failure(file, ['visit', '1'], /이유/);
  failure(file, ['visit', '999', '--reason', '잘못된 방문'], /선택/);
  assert.equal(fs.readFileSync(file, 'utf8'), initial);
});

test('resume, preview, and control forks keep the original decision history and rolls', t => {
  const { dir, file } = gameFiles(t);
  success(file, 'new');
  success(file, 'visit', '1', '--reason', '첫 경로');
  const battle = success(file, 'start', '--reason', '현재 배치').view;
  assert.equal(battle.phase, 'choose');
  const before = fs.readFileSync(file, 'utf8');
  const forecasts = success(file, 'preview').preview;
  assert.deepEqual(forecasts.map(p => p.result.face), battle.battle.rolls);
  const child = path.join(dir, 'control.json');
  assert.equal(success(file, 'fork', child).classification, 'control');
  assert.deepEqual(success(child, 'show').view, success(file, 'show').view);
  assert.equal(success(child, 'choose', '2', '--reason', '비교 선택').view.phase, 'prepare');
  assert.ok(success(child, 'journal', '8').journal.some(e => e.reason === '비교 선택'));
  assert.equal(success(child, 'move', '--reason', '이동 확정').view.phase, 'choose');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  failure(file, ['fork', child], /이미 존재/);
});

test('v1.0 진행 중인 융합체는 재료의 기존 강화를 살려 v1.1로 이어간다', t => {
  const {file} = gameFiles(t);
  success(file, 'new');
  success(file, 'visit', '1', '--reason', '테스트');
  success(file, 'start', '--reason', '테스트');
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  old.rule = old.state.version = 'text-17-v1.0';
  Object.assign(old.state.floors[0], {donor:'gaze', fusion:{name:'융합체', bUpgraded:true, thumbnail:{left:'gaze',right:'gaze'}}});
  old.state.battle.rolls[0] = 2;
  old.state.battle.barnacles = ['e1'];
  fs.writeFileSync(file, JSON.stringify(old));
  const view = success(file, 'show').view;
  assert.equal(view.version, 'text-17-v1.1');
  assert.match(view.floors[0].donorText, /\+5$/);
  assert.deepEqual(view.battle.barnacles, [{id:'e1', part:'base'}]);
  const resumed = success(file, 'choose', '1', '--reason', '이어하기').view;
  assert.equal(resumed.phase, 'prepare');
  const preview = success(file, 'preview').preview;
  assert.deepEqual(preview.events.filter(e => e.type === 'gain' && e.resource === 'anxiety').map(e => e.amount), [4, 5]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).rule, 'text-17-v1.1');
});

test('a concurrent writer cannot replace an in-flight decision', t => {
  const { file } = gameFiles(t);
  success(file, 'new');
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file + '.lock', String(process.pid));
  failure(file, ['swap', '1', '2', '--reason', '동시 결정'], /사용 중/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.ok(fs.existsSync(file + '.lock'));
  fs.unlinkSync(file + '.lock');
  assert.equal(success(file, 'swap', '1', '2', '--reason', '이동').view.floors[1].id, 'e1');
});

test('interactive input prompts for reasons and resumes a saved turn', t => {
  const { file } = gameFiles(t);
  const first = invoke(file, ['play', '31002'], 'preview-fusion e1 e2\nvisit 1\n첫 경로\nstart --reason 현재 호텔로 영업\npreview\nquit\n');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /선택 이유/);
  assert.match(first.stdout, /주사위 선택/);
  assert.match(first.stdout, /썸네일 \[왼쪽 문틈의 시선 \| 오른쪽 시선의 주인\]/);
  assert.match(first.stdout, /3번 · 눈 \d+ · 경로/);
  assert.doesNotMatch(first.stdout, /undefined|입력 확인/);
  const second = invoke(file, ['play'], 'quit\n');
  assert.match(second.stdout, /이어하기/);
  assert.equal(success(file, 'show').view.phase, 'choose');
});

test('an interrupted Windows copy-back resumes only the committed snapshot', t => {
  const { file } = gameFiles(t);
  success(file, 'new');
  fs.copyFileSync(file, file + '.next');
  fs.writeFileSync(file + '.commit', '');
  fs.writeFileSync(file, '{"interrupted":');
  assert.equal(success(file, 'show').view.phase, 'map');
  failure(file, ['new'], /이미 존재/);
  assert.equal(success(file, 'visit', '1', '--reason', '이전 결정 복원').view.phase, 'management');
  assert.equal(fs.existsSync(file + '.commit'), false);
  assert.equal(fs.existsSync(file + '.next'), false);
  assert.equal(success(file, 'show').view.phase, 'management');
});
