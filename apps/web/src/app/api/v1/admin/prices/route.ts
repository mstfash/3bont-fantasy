import { executePriceBatchCommand } from '@fantasy/application';
import { priceBatchCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    priceBatchCommandSchema,
    async ({ db, principal, grants }, input) => ({
      batch: await executePriceBatchCommand(db, principal, grants, input),
    }),
  );
}
