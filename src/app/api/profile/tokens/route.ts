import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';
import { users, tokenTransactions } from '@/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

/**
 * Server-side action → cost map. Previously this endpoint took `type`,
 * `action`, and `amount` straight from the request body — any authenticated
 * user could POST {type:'credit', amount:999999} and mint unlimited tokens.
 * Now the client can only name a known action; the cost is always looked up
 * here, and only debits are possible through this endpoint at all — credits
 * (e.g. profile-completion rewards) happen exclusively in server-internal
 * flows that never take client input for the amount.
 */
const DEBIT_ACTIONS: Record<string, number> = {
  connect: 50,
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userEmail = session.user.email?.trim().toLowerCase();
    if (!userEmail) throw new Error("User email missing from session");

    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, userEmail),
      columns: { id: true }
    });

    if (!dbUser) return NextResponse.json({ balance: 0, transactions: [] });

    const userId = dbUser.id;

    // 1. Fetch current balance
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { tokens: true }
    });

    // 2. Fetch transaction history
    const history = await db.query.tokenTransactions.findMany({
      where: eq(tokenTransactions.userId, userId),
      orderBy: [desc(tokenTransactions.createdAt)]
    });

    return NextResponse.json({
      balance: user?.tokens || 0,
      transactions: history
    });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ error: errorMessage || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userEmail = session.user.email?.trim().toLowerCase();
    if (!userEmail) throw new Error("User email missing from session");

    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, userEmail),
      columns: { id: true }
    });

    if (!dbUser) return NextResponse.json({ error: 'User record not initialized' }, { status: 404 });

    const userId = dbUser.id;
    const body = await req.json();
    const { action } = body;

    const cost = typeof action === 'string' ? DEBIT_ACTIONS[action] : undefined;
    if (cost === undefined) {
      return NextResponse.json({ error: 'Unknown or unsupported action' }, { status: 400 });
    }

    // Single conditional UPDATE — atomic, no read-then-write race window.
    // The WHERE clause enforces the balance check and the deduction in the
    // same statement, so two concurrent requests can't both pass a balance
    // check based on stale data (double-spend). Wrapped with the ledger
    // insert in one transaction so a log-write failure can't leave the
    // balance changed with no record of why.
    const finalBalance = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ tokens: sql`${users.tokens} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.tokens, cost)))
        .returning({ tokens: users.tokens });

      if (!updated) return null;

      const balanceAfter = updated.tokens ?? 0;

      await tx.insert(tokenTransactions).values({
        userId,
        type: 'debit',
        action,
        amount: -cost,
        balanceAfter,
      });

      return balanceAfter;
    });

    if (finalBalance === null) {
      return NextResponse.json({ error: 'Insufficient tokens' }, { status: 400 });
    }

    return NextResponse.json({ success: true, balance: finalBalance });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ error: errorMessage || 'Internal Server Error' }, { status: 500 });
  }
}
