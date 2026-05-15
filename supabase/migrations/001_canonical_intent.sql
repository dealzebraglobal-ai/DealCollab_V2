-- One-time canonicalization of intent labels
UPDATE proposals SET intent = 'BUY_SIDE'    WHERE intent ILIKE 'buy%';
UPDATE proposals SET intent = 'SELL_SIDE'   WHERE intent ILIKE 'sell%';
UPDATE proposals SET intent = 'BUY_SIDE'    WHERE intent ILIKE 'invest%'; -- RC4

UPDATE mandates SET intent = 'BUY_SIDE'   WHERE intent ILIKE 'buy%';
UPDATE mandates SET intent = 'SELL_SIDE'  WHERE intent ILIKE 'sell%';
UPDATE mandates SET intent = 'BUY_SIDE'   WHERE intent ILIKE 'invest%';

-- Add canonical constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proposals_intent_canonical'
  ) THEN
    ALTER TABLE proposals
      ADD CONSTRAINT proposals_intent_canonical
      CHECK (intent IS NULL OR intent IN (
        'BUY_SIDE', 'SELL_SIDE', 'FUNDRAISING', 'DEBT', 'STRATEGIC_PARTNERSHIP'
      ));
  END IF;
END $$;