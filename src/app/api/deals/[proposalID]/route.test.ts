import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for DELETE /api/deals/[proposalID] — the "deleted deal
 * comes back after refresh" bug.
 *
 * Root cause: the Deal Log's delete button only ever removed the row from
 * local SWR state (`mutate(filtered, false)`) — there was no DELETE endpoint
 * at all, so the next revalidation (poll or page reload) re-fetched the full,
 * still-ACTIVE proposal from the database and it reappeared.
 *
 * Fix: a real DELETE handler that soft-deletes via `proposals.status =
 * 'DELETED'` (the column get_deals_for_user / match_proposals already filter
 * on), scoped to the authenticated owner, and that reports failure (not 200)
 * when the mutation doesn't actually change the row.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/utils/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));

interface ProposalRow {
  id: string;
  user_id: string;
  status: string;
  metadata: Record<string, unknown>;
}

function makeSupabaseMock(users: Array<{ id: string; email: string }>, proposals: ProposalRow[]) {
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

      if (table === 'proposals') {
        // SELECT path: .select(...).eq('id', X).single()
        const selectBuilder = (targetId: string) => ({
          single: async () => {
            const row = proposals.find(p => p.id === targetId);
            return row ? { data: { ...row }, error: null } : { data: null, error: { message: 'not found' } };
          },
        });

        // UPDATE path: .update(patch).eq('id', X).eq('user_id', Y).select(...).single()
        const updateBuilder = (patch: Partial<ProposalRow>) => {
          let targetId: string | null = null;
          let targetUserId: string | null = null;
          const chain = {
            eq: (col: string, val: string) => {
              if (col === 'id') targetId = val;
              if (col === 'user_id') targetUserId = val;
              return chain;
            },
            select: () => ({
              single: async () => {
                const row = proposals.find(p => p.id === targetId && (targetUserId === null || p.user_id === targetUserId));
                if (!row) return { data: null, error: { message: 'no rows matched (wrong owner or missing)' } };
                Object.assign(row, patch);
                return { data: { id: row.id, status: row.status }, error: null };
              },
            }),
          };
          return chain;
        };

        return {
          select: () => ({
            eq: (_col: string, val: string) => selectBuilder(val),
          }),
          update: (patch: Partial<ProposalRow>) => updateBuilder(patch),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

describe('DELETE /api/deals/[proposalID] — soft-delete persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'p1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the deal does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], []),
    );
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('SECURITY: returns 403 and does NOT delete when a different user owns the deal', async () => {
    authMock.mockResolvedValue({ user: { id: 'attacker', email: 'attacker@example.com' } });
    const proposals: ProposalRow[] = [{ id: 'p1', user_id: 'victim', status: 'ACTIVE', metadata: {} }];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'attacker', email: 'attacker@example.com' }], proposals),
    );
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'p1' }) });
    expect(res.status).toBe(403);
    // The row must be untouched — ownership check happened before any mutation.
    expect(proposals[0].status).toBe('ACTIVE');
  });

  it('soft-deletes the caller\'s own deal: status becomes DELETED, response is success', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const proposals: ProposalRow[] = [{ id: 'p1', user_id: 'u1', status: 'ACTIVE', metadata: { custom_title: 'My Deal' } }];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], proposals),
    );
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'p1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The actual DB row is mutated — this is what get_deals_for_user's
    // `WHERE status = 'ACTIVE'` filter will now exclude.
    expect(proposals[0].status).toBe('DELETED');
    expect(proposals[0].metadata.deleted_at).toBeTruthy();
    expect(proposals[0].metadata.deleted_by).toBe('u1');
    // Rename metadata (custom_title) is preserved, not clobbered.
    expect(proposals[0].metadata.custom_title).toBe('My Deal');
  });

  it('a second delete on an already-deleted deal is idempotent, not an error', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    const proposals: ProposalRow[] = [{ id: 'p1', user_id: 'u1', status: 'DELETED', metadata: {} }];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock([{ id: 'u1', email: 'owner@example.com' }], proposals),
    );
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'p1' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('reports failure (not 200) when the update mutation affects no rows', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', email: 'owner@example.com' } });
    // Ownership pre-check passes, but the row vanishes (e.g. a concurrent hard
    // delete elsewhere) before the update runs — the mock's update matcher
    // then finds nothing, exactly like Postgres returning 0 affected rows.
    const proposals: ProposalRow[] = [{ id: 'p1', user_id: 'u1', status: 'ACTIVE', metadata: {} }];
    const users = [{ id: 'u1', email: 'owner@example.com' }];
    const { createServerSupabaseClient } = await import('@/utils/supabase/server');
    const baseMock = makeSupabaseMock(users, proposals);
    let proposalsSelectCalls = 0;
    const mock = {
      from(table: string) {
        if (table === 'proposals') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                single: async () => {
                  proposalsSelectCalls++;
                  if (proposalsSelectCalls === 1) {
                    const row = proposals.find(p => p.id === val);
                    return row ? { data: { ...row }, error: null } : { data: null, error: { message: 'not found' } };
                  }
                  return { data: null, error: { message: 'not found' } };
                },
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => ({ data: null, error: { message: 'no rows matched' } }),
                  }),
                }),
              }),
            }),
          };
        }
        return baseMock.from(table);
      },
    };
    (createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mock);

    const { DELETE } = await import('./route');
    const res = await DELETE(new Request('http://x') as never, { params: Promise.resolve({ proposalID: 'p1' }) });
    expect(res.status).toBe(500);
  });
});
