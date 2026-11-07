// One value per act. Damage is per occupied tile hit, including a revisit after a bounce.
export const ENEMY_PATTERNS = {
  vanguard:{name:'추격 타격', damage:[17,25,34]},
  patrol:  {name:'반사 경로 공격', damage:[14,21,28]},
  sweep:   {name:'추격 광역 공격', damage:[14,21,28]},
  medic:   {name:'이동 치유', healing:[8,12,16]},
};

// Initial and repeat counters count committed card moves.
const normalActions = {
  A:['vanguard', 2, 6], B:['patrol', 3, 7], C:['sweep', 4, 6],
  D:['medic', 2, 5], E:['patrol', 3, 7], F:['vanguard', 1, 5],
};
const eliteActions = {attack:['vanguard',2,6], guard:['patrol',4,7], support:['medic',2,5]};
const bossActions = {...eliteActions, attack:['sweep',3,6]};

// Map generation, health and formation RNG come from the existing campaign.
// Install the current rule set exactly when a new act's map becomes available.
export function configureEncounters(map) {
  for (const node of map) {
    for (const enemy of node.enemies) {
      const actions = node.kind === 'boss' ? bossActions : eliteActions;
      const [pattern, firstCounter, period] = normalActions[enemy.type] ?? actions[enemy.role];
      const stats = ENEMY_PATTERNS[pattern];
      enemy.pattern = pattern;
      enemy.firstCounter = firstCounter;
      enemy.period = period;
      enemy.attack = stats.damage?.[node.act-1] ?? 0;
      enemy.healing = stats.healing?.[node.act-1] ?? 0;
      if (pattern === 'medic') enemy.role = 'support';
      delete enemy.strong;
    }
  }
}
