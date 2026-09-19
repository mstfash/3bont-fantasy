import { createHash } from 'node:crypto';
import { suggestInitialPrices } from '@fantasy/domain';
import {
  initialPriceSourceText,
  type Competition,
  type Footballer,
  type SetupCommand,
} from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
/** The setup command owns the competition and footballer locks. Manual adjustments remain explicit in the retained comparison. */
export function reviewInitialPricePublication(
  competition: Competition,
  footballers: readonly Footballer[],
  command: Extract<SetupCommand, { kind: 'pool' }>,
  now: Date,
) {
  const review = command.initialPriceReview;
  if (!review) return null;
  if (competition.status !== 'draft' || competition.firstLockedAt !== null)
    throw new CommandRejected('initial-prices-draft-only');
  const age = now.getTime() - Date.parse(review.asOf);
  if (age < 0 || age > 15 * 60_000)
    throw new CommandRejected('initial-price-review-expired');
  const reviewedPositions = new Map(
    review.positions.map((p) => [p.footballerId, p.position]),
  );
  if (
    reviewedPositions.size !== review.positions.length ||
    reviewedPositions.size !== command.players.length ||
    command.players.some(
      (p) => reviewedPositions.get(p.footballerId) !== p.position,
    )
  )
    throw new CommandRejected('initial-price-positions-changed');
  const selected = new Set(command.players.map((p) => p.footballerId)),
    sources = footballers.filter((p) => selected.has(p.id));
  if (
    sources.length !== selected.size ||
    createHash('sha256')
      .update(initialPriceSourceText(sources))
      .digest('hex') !== review.sourceFingerprint
  )
    throw new CommandRejected('initial-price-source-changed');
  for (const bound of Object.values(review.policy.bounds))
    if (
      bound.minimum < competition.rules.pricing.minimum ||
      bound.maximum > competition.rules.pricing.maximum
    )
      throw new CommandRejected('price-outside-bounds');
  const byId = new Map(sources.map((p) => [p.id, p]));
  const suggestions = suggestInitialPrices(
    command.players.map((p) => ({
      footballerId: p.footballerId,
      position: p.position,
      valuation: byId.get(p.footballerId)?.valuation ?? null,
    })),
    review.policy,
    new Date(review.asOf),
  );
  return {
    calculationVersion: 'valuation-midrank-v1',
    ...review,
    sources,
    suggestions: suggestions.map((s) => {
      const selected = command.players.find(
        (p) => p.footballerId === s.footballerId,
      );
      if (!selected) throw new Error('Missing reviewed pool player');
      return {
        ...s,
        publishedPrice: selected.price,
        manuallyPinned: selected.manuallyPinned,
        selectable: selected.selectable,
        manualAdjustment: s.price === null || s.price !== selected.price,
      };
    }),
  };
}
