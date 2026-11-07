import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {
  COMMAND_ARGS, RULE_VERSION, catalog, createGame, execute, previewBattle,
  previewFusion, publicJournal, publicView, report, upgradeSave,
} from '../mvp_text_20/engine.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const staticFiles = new Set([
  '/index.html', '/app.js', '/ui.js', '/battle.js', '/battle.css', '/touch-dice.js',
  '/campaign.js', '/campaign.css', '/styles.css', '/combat-feedback.js', '/feedback.css',
]);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
};
const format = 'dread-to-dead/user7-save/1';
const legacyFormat = 'dread-to-dead/user6-save/1';

function httpError(status, message) {
  return Object.assign(new Error(message), {status});
}

function persist(file, session) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = file + '.tmp-' + randomUUID();
  try {
    fs.writeFileSync(temp, JSON.stringify(session), {encoding: 'utf8', flag: 'wx', mode: 0o600});
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, {force: true});
  }
}

function readSession(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const session = {format, revision: 0, state: createGame(31001)};
    persist(file, session);
    return session;
  }
  const session = JSON.parse(text);
  if (![format, legacyFormat].includes(session?.format) || !Number.isSafeInteger(session.revision) || session.revision < 0 ||
      session.state?.floors?.length !== 10 || !Array.isArray(session.state.journal)) {
    throw new Error('현재 판의 저장 형식을 읽을 수 없습니다.');
  }
  if (session.format !== format || session.state.version !== RULE_VERSION) {
    const next = {format, revision: session.revision + 1, state: upgradeSave(session.state)};
    persist(file, next);
    return next;
  }
  return session;
}

function latestCombat(state) {
  const empty = {lastBattleEvents: [], lastBattleStart: null};
  if (state.phase === 'management') return empty;
  const journal = state.journal;
  const start = journal.findLastIndex(e => e.type === 'battle-start');
  if (start < 0) return empty;
  const action = journal.findLastIndex(e => e.type === 'decision' &&
    (e.command === 'start' || (e.phase === 'prepare' && ['move', 'active', 'exit'].includes(e.command))));
  const first = action >= 0 ? action : start;
  let end = first + 1;
  while (end < journal.length && journal[end].type !== 'decision') end++;
  return {lastBattleEvents: journal.slice(first, end), lastBattleStart: journal[start]};
}

function envelope(session, view = publicView(session.state)) {
  return {view, revision: session.revision, catalog: catalog(), journal: publicJournal(session.state, 20),
    ...latestCombat(session.state)};
}

function checkOrigin(req) {
  const port = req.socket.localPort;
  const hosts = port === 80 ? ['localhost', '127.0.0.1', 'localhost:80', '127.0.0.1:80'] :
    ['localhost:' + port, '127.0.0.1:' + port];
  const host = req.headers.host?.toLowerCase();
  if (!hosts.includes(host)) throw httpError(403, '로컬 게임 주소로 접속하세요.');
  const expected = new URL('http://' + host).origin;
  if ((req.headers.origin !== undefined && req.headers.origin !== expected) ||
      req.headers['sec-fetch-site'] === 'cross-site') {
    throw httpError(403, '로컬 게임 화면에서만 요청할 수 있습니다.');
  }
}

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw httpError(415, 'JSON 요청이 필요합니다.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) throw httpError(413, '요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Reject malformed JSON before touching the game. */ }
  throw httpError(400, 'JSON 객체가 필요합니다.');
}

function checkedDecision(decide) {
  try { return decide(); }
  catch (error) { throw httpError(400, error.message); }
}

function mutate(session, pathname, body, saveFile) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw httpError(400, '현재 진행 번호가 필요합니다.');
  if (body.revision !== session.revision) throw httpError(409, '다른 화면에서 진행했습니다. 현재 판을 다시 확인하세요.');
  let state, view;
  let previousEvents = 0;
  if (pathname === '/api/new') {
    if (!Number.isSafeInteger(body.seed) || body.seed < 0) throw httpError(400, '0 이상의 정수 판 번호를 입력하세요.');
    state = createGame(body.seed);
  } else {
    if (typeof body.cmd !== 'string' || !Object.hasOwn(COMMAND_ARGS, body.cmd) || !Array.isArray(body.args)) {
      throw httpError(400, '게임 행동과 인자를 확인하세요.');
    }
    // The engine clones before applying a command. Publish its new state only after saving succeeds.
    state = {...session.state};
    previousEvents = state.journal.length;
    view = checkedDecision(() => execute(state, body.cmd, body.args, '화면에서 선택한 명령 ' + body.cmd));
  }
  const next = {format, revision: session.revision + 1, state};
  const output = envelope(next, view);
  output.events = publicJournal(state, state.journal.length - previousEvents);
  persist(saveFile, next);
  return {next, output};
}

