#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  COMMAND_ARGS as arity, RULE_VERSION, catalog, createGame, execute, growthReport, loadRuleVersion, previewBattle, previewFusion,
  publicJournal, publicMap, publicView,
} from './engine.mjs';

const defaultSave = fileURLToPath(new URL('./runs/my_game.json', import.meta.url));
const format = 'dread-to-dead/text17-run/1';
const nodeLabels = { normal: '일반 전투', elite: '엘리트', boss: '보스', shop: '상점', event: '이벤트', recovery: '회복', fusion: '융합' };
const phases = {
  map: ['지도', 'visit 노드번호  ·  swap 층 층  ·  preview-fusion A_ID B_ID  ·  map'],
  management: ['전투 준비', 'start  ·  swap 층 층'],
  choose: ['주사위 선택', 'preview [자리]  ·  choose 자리'],
  prepare: ['이동 준비', 'active ID base|donor [대상ID]  ·  exit 빈층  ·  preview  ·  move'],
  shop: ['상점', 'buy 상품번호  ·  swap 층 층  ·  leave'],
  event: ['이벤트', 'cash / deal / contract ID / equip 자리 (해당 제시물)  ·  swap 층 층  ·  skip'],
  recovery: ['회복', 'heal ID [ID]  ·  upgrade ID  ·  swap 층 층  ·  skip'],
  fusion: ['융합', 'preview-fusion A_ID B_ID  ·  fuse A_ID B_ID  ·  swap 층 층  ·  skip'],
  reward: ['괴이 보상', 'reward 후보번호'],
  acquisition: ['획득 처분', 'place 빈층 (만실이면 교체할 층)  ·  discard'],
  die: ['주사위 보상', 'equip 자리  ·  skip'],
  won: ['승리', 'show  ·  journal'],
  lost: ['패배', 'show  ·  journal'],
};
function help(phase) {
  const entries = phase && phases[phase] ? [phases[phase]] : Object.values(phases);
  return [
    'Dread-to-Dead · 텍스트 17',
    'npm start   또는   node cli.mjs [--save 파일] 명령 [인자] [--reason "선택 이유"]',
    'new [판번호]  ·  play [새 판번호] (이어하기)  ·  fork 새파일 (현재 결정에서 비교 분기)',
    'show 현재 공개 상태  ·  map 지도와 손님  ·  catalog 괴이·주사위  ·  journal [개수]  ·  report 성장 기록  ·  help',
    ...entries.map(([name, commands]) => name + '  ' + commands),
    'give-up 포기  ·  quit 대화 종료. 자리·층·후보·노드번호는 1부터 센다.',
  ].join('\n');
}

function parseInput(tokens) {
  const fields = { save: defaultSave, reason: '', words: [] };
  const seen = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (word === '--save' || word === '--reason') {
      const next = tokens[++i];
      if (seen.has(word) || !next?.trim() || next.startsWith('--')) {
        throw new Error(word + '에 값 하나를 지정하세요.');
      }
      seen.add(word);
      if (word === '--save') fields.save = path.resolve(next);
      else fields.reason = next.trim();
    } else if (word === '--help' || word === '-h') fields.words.push('help');
    else if (word.startsWith('--')) throw new Error('알 수 없는 옵션 ' + word);
    else fields.words.push(word);
  }
  const [command = 'play', ...args] = fields.words;
  return { save: fields.save, reason: fields.reason, command: command === 'giveup' ? 'give-up' : command, args };
}

function requireArgs(args, min, max) {
  if (args.length < min || args.length > max) throw new Error('인자 개수가 맞지 않습니다. help에서 사용법을 확인하세요.');
}

function numberOf(value, label, minimum = 1) {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
    throw new Error(label + '에 ' + minimum + ' 이상의 정수가 필요합니다.');
  }
  return Number(value);
}

function readSession(file) {
  let data;
  try {
    const snapshot = fs.existsSync(file + '.commit') ? file + '.next' : file;
    data = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('저장이 없습니다. new 또는 play로 시작하세요.');
    if (error instanceof SyntaxError) throw new Error('저장 파일의 JSON을 읽을 수 없습니다.');
    throw error;
  }
  if (data?.format !== format || data.rule !== data.state?.version || !['normal', 'control'].includes(data.group) || !loadRuleVersion(data.state)) {
    throw new Error('이 버전의 텍스트 17 저장 파일이 아닙니다.');
  }
  data.rule = RULE_VERSION;
  return data;
}

