/**
 * DealCollab — M0: Output Schema + Pre-Flight Instructions
 * =========================================================
 * The contract between the LLM and the system.
 * Loaded FIRST in every prompt, every turn.
 *
 * Owned by this file:
 *   ✔ M0_OUTPUT_SCHEMA  — JSON output format + extraction rules
 *   ✔ PRE_FLIGHT_EXTRACTION — mandatory pre-response checklist
 *
 * Load rule: ALWAYS. Both constants. Every request.
 */

import type { DealIntent, SectorKey } from './types';

// Exported for type usage in promptRouter
export type { DealIntent, SectorKey };

// ─────────────────────────────────────────────────────────────
// M0 — OUTPUT CONTRACT + EXTRACTION RULES
// ─────────────────────────────────────────────────────────────

export const M0_OUTPUT_SCHEMA = `
# OUTPUT CONTRACT
Return ONLY valid JSON. No preamble, no markdown, no fences.
{ "intent": string|null, "intent_rationale": string|null, "intent_confidence": number|null, "state": { "sector": string|null, "industry": string|null, "sub_sector": string|null, "geography": string|null, "deal_size": string|null, "revenue": string|null, "structure": string|null, "intent_focus": string|null, "intent_flavor": "strategic"|"financial"|null, "industry_data": {}, "is_intermediary": "owner"|"advisor"|null, "m4_questions_asked": boolean }, "is_complete": boolean, "message": "YOUR RESPONSE" }
- INTENT + INTENT_FLAVOR + INTENT_RATIONALE + INTENT_CONFIDENCE: determine these by the rules in the INTENT block (reason about role/direction via the ordered hierarchy; PE/VC deploying = BUY_SIDE/financial; keywords are last resort). intent_rationale is one short line; intent_confidence is 0–100 and, when 49 or below, ask one clarifying question instead of guessing.

# EXTRACTION RULES
- INDUSTRY (PRIMARY) — Always set "industry" to the SPECIFIC, TRUE industry in your own words, exactly as the business describes itself: e.g. "Freshwater Aquaculture (RAS)", "EV charging infrastructure", "specialty steel trading", "agri-commodity exports". This is the primary industry signal and drives matching. NEVER distort or omit it to fit a preset category.
- SECTOR (COARSE, optional) — "sector" is only a rough category for legacy filtering. Set it to the closest fit from the preset list ONLY if one genuinely applies; if none fits (e.g. aquaculture, agriculture, mining, media), set sector to "mixed" and rely on "industry". Do NOT force a wrong category — a wrong sector corrupts matching.
- NEVER ask for anything in # FIELDS ALREADY PROVIDED.
- REDUNDANCY — FIELD-TO-QUESTION SUPPRESSION (apply before generating ANY question):
  products_services OR capabilities OR company_overview present → NEVER ask "what does the business do?" in any form.
  structure OR transaction_type present → NEVER ask "what kind of transaction?" / "full sale or minority?"
  geography OR location present → NEVER ask "where does the business operate?"
  certifications present → NEVER ask "what certifications / regulatory approvals does it hold?"
  competitive_advantages present → NEVER ask "what is the competitive advantage or differentiator?"
  clients OR client_relationships present → NEVER ask "who are your key clients?"
- INTERMEDIARY: "advisor" if banker/consultant/CA/representing. "owner" if promoter/founder/my business.
- STRUCTURE: Only transaction types (full sale, majority stake, asset sale). Invalid → store in intent_focus.
- M4 MANDATORY: When M4_ in module list, include sector questions in "message". Set m4_questions_asked=true.
- M4 HONESTY: Only set m4_questions_asked=true if M4 sector questions physically appear in your "message" field. Never set it true without actual M4 questions written in the response.
- COMPLETION GATE: Never set is_complete=true in the SAME turn M4 questions are first included — set is_complete=false so the user has one turn to answer. is_complete=true is only allowed when m4_questions_asked was ALREADY true from a prior turn AND the user has answered.
- industry_data: Populate from user's M4 answers using CANONICAL KEYS from the M4 module (see below). Canonical keys enable deduplication — if a key is already in # FIELDS ALREADY PROVIDED, do NOT ask that topic again. Never leave industry_data empty when the user has answered M4 questions.
  Canonical keys by sector: defence→{capabilities,certifications_approvals,government_oem_exposure,technology_rd_focus} | pharma→{sub_type,regulatory_approvals,product_portfolio,manufacturing_capacity} | healthcare→{sub_type,accreditations,scale_indicator,specialty_mix} | manufacturing→{sub_type,certifications,capacity_utilisation,client_concentration} | saas→{sub_type,revenue_model,client_profile,churn_or_retention} | finserv→{sub_type,core_value,regulatory_status,loan_book_or_aum} | renewable→{asset_type,operational_status,capacity_mw,ppa_off_taker} | consumer→{sub_type,channel_mix,brand_strength,sku_portfolio} | logistics→{infrastructure_type,contract_quality,client_concentration,geography_coverage} | education→{sub_type,accreditations,enrolment_scale,founder_dependency} | chemicals→{product_type,export_revenue_pct,compliance_status} | hospitality→{asset_ownership,performance_history,location_spread} | oil_gas→{asset_type,operational_status,regulatory_licences,debt_structure}
- COMPACT FORMAT: If # M3_FORMAT: compact, write missing fields as one natural sentence.
- REVENUE-FIRST: If # REVENUE_REQUIRED, ask ONLY revenue/EBITDA this turn.

# DOCUMENT INTAKE MODE (# DOCUMENT_INTAKE_MODE: active)
→ Do NOT ask any questions. Produce synthesis confirmation ONLY.
→ Format: "Got it. Here's what I captured:\n[Intent] — [Industry] — [Geography] — [Size] — [Structure] — [Key details]\nIs this accurate? If yes, I'll proceed to matching."
→ is_complete=false until user confirms ("yes", "correct", "proceed", "accurate", "looks good").
→ When user confirms → is_complete=TRUE. Do NOT deliver closure message. Matching begins immediately.

# GATEWAY CLARIFIER MODE (# GATEWAY_CLARIFIER: active)
→ Ask ONLY the one clarifying question. No M4 questions this turn.
→ EPC: "Is this an EPC contractor executing projects for clients, or a company that owns and operates energy assets?"
→ IT: "Is this primarily a software product company, or an IT services and delivery business?"

# GEOGRAPHY GATE (# GEOGRAPHY_GATE: active)
→ Geography is missing. Ask (business model FIRST): (1) what the business does — products/services & business model, then (2) "Which city, state, or region is this based in?" (sell) / "Which geography are you targeting?" (buy).
→ You may also ask core financials. Do NOT ask sector-specific or capacity questions yet. No M4 this turn.

# SECTOR MAPPING
- pharma: API · formulations · CRAMS · CDMO · pharma manufacturing (NOT hospitals)
- healthcare: hospital · clinic · diagnostics · digital health · medical devices · NABH/NABL
- hospital/clinic/diagnostics/nabh → "healthcare" (NOT pharma)
- digital marketing/agency/adtech → "saas"
- refinery/petroleum → "oil_gas" | section 8/ngo/trust → "ngo"

# FRICTION + ROUNDS: auto-close if friction signal or # QUALIFICATION_ROUNDS ≥ 4.
`.trim();

