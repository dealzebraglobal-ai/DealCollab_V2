-- ================================================================
-- RPC: match_proposals (Synchronized with M5 TypeScript Engine)
-- ================================================================
CREATE OR REPLACE FUNCTION match_proposals(
  query_embedding  vector(1536),
  match_intents    TEXT[],           -- Targeted counterparty intents (pre-flipped in TS)
  exclude_user_id  UUID,             -- User to exclude from results
  min_quality      INT DEFAULT 3,    -- Minimum quality tier allowed (1=Rich, 3=Thin)
  result_count     INT DEFAULT 30    -- Number of candidates to retrieve
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
BEGIN
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
    AND p.quality_tier  <= min_quality
    AND (p.user_id IS NULL OR p.user_id != exclude_user_id)
    AND (p.intent = ANY(match_intents))
    AND (1 - (p.embedding <=> query_embedding)) > 0.12
  ORDER BY p.embedding <=> query_embedding
  LIMIT result_count;
END;
$$;
