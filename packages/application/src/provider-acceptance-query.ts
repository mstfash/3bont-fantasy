import type { createDatabase } from '@fantasy/persistence';
import {
  providerAcceptancePolicySchema,
  providerAcceptanceSchema,
} from '@fantasy/contracts';
import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { requireCapability, type Principal } from './authorization.ts';
export async function readProviderAcceptance(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
) {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const authority = await loadCurrentStaffWriteContext(tx, principal);
      requireCapability(
        principal,
        authority.grants,
        'facts.manage',
        null,
        authority.now,
      );
      const [bindings, accounts, policies, history] = await Promise.all([
        tx
          .selectFrom('provider_season_bindings')
          .innerJoin(
            'seasons',
            'seasons.id',
            'provider_season_bindings.season_id',
          )
          .select([
            'provider_season_bindings.data as binding',
            'seasons.data as season',
          ])
          .orderBy('provider_season_bindings.id')
          .execute(),
        tx
          .selectFrom('provider_accounts')
          .select('data')
          .where('provider', '=', 'api-football-direct')
          .execute(),
        tx.selectFrom('provider_acceptance_policies').select('data').execute(),
        tx
          .selectFrom('provider_acceptances')
          .select('data')
          .orderBy('decided_at', 'desc')
          .limit(30)
          .execute(),
      ]);
      return {
        bindings,
        accounts: accounts.map((r) => r.data),
        policies: policies.map((r) =>
          providerAcceptancePolicySchema.parse(r.data),
        ),
        history: history.map((r) => providerAcceptanceSchema.parse(r.data)),
      };
    });
}
