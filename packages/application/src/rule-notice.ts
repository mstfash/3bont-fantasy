import { z } from 'zod';
import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import { idSchema, instantSchema, type Gameweek } from '@fantasy/contracts';
import { CommandRejected } from './errors.ts';
const recordedPlan = z.object({
  rulePlan: z.object({
    announcedAt: instantSchema,
    noticeRequired: z.boolean(),
    economicStart: z.int().nullable(),
    changed: z.array(z.string()),
    updates: z.array(z.object({ gameweekId: idSchema })),
  }),
});
/** A calendar edit must not shorten an already announced rule/grant notice period. */
export async function protectRuleNotice(
  tx: Transaction<Database>,
  competitionId: string,
  rounds: readonly Pick<Gameweek, 'id' | 'number' | 'deadline'>[],
): Promise<void> {
  const [audits, grants] = await Promise.all([
    tx
      .selectFrom('audit_events')
      .select('payload')
      .where('scope_id', '=', competitionId)
      .where('action', '=', 'competition.update')
      .execute(),
    tx
      .selectFrom('chip_grants')
      .select('data')
      .where('competition_id', '=', competitionId)
      .execute(),
  ]);
  function checkOpening(number: number, announcedAt: string): void {
    const previous = rounds
      .filter((r) => r.number < number)
      .sort((a, b) => b.number - a.number)[0];
    if (
      !previous ||
      Date.parse(previous.deadline) < Date.parse(announcedAt) + 48 * 3600000
    )
      throw new CommandRejected('announced-notice-protected');
  }
  for (const audit of audits) {
    const parsed = recordedPlan.safeParse(audit.payload);
    if (!parsed.success || !parsed.data.rulePlan.noticeRequired) continue;
    const plan = parsed.data.rulePlan;
    if (plan.economicStart !== null)
      checkOpening(plan.economicStart, plan.announcedAt);
    if (
      plan.changed.some(
        (key) => !['transfer', 'enabledChips', 'chipWindows'].includes(key),
      )
    ) {
      for (const update of plan.updates) {
        const round = rounds.find((r) => r.id === update.gameweekId);
        if (
          !round ||
          Date.parse(round.deadline) <
            Date.parse(plan.announcedAt) + 48 * 3600000
        )
          throw new CommandRejected('announced-notice-protected');
      }
    }
  }
  for (const { data: grant } of grants) {
    const round = rounds.find((r) => r.id === grant.gameweekId);
    if (!round) throw new CommandRejected('announced-notice-protected');
    checkOpening(round.number, grant.announcedAt);
  }
}
