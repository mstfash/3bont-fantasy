import { Pool, type PoolConfig } from 'pg';

/** Keep connection error events observable without crashing the process.
 * Query/transaction failures still reject their caller; no write is retried here.
 */
export function createManagedPool(configuration: PoolConfig): Pool {
  const pool = new Pool(configuration);
  const observe = () => {
    console.error('PostgreSQL connection lost');
  };
  pool.on('error', observe);
  // A checked-out connection may emit an error between queries (for example
  // while a failed transaction is trying to roll back). Pool events cover only
  // idle connections, so both lifecycles need an observer.
  pool.on('connect', (client) => client.on('error', observe));
  return pool;
}
