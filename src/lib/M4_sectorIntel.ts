/**
 * DealCollab Prompt Router — M4: Sector Intelligence
 * ====================================================
 * Canonical source:
 *   Industry Framework §3 (sectors A–L) — primary source for all
 *   framework sectors, qualification areas, and buyer signals
 *   Deal Dictionary §3 (industry synonyms) — coverage expansion
 *   Domain knowledge — Agriculture, Textiles, BPO, Advertising,
 *   NGO (user-confirmed in scope, lightweight)
 *
 * SESSION FIXES APPLIED:
 *   RC7 — Oil & Gas added as dedicated sector (was falling into 'mixed')
 *     Refinery / storage terminal / downstream / petrochemical mandates
 *     had no home — they got M4_MIXED generic questions. Added 'oil_gas'
 *     as a proper SectorKey with buyer-specific qualification areas.
 *     Keywords in promptRouter.ts: refinery, oil & gas, petroleum,
 *     storage terminal, MMTPA, PNGRB, PESO, downstream, condensate etc.
 *
 * Scope — M4 exclusively owns:
 *   ✔ Sector-specific qualification areas (priority-ordered)
 *   ✔ Example questions per area (LLM picks 2–4 most relevant)
 *   ✔ Buyer relevance signals per sector
 *   ✔ Sub-sector variant notes where sectors overlap
 *
 *   ✘ Question format / grouping rules    → M2
 *   ✘ Core deal fields (Block 1)          → M3
 *   ✘ Phase rules                         → M2
 *   ✘ Matching layer                      → M5
 *
 * Load rule: CONDITIONAL — exactly ONE sub-module per request,
 *            selected by router when state.sector is detected.
 *
 * Sub-modules (19 total):
 *   Framework (12): MANUFACTURING · PHARMA · SAAS · FINSERV ·
 *                   CONSUMER · REALESTATE · LOGISTICS · EDUCATION ·
 *                   CHEMICALS · HOSPITALITY · RENEWABLE · DEFENCE
 *   Additional (4): AGRICULTURE · TEXTILES · BPO · ADVERTISING
 *   Session fix (1): OIL_GAS (new)
 *   Special   (2): NGO (lightweight) · MIXED (fallback)
 *
 * Token budget: ~120–145 tokens per sub-module.
 * Per-request cost: ONE sub-module only.
 */

// ─────────────────────────────────────────────────────────────
// A. MANUFACTURING / INDUSTRIAL
// Framework §3A | also covers Steel · Cement · Automation
// ─────────────────────────────────────────────────────────────
const M4_MANUFACTURING = `
## M4: MANUFACTURING / INDUSTRIAL
Covers: auto components · precision engineering · OEM · industrial mfg
Also covers: steel plants · TMT · cement · industrial automation · IIoT
Buyer: strategic acquirers seeking capacity, certifications, or customer access.

Priority qualification areas (pick 2–4 most relevant):
• Business orientation — OEM-led, export-driven, or domestic B2B?
• Facility — owned plant / contract manufacturing / leased? Key locations?
• Certifications — ISO, IATF 16949, CE, BIS, FDA? Which are active?
• Customer concentration — revenue from top 3 customers as % of total?

Sub-sector variants:
Steel / metals: capacity (TPD/MTPA), product (TMT/ferro alloy/structural), utilisation rate.
Cement: capacity (TPD), geography concentration, fuel source.
Automation / IIoT: proprietary technology or OEM distribution? Government / enterprise contracts?

Buyer signals: capacity expansion · certification moat · OEM relationships · export access · customer stickiness.
`.trim();

// ─────────────────────────────────────────────────────────────
// B. PHARMA / HEALTHCARE
// Framework §3B
// ─────────────────────────────────────────────────────────────
const M4_PHARMA = `
## M4: PHARMA / HEALTHCARE
Covers: formulations · API · CRAMS · diagnostics · hospitals · clinics · medical devices · digital health
Buyer: pharma conglomerates · PE · healthcare platforms seeking regulatory moat or capacity.

Priority qualification areas (pick 2–4 most relevant):
• Sub-sector — formulations / API / CRAMS / diagnostics / hospital / clinic / medtech?
• Regulatory — USFDA / MHRA / WHO-GMP / Health Canada approvals in place?
• Export — active regulated markets (US, EU, emerging)? % of revenue?
• Dependency — revenue from few key products or anchor institutional clients?

Buyer signals: regulatory approvals · export access · IP defensibility · compliance strength · manufacturing capacity.
`.trim();

