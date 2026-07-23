-- ================================================================
-- DealCollab: get_deals_for_user RPC (2026-07-20)
--
-- PURPOSE:
--   Replaces the two-query pattern in /api/deals that used a
--   `.in('proposal_id', proposalIds)` filter. That pattern translates
--   to a PostgREST GET URL that grows by ~36 chars per UUID, causing
--   HeadersOverflowError (UND_ERR_HEADERS_OVERFLOW) once the user has
--   enough proposals.
--
--   This RPC performs the JOIN server-side. The API route only needs to
--   send { p_user_id: uuid } — the URL is always ~150 chars.
--
-- RETURNS: One row per (proposal, match) pair.
--   Rows where matched_proposal_id IS NULL represent proposals with
--   zero matches — the API route groups by proposal_id.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_deals_for_user(
  p_user_id UUID
)
RETURNS TABLE (
  -- Proposal columns
  proposal_id             UUID,
  proposal_intent         TEXT,
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
    cp.sectors              AS cp_sectors,
    cp.geographies          AS cp_geographies,
    cp.deal_size_min_cr     AS cp_size_min,
    cp.deal_size_max_cr     AS cp_size_max,
    cp.deal_structure       AS cp_deal_structure,
    cp.raw_text             AS cp_raw_text,
    cp.normalised_text      AS cp_normalised_text,
    cp.summary_text         AS cp_summary_text,
    cp.metadata             AS cp_metadata

  FROM proposals p
  LEFT JOIN proposal_matches pm
    ON pm.proposal_id = p.id
  LEFT JOIN proposals cp
    ON cp.id = pm.matched_proposal_id
  WHERE
    p.user_id = p_user_id
    AND p.status = 'ACTIVE'
  ORDER BY
    p.created_at DESC,
    pm.final_score DESC NULLS LAST;
$$;

-- Grant to all roles used by the Supabase client
GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_deals_for_user(UUID) TO service_role;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
