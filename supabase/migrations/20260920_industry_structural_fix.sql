-- ================================================================
-- PROPOSALS INDUSTRY STRUCTURAL FIX & RPC ENHANCEMENT (2026-09-20)
-- 1. Adds canonical 'industry' column to proposals table
-- 2. Backfills candidate industry from metadata->>'industry',
--    metadata->>'original_industry', and sectors[1]
-- 3. Updates match_proposals RPC to return candidate industry,
--    metadata, and is_shell (withholding confidential contact info)
-- 4. Updates get_deals_for_user RPC to return cp_industry
-- ================================================================

-- 1. Add industry column and index to proposals
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS industry TEXT;
CREATE INDEX IF NOT EXISTS idx_proposals_industry ON public.proposals (industry);

-- 1.1 Add industry column and index to mandates
ALTER TABLE public.mandates ADD COLUMN IF NOT EXISTS industry TEXT;
CREATE INDEX IF NOT EXISTS idx_mandates_industry ON public.mandates (industry);

-- 1.2 Add industry column and index to saved_searches
ALTER TABLE public.saved_searches ADD COLUMN IF NOT EXISTS industry TEXT;
CREATE INDEX IF NOT EXISTS idx_saved_searches_industry ON public.saved_searches (industry);

-- 1.3 Add industry column to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS industry TEXT;
CREATE INDEX IF NOT EXISTS idx_deals_industry ON public.deals (industry);

-- 2. Backfill existing proposals
UPDATE public.proposals
SET industry = COALESCE(
  NULLIF(TRIM(metadata->>'industry'), ''),
  NULLIF(TRIM(metadata->>'original_industry'), ''),
  sectors[1]
)
WHERE industry IS NULL AND (metadata ? 'industry' OR metadata ? 'original_industry' OR sectors IS NOT NULL);

-- 2.1 Backfill existing mandates
UPDATE public.mandates
SET industry = COALESCE(
  sectors[1]
)
WHERE industry IS NULL AND sectors IS NOT NULL;

-- 2.2 Backfill existing saved_searches from query_object or sectors
UPDATE public.saved_searches
SET industry = COALESCE(
  NULLIF(TRIM(query_object->>'industry'), ''),
  sectors[1]
)
WHERE industry IS NULL AND (query_object ? 'industry' OR sectors IS NOT NULL);

-- 2.3 Backfill existing deals
UPDATE public.deals
SET industry = COALESCE(
  sector
)
WHERE industry IS NULL AND sector IS NOT NULL;

-- 3. Update match_proposals RPC
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int);
DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int, boolean);

