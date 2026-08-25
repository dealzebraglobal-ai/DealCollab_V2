-- ================================================================
-- DealCollab: WhatsApp inbound event ledger (2026-08-25)
--
-- PURPOSE:
--   WappBiz's inbound webhook payload/signature format is not documented
--   anywhere in their API docs or Postman collection. This table lets the
--   webhook persist the raw payload as-is (no guessed field extraction)
--   and, once a real message id is confirmed from an observed delivery,
--   doubles as the idempotency ledger so a retried webhook delivery is
--   never processed twice (see /api/webhooks/wappbiz).
--
--   Purely additive — no existing table or column is modified.
-- ================================================================

CREATE TABLE IF NOT EXISTS whatsapp_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'wappbiz',
  provider_message_id text,
  raw_payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_provider_msg
  ON whatsapp_inbound_events (provider_message_id);

-- Enforces "process once" at the database level: a second INSERT for the
-- same (provider, provider_message_id) conflicts and is skipped via
-- ON CONFLICT DO NOTHING in the webhook handler, rather than a race-prone
-- check-then-insert. A plain (non-partial) unique index is used because
-- Postgres already treats each NULL as distinct within a unique index, and
-- a partial index's predicate would otherwise have to be repeated verbatim
-- on every ON CONFLICT clause for constraint inference to match it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_inbound_provider_msg_unique
  ON whatsapp_inbound_events (provider, provider_message_id);
