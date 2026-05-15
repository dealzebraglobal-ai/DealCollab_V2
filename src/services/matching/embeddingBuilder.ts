/**
 * DealCollab — Embedding Builder
 * =============================
 * Rule 9: Build enriched semantic narratives instead of keyword strings.
 */

import { ProposalInput } from '@/lib/matchmakingEngine';

export function buildSemanticNarrative(input: ProposalInput): string {
  const { 
    intent, sector, sub_sector, geography, deal_size, 
    structure, raw_text, industry_data 
  } = input;

  const intentText = intent === 'BUY_SIDE' ? 'Strategic buyer seeking acquisition opportunities' 
                   : intent === 'SELL_SIDE' ? 'Established business seeking exit or divestment'
                   : intent === 'INVESTMENT' ? 'Financial investor looking to deploy capital'
                   : intent === 'FUNDRAISING' ? 'Growth-stage business seeking capital infusion'
                   : 'Strategic mandate';

  const sectorText = sector ? `in the ${sector} ${sub_sector ? `(${sub_sector})` : ''} sector` : '';
  const geoText = geography ? `across ${geography}` : '';
  const sizeText = deal_size ? `with a deal size around ${deal_size}` : '';
  const structureText = structure ? `structured as a ${structure}` : '';

  // Extract core business context from raw_text or metadata
  const context = raw_text.substring(0, 300).trim();

  const narrative = `
    ${intentText} ${sectorText} ${geoText}. 
    ${sizeText}. ${structureText}.
    
    Business Context: ${context}
    
    Strategic Intent: ${input.intent_focus || 'N/A'}.
    Additional Parameters: ${JSON.stringify(industry_data || {})}
  `.trim().replace(/\s+/g, ' ');

  return narrative;
}
