import { executeHistoricalRules } from '@fantasy/application';
import { historicalRuleCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    historicalRuleCommandSchema,
    async ({ db, principal }, input) => ({
      gameweek: await executeHistoricalRules(db, principal, input),
    }),
    20000,
  );
}
