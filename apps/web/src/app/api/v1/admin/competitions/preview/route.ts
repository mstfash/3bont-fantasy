import { previewCompetitionUpdate } from '@fantasy/application';
import { competitionUpdateSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';

export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    competitionUpdateSchema,
    async ({ db, principal, grants }, input) => ({
      impact: await previewCompetitionUpdate(db, principal, grants, input),
    }),
  );
}
