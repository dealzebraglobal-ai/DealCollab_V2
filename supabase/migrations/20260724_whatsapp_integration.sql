-- ================================================================
-- DealCollab: Native WhatsApp integration (2026-07-24)
--
-- PURPOSE:
--   Adds the minimal columns needed to run WhatsApp-originated chat
--   threads through the existing chat/matchmaking pipeline and tell
--   them apart in Deal Log. Reuses users.source, mandates.source, and
--   proposals.source (already free-text columns — 'WHATSAPP' is just a
--   new value, no schema change needed there).
--
-- chat_sessions:
--   source                 — 'WEB' | 'WHATSAPP' (defaults 'WEB' so every
--                             existing row is backward compatible)
--   whatsapp_phone_number  — lets the webhook find the open thread for
--                             an inbound WhatsApp number without a
--                             client-supplied chatId (WhatsApp has none)
-- ================================================================

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_whatsapp_phone
  ON chat_sessions (whatsapp_phone_number)
  WHERE whatsapp_phone_number IS NOT NULL;