function hasSession(file) {
  return fs.existsSync(file) || fs.existsSync(file + '.commit');
}

function withLock(file, action) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + '.lock';
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('다른 진행 명령이 저장을 사용 중입니다. 잠시 후 다시 시도하세요.');
    throw error;
  }
  try {
    fs.writeFileSync(lockFd, String(process.pid));
    return action();
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

function readSaved(file) {
  if (!hasSession(file)) throw new Error('저장이 없습니다. new 또는 play로 시작하세요.');
  return withLock(file, () => readSession(file));
}

// A completed .next becomes authoritative at the exclusive creation of the
// empty commit marker. Thus a Windows denial of rename-over-existing, or a
// crash during copy-back, cannot expose a partially replaced game.
function finishCopy(file) {
  fs.copyFileSync(file + '.next', file);
  fs.unlinkSync(file + '.commit');
  fs.unlinkSync(file + '.next');
}

function writeTransaction(file, createOnly, change) {
  return withLock(file, () => {
    if (createOnly && hasSession(file)) throw new Error('이미 존재하는 저장입니다. 새 파일명을 선택하세요.');
    if (fs.existsSync(file + '.commit')) finishCopy(file);
    const { session, output } = change(createOnly ? undefined : readSession(file));
    const temp = file + '.tmp-' + randomUUID();
    try {
      fs.writeFileSync(temp, JSON.stringify(session) + '\n', { encoding: 'utf8', flag: 'wx' });
      try {
        fs.renameSync(temp, file);
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EEXIST'].includes(error.code)) throw error;
        fs.copyFileSync(temp, file + '.next');
        fs.writeFileSync(file + '.commit', '', { flag: 'wx' });
        try {
          finishCopy(file);
        } catch (copyError) {
          process.stderr.write('저장은 완료됐습니다. 다음 기록 때 주 파일을 복구합니다. ' + copyError.code + '\n');
        }
      }
      return output;
    } finally {
      fs.rmSync(temp, { force: true });
    }
  });
}

function viewResult(session, publicState = publicView(session.state)) {
  // A full 20-node map is useful on demand, but repeating it for every die
  // choice makes the visible battle and actions difficult to find.
  const { map, ...view } = publicState;
  return { classification: session.group, view: { ...view, reachable: map.filter(node => node.reachable) } };
}

function run({ command, args, save, reason }) {
  if (command === 'help') {
    requireArgs(args, 0, 0);
    return { help: help(hasSession(save) ? publicView(readSaved(save).state).phase : undefined) };
  }
  if (command === 'catalog') {
    requireArgs(args, 0, 0);
    return { catalog: catalog() };
  }
  if (command === 'new') {
    requireArgs(args, 0, 1);
    const seed = numberOf(args[0] ?? 31001, '판 번호', 0);
    return writeTransaction(save, true, () => {
      const session = { format, rule: RULE_VERSION, group: 'normal', state: createGame(seed) };
      return { session, output: viewResult(session) };
    });
  }
  if (command === 'fork') {
    requireArgs(args, 1, 1);
    const source = readSaved(save);
    const destination = path.resolve(args[0]);
    return writeTransaction(destination, true, () => {
      const session = { ...source, group: 'control', parent: path.resolve(save) };
      return { session, output: { ...viewResult(session), destination } };
    });
  }
  if (Object.hasOwn(arity, command)) {
    requireArgs(args, ...arity[command]);
    if (!reason?.trim()) throw new Error('선택 이유를 --reason "..."으로 남겨 주세요.');
    return writeTransaction(save, false, session => {
      const view = execute(session.state, command, args, reason);
      return { session, output: viewResult(session, view) };
    });
  }
  const session = readSaved(save);
  const s = session.state;
  switch (command) {
    case 'view':
    case 'show':
      requireArgs(args, 0, 0);
      return viewResult(session);
    case 'map':
      requireArgs(args, 0, 0);
      return { map: publicMap(s) };
    case 'preview':
      requireArgs(args, 0, 1);
      if (args.length === 0 && publicView(s).phase === 'choose') {
        return { preview: [1, 2, 3].map(slot => ({ slot, result: previewBattle(s, slot) })) };
      }
      return { preview: previewBattle(s, args.length ? numberOf(args[0], '주사위 자리') : undefined) };
    case 'preview-fusion':
      requireArgs(args, 2, 2);
      return { preview: previewFusion(s, ...args) };
    case 'journal':
      requireArgs(args, 0, 1);
      return { journal: publicJournal(s, numberOf(args[0] ?? 10, '기록 개수')) };
    case 'report':
      requireArgs(args, 0, 0);
      return { classification: session.group, report: growthReport(s) };
    default:
      throw new Error('알 수 없는 명령 ' + command + '. help를 확인하세요.');
  }
}

function humanView(view) {
  const { creatures, dice } = catalog();
  const cardName = key => creatures[key]?.name ?? key;
  const cardText = card => card.baseText + '  /  강화 ' + card.upgradeText;
  const dieText = type => dice[type].name + ' (' + dice[type].faces.join('·') + ', ' + dice[type].effectText + ')';
  const phase = phases[view.phase] ?? [view.phase, 'help'];
  const lines = [view.act + '막 · ' + phase[0] + ' · 영혼 ' + view.souls + ' · 막 추가 수입 ' + view.actIncome + '/9'];
  lines.push(view.floors.map((entity, i) => {
    if (!entity) return (i + 1) + '층 비어 있음';
    return (i + 1) + '층 ' + entity.id + ' ' + entity.name
      + (entity.fusion ? (entity.upgraded ? '+' : '') + ' [왼쪽 ' + cardName(entity.fusion.thumbnail.left) + ' | 오른쪽 ' + cardName(entity.fusion.thumbnail.right) + ']' : '')
      + ' [' + entity.damage + '/' + entity.limit + ' · 토큰 ' + entity.tokens + '/' + entity.maxTokens
      + (entity.seal ? ' · 봉인 ' + entity.seal : '') + (entity.ambush ? ' · 잠복 ' + entity.ambush : '') + ']';
  }).join(' | '));
  if (view.phase === 'map') {
    lines.push('갈 수 있는 노드 ' + view.reachable.map((node, i) => (i + 1) + '. ' + node.id + ' ' + nodeLabels[node.kind]
      + (node.guests.length ? ' [' + node.guests.map(g => g.name).join('→') + ']' : '')).join('  '));
  }
  if (view.phase === 'management' && view.node?.guests) {
    lines.push('손님 ' + view.node.guests.map(g => g.name).join(' → '));
  }
  const b = view.battle;
  if (b && ['choose', 'prepare'].includes(view.phase)) {
    lines.push(b.guest.name + ' · ' + b.turn + '턴 · 위치 ' + (b.position || '입장 전') + ' · 심장 ' + b.hearts
      + ' · 공포 ' + b.fear + '/' + b.guest.t + ' · 불안 ' + b.anxiety + ' · 탐욕 ' + b.greed + ' · 예언 ' + b.prophecy);
    lines.push('반격 ' + b.guest.attackText + ' · 비활동 ' + b.idle + '/' + b.idleLimit);
    lines.push('주사위 ' + b.rolls.map((value, i) => (i + 1) + '번 ' + dice[view.dice[i]].name + '=' + value).join('  ')
      + (view.phase === 'prepare' ? ' · 확정 눈 ' + b.face : ''));
    if (view.quickActions?.length) {
      lines.push('가능한 속공 ' + view.quickActions.map(a => [a.id, a.side, a.target].filter(Boolean).join(' ')).join(' / '));
    }
  }
  for (const card of view.offerCards) {
    const item = view.shop[card.slot - 1];
    const price = item ? ' · ' + item.price + '영혼' + (item.sold ? ' (품절)' : item.price > view.souls ? ' (영혼 부족)' : '') : '';
    lines.push(card.slot + '. ' + card.name + price + ' · 내구 ' + card.limit + '/' + card.maxTokens + '\n   ' + cardText(card));
  }
  if (view.phase === 'shop' && !view.shop.some(i => !i.sold && i.price <= view.souls)) lines.push('살 수 있는 상품이 없습니다. leave로 떠납니다.');
  if (view.event?.kind === 'luggage') lines.push('잊힌 투숙객의 짐 · 주사위 교체 또는 영혼 ' + view.event.payout + (view.event.payout ? ' (cash)' : ' (막 수입 한도)'));
  if (view.event?.kind === 'room') lines.push('봉인된 객실 · ' + cardName(view.event.type) + ' 구매 (3영혼' + (view.souls < 3 ? ' · 영혼 부족' : ' · deal') + ')\n   ' + cardText(creatures[view.event.type]));
  if (view.event?.kind === 'contract') lines.push('교단의 계약 · 괴이 하나를 영혼 ' + view.event.payout + '에 제거' + (view.event.payout ? ' (contract ID)' : ' (막 수입 한도)'));
  if (view.pending) {
    const e = view.pending.entity;
    lines.push('새 괴이 ' + e.name + ' · 내구 ' + e.limit + '/' + e.maxTokens + '\n   ' + cardText(creatures[e.type]));
    lines.push(view.floors.every(Boolean) ? '만실입니다. place로 교체할 층을 지정하거나 discard로 새 괴이를 버립니다.' : 'place로 빈층을 지정하거나 discard로 새 괴이를 버립니다.');
  }
  const offerDie = view.offerDie ?? view.event?.die;
  if (offerDie) {
    lines.push('제시 주사위 ' + dieText(offerDie));
    lines.push('현재 장착 ' + view.dice.map((type, i) => (i + 1) + '. ' + dieText(type)).join('  '));
  }
  if (view.phase === 'recovery') {
    const alive = view.floors.filter(Boolean);
    lines.push('토큰 회복 대상 ' + (alive.filter(e => e.tokens < e.maxTokens).map(e => e.id).join(', ') || '없음'));
    for (const e of alive.filter(e => !e.upgraded)) lines.push('강화 ' + e.id + ' ' + e.name + ' → ' + e.upgradeText);
  }
  if (view.phase === 'fusion') {
    const ids = view.floors.filter(e => e && !e.fusion).map(e => e.id);
    lines.push(ids.length < 2 ? '재료가 부족합니다. skip으로 방문을 마칩니다.' : '융합 재료 A·B ' + ids.join(', '));
  }
  lines.push('명령  ' + phase[1]);
  return lines.join('\n');
}

function interactiveCommand(line) {
  // The action uses simple positional words. The rest of the line after
  // --reason is prose, so a Korean sentence can be entered without quotes.
  const reasonAt = /(?:^|\s)--reason\s+/.exec(line);
  const head = reasonAt ? line.slice(0, reasonAt.index) : line;
  const words = Array.from(head.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g), m => m[1] ?? m[2] ?? m[3]);
  if (words.includes('--save')) throw new Error('대화 도중 저장을 전환하려면 quit 후 --save로 다시 실행하세요.');
  if (reasonAt) {
    const reason = line.slice(reasonAt.index + reasonAt[0].length).trim().replace(/^"(.*)"$/, '$1');
    words.push('--reason', reason);
  }
  return parseInput(words);
}

