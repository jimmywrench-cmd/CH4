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
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      // Serverless functions are short-lived and Supabase's pooler
      // will close idle sockets on its own end after a while — if a
      // pg.Pool client sits idle past that point, the next query on
      // it fails with "Connection terminated unexpectedly". Recycling
      // idle clients well before that happens avoids the intermittent
      // failures this caused (e.g. chat sometimes not loading).
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // Without this handler, an idle client erroring in the background
    // (e.g. the pooler closing it) throws an unhandled 'error' event
    // that can crash the whole serverless invocation.
    pool.on("error", (err) => {
      console.error("Postgres pool idle client error (recovered):", err.message);
    });
    global._ch4Pool = pool;
  }
  return global._ch4Pool;
}

function isRetryableConnectionError(err: any) {
  const msg = String(err?.message ?? "");
  return (
    err?.code === "ECONNRESET" ||
    err?.code === "57P01" || // admin shutdown
    msg.includes("Connection terminated") ||
    msg.includes("terminated unexpectedly") ||
    msg.includes("timeout")
  );
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  try {
    const res = await pool.query(text, params);
    return res.rows as T[];
  } catch (err: any) {
    if (isRetryableConnectionError(err)) {
      // One retry on a fresh connection — covers the case where the
      // pool handed us a socket the remote side had already closed.
      const res = await pool.query(text, params);
      return res.rows as T[];
    }
    throw err;
  }
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