// ─────────────────────────────────────────────────────────────
// C. SAAS / TECHNOLOGY
// Framework §3C | also covers Data Center · Digital Marketing
// ─────────────────────────────────────────────────────────────
const M4_SAAS = `
## M4: SAAS / TECHNOLOGY
Covers: B2B SaaS · IT services · enterprise software · AI platforms · cybersecurity · analytics
Also covers: digital marketing agencies · performance marketing firms · AdTech
Also covers: data centers (tier certification, hyperscaler relationships, MW capacity)
Buyer: tech acquirers · PE · strategic roll-ups seeking IP, recurring revenue, or customer base.

Priority qualification areas (pick 2–4 most relevant):
• Model — B2B SaaS / IT services / AI product / digital marketing agency / data center?
• Revenue — ARR / MRR / retainer profile? Recurring vs project-based split?
• Customers — enterprise or SME-driven? Churn rate? Top client concentration?
• IP / moat — proprietary technology, defensible platform, or client roster dependent?

Buyer signals: sticky recurring revenue · IP ownership · low churn · enterprise contracts · platform expansion potential.
`.trim();

// ─────────────────────────────────────────────────────────────
// D. FINANCIAL SERVICES / NBFC / FINTECH
// Framework §3D | also covers Fintech Payments
// ─────────────────────────────────────────────────────────────
const M4_FINSERV = `
## M4: FINANCIAL SERVICES / NBFC / FINTECH
Covers: NBFC · HFC · MFI · lending · wealth management · PMS · insurance · advisory
Also covers: fintech payments (PCI-DSS, merchant base, AD licence, payment gateway)
Buyer: banks · PE · financial conglomerates · strategic acquirers seeking licence or portfolio.

Priority qualification areas (pick 2–4 most relevant):
• Type — NBFC-ICC / HFC / MFI / lending / advisory / wealth / insurance / fintech payments?
• Licences — RBI / SEBI / IRDAI approvals active? Transferability confirmed?
• Portfolio — loan book / AUM size and current NPA / default rate?
• Sourcing — distribution-partnership-led or direct internal origination?

Fintech Payments variant: PCI-DSS compliance · merchant base size · AD licence status.

Buyer signals: licence value · regulatory defensibility · loan book quality · risk-adjusted growth · tech platform.
`.trim();

// ─────────────────────────────────────────────────────────────
// E. CONSUMER BRAND / RETAIL / D2C
// Framework §3E
// ─────────────────────────────────────────────────────────────
const M4_CONSUMER = `
## M4: CONSUMER BRAND / RETAIL / D2C
Covers: D2C brands · FMCG · retail chains · personal care · fashion · lifestyle · consumer products
Buyer: FMCG conglomerates · PE · strategic roll-ups seeking brand or distribution.

Priority qualification areas (pick 2–4 most relevant):
• Model — brand-led / distribution-led / private label / marketplace-native?
• Channel — D2C / offline retail / quick commerce / marketplace / omnichannel?
• SKU — hero product dependency or broad diversified SKU base?
• Reach — regional or national presence? Retail outlet count or platform GMV?

Buyer signals: brand defensibility · repeat purchase behaviour · gross margin quality · channel stability.
`.trim();

// ─────────────────────────────────────────────────────────────
// F. REAL ESTATE / INFRASTRUCTURE
// Framework §3F
// ─────────────────────────────────────────────────────────────
const M4_REALESTATE = `
## M4: REAL ESTATE / INFRASTRUCTURE
Covers: residential development · commercial · pre-leased assets · IT parks · EPC · civil infrastructure
Buyer: REITs · developers · family offices · infra funds · PE.

Priority qualification areas (pick 2–4 most relevant):
• Asset type — land / development rights / pre-leased completed asset / under-construction?
• Approvals — all regulatory approvals fully in place? Any pending clearances?
• Revenue — annuity income from completed tenanted assets or development-stage upside?
• Tenancy — tenant profile, lease tenure, and escalation terms (if pre-leased)?

Buyer signals: title clarity · approval status · annuity income stability · execution risk · tenant quality.
`.trim();

