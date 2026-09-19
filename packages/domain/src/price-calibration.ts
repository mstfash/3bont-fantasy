import {
  POSITIONS,
  type SelectedFootballer,
  type SquadRules,
} from './squads.ts';
import { fantasyTicks } from './quantities.ts';
import { assessPlayerPool } from './player-pool.ts';
import {
  proposePerformancePrice,
  type PerformancePriceRules,
  type PriceObservation,
  type PerformancePriceProposal,
} from './performance-pricing.ts';

export interface CalibrationPlayer extends SelectedFootballer {
  readonly pinned: boolean;
  readonly selectable: boolean;
}
export interface CalibrationRound {
  readonly id: string;
  readonly number: number;
  readonly deadline: string;
  readonly finalizedAt: string | null;
  readonly revision: number;
  readonly observations: readonly (PriceObservation & {
    readonly footballerId: string;
  })[];
}
export interface CalibrationCandidate {
  readonly label: string;
  readonly rules: PerformancePriceRules & { readonly freezeHours: number };
}

/** A counterfactual replay from today's pool, never a reconstruction of historical purchases or prices. */
export function calibratePrices(
  players: readonly CalibrationPlayer[],
  rounds: readonly CalibrationRound[],
  squad: SquadRules,
  candidates: readonly CalibrationCandidate[],
  cutoff: string,
) {
  const end = Date.parse(cutoff);
  const calendar = [...rounds].sort((a, b) => a.number - b.number);
  if (
    !Number.isFinite(end) ||
    !players.length ||
    players.length > 1000 ||
    rounds.length > 100 ||
    candidates.length < 1 ||
    candidates.length > 3 ||
    new Set(players.map((p) => p.footballerId)).size !== players.length ||
    new Set(rounds.map((r) => r.id)).size !== rounds.length
  )
    throw new RangeError('Invalid calibration bounds');
  for (const [i, r] of calendar.entries()) {
    const previous = calendar[i - 1];
    if (
      !Number.isFinite(Date.parse(r.deadline)) ||
      (previous &&
        (previous.number >= r.number ||
          Date.parse(previous.deadline) >= Date.parse(r.deadline))) ||
      (r.finalizedAt !== null &&
        (!Number.isFinite(Date.parse(r.finalizedAt)) ||
          Date.parse(r.finalizedAt) < Date.parse(r.deadline) ||
          r.revision < 1)) ||
      new Set(r.observations.map((o) => o.footballerId)).size !==
        r.observations.length ||
      r.observations.some(
        (o) =>
          o.gameweekId !== r.id ||
          o.number !== r.number ||
          o.revision !== r.revision,
      )
    )
      throw new RangeError('Invalid calibration calendar');
  }
  const events = [
    ...new Set([
      end,
      ...calendar.flatMap((r) => [
        Date.parse(r.deadline),
        ...(r.finalizedAt ? [Date.parse(r.finalizedAt)] : []),
      ]),
    ]),
  ]
    .filter((t) => t <= end)
    .sort((a, b) => a - b);
  const metrics = (pool: readonly CalibrationPlayer[]) => {
    const affordable = assessPlayerPool(
      pool.filter((p) => p.selectable),
      { ...squad, startingBudget: fantasyTicks(Number.MAX_SAFE_INTEGER) },
    );
    const minimum = affordable.ready ? affordable.minimumCost : null;
    return {
      totalTicks: pool.reduce((s, p) => s + BigInt(p.price), 0n).toString(),
      positions: POSITIONS.map((position) => ({
        position,
        count: pool.filter((p) => p.position === position).length,
        totalTicks: pool
          .filter((p) => p.position === position)
          .reduce((s, p) => s + BigInt(p.price), 0n)
          .toString(),
      })),
      minimumSquadTicks: minimum?.toString() ?? null,
      affordable: minimum !== null && minimum <= BigInt(squad.startingBudget),
      cheapestSquad: affordable.ready ? [...affordable.footballerIds] : [],
    };
  };
  const baseline = metrics(players);
  const results = candidates.map((candidate) => {
    if (
      !Number.isSafeInteger(candidate.rules.freezeHours) ||
      candidate.rules.freezeHours < 0 ||
      candidate.rules.freezeHours > 168
    )
      throw new RangeError('Invalid freeze hours');
    for (const p of players)
      proposePerformancePrice(p.price, p.pinned, [], candidate.rules);
    let current = players.map((p) => ({ ...p }));
    let consumed = 0;
    const publishedTargets = new Set<string>();
    const history = new Map<string, PriceObservation[]>();
    const batches: {
      at: string;
      editingGameweekId: string;
      sourceGameweekIds: string[];
      changes: {
        footballerId: string;
        oldPrice: number;
        newPrice: number;
        reason: PerformancePriceProposal['reason'];
      }[];
      holds: Partial<Record<PerformancePriceProposal['reason'], number>>;
      market: ReturnType<typeof metrics>;
    }[] = [];
    for (const at of events) {
      let available = consumed;
      while (
        calendar[available]?.finalizedAt &&
        Date.parse(calendar[available]?.finalizedAt ?? '') <= at
      )
        available++;
      if (available === consumed) continue;
      const target = calendar.find((r) => Date.parse(r.deadline) > at);
      if (
        !target ||
        publishedTargets.has(target.id) ||
        at >=
          Date.parse(target.deadline) - candidate.rules.freezeHours * 3600_000
      )
        continue;
      const sources = calendar.slice(consumed, available);
      for (const r of sources)
        for (const o of r.observations) {
          const values = history.get(o.footballerId) ?? [];
          values.push(o);
          history.set(o.footballerId, values);
        }
      const changes: (typeof batches)[number]['changes'] = [];
      const holds: (typeof batches)[number]['holds'] = {};
      current = current.map((p) => {
        const proposal = proposePerformancePrice(
          p.price,
          p.pinned,
          history.get(p.footballerId) ?? [],
          candidate.rules,
        );
        if (proposal.newPrice !== p.price)
          changes.push({
            footballerId: p.footballerId,
            oldPrice: p.price,
            newPrice: proposal.newPrice,
            reason: proposal.reason,
          });
        else holds[proposal.reason] = (holds[proposal.reason] ?? 0) + 1;
        return { ...p, price: proposal.newPrice };
      });
      batches.push({
        at: new Date(at).toISOString(),
        editingGameweekId: target.id,
        sourceGameweekIds: sources.map((r) => r.id),
        changes,
        holds,
        market: metrics(current),
      });
      consumed = available;
      publishedTargets.add(target.id);
    }
    return {
      label: candidate.label,
      batches,
      final: metrics(current),
      finalPrices: current.map((p) => ({
        footballerId: p.footballerId,
        price: p.price,
      })),
      deferredGameweekIds: calendar
        .slice(consumed)
        .filter((r) => r.finalizedAt && Date.parse(r.finalizedAt) <= end)
        .map((r) => r.id),
    };
  });
  return { version: 'price-calibration-v1' as const, baseline, results };
}
