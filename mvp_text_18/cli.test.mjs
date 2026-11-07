import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
test('CLI persists, rejects illegal moves without changing save, forks and resumes',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'text18-test-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('text18-test-'));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const save=path.join(dir,'run.json');
  const call=(...args)=>spawnSync(process.execPath,[cli,'--save',save,...args],{encoding:'utf8'});
  assert.equal(call('new','31001').status,0);
  const initial=fs.readFileSync(save,'utf8');
  assert.equal(call('new','31002').status,1);assert.equal(fs.readFileSync(save,'utf8'),initial);
  assert.equal(call('visit','2').status,1);assert.equal(fs.readFileSync(save,'utf8'),initial);
  assert.equal(call('visit','2','--reason','중앙').status,0);
  assert.equal(call('start','--reason','시작').status,0);
  const before=fs.readFileSync(save,'utf8');
  const preview=JSON.parse(call('preview').stdout);assert.equal(preview.preview.length,6);
  assert.equal(fs.readFileSync(save,'utf8'),before);
  assert.equal(call('choose','7','--reason','오류검사').status,1);assert.equal(fs.readFileSync(save,'utf8'),before);
  const fork=path.join(dir,'fork.json');assert.equal(call('fork',fork).status,0);
  const f=JSON.parse(fs.readFileSync(fork));assert.equal(f.group,'control');assert.deepEqual(f.state,JSON.parse(before).state);
  assert.equal(call('choose','3','--reason','지원 처치').status,0);assert.equal(call('move','--reason','진행').status,0);
  assert.equal(JSON.parse(call('show').stdout).view.battle.round,2);
  // Simulate interrupted Windows copy-back: the committed .next is authoritative.
  fs.copyFileSync(save,save+'.next');fs.writeFileSync(save+'.commit','');fs.writeFileSync(save,'partial');
  assert.equal(call('show').status,0);
  assert.equal(call('choose','1','--reason','복구 뒤 진행').status,0);
  assert.equal(fs.existsSync(save+'.commit'),false);assert.equal(fs.existsSync(save+'.lock'),false);
});
