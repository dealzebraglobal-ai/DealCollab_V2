@AGENTS.md

---

# DealCollab — Codebase Context

## What This App Is
DealCollab is an **M&A deal-sourcing and matchmaking platform** for India's private market. It uses an AI-driven chat interface to capture deal mandates (buy/sell/raise/debt/partnership), then matches them with counterparties using vector similarity + structured scoring. Think Bloomberg Terminal for SME M&A deals.

---

## Tech Stack
- **Framework**: Next.js (App Router) — deployed on Vercel
- **Database**: Supabase (PostgreSQL) — accessed via Drizzle ORM (`src/db/`) AND raw Supabase client (`src/utils/supabase/`)
- **Auth**: NextAuth.js — Google OAuth + phone/OTP verification (`src/auth.ts`, `src/auth.config.ts`)
- **LLM**: Groq API (chat inference via `GROQ_API_KEY`)
- **Embeddings**: OpenAI API (semantic matching vectors)
- **WhatsApp**: Custom integration for deal notifications (`src/lib/whatsapp.ts`)
- **ORM**: Drizzle ORM (`drizzle.config.ts`, `src/db/schema.ts`)

---

## Directory Structure

```
src/
  app/
    (auth)/           # Login, signup, OTP verify pages
    (dashboard)/      # All authenticated pages (home, deal, deal-log, profile, analytics, etc.)
    api/
      chat/           # Main chat API (route.ts = core intelligence endpoint)
      matches/        # Match fetching + connection flow
      eois/           # Expression of Interest endpoints
      deals/          # Deal CRUD
      notifications/  # In-app notifications
      profile/        # Profile create/update/upload
      auth/           # Auth helpers (OTP, Google link, save-phone)
      admin/          # Diagnose/rematch tools
      cron/rematch/   # Scheduled re-match for queued proposals
      webhooks/       # WhatsApp webhook
  components/
    intelligence/     # Premium deal intelligence UI modules
    profile-setup/    # Multi-step onboarding stepper
    auth/             # Auth UI components
    MatchPanel.tsx    # Shows matched counterparties
    ChatArea.tsx      # Main chat UI
    DealCard.tsx      # Deal list card
    MatchCard.tsx     # Match card
    ExtensionNoiseReducer.tsx  # Filters browser extension noise
  lib/
    promptRouter.ts       # THE BRAIN — builds modular AI system prompt (M0–M6)
    matchmakingEngine.ts  # Background matching pipeline (embeddings + scoring)
    scoringEngine.ts      # Pure scoring/hard-rules logic
    dataQuality.ts        # Data normalization (sizes, intent, encoding)
    intelligenceEngine.ts # AI processing call (Groq)
    responseBuilder.ts    # Builds final user-facing message from extraction
    normalizeMessage.ts   # Cleans raw user input
    conversationState.ts  # State helpers
    sectorMatrix.ts       # Sector adjacency/compatibility map
    dealDictionary.ts     # Deal terminology definitions
    documentParser.ts     # PDF/doc text extraction
    types.ts              # Shared types
    M1_coreIdentity.ts    # Standalone M1 module (legacy?)
    M2_phaseRules.ts      # Standalone M2 module
    M3_intentFrameworks.ts
    M4_sectorIntel.ts
    M5_matchingLayer.ts
    M5_sectorMatrix.ts
    controlLayer.ts
  db/
    schema.ts         # Drizzle schema (canonical DB definition)
    index.ts          # DB client init
  services/matching/  # Matching sub-services
    embeddingBuilder.ts
    scoringEngine.ts     # (separate from lib/scoringEngine.ts — check for overlap)
    taxonomyEngine.ts
    explanationEngine.ts
    rejectionEngine.ts
    matchPersistence.ts
  utils/supabase/
    server.ts         # createServerSupabaseClient()
    client.ts         # createClientSupabaseClient()
```

---

## Core Data Model (`src/db/schema.ts`)

