-- ================================================================
-- DealCollab: WhatsApp UI navigation state (2026-08-25)
--
-- PURPOSE:
--   Lets the WhatsApp adapter (src/lib/whatsapp/chatbot.ts) remember which
--   screen a numbered reply ("1"/"2"/"3") should be interpreted against —
--   e.g. on the counterparty-detail screen, "1" means "back to proposals",
--   whereas on the proposal-list screen it means "view P1". This is
--   WhatsApp-only presentation state, unrelated to the mandate-intake
--   RouterState already stored in chat_sessions.state, so it gets its own
--   column — the same pattern already used for whatsapp_phone_number.
--
--   Purely additive — no existing column is modified.
-- ================================================================

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS whatsapp_ui_state JSONB;
