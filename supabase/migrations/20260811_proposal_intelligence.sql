-- ================================================================
-- PROPOSAL INTELLIGENCE SEARCH FUNCTION (2026-08-11)
-- Supports hybrid search (pgvector semantic similarity + keyword/metadata boosting)
-- ================================================================

CREATE OR REPLACE FUNCTION public.search_proposals_intelligence(
  query_embedding  vector(1536) DEFAULT NULL,
  filter_intent    TEXT DEFAULT NULL,
  filter_sector    TEXT DEFAULT NULL,
  filter_geography TEXT DEFAULT NULL,
  filter_keyword   TEXT DEFAULT NULL,
  filter_status    TEXT DEFAULT 'ACTIVE',
  strict_filters   BOOLEAN DEFAULT FALSE,
  result_count     INT DEFAULT 50
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
  advisor_name       TEXT,
  contact_phone      TEXT,
  status             TEXT,
  created_at         TIMESTAMPTZ,
  similarity         FLOAT,
  combined_score     FLOAT,
  user_name          TEXT,
  user_email         TEXT,
  user_phone         TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  has_emb BOOLEAN;
BEGIN
  has_emb := query_embedding IS NOT NULL;
  
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.intent, p.sectors, p.geographies,
    p.deal_size_min_cr, p.deal_size_max_cr,
    p.revenue_min_cr,   p.revenue_max_cr,
    p.deal_structure, p.normalised_text, p.raw_text,
    p.advisor_name, p.contact_phone,
    p.status, p.created_at,
    -- Cosine similarity
    CASE 
      WHEN has_emb AND p.embedding IS NOT NULL THEN (1 - (p.embedding <=> query_embedding))::FLOAT
      ELSE 0.0
    END AS similarity,
    -- Combined hybrid score
    (
      -- Semantic similarity component (base 0.0 to 1.0)
      (CASE WHEN has_emb AND p.embedding IS NOT NULL THEN (1 - (p.embedding <=> query_embedding))::FLOAT ELSE 0.0 END) +
      -- Intent match boost
      (CASE WHEN filter_intent IS NOT NULL AND p.intent ILIKE filter_intent THEN 0.3 ELSE 0.0 END) +
      -- Sector match boost (checks any sector matching the prefix/query)
      (CASE WHEN filter_sector IS NOT NULL AND (
        filter_sector = ANY(p.sectors) OR EXISTS (SELECT 1 FROM unnest(p.sectors) s WHERE s ILIKE '%' || filter_sector || '%')
      ) THEN 0.3 ELSE 0.0 END) +
      -- Geography match boost
      (CASE WHEN filter_geography IS NOT NULL AND (
        filter_geography = ANY(p.geographies) OR EXISTS (SELECT 1 FROM unnest(p.geographies) g WHERE g ILIKE '%' || filter_geography || '%')
      ) THEN 0.3 ELSE 0.0 END) +
      -- Keyword match boost
      (CASE WHEN filter_keyword IS NOT NULL AND (
        p.normalised_text ILIKE '%' || filter_keyword || '%' OR p.raw_text ILIKE '%' || filter_keyword || '%'
      ) THEN 0.2 ELSE 0.0 END)
    )::FLOAT AS combined_score,
    u.name AS user_name,
    u.email AS user_email,
    u.phone AS user_phone
  FROM proposals p
  LEFT JOIN users u ON p.user_id = u.id
  WHERE
    -- Enforce status filter if provided
    (filter_status IS NULL OR filter_status = 'ALL' OR p.status = filter_status)
    -- If strict filters are enabled, enforce hard constraints
    AND (NOT strict_filters OR (
      (filter_intent IS NULL OR p.intent ILIKE filter_intent)
      AND (filter_sector IS NULL OR filter_sector = ANY(p.sectors) OR EXISTS (SELECT 1 FROM unnest(p.sectors) s WHERE s ILIKE '%' || filter_sector || '%'))
      AND (filter_geography IS NULL OR filter_geography = ANY(p.geographies) OR EXISTS (SELECT 1 FROM unnest(p.geographies) g WHERE g ILIKE '%' || filter_geography || '%'))
      AND (filter_keyword IS NULL OR p.normalised_text ILIKE '%' || filter_keyword || '%' OR p.raw_text ILIKE '%' || filter_keyword || '%')
    ))
    -- If embedding is present, ensure row has embedding (optional filter fallback)
    AND (NOT has_emb OR p.embedding IS NOT NULL)
  ORDER BY
    -- Order by combined score descending
    18 DESC,
    p.created_at DESC
  LIMIT result_count;
END;
$$;

-- Grant execute permissions to service role and authenticated users
GRANT EXECUTE ON FUNCTION public.search_proposals_intelligence TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_proposals_intelligence TO anon;
GRANT EXECUTE ON FUNCTION public.search_proposals_intelligence TO service_role;