| Table | Purpose |
|---|---|
| `users` | Platform users — advisors, bankers, PE funds, promoters |
| `proposals` | **Canonical** deal mandates (source of truth for matchmaking) |
| `proposal_matches` | Scored pairings between proposals |
| `mandates` | Legacy table — parallel writes kept for backward compat |
| `eois` | Expressions of Interest — when party wants to connect |
| `chat_sessions` | Per-user conversation with serialized `RouterState` |
| `chat_messages` | Full message history |
| `token_transactions` | Credit/debit ledger |
| `notifications` | In-app + WhatsApp alerts |
| `saved_searches` | Async re-match queue for zero-match proposals |
| `documents` | Uploaded deal docs (PDFs, teasers, IMs) |
| `deals` | Dashboard surface cards (simpler than proposals) |
| `accounts` / `sessions` / `verificationTokens` | NextAuth.js tables |

### Key `proposals` fields
- `intent`: BUY_SIDE | SELL_SIDE | FUNDRAISING | DEBT | STRATEGIC_PARTNERSHIP
- `sectors`: text[] — e.g. ['pharma', 'manufacturing']
- `quality_score` + `quality_tier`: Tier 1 (best) → Tier 4 (stub/spam, skips matching)
- `embedding_status`: PENDING → DONE (set after vector embedding created)
- `status`: ACTIVE | PENDING_ENRICHMENT

### Key `proposal_matches` fields
- `similarity_score`: cosine similarity from OpenAI embeddings
- `final_score`: composite (0.65 × cosine + 0.35 × keyword + bonuses)
- `match_archetype`: 'High' | 'Good' | 'Possible'

---

## Intelligence Engine — The Prompt Router (`src/lib/promptRouter.ts`)

This is the core of the product. Every chat turn, it assembles a system prompt from modular blocks:

### RouterState (persisted in `chat_sessions.state`)
```typescript
{
  intent: 'SELL_SIDE' | 'BUY_SIDE' | 'FUNDRAISING' | 'DEBT' | 'STRATEGIC_PARTNERSHIP' | null
  sector: SectorKey | null   // 15 sectors (pharma, manufacturing, saas, renewable, etc.)
  sub_sector: string | null  // e.g. 'shell_company', 'hospital', 'clinic'
  geography: string | null
  deal_size: string | null
  revenue: string | null
  structure: string | null
  intent_focus: string | null
  industry_data: Record<string, unknown>  // M4 sector-specific data
  is_sufficient: boolean
  is_complete: boolean
  is_profile_search: boolean
  is_intermediary: 'owner' | 'advisor' | null
  m4_questions_asked: boolean
  phase: 'ENTRY' | 'QUALIFICATION' | 'MOMENTUM' | 'CLOSURE' | 'MATCHING' | 'PROFILE_SEARCH'
  turn_count: number
  refinement_count: number
  round_count: number
  special_conditions: string[]
  strategic_intent: string | null
  proposal_id?: string | null
}
```

### Conversation Phases
1. **ENTRY** → Greeting, ask for intent
2. **QUALIFICATION** → Collect sector + M3 fields + M4 sector questions
3. **MOMENTUM** → Sufficient data; 1 refinement question, max 3 rounds
4. **CLOSURE** → Deliver structured closure message, trigger matchmaking
5. **MATCHING** → Show counterparties
6. **PROFILE_SEARCH** → Advisor/banker search mode

### Prompt Modules (M0–M6)
- **M0**: Output contract — LLM must return `{ intent, state, is_complete, message }` as JSON
- **M1**: Core identity — institutional tone, no "Thank you/Happy to help"
- **M2**: Phase rules — QUALIFICATION logic, friction detection, round limit (4 rounds auto-close)
- **M3**: Intent-specific qualification (one per intent: SELL_SIDE, BUY_SIDE, FUNDRAISING, DEBT, STRATEGIC)
- **M4**: Sector deep-dive (one per sector: pharma, manufacturing, saas, finserv, consumer, realestate, logistics, education, chemicals, hospitality, renewable, defence, oil_gas, ngo, mixed + shell override)
- **M5**: Match presentation (with or without matches)
- **M6**: Profile/talent search mode

