import { rankEntries } from '@fantasy/domain';
import type { PrizeAward, PrizePool, PrizePreview } from '@fantasy/contracts';
/** Published goods equivalents are used only for sporting ties. No identity resolves a tie. */
export function allocatePrizeAwards(
  pool: PrizePool,
  candidates: PrizePreview['candidates'],
) {
  const seen = new Set<string>();
  const names = new Map(candidates.map((c) => [c.entryId, c.entryName]));
  const eligible = rankEntries(
    candidates.filter((c) => c.eligible),
    pool.ranking,
  ).filter((c) => {
    if (!pool.oneAwardPerAccount) return true;
    if (seen.has(c.accountId)) return false;
    seen.add(c.accountId);
    return true;
  });
  const ranked = rankEntries(eligible, pool.ranking),
    awards: PrizeAward[] = [],
    issues: string[] = [];
  let residueMinor = 0;
  for (const rank of new Set(ranked.map((c) => c.rank))) {
    if (rank > pool.places.length) break;
    const tied = ranked.filter((c) => c.rank === rank);
    const rewards = pool.places.slice(rank - 1, rank - 1 + tied.length);
    if (rewards.length === 0) continue;
    if (tied.length === 1) {
      const entry = tied[0],
        reward = rewards[0];
      if (entry && reward)
        awards.push({
          entryId: entry.entryId,
          accountId: entry.accountId,
          entryName: names.get(entry.entryId) ?? '',
          rank,
          reward,
        });
      continue;
    }
    if (
      rewards.some((r) => r.kind === 'goods' && r.cashEquivalentMinor === null)
    ) {
      issues.push(`goods-tie-needs-resolution:${String(rank)}`);
      continue;
    }
    const pot = rewards.reduce(
      (sum, r) =>
        sum +
        BigInt(
          r.kind === 'cash' ? r.amountMinor : (r.cashEquivalentMinor ?? 0),
        ),
      0n,
    );
    const amount = pot / BigInt(tied.length);
    residueMinor += Number(pot % BigInt(tied.length));
    if (amount > 0n)
      for (const entry of tied)
        awards.push({
          entryId: entry.entryId,
          accountId: entry.accountId,
          entryName: names.get(entry.entryId) ?? '',
          rank,
          reward: { kind: 'cash', amountMinor: Number(amount) },
        });
  }
  const unallocatedMinor = pool.places
    .slice(ranked.length)
    .reduce((sum, r) => sum + (r.kind === 'cash' ? r.amountMinor : 0), 0);
  return { awards, residueMinor, unallocatedMinor, issues };
}
