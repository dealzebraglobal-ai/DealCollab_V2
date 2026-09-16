import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDbUser } from '../resolveDbUser';

/**
 * Regression coverage for the "View Mandate" / "View Matches" / "Send EOI"
 * failures on WhatsApp-filed mandates ("This page couldn't load").
 *
 * Root cause: /api/matches/detail/[matchId], /api/matches/[proposalID] and
 * /api/eois all resolved the acting user with `.eq('email', session.user.email)`
 * ONLY. A WhatsApp-authenticated session (magic link -> phone Credentials
 * provider) carries a real `session.user.id` and `.phone`, but `.email` is
 * only ever the placeholder stamped at user creation and is not guaranteed to
 * still match `users.email` (e.g. after Google account linking rewrites it).
 * /api/deals already discovered and fixed this by trying id -> email -> phone,
 * in that order; resolveDbUser is the one shared implementation now used
 * everywhere in the mandate-viewing surface so the fix can't silently drift
 * out of sync again.
 */
describe('resolveDbUser — id, then email, then phone, first match wins', () => {
  function makeSupabase(responses: Record<string, { data: unknown } | null>) {
    const calls: Array<{ column: string; value: string }> = [];
    return {
      client: {
        from: () => ({
          select: () => ({
            eq: (column: string, value: string) => {
              calls.push({ column, value });
              return {
                single: async () => {
                  const key = `${column}:${value}`;
                  return responses[key] ? { data: responses[key]!.data, error: null } : { data: null, error: { message: 'not found' } };
                },
              };
            },
          }),
        }),
      } as unknown as SupabaseClient,
      calls,
    };
  }

  it('resolves by id when id is present, without ever querying by email or phone', async () => {
    const { client, calls } = makeSupabase({ 'id:user-1': { data: { id: 'user-1' } } });
    const result = await resolveDbUser(client, { id: 'user-1', email: 'user1@dealcollab.ai', phone: '+919999999999' });
    expect(result).toEqual({ id: 'user-1' });
    expect(calls).toEqual([{ column: 'id', value: 'user-1' }]);
  });

  it('falls back to email when id lookup fails (e.g. stale/mismatched id)', async () => {
    const { client, calls } = makeSupabase({ 'email:user1@dealcollab.ai': { data: { id: 'user-1' } } });
    const result = await resolveDbUser(client, { id: 'stale-id', email: 'user1@dealcollab.ai', phone: '+919999999999' });
    expect(result).toEqual({ id: 'user-1' });
    expect(calls.map(c => c.column)).toEqual(['id', 'email']);
  });

  it('falls back to phone when id AND email both fail to resolve — the exact WhatsApp-session shape', async () => {
    // This is the production shape: session.user.email is the placeholder
    // stamped at account creation, but the users row's email has since
    // changed (e.g. Google account linking), so only phone still matches.
    const { client, calls } = makeSupabase({ 'phone:+919999999999': { data: { id: 'user-1' } } });
    const result = await resolveDbUser(client, {
      id: 'stale-id',
      email: '919999999999@dealcollab.ai', // placeholder, no longer matches users.email
      phone: '+919999999999',
    });
    expect(result).toEqual({ id: 'user-1' });
    expect(calls.map(c => c.column)).toEqual(['id', 'email', 'phone']);
  });

  it('returns null when none of id/email/phone resolve', async () => {
    const { client } = makeSupabase({});
    const result = await resolveDbUser(client, { id: 'x', email: 'y@z.com', phone: '+911111111111' });
    expect(result).toBeNull();
  });

  it('returns null immediately (no queries) when the session carries no identifying field at all', async () => {
    const { client, calls } = makeSupabase({});
    const result = await resolveDbUser(client, {});
    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  it('returns null for a null/undefined session user', async () => {
    const { client } = makeSupabase({});
    expect(await resolveDbUser(client, null)).toBeNull();
    expect(await resolveDbUser(client, undefined)).toBeNull();
  });

  it('requests the caller-specified column list', async () => {
    let selectedColumns: string | undefined;
    const client = {
      from: () => ({
        select: (columns: string) => {
          selectedColumns = columns;
          return { eq: () => ({ single: async () => ({ data: { id: 'user-1', tokens: 50 }, error: null }) }) };
        },
      }),
    } as unknown as SupabaseClient;
    const result = await resolveDbUser<{ id: string; tokens: number }>(client, { id: 'user-1' }, 'id, tokens');
    expect(selectedColumns).toBe('id, tokens');
    expect(result?.tokens).toBe(50);
  });
});
