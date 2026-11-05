// Derive observations from the public ledger. No simulation, hidden draws, or inferred wins.
export function growthReport(s) {
  const acts = Array.from({length: s.act}, (_, i) => ({
    act: i + 1, grant: 2, carried: 0, earned: 0, purchases: [], shops: [],
    occupancy: [], rewards: [], fusions: [], upgrades: [], discarded: [],
  }));
  const encounters = [];
  const tracked = new Map();
  let firstFull = null;
  let occupied = 0;
  let reason = '';

  function track(entry, id, source, details) {
    tracked.set(id, {id, source, act: entry.act, nodeId: entry.nodeId, reason,
      encounterOffset: encounters.length, byBattle: new Map(), ...details});
  }

  for (const e of s.journal) {
    const act = acts[e.act - 1];
    switch (e.type) {
      case 'decision': reason = e.reason; break;
      case 'income': if (!e.boss) act.earned += e.paid; break;
      case 'act-end': acts[e.nextAct - 1].carried = e.souls - 2; break;
      case 'shop-open': {
        const prices = e.stock.map(slot => slot.price).sort((a, b) => a - b);
        act.shops.push({nodeId: e.nodeId, wallet: e.souls,
          cheapestThree: prices.slice(0, 3).reduce((sum, price) => sum + price, 0)});
        break;
      }
      case 'purchase':
        act.purchases.push({nodeId: e.nodeId, source: e.source, type: e.creature, paid: e.paid, reason});
        break;
      case 'reward-choice':
        act.rewards.push({nodeId: e.nodeId, offered: e.options, chosen: e.creature, reason});
        break;
      case 'acquired':
        if (e.source === 'start') occupied++;
        else track(e, e.id, e.source, {type: e.creature});
        break;
      case 'placed':
        occupied++;
        if (!firstFull && occupied === 10) firstFull = {act: e.act, nodeId: e.nodeId};
        break;
      case 'discard':
        if (!e.incoming) occupied--;
        act.discarded.push({nodeId: e.nodeId, id: e.id, incoming: e.incoming, replacement: e.replacement, reason});
        break;
      case 'contract':
      case 'destroy': occupied--; break;
      case 'fusion':
        occupied--;
        act.fusions.push({nodeId: e.nodeId, a: e.a, b: e.b, c: e.c, donor: e.inherited, freeFloor: e.freeFloor, reason});
        track(e, e.c, 'fusion', {donor: e.inherited});
        break;
      case 'upgrade': act.upgrades.push({nodeId: e.nodeId, id: e.id, reason}); break;
      case 'node-complete': act.occupancy.push({nodeId: e.nodeId, occupied: e.occupied}); break;
      case 'guest-entry': if (e.index === 0) encounters.push(e.nodeId); break;
    }

    if (!['fear', 'gain', 'active', 'pass-defense', 'footstep-growth', 'hit'].includes(e.type)) continue;
    const sourceId = e.type === 'gain' || e.type === 'pass-defense' ? e.source : e.id;
    const entity = tracked.get(sourceId);
    if (!entity) continue;
    const byBattle = entity.byBattle;
    const contribution = byBattle.get(e.nodeId) ?? {
      fearApplied: 0, donorFear: 0, resourcesGained: 0, quickUses: 0,
      defenseGranted: 0, absorbedOnSelf: 0, redirectedHits: 0, damageRepaired: 0,
      footstepGrowth: 0, donorResources: 0, donorQuickUses: 0,
    };
    byBattle.set(e.nodeId, contribution);
    if (e.type === 'fear') {
      contribution.fearApplied += e.amount;
      if (e.part === 'donor') contribution.donorFear += e.amount;
    } else if (e.type === 'gain') {
      contribution.resourcesGained += e.amount;
      if (e.part === 'donor') contribution.donorResources += e.amount;
    } else if (e.type === 'hit') {
      contribution.absorbedOnSelf += e.absorbed;
      if (e.floor !== e.receiver) contribution.redirectedHits++;
    } else if (e.type === 'pass-defense') contribution.defenseGranted += e.amount;
    else if (e.type === 'footstep-growth') contribution.footstepGrowth++;
    else {
      contribution.quickUses++;
      if (e.part === 'donor') contribution.donorQuickUses++;
      contribution.defenseGranted += e.defenseGranted ?? 0;
      contribution.damageRepaired += e.repaired ?? 0;
    }
  }

  const followUp = [...tracked.values()].map(({encounterOffset, byBattle, ...record}) => ({
    ...record, nextTwoBattles: encounters.slice(encounterOffset, encounterOffset + 2)
      .map(nodeId => ({nodeId, contribution: byBattle.get(nodeId) ?? null})),
  }));
  return structuredClone({version: s.version, seed: s.seed, result: s.result, firstFull, acts, followUp});
}
