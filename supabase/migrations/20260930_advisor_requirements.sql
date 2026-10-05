-- ================================================================
-- Migration: Advisor Standing Requirements & Matchmaking Fallback
-- Date: 2026-09-30
-- Purpose: Dedicated storage and semantic search for IB/Advisor 
--          standing buy-side requirements (5-slot onboarding grid)
-- ================================================================

-- 1. Create advisor_requirements table
CREATE TABLE IF NOT EXISTS public.advisor_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slot_index          INT NOT NULL CHECK (slot_index >= 1 AND slot_index <= 10),
  intent              TEXT NOT NULL DEFAULT 'BUY_SIDE',
  sectors             TEXT[] NOT NULL DEFAULT '{}',
  niche               TEXT NOT NULL,
  cities              TEXT[] NOT NULL DEFAULT '{}',
  revenue_raw         TEXT,
  revenue_min_cr      NUMERIC,
  revenue_max_cr      NUMERIC,
  details             TEXT,
  business_models     TEXT[] DEFAULT '{}',
  deal_structures     TEXT[] DEFAULT '{}',
  embedding           vector(1536),
  embedding_status    TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETE, FAILED
  status              TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, PAUSED, DELETED
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT uq_advisor_requirements_user_slot UNIQUE(user_id, slot_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_adv_reqs_user_id ON public.advisor_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_adv_reqs_status ON public.advisor_requirements(status);
CREATE INDEX IF NOT EXISTS idx_adv_reqs_embedding ON public.advisor_requirements USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2. Add requirement_id to eois table for connecting on standing requirements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'eois' AND column_name = 'requirement_id'
  ) THEN
    ALTER TABLE public.eois ADD COLUMN requirement_id UUID REFERENCES public.advisor_requirements(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Helper RPC to store embeddings for advisor requirements
CREATE OR REPLACE FUNCTION public.update_advisor_requirement_embedding(
  requirement_id UUID,
  embedding_vector TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.advisor_requirements
  SET embedding = embedding_vector::vector(1536),
      embedding_status = 'COMPLETE',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = requirement_id;
END;
$$;

-- 4. RPC for zero-match fallback search on advisor requirements
CREATE OR REPLACE FUNCTION public.match_advisor_requirements(
  query_embedding    vector(1536),
  exclude_user_id    UUID,
  result_count       INT DEFAULT 10
)
RETURNS TABLE (
  id                 UUID,
  user_id            UUID,
  slot_index         INT,
  intent             TEXT,
  sectors            TEXT[],
  niche              TEXT,
  cities             TEXT[],
  revenue_raw        TEXT,
  revenue_min_cr     NUMERIC,
  revenue_max_cr     NUMERIC,
  details            TEXT,
  business_models    TEXT[],
  deal_structures    TEXT[],
  advisor_name       TEXT,
  advisor_firm       TEXT,
  advisor_city       TEXT,
  advisor_role       TEXT,
  similarity         FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.id,
    ar.user_id,
    ar.slot_index,
    ar.intent,
    ar.sectors,
    ar.niche,
    ar.cities,
    ar.revenue_raw,
    ar.revenue_min_cr,
    ar.revenue_max_cr,
    ar.details,
    ar.business_models,
    ar.deal_structures,
    u.name AS advisor_name,
    u.firm_name AS advisor_firm,
    u.base_city AS advisor_city,
    COALESCE(u.custom_role, u.role) AS advisor_role,
    1 - (ar.embedding <=> query_embedding) AS similarity
  FROM public.advisor_requirements ar
  JOIN public.users u ON u.id = ar.user_id
  WHERE ar.status = 'ACTIVE'
    AND ar.embedding IS NOT NULL
    AND ar.user_id != exclude_user_id
  ORDER BY ar.embedding <=> query_embedding ASC
  LIMIT result_count;
END;
$$;
