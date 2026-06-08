import type { SectorKey } from './types';

// ─────────────────────────────────────────────────────────────
// PHARMA — NM1: manufacturing/science side only. NM2: cognitive.
// ─────────────────────────────────────────────────────────────

const M4_PHARMA = `
## M4: PHARMA / PHARMACEUTICAL MANUFACTURING — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.
Covers: API · bulk drug · formulations · CRAMS · CDMO · pharma plant. NOT hospitals.

COGNITIVE INSTRUCTION:
Infer the sub-type from the user's description. Ask 2 targeted open-ended questions.
API/Bulk Drug → regulatory filings (USFDA/MHRA/WHO-GMP), molecule portfolio, plant approvals, DMF count
Formulations → market authorisations, export access (US/EU regulated markets), product mix, brand vs generic
CRAMS/CDMO → client relationships and concentration, capacity/technology capability, pipeline value

Value driver (if type unclear): "What is the core asset here — the regulatory approvals and product filings, the manufacturing capacity and plant certifications, or the client and contract relationships?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (API/formulations/CRAMS/CDMO) | regulatory_approvals (USFDA/MHRA/WHO-GMP status) | product_portfolio (molecules/dosage forms/brands) | manufacturing_capacity (plants/capacity) | contract_relationships (key clients if CRAMS/CDMO)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// HEALTHCARE — NM1: delivery/services side. NM2: cognitive.
// ─────────────────────────────────────────────────────────────

const M4_HEALTHCARE = `
## M4: HEALTHCARE (DELIVERY & SERVICES) — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.
Covers: hospitals · clinics · diagnostics · medical devices · digital health · healthtech.

STRICT SKIP RULE: If sub_sector or scale already in # FIELDS ALREADY PROVIDED, skip that bullet.

COGNITIVE INSTRUCTION:
Infer the sub-type from the user's description. Ask 2 targeted open-ended questions.
Hospital/Clinic → specialty mix, doctor concentration, NABH accreditation, bed count
Diagnostics Chain → collection centre count, NABL status, equipment quality, catchment area
Digital Health/Healthtech → user base, clinical partnerships, recurring revenue model

Value driver (if type unclear): "What drives the value here — the patient volumes and doctor network, the physical infrastructure and accreditations, or the brand and referral relationships?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (hospital/clinic/diagnostics/digital health) | accreditations (NABH/NABL status and tier) | scale_indicator (bed count/collection centres/monthly active users) | specialty_mix (key clinical specialties or primary service lines)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// MANUFACTURING — NM2: cognitive framework
// ─────────────────────────────────────────────────────────────

const M4_MANUFACTURING = `
## M4: MANUFACTURING / INDUSTRIAL — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

COGNITIVE INSTRUCTION:
Infer the sub-type from the user's description. Ask 2 targeted open-ended questions.
Consumer-facing brand (sells under brand name to end users) → brand equity, distribution, customer loyalty
B2B/Industrial/OEM (supplies to companies or factories) → capacity, certifications (ISO/IATF/BIS), client concentration
Process/Commodity (bulk production) → utilisation rate, input cost control, margins

Value driver (if type unclear): "What drives the value here — the brand and customer relationships, the manufacturing capability and certifications, or the long-term supply contracts?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (consumer brand/B2B OEM/process industry/auto component) | certifications (ISO/IATF/BIS/export compliance held) | capacity_utilisation (installed capacity and % utilisation) | client_concentration (top client revenue exposure and relationship tenure)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// SAAS / TECHNOLOGY / DIGITAL SERVICES — NM2: cognitive
// ─────────────────────────────────────────────────────────────

const M4_SAAS = `
## M4: TECHNOLOGY / SAAS / DIGITAL SERVICES — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.
If # GATEWAY_CLARIFIER was answered → use confirmed type. If sub_sector set, don't ask sub-type again.

