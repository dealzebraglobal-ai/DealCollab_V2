-- Migration to add serving_sectors and update match_proposals

ALTER TABLE proposals ADD COLUMN serving_sectors TEXT[];

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
  serving_sectors    TEXT[],
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
    p.serving_sectors,
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
    p.is_shell,
    p.metadata,
    p.created_at,
    -- Inner product for normalized embeddings (distance goes from 0 to 2, similarity goes from 1 to -1)
    -- Higher is better. Inner product is fast.
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.proposals p
  WHERE
    p.status = 'ACTIVE'
    AND p.intent = ANY(match_intents)
    AND p.user_id != exclude_user_id
    AND p.quality_tier <= min_quality
  ORDER BY
    p.embedding <=> query_embedding ASC
  LIMIT result_count;
END;
$$;
