import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for use in API routes.
 *
 * Strategy:
 * 1. If SUPABASE_SERVICE_ROLE_KEY is set → use it (bypasses RLS, needed for storage and RPCs)
 * 2. Otherwise → fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * NOTE: We do NOT cache the client at module level. In Next.js dev with hot reload,
 * module-level singletons become stale between reloads and can cause subtle auth bugs.
 * Client construction is cheap (no network call) — create per-request is correct here.
 */

function buildClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input, options) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout
        try {
          return await fetch(input, { ...options, signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
      },
    },
  });
}

export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    console.error('[SUPABASE] NEXT_PUBLIC_SUPABASE_URL is not set');
    return null;
  }

  if (serviceKey) {
    return buildClient(url, serviceKey);
  }

  if (anonKey) {
    console.warn('[SUPABASE] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. RPCs and storage may fail.');
    return buildClient(url, anonKey);
  }

  console.error('[SUPABASE] No API key available. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  return null;
}

/**
 * Returns which key type the server client would use (for diagnostics).
 */
export function getServerKeyType(): 'service_role' | 'anon' | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return 'service_role';
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return 'anon';
  return null;
}
