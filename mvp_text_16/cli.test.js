import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const CLI=fileURLToPath(new URL('./cli.mjs',import.meta.url));
function fixture(t,classification='smoke'){
  const base=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'dread-text16-'));
  t.after(()=>{
    const target=path.resolve(dir);
    assert.ok(target.startsWith(base+path.sep)&&path.basename(target).startsWith('dread-text16-'));
    fs.rmSync(target,{recursive:true,force:true});
  });
  const save=path.join(dir,'game.json');
  function run(command,args=[],extra={},file=save){
    const p=spawnSync(process.execPath,[CLI,'--save',file,'--command-json','-'],{input:JSON.stringify({command,args,...extra}),encoding:'utf8'});
    return {...p,value:p.status===0?JSON.parse(p.stdout):null};
  }
  const started=run('new',[31001,classification]);assert.equal(started.status,0,started.stderr);
  return {dir,save,run,started};
}
function prepare(f){
  assert.equal(f.run('visit',['a1-d1-c1'],{reason:'첫 전투'}).status,0);
  assert.equal(f.run('start',[],{reason:'배치 완료'}).status,0);
  const rolled=f.run('roll');assert.equal(rolled.status,0,rolled.stderr);return rolled;
}
test('CLI exposes twelve named creatures and public state but no future maps or offers',t=>{
  const f=fixture(t),catalog=f.run('catalog');assert.equal(catalog.value.creatures.length,12);
  assert.equal(f.started.value.view.entities[0].name,'문틈의 시선');assert.equal(f.started.value.view.maps,undefined);assert.equal(f.started.value.view.map,undefined);
  assert.ok(!JSON.stringify(f.started.value).includes('contents'));
  const map=f.run('map');assert.equal(map.value.view.map.length,20);assert.ok(map.value.view.map.every(n=>!('contents' in n)));
});
test('new refuses overwrite; reasons and failed actions preserve the full save',t=>{
  const f=fixture(t),before=fs.readFileSync(f.save,'utf8');
  assert.equal(f.run('new',[31001]).status,1);assert.equal(f.run('visit',['a1-d1-c1']).status,1);assert.equal(fs.readFileSync(f.save,'utf8'),before);
  assert.equal(f.run('note',['첫 노드 방문']).status,0);assert.equal(f.run('visit',['a1-d1-c1']).status,0);
  const after=fs.readFileSync(f.save,'utf8');assert.equal(f.run('expand',[],{reason:'상점 아님'}).status,1);assert.equal(fs.readFileSync(f.save,'utf8'),after);
});
test('CLI preview is readonly and omits referee clones; legal play persists choice and origin',t=>{
  const f=fixture(t);prepare(f);const before=fs.readFileSync(f.save,'utf8'),p=f.run('preview');
  assert.equal(p.status,0,p.stderr);assert.equal(p.value.result.length,3);assert.equal(fs.readFileSync(f.save,'utf8'),before);
  for(const x of p.value.result){assert.equal(x.state,undefined);assert.equal(x.after.maps,undefined);}
  const played=f.run('play',[0],{reason:'공개된 첫 눈으로 진행',actions:[]});assert.equal(played.status,0,played.stderr);
  const save=JSON.parse(fs.readFileSync(f.save,'utf8'));assert.equal(save.journal.at(-1).reason,'공개된 첫 눈으로 진행');assert.equal(save.state.entities[0].origin.kind,'start');
});
test('CLI rejects actives before confirmation and invalid compound plans atomically',t=>{
  const f=fixture(t);prepare(f);const before=fs.readFileSync(f.save,'utf8');
  assert.equal(f.run('active',['e4'],{reason:'확정 전에는 불가'}).status,1);
  assert.equal(f.run('play',[0],{reason:'불법 대상 검증',actions:[{kind:'active',entityId:'missing'}]}).status,1);
  assert.equal(fs.readFileSync(f.save,'utf8'),before);
});
test('checkpoint forks use a new control file and preserve original and source',t=>{
  const f=fixture(t);const cp=f.run('checkpoint',['shop-source']);assert.equal(cp.status,0,cp.stderr);
  const original=fs.readFileSync(f.save,'utf8'),source=fs.readFileSync(cp.value.result.checkpoint,'utf8'),branch=path.join(f.dir,'branch.json');
  const fork=f.run('fork',[cp.value.result.checkpoint],{reason:'원본과 분리한 비교'},branch);assert.equal(fork.status,0,fork.stderr);assert.equal(fork.value.classification,'control');
  assert.equal(f.run('give-up',[],{reason:'분기 종료'},branch).status,0);
  assert.equal(fs.readFileSync(f.save,'utf8'),original);assert.equal(fs.readFileSync(cp.value.result.checkpoint,'utf8'),source);
  assert.equal(f.run('fork',[cp.value.result.checkpoint],{reason:'덮어쓰기 금지'},branch).status,1);
});
test('normal sessions cannot inject fire; diagnostic sessions label the operation',t=>{
  const normal=fixture(t,'normal'),before=fs.readFileSync(normal.save,'utf8');
  assert.equal(normal.run('diagnostic-status',['e1','fire',3],{reason:'정상 주입 불가'}).status,1);assert.equal(fs.readFileSync(normal.save,'utf8'),before);
  const diagnostic=fixture(t,'diagnostic'),r=diagnostic.run('diagnostic-status',['e1','fire',3],{reason:'화재 판정 검사'});
  assert.equal(r.status,0,r.stderr);assert.equal(r.value.view.entities[0].fire,3);assert.equal(r.value.classification,'diagnostic');
});
test('report is readonly and lists four goals as evidence rather than proven value',t=>{
  const f=fixture(t);prepare(f);assert.equal(f.run('play',[2],{reason:'공개된 눈의 결과 기록'}).status,0);
  const before=fs.readFileSync(f.save,'utf8'),r=f.run('report');assert.equal(r.status,0,r.stderr);
  assert.deepEqual(Object.keys(r.value.result.goals),['expansion','shop','freeReward','distinctClears']);
  assert.equal(r.value.result.evidenceOnly,true);assert.equal(r.value.result.goals.distinctClears.clearCase,false);assert.equal(fs.readFileSync(f.save,'utf8'),before);
});
test('saved protocol and state versions reject old or incompatible sessions without mutation',t=>{
  const f=fixture(t);const s=JSON.parse(fs.readFileSync(f.save,'utf8'));s.state.version='user-3-v1.2';fs.writeFileSync(f.save,JSON.stringify(s));
  const before=fs.readFileSync(f.save,'utf8');assert.equal(f.run('show').status,1);assert.equal(fs.readFileSync(f.save,'utf8'),before);
});
