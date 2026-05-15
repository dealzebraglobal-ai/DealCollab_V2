-- ================================================================
-- DealCollab Matchmaking Infrastructure
-- Run in Supabase SQL Editor ONCE before deploying code.
-- ================================================================

-- Step 1: Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ================================================================
-- TABLE: proposals
-- Searchable semantic index. One row per mandate.
-- Populated by matchmakingEngine.ts when mandate is complete.
-- ================================================================
CREATE TABLE IF NOT EXISTS proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  mandate_id          UUID REFERENCES mandates(id) ON DELETE SET NULL,
  raw_text            TEXT NOT NULL,
  normalised_text     TEXT,                    -- clean canonical text used for embedding
  intent              TEXT,                    -- BUY_SIDE | SELL_SIDE | FUNDRAISING | DEBT | STRATEGIC_PARTNERSHIP
  sectors             TEXT[],                  -- uppercased canonical sector codes
  geographies         TEXT[],
  deal_structure      TEXT,
  deal_size_min_cr    NUMERIC(12,2),
  deal_size_max_cr    NUMERIC(12,2),
  revenue_min_cr      NUMERIC(12,2),
  revenue_max_cr      NUMERIC(12,2),
  special_conditions  TEXT[],
  fraud_flags         TEXT[],
  advisor_name        TEXT,
  contact_phone       TEXT,
  quality_score       SMALLINT DEFAULT 5,
  quality_tier        SMALLINT DEFAULT 2,      -- 1=Rich 2=Adequate 3=Thin 4=Stub
  status              TEXT DEFAULT 'ACTIVE',   -- ACTIVE | ARCHIVED | DUPLICATE
  source              TEXT DEFAULT 'WEB',      -- WEB | SEEDED
  embedding_status    TEXT DEFAULT 'PENDING',  -- PENDING | DONE | FAILED
  embedding           vector(1536),
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABLE: proposal_matches
-- Scored match pairs. Queried by /api/matches.
-- ================================================================
CREATE TABLE IF NOT EXISTS proposal_matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  matched_proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  semantic_score        NUMERIC(5,4),          -- raw cosine similarity
  industry_score        NUMERIC(5,4),
  financial_score       NUMERIC(5,4),
  geography_score       NUMERIC(5,4),
  freshness_score       NUMERIC(5,4),
  final_score           NUMERIC(5,2),          -- 0–100 composite
  match_reason          TEXT,
  match_archetype       TEXT,
  status                TEXT DEFAULT 'ACTIVE',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, matched_proposal_id)
);

-- ================================================================
-- TABLE: saved_searches
-- Unmatched queries. Re-matched when new proposals arrive.
-- 90-day TTL.
-- ================================================================
CREATE TABLE IF NOT EXISTS saved_searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE CASCADE,
  intent          TEXT,
  sectors         TEXT[],
  geographies     TEXT[],
  query_embedding vector(1536),
  status          TEXT DEFAULT 'PENDING',      -- PENDING | NOTIFIED | EXPIRED
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_proposals_embedding
  ON proposals USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_proposals_intent    ON proposals(intent);
CREATE INDEX IF NOT EXISTS idx_proposals_status    ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_user_id   ON proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_mandate_id ON proposals(mandate_id);
CREATE INDEX IF NOT EXISTS idx_proposals_sectors   ON proposals USING GIN(sectors);
CREATE INDEX IF NOT EXISTS idx_pm_proposal_id      ON proposal_matches(proposal_id);
CREATE INDEX IF NOT EXISTS idx_pm_final_score      ON proposal_matches(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_ss_status           ON saved_searches(status);
CREATE INDEX IF NOT EXISTS idx_ss_expires          ON saved_searches(expires_at);

-- ================================================================
-- RPC: update_proposal_embedding
-- Called after embedding is generated to store vector + mark DONE.
-- ================================================================
CREATE OR REPLACE FUNCTION update_proposal_embedding(
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

-- ================================================================
-- RPC: match_proposals
-- V2 approach: semantic retrieval with REVERSED intent in query.
-- Intent filter stays in SQL for efficiency (buyer finds sellers).
-- Hard rejections applied in TypeScript after retrieval.
-- Returns top 30 semantically nearest candidates.
-- ================================================================
CREATE OR REPLACE FUNCTION match_proposals(
  query_embedding  vector(1536),   -- embedding of REVERSED-INTENT normalized text
  query_intent     TEXT,           -- SOURCE intent (flipped inside this function)
  query_user_id    UUID,
  match_limit      INT DEFAULT 30
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
  fraud_flags        TEXT[],
  advisor_name       TEXT,
  contact_phone      TEXT,
  quality_tier       SMALLINT,
  created_at         TIMESTAMPTZ,
  similarity         FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_intent TEXT;
BEGIN
  -- Flip intent so buyer retrieves sellers, seller retrieves buyers
  target_intent := CASE query_intent
    WHEN 'BUY_SIDE'              THEN 'SELL_SIDE'
    WHEN 'SELL_SIDE'             THEN 'BUY_SIDE'
    WHEN 'FUNDRAISING'           THEN 'INVESTMENT'
    WHEN 'INVESTMENT'            THEN 'FUNDRAISING'
    WHEN 'DEBT'                  THEN 'DEBT'
    WHEN 'STRATEGIC_PARTNERSHIP' THEN 'STRATEGIC_PARTNERSHIP'
    ELSE NULL
  END;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.intent, p.sectors, p.geographies,
    p.deal_size_min_cr, p.deal_size_max_cr,
    p.revenue_min_cr,   p.revenue_max_cr,
    p.deal_structure, p.normalised_text,
    p.fraud_flags, p.advisor_name, p.contact_phone,
    p.quality_tier, p.created_at,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM proposals p
  WHERE
    p.status            = 'ACTIVE'
    AND p.embedding     IS NOT NULL
    AND p.embedding_status = 'DONE'
    AND p.quality_tier  <= 3
    AND (p.user_id IS NULL OR p.user_id != query_user_id)
    AND (target_intent IS NULL OR p.intent = target_intent)
    AND (1 - (p.embedding <=> query_embedding)) > 0.12
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- ================================================================
-- RPC: get_matches_for_user
-- Called by /api/matches — returns anonymous match cards.
-- ================================================================
CREATE OR REPLACE FUNCTION get_matches_for_user(
  p_user_id    UUID,
  min_score    NUMERIC DEFAULT 40,
  max_results  INT DEFAULT 10
)
RETURNS TABLE (
  match_id              UUID,
  proposal_id           UUID,
  matched_proposal_id   UUID,
  final_score           NUMERIC,
  match_reason          TEXT,
  match_archetype       TEXT,
  matched_intent        TEXT,
  matched_sectors       TEXT[],
  matched_geographies   TEXT[],
  matched_size_min      NUMERIC,
  matched_size_max      NUMERIC,
  matched_quality_tier  SMALLINT,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.id, pm.proposal_id, pm.matched_proposal_id,
    pm.final_score, pm.match_reason, pm.match_archetype,
    mp.intent, mp.sectors, mp.geographies,
    mp.deal_size_min_cr, mp.deal_size_max_cr,
    mp.quality_tier, pm.created_at
  FROM proposal_matches pm
  JOIN proposals src ON src.id = pm.proposal_id
  JOIN proposals mp  ON mp.id  = pm.matched_proposal_id
  WHERE
    src.user_id      = p_user_id
    AND pm.final_score >= min_score
    AND pm.status     = 'ACTIVE'
  ORDER BY pm.final_score DESC
  LIMIT max_results;
END;
$$;

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();