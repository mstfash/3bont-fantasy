import {
  capabilityScopes,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
export function requirePrizeReader(
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
) {
  const capability = capabilityScopes(grants, 'prizes.prepare').some(
    (s) => s === null || s === competitionId,
  )
    ? 'prizes.prepare'
    : 'prizes.approve';
  requireCapability(principal, grants, capability, competitionId, new Date());
}

/** Call only after authenticating the staff session; this checks scope, not session freshness. */
export function hasPrizeReadScope(
  grants: readonly StaffGrant[],
  competitionId: string,
) {
  return [
    ...capabilityScopes(grants, 'prizes.prepare'),
    ...capabilityScopes(grants, 'prizes.approve'),
  ].some((scope) => scope === null || scope === competitionId);
}
