-- ================================================================
-- DealCollab: Token economy + Razorpay payments + promo codes (2026-08-27)
--
-- PURPOSE:
--   Stage 3 — Razorpay + promo codes + token economy. Reuses the EXISTING
--   balance/ledger architecture (users.tokens as the authoritative balance,
--   token_transactions as the ledger) rather than introducing a parallel
--   token_accounts table — extends token_transactions with the columns
--   needed for idempotent, auditable purchase crediting.
--
--   Purely additive — no existing table or column is modified in place
--   (token_transactions gets new NULLABLE columns only).
-- ================================================================

-- ── Extend the existing ledger with idempotency + audit columns ──────────
ALTER TABLE token_transactions
  ADD COLUMN IF NOT EXISTS balance_before INTEGER,
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Guarantees "the same external event never credits tokens twice" at the
-- database level — one (reference_type, reference_id) pair can appear in
-- the ledger at most once. NULLs are excluded (existing rows and any
-- future non-referenced transaction types are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_transactions_reference_unique
  ON token_transactions (reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created
  ON token_transactions (user_id, created_at DESC);

-- ── Token packages — server-authoritative, DB-driven so pricing can be ───
-- set/changed by the team without a code deploy. Seeded EMPTY/inactive on
-- purpose: real pricing has not been decided yet (explicit instruction —
-- do not invent commercial numbers). Insert real rows with active=true
-- once pricing is finalized.
CREATE TABLE IF NOT EXISTS token_packages (
  id TEXT PRIMARY KEY,                 -- short slug, e.g. 'starter', 'growth'
  name TEXT NOT NULL,                  -- display name
  tokens INTEGER NOT NULL CHECK (tokens > 0),
  price_paise BIGINT NOT NULL CHECK (price_paise >= 0), -- smallest currency unit (matches Razorpay's own convention)
  currency TEXT NOT NULL DEFAULT 'INR',
  active BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Payment transactions — one row per Razorpay order attempt ────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES token_packages(id),
  razorpay_order_id TEXT,               -- NULL for a free (100%-discount) redemption that skips Razorpay entirely
  razorpay_payment_id TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),        -- final amount actually charged
  original_amount_paise BIGINT NOT NULL CHECK (original_amount_paise >= 0),
  discount_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  token_quantity INTEGER NOT NULL CHECK (token_quantity > 0),
  promo_code_id UUID,                   -- FK added below, after promocodes exists
  status TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_razorpay_order
  ON payment_transactions (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_razorpay_payment
  ON payment_transactions (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user
  ON payment_transactions (user_id, created_at DESC);

-- ── Promo codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promocodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,           -- stored uppercase; matched case-insensitively by the app layer
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'TOKEN_BONUS')),
  discount_value NUMERIC NOT NULL DEFAULT 0 CHECK (discount_value >= 0), -- percent (0-100) or paise, per discount_type
  token_bonus INTEGER CHECK (token_bonus IS NULL OR token_bonus > 0),
  start_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  max_total_uses INTEGER CHECK (max_total_uses IS NULL OR max_total_uses > 0),
  max_uses_per_user INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_user > 0),
  minimum_purchase_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (minimum_purchase_amount_paise >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  applicable_package_ids TEXT[],        -- NULL = applies to all packages
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_transactions
  ADD CONSTRAINT fk_payment_transactions_promo
  FOREIGN KEY (promo_code_id) REFERENCES promocodes(id);

-- ── Promo redemptions — one row per successful use, never per attempt ───
-- Only ever inserted when a payment actually succeeds (see the RPC below) —
-- a failed/cancelled payment never consumes a promo usage.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promocodes(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One promo redemption per payment, ever — the same payment can never
-- double-count toward promo usage limits.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_payment_unique
  ON promo_redemptions (payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_user
  ON promo_redemptions (promo_code_id, user_id);

-- ================================================================
-- RPC: capture_token_purchase
--
-- The single atomic boundary for "a payment succeeded, credit tokens."
-- Called from BOTH the client-verify route (fast-path UX) and the
-- Razorpay webhook (source of truth) — safe to call twice for the same
-- payment_transactions row because it checks current status under a row
-- lock before doing anything, so the second caller is a documented no-op.
--
-- Responsibilities, all in one transaction:
--   1. Lock the payment_transactions row (SELECT ... FOR UPDATE)
--   2. If already CAPTURED -> return success with ALREADY_PROCESSED
--      (idempotent no-op; this is what makes duplicate webhook delivery
--      and duplicate client-verify calls both safe)
--   3. Mark CAPTURED, stamp razorpay_payment_id + verified_at
--   4. Credit users.tokens (balance_before/after recorded)
--   5. Insert the token_transactions ledger row, referencing this payment
--      (reference_type='payment', reference_id=payment row id) — the
--      unique index on token_transactions above is the second, independent
--      guarantee against double-crediting even if this RPC were somehow
--      invoked concurrently for the same row from two connections.
--   6. If a promo was attached, insert its promo_redemptions row now
--      (never earlier — a failed/cancelled payment must never consume a
--      promo usage).
-- ================================================================
CREATE OR REPLACE FUNCTION capture_token_purchase(
  p_payment_id UUID,
  p_razorpay_payment_id TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  message TEXT,
  new_balance INTEGER,
  token_quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  -- Lock the payment row for the duration of this transaction so two
  -- concurrent callers (client-verify racing the webhook) serialize here.
  SELECT * INTO v_payment
  FROM payment_transactions
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'PAYMENT_NOT_FOUND', 'Payment record not found', NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  IF v_payment.status = 'CAPTURED' THEN
    -- Idempotent no-op — this is the expected path on a duplicate webhook
    -- delivery or a client-verify call racing an already-processed webhook.
    SELECT tokens INTO v_balance_after FROM users WHERE id = v_payment.user_id;
    RETURN QUERY SELECT true, 'ALREADY_PROCESSED', 'Payment already captured', v_balance_after, v_payment.token_quantity;
    RETURN;
  END IF;

  IF v_payment.status NOT IN ('CREATED', 'AUTHORIZED') THEN
    RETURN QUERY SELECT false, 'INVALID_STATE', format('Payment is in state %s, cannot capture', v_payment.status), NULL::INTEGER, NULL::INTEGER;
    RETURN;
  END IF;

  -- Credit tokens (row-locked via the users row update below).
  SELECT tokens INTO v_balance_before FROM users WHERE id = v_payment.user_id FOR UPDATE;
  v_balance_after := COALESCE(v_balance_before, 0) + v_payment.token_quantity;

  UPDATE users SET tokens = v_balance_after WHERE id = v_payment.user_id;

  UPDATE payment_transactions
  SET status = 'CAPTURED',
      razorpay_payment_id = p_razorpay_payment_id,
      verified_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  INSERT INTO token_transactions (user_id, type, action, amount, balance_after, balance_before, reference_type, reference_id, metadata)
  VALUES (
    v_payment.user_id,
    'credit',
    'PURCHASE',
    v_payment.token_quantity,
    v_balance_after,
    v_balance_before,
    'payment',
    p_payment_id,
    jsonb_build_object('package_id', v_payment.package_id, 'amount_paise', v_payment.amount_paise)
  );

  IF v_payment.promo_code_id IS NOT NULL THEN
    INSERT INTO promo_redemptions (promo_code_id, user_id, payment_transaction_id)
    VALUES (v_payment.promo_code_id, v_payment.user_id, p_payment_id)
    ON CONFLICT (payment_transaction_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, 'OK', 'Tokens credited', v_balance_after, v_payment.token_quantity;
END;
$$;

-- ================================================================
-- RPC: redeem_free_promo
--
-- Phase 17 (100% discount) path — no Razorpay order is ever created.
-- Validates the promo under a row lock (usage limits enforced here, not
-- just in the API layer, to close the race-condition window), creates a
-- payment_transactions row marked CAPTURED with amount=0 for audit
-- symmetry with paid purchases, and credits tokens in the same
-- transaction as the redemption record.
-- ================================================================
CREATE OR REPLACE FUNCTION redeem_free_promo(
  p_user_id UUID,
  p_promo_code_id UUID,
  p_package_id TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  error_code TEXT,
  message TEXT,
  new_balance INTEGER,
  payment_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_promo RECORD;
  v_package RECORD;
  v_total_uses INTEGER;
  v_user_uses INTEGER;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
  v_payment_id UUID;
  v_token_bonus INTEGER;
BEGIN
  SELECT * INTO v_promo FROM promocodes WHERE id = p_promo_code_id FOR UPDATE;
  IF NOT FOUND OR NOT v_promo.active THEN
    RETURN QUERY SELECT false, 'PROMO_INVALID', 'Promo code is not valid', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  IF v_promo.start_at IS NOT NULL AND now() < v_promo.start_at THEN
    RETURN QUERY SELECT false, 'PROMO_NOT_STARTED', 'Promo code is not yet active', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;
  IF v_promo.expires_at IS NOT NULL AND now() > v_promo.expires_at THEN
    RETURN QUERY SELECT false, 'PROMO_EXPIRED', 'Promo code has expired', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_uses FROM promo_redemptions WHERE promo_code_id = p_promo_code_id;
  IF v_promo.max_total_uses IS NOT NULL AND v_total_uses >= v_promo.max_total_uses THEN
    RETURN QUERY SELECT false, 'PROMO_EXHAUSTED', 'Promo code usage limit reached', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_user_uses FROM promo_redemptions WHERE promo_code_id = p_promo_code_id AND user_id = p_user_id;
  IF v_user_uses >= v_promo.max_uses_per_user THEN
    RETURN QUERY SELECT false, 'PROMO_ALREADY_USED', 'You have already used this promo code', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_package FROM token_packages WHERE id = p_package_id AND active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'PACKAGE_NOT_FOUND', 'Package not found or inactive', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  IF v_promo.applicable_package_ids IS NOT NULL AND NOT (p_package_id = ANY(v_promo.applicable_package_ids)) THEN
    RETURN QUERY SELECT false, 'PROMO_NOT_APPLICABLE', 'Promo code does not apply to this package', NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;

  -- Token quantity: package tokens plus any TOKEN_BONUS the promo adds.
  v_token_bonus := v_package.tokens + COALESCE(
    CASE WHEN v_promo.discount_type = 'TOKEN_BONUS' THEN v_promo.token_bonus ELSE NULL END,
    0
  );

  SELECT tokens INTO v_balance_before FROM users WHERE id = p_user_id FOR UPDATE;
  v_balance_after := COALESCE(v_balance_before, 0) + v_token_bonus;

  INSERT INTO payment_transactions (
    user_id, package_id, razorpay_order_id, razorpay_payment_id,
    amount_paise, original_amount_paise, discount_amount_paise, currency,
    token_quantity, promo_code_id, status, verified_at
  ) VALUES (
    p_user_id, p_package_id, NULL, NULL,
    0, v_package.price_paise, v_package.price_paise, v_package.currency,
    v_token_bonus, p_promo_code_id, 'CAPTURED', now()
  )
  RETURNING id INTO v_payment_id;

  UPDATE users SET tokens = v_balance_after WHERE id = p_user_id;

  INSERT INTO token_transactions (user_id, type, action, amount, balance_after, balance_before, reference_type, reference_id, metadata)
  VALUES (
    p_user_id, 'credit', 'PROMO_BONUS', v_token_bonus, v_balance_after, v_balance_before,
    'payment', v_payment_id, jsonb_build_object('package_id', p_package_id, 'promo_code_id', p_promo_code_id)
  );

  INSERT INTO promo_redemptions (promo_code_id, user_id, payment_transaction_id)
  VALUES (p_promo_code_id, p_user_id, v_payment_id);

  RETURN QUERY SELECT true, 'OK', 'Promo redeemed', v_balance_after, v_payment_id;
END;
$$;
