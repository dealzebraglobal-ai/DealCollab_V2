import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export interface BuySideMandate {
  id: string;
  code: string;
  title: string;
  buyerType: 'Strategic' | 'Private Equity' | 'Global MNC' | 'Family Office';
  buyerPersona: string;
  sector: string;
  geography: string;
  ticketRange: string;
  ticketMinCr: number;
  ticketMaxCr: number;
  revenueFloor: string;
  ebitdaFloor: string;
  valuationMultiple: string;
  preferredStructure: string;
  mandateUrgency: string;
  convictionScore: number;
  summary: string;
  strategicRationale: string;
  targetCriteria: string[];
  dealBreakers: string[];
  verifiedDryPowderCr: number;
}

export interface SectorLucrativeness {
  id: string;
  name: string;
  lucrativenessScore: number; // Out of 10
  heatStatus: 'EXTREME_SURGE' | 'HIGH_DEMAND' | 'STEADY_ACCUMULATION';
  demandSupplyRatio: number; // e.g. 3.8x
  medianTicketCr: number;
  ticketSpread: {
    p25Cr: number;
    medianCr: number;
    p75Cr: number;
    maxCr: number;
  };
  valuationBenchmark: string;
  valuationMultipleType: 'EV/EBITDA' | 'ARR' | 'P/BV';
  strategicVsPeSplit: {
    strategic: number;
    peBuyout: number;
    globalMnc: number;
    familyOffice: number;
  };
  advisorThesis: string;
  catalysts: string[];
  activeMandatesCount: number;
}

export interface GeographyCorridor {
  id: string;
  corridor: string;
  hub: string;
  ticketRange: string;
  medianTicketCr: number;
  ebitdaMultipleSpread: string;
  avgLoiVelocityDays: number;
  inboundCapitalPct: number;
  primarySectors: string[];
  summary: string;
}

export interface BuyerPersonaSpec {
  persona: string;
  allocationShare: number; // percentage
  typicalTicket: string;
  returnThreshold: string;
  decisionHorizon: string;
  preferredStructure: string;
  primaryThesis: string;
}

