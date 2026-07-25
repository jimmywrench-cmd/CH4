import { Pool } from "pg";

// Server-only. Never import this from a Client Component.
// Uses the direct Postgres connection string from your Supabase
// project (Settings -> Database -> Connection string -> URI).
// This bypasses PostgREST/RLS by design — all auth/role checks
// happen in lib/auth.ts and the API routes before any query runs.

declare global {
  // eslint-disable-next-line no-var
  var _ch4Pool: Pool | undefined;
}

function getPool(): Pool {
  if (!global._ch4Pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in."
      );
    }
    global._ch4Pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return global._ch4Pool;
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