function humanPreview(result) {
  const resources = { anxiety: '불안', greed: '탐욕', prophecy: '예언' };
  const end = { 'guest-kill': '손님 처치', win: '전투 완승', loss: '패배', escape: '탈출' };
  const lines = [result.slot + '번 · 눈 ' + result.face + ' · 경로 ' + result.path.join(' → ')];
  for (const e of result.events) {
    if (e.type === 'gain' || e.type === 'spend') lines.push('  ' + e.source + ' ' + resources[e.resource]
      + (e.type === 'gain' ? ' +' : ' −') + e.amount + ' (잔량 ' + e.total + ')');
    if (e.type === 'fear') lines.push('  ' + e.id + ' 공포 +' + e.amount);
    if (e.type === 'heart') lines.push('  심장 제거 · 잔여 ' + e.remaining);
    if (e.type === 'hit') lines.push('  ' + e.floor + '층 타격 → ' + e.receiver + '층 ' + e.id
      + ' · 위력 ' + e.power + ' · 방어 ' + e.absorbed + ' · 피해 ' + e.actual
      + ' · 공략도 ' + e.damage + ' · 남은 토큰 ' + e.tokens + (e.destroyed ? ' · 파괴' : ''));
    if (e.type === 'miss') lines.push('  ' + e.floor + '층 타격 빗나감');
    if (e.type === 'ambush') lines.push('  ' + e.id + ' 잠복 ' + e.previous + ' → ' + e.total);
    if (e.type === 'pass-defense') lines.push('  ' + e.floor + '층 방어 +' + e.amount);
    if (e.type === 'footstep-growth') lines.push('  ' + e.id + ' 도착 불안 누적 ' + e.total);
  }
  for (const u of result.uncertainties) {
    if (u.type === 'ambush-target') lines.push('  잠복 표적 후보 ' + u.floors.join('·') + '층');
    if (u.type === 'inactivity-target') lines.push('  비활동 표적 후보 ' + u.options.map(o =>
      o.floor + '층(' + o.id + ', 공략도 ' + o.damage + '·토큰 ' + o.tokens + (o.destroyed ? '·파괴' : '') + ')').join(', '));
  }
  if (result.outcome) lines.push('  결과 ' + (end[result.outcome] ?? result.outcome));
  return lines.join('\n');
}

