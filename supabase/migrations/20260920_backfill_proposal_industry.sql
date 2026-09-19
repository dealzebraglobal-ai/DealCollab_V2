-- =============================================================
-- DealCollab: Safe Backfill — proposals.industry
-- =============================================================
-- Purpose: For proposals where industry IS NULL, attempt to
--          copy the industry from the related mandate record.
-- Safety:  Idempotent, reversible, never invents an industry.
-- =============================================================

-- 1. Diagnostic: Show current state before backfill
SELECT
  COUNT(*)                                                    AS total_proposals,
  COUNT(*) FILTER (WHERE industry IS NOT NULL AND industry != '') AS proposals_with_industry,
  COUNT(*) FILTER (WHERE industry IS NULL OR industry = '')   AS proposals_without_industry
FROM proposals;

-- 2. Safe backfill: copy mandate.industry -> proposal.industry
--    Only updates records where:
--      a. proposal.industry IS NULL
--      b. The related mandate HAS a non-empty industry
--    This is idempotent: running twice is safe.
UPDATE proposals p
SET
  industry = m.industry,
  updated_at = NOW()
FROM mandates m
WHERE
  p.mandate_id = m.id
  AND (p.industry IS NULL OR p.industry = '')
  AND m.industry IS NOT NULL
  AND m.industry != '';

-- 3. Diagnostic: Show state AFTER backfill
SELECT
  COUNT(*)                                                    AS total_proposals,
  COUNT(*) FILTER (WHERE industry IS NOT NULL AND industry != '') AS proposals_with_industry,
  COUNT(*) FILTER (WHERE industry IS NULL OR industry = '')   AS proposals_still_null
FROM proposals;
