import { Pool } from 'pg';

/**
 * Postgres pool. Server-side only.
 *
 * Cached on globalThis so Next.js hot reload in dev does not open a new pool
 * on every edit and exhaust connections.
 */
declare global {
  // eslint-disable-next-line no-var
  var __vi_pool: Pool | undefined;
}

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — the app is using the in-memory store');
  }
  if (!globalThis.__vi_pool) {
    globalThis.__vi_pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__vi_pool;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}