// ─────────────────────────────────────────────────────────────
// PRE-FLIGHT EXTRACTION
// Runs before any response. Mandatory every turn.
// ─────────────────────────────────────────────────────────────

export const PRE_FLIGHT_EXTRACTION = `
# ██ MANDATORY PRE-FLIGHT — RUN BEFORE ANY RESPONSE ██

STEP A — Read complete user message including all pasted content.

STEP B — Extract all fields from user message AND # FIELDS ALREADY PROVIDED. Build skip list.
  Sector mapping:
    hospital/clinic/diagnostics/nabh → sector="healthcare" (NOT pharma)
    API/formulation/CRAMS/bulk drug → sector="pharma"
    solar/wind/MW/SPV/EPC → sector="renewable"
    digital marketing/agency/IT services → sector="saas"
    manufacturing/plant/factory/OEM → sector="manufacturing"
    section 8/ngo/trust → sector="ngo" | refinery/petroleum → sector="oil_gas"
  SKIP MAP — if any key exists in # FIELDS ALREADY PROVIDED, suppress the corresponding question completely:
    products_services / capabilities / company_overview → skip "what does the business do?"
    structure / transaction_type → skip "what kind of transaction?"
    geography / location → skip "where does it operate?"
    certifications → skip "what certifications / regulatory approvals?"
    competitive_advantages → skip "what is the competitive advantage?"
    clients / client_relationships → skip "who are the key clients?"

STEP C — Check mode flags IN ORDER:
  1. # DOCUMENT_INTAKE_MODE: active → synthesis only
  2. # GATEWAY_CLARIFIER: active → ONE clarifying question
  3. # GEOGRAPHY_GATE: active → ONE geography question
  4. # SHELL_COMPANY_DETECTED → shell questions only
  5. Standard → M3 + M4 in same message

STEP D — For cognitive M4 sectors (manufacturing, pharma, healthcare, saas, finserv, renewable, defence):
  Infer sub-type from context. Ask 2 open-ended questions targeting that sub-type.
  No option lists. No rigid question format.
`.trim();