// ─────────────────────────────────────────────────────────────
// G. LOGISTICS / SUPPLY CHAIN
// Framework §3G
// ─────────────────────────────────────────────────────────────
const M4_LOGISTICS = `
## M4: LOGISTICS / SUPPLY CHAIN
Covers: warehousing · FTL / PTL · cold chain · freight forwarding · CHA / customs · last-mile
Buyer: logistics conglomerates · PE · 3PL platforms seeking network or infrastructure.

Priority qualification areas (pick 2–4 most relevant):
• Model — asset-light (3PL/broker) or owned infrastructure (fleet, warehouse, cold chain)?
• Revenue — long-term MSA contracts or transactional / spot-based revenue?
• Clients — enterprise client concentration? % revenue from top 3?
• Coverage — regional cluster or pan-India density? Key corridors?

Buyer signals: contract revenue quality · owned infrastructure · route network density · enterprise relationships.
`.trim();

// ─────────────────────────────────────────────────────────────
// H. EDUCATION / EDTECH
// Framework §3H
// ─────────────────────────────────────────────────────────────
const M4_EDUCATION = `
## M4: EDUCATION / EDTECH
Covers: K12 schools · higher education · coaching / test prep · edtech platforms · B2B skilling · vocational
Buyer: education groups · PE · edtech platforms seeking enrolment, content, or accreditation.

Priority qualification areas (pick 2–4 most relevant):
• Type — institution (school / college / university) / online platform / coaching / B2B skilling?
• Accreditation — CBSE, ICSE, university affiliation, or regulatory approval critical for ops?
• Enrolment — self-sustaining student acquisition or high marketing-spend dependent?
• Leadership — independent operational management or founder / promoter dependent?

Buyer signals: recurring enrolment · accreditation value · content IP · geographic rollout potential.
`.trim();

// ─────────────────────────────────────────────────────────────
// I. SPECIALTY CHEMICALS
// Framework §3I
// ─────────────────────────────────────────────────────────────
const M4_CHEMICALS = `
## M4: SPECIALTY CHEMICALS
Covers: specialty / fine chemicals · agrochemicals · dyes · pigments · polymers · construction chemicals
Buyer: chemical conglomerates · PE · strategic acquirers seeking formulation IP or export access.

Priority qualification areas (pick 2–4 most relevant):
• Type — commodity or specialty / niche formulations? Agro or non-agro?
• Export — domestic-focused or significant export share? Key geographies?
• Compliance — GPCB / MPCB / CTE / CFO in order? ETP operational?
• Customers — concentrated among few industrial buyers or diversified base?

Buyer signals: formulation defensibility · export market access · compliance moat · customer stickiness.
`.trim();

// ─────────────────────────────────────────────────────────────
// J. HOSPITALITY / FOOD SERVICE
// Framework §3J
// ─────────────────────────────────────────────────────────────
const M4_HOSPITALITY = `
## M4: HOSPITALITY / FOOD SERVICE
Covers: hotels · resorts · heritage properties · restaurants · QSR chains · food and beverage · nightclubs
Buyer: hospitality chains · PE · family offices seeking asset or brand.

Priority qualification areas (pick 2–4 most relevant):
• Model — owned asset / leased / managed / franchised operations?
• Performance — occupancy rate or average footfall over 2–3 years? ARR if hotel?
• Brand — independently owned brand or franchise-dependent?
• Concentration — revenue dependent on one location or multi-location?

Buyer signals: asset ownership · brand defensibility · location quality · margin stability · operational track record.
`.trim();

// ─────────────────────────────────────────────────────────────
// K. RENEWABLE ENERGY
// Framework §3K
// ─────────────────────────────────────────────────────────────
const M4_RENEWABLE = `
## M4: RENEWABLE ENERGY
Covers: solar IPP · wind IPP · EPC contractors · biofuel · ethanol (energy) · waste-to-energy
Buyer: energy companies · PE infra funds · strategic acquirers seeking operational yield or pipeline.

Priority qualification areas (pick 2–4 most relevant):
• Type — operating IPP / EPC contractor / development-stage project / hybrid?
• PPA — power purchase agreements in place? Counterparty (DISCOM / commercial) and tenure?
• Debt — leverage profile on assets? DSCR? Lender consent required for transfer?
• Value driver — stable operational yield or early-stage development upside?

Buyer signals: PPA quality and counterparty · debt coverage · IRR profile · regulatory approvals · grid connectivity.
`.trim();

