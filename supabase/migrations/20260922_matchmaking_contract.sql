-- ================================================================
-- MATCHMAKING CONTRACT RESTORATION (2026-09-22)
-- Adds industry and serving_sectors to proposals table and
-- updates match_proposals RPC to return the complete 23-column contract.
-- ================================================================

-- Step 1: Ensure proposals table has industry and serving_sectors columns
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "industry" text;
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "serving_sectors" text[];

-- Step 2: Drop previous overloaded versions of match_proposals to avoid signature ambiguity
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int, boolean);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid);

-- Step 3: Canonical match_proposals with complete 23-column returns table
CREATE OR REPLACE FUNCTION public.match_proposals(
  query_embedding  vector(1536),
  match_intents    TEXT[],           -- Counterparty intents pre-flipped in TypeScript
  exclude_user_id  UUID,             -- Source user to exclude from results
  min_quality      INT DEFAULT 3,    -- Quality tier ceiling (1=Rich → 3=Thin; 4=Stub excluded)
  result_count     INT DEFAULT 30    -- Max candidates to return before TypeScript hard rules
)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  intent              TEXT,
  industry            TEXT,
  sectors             TEXT[],
  serving_sectors     TEXT[],
  geographies         TEXT[],
  deal_size_min_cr    NUMERIC,
  deal_size_max_cr    NUMERIC,
  revenue_min_cr      NUMERIC,
  revenue_max_cr      NUMERIC,
  deal_structure      TEXT,
  buyer_type          TEXT,
  inferred_buyer_type TEXT,
  special_conditions  TEXT[],
  normalised_text     TEXT,
  raw_text            TEXT,
  fraud_flags         TEXT[],
  advisor_name        TEXT,
  contact_phone       TEXT,
  quality_tier        SMALLINT,
  created_at          TIMESTAMPTZ,
  similarity          FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.intent,
    p.industry,
    p.sectors,
    p.serving_sectors,
    p.geographies,
    p.deal_size_min_cr,
    p.deal_size_max_cr,
    p.revenue_min_cr,
    p.revenue_max_cr,
    p.deal_structure,
    p.buyer_type,
    p.inferred_buyer_type,
    p.special_conditions,
    p.normalised_text,
    p.raw_text,
    p.fraud_flags,
    p.advisor_name,
    p.contact_phone,
    p.quality_tier,
    p.created_at,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM proposals p
  WHERE
    p.status            = 'ACTIVE'
    AND p.embedding     IS NOT NULL
    AND p.embedding_status = 'DONE'
    AND p.quality_tier  <= min_quality
    AND (p.user_id IS NULL OR p.user_id != exclude_user_id)
    AND p.intent        = ANY(match_intents)
    AND (1 - (p.embedding <=> query_embedding)) > 0.10
  ORDER BY p.embedding <=> query_embedding
  LIMIT result_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_proposals TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_proposals TO anon;
GRANT EXECUTE ON FUNCTION public.match_proposals TO service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
