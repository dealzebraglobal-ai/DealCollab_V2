-- DealCollab — READ-ONLY DIAGNOSTIC PROBES
-- =========================================
-- Place at: supabase/probes/2026xxxx_matching_diagnostics.sql
-- Run in the Supabase SQL editor, ONE BLOCK AT A TIME, IN ORDER, same session.
--
-- Writes nothing. Creates temp tables only (dropped at session end).
-- Paste the output of blocks 1d, 2 and 3 back.


-- =====================================================================
-- PROBE 1 — IS THE ivfflat INDEX COSTING US CANDIDATES?
-- ---------------------------------------------------------------------
-- lists = 100 over ~2,645 active rows means each list holds ~26 vectors.
-- At ivfflat.probes = 1 the scan touches ONE list before the WHERE filters
-- (status / embedding_status / quality_tier / intent) are applied. If that
-- is what production does, the "top 30" is not the top 30 of anything.
-- Block 1c forces an exact scan, which is ground truth.
-- =====================================================================

-- 1a. Pick one real user proposal as the query vector.
DROP TABLE IF EXISTS probe_q;
CREATE TEMP TABLE probe_q AS
SELECT id, user_id, intent, sectors, embedding
FROM proposals
WHERE status = 'ACTIVE'
  AND embedding_status = 'DONE'
  AND embedding IS NOT NULL
  AND user_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

SELECT id, intent, sectors FROM probe_q;   -- note the intent, you need it below


-- 1b. ANN result at the production setting.
--     NOTE: exclude_user_id must NOT be NULL. The RPC's predicate is
--     (p.user_id IS NULL OR p.user_id != exclude_user_id) — passing NULL
--     collapses the entire candidate pool to seeded rows only.
SET ivfflat.probes = 1;
DROP TABLE IF EXISTS probe_ann;
CREATE TEMP TABLE probe_ann AS
SELECT m.id, m.similarity
FROM probe_q q,
     LATERAL match_proposals(
       q.embedding,
       ARRAY['BUY_SIDE','SELL_SIDE','FUNDRAISING'],  -- widened on purpose: measuring RETRIEVAL, not intent logic
       q.user_id,
       3,
       30
     ) m;


-- 1c. Exact ground truth — same call, index scans disabled.
SET enable_indexscan = off;
SET enable_bitmapscan = off;
DROP TABLE IF EXISTS probe_exact;
CREATE TEMP TABLE probe_exact AS
SELECT m.id, m.similarity
FROM probe_q q,
     LATERAL match_proposals(
       q.embedding,
       ARRAY['BUY_SIDE','SELL_SIDE','FUNDRAISING'],
       q.user_id,
       3,
       30
     ) m;
SET enable_indexscan = on;
SET enable_bitmapscan = on;


-- 1d. THE ANSWER. Paste this row back.
--     recall_pct well below 100 = retrieval is the dominant bug and no
--     scoring change can fix it.
SELECT
  (SELECT count(*) FROM probe_ann)                                   AS ann_returned,
  (SELECT count(*) FROM probe_exact)                                 AS exact_returned,
  (SELECT count(*) FROM probe_ann a JOIN probe_exact e USING (id))   AS overlap,
  ROUND(100.0 * (SELECT count(*) FROM probe_ann a JOIN probe_exact e USING (id))
        / NULLIF((SELECT count(*) FROM probe_exact), 0), 1)          AS recall_pct,
  (SELECT ROUND(MAX(similarity)::numeric, 4) FROM probe_ann)         AS ann_best_similarity,
  (SELECT ROUND(MAX(similarity)::numeric, 4) FROM probe_exact)       AS exact_best_similarity;


-- =====================================================================
-- PROBE 2 — IS AN INDUSTRY RECOVERABLE FROM WHAT IS ALREADY STORED?
-- ---------------------------------------------------------------------
-- 90 of 2,645 active rows carry metadata->>'industry'. A hard industry gate
-- makes the other 2,555 unmatchable unless we can backfill. This shows
-- whether the stored text is rich enough for an extraction pass to work,
-- or whether the seeded corpus is simply too thin to classify.
-- =====================================================================

SELECT
  (user_id IS NULL)                                   AS seeded,
  sectors[1]                                          AS sector_enum,
  metadata->>'industry'                               AS metadata_industry,
  length(COALESCE(normalised_text, ''))               AS norm_len,
  length(COALESCE(raw_text, ''))                      AS raw_len,
  LEFT(COALESCE(NULLIF(raw_text, ''), normalised_text), 220) AS text_sample
FROM proposals
WHERE status = 'ACTIVE'
ORDER BY random()
LIMIT 30;


-- Aggregate view of how much text there is to work with, by cohort.
SELECT
  (user_id IS NULL)                                                     AS seeded,
  count(*)                                                              AS rows,
  count(*) FILTER (WHERE metadata ? 'industry')                         AS has_industry,
  ROUND(AVG(length(COALESCE(raw_text, ''))))                            AS avg_raw_len,
  count(*) FILTER (WHERE length(COALESCE(raw_text, '')) < 120)          AS raw_under_120_chars,
  count(*) FILTER (WHERE document_text IS NOT NULL)                     AS has_document_text
FROM proposals
WHERE status = 'ACTIVE'
GROUP BY 1;


-- =====================================================================
-- PROBE 3 — CORPUS SHAPE (the Q1 half that was not answered)
-- ---------------------------------------------------------------------
-- Tells us how many genuine counterparties any one mandate can ever reach
-- once the intent flip and the industry gate are both applied.
-- =====================================================================

SELECT
  sectors[1]            AS sector_enum,
  intent,
  (user_id IS NULL)     AS seeded,
  count(*)              AS rows
FROM proposals
WHERE status = 'ACTIVE'
GROUP BY 1, 2, 3
ORDER BY 4 DESC
LIMIT 40;


-- Shell rows currently reaching the scorer. HR-7 cannot filter them: the
-- RPC's RETURNS TABLE has no is_shell column, so candidate.is_shell is
-- undefined at runtime and the check never fires.
SELECT
  is_shell,
  count(*) AS rows,
  ROUND(AVG(shell_score), 2) AS avg_shell_score
FROM proposals
WHERE status = 'ACTIVE'
GROUP BY 1;