import type { createDatabase } from '@fantasy/persistence';
import {
  competitionUpdateSchema,
  type CompetitionUpdate,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import {
  loadCompetitionUpdateBasis,
  planCompetitionUpdate,
} from './competition-update-plan.ts';

export async function previewCompetitionUpdate(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: CompetitionUpdate,
) {
  const command = competitionUpdateSchema.parse(input);
  requireCapability(
    principal,
    grants,
    'competition.manage',
    command.competitionId,
    new Date(),
    true,
  );
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'competition.manage',
      command.competitionId,
    );
    const { current, rounds } = await loadCompetitionUpdateBasis(tx, command);
    return (await planCompetitionUpdate(tx, current, command, rounds)).impact;
  });
}