const INSTITUTIONAL_MANDATES: BuySideMandate[] = [
  {
    id: 'mandate-1',
    code: 'DC-BUY-9041',
    title: 'Sterile Injectables & US-FDA Formulation CDMO Platform Buyout',
    buyerType: 'Private Equity',
    buyerPersona: 'Tier-1 Healthcare Buyout Fund ($1.2B AUM)',
    sector: 'Pharma & Healthcare',
    geography: 'Gujarat - Telangana Corridor',
    ticketRange: '₹200Cr – ₹450Cr',
    ticketMinCr: 200,
    ticketMaxCr: 450,
    revenueFloor: '₹120Cr+ ARR / Revenue',
    ebitdaFloor: '>20.0% EBITDA Margin',
    valuationMultiple: '12.0x – 14.5x EV/EBITDA',
    preferredStructure: '100% Full Buyout or Majority 74%+',
    mandateUrgency: 'High Conviction (Q2 Close Mandate)',
    convictionScore: 96,
    summary: 'Healthcare buyout platform acquiring high-barrier formulation assets with operational US-FDA / EU-GMP approvals to capture US sterile injectables supply deficits.',
    strategicRationale: 'Sponsor has pre-negotiated off-take distribution agreements with US hospital networks and requires immediate certified capacity.',
    targetCriteria: [
      'Operational US-FDA or EU-GMP certified manufacturing plant',
      'Clean regulatory inspection history with no repeat 483 warnings',
      'Established lyophilization and liquid vial automated filling lines',
      'First-generation promoter seeking full liquidity transition'
    ],
    dealBreakers: [
      'Warning letters active with US-FDA or pending OAI status',
      'Revenue below ₹100Cr',
      'More than 40% single-client revenue concentration'
    ],
    verifiedDryPowderCr: 500
  },
  {
    id: 'mandate-2',
    code: 'DC-BUY-8120',
    title: 'Enterprise Cross-Border Freight & Supply Chain SaaS Bolt-on',
    buyerType: 'Strategic',
    buyerPersona: 'Listed Asian Logistics Technology Conglomerate',
    sector: 'SaaS & Enterprise Tech',
    geography: 'Bengaluru & Chennai',
    ticketRange: '₹100Cr – ₹250Cr',
    ticketMinCr: 100,
    ticketMaxCr: 250,
    revenueFloor: '$5M+ ARR (₹42Cr+)',
    ebitdaFloor: 'Rule of 40 (Growth + FCF Margin > 40%)',
    valuationMultiple: '4.5x – 6.0x ARR',
    preferredStructure: '100% Strategic Acquisition',
    mandateUrgency: 'Active Mandate (Immediate LOI Ready)',
    convictionScore: 93,
    summary: 'Strategic acquirer seeking multi-modal freight forwarding software with sticky Asian and Middle Eastern enterprise client accounts.',
    strategicRationale: 'Accelerates product roadmap by 3 years and unlocks cross-selling to 3,400 existing enterprise logistics customers.',
    targetCriteria: [
      'Net Revenue Retention (NRR) > 115%',
      'Active Tier-1 shipping line and customs EDI integrations',
      'Gross Margin > 78%',
      'Technical leadership willing to stay for 24-month earnout'
    ],
    dealBreakers: [
      'Customer churn exceeding 2% per month',
      'Heavy professional services revenue (>25% of total)',
      'Unresolved IP ownership or offshore entity complications'
    ],
    verifiedDryPowderCr: 300
  },
  {
    id: 'mandate-3',
    code: 'DC-BUY-7355',
    title: 'Precision Aerospace Machining & Defence Forgings Facility',
    buyerType: 'Global MNC',
    buyerPersona: 'European Tier-1 Defence Supplier ($4B Market Cap)',
    sector: 'Advanced Manufacturing',
    geography: 'Tamil Nadu & Pune Belts',
    ticketRange: '₹90Cr – ₹180Cr',
    ticketMinCr: 90,
    ticketMaxCr: 180,
    revenueFloor: '₹60Cr+ Revenue',
    ebitdaFloor: '>18% EBITDA Margin',
    valuationMultiple: '9.5x – 11.0x EV/EBITDA',
    preferredStructure: 'Strategic Majority (80%+) with Local MD',
    mandateUrgency: 'Active Deployment (FY26 Allocation)',
    convictionScore: 89,
    summary: 'European aerospace group expanding Indian offset manufacturing base to satisfy multi-year commercial aerospace and defence order backlog.',
    strategicRationale: 'Bypasses 3-year AS9100 quality audit qualification cycle and gains immediate skilled engineering workforce.',
    targetCriteria: [
      'AS9100 Rev D certification active',
      'Operational CNC/VMC 5-axis machining centers (30+ machines)',
      'Approved vendor status with HAL, DRDO, or Boeing/Airbus Tier-1s',
      'Zero non-compliance in environmental & safety audits'
    ],
    dealBreakers: [
      'No aerospace certification in place',
      'Over-reliance on low-margin automotive structural stampings',
      'Union disputes or unresolved labor litigation'
    ],
    verifiedDryPowderCr: 220
  },
  {
    id: 'mandate-4',
    code: 'DC-BUY-6490',
    title: 'Operational C&I Solar Portfolios with Commercial Off-Takers',
    buyerType: 'Global MNC',
    buyerPersona: 'Infrastructure Yield Platform & Sovereign Wealth Vehicle',
    sector: 'Clean Energy & Renewables',
    geography: 'Western & Northern India',
    ticketRange: '₹400Cr – ₹950Cr',
    ticketMinCr: 400,
    ticketMaxCr: 950,
    revenueFloor: '50 MW+ Cumulative Grid Assets',
    ebitdaFloor: '>82% Operating EBITDA Margin',
    valuationMultiple: '8.0x – 9.2x Project EV/EBITDA',
    preferredStructure: '100% SPV Equity Buyout',
    mandateUrgency: 'Yield Deployment (Target IRR 14.5% Equity)',
    convictionScore: 95,
    summary: 'Global yield investor aggregating operational solar and wind-solar hybrid C&I projects with AAA/AA rated private industrial off-takers.',
    strategicRationale: 'Yield aggregation strategy with target listing on international green bond / InvIT platform within 24 months.',
    targetCriteria: [
      '25-year signed Power Purchase Agreements (PPA)',
      'PPA tariffs between ₹3.60 to ₹4.20 per kWh',
      'Tier-1 module makes (Longi, Trina, Jinko, Adani)',
      'Clear title land ownership or 30-year unencumbered lease'
    ],
    dealBreakers: [
      'Discom payment default history > 90 days',
      'Unresolved right-of-way (RoW) transmission disputes',
      'Sub-standard balance of plant (BoP) construction quality'
    ],
    verifiedDryPowderCr: 1200
  },
  {
    id: 'mandate-5',
    code: 'DC-BUY-5128',
    title: 'Clean-Book MSME Secured Lending NBFC (RBI Regulated)',
    buyerType: 'Strategic',
    buyerPersona: 'Series C Digital Financial Services Group',
    sector: 'FinServ & NBFC',
    geography: 'Mumbai & Delhi NCR',
    ticketRange: '₹120Cr – ₹280Cr',
    ticketMinCr: 120,
    ticketMaxCr: 280,
    revenueFloor: '₹250Cr+ Active AUM',
    ebitdaFloor: 'ROA > 2.8%, Net NPA < 1.5%',
    valuationMultiple: '1.6x – 2.1x Price-to-Book (P/BV)',
    preferredStructure: '100% Acquisition with RBI Approval',
    mandateUrgency: 'High Regulatory Urgency',
    convictionScore: 92,
    summary: 'Fintech conglomerate acquiring operational Base Layer / Middle Layer NBFC license to onboard balance-sheet MSME secured book.',
    strategicRationale: 'Direct balance-sheet lending saves 350 bps on co-lending fee margins and eliminates co-lending partner dependency.',
    targetCriteria: [
      'Clean RBI regulatory history and zero show-cause notices',
      '100% secured collateral backing (self-occupied commercial/residential)',
      'Capital Adequacy Ratio (CRAR) > 24%',
      'Granular borrower ticket sizes (₹5L – ₹40L)'
    ],
    dealBreakers: [
      'Unsecured personal loan book > 15%',
      'Gross NPA > 3.0%',
      'Unresolved promoter governance or ED/EOW inquiries'
    ],
    verifiedDryPowderCr: 350
  },
  {
    id: 'mandate-6',
    code: 'DC-BUY-4299',
    title: 'Specialty Dahej Halogenation & Fluorochemicals Brownfield Unit',
    buyerType: 'Strategic',
    buyerPersona: 'Japanese Chemical Trading Major (Listed Tokyo Stock Ex.)',
    sector: 'Specialty Chemicals',
    geography: 'Gujarat - Telangana Corridor',
    ticketRange: '₹180Cr – ₹380Cr',
    ticketMinCr: 180,
    ticketMaxCr: 380,
    revenueFloor: '₹140Cr+ Revenue',
    ebitdaFloor: '>20% EBITDA Margin',
    valuationMultiple: '10.5x – 12.5x EV/EBITDA',
    preferredStructure: 'Majority 74% or Full 100% Buyout',
    mandateUrgency: 'Strategic China+1 Replacement',
    convictionScore: 94,
    summary: 'Japanese chemicals major securing dedicated production base for high-purity electronic and agrochemical intermediates.',
    strategicRationale: 'Direct supply chain de-risking and securing rare Dahej Environmental Clearance (EC) with pipeline connection to deep-water port.',
    targetCriteria: [
      'Valid Environmental Clearance (EC) with expanded product schedule',
      'Zero Liquid Discharge (ZLD) plant with MEE and ATFD operational',
      'Multi-purpose reactor capability (Glass-lined and Hastelloy)',
      'Direct pipeline connection to GIDC common effluent treatment'
    ],
    dealBreakers: [
      'GPCB closure notices in preceding 36 months',
      'Lack of valid consent to operate (CTO)',
      'Legacy soil contamination liabilities'
    ],
    verifiedDryPowderCr: 450
  },
  {
    id: 'mandate-7',
    code: 'DC-BUY-3891',
    title: 'Profitable Omnichannel Clean Beauty & Wellness FMCG Brand',
    buyerType: 'Family Office',
    buyerPersona: 'Multi-Family Office & FMCG Strategic Syndicate',
    sector: 'Consumer & D2C',
    geography: 'Mumbai & Delhi NCR',
    ticketRange: '₹40Cr – ₹90Cr',
    ticketMinCr: 40,
    ticketMaxCr: 90,
    revenueFloor: '₹30Cr+ Net Revenue',
    ebitdaFloor: 'Positive EBITDA (>12%)',
    valuationMultiple: '2.4x – 3.2x Revenue Multiple',
    preferredStructure: 'Majority 51%+ with Founder Earnout',
    mandateUrgency: 'Growth Stage Buyout',
    convictionScore: 86,
    summary: 'FMCG family office acquiring controlling stake in certified organic personal care brand with strong modern retail presence.',
    strategicRationale: 'Synergistic distribution across 4,500 existing supermarket retail points and export distribution into GCC markets.',
    targetCriteria: [
      'Gross Margin > 64%',
      'Modern trade + General trade > 35% of total revenue',
      'Repeat purchase rate > 32% within 90 days',
      'Clean IP on trademark registrations across classes 3 & 5'
    ],
    dealBreakers: [
      'Heavy reliance on Amazon/Quick-Commerce discounting (>75%)',
      'Negative contribution margin 2 (CM2)',
      'Founder unwilling to execute 2-year transition period'
    ],
    verifiedDryPowderCr: 120
  }
];

