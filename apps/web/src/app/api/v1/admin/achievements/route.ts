import { achievementCommandSchema } from '@fantasy/contracts';
import { executeAchievementCommand } from '@fantasy/application';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request) {
  return staffMutation(
    request,
    achievementCommandSchema,
    async ({ db, principal, grants }, command) => ({
      result: await executeAchievementCommand(db, principal, grants, command),
    }),
  );
}