CREATE OR REPLACE FUNCTION public.match_proposals(
  query_embedding  vector(1536),
  match_intents    TEXT[],           -- Counterparty intents pre-flipped in TypeScript
  exclude_user_id  UUID,             -- Source user to exclude from results
  min_quality      INT DEFAULT 3,    -- Quality tier ceiling (1=Rich -> 3=Thin; 4=Stub excluded)
  result_count     INT DEFAULT 30    -- Max candidates to return before TypeScript hard rules
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  intent             TEXT,
  industry           TEXT,
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
  quality_tier       NUMERIC,
  is_shell           BOOLEAN,
  metadata           JSONB,
  created_at         TIMESTAMPTZ,
  similarity         FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.intent,
    COALESCE(
      p.industry,
      NULLIF(TRIM(p.metadata->>'industry'), ''),
      NULLIF(TRIM(p.metadata->>'original_industry'), ''),
      p.sectors[1]
    ) AS industry,
    p.sectors,
    p.geographies,
    p.deal_size_min_cr,
    p.deal_size_max_cr,
    p.revenue_min_cr,
    p.revenue_max_cr,
    p.deal_structure,
    p.normalised_text,
    p.raw_text,
    p.fraud_flags,
    p.quality_tier,
    COALESCE(p.is_shell, false) AS is_shell,
    -- Strip any confidential fields from metadata before returning to engine
    p.metadata - 'contact_email' - 'contact_phone' - 'advisor_name' - 'URL' - 'source_file' AS metadata,
    p.created_at,
    (1 - (p.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.proposals p
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

-- 4. Update get_deals_for_user RPC to return candidate industry
DROP FUNCTION IF EXISTS public.get_deals_for_user(UUID);

CREATE OR REPLACE FUNCTION public.get_deals_for_user(
  p_user_id UUID
)
RETURNS TABLE (
  -- Proposal columns
  proposal_id             UUID,
  proposal_intent         TEXT,
  proposal_industry       TEXT,
  proposal_sectors        TEXT[],
  proposal_geographies    TEXT[],
  proposal_size_min       NUMERIC,
  proposal_size_max       NUMERIC,
  proposal_status         TEXT,
  proposal_created_at     TIMESTAMPTZ,
  proposal_raw_text       TEXT,
  proposal_normalised_text TEXT,
  proposal_summary_text   TEXT,
  proposal_metadata       JSONB,
  proposal_source         TEXT,

  -- Match columns (NULL when no matches exist)
  match_id                UUID,
  match_similarity_score  NUMERIC,
  match_final_score       NUMERIC,
  match_reason            TEXT,
  matched_proposal_id     UUID,

  -- Counterparty proposal columns (NULL when no matches exist)
  cp_intent               TEXT,
  cp_industry             TEXT,
  cp_sectors              TEXT[],
  cp_geographies          TEXT[],
  cp_size_min             NUMERIC,
  cp_size_max             NUMERIC,
  cp_deal_structure       TEXT,
  cp_raw_text             TEXT,
  cp_normalised_text      TEXT,
  cp_summary_text         TEXT,
  cp_metadata             JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- Proposal
    p.id                    AS proposal_id,
    p.intent                AS proposal_intent,
    COALESCE(p.industry, p.metadata->>'industry', p.metadata->>'original_industry', p.sectors[1]) AS proposal_industry,
    p.sectors               AS proposal_sectors,
    p.geographies           AS proposal_geographies,
    p.deal_size_min_cr      AS proposal_size_min,
    p.deal_size_max_cr      AS proposal_size_max,
    p.status                AS proposal_status,
    p.created_at            AS proposal_created_at,
    p.raw_text              AS proposal_raw_text,
    p.normalised_text       AS proposal_normalised_text,
    p.summary_text          AS proposal_summary_text,
    p.metadata              AS proposal_metadata,
    p.source                AS proposal_source,

    -- Match (LEFT JOIN — NULL rows = no matches)
    pm.id                   AS match_id,
    pm.similarity_score     AS match_similarity_score,
    pm.final_score          AS match_final_score,
    pm.match_reason         AS match_reason,
    pm.matched_proposal_id  AS matched_proposal_id,

    -- Counterparty proposal
    cp.intent               AS cp_intent,
    COALESCE(cp.industry, cp.metadata->>'industry', cp.metadata->>'original_industry', cp.sectors[1]) AS cp_industry,
    cp.sectors              AS cp_sectors,
    cp.geographies          AS cp_geographies,
    cp.deal_size_min_cr     AS cp_size_min,
    cp.deal_size_max_cr     AS cp_size_max,
    cp.deal_structure       AS cp_deal_structure,
    cp.raw_text             AS cp_raw_text,
    cp.normalised_text      AS cp_normalised_text,
    cp.summary_text         AS cp_summary_text,
    cp.metadata - 'contact_email' - 'contact_phone' - 'advisor_name' - 'URL' - 'source_file' AS cp_metadata

  FROM public.proposals p
  LEFT JOIN public.proposal_matches pm
    ON pm.proposal_id = p.id
  LEFT JOIN public.proposals cp
    ON cp.id = pm.matched_proposal_id
  WHERE
    p.user_id = p_user_id
    AND p.status = 'ACTIVE'
  ORDER BY
    p.created_at DESC,
    pm.final_score DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
