import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for the "read notification reverts to unread" bug.
 *
 * Two independent root causes, both fixed here:
 *
 * 1. "Mark all as read" was 100% client-state — it never sent a request at
 *    all (`// Real implementation would have a mark-all route`). Any refresh
 *    or 15s poll re-fetched the still-unread rows from the database and wiped
 *    the optimistic UI state. Fixed: PATCH now accepts { markAll: true } and
 *    bulk-updates every unread row for that user.
 *
 * 2. Both GET and PATCH resolved the acting user by email ONLY
 *    (`.eq('email', session.user.email)`), the same bug class already fixed
 *    in /api/deals, /api/matches/detail, and /api/eois via resolveDbUser —
 *    a WhatsApp-linked session's session.user.email doesn't reliably match
 *    users.email, so the PATCH's `.eq('user_id', dbUser.id)` filter could
 *    match zero rows, error out, and get silently ignored by the frontend
 *    (which called mutate() unconditionally regardless of response.ok).
 *    Fixed: resolveDbUser (id → email → phone) + the PATCH now reports a
 *    real 404 when the update matches no row instead of a false success.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/utils/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));

interface NotifRow {
  id: string;
  user_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function makeSupabaseMock(users: Array<{ id: string; email: string }>, notifs: NotifRow[]) {
  return {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              single: async () => {
                const u = col === 'id' ? users.find(x => x.id === val) : users.find(x => x.email === val);
                return u ? { data: { id: u.id }, error: null } : { data: null, error: { message: 'not found' } };
              },
            }),
          }),
        };
      }

      if (table === 'notifications') {
        return {
          // GET path
          select: () => {
            const filters: Array<[string, string]> = [];
            const builder = {
              eq: (col: string, val: string) => { filters.push([col, val]); return builder; },
              order: () => builder,
              limit: async () => ({
                data: notifs.filter(n => filters.every(([c, v]) => (n as unknown as Record<string, unknown>)[c] === v)),
                error: null,
              }),
            };
            return builder;
          },
          // PATCH path: .update(patch).eq(...).eq(...)[.select()[.single()]]
          update: (patch: Partial<NotifRow>) => {
            const filters: Array<[string, unknown]> = [];
            const chain = {
              eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
              select: (cols?: string) => {
                const matched = notifs.filter(n => filters.every(([c, v]) => (n as unknown as Record<string, unknown>)[c] === v));
                matched.forEach(n => Object.assign(n, patch));
                if (cols === 'id') {
                  return Promise.resolve({ data: matched.map(n => ({ id: n.id })), error: null });
                }
                return {
                  single: async () => matched.length === 1
                    ? { data: { ...matched[0] }, error: null }
                    : { data: null, error: { message: 'no rows matched' } },
                };
              },
            };
            return chain;
          },
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

describe('GET/PATCH /api/notifications — read-state persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('marking a single notification read persists is_read=true and is reflected on next GET', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const notifs: NotifRow[] = [
      { id: 'n1', user_id: 'u1', type: 'new_counterparty', message: 'match', is_read: false, created_at: '2026-09-18T10:00:00Z' },
    ];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], notifs),
    );

    const { PATCH, GET } = await import('./route');
    const patchRes = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: 'n1' }) }) as never);
    expect(patchRes.status).toBe(200);
    expect(notifs[0].is_read).toBe(true);

    // Refetch — the DB row itself changed, so a fresh GET reflects it (this is
    // the exact call the old bug's `mutate()` would otherwise undo).
    const getRes = await GET();
    const body = await getRes.json();
    expect(body[0].is_read).toBe(true);
  });

  it('"mark all as read" (previously a no-op) now persists for every unread row', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const notifs: NotifRow[] = [
      { id: 'n1', user_id: 'u1', type: 'new_counterparty', message: 'match 1', is_read: false, created_at: '2026-09-18T10:00:00Z' },
      { id: 'n2', user_id: 'u1', type: 'eoi_received', message: 'eoi', is_read: false, created_at: '2026-09-18T09:00:00Z' },
      { id: 'n3', user_id: 'u1', type: 'status', message: 'already read', is_read: true, created_at: '2026-09-18T08:00:00Z' },
      { id: 'n4', user_id: 'u2', type: 'new_counterparty', message: 'someone else\'s', is_read: false, created_at: '2026-09-18T07:00:00Z' },
    ];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], notifs),
    );

    const { PATCH } = await import('./route');
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ markAll: true }) }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(2); // n1, n2 — not n3 (already read), not n4 (other user)
    expect(notifs.find(n => n.id === 'n1')!.is_read).toBe(true);
    expect(notifs.find(n => n.id === 'n2')!.is_read).toBe(true);
    expect(notifs.find(n => n.id === 'n4')!.is_read).toBe(false); // untouched — belongs to u2
  });

  it('reports a real failure (not 200) when the update matches no row, instead of a false success', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const notifs: NotifRow[] = [
      { id: 'n1', user_id: 'someone-else', type: 'new_counterparty', message: 'match', is_read: false, created_at: '2026-09-18T10:00:00Z' },
    ];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], notifs),
    );

    const { PATCH } = await import('./route');
    const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: 'n1' }) }) as never);
    // Wrong owner → the update's .eq('user_id', ...) matches nothing.
    expect(res.status).toBe(404);
    expect(notifs[0].is_read).toBe(false);
  });
});
