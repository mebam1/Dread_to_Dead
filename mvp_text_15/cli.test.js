import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const cli = fileURLToPath(new URL('./cli.mjs',import.meta.url));

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'dread-text15-cli-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const save = path.join(dir,'smoke.json');
  function run(command, args=[], extras={}) {
    const input = JSON.stringify({command,args,...extras});
    const result = spawnSync(process.execPath,[cli,'--save',save,'--command-json','-'],{input,encoding:'utf8'});
    return {...result,value:result.status===0?JSON.parse(result.stdout):null};
  }
  const started = run('new',[910015,'smoke']);
  assert.equal(started.status,0,started.stderr);
  return {dir,save,run,started};
}

test('CLI labels smoke runs, refuses overwrite, and prints current public state without hidden maps',t=>{
  const {save,run,started} = fixture(t);
  assert.equal(started.value.classification,'smoke');
  assert.equal(started.value.view.phase,'map');
  assert.equal(started.value.view.map,undefined);
  assert.equal(started.value.view.maps,undefined);
  assert.equal(started.value.view.entities[0].name,'문틈의 속삭임');
  const original = fs.readFileSync(save,'utf8');
  const duplicate = run('new',[910015,'smoke']);
  assert.equal(duplicate.status,1);
  assert.equal(fs.readFileSync(save,'utf8'),original);
  const fullMap = run('map');
  assert.equal(fullMap.status,0,fullMap.stderr);
  assert.equal(fullMap.value.view.map.length,22);
  assert.ok(fullMap.value.view.map.every(node=>!('content' in node)));
  assert.equal(fs.readFileSync(save,'utf8'),original);
});

test('CLI choice reason is required and consumed once; failed actions do not alter saved state',t=>{
  const {save,run,started} = fixture(t);
  const first = started.value.view.availableNodes[0].id;
  const original = fs.readFileSync(save,'utf8');
  assert.equal(run('visit',[first]).status,1);
  assert.equal(fs.readFileSync(save,'utf8'),original);
  assert.equal(run('note',['공개된 첫 노드를 방문한다']).status,0);
  const visited = run('visit',[first]);
  assert.equal(visited.status,0,visited.stderr);
  assert.equal(visited.value.view.phase,'management');
  assert.equal(visited.value.pendingReason,null);
  const afterVisit = fs.readFileSync(save,'utf8');
  assert.equal(run('start').status,1);
  assert.equal(fs.readFileSync(save,'utf8'),afterVisit);
  const invalid = run('expand',[],{reason:'진단: 전투 준비에서는 증설을 거절해야 한다'});
  assert.equal(invalid.status,1);
  assert.equal(fs.readFileSync(save,'utf8'),afterVisit);
});

test('CLI previews leave the save unchanged and omit referee state; a legal turn persists its reason',t=>{
  const {save,run,started} = fixture(t);
  assert.equal(run('visit',[started.value.view.availableNodes[0].id],{reason:'첫 노드'}).status,0);
  assert.equal(run('start',[],{reason:'기본 배치로 시작'}).status,0);
  const rolled = run('roll');
  assert.equal(rolled.status,0,rolled.stderr);
  assert.equal(rolled.value.view.dice.length,3);
  const original = fs.readFileSync(save,'utf8');
  const preview = run('preview');
  assert.equal(preview.status,0,preview.stderr);
  assert.equal(preview.value.result.length,3);
  for (const candidate of preview.value.result) {
    assert.equal(candidate.state,undefined);
    assert.equal(candidate.after.maps,undefined);
    assert.equal(candidate.after.map,undefined);
  }
  assert.equal(fs.readFileSync(save,'utf8'),original);
  const played = run('play',[0],{reason:'스모크: 공개된 첫 주사위를 선택',actions:[]});
  assert.equal(played.status,0,played.stderr);
  const session = JSON.parse(fs.readFileSync(save,'utf8'));
  assert.equal(session.journal.at(-1).command,'play');
  assert.equal(session.journal.at(-1).reason,'스모크: 공개된 첫 주사위를 선택');
  assert.ok(session.journal.at(-1).events.some(event=>event.kind==='choose'));
});

