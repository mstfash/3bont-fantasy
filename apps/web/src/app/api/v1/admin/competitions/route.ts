import { executeCompetitionCommand } from '@fantasy/application';
import { competitionCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';

export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    competitionCommandSchema.refine(
      (input) => input.kind !== 'update' || !!input.expectedImpactFingerprint,
      'Review configuration impact before confirming',
    ),
    async ({ db, principal, grants }, input) => ({
      competition: await executeCompetitionCommand(
        db,
        principal,
        grants,
        input,
      ),
    }),
  );
}
