-- =============================================================
-- DealCollab: Safe Backfill — proposals.industry
-- =============================================================
-- Purpose: For proposals where industry IS NULL, attempt to
--          classify based on metadata, mandate, or keywords.
-- Safety:  Idempotent, reversible, never invents an industry.
-- =============================================================

BEGIN;

UPDATE public.proposals AS p
SET 
  industry = classified.detected_industry,
  updated_at = NOW()
FROM (
  SELECT 
    p.id AS proposal_id,
    CASE 
      WHEN p.metadata->>'industry' IS NOT NULL AND p.metadata->>'industry' != '' THEN p.metadata->>'industry'
      WHEN p.metadata->>'original_industry' IS NOT NULL AND p.metadata->>'original_industry' != '' THEN p.metadata->>'original_industry'
      WHEN m.industry IS NOT NULL AND m.industry != '' THEN m.industry
      WHEN p.raw_text ILIKE '%home textile%' OR p.raw_text ILIKE '%bed linen%' OR p.raw_text ILIKE '%towels%' THEN 'Home Textiles'
      ELSE NULL
    END AS detected_industry
  FROM public.proposals p
  LEFT JOIN public.mandates m ON p.mandate_id = m.id
  WHERE p.industry IS NULL OR p.industry = ''
) AS classified
WHERE p.id = classified.proposal_id
  AND (p.industry IS NULL OR p.industry = '')
  AND classified.detected_industry IS NOT NULL;

COMMIT;
