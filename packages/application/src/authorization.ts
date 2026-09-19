import type { StaffRole } from '@fantasy/contracts';
export type { StaffRole } from '@fantasy/contracts';
export type Capability =
  | 'staff.manage'
  | 'competition.manage'
  | 'results.replay'
  | 'provider.acceptance.manage'
  | 'facts.manage'
  | 'moderation.manage'
  | 'prizes.prepare'
  | 'prizes.approve'
  | 'sponsors.manage'
  | 'operations.read';

export interface Principal {
  readonly accountId: string;
  readonly sessionId: string;
  readonly emailVerified: boolean;
  readonly mfaVerifiedAt: Date | null;
  readonly authenticatedAt: Date;
}
export interface StaffGrant {
  readonly role: StaffRole;
  readonly competitionId: string | null;
}

const capabilities: Readonly<Record<StaffRole, readonly Capability[]>> = {
  owner: [
    'staff.manage',
    'competition.manage',
    'facts.manage',
    'results.replay',
    'provider.acceptance.manage',
    'moderation.manage',
    'prizes.prepare',
    'prizes.approve',
    'sponsors.manage',
    'operations.read',
  ],
  'competition-manager': ['competition.manage', 'operations.read'],
  'data-steward': ['facts.manage', 'operations.read'],
  moderator: ['moderation.manage'],
  'prize-manager': ['prizes.prepare'],
  'prize-approver': ['prizes.approve'],
  'sponsor-manager': ['sponsors.manage'],
  'support-viewer': ['operations.read'],
};

export function capabilityScopes(
  grants: readonly StaffGrant[],
  capability: Capability,
): readonly (string | null)[] {
  return [
    ...new Set(
      grants
        .filter((grant) => capabilities[grant.role].includes(capability))
        .map((grant) => grant.competitionId),
    ),
  ];
}

export class AccessDenied extends Error {
  constructor() {
    super('Access denied');
    this.name = 'AccessDenied';
  }
}

/** Principal and grants must be loaded server-side for the current request. */
export function requireCapability(
  principal: Principal,
  grants: readonly StaffGrant[],
  capability: Capability,
  competitionId: string | null,
  now: Date,
  recentAuthentication = false,
): void {
  const mfaAge =
    principal.mfaVerifiedAt === null
      ? Infinity
      : now.getTime() - principal.mfaVerifiedAt.getTime();
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(principal.authenticatedAt.getTime()) ||
    !Number.isFinite(mfaAge)
  )
    throw new AccessDenied();
  if (
    !principal.emailVerified ||
    mfaAge < 0 ||
    mfaAge > (recentAuthentication ? 15 * 60_000 : 8 * 60 * 60_000)
  )
    throw new AccessDenied();
  if (
    recentAuthentication &&
    (now.getTime() - principal.authenticatedAt.getTime() > 15 * 60_000 ||
      principal.authenticatedAt > now)
  )
    throw new AccessDenied();
  const allowed = grants.some(
    (grant) =>
      (grant.competitionId === null ||
        (competitionId !== null && grant.competitionId === competitionId)) &&
      capabilities[grant.role].includes(capability),
  );
  if (!allowed) throw new AccessDenied();
}

export function requireEntryOwner(
  principal: Principal,
  accountId: string,
): void {
  if (!principal.emailVerified || principal.accountId !== accountId)
    throw new AccessDenied();
}
