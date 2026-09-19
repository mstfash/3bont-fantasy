import { type Transaction } from 'kysely';
import {
  prizeProposalSchema,
  type PrizeCommand,
  type PrizeProposal,
  type PrizePool,
} from '@fantasy/contracts';
import type { Database } from '@fantasy/persistence';
import { CommandRejected } from './errors.ts';
import { calculatePrizePreview } from './prize-preview.ts';
type Transition = Extract<
  PrizeCommand,
  { kind: 'review' | 'approve' | 'fulfill' | 'void' }
>;
export async function transitionPrizeProposal(
  tx: Transaction<Database>,
  pool: PrizePool,
  proposal: PrizeProposal,
  command: Transition,
  actorId: string,
  now: Date,
): Promise<PrizeProposal> {
  if (proposal.revision !== command.expectedRevision)
    throw new CommandRejected('prize-proposal-changed');
  if (command.kind === 'void') {
    if (proposal.state === 'fulfilled' || proposal.state === 'voided')
      throw new CommandRejected('prize-transition-unavailable');
    return prizeProposalSchema.parse({
      ...proposal,
      revision: proposal.revision + 1,
      state: 'voided',
    });
  }
  const required = {
    review: 'prepared',
    approve: 'reviewed',
    fulfill: 'approved',
  } as const;
  if (proposal.state !== required[command.kind])
    throw new CommandRejected('prize-transition-unavailable');
  const preview = await calculatePrizePreview(tx, pool);
  if (preview.fingerprint !== proposal.preview.fingerprint)
    throw new CommandRejected('prize-proposal-stale');
  if (preview.issues.length)
    throw new CommandRejected('prize-proposal-blocked');
  if (preview.awards.some((a) => a.accountId === actorId))
    throw new CommandRejected('prize-self-award');
  if (command.kind === 'approve' && proposal.preparedBy === actorId)
    throw new CommandRejected('prize-distinct-approver-required');
  const time = now.toISOString(),
    base = { ...proposal, revision: proposal.revision + 1 };
  if (command.kind === 'review')
    return prizeProposalSchema.parse({
      ...base,
      state: 'reviewed',
      reviewedBy: actorId,
      reviewedAt: time,
    });
  if (command.kind === 'approve')
    return prizeProposalSchema.parse({
      ...base,
      state: 'approved',
      approvedBy: actorId,
      approvedAt: time,
    });
  return prizeProposalSchema.parse({
    ...base,
    state: 'fulfilled',
    fulfilledBy: actorId,
    fulfilledAt: time,
    fulfillmentReference: command.reference,
  });
}