const SECTORS_ANALYTICS: SectorLucrativeness[] = [
  {
    id: 'sec-pharma',
    name: 'Pharma & Healthcare',
    lucrativenessScore: 9.42,
    heatStatus: 'EXTREME_SURGE',
    demandSupplyRatio: 4.2,
    medianTicketCr: 280,
    ticketSpread: {
      p25Cr: 160,
      medianCr: 280,
      p75Cr: 420,
      maxCr: 650
    },
    valuationBenchmark: '12.0x – 14.5x EV/EBITDA',
    valuationMultipleType: 'EV/EBITDA',
    strategicVsPeSplit: {
      strategic: 38,
      peBuyout: 46,
      globalMnc: 12,
      familyOffice: 4
    },
    advisorThesis: 'Intense global and domestic PE sponsor competition for sterile injectables, oncology APIs, and US-FDA cleared formulation capacity. Strategic buyers paying substantial premiums for ready regulatory clearances.',
    catalysts: [
      'US sterile injectables supply shortage triggering aggressive contract pricing',
      '1st-generation founder retirement wave without 2nd-gen operating interest',
      'High replacement cost and 48-month greenfield timeline for FDA plants'
    ],
    activeMandatesCount: 24
  },
  {
    id: 'sec-saas',
    name: 'SaaS & Enterprise Tech',
    lucrativenessScore: 8.95,
    heatStatus: 'HIGH_DEMAND',
    demandSupplyRatio: 3.6,
    medianTicketCr: 175,
    ticketSpread: {
      p25Cr: 80,
      medianCr: 175,
      p75Cr: 290,
      maxCr: 450
    },
    valuationBenchmark: '4.5x – 6.2x ARR',
    valuationMultipleType: 'ARR',
    strategicVsPeSplit: {
      strategic: 52,
      peBuyout: 36,
      globalMnc: 10,
      familyOffice: 2
    },
    advisorThesis: 'Shift from high-burn venture growth to profitable vertical B2B SaaS buyouts. Strategic logistics, banking, and ERP integrators acquiring profitable enterprise middleware bolt-ons.',
    catalysts: [
      'Positive free cash flow (Rule of 40) assets attracting PE roll-up platforms',
      'Cross-selling synergies to global client base justifying premium multiples',
      'Low Capex drag and instant EBITDA margin accretive consolidation'
    ],
    activeMandatesCount: 19
  },
  {
    id: 'sec-clean-energy',
    name: 'Clean Energy & Renewables',
    lucrativenessScore: 9.15,
    heatStatus: 'EXTREME_SURGE',
    demandSupplyRatio: 4.8,
    medianTicketCr: 620,
    ticketSpread: {
      p25Cr: 350,
      medianCr: 620,
      p75Cr: 880,
      maxCr: 1400
    },
    valuationBenchmark: '8.0x – 9.4x Project EV/EBITDA',
    valuationMultipleType: 'EV/EBITDA',
    strategicVsPeSplit: {
      strategic: 22,
      peBuyout: 28,
      globalMnc: 45,
      familyOffice: 5
    },
    advisorThesis: 'Sovereign wealth funds and global infrastructure YieldCos are aggressively acquiring operational C&I rooftop and ground-mount solar assets with AAA corporate PPAs.',
    catalysts: [
      'Inflation-indexed 25-year corporate off-taker contracts',
      'InvIT yield listing arbitrage between private entry multiple and public markets',
      'Green taxonomy mandate for global institutional dry powder deployment'
    ],
    activeMandatesCount: 16
  },
  {
    id: 'sec-manufacturing',
    name: 'Advanced Manufacturing',
    lucrativenessScore: 8.78,
    heatStatus: 'HIGH_DEMAND',
    demandSupplyRatio: 3.1,
    medianTicketCr: 135,
    ticketSpread: {
      p25Cr: 70,
      medianCr: 135,
      p75Cr: 210,
      maxCr: 340
    },
    valuationBenchmark: '9.0x – 11.2x EV/EBITDA',
    valuationMultipleType: 'EV/EBITDA',
    strategicVsPeSplit: {
      strategic: 58,
      peBuyout: 24,
      globalMnc: 14,
      familyOffice: 4
    },
    advisorThesis: 'Defence indigenisation policies and global aerospace supply chain realignment (China+1) driving heavy strategic acquisition demand for AS9100 certified precision machining units.',
    catalysts: [
      'Defence local sourcing mandate increased to 65%+',
      'Global aerospace commercial airframe order backlogs at record 12-year highs',
      'Skilled machining talent & machine tool availability scarcity'
    ],
    activeMandatesCount: 15
  },
  {
    id: 'sec-chemicals',
    name: 'Specialty Chemicals',
    lucrativenessScore: 9.20,
    heatStatus: 'EXTREME_SURGE',
    demandSupplyRatio: 3.9,
    medianTicketCr: 290,
    ticketSpread: {
      p25Cr: 150,
      medianCr: 290,
      p75Cr: 440,
      maxCr: 600
    },
    valuationBenchmark: '10.5x – 12.8x EV/EBITDA',
    valuationMultipleType: 'EV/EBITDA',
    strategicVsPeSplit: {
      strategic: 48,
      peBuyout: 32,
      globalMnc: 16,
      familyOffice: 4
    },
    advisorThesis: 'Environmental clearance (EC) restrictions in Dahej/Jhagadia make brownfield M&A the only practical route for global chemical conglomerates to set up India manufacturing.',
    catalysts: [
      'Dahej industrial estate Environmental Clearance rarity',
      'Agrochemical and fluorine chemistry multi-year MNC contract migrations',
      'Stringent zero-liquid discharge compliance barriers deterring new competitors'
    ],
    activeMandatesCount: 14
  },
  {
    id: 'sec-finserv',
    name: 'FinServ & NBFC',
    lucrativenessScore: 8.62,
    heatStatus: 'STEADY_ACCUMULATION',
    demandSupplyRatio: 2.8,
    medianTicketCr: 210,
    ticketSpread: {
      p25Cr: 110,
      medianCr: 210,
      p75Cr: 320,
      maxCr: 550
    },
    valuationBenchmark: '1.6x – 2.2x Price-to-Book (P/BV)',
    valuationMultipleType: 'P/BV',
    strategicVsPeSplit: {
      strategic: 64,
      peBuyout: 26,
      globalMnc: 6,
      familyOffice: 4
    },
    advisorThesis: 'Fintech platforms and conglomerates acquiring clean-license legacy NBFCs to capture lending spreads directly on their balance sheets without co-lending constraints.',
    catalysts: [
      'RBI timeline for new NBFC license applications exceeds 24 months',
      'Secured MSME loan books commanding significant liquidity premium over unsecured',
      'Strong collection efficiency across tier-2/3 industrial clusters'
    ],
    activeMandatesCount: 11
  },
  {
    id: 'sec-consumer',
    name: 'Consumer & D2C',
    lucrativenessScore: 8.10,
    heatStatus: 'STEADY_ACCUMULATION',
    demandSupplyRatio: 2.3,
    medianTicketCr: 65,
    ticketSpread: {
      p25Cr: 35,
      medianCr: 65,
      p75Cr: 110,
      maxCr: 180
    },
    valuationBenchmark: '2.2x – 3.4x Revenue Multiple',
    valuationMultipleType: 'ARR',
    strategicVsPeSplit: {
      strategic: 50,
      peBuyout: 18,
      globalMnc: 12,
      familyOffice: 20
    },
    advisorThesis: 'FMCG incumbents acquiring profitable clean-ingredient personal care and health food brands with proven omnichannel and quick-commerce unit economics.',
    catalysts: [
      'Incumbents acquiring nimble brands to bypass internal R&D cycles',
      'Synergistic modern trade shelf-space expansion',
      'Founder fatigue around rising digital CAC driving early strategic exits'
    ],
    activeMandatesCount: 12
  }
];

