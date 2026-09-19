import { executeSnapshotRepair } from '@fantasy/application';
import { snapshotRepairCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    snapshotRepairCommandSchema,
    async ({ db, principal }, input) => ({
      gameweek: await executeSnapshotRepair(db, principal, input),
    }),
    12000,
  );
}