SECTOR MAPPING REMINDER (critical for sub-type detection):
- "digital marketing", "performance marketing", "SEO agency", "PPC agency", "adtech", "advertising agency", "social media agency", "influencer marketing" → sub-type: Digital Marketing / Performance Marketing Agency
- "SaaS", "software product", "ARR", "MRR", "subscription", "platform" → sub-type: Software Product / SaaS
- "IT services", "managed services", "IT staffing", "IT delivery" → sub-type: IT Services
- "marketing agency", "creative agency", "brand agency" → sub-type: Digital Agency (Creative / Brand)

COGNITIVE INSTRUCTION:
Infer the sub-type from the user's description. Ask 2 targeted open-ended questions.

Software Product / SaaS → ARR/MRR quality, churn rate, IP ownership and competitive moat, enterprise vs SME customer mix, renewal concentration risk

IT Services / Delivery → client concentration and relationship depth, team depth and attrition rate, contract quality (T&M vs fixed-price), delivery capability and key-person dependency

Digital Marketing / Performance Marketing Agency (SEO / PPC / social / influencer / adtech) →
  BUY_SIDE: "What channel specialization matters most — search (SEO/SEM), paid social, programmatic, or influencer? And are you looking for an agency with enterprise retainer relationships or one serving SME clients on project work?"
  SELL_SIDE: "What is the revenue split between long-term retainers and project-based work? And which channels drive the majority of revenue — SEO, paid media, social, or creative/content?"
  Store answers in industry_data: { specialization, client_profile, retainer_pct, team_size, international_exposure }

Digital Agency (Creative / Brand / Content) → retainer vs project revenue split, key client tenure and concentration, creative team strength and leadership, domestic vs international client exposure

Value driver (if type unclear): "Is the value primarily in the technology and IP, the recurring client relationships, or the team and delivery capability?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (SaaS product/IT services/digital marketing agency/creative agency) | revenue_model (ARR/MRR/retainer/T&M/project) | client_profile (enterprise/SME/consumer mix, top client tenure) | churn_or_retention (GRR/NRR for SaaS, retainer % for agencies, attrition for IT services)
Digital Marketing specific: also store specialization (SEO/paid social/programmatic/influencer) | retainer_pct | team_size | international_exposure
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// FINSERV — NM2: cognitive framework
// ─────────────────────────────────────────────────────────────

const M4_FINSERV = `
## M4: FINANCIAL SERVICES / NBFC / FINTECH — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

COGNITIVE INSTRUCTION:
Infer the sub-type from the user's description. Ask 2 targeted open-ended questions.
Regulated Lending (NBFC/HFC with active book) → loan book quality, NPA levels, licence transferability
Licensed but No Loan Book (no operations yet) → licence status, regulatory cleanliness, activation timeline
Wealth/Investment → AUM, client relationships, SEBI registration
Fintech/Payments → technology platform, merchant base, licence status

Value driver (if type unclear): "What is the core value — the regulatory licence, the active client and loan portfolio, or the technology platform?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (NBFC/HFC/MFI/wealth management/fintech/payments) | core_value (licence/active portfolio/technology platform) | regulatory_status (RBI/SEBI category, licence validity, any PCA/RBI restrictions) | loan_book_or_aum (AUM or loan book size, NPA/GNPA%, CRAR if applicable)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// CONSUMER — stable question format
// ─────────────────────────────────────────────────────────────

const M4_CONSUMER = `
## M4: CONSUMER BRAND / RETAIL / D2C — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What sub-type are you looking for — FMCG brand, D2C, retail chain, or personal care?
\n• What channel matters — D2C, offline retail, quick commerce, or omnichannel?
\n• Are you looking for a hero-product brand or a broad SKU portfolio?
\n• What geographic reach matters — regional or national?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the brand sell, and how would you describe the business model?
\n• How does the business reach customers — what channels drive revenue?
\n• Is the business built around a few key products or a broad range?
\n• What is the geographic reach and distribution maturity?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (FMCG/D2C/retail chain/personal care/food brand) | channel_mix (D2C/offline/quick commerce/omnichannel split and maturity) | brand_strength (hero product vs portfolio, brand recognition, repeat purchase rate) | sku_portfolio (product range, key SKUs, number of active SKUs)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// REAL ESTATE — stable question format
// ─────────────────────────────────────────────────────────────

