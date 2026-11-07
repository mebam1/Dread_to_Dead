import assert from 'node:assert/strict';
import { CARDS, newEntity } from '../mvp_text_19/shared.mjs';
import { createGame, execute } from './engine.mjs';

// Measure actual HP lost on an occupied tile. Each companion and attacking
// pattern gets one vote, independent of how often a player's formation is hit.
function firstHit(campaign, node, enemy, type) {
  const sample = {
    ...campaign, phase:'management', node:{...node,enemies:[{...enemy,role:'attack',protection:0}]},
    floors:Array(10).fill(null), journal:[],
  };
  const ally = newEntity(sample,type);
  sample.floors[3] = ally;
  execute(sample,'start');
  // Stay clear of the attacker's starting tile. End opposite its first patrol step.
  let x = 4;
  for (let remaining = enemy.firstCounter; remaining > 0; remaining--) {
    x = remaining === 1 ? 3 : x === 4 ? 5 : 4;
    execute(sample,'move',[ally.id,x]);
  }
  const hits = sample.journal.filter(e => e.type === 'damage' && e.source === 'E1' && e.target === ally.id);
  assert.equal(hits.length,1,`막 ${node.act} ${enemy.pattern} / ${type} 적중 수`);
  assert.equal(hits[0].hpBefore,CARDS[type].hp);
  return hits[0].hpLoss / CARDS[type].hp;
}

const campaign = createGame(31001);
const targets = [40,60,80];
console.log('동료 11종 × 적 공격 3종, 각기 만피·미강화로 첫 적중 1회. 자신 방어와 초과 피해 상한 적용, 다른 개체의 지원·대신 받기 없음.');
for (const target of targets) {
  const samples = [];
  for (const pattern of ['vanguard','patrol','sweep']) {
    const node = campaign.map.find(n => n.kind === 'normal' && n.enemies.some(e => e.pattern === pattern));
    assert.ok(node,`막 ${campaign.act}에 ${pattern} 편성이 있어야 합니다.`);
    const enemy = node.enemies.find(e => e.pattern === pattern);
    for (const type of Object.keys(CARDS)) samples.push(firstHit(campaign,node,enemy,type));
  }
  const mean = samples.reduce((a,b)=>a+b,0) * 100 / samples.length;
  console.log(`${campaign.act}막 · ${samples.length}회 · 평균 HP 감소 ${mean.toFixed(1)}% · 목표 ${target}%`);
  assert.ok(Math.abs(mean - target) <= 2,`목표 피해율에서 2%p 넘게 벗어났습니다.`);
  if (campaign.act < 3) {
    // Take the normal boss reward transition to load the next act's real templates.
    campaign.node = campaign.map.find(n => n.kind === 'boss');
    campaign.phase = 'reward';
    execute(campaign,'skip');
  }
}
