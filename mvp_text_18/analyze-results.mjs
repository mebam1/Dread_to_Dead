import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('./validation/',import.meta.url));
const runs=JSON.parse(fs.readFileSync(dir+'automated-summary.json')).runs;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const result={groups:[],longBattles:[],terminalBattles:[],economy:[],elite2:[]};
for(const policy of ['preview-heuristic','fixed-assignment']) {
  const states=runs.filter(r=>r.policy===policy).map(r=>JSON.parse(fs.readFileSync(dir+`automated-${r.seed}-${policy}.save.json`)).state);
  for(let act=1;act<=3;act++) {
    const battles=states.flatMap(s=>s.stats.battles.filter(b=>b.act===act));
    if(!battles.length) continue;
    const wins=battles.filter(b=>b.outcome==='win');
    const hits=states.flatMap(s=>s.journal.filter(e=>e.act===act&&e.type==='damage'&&e.side==='enemy'));
    const attacks=hits.filter(e=>e.label!=='poison');
    const normal=battles.filter(b=>b.kind==='normal'&&b.secondKillRound!==null);
    const rounds=states.flatMap(s=>s.journal.filter(e=>e.act===act&&e.type==='round-end').map(e=>({node:e.node,round:e.round,hits:s.journal.filter(d=>d.node===e.node&&d.round===e.round&&d.type==='damage'&&d.side==='enemy').reduce((a,d)=>a+d.hpLoss,0)})));
    result.groups.push({policy,act,battles:battles.length,wins:wins.length,escapes:battles.filter(b=>b.outcome==='escape').length,defeats:battles.filter(b=>b.outcome==='loss').length,meanRounds:mean(battles.map(b=>b.rounds)),meanWinRounds:mean(wins.map(b=>b.rounds)),maxRounds:Math.max(...battles.map(b=>b.rounds)),over15:battles.filter(b=>b.rounds>15).length,meanLastEnemyTail:mean(normal.map(b=>b.rounds-b.secondKillRound)),enemyDamageEvents:hits.length,meanPreProtectionDamage:mean(hits.map(h=>h.amount)),nonPoisonDamageEvents:attacks.length,meanNonPoisonPreProtectionDamage:mean(attacks.map(h=>h.amount)),roundEnds:rounds.length,noEnemyHpDamageRounds:rounds.filter(r=>r.hits===0).length});
  }
  for(const s of states) {
    for(let act=1;act<=s.act;act++) result.economy.push({seed:s.seed,policy,act,
      wins:s.stats.battles.filter(b=>b.act===act&&b.outcome==='win').length,
      rewards:s.stats.acquired.filter(a=>a.act===act&&a.source==='reward').length,
      purchases:s.stats.purchases.filter(p=>p.act===act).length,
      income:s.journal.filter(e=>e.act===act&&e.type==='income').reduce((n,e)=>n+e.amount,0),
      fusions:s.stats.fusions.filter(f=>f.act===act).length,upgrades:s.stats.upgrades.filter(u=>u.act===act).length});
    for(const b of s.stats.battles.filter(b=>b.act===2&&b.kind==='elite')) result.elite2.push({seed:s.seed,policy,...b,start:s.journal.find(e=>e.node===b.node&&e.type==='battle-start')?.allies});
    for(const b of s.stats.battles.filter(b=>b.rounds>15)) {
      const journal=s.journal.filter(e=>e.node===b.node);
      result.longBattles.push({seed:s.seed,policy,...b,start:journal.find(e=>e.type==='battle-start')?.allies,losses:journal.filter(e=>e.type==='companion-lost'),penalties:journal.filter(e=>e.type==='inactivity-penalty').length});
    }
    const b=s.stats.battles.at(-1),events=s.journal.filter(e=>e.node===b.node);
    result.terminalBattles.push({seed:s.seed,policy,...b,start:events.find(e=>e.type==='battle-start')?.allies,losses:events.filter(e=>e.type==='companion-lost')});
  }
}
fs.writeFileSync(dir+'analysis-metrics.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
