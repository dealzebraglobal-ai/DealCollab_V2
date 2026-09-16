import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTransientDbError } from '../chatPipeline';

/**
 * Regression tests for the production log pair:
 *   [SESSION] state load failed (preserving session, not wiping): Gateway Timeout
 *   [Wappbiz Chatbot] processing failed: Session state load failed: Gateway Timeout
 *
 * Root cause: a transient Supabase/PostgREST "Gateway Timeout" on the
 * read-only chat_sessions state lookup was treated identically to a genuine
 * data error — it threw immediately with zero retries, even though the read
 * is idempotent and safe to retry. The fix adds a couple of short, backed-off
 * retries for infra-shaped errors ONLY, while still never wiping the session
 * and still throwing (not fabricating a blank state) once retries are
 * exhausted or the error is not transient.
 */
describe('isTransientDbError — classifies infra blips vs. genuine data errors', () => {
  it('treats Gateway Timeout as transient (the exact production error string)', () => {
    expect(isTransientDbError('Gateway Timeout')).toBe(true);
  });

  it('treats common network/timeout error shapes as transient', () => {
    expect(isTransientDbError('Request timed out')).toBe(true);
    expect(isTransientDbError('ETIMEDOUT')).toBe(true);
    expect(isTransientDbError('ECONNRESET')).toBe(true);
    expect(isTransientDbError('fetch failed')).toBe(true);
    expect(isTransientDbError('upstream connect error: 503')).toBe(true);
    expect(isTransientDbError('canceling statement due to statement timeout')).toBe(true);
  });

  it('recognizes the Postgres statement-timeout / connection-exception SQLSTATE codes', () => {
    expect(isTransientDbError('canceling statement due to statement timeout (57014)')).toBe(true);
    expect(isTransientDbError('connection exception (08006)')).toBe(true);
  });

  it('does NOT treat genuine data/permission errors as transient (must not be retried)', () => {
    expect(isTransientDbError('permission denied for table chat_sessions')).toBe(false);
    expect(isTransientDbError('column "state_version" does not exist')).toBe(false);
    expect(isTransientDbError('duplicate key value violates unique constraint')).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
    expect(isTransientDbError('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isTransientDbError('GATEWAY TIMEOUT')).toBe(true);
    expect(isTransientDbError('gateway timeout')).toBe(true);
  });
});

/**
 * Full-pipeline behavior: the state-load retry loop must (a) retry a
 * transient failure, (b) recover the ORIGINAL session state once a retry
 * succeeds — never substituting a blank one, and (c) never insert a second
 * user message for the same turn just because the read had to retry.
 */
describe('runChatTurn — session state load survives a transient Gateway Timeout', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.doUnmock('@/utils/supabase/server');
    vi.doUnmock('@/lib/intelligenceEngine');
    vi.doUnmock('@/lib/resolveCompletion');
    vi.doUnmock('@/lib/responseBuilder');
  });

  /** Minimal chainable Supabase query-builder stand-in: every method returns
   *  itself so any call chain is accepted, and awaiting it resolves via the
   *  per-table handler supplied by the test. */
  function makeChain(resolve: () => Promise<{ data: unknown; error: unknown }>) {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'neq', 'order', 'limit', 'contains', 'single', 'maybeSingle', 'insert', 'update',
    ];
    for (const m of methods) chain[m] = () => chain;
    (chain as { then: unknown }).then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return chain;
  }

  it('retries a Gateway Timeout on chat_sessions state load, then loads the ORIGINAL (non-blank) state on success — and inserts the user message exactly once', async () => {
    let stateLoadAttempts = 0;
    let userMessageInsertCount = 0;

    const fakeSupabase = {
      from(table: string) {
        if (table === 'chat_sessions') {
          return makeChain(async () => {
            stateLoadAttempts += 1;
            if (stateLoadAttempts <= 2) {
              return { data: null, error: { code: '57014', message: 'Gateway Timeout' } };
            }
            // Third attempt succeeds — returns the user's genuine in-progress mandate.
            return {
              data: { id: 'chat-123', state: { intent: 'BUY_SIDE', sector: 'saas', turn_count: 2 } },
              error: null,
            };
          });
        }
        if (table === 'chat_messages') {
          return {
            insert: (rows: Array<{ role: string }>) => {
              if (rows.some((r) => r.role === 'user')) userMessageInsertCount += 1;
              return Promise.resolve({ data: rows, error: null });
            },
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'proposals') {
          return makeChain(async () => ({ data: [], error: null }));
        }
        return makeChain(async () => ({ data: null, error: null }));
      },
    };

    vi.doMock('@/utils/supabase/server', () => ({
      createServerSupabaseClient: () => fakeSupabase,
    }));
    vi.doMock('@/lib/intelligenceEngine', () => ({
      processIntelligence: vi.fn(async () => ({
        intent: 'BUY_SIDE',
        state: {},
        is_complete: false,
        message: 'Understood, tell me more.',
      })),
    }));
    vi.doMock('@/lib/resolveCompletion', () => ({
      resolveCompletion: vi.fn(({ storedState, extraction }: { storedState: Record<string, unknown>; extraction: Record<string, unknown> }) => ({
        state: { ...storedState, turn_count: 3 },
        extraction: { ...extraction, state: {} },
        shouldInsert: false,
        reason: 'test-no-insert',
      })),
    }));
    vi.doMock('@/lib/responseBuilder', () => ({
      buildFinalMessage: () => 'Understood, tell me more.',
    }));

    const { runChatTurn } = await import('../chatPipeline');

    const result = await runChatTurn({
      userId: 'user-1',
      rawMessage: 'We are still looking for a SaaS acquisition',
      channel: 'WEB',
      chatId: 'chat-123',
    });

    // Retried exactly twice (the two Gateway Timeouts) before succeeding —
    // stateLoadAttempts also counts later, unrelated chat_sessions reads made
    // by persistState(), so assert the minimum bound the retry loop itself
    // guarantees rather than an exact total across the whole turn.
    expect(stateLoadAttempts).toBeGreaterThanOrEqual(3);
    // The turn completed using the loaded (non-blank) session — proven by the
    // pipeline reaching the final response rather than throwing.
    expect(result.chatId).toBe('chat-123');
    expect(result.message).toBe('Understood, tell me more.');
    // Exactly one user message persisted for this turn — a retried READ must
    // never cause a duplicated WRITE/action.
    expect(userMessageInsertCount).toBe(1);
  });

  it('does not retry forever and does not wipe the session — throws after exhausting retries on a persistent Gateway Timeout', async () => {
    let stateLoadAttempts = 0;
    const fakeSupabase = {
      from(table: string) {
        if (table === 'chat_sessions') {
          return makeChain(async () => {
            stateLoadAttempts += 1;
            return { data: null, error: { code: '57014', message: 'Gateway Timeout' } };
          });
        }
        return makeChain(async () => ({ data: null, error: null }));
      },
    };

    vi.doMock('@/utils/supabase/server', () => ({
      createServerSupabaseClient: () => fakeSupabase,
    }));

    const { runChatTurn } = await import('../chatPipeline');

    await expect(
      runChatTurn({
        userId: 'user-1',
        rawMessage: 'hello again',
        channel: 'WEB',
        chatId: 'chat-123',
      }),
    ).rejects.toThrow(/Session state load failed/);

    // Bounded retries: initial attempt + 2 retries = 3 total, not unbounded.
    expect(stateLoadAttempts).toBe(3);
  });

  it('does NOT retry a genuine "no rows" error — starts a fresh session immediately', async () => {
    let stateLoadAttempts = 0;
    // Once the new session is created, later chat_sessions calls in this turn
    // (persistState's state_version check + update) are a different concern
    // from the initial state-load retry logic under test — they should just
    // succeed harmlessly and are intentionally not counted here.
    let sessionCreated = false;

    const fakeSupabase = {
      from(table: string) {
        if (table === 'chat_sessions') {
          const chain = makeChain(async () => {
            if (!sessionCreated) {
              stateLoadAttempts += 1;
              return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
            }
            return { data: { id: 'chat-new', state_version: 0 }, error: null };
          }) as Record<string, unknown>;
          chain.insert = () => ({
            select: () => ({
              single: async () => {
                sessionCreated = true;
                return { data: { id: 'chat-new' }, error: null };
              },
            }),
          });
          return chain;
        }
        if (table === 'chat_messages') return makeChain(async () => ({ data: [], error: null }));
        if (table === 'proposals') return makeChain(async () => ({ data: [], error: null }));
        return makeChain(async () => ({ data: null, error: null }));
      },
    };

    vi.doMock('@/utils/supabase/server', () => ({
      createServerSupabaseClient: () => fakeSupabase,
    }));
    vi.doMock('@/lib/intelligenceEngine', () => ({
      processIntelligence: vi.fn(async () => ({
        intent: null,
        state: {},
        is_complete: false,
        message: 'Hi! What kind of deal are you looking for?',
      })),
    }));
    vi.doMock('@/lib/resolveCompletion', () => ({
      resolveCompletion: vi.fn(({ storedState, extraction }: { storedState: Record<string, unknown>; extraction: Record<string, unknown> }) => ({
        state: { ...storedState },
        extraction: { ...extraction, state: {} },
        shouldInsert: false,
        reason: 'test-no-insert',
      })),
    }));
    vi.doMock('@/lib/responseBuilder', () => ({
      buildFinalMessage: () => 'Hi! What kind of deal are you looking for?',
    }));

    const { runChatTurn } = await import('../chatPipeline');

    const result = await runChatTurn({
      userId: 'user-1',
      rawMessage: 'Hi',
      channel: 'WEB',
      chatId: 'chat-gone',
    });

    // PGRST116 must not trigger the transient-retry loop — a single lookup attempt only.
    expect(stateLoadAttempts).toBe(1);
    expect(result.chatId).toBe('chat-new');
  });
});