async function sendStatic(pathname, res, headOnly) {
  let name;
  try { name = decodeURIComponent(pathname); }
  catch { throw httpError(400, '잘못된 파일 주소입니다.'); }
  if (name === '/') name = '/index.html';
  const asset = name.startsWith('/assets/') && name.slice(8).split('/').every(part =>
    part.length && !part.startsWith('.') && !/[\\:\x00-\x1f]/.test(part));
  const ext = path.extname(name).toLowerCase();
  if (!staticFiles.has(name) && !(asset && ['.png', '.webp', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ico'].includes(ext))) {
    throw httpError(404, '파일을 찾을 수 없습니다.');
  }
  let data;
  try {
    const target = await fs.promises.realpath(path.join(root, name.slice(1)));
    const base = asset ? path.join(root, 'assets') : root;
    if (!target.startsWith(base + path.sep)) throw httpError(404, '파일을 찾을 수 없습니다.');
    data = await fs.promises.readFile(target);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR') throw httpError(404, '파일을 찾을 수 없습니다.');
    throw error;
  }
  res.writeHead(200, {'Content-Type': mime[ext], 'Content-Length': data.length});
  res.end(headOnly ? undefined : data);
}

/** One local server owns this campaign. A revision check, decision and atomic replacement
 * execute together after the entire request body has arrived, including for overlapping tabs. */
export function createGameServer({saveFile = process.env.USER7_SAVE || path.join(root, 'saves', 'current.json')} = {}) {
  let session;
  function current() {
    session ??= readSession(saveFile);
    return session;
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    function json(status, value) {
      res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify(value));
    }
    try {
      checkOrigin(req);
      if (!req.url.startsWith('/') || req.url.startsWith('//')) throw httpError(400, '잘못된 주소입니다.');
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (!route.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, '허용되지 않은 요청 방식입니다.');
        return await sendStatic(route, res, req.method === 'HEAD');
      }
      if (['/api/new', '/api/action'].includes(route)) {
        if (req.method !== 'POST') throw httpError(405, 'POST 요청이 필요합니다.');
        const body = await readBody(req);
        const {next, output} = mutate(current(), route, body, saveFile);
        session = next;
        return json(200, output);
      }
      if (req.method !== 'GET') throw httpError(405, 'GET 요청이 필요합니다.');
      let result;
      switch (route) {
        case '/api/state': result = envelope(current()); break;
        case '/api/journal': result = publicJournal(current().state, Number.MAX_SAFE_INTEGER); break;
        case '/api/report': result = report(current().state); break;
        case '/api/preview': {
          const {state, revision} = current();
          const id = url.searchParams.get('id'), slot = url.searchParams.get('slot');
          const direction = url.searchParams.get('direction');
          const preview = dir => checkedDecision(() => previewBattle(state, id, slot, dir));
          result = direction === null ? {left: preview('left'), right: preview('right'), revision}
            : {...preview(direction), revision};
          break;
        }
        case '/api/fusion': {
          const state = current().state;
          result = checkedDecision(() => previewFusion(state, url.searchParams.get('a'), url.searchParams.get('b')));
          break;
        }
        default: throw httpError(404, 'API를 찾을 수 없습니다.');
      }
      json(200, result);
    } catch (error) {
      if (res.destroyed) return;
      if (!error.status) console.error(error);
      json(error.status ?? 500, {error: error.status ? error.message : '현재 판을 읽거나 저장할 수 없습니다.'});
    }
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, {detached: true, stdio: 'ignore', windowsHide: true});
  child.on('error', () => console.error('위 주소를 브라우저에서 여세요.'));
  child.unref();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 4177);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT는 유효한 포트 번호여야 합니다.');
  const server = createGameServer();
  server.on('error', async error => {
    if (error.code === 'EADDRINUSE' && process.argv.includes('--open')) {
      const url = 'http://127.0.0.1:' + port;
      try {
        const response = await fetch(url + '/api/state', {signal:AbortSignal.timeout(2000)});
        if (response.ok && (await response.json()).view?.version === RULE_VERSION) {
          openBrowser(url);
          return;
        }
      } catch { /* Report a port conflict when the listener is not this game. */ }
    }
    console.error(error.code === 'EADDRINUSE' ? '이 포트는 이미 사용 중입니다. 실행 중인 게임을 확인하세요.' : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + server.address().port;
    console.log('Dread to Dead · 안개숲 원정 7  ' + url);
    if (process.argv.includes('--open')) openBrowser(url);
  });
}
