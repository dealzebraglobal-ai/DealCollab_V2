import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Database client initialization.
 *
 * NOTE: We avoid throwing an error at the top level if DATABASE_URL is missing.
 * This prevents 'next build' from failing during static analysis on Vercel
 * when environment variables might not be fully available.
 *
 * POOLER NOTE: Supabase port 6543 = transaction pooler (short-lived, stateless).
 * Auth.js `database` session strategy requires persistent connections — use the
 * session pooler (port 5432) or direct connection instead. We derive this
 * automatically by swapping the port.
 */
const rawConnectionString = process.env.DATABASE_URL ?? "";

// Swap transaction pooler port (6543) to session pooler port (5432) for Auth.js compatibility
const connectionString = rawConnectionString.replace(/:6543\//, ":5432/");

// Singleton pattern for the database pool to prevent multiple connections in development
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const pool = globalForDb.pool ?? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Connection resilience
  max: 5,                   // Cap pool size — Supabase free tier allows ~60 connections
  idleTimeoutMillis: 30000, // Release idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect within 5s (not 13s)
  keepAlive: true,
});

// Surface pool-level errors without crashing the process
pool.on("error", (err) => {
  console.error("[DB POOL] Unexpected idle client error:", err.message);
});

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });

