import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getAdminAccess } from "@/lib/admin";

/**
 * SURGICAL DATABASE FIX
 * Run this to fix the ON CONFLICT (identifier) error permanently.
 * Restricted to administrators only.
 */
export async function fixDatabaseConstraint() {
  const access = await getAdminAccess();
  if (!access.allowed) {
    return { error: "Forbidden: administrator access required." };
  }

  try {
    // 1. Clear out potentially conflicting data
    await db.execute(sql`DELETE FROM "verification_tokens"`);
    
    // 2. Drop existing constraint if it exists (standard Drizzle/NextAuth names)
    try {
      await db.execute(sql`ALTER TABLE "verification_tokens" DROP CONSTRAINT IF EXISTS "verification_tokens_pkey" CASCADE`);
    } catch {}
    
    // 3. Add the unique constraint required by the UPSERT logic
    await db.execute(sql`ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_identifier_unique" UNIQUE ("identifier")`);
    
    return { success: true };
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return { error: errorMessage || "Internal database repair error" };
  }
}