test('CLI checkpoint copies the state as a control source and never overwrites a label',t=>{
  const {save,run} = fixture(t);
  const initial = JSON.parse(fs.readFileSync(save,'utf8')).state;
  const checkpoint = run('checkpoint',['expansion-source']);
  assert.equal(checkpoint.status,0,checkpoint.stderr);
  const file = checkpoint.value.result.checkpoint;
  const snapshot = JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(snapshot.classification,'control-source');
  assert.deepEqual(snapshot.state,initial);
  const before = fs.readFileSync(file,'utf8');
  assert.equal(run('checkpoint',['expansion-source']).status,1);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});

test('CLI recovers an interrupted replacement only from a valid complete session copy',t=>{
  const {save,run} = fixture(t);
  const recovery = `${save}.recovery`;
  fs.copyFileSync(save,recovery);
  fs.writeFileSync(save,'{"interrupted":');
  const restored = run('show');
  assert.equal(restored.status,0,restored.stderr);
  assert.equal(restored.value.view.phase,'map');
  assert.ok(restored.value.recoveryNotice);
  const mutated = run('note',['복구한 상태에서 다음 선택 이유를 기록한다']);
  assert.equal(mutated.status,0,mutated.stderr);
  const persisted = JSON.parse(fs.readFileSync(save,'utf8'));
  assert.equal(persisted.pendingReason.text,'복구한 상태에서 다음 선택 이유를 기록한다');
  assert.equal(persisted.state.phase,'map');
  assert.equal(fs.existsSync(recovery),false);
  fs.writeFileSync(save,'{"interrupted-again":');
  fs.writeFileSync(recovery,'{"invalid":true}');
  assert.equal(run('show').status,1);
});

test('CLI catalog and revealed reward/shop cards expose known effects without unseen tables',t=>{
  const {save,run} = fixture(t);
  const original = fs.readFileSync(save,'utf8');
  const catalog = run('catalog');
  assert.equal(catalog.status,0,catalog.stderr);
  assert.equal(catalog.value.creatures.length,6);
  assert.equal(catalog.value.dice.length,4);
  assert.ok(catalog.value.creatures.every(card=>card.name&&card.effects.pass&&card.effects.arrival&&card.effects.active&&card.initialP));
  assert.equal(catalog.value.maps,undefined);
  assert.equal(fs.readFileSync(save,'utf8'),original);
  const session = JSON.parse(original);
  session.classification = 'diagnostic';
  session.state.phase = 'anomaly_reward';
  session.state.reward = {creatures:['U','Q','G']};
  fs.writeFileSync(save,JSON.stringify(session));
  const reward = run('show');
  assert.equal(reward.status,0,reward.stderr);
  assert.equal(reward.value.view.reward.cards[1].name,'이름을 부르는 객실');
  assert.equal(reward.value.view.reward.cards[1].cost,0);
  assert.equal(reward.value.view.reward.cards[1].index,1);
  const shop = session.state.maps[0].find(node=>node.kind==='shop');
  session.state.currentNode = shop.id;
  session.state.phase = 'shop';
  shop.status = 'active';
  shop.contents = {stock:[{slot:0,type:'G',bought:false}]};
  fs.writeFileSync(save,JSON.stringify(session));
  const stocked = run('show');
  assert.equal(stocked.status,0,stocked.stderr);
  assert.equal(stocked.value.view.node.contents.stock[0].name,'닫히지 않는 방화문');
  assert.equal(stocked.value.view.node.contents.stock[0].price,4);
  assert.ok(stocked.value.view.node.contents.stock[0].effects.active);
  assert.equal(stocked.value.view.map,undefined);
});