const M4_REALESTATE = `
## M4: REAL ESTATE / INFRASTRUCTURE — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type of asset — land, development project, or completed income-generating property?
\n• Is annuity income important, or are you open to development-stage risk?
\n• What approval status do you require — fully cleared only, or open to approval risk?
\n• Are there specific tenant profile or lease tenure requirements?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What is the nature of the asset — land, development project, or completed income property?
\n• Are all regulatory approvals in place?
\n• What does the revenue or income profile look like?
\n• If tenanted, who are the tenants and what are the lease terms?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
asset_type (land/development/completed income property/commercial/residential) | approval_status (all approvals in place / partial / pending) | income_profile (annual lease income, occupancy rate, WALE) | tenant_profile (key tenants, lease tenure, tenant credit quality)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// LOGISTICS — stable question format
// ─────────────────────────────────────────────────────────────

const M4_LOGISTICS = `
## M4: LOGISTICS / SUPPLY CHAIN — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — warehousing, fleet, cold chain, freight forwarding, or 3PL?
\n• Is owned infrastructure important, or is asset-light acceptable?
\n• Are long-term enterprise contracts a requirement?
\n• What geographic coverage matters — regional cluster or pan-India?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• Does the business own infrastructure or work asset-light?
\n• Is revenue built on long-term contracts or transactional volumes?
\n• Who are the key clients and how concentrated is revenue?
\n• What geographies and corridors does the business cover?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
infrastructure_type (warehousing/fleet/cold chain/3PL/freight forwarding/last mile) | contract_quality (long-term enterprise contracts vs spot/transactional revenue split) | client_concentration (top 3 client revenue share and relationship tenure) | geography_coverage (regional corridors/clusters, pan-India presence)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// EDUCATION — stable question format
// ─────────────────────────────────────────────────────────────

const M4_EDUCATION = `
## M4: EDUCATION / EDTECH — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — K12 school, higher education, edtech platform, or B2B skilling?
\n• Are specific accreditations (CBSE, university affiliation, NAAC) required?
\n• What enrolment scale or student base matters?
\n• Is operational independence from founders important?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What kind of education business is this, and who does it serve?
\n• What accreditations or approvals does it hold?
\n• How does the business attract and retain students?
\n• How dependent is the business on founders or key leadership?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
sub_type (K12/higher education/edtech/B2B skilling/test prep) | accreditations (CBSE/university affiliation/NAAC grade/regulatory approvals held) | enrolment_scale (student count, campus capacity, or monthly active users) | founder_dependency (high/medium/low — whether business runs independently)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// CHEMICALS — stable question format
// ─────────────────────────────────────────────────────────────

const M4_CHEMICALS = `
## M4: SPECIALTY CHEMICALS — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — specialty, agrochemical, fine chemicals, or polymers?
\n• Is export capability important for the target?
\n• What environmental compliance or approval status do you require?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What does the business produce — commodity or specialty / niche formulations?
\n• How much revenue comes from exports, and which markets?
\n• What is the environmental compliance status?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
product_type (specialty/agrochemical/fine chemicals/polymer/pigment/adhesive) | export_revenue_pct (export share of revenue and key export markets) | compliance_status (environmental clearances, PCB compliance, effluent treatment status)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// HOSPITALITY — stable question format
// ─────────────────────────────────────────────────────────────