// ─────────────────────────────────────────────────────────────
// L. DEFENCE / AEROSPACE
// Framework §3L
// ─────────────────────────────────────────────────────────────
const M4_DEFENCE = `
## M4: DEFENCE / AEROSPACE
Covers: defence manufacturing · aerospace · UAV systems · electromagnetic tech · dual-use technology
Buyer: defence OEMs · strategic acquirers · government-backed entities (PE rare in this sector).

Priority qualification areas (pick 2–4 most relevant):
• Approvals — DGQA / DRDL / DRDO approvals or offset credits active?
• Revenue — government-tender driven or OEM partnership / product-based?
• Technology — proprietary IP or capability moat? Export control / ITAR restrictions?
• Programme dependency — specific programme concentration or diversified order book?

Buyer signals: approvals and certifications · government relationships · technology moat · offset credit value · IP defensibility.
`.trim();

// ─────────────────────────────────────────────────────────────
// M. AGRICULTURE / FOOD PROCESSING
// Additional (standalone) — user confirmed
// ─────────────────────────────────────────────────────────────
const M4_AGRICULTURE = `
## M4: AGRICULTURE / FOOD PROCESSING
Covers: agro processing · dairy · flour milling · distillery / ethanol · packaged food · D2C food brands · agro commodities
Buyer: FMCG conglomerates · agribusiness groups · PE · food platforms — distinct from consumer brand; buyers differ by processing vs brand value.

Priority qualification areas (pick 2–4 most relevant):
• Type — agro processing / dairy / distillery / packaged food brand / commodity trading?
• Licences — FSSAI, state excise (distillery), pollution board compliance (ETP)?
• Nature — manufacturing / processing capacity or brand-led consumer revenue?
• Supply chain — captive raw material sourcing or open-market dependent?

Buyer signals: processing capacity · licence transferability · supply chain control · brand (if applicable) · regulatory compliance.
`.trim();

// ─────────────────────────────────────────────────────────────
// N. TEXTILES / GARMENTS
// Additional (standalone) — user confirmed
// ─────────────────────────────────────────────────────────────
const M4_TEXTILES = `
## M4: TEXTILES / GARMENTS
Covers: technical textiles · narrow woven / knitted fabrics · garments manufacturing · apparel · fabric trading · textile machinery
Buyer: textile conglomerates · export-focused acquirers · PE — value driven by export relationships and compliance.

Priority qualification areas (pick 2–4 most relevant):
• Type — technical textile / garments / fabric manufacturing / trading / machinery?
• Orientation — domestic B2B supply / export-led / branded retail?
• Compliance — Oeko-Tex, GOTS, buyer-specific audit compliance for export?
• Customers — OEM relationships with brands or distribution-led domestic sales?

Buyer signals: export relationships · buyer compliance certifications · manufacturing capacity · customer access · fabric specialisation.
`.trim();

// ─────────────────────────────────────────────────────────────
// O. BPO / SERVICES
// Additional (standalone) — user confirmed
// ─────────────────────────────────────────────────────────────
const M4_BPO = `
## M4: BPO / OUTSOURCED SERVICES
Covers: BPO · KPO · IT staffing and augmentation · facility management · HR outsourcing · manpower
Buyer: global outsourcing firms · PE · strategic acquirers — value driven by contracts and delivery capability, not tech IP.

Priority qualification areas (pick 2–4 most relevant):
• Type — BPO / KPO / IT staffing / facility management / HR outsourcing?
• Revenue — long-term MSA (Master Service Agreement) contracts or project / transactional?
• Clients — enterprise client concentration? % of revenue from top 3 clients?
• Workforce — headcount profile, attrition rate, delivery locations?

Buyer signals: long-term MSA contracts · enterprise client quality · headcount scale and stability · delivery capability · geographic coverage.
`.trim();

// ─────────────────────────────────────────────────────────────
// P. ADVERTISING / MEDIA
// Additional (standalone)
// ─────────────────────────────────────────────────────────────
const M4_ADVERTISING = `
## M4: ADVERTISING / MEDIA
Covers: media houses · advertising agencies · digital / performance marketing · DOOH · content companies · AdTech
Buyer: media conglomerates · PE · holding companies · strategic acquirers — value driven by audience, client roster, or platform.

Priority qualification areas (pick 2–4 most relevant):
• Type — media house / ad agency / performance marketing / DOOH / content / AdTech?
• Revenue — retainer-based / project-based / ad inventory / subscription / hybrid?
• Clients — enterprise advertisers under long-term retainer or SME project-dependent?
• Assets — proprietary content, platform, audience base, or AdTech / data moat?

Buyer signals: audience ownership · content or platform IP · enterprise client relationships · proprietary technology · inventory scale.
`.trim();

