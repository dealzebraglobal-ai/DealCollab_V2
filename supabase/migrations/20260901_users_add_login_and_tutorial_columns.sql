-- ================================================================
-- DealCollab: users — add last_login_at + onboarding_tutorial_completed
-- (2026-09-01)
--
-- WHY:
--   Both columns were added to src/db/schema.ts on 2026-09-01
--   (last_login_at in commit 240cad9, onboarding_tutorial_completed in
--   5f96c02) but NO migration was ever written for them.
--
--   Drizzle's relational query builder (`db.query.users.findFirst()` /
--   `.findMany()`) emits `SELECT <every column in schema.ts>`. Once schema.ts
--   listed a column the production table did not have, every such read threw
--   `42703 column "users.<col>" does not exist` — breaking, among others,
--   POST /api/auth/email-otp/send and /verify (HTTP 500 before the email
--   provider is ever called).
--
-- SAFETY:
--   Both are additive, nullable / defaulted, and idempotent
--   (ADD COLUMN IF NOT EXISTS). No data is modified or dropped. Matches
--   src/db/schema.ts exactly:
--     lastLoginAt: timestamp('last_login_at')                       -- nullable, no default
--     onboardingTutorialCompleted: boolean('onboarding_tutorial_completed').default(false)
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tutorial_completed boolean DEFAULT false;