async function interactive(input) {
  requireArgs(input.args, 0, 1);
  const existing = hasSession(input.save);
  if (existing && input.args.length) throw new Error('기존 저장은 판 번호를 변경할 수 없습니다. play 또는 새로운 --save를 사용하세요.');
  const opening = run({ ...input, command: existing ? 'show' : 'new' });
  const print = text => process.stdout.write(text + '\n');
  print('Dread-to-Dead · 10층 호텔\n' + (existing ? '이어하기' : '새 판') + '  ' + input.save);
  print('명령을 입력하세요. show는 상세 공개 정보, help는 현재 명령입니다. quit로 저장 후 종료합니다.');
  print(humanView(opening.view));
  const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  const reader = lines[Symbol.asyncIterator]();
  try {
    while (true) {
      process.stdout.write('호텔> ');
      const item = await reader.next();
      if (item.done) break;
      const line = item.value.trim();
      if (!line) continue;
      if (line === 'quit') break;
      try {
        const cmd = interactiveCommand(line);
        cmd.save = input.save;
        if (['new', 'play'].includes(cmd.command)) throw new Error('판을 바꾸려면 quit로 종료한 뒤 새 저장 경로를 지정하세요.');
        if (Object.hasOwn(arity, cmd.command) && !cmd.reason) {
          process.stdout.write('선택 이유 (빈 줄은 취소)> ');
          const next = await reader.next();
          if (next.done) break;
          cmd.reason = next.value.trim();
          if (!cmd.reason) continue;
        }
        const output = run(cmd);
        if (output.help) print(output.help);
        else if (cmd.command === 'preview') {
          const list = Array.isArray(output.preview) ? output.preview.map(item => item.result) : [output.preview];
          for (const result of list) print(humanPreview(result));
        } else if (cmd.command === 'preview-fusion') {
          const p = output.preview;
          print('본체 A ' + p.a + ' ' + p.aName + ' (' + p.aFloor + '층) + 재료 B ' + p.b + ' ' + p.bName + ' (' + p.bFloor + '층)');
          print('A 효과 ' + p.bodyEffect + (p.upgradeEffect ? ' / 적용 강화 ' + p.upgradeEffect : '') + '\nB 효과 ' + p.donorEffect);
          print('결과 ' + p.aFloor + '층 · 공략도 ' + p.damage + '/' + p.stats.limit + ' · 토큰 ' + p.tokens + '/' + p.stats.maxTokens
            + ' · 빈층 ' + p.freeFloor + '층 · 썸네일 [왼쪽 ' + p.aName + ' | 오른쪽 ' + p.bName + ']');
        } else if (cmd.command === 'map') {
          for (const n of output.map) {
            print(n.id + ' ' + nodeLabels[n.kind] + (n.reachable ? ' [방문 가능]' : '') + (n.completed ? ' [완료]' : '')
              + ' → ' + n.next.join(', '));
            if (n.guests.length) print('  ' + n.guests.map(g => g.name + ' (공포 ' + g.t + '·심장 ' + g.h + '·' + g.attackText + ')').join(' / '));
          }
        } else if (output.view && !['show', 'view'].includes(cmd.command)) {
          if (output.destination) print('비교 분기 저장  ' + output.destination);
          print(humanView(output.view));
        } else print(JSON.stringify(output, null, 2));
      } catch (error) {
        print('입력 확인  ' + error.message);
      }
    }
  } finally {
    lines.close();
  }
}

try {
  const input = parseInput(process.argv.slice(2));
  if (input.command === 'play') await interactive(input);
  else {
    const output = run(input);
    process.stdout.write((output.help ?? JSON.stringify(output, null, 2)) + '\n');
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
  process.exitCode = 1;
}