const M4_HOSPITALITY = `
## M4: HOSPITALITY / FOOD / RESTAURANTS — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What type — hotel, resort, restaurant chain, or QSR?
\n• Is asset ownership important, or is leased/managed acceptable?
\n• What performance profile matters — stable occupancy, or open to a turnaround?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• Does the business own the asset, or operate under a lease or franchise?
\n• How has the business performed over the last 2–3 years?
\n• Is revenue concentrated in one location or spread across multiple?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
asset_ownership (owned/leased/managed/franchise) | performance_history (revenue trend, occupancy rate or covers, NOI over 2–3 years) | location_spread (single property/multi-property, city tier spread)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// RENEWABLE ENERGY — NM2: cognitive + EV charging sub-type
// ─────────────────────────────────────────────────────────────

const M4_RENEWABLE = `
## M4: RENEWABLE ENERGY — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.
If # GATEWAY_CLARIFIER was answered (epc_type) → use confirmed type for questions.

COGNITIVE INSTRUCTION:
Infer the sub-type from context first (# FIELDS ALREADY PROVIDED takes priority). Ask 2 targeted open-ended questions for that sub-type only.

SUB-TYPE DETECTION — apply in order:
1. EV Charging / Clean Mobility: if products_services or capabilities mention "EV charger", "AC charger", "DC fast charger", "charging station", "charging infrastructure", "clean mobility", "EV infrastructure" → sub_type = EV Charging Manufacturing / Infrastructure. Do NOT ask about PPA, DISCOM, or off-taker.
2. Operating IPP: "solar plant", "wind farm", "ppa", "discom", "mw asset", operational asset → ask PPA/off-taker questions.
3. EPC Contractor: "epc", "order book", "project execution" → ask order book/client questions.
4. Development Stage: "under development", "land acquisition", "grid connectivity" → ask approvals/land questions.

EV Charging (Manufacturing / Infrastructure) — ask BOTH of:
  SELL_SIDE / FUNDRAISING: "What is the revenue split between charger hardware sales and platform or service revenues — such as charging network subscriptions, SaaS, or maintenance contracts? And what is the current manufacturing capacity utilisation, and are there active OEM, fleet operator, or government supply contracts?"
  BUY_SIDE: "What is the revenue mix between hardware (charger unit sales) and software or service revenues you are looking for? And what OEM, fleet, or government partnership profile matters most?"

Operating IPP → PPA quality, off-taker profile, debt coverage, lender consent
EPC Contractor → order book size, execution track record, client relationships, margins
Development Stage → land status, grid connectivity, regulatory approvals, development risk

Value driver (if sub-type still unclear): "Is this an operational energy asset, a manufacturing or infrastructure business, a project under development, or a contracting business?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
asset_type (operating IPP/EPC contractor/development stage/hybrid/EV charging manufacturing) | operational_status (operational/under construction/development/commissioned) | capacity_mw (installed or contracted MW for energy assets; production capacity for EV charger manufacturing) | ppa_off_taker (PPA tenure and off-taker for IPP; OEM/fleet/government contracts for EV charging)
For EV charging also store: hardware_vs_software (hardware vs platform/SaaS revenue split) | partnerships (OEM/fleet/government contracts and concentration)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// DEFENCE — NM2: cognitive. RC14: sell questions fixed.
// ─────────────────────────────────────────────────────────────

const M4_DEFENCE = `
## M4: DEFENCE / AEROSPACE — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

COGNITIVE INSTRUCTION:
Infer the sub-type. Ask 2 targeted open-ended questions.
Approved Manufacturer → DGQA/DRDO approvals, order book diversification, government/OEM relationships, HAL/BEL/DRDO alignment
Technology/IP → proprietary capability (hardware/software/systems), dual-use potential, export restrictions, R&D investment
Services/Maintenance → programme relationships, revenue visibility, MRO contract tenure

Value driver (if type unclear): "What is the moat here — the regulatory approvals and certifications, the proprietary technology or R&D capability, or the long-term government and OEM relationships?"
Intent-aware: BUY_SIDE → what you need IN a target. SELL_SIDE → what your existing business has.

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
capabilities (what the company manufactures/builds/maintains) | certifications_approvals (DGQA/DRDO/DPP approvals held) | government_oem_exposure (key programmes, HAL/BEL/DRDO/MoD relationships) | technology_rd_focus (proprietary IP vs contract manufacturing vs MRO) | export_exposure (if any)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// OIL & GAS — RC7: dedicated sector
// ─────────────────────────────────────────────────────────────

const M4_OIL_GAS = `
## M4: OIL & GAS / DOWNSTREAM — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.

IF INTENT = BUY_SIDE or FUNDRAISING:
\n• What asset type — refinery, storage terminal, topping unit, petrochemical, or gas processing?
\n• What capacity scale matters — MMTPA for refineries, KL for storage?
\n• Are PNGRB licence, PESO approval, and environmental clearances important?
\n• Is a distressed/NPA situation acceptable, or only a stabilised operational asset?

IF INTENT = SELL_SIDE / DEBT / STRATEGIC_PARTNERSHIP:
\n• What type of asset — refinery, storage terminal, pipeline, or processing facility?
\n• What is the current operational status and utilisation rate?
\n• What regulatory licences does it hold, and are they transferable?
\n• What is the debt structure, and does lender consent factor into any transaction?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
asset_type (refinery/storage terminal/topping unit/petrochemical/gas processing/pipeline) | operational_status (operational/distressed/mothballed — include utilisation rate) | regulatory_licences (PNGRB/PESO/EC/other licences held and transferability status) | debt_structure (total debt, lender name if known, lender consent requirement)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// NGO / SECTION 8 — RC7: dedicated sector
// ─────────────────────────────────────────────────────────────

const M4_NGO = `
## M4: NGO / SECTION 8 / TRUST — Block 2
Add as SEPARATE bullets after Block 1 in the SAME message.
\n• What registrations — 12A, 80G, FCRA, DARPAN — are active and transferable?
\n• Is the entity operationally active, or primarily a compliance / dormant entity?
\n• Are there any statutory dues, pending regulatory notices, or RBI issues?

CANONICAL industry_data KEYS — store ALL answers under exactly these keys:
registrations (12A/80G/FCRA/DARPAN status and whether transferable on ownership change) | operational_status (active/dormant — describe primary activity if active) | compliance_issues (statutory dues, pending regulatory notices, MCA/RBI/FCRA issues)
Covered = do NOT ask again if already in # FIELDS ALREADY PROVIDED.
`.trim();

// ─────────────────────────────────────────────────────────────
// SHELL COMPANY — RC9: override module, exported separately
// ─────────────────────────────────────────────────────────────

export const M4_SHELL = `
## M4: SHELL COMPANY
Ask ALL of these:
\n• What is the legal structure — Section 8, Private Limited, LLP, or Public Limited?
\n• What licences, registrations, or approvals does the entity hold?
\n• What is the compliance status — ROC filings, IT returns, pending dues or litigation?
\n• What is the shareholding structure — promoter holding %, locked shares, pending transfers?
`.trim();

// ─────────────────────────────────────────────────────────────
// MIXED — fallback when sector cannot be identified
// ─────────────────────────────────────────────────────────────

const M4_MIXED = `
## M4: MIXED / CROSS-SECTOR — Block 2
\n• What is the core revenue driver — product, service, or platform?
\n• Is the business asset-heavy or asset-light?
\n• Is revenue primarily contract-based, repeat, or transactional?
`.trim();

// ─────────────────────────────────────────────────────────────
// MODULE MAP — router selects by state.sector
// ─────────────────────────────────────────────────────────────

export const M4_MODULES: Record<SectorKey, string> = {
  pharma: M4_PHARMA,
  healthcare: M4_HEALTHCARE,
  manufacturing: M4_MANUFACTURING,
  saas: M4_SAAS,
  finserv: M4_FINSERV,
  consumer: M4_CONSUMER,
  realestate: M4_REALESTATE,
  logistics: M4_LOGISTICS,
  education: M4_EDUCATION,
  chemicals: M4_CHEMICALS,
  hospitality: M4_HOSPITALITY,
  renewable: M4_RENEWABLE,
  defence: M4_DEFENCE,
  oil_gas: M4_OIL_GAS,
  ngo: M4_NGO,
  mixed: M4_MIXED,
};