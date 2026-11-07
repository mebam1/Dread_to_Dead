// Compact CLI harness for the recorded, manually selected validation run.
// This script never chooses a move; all mutations must be supplied as arguments.
import {runCommand} from './cli.mjs';
import {fileURLToPath} from 'node:url';
const save=fileURLToPath(new URL('./runs/manual-31001.json',import.meta.url));
function call(args) {
  return runCommand(['--save',save,...args]);
}
const args=process.argv.slice(2);
const out=call(args.length?args:['show']);
if(!out.view) console.log(JSON.stringify(out));
else {
  const v=out.view;
  console.log(JSON.stringify({phase:v.phase,node:v.node?.id,coins:v.coins,allies:v.floors.map((e,i)=>e?`${i+1}:${e.id}:${e.type}${e.upgraded?'+':''}${e.fusion?'+'+e.fusion.bType:''}=${e.hp}/${e.maxHp}`:null).filter(Boolean),round:v.battle?.round,dice:v.battle?.dice,turn:v.battle?.turn,enemies:v.battle?.enemies.map(e=>`${e.id}:${e.type}@${e.pos}=${e.hp}`),rewards:v.rewards.map(e=>`${e.slot}:${e.type}`),shop:v.shop.map(e=>`${e.slot}:${e.type}${e.purchased?'(구매)':''}`),reachable:v.reachable.map(e=>`${e.id}:${e.kind}:${e.enemies.map(x=>x.type).join('')}`),pending:v.pending?.entity.name}));
  if(v.phase==='prepare') {
    const {preview}=call(['preview']);
    console.log(JSON.stringify(preview.map(p=>({companion:p.companion,slot:p.slot,die:p.die,complete:p.complete,cases:p.scenarios.length}))));
  }
}
