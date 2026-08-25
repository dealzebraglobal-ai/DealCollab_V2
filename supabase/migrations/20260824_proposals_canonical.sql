-- ================================================================
-- PROPOSALS CANONICAL FIELDS MIGRATION (2026-08-24)
-- Adds missing canonical fields to proposals table to support 
-- the unified 33-field standard across Chat and Bulk uploads.
-- ================================================================

ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "currency" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "urgency" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "inferred_urgency" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "buyer_type" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "inferred_buyer_type" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "intent_validated" boolean DEFAULT false;

-- Add document_url and document_text if they do not exist
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "document_url" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "document_text" text;
