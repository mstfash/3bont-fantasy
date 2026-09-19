import { sql, type Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
/** Take after staff authority and before competition locks. Prevent assignment phantoms in a global review. */
export async function protectFixtureAssignments(tx: Transaction<Database>) {
  await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended('fixture-assignment-review',0))`.execute(
    tx,
  );
}
export async function freezeFixtureAssignments(tx: Transaction<Database>) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('fixture-assignment-review',0))`.execute(
    tx,
  );
}
