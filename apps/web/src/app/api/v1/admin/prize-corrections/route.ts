import { prizeCorrectionCommandSchema } from '@fantasy/contracts';
import { executePrizeCorrection } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export async function POST(request: Request) {
  return staffMutation(
    request,
    prizeCorrectionCommandSchema,
    async (context, input) => ({
      result: await executePrizeCorrection(
        context.db,
        context.principal,
        context.grants,
        input,
      ),
    }),
  );
}
