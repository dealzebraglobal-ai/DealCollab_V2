import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin";

// SECURITY: this route runs destructive schema DDL (including DROP TABLE
// ... CASCADE) against production. It previously had NO authentication —
// any unauthenticated GET request could trigger it. Gated behind the same
// admin-session check used by every other /api/admin/* route.
export async function GET() {
  const access = await getAdminAccess();
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    console.log('API: Running database migration to merge Profile into Users...');
    
    // 1. Extend Users table
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS firm_name TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT,
      ADD COLUMN IF NOT EXISTS category TEXT[],
      ADD COLUMN IF NOT EXISTS custom_category TEXT,
      ADD COLUMN IF NOT EXISTS base_location TEXT,
      ADD COLUMN IF NOT EXISTS geographies TEXT[],
      ADD COLUMN IF NOT EXISTS cross_border BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS corridors TEXT,
      ADD COLUMN IF NOT EXISTS sectors TEXT[],
      ADD COLUMN IF NOT EXISTS intent TEXT,
      ADD COLUMN IF NOT EXISTS priority_sectors TEXT[],
      ADD COLUMN IF NOT EXISTS co_advisory BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS collaboration_model TEXT[],
      ADD COLUMN IF NOT EXISTS additional_info TEXT;
    `);

    // 2. Drop user_profiles table (CLEANUP)
    await db.execute(sql`DROP TABLE IF EXISTS user_profiles CASCADE;`);

    // 3. Create end_user_profiles table for End Users (Business Promoters)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS end_user_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          company_name TEXT NOT NULL,
          website TEXT NOT NULL,
          sectors TEXT[],
          intent TEXT[] NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_end_user_profiles_user_id ON end_user_profiles(user_id);
    `);

    
    return NextResponse.json({ 
      success: true, 
      message: "Database migration successful: Users table extended and user_profiles table dropped." 
    });
  } catch (error: unknown) {
    console.error('API: Migration failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