### Key Detection Functions (all in `promptRouter.ts`)
- `detectIntentFromText(text)` — scoring-based, resolves ambiguity
- `detectSectorFromText(text)` — keyword scoring across 15 sectors
- `detectIntermediaryFromText(text)` — 'owner' | 'advisor' | null
- `detectFrictionSignal(text)` — 30+ patterns ("proceed", "this is enough", etc.)
- `detectShellCompanyFromText(text)` — 2+ signals = shell company
- `detectStructureFromText(text)` — "100%", "majority stake", etc.
- `detectDealSizeFromText(text)` — uses `normalizeSize()`
- `detectRevenueFromText(text)` — requires revenue keyword nearby

### Phase Auto-Close Rules
- Friction signal + minimum fields → `is_complete = true`
- 4+ qualification rounds → auto-close
- 3+ refinements in MOMENTUM → CLOSURE

---

## Chat API Flow (`src/app/api/chat/route.ts`)

Every POST to `/api/chat`:
1. Auth check (NextAuth session)
2. Resolve user ID (session.user.id → DB lookup → email fallback)
3. Load or create `chat_session` (with `state_version` for OCC)
4. Restore document context if file was uploaded
5. **RC3**: If friction detected → patch state to CLOSURE before prompt build
6. Save user message to `chat_messages`
7. Query 3 context proposals for M5 enrichment
8. **Pre-detect** intent/sector/structure/size/revenue/intermediary from raw message
9. `buildSystemPrompt(candidateState, matchedMandatesStr)` → assemble M0–M6
10. Call `processIntelligence()` → Groq LLM → get JSON extraction
11. `updateStateFromExtraction()` → merge LLM output into state
12. Apply RC3 friction override (layer 3), RC8 4-turn auto-close
13. Persist assistant message + updated state (OCC version bump)
14. On `is_complete=true`:
    - `normalizeIntent()` + `normalizeSize()` → canonical forms
    - `computeQualityScore()` → Tier 1–4
    - Insert into `proposals` (canonical) + `mandates` (legacy) + `deals`
    - If qTier < 4: fire `executeMatchmaking()` via Next.js `after()` (non-blocking)
15. Return `{ success, message, is_complete, chatId, proposalId }`

---

## Matchmaking Engine (`src/lib/matchmakingEngine.ts` + `scoringEngine.ts`)

Runs in background after closure:

1. Build semantic narrative string from proposal fields
2. Get OpenAI embedding for the narrative
3. Fetch candidates from `proposals` with:
   - Opposite intent (SELL_SIDE ↔ BUY_SIDE, FUNDRAISING ↔ BUY_SIDE)
   - ACTIVE status, excluding same user
4. Apply **Hard Rules** (rejection filter):
   - **HR-2**: Size ratio > 10× → reject (for BUY_SIDE: seller ask > 5× buyer budget)
   - **HR-3**: Structure incompatible (full sale ≠ minority stake)
   - **HR-4**: Sectors incompatible (uses `sectorMatrix.ts` adjacency)
   - **HR-5**: Candidate not ACTIVE
   - **HR-6**: Shell company detected in candidate text
   - **HR-7**: Claimed sector contradicted by description text
5. Compute **composite score**:
   - `0.65 × cosine_similarity + 0.35 × keyword_score + soft_bonuses`
   - Keyword score: sector (0.40) + geo (0.30) + structure (0.15) + quality tier (0.10) + size (0.05)
   - Soft bonuses: sector exact (0.15), geo exact (0.12), structure (0.08), size within 2× (0.10), quality tier 1 (0.05), recency <30d (0.03), special conditions overlap (0.04 each)
6. Apply advisor cap (max 2 matches per advisor phone/name)
7. Keep matches above `MIN_SURFACE_SCORE` (0.50)
8. Insert into `proposal_matches`

### Match Labels
- `High` → final_score > 0.78
- `Good` → > 0.62
- `Possible` → ≥ 0.50

---

## Data Quality (`src/lib/dataQuality.ts`)

