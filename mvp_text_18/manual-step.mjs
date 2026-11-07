// Compact CLI harness for the recorded, manually selected validation run.
// This script never chooses a move; all mutations must be supplied as arguments.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
const save=fileURLToPath(new URL('./runs/manual-31001.json',import.meta.url));
function call(args) {
  const r=spawnSync(process.execPath,[cli,'--save',save,...args],{encoding:'utf8'});
  if(r.status) throw Error(r.stderr);
  return JSON.parse(r.stdout);
}
const args=process.argv.slice(2);
const out=call(args.length?args:['show']);
if(!out.view) console.log(JSON.stringify(out));
else {
  const v=out.view;
  console.log(JSON.stringify({phase:v.phase,node:v.node?.id,coins:v.coins,allies:v.floors.map((e,i)=>e?`${i+1}:${e.id}:${e.type}${e.upgraded?'+':''}${e.fusion?'+'+e.fusion.bType:''}=${e.hp}/${e.maxHp}`:null).filter(Boolean),round:v.battle?.round,dice:v.battle?.dice,enemies:v.battle?.enemies.map(e=>`${e.id}:${e.type}@${e.pos}=${e.hp}`),rewards:v.rewards.map(e=>`${e.slot}:${e.type}`),shop:v.shop.map(e=>`${e.slot}:${e.type}${e.purchased?'(구매)':''}`),reachable:v.reachable.map(e=>`${e.id}:${e.kind}:${e.enemies.map(x=>x.type).join('')}`),pending:v.pending?.entity.name}));
  if(v.phase==='choose') {
    const p=call(['preview']).preview;
    console.log(JSON.stringify(p.map(p=>({choice:p.choice,complete:p.complete,cases:p.scenarios.length,results:p.scenarios.map(x=>({outcome:x.outcome,allies:x.allies.map(e=>`${e.id}=${e.hp}`),enemies:x.enemies.map(e=>`${e.id}@${e.pos}=${e.hp}`)})).filter((x,i,a)=>a.findIndex(y=>JSON.stringify(x)===JSON.stringify(y))===i)}))));
  }
}
