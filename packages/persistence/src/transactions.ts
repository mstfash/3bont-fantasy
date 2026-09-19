import type { Pool, PoolClient } from 'pg';
import type { Db } from 'pg-boss';

/** The callback must not commit/release the client. No automatic retry of an uncertain COMMIT. */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let begun = false;
  let discard = false;
  try {
    await client.query('BEGIN');
    begun = true;
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (begun) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discard = true;
        throw new AggregateError(
          [error, rollbackError],
          'Transaction failed and rollback could not be confirmed',
          { cause: rollbackError },
        );
      }
    } else discard = true;
    throw error;
  } finally {
    client.release(discard);
  }
}

/** Bridge pg-boss send(..., { db }) onto the SAME connection as the application write. */
export function pgBossTransactionDb(client: PoolClient): Db {
  return {
    async executeSql(text, values) {
      const result = await client.query<Record<string, unknown>>(text, values);
      return { rows: result.rows };
    },
  };
}
