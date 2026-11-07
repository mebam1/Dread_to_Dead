import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGameServer} from './server.mjs';
import {createGame, execute} from '../mvp_text_20/engine.mjs';
import {newEntity} from '../mvp_text_19/shared.mjs';

// A controlled terminal move. At 3 the saint can heal the squire and choir.
// The squire copies the heal from 2, and the choir hits the protected enemy at 3.
export function healingEncounter() {
  const s = createGame(31900);
  execute(s, 'visit', ['1-1-우'], '검사용 전투 진입');
  const [saint, , choir] = s.floors;
  const squire = newEntity(s, 'squire', 'reward');
  s.floors.fill(null);
  s.floors[0] = saint;
  s.floors[2] = squire;
  s.floors[3] = choir;
  saint.hp = 34;
  squire.hp = 26;
  choir.hp = 25;
  s.node.enemies = [{...s.node.enemies[0], type:'C', pattern:'neighbor', role:'guard',
    firstCounter:2, period:3, maxHp:7, protection:3, attack:5}];
  execute(s, 'start', [], '회복·복사·반응 검증');
  s.battle.enemies[0].pos = 3;
  s.battle.dice = [2,5,5];
  return s;
}

export async function temporaryGame(snapshot) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dtd-user7-'));
  const saveFile = path.join(dir, 'campaign.json');
  if (snapshot) await writeFile(saveFile, JSON.stringify(snapshot));
  const server = createGameServer({saveFile});
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {url:'http://127.0.0.1:'+server.address().port, saveFile, async close() {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await rm(dir, {recursive:true, force:true});
  }};
}