- `fixEncoding(text)` — fixes mojibake (₹, —, etc.)
- `normalizeIntent(raw)` — maps strings to canonical `DealIntent`
- `normalizeSize(text)` → `{ min_cr, max_cr }` — handles:
  - Cr/crore, lakh, million USD, million INR, billion
  - Ranges ("50-100 Cr"), single values ("₹75 Cr")
- `computeQualityScore(proposal)` → 0–100 score
- `qualityTierFromScore(score)` → 1 | 2 | 3 | 4
- `isShellCompany(text)` — boolean shell detection
- `isSectorLegitimate(sector, text)` — cross-checks claimed sector vs description

---

## Matching API (`src/app/api/matches/[proposalID]/route.ts`)

GET endpoint called after closure. Returns:
- Top 3 scored matches from `proposal_matches`
- Hydrated with anonymized counterparty info (no names/contacts)
- `isConnected` flag if user already sent EOI/connected
- `revealedContact` if connection approved
- `tokensRequired: 50` to connect
- Falls back to `saved_searches` queue if no matches yet

---

## Token Economy
- Users start with 0 tokens
- Earn tokens via profile completion, deal submission
- Spend **50 tokens** to reveal a counterparty contact
- Transactions logged in `token_transactions` table
- Billing page at `/profile/billing`

---

## Auth Flow
- Google OAuth → NextAuth → user upserted into `users` table
- Phone OTP flow → `/api/auth/otp/verify` → sets `is_phone_verified=true`
- Profile stepper (`src/components/profile-setup/ProfileStepper.tsx`) → multi-step onboarding
- `profileCompletion` score tracked (0–100)

---

## Key Environment Variables
- `GROQ_API_KEY` — LLM inference (Groq)
- `OPENAI_API_KEY` — embeddings
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTAUTH_SECRET` + `NEXTAUTH_URL`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`

---

## Sector Keys (15 valid values)
`pharma` | `manufacturing` | `saas` | `finserv` | `consumer` | `realestate` | `logistics` | `education` | `chemicals` | `hospitality` | `renewable` | `defence` | `oil_gas` | `ngo` | `mixed`

Special sub-sectors: `shell_company`, `hospital`, `clinic`

---

## Intent Keys (5 valid values)
`SELL_SIDE` | `BUY_SIDE` | `FUNDRAISING` | `DEBT` | `STRATEGIC_PARTNERSHIP`

---

## Active Work Areas (from git status)
Files currently modified:
- `src/app/api/chat/route.ts` — main chat endpoint
- `src/app/api/matches/[proposalID]/route.ts` — matches fetching
- `src/components/ExtensionNoiseReducer.tsx` — browser extension noise filtering
- `src/components/MatchPanel.tsx` — match display UI
- `src/lib/dataQuality.ts` — data normalization
- `src/lib/promptRouter.ts` — AI prompt system
- `src/lib/scoringEngine.ts` — match scoring

Loose files (untracked): `fix_m4.js`, `fix_m4_2.js` — likely debugging scripts for M4 sector questions

---

## Important RC (Release Candidate) Fixes Applied
These are documented in `promptRouter.ts` header and must not be regressed:
- **RC1**: `is_intermediary` field — owner/advisor detection per turn
- **RC2**: Pre-detection of structure/size/revenue from rich teasers
- **RC3**: Friction detection → 3-layer force-closure guarantee
- **RC4**: Financial investor → BUY_SIDE (not FUNDRAISING)
- **RC6**: SELL_SIDE revenue + financial profile merged into one question
- **RC7**: Oil & Gas + NGO as dedicated sectors
- **RC8**: 4-turn server-side auto-close
- **RC9**: Shell company detection → M4_SHELL override
- **RC10**: Compact format when < 3 M3 fields missing
- **RC11**: Revenue mandatory before M4 on SELL_SIDE
- **RC12**: M4 mandatory enforcement (must appear in same message)
- **RC13**: Structure field validation (reject non-transaction strings)
- **RC14**: M4_DEFENCE sell questions fixed (were using renewable questions)
