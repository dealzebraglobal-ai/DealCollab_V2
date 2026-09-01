-- ================================================================
-- DealCollab: EOI Atomic Validation & Idempotency (2026-09-01)
--
-- PURPOSE:
--   Guarantees that duplicate EOIs cannot be created for the same match/sender
--   pair at the database level.
--   Enforces idempotency and eliminates race conditions.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_eois_match_sender
  ON eois (match_id, sender_id)
  WHERE match_id IS NOT NULL;
