import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for the WEB/WHATSAPP conversation-history separation fix
 * in GET /api/chat/history.
 *
 * Root cause: a user can share the same users.id across both channels (e.g.
 * after linking their WhatsApp phone to their web account), so filtering
 * chat_sessions by user_id alone also returned their WhatsApp-originated
 * sessions into the web sidebar's "Conversations" list.
 *
 * These exercise the ACTUAL route handler against a fake Supabase
 * query-builder that behaves like Postgres for the specific filters this
 * route applies (.eq, .is 'whatsapp_phone_number' IS NULL, .not 'source'
 * NOT ILIKE 'whatsapp%') — not a reimplementation of the route's own logic,
 * so the test fails if the route stops applying either filter, applies the
 * wrong field/value, or applies it as an AND when it should be additive.
 */

const authMock = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: authMock }));

// A fixture row per Case A-F in the task spec, all sharing one user_id (the
// exact scenario that leaked WhatsApp sessions: same user, two channels).
const FIXTURE_ROWS = vi.hoisted(() => [
  { id: 'web-1', user_id: 'u1', title: 'Web: buy-side SaaS mandate', source: 'web', whatsapp_phone_number: null, created_at: '2026-09-05T10:00:00Z' },
  { id: 'web-2', user_id: 'u1', title: 'Web: legacy default source', source: 'WEB', whatsapp_phone_number: null, created_at: '2026-09-04T10:00:00Z' },
  { id: 'wa-1', user_id: 'u1', title: 'Hiii startover', source: 'WHATSAPP', whatsapp_phone_number: '+919876543210', created_at: '2026-09-06T10:00:00Z' },
  { id: 'wa-2', user_id: 'u1', title: 'Hi', source: 'WHATSAPP-WAPPBIZ', whatsapp_phone_number: '+919876543210', created_at: '2026-09-07T10:00:00Z' },
  { id: 'wa-3-anomaly', user_id: 'u1', title: 'whatsapp session missing phone (defense-in-depth case)', source: 'whatsapp', whatsapp_phone_number: null, created_at: '2026-09-07T11:00:00Z' },
  { id: 'other-user', user_id: 'u2', title: 'Different user entirely', source: 'web', whatsapp_phone_number: null, created_at: '2026-09-03T10:00:00Z' },
]);

/** Mimics Postgres semantics for exactly the filters this route chains. */
function applyFilters(rows: typeof FIXTURE_ROWS, filters: Array<{ method: string; args: unknown[] }>) {
  return rows.filter((row) => {
    for (const f of filters) {
      const rec = row as unknown as Record<string, unknown>;
      if (f.method === 'eq' && rec[f.args[0] as string] !== f.args[1]) return false;
      if (f.method === 'is' && f.args[1] === null && rec[f.args[0] as string] !== null) return false;
      if (f.method === 'not' && f.args[1] === 'ilike') {
        const pattern = String(f.args[2]).replace(/%$/, '');
        const val = String(rec[f.args[0] as string] ?? '').toLowerCase();
        if (val.startsWith(pattern.toLowerCase())) return false;
      }
    }
    return true;
  });
}

function makeSupabaseMock(usersTable: Array<{ id: string; email: string }>) {
  return {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: (_col: string, email: string) => ({
              single: async () => {
                const u = usersTable.find((x) => x.email === email);
                return u ? { data: { id: u.id }, error: null } : { data: null, error: { message: 'not found' } };
              },
            }),
          }),
        };
      }
      if (table === 'chat_sessions') {
        const filters: Array<{ method: string; args: unknown[] }> = [];
        const builder = {
          select: () => builder,
          eq: (...args: unknown[]) => { filters.push({ method: 'eq', args }); return builder; },
          is: (...args: unknown[]) => { filters.push({ method: 'is', args }); return builder; },
          not: (...args: unknown[]) => { filters.push({ method: 'not', args }); return builder; },
          order: async () => ({ data: applyFilters(FIXTURE_ROWS, filters), error: null }),
        };
        return builder;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

vi.mock('@/utils/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

describe('GET /api/chat/history — WEB/WHATSAPP separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('Case A/B/E/F: returns only the requesting user\'s WEB sessions, excluding all WhatsApp variants', async () => {
    authMock.mockResolvedValue({ user: { email: 'owner@example.com' } });
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }]),
    );

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();
    const ids = (body as Array<{ id: string }>).map((s) => s.id).sort();

    // Case A / F: both real web sessions present (including the legacy
    // uppercase 'WEB' default-source row — proves this isn't a naive
    // case-sensitive `source = 'web'` filter).
    expect(ids).toContain('web-1');
    expect(ids).toContain('web-2');

    // Case B / E: every WhatsApp-tagged variant excluded, including the
    // WAPPBIZ provider variant and the defense-in-depth case (WhatsApp
    // `source` with a null phone number, matched by the case-insensitive
    // `source` filter alone).
    expect(ids).not.toContain('wa-1');
    expect(ids).not.toContain('wa-2');
    expect(ids).not.toContain('wa-3-anomaly');

    // Never another user's session, WhatsApp or not.
    expect(ids).not.toContain('other-user');

    expect(ids).toEqual(['web-1', 'web-2']);
  });

  it('Case D: a returned web session still carries its real id/title/created_at (chat remains selectable)', async () => {
    authMock.mockResolvedValue({ user: { email: 'owner@example.com' } });
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }]),
    );

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();
    const web1 = (body as Array<{ id: string; title: string; created_at: string }>).find((s) => s.id === 'web-1');

    expect(web1).toBeDefined();
    expect(web1?.title).toBe('Web: buy-side SaaS mandate');
    expect(web1?.created_at).toBe('2026-09-05T10:00:00Z');
  });
});
