import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for use in API routes.
 * 
 * Strategy:
 * 1. If SUPABASE_SERVICE_ROLE_KEY is set → use it (bypasses RLS, needed for storage)
 * 2. Otherwise → fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY (works for DB operations)
 * 
 * This ensures the app never returns "service unavailable" just because
 * the service role key is missing — DB operations still work with the anon key.
 */

let _cachedClient: SupabaseClient | null = null;
let _cachedKeyType: 'service_role' | 'anon' | null = null;

export function createServerSupabaseClient(): SupabaseClient | null {
  // Return cached client if available
  if (_cachedClient) return _cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    console.error("[SUPABASE] NEXT_PUBLIC_SUPABASE_URL is not set");
    return null;
  }

  // Prefer service role key (bypasses RLS — needed for storage)
  if (serviceKey) {
    _cachedKeyType = 'service_role';
    _cachedClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (url, options) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout
          try {
            return await fetch(url, {
              ...options,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }
        }
      }
    });
    return _cachedClient;
  }

  // Fall back to anon key (works for DB, may fail for storage depending on policies)
  if (anonKey) {
    console.warn("[SUPABASE] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. Storage uploads may fail.");
    _cachedKeyType = 'anon';
    _cachedClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (url, options) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout
          try {
            return await fetch(url, {
              ...options,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }
        }
      }
    });
    return _cachedClient;
  }

  console.error("[SUPABASE] No API key available. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return null;
}

/**
 * Returns which key type the server client is using.
 * Useful for diagnostics and conditional logic.
 */
export function getServerKeyType(): 'service_role' | 'anon' | null {
  if (!_cachedKeyType) createServerSupabaseClient(); // Trigger init
  return _cachedKeyType;
}
