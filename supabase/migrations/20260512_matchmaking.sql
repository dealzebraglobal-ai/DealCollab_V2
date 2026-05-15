-- ============================================================
-- M5 MATCHMAKING EXECUTION ENGINE — DATABASE MIGRATION
-- ============================================================
-- Prerequisites: Supabase project with pgvector extension enabled
-- Run this migration via Supabase SQL Editor or CLI
-- ============================================================

-- 1. Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

--- 2. PROPOSALS TABLE (CANONICAL PRODUCTION SCHEMA — PHASE 1)
-- Rule: Ensure DB schema EXACTLY matches TS schema.
CREATE TABLE IF NOT EXISTS proposals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_text        TEXT NOT NULL,
    normalised_text TEXT NOT NULL,
    intent          TEXT NOT NULL,
    sectors         TEXT[],
    sub_sector      TEXT,
    geographies     TEXT[],
    deal_size_min   NUMERIC,
    deal_size_max   NUMERIC,
    revenue_min     NUMERIC,
    revenue_max     NUMERIC,
    deal_structure  TEXT,
    strategic_intent TEXT,
    embedding       vector(1536),
    embedding_model TEXT DEFAULT 'text-embedding-3-small',
    embedding_status TEXT DEFAULT 'PENDING' CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    proposal_quality_score NUMERIC DEFAULT 0,
    status          TEXT DEFAULT 'ACTIVE' NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED', 'EXPIRED')),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. UNIFIED MATCHES TABLE (PRODUCTION DC-MATCH-001)
-- Core persistence for semantic deal intelligence
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  proposal_id_a UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  proposal_id_b UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,

  cosine_score NUMERIC,
  keyword_score NUMERIC,
  bonus_score NUMERIC,
  final_score NUMERIC,

  match_label TEXT,
  match_explanation JSONB,

  status TEXT DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(proposal_id_a, proposal_id_b)
);

CREATE INDEX IF NOT EXISTS idx_matches_proposal_id_a ON matches(proposal_id_a);
CREATE INDEX IF NOT EXISTS idx_matches_proposal_id_b ON matches(proposal_id_b);
CREATE INDEX IF NOT EXISTS idx_matches_final_score ON matches(final_score DESC);

-- 3c. SAVED SEARCHES (Rule 16)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  query_params JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 4. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_proposals_user_id ON proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_intent ON proposals(intent);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_sectors ON proposals USING GIN (sectors);
CREATE INDEX IF NOT EXISTS idx_proposals_geographies ON proposals USING GIN (geographies);
CREATE INDEX IF NOT EXISTS idx_proposals_embedding_status ON proposals(embedding_status);

-- 5. IVFFLAT index for fast vector similarity search
CREATE INDEX IF NOT EXISTS proposals_embedding_idx
ON proposals
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 6. CANONICAL RPC: Update proposal embedding (Consolidated)
DROP FUNCTION IF EXISTS public.update_proposal_embedding(uuid, vector);

CREATE OR REPLACE FUNCTION public.update_proposal_embedding(
  proposal_id uuid,
  embedding_vector vector(1536)
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE proposals
    SET 
        embedding = embedding_vector,
        embedding_status = 'COMPLETED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO service_role;
GRANT EXECUTE ON FUNCTION public.update_proposal_embedding TO anon;

-- 7. CANONICAL RPC FUNCTION: Semantic retrieval (DC-MATCH-001)
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text, uuid);

CREATE OR REPLACE FUNCTION public.match_proposals(
  query_embedding vector(1536),
  match_intent text,
  exclude_user_id uuid,
  min_quality int DEFAULT 1,
  result_count int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  intent text,
  sectors text[],
  geographies text[],
  deal_size_min numeric,
  deal_size_max numeric,
  revenue_min numeric,
  revenue_max numeric,
  deal_structure text,
  normalised_text text,
  proposal_quality_score numeric,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
SELECT
  p.id,
  p.user_id,
  p.intent,
  p.sectors,
  p.geographies,
  p.deal_size_min,
  p.deal_size_max,
  p.revenue_min,
  p.revenue_max,
  p.deal_structure,
  p.normalised_text,
  p.proposal_quality_score,
  1 - (p.embedding <=> query_embedding) AS similarity
FROM proposals p
WHERE
  p.embedding IS NOT NULL
  AND p.status = 'ACTIVE'
  AND p.user_id != exclude_user_id
  AND (p.proposal_quality_score IS NULL OR p.proposal_quality_score >= min_quality)
  AND (
    (match_intent = 'BUY_SIDE' AND p.intent = 'SELL_SIDE')
    OR
    (match_intent = 'SELL_SIDE' AND p.intent = 'BUY_SIDE')
    OR
    (match_intent = 'INVESTMENT' AND p.intent = 'FUNDRAISING')
    OR
    (match_intent = 'FUNDRAISING' AND p.intent = 'INVESTMENT')
    OR
    (match_intent = 'DEBT' AND p.intent = 'DEBT')
    OR
    (match_intent = 'STRATEGIC_PARTNERSHIP' AND p.intent = 'STRATEGIC_PARTNERSHIP')
  )
ORDER BY p.embedding <=> query_embedding
LIMIT result_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_proposals TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_proposals TO anon;
GRANT EXECUTE ON FUNCTION public.match_proposals TO service_role;

-- 8. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 9. Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_proposals_updated_at();
