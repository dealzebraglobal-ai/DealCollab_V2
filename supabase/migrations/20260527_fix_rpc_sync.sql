-- ================================================================
-- MATCHMAKING RESTORE PATCH (2026-05-27)
-- Ensures match_proposals RPC signature matches matchmakingEngine.ts
-- Safe to run even if already correct — uses CREATE OR REPLACE.
-- ================================================================

-- Drop ALL overloaded versions to clear any ambiguity from previous migrations
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int, boolean);

-- Canonical match_proposals: parameters aligned with matchmakingEngine.ts Phase 6 call.
-- Called with: { match_intents TEXT[], exclude_user_id UUID, min_quality INT, result_count INT }
-- Intent filtering is pre-computed in TypeScript (COUNTERPARTY_INTENTS map).
CREATE OR REPLACE FUNCTION public.match_proposals(
  query_embedding  vector(1536),
  match_intents    TEXT[],           -- Counterparty intents pre-flipped in TypeScript
  exclude_user_id  UUID,             -- Source user to exclude from results
  min_quality      INT DEFAULT 3,    -- Quality tier ceiling (1=Rich → 3=Thin; 4=Stub excluded)
  result_count     INT DEFAULT 30    -- Max candidates to return before TypeScript hard rules
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  intent             TEXT,
  sectors            TEXT[],
  geographies        TEXT[],
  deal_size_min_cr   NUMERIC,
  deal_size_max_cr   NUMERIC,
  revenue_min_cr     NUMERIC,
  revenue_max_cr     NUMERIC,
  deal_structure     TEXT,
  normalised_text    TEXT,
  raw_text           TEXT,
  fraud_flags        TEXT[],
  advisor_name       TEXT,
  contact_phone      TEXT,
  quality_tier       SMALLINT,
  created_at         TIMESTAMPTZ,
  similarity         FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.intent, p.sectors, p.geographies,
    p.deal_size_min_cr, p.deal_size_max_cr,
    p.revenue_min_cr,   p.revenue_max_cr,
    p.deal_structure, p.normalised_text, p.raw_text,
    p.fraud_flags, p.advisor_name, p.contact_phone,
    p.quality_tier, p.created_at,
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

-- Also ensure update_proposal_embedding is the correct version (DONE status, vector param)
DROP FUNCTION IF EXISTS public.update_proposal_embedding(uuid, text);
DROP FUNCTION IF EXISTS public.update_proposal_embedding(uuid, vector);

CREATE OR REPLACE FUNCTION public.update_proposal_embedding(
  proposal_id      UUID,
  embedding_vector vector(1536)
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE proposals
  SET embedding        = embedding_vector,
      embedding_status = 'DONE',
      updated_at       = NOW()
  WHERE id = proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO anon;
GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO service_role;

-- Ensure proposal_matches has the correct column names
-- (renamed in 20260515_fix_rpc_ambiguity.sql; this block is idempotent)
DO $$
BEGIN
  -- semantic_score → similarity_score
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='proposal_matches' AND column_name='semantic_score')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='proposal_matches' AND column_name='similarity_score')
  THEN
    ALTER TABLE proposal_matches RENAME COLUMN semantic_score TO similarity_score;
    RAISE NOTICE 'Renamed: semantic_score → similarity_score';
  END IF;

  -- geography_score → geography_boost
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='proposal_matches' AND column_name='geography_score')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='proposal_matches' AND column_name='geography_boost')
  THEN
    ALTER TABLE proposal_matches RENAME COLUMN geography_score TO geography_boost;
    RAISE NOTICE 'Renamed: geography_score → geography_boost';
  END IF;

  -- freshness_score → confidence_score
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='proposal_matches' AND column_name='freshness_score')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='proposal_matches' AND column_name='confidence_score')
  THEN
    ALTER TABLE proposal_matches RENAME COLUMN freshness_score TO confidence_score;
    RAISE NOTICE 'Renamed: freshness_score → confidence_score';
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