// ─────────────────────────────────────────────────────────────
// Q. NGO / SECTION 8 / TRUST
// Lightweight — intentionally minimal
// ─────────────────────────────────────────────────────────────
const M4_NGO = `
## M4: NGO / SECTION 8 / TRUST (lightweight)
Covers: Section 8 companies · NGOs · trusts · societies · cooperatives · farmer producer companies
Context: typically shell acquisitions for regulatory benefits (80G, 12A, FCRA) or impact-sector deals.
Qualification is intentionally lightweight — registration status and compliance cleanliness are the primary signals.

Priority qualification areas (ask 2–3 only):
• Registrations — 12A, 80G, FCRA, DARPAN active and transferable? Any provisional / expired?
• Activity — active operations with ongoing programmes, or primarily dormant / compliance entity?
• Liabilities — any statutory dues, pending regulatory notices, or RBI issues (if MFI)?

Buyer signals: registration transferability · compliance cleanliness · absence of legacy liabilities.
`.trim();

// ─────────────────────────────────────────────────────────────
// RC7 — OIL & GAS / DOWNSTREAM (new — session fix)
// Covers refinery, storage terminal, petrochemical, downstream processing.
// Previously these fell into 'mixed' with generic questions.
// Regulatory context: PNGRB governs pipeline/storage, PESO governs
// flammable/explosive storage, state PCBs for environmental clearance.
// ─────────────────────────────────────────────────────────────
const M4_OIL_GAS = `
## M4: OIL & GAS / DOWNSTREAM
Covers: refineries · storage terminals · topping units · condensate splitters · petrochemical units
Also covers: downstream oil processing · tank farms · fuel depots · gas processing plants
Buyer: oil majors · PE infra funds · strategic acquirers seeking operational assets or distressed opportunities.

Priority qualification areas (pick 2–4 most relevant):
• Asset type — refinery / storage terminal / topping unit / petrochemical unit / gas processing?
• Scale — capacity in MMTPA (refinery), KL (storage), or throughput (processing)?
• Regulatory — PNGRB licence, PESO approval, state PCB / environmental clearances in place and transferable?
• Debt / distress — operating clean asset, or NPA / promoter-exit situation requiring restructuring?

Buyer signals: PNGRB / PESO approvals · offtake / supply contracts · capacity utilisation · debt profile · lender consent.
`.trim();

// ─────────────────────────────────────────────────────────────
// R. MIXED / CROSS-SECTOR (fallback)
// ─────────────────────────────────────────────────────────────
const M4_MIXED = `
## M4: MIXED / CROSS-SECTOR (fallback)
Used when sector cannot be confidently identified or spans multiple sectors.
Ask these 3 universal questions to identify the primary sector lens for matching:

• "What is the core revenue driver — manufactured product, delivered service, or software platform?"
• "Is the business asset-heavy (plant, fleet, property) or asset-light (people, IP, contracts)?"
• "Is revenue primarily contract-based and recurring, or transactional and variable?"

Once answered, map to the most relevant primary sector and proceed with that sub-module's signals.
`.trim();

// ─────────────────────────────────────────────────────────────
// MODULE MAP — router selects by sector key
// ─────────────────────────────────────────────────────────────

export type SectorKey =
  | 'manufacturing' | 'pharma' | 'saas' | 'finserv'
  | 'consumer' | 'realestate' | 'logistics' | 'education'
  | 'chemicals' | 'hospitality' | 'renewable' | 'defence'
  | 'agriculture' | 'textiles' | 'bpo' | 'advertising'
  | 'ngo' | 'oil_gas' | 'mixed';       // oil_gas added RC7

export const M4_MODULES: Record<SectorKey, string> = {
  manufacturing: M4_MANUFACTURING,
  pharma: M4_PHARMA,
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
  agriculture: M4_AGRICULTURE,
  textiles: M4_TEXTILES,
  bpo: M4_BPO,
  advertising: M4_ADVERTISING,
  ngo: M4_NGO,
  oil_gas: M4_OIL_GAS,    // RC7
  mixed: M4_MIXED,
};

// ─────────────────────────────────────────────────────────────
// TOKEN DIAGNOSTICS
// ─────────────────────────────────────────────────────────────

export const M4_DIAGNOSTICS = {
  sub_modules: Object.fromEntries(
    Object.entries(M4_MODULES).map(([k, v]) => [k, Math.round(v.length / 4)])
  ),
  loadRule: 'ONE sub-module per request, selected by state.sector',
  perRequestCost: 'one sub-module only (~120–165 tokens)',
} as const;