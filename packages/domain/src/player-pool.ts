import {
  POSITIONS,
  validateSquadRules,
  type SelectedFootballer,
  type SquadRules,
} from './squads.ts';

interface Edge {
  from: number;
  to: number;
  remaining: number;
  cost: bigint;
  reverse: Edge;
}

export type PoolReadiness =
  | { ready: true; footballerIds: readonly string[]; minimumCost: bigint }
  | {
      ready: false;
      reason: 'invalid-pool' | 'position-or-club-cap' | 'over-budget';
    };

/** A minimum-cost flow proves that a legal, affordable squad actually exists.
 * Greedily taking the cheapest player can exhaust a club needed by another position.
 * Reverse edges let a later selection replace an earlier choice without exhaustive search.
 */
export function assessPlayerPool(
  players: readonly SelectedFootballer[],
  rules: SquadRules,
): PoolReadiness {
  if (
    validateSquadRules(rules).length > 0 ||
    new Set(players.map((p) => p.footballerId)).size !== players.length ||
    players.some(
      (p) =>
        !p.footballerId ||
        !p.clubId ||
        !POSITIONS.includes(p.position) ||
        !Number.isSafeInteger(p.price) ||
        p.price < 0,
    )
  )
    return { ready: false, reason: 'invalid-pool' };
  const clubs = new Map(
    [...new Set(players.map((p) => p.clubId))].map((id, i) => [id, i + 1]),
  );
  const positionNodes = new Map(
    POSITIONS.map((p, i) => [p, clubs.size + 1 + i]),
  );
  const source = 0;
  const sink = clubs.size + POSITIONS.length + 1;
  const edges: Edge[] = [];
  const connect = (
    from: number,
    to: number,
    capacity: number,
    cost: bigint,
  ): Edge => {
    // The pair is cyclic by construction; the reverse links are assigned before use.
    const forward = { from, to, remaining: capacity, cost } as Edge;
    const reverse = {
      from: to,
      to: from,
      remaining: 0,
      cost: -cost,
      reverse: forward,
    };
    forward.reverse = reverse;
    edges.push(forward, reverse);
    return forward;
  };
  for (const node of clubs.values()) connect(source, node, rules.clubCap, 0n);
  for (const position of POSITIONS) {
    const node = positionNodes.get(position);
    if (node === undefined) throw new Error('Missing position node');
    connect(node, sink, rules.quotas[position], 0n);
  }
  const choices = players.map((p) => {
    const club = clubs.get(p.clubId);
    const position = positionNodes.get(p.position);
    if (club === undefined || position === undefined)
      throw new Error('Missing pool node');
    return {
      id: p.footballerId,
      edge: connect(club, position, 1, BigInt(p.price)),
    };
  });
  for (let count = 0; count < rules.squadSize; count++) {
    const distance = new Map<number, bigint>([[source, 0n]]);
    const previous = new Map<number, Edge>();
    // Bellman–Ford handles the negative-cost reverse edges, using exact integer prices.
    for (let iteration = 0; iteration < sink; iteration++) {
      let changed = false;
      for (const edge of edges) {
        const start = distance.get(edge.from);
        if (edge.remaining === 0 || start === undefined) continue;
        const end = distance.get(edge.to);
        const candidate = start + edge.cost;
        if (end === undefined || candidate < end) {
          distance.set(edge.to, candidate);
          previous.set(edge.to, edge);
          changed = true;
        }
      }
      if (!changed) break;
    }
    if (!distance.has(sink))
      return { ready: false, reason: 'position-or-club-cap' };
    let node = sink;
    while (node !== source) {
      const edge = previous.get(node);
      if (!edge) throw new Error('Incomplete selection path');
      edge.remaining -= 1;
      edge.reverse.remaining += 1;
      node = edge.from;
    }
  }
  const selected = choices.filter((p) => p.edge.remaining === 0);
  const minimumCost = selected.reduce((sum, p) => sum + p.edge.cost, 0n);
  if (minimumCost > BigInt(rules.startingBudget))
    return { ready: false, reason: 'over-budget' };
  return { ready: true, footballerIds: selected.map((p) => p.id), minimumCost };
}