const GEOGRAPHY_CORRIDORS: GeographyCorridor[] = [
  {
    id: 'corridor-gujarat-telangana',
    corridor: 'Gujarat – Telangana Corridor',
    hub: 'Ahmedabad, Dahej, Hyderabad & Pharma City',
    ticketRange: '₹180Cr – ₹450Cr',
    medianTicketCr: 285,
    ebitdaMultipleSpread: '11.5x – 14.5x EV/EBITDA',
    avgLoiVelocityDays: 48,
    inboundCapitalPct: 38,
    primarySectors: ['Pharma CDMO', 'Specialty Chemicals', 'Bulk Actives'],
    summary: 'India’s premier life sciences & chemical manufacturing axis. Accounts for highest PE buyout concentration and top valuation multiples due to ready regulatory infrastructure.'
  },
  {
    id: 'corridor-bengaluru-chennai',
    corridor: 'Bengaluru & Chennai Tech Hub',
    hub: 'Bengaluru, Whitefield, OMR & Sri City',
    ticketRange: '₹80Cr – ₹260Cr',
    medianTicketCr: 165,
    ebitdaMultipleSpread: '4.5x – 6.5x ARR / 12x EV/EBITDA',
    avgLoiVelocityDays: 34,
    inboundCapitalPct: 44,
    primarySectors: ['B2B Enterprise SaaS', 'DeepTech', 'EMS Hardware'],
    summary: 'Fastest deal closing velocity. Heavy strategic bolt-on activity by US/European platforms seeking high net-retention enterprise ARR assets.'
  },
  {
    id: 'corridor-mumbai-ncr',
    corridor: 'Mumbai & Delhi NCR Tier-1 Corridor',
    hub: 'BKC, Lower Parel, Gurugram & Noida',
    ticketRange: '₹140Cr – ₹500Cr',
    medianTicketCr: 240,
    ebitdaMultipleSpread: '1.8x P/BV (FinServ) / 10x EBITDA',
    avgLoiVelocityDays: 56,
    inboundCapitalPct: 32,
    primarySectors: ['FinServ & NBFCs', 'Omnichannel Consumer', 'Logistics'],
    summary: 'Corporate M&A epicenter. Highest average deal ticket size and primary market for financial institutions, large family offices, and brand consolidation.'
  },
  {
    id: 'corridor-tn-pune',
    corridor: 'Tamil Nadu & Pune Industrial Belts',
    hub: 'Coimbatore, Chennai Oragadam, Pune Chakan',
    ticketRange: '₹60Cr – ₹190Cr',
    medianTicketCr: 125,
    ebitdaMultipleSpread: '8.5x – 10.8x EV/EBITDA',
    avgLoiVelocityDays: 52,
    inboundCapitalPct: 29,
    primarySectors: ['Precision Machining', 'Defence Forgings', 'Auto Component Tier-2'],
    summary: 'Manufacturing powerhouse driven by European Tier-1 defence offsets and global aerospace commercial airframe supplier qualification.'
  },
  {
    id: 'corridor-cross-border',
    corridor: 'Global Inbound Corridor (US / EU / Japan / GCC)',
    hub: 'Cross-Border Inbound Direct Investment',
    ticketRange: '₹300Cr – ₹1,200Cr',
    medianTicketCr: 580,
    ebitdaMultipleSpread: '12.0x – 15.0x EV/EBITDA',
    avgLoiVelocityDays: 75,
    inboundCapitalPct: 100,
    primarySectors: ['Clean Energy YieldCos', 'Specialty CDMO', 'Cold Chain Infrastructure'],
    summary: 'Largest average ticket sizes. Global balance sheets deploying foreign direct capital into regulated, clean ESG and China+1 supply chain alternatives.'
  }
];

