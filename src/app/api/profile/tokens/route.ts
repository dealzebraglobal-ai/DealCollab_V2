import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';
import { users, tokenTransactions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { hasAcceptedTerms } from '@/lib/consent';

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

    if (!(await hasAcceptedTerms(userId))) {
      return NextResponse.json(
        { error: 'consent_required',
          message: 'Complete your profile and accept the Terms before purchasing tokens.' },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { type, action, amount } = body;

    if (!type || !action || typeof amount !== 'number') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let finalTokens = user.tokens || 0;
    
    if (type === 'debit') {
      if (finalTokens < amount) {
        return NextResponse.json({ error: 'Insufficient tokens' }, { status: 400 });
      }
      finalTokens -= amount;
    } else {
      finalTokens += amount;
    }

    // Atomic update (not strictly atomic here, but okay for this app)
    await db.transaction(async (tx) => {
      await tx.update(users).set({ tokens: finalTokens }).where(eq(users.id, userId));
      await tx.insert(tokenTransactions).values({
        userId,
        type,
        action,
        amount: type === 'debit' ? -amount : amount,
        balanceAfter: finalTokens,
      });
    });

    return NextResponse.json({ success: true, balance: finalTokens });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ error: errorMessage || 'Internal Server Error' }, { status: 500 });
  }
}
