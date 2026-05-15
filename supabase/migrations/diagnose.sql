-- ═══════════════════════════════════════════════════════════════
-- DEALCOLLAB MATCHMAKING DIAGNOSTIC
-- Paste the output of every block back to confirm state
-- ═══════════════════════════════════════════════════════════════

-- BLOCK A: How many proposals exist by status?
SELECT 'A1' AS block, 'proposals total' AS metric, COUNT(*)::TEXT AS value FROM proposals
UNION ALL
SELECT 'A2', 'mandates total', COUNT(*)::TEXT FROM mandates
UNION ALL
SELECT 'A3', 'proposals with embedding', COUNT(*)::TEXT FROM proposals WHERE embedding IS NOT NULL
UNION ALL
SELECT 'A4', 'proposals embedding_status=ACTIVE', COUNT(*)::TEXT FROM proposals WHERE embedding_status='ACTIVE'
UNION ALL
SELECT 'A5', 'proposals status=ACTIVE', COUNT(*)::TEXT FROM proposals WHERE status='ACTIVE';

-- BLOCK B: Intent distribution in proposals
SELECT intent, COUNT(*) FROM proposals GROUP BY intent ORDER BY COUNT(*) DESC;

-- BLOCK C: Intent + sector distribution
SELECT intent, sectors[1] AS first_sector, COUNT(*)
FROM proposals
WHERE intent IS NOT NULL
GROUP BY intent, sectors[1]
ORDER BY intent, COUNT(*) DESC
LIMIT 30;

-- BLOCK D: Quality tier distribution
SELECT quality_tier, embedding_status, COUNT(*)
FROM proposals
GROUP BY quality_tier, embedding_status
ORDER BY quality_tier;

-- BLOCK E: What would match your recent BUY_SIDE pharma proposal?
SELECT
  COUNT(*) AS total_active_proposals,
  COUNT(*) FILTER (WHERE intent = 'SELL_SIDE') AS sell_side_count,
  COUNT(*) FILTER (WHERE intent = 'SELL_SIDE' AND 'pharma' = ANY(sectors)) AS sell_side_pharma,
  COUNT(*) FILTER (WHERE intent = 'SELL_SIDE' AND embedding_status='ACTIVE') AS sell_side_embedded,
  COUNT(*) FILTER (WHERE intent = 'SELL_SIDE' AND 'pharma' = ANY(sectors) AND embedding_status='ACTIVE') AS pharma_embedded_matchable
FROM proposals;

-- BLOCK F: The proposal that just got created in your last test
SELECT id, user_id, intent, sectors, geographies, quality_tier, embedding_status, status, created_at
FROM proposals
ORDER BY created_at DESC
LIMIT 5;

-- BLOCK G: How many proposal_matches exist?
SELECT COUNT(*) AS total_matches, COUNT(DISTINCT proposal_id) AS unique_proposals_with_matches
FROM proposal_matches;