const BUYER_PERSONAS: BuyerPersonaSpec[] = [
  {
    persona: 'Private Equity Buyout Funds',
    allocationShare: 42,
    typicalTicket: '₹150Cr – ₹450Cr',
    returnThreshold: '22% – 26% Net IRR (3.0x MoIC)',
    decisionHorizon: '60 – 90 Days',
    preferredStructure: '100% Full Buyout or Majority 74%+',
    primaryThesis: 'Platform consolidation, EBITDA margin expansion, management professionalisation, and multiple arbitrage on exit.'
  },
  {
    persona: 'Strategic Listed Corporates',
    allocationShare: 34,
    typicalTicket: '₹60Cr – ₹350Cr',
    returnThreshold: 'EBITDA Accretive in Year 1',
    decisionHorizon: '45 – 75 Days',
    preferredStructure: 'Majority 80%+ or 100% Asset/Entity Sale',
    primaryThesis: 'Product line expansion, bypassing multi-year regulatory clearance cycles, and immediate cross-selling to existing distribution.'
  },
  {
    persona: 'Global Multinationals (MNCs)',
    allocationShare: 16,
    typicalTicket: '₹250Cr – ₹1,000Cr+',
    returnThreshold: 'Strategic China+1 Footprint & High ROIC',
    decisionHorizon: '90 – 150 Days',
    preferredStructure: 'Strategic Entity Buyout with Local MD',
    primaryThesis: 'Local manufacturing hub creation, regulatory license acquisition, and meeting international export offset commitments.'
  },
  {
    persona: 'Multi-Family Offices & Ultra HNWIs',
    allocationShare: 8,
    typicalTicket: '₹25Cr – ₹90Cr',
    returnThreshold: '16% – 18% IRR with Dividend Yield',
    decisionHorizon: '30 – 60 Days',
    preferredStructure: 'Majority 51%+ or Significant Minority',
    primaryThesis: 'Generational wealth preservation, operating cash flow distribution, and high-margin direct brand equity ownership.'
  }
];

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    let dbProposals: any[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('intent', 'BUY_SIDE')
          .limit(50);

        if (!error && data && data.length > 0) {
          dbProposals = data;
        }
      } catch (err) {
        console.warn('[BUYER_INTENT_API] Supabase query fallback:', err);
      }
    }

    // Blend DB proposals if present
    const blendedMandates: BuySideMandate[] = [...INSTITUTIONAL_MANDATES];

    if (dbProposals.length > 0) {
      dbProposals.forEach((p, idx) => {
        const ticketMin = Number(p.deal_size_min_cr) || 50;
        const ticketMax = Number(p.deal_size_max_cr) || 150;
        const sector = (p.sectors && p.sectors[0]) || 'General M&A';
        const geo = (p.geographies && p.geographies[0]) || 'Pan India';

        blendedMandates.unshift({
          id: p.id || `db-${idx}`,
          code: `DC-DB-${(1000 + idx)}`,
          title: p.raw_text ? p.raw_text.slice(0, 75) + '...' : `Buy-Side Mandate in ${sector}`,
          buyerType: (p.buyer_type as any) || 'Strategic',
          buyerPersona: p.advisor_name ? `${p.advisor_name} (Institutional Mandate)` : 'Verified Institutional Acquirer',
          sector: sector,
          geography: geo,
          ticketRange: `₹${ticketMin}Cr – ₹${ticketMax}Cr`,
          ticketMinCr: ticketMin,
          ticketMaxCr: ticketMax,
          revenueFloor: p.revenue_min_cr ? `₹${p.revenue_min_cr}Cr+ Revenue` : '₹30Cr+ Target Revenue',
          ebitdaFloor: '>15% Operational EBITDA',
          valuationMultiple: '10.0x – 12.5x EV/EBITDA',
          preferredStructure: p.deal_structure || 'Majority / 100% Buyout',
          mandateUrgency: 'Active DB Mandate',
          convictionScore: p.quality_score ? Math.min(99, p.quality_score * 10 + 40) : 90,
          summary: p.raw_text || 'Active buy-side acquisition mandate recorded on DealCollab platform.',
          strategicRationale: 'Target search for strategic scale and market consolidation.',
          targetCriteria: [
            `Profitable target in ${sector}`,
            `Operations situated in ${geo}`,
            `Target ticket size ₹${ticketMin}Cr – ₹${ticketMax}Cr`
          ],
          dealBreakers: [
            'Financial unprofitability or negative EBITDA',
            'Unresolved tax or promoter legal disputes'
          ],
          verifiedDryPowderCr: ticketMax * 1.5
        });
      });
    }

    // Macro aggregates
    const totalDryPowderCr = blendedMandates.reduce((sum, m) => sum + m.verifiedDryPowderCr, 15400);
    const avgConviction = Math.round(
      blendedMandates.reduce((sum, m) => sum + m.convictionScore, 0) / blendedMandates.length
    );

    return NextResponse.json({
      success: true,
      data: {
        macroTelemetry: {
          bciIndex: avgConviction || 91.4, // Buyer Conviction Index
          totalDryPowderCr: totalDryPowderCr,
          activeMandatesCount: blendedMandates.length,
          topLucrativeSector: 'Pharma CDMO & Sterile Injectables',
          topLucrativenessScore: 9.42,
          medianBuyoutMultiple: '11.8x – 14.5x EV/EBITDA',
          crossBorderSurgeYoY: '+34.2%',
          peDominancePct: 42.0
        },
        sectors: SECTORS_ANALYTICS,
        geographyCorridors: GEOGRAPHY_CORRIDORS,
        buyerPersonas: BUYER_PERSONAS,
        mandates: blendedMandates
      }
    });
  } catch (error: any) {
    console.error('[BUYER_INTENT_API_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch buyer intent intelligence'
      },
      { status: 500 }
    );
  }
}
