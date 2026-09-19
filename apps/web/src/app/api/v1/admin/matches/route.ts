import { executeMatchReview } from '@fantasy/application';
import { matchReviewCommandSchema } from '@fantasy/contracts';
import { staffMutation } from '@/server/staff-mutation';
export function POST(request: Request): Promise<Response> {
  return staffMutation(
    request,
    matchReviewCommandSchema,
    ({ db, principal, grants }, input) =>
      executeMatchReview(db, principal, grants, input),
  );
}
