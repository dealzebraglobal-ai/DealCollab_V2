-- ================================================================
-- DealCollab Unified Matchmaking Schema (2026-05-15)
-- Resolves RPC ambiguity and syncs DB with TypeScript V2 Engine
-- ================================================================

-- Step 1: Fix update_proposal_embedding Ambiguity
-- Drop all previous versions to clear overloading confusion
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

-- Step 2: Update proposal_matches table to match TypeScript MatchInsert interface
-- We use ALTER TABLE to preserve data if possible, but ensure columns match TS
DO $$ 
BEGIN
  -- Add new columns if missing
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='similarity_score') THEN
    ALTER TABLE proposal_matches RENAME COLUMN semantic_score TO similarity_score;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='intent_score') THEN
    ALTER TABLE proposal_matches ADD COLUMN intent_score NUMERIC(5,4) DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='niche_score') THEN
    ALTER TABLE proposal_matches ADD COLUMN niche_score NUMERIC(5,4) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='geography_boost') THEN
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='geography_score') THEN
        ALTER TABLE proposal_matches RENAME COLUMN geography_score TO geography_boost;
    ELSE
        ALTER TABLE proposal_matches ADD COLUMN geography_boost NUMERIC(5,4) DEFAULT 0;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='confidence_score') THEN
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='proposal_matches' AND COLUMN_NAME='freshness_score') THEN
        ALTER TABLE proposal_matches RENAME COLUMN freshness_score TO confidence_score;
    ELSE
        ALTER TABLE proposal_matches ADD COLUMN confidence_score NUMERIC(5,4) DEFAULT 0;
    END IF;
  END IF;
END $$;

-- Step 3: Fix match_proposals signature to match matchmakingEngine.ts Phase 4
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int);

CREATE OR REPLACE FUNCTION public.match_proposals(
  query_embedding  vector(1536),
  match_intents    TEXT[],           -- Plural, matches targetIntents in TS
  exclude_user_id  UUID,
  min_quality      INT DEFAULT 3,
  result_count     INT DEFAULT 30
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
  special_conditions TEXT[],
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
    p.deal_structure, p.normalised_text,
    p.special_conditions, p.fraud_flags, p.advisor_name, p.contact_phone,
    p.quality_tier, p.created_at,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM proposals p
  WHERE
    p.status            = 'ACTIVE'
    AND p.embedding     IS NOT NULL
    AND p.embedding_status = 'DONE'
    AND p.quality_tier  <= min_quality
    AND (p.user_id IS NULL OR p.user_id != exclude_user_id)
    AND (match_intents IS NULL OR p.intent = ANY(match_intents))
    AND (1 - (p.embedding <=> query_embedding)) > 0.10
  ORDER BY p.embedding <=> query_embedding
  LIMIT result_count;
END;
$$;

-- Step 4: Refresh Schema Cache
NOTIFY pgrst, 'reload schema';
