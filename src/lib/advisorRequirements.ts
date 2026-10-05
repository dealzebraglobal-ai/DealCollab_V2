import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { normalizeSize } from './dataQuality';
import { AdvisorRequirementItem } from './validation/profile';

export interface AdvisorRequirementDBRow {
  id: string;
  user_id: string;
  slot_index: number;
  intent: string;
  sectors: string[];
  niche: string;
  cities: string[];
  revenue_raw: string | null;
  revenue_min_cr: number | null;
  revenue_max_cr: number | null;
  details: string | null;
  business_models: string[];
  deal_structures: string[];
  embedding_status: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface FallbackRequirementMatch {
  id: string;
  userId: string;
  slotIndex: number;
  intent: string;
  sectors: string[];
  niche: string;
  cities: string[];
  revenueRaw: string | null;
  revenueMinCr: number | null;
  revenueMaxCr: number | null;
  details: string | null;
  businessModels: string[];
  dealStructures: string[];
  advisorName: string | null;
  advisorFirm: string | null;
  advisorCity: string | null;
  advisorRole: string | null;
  similarity: number;
}

/**
 * Fetch active requirements for an advisor
 */
export async function fetchAdvisorRequirements(userId: string): Promise<AdvisorRequirementItem[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('advisor_requirements')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('slot_index', { ascending: true });

  if (error || !data) {
    console.error('[ADVISOR_REQ] Fetch error:', error);
    return [];
  }

  return (data as AdvisorRequirementDBRow[]).map(r => ({
    id: r.id,
    slotIndex: r.slot_index,
    sectors: r.sectors || [],
    niche: r.niche || '',
    cities: r.cities || [],
    revenue: r.revenue_raw || '',
    details: r.details || '',
    businessModels: r.business_models || [],
    dealStructures: r.deal_structures || [],
  }));
}

/**
 * Sync (upsert and delete cleared) requirement cards for an advisor
 */
export async function syncAdvisorRequirements(
  userId: string,
  incoming: AdvisorRequirementItem[] = []
): Promise<void> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return;

  // Filter valid filled slots
  const validCards = incoming.filter(c => 
    c.sectors && c.sectors.length > 0 && 
    c.niche && c.niche.trim().length > 0
  );

  const activeSlotIndexes = validCards.map((c, idx) => c.slotIndex || (idx + 1));

  // 1. Delete slots not in activeSlotIndexes
  if (activeSlotIndexes.length > 0) {
    await supabase
      .from('advisor_requirements')
      .delete()
      .eq('user_id', userId)
      .not('slot_index', 'in', `(${activeSlotIndexes.join(',')})`);
  } else {
    // If all were cleared, delete all for this user
    await supabase
      .from('advisor_requirements')
      .delete()
      .eq('user_id', userId);
  }

  // 2. Upsert valid slots
  const savedRows: Array<{ id: string; slot_index: number; payload: Record<string, unknown> }> = [];

  for (let i = 0; i < validCards.length; i++) {
    const card = validCards[i];
    const slot = card.slotIndex || (i + 1);
    const sizeNorm = card.revenue ? normalizeSize(card.revenue) : null;

    const rowPayload = {
      user_id: userId,
      slot_index: slot,
      intent: 'BUY_SIDE',
      sectors: card.sectors || [],
      niche: card.niche.trim(),
      cities: card.cities || [],
      revenue_raw: card.revenue ? card.revenue.trim() : null,
      revenue_min_cr: sizeNorm?.min_cr ?? null,
      revenue_max_cr: sizeNorm?.max_cr ?? null,
      details: card.details ? card.details.trim() : null,
      business_models: card.businessModels || [],
      deal_structures: card.dealStructures || [],
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('advisor_requirements')
      .upsert(rowPayload, { onConflict: 'user_id,slot_index' })
      .select('id, slot_index')
      .single();

    if (!error && data) {
      savedRows.push({ id: data.id, slot_index: data.slot_index, payload: rowPayload });
    } else if (error) {
      console.error('[ADVISOR_REQ] Upsert slot error:', slot, error);
    }
  }

  // 3. Trigger asynchronous background embedding generation (non-blocking)
  if (savedRows.length > 0) {
    Promise.allSettled(
      savedRows.map(row => generateSingleRequirementEmbedding(row.id, row.payload))
    ).catch(err => console.error('[ADVISOR_REQ] Background embedding error:', err));
  }
}

/**
 * Generate OpenAI vector embedding for an advisor requirement slot
 */
async function generateSingleRequirementEmbedding(
  requirementId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[ADVISOR_REQ] OPENAI_API_KEY not configured, skipping embedding generation.');
    return;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return;

  const sectors = (payload.sectors as string[]) || [];
  const niche = (payload.niche as string) || '';
  const cities = (payload.cities as string[]) || [];
  const revenue = (payload.revenue_raw as string) || '';
  const details = (payload.details as string) || '';
  const models = (payload.business_models as string[]) || [];
  const structs = (payload.deal_structures as string[]) || [];

  const canonicalText = [
    `Buy-side mandate target requirement.`,
    sectors.length ? `Sectors: ${sectors.join(', ')}.` : '',
    niche ? `Niche focus: ${niche}.` : '',
    cities.length ? `Target geography / regions: ${cities.join(', ')}.` : '',
    revenue ? `Target revenue: ${revenue}.` : '',
    details ? `Must have / criteria: ${details}.` : '',
    models.length ? `Business models: ${models.join(', ')}.` : '',
    structs.length ? `Deal structure: ${structs.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: canonicalText,
    });

    const vector = response.data[0]?.embedding;
    if (!vector || !vector.length) throw new Error('Empty embedding vector returned');

    // Store vector using RPC helper
    const { error: rpcErr } = await supabase.rpc('update_advisor_requirement_embedding', {
      requirement_id: requirementId,
      embedding_vector: JSON.stringify(vector),
    });

    if (rpcErr) {
      console.error('[ADVISOR_REQ] Failed to update embedding via RPC:', rpcErr.message);
    } else {
      console.log(`[ADVISOR_REQ] Embedding stored for requirement ${requirementId}`);
    }
  } catch (err: unknown) {
    console.error(`[ADVISOR_REQ] Embedding generation failed for ${requirementId}:`, err);
    await supabase
      .from('advisor_requirements')
      .update({ embedding_status: 'FAILED' })
      .eq('id', requirementId);
  }
}

export interface KeywordMatchInput {
  queryText?: string | null;
  sector?: string | null;
  industry?: string | null;
  subSector?: string | null;
  niche?: string | null;
  excludeUserId?: string | null;
  limit?: number;
}

function isTokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3) {
    if (a.includes(b) || b.includes(a)) return true;
    if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
    if (Math.abs(a.length - b.length) <= 1 && a.length >= 5 && b.length >= 5) {
      let diff = 0;
      let i = 0, j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] !== b[j]) {
          diff++;
          if (diff > 1) return false;
          if (a.length > b.length) i++;
          else if (b.length > a.length) j++;
          else { i++; j++; }
        } else {
          i++; j++;
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Simple keyword-based matcher for standing advisor requirements.
 * Matches target sector and niche against incoming deal/mandate query keywords.
 */
export async function searchAdvisorRequirementsByKeywords(
  input: KeywordMatchInput
): Promise<FallbackRequirementMatch[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('advisor_requirements')
    .select(`
      id, user_id, slot_index, intent, sectors, niche, cities,
      revenue_raw, revenue_min_cr, revenue_max_cr, details,
      business_models, deal_structures, status
    `)
    .eq('status', 'ACTIVE');

  if (input.excludeUserId) {
    query = query.neq('user_id', input.excludeUserId);
  }

  const { data: rows, error } = await query;
  if (error || !rows || rows.length === 0) {
    return [];
  }

  // Extract keywords from input
  const rawTerms = [
    input.sector,
    input.industry,
    input.subSector,
    input.niche,
    input.queryText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const stopWords = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'with', 'by',
    'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'looking', 'look', 'want', 'wanted', 'need', 'needs',
    'seeking', 'seek', 'buy', 'sell', 'mandate', 'deal', 'deals', 'require',
    'requirement', 'requirements', 'crore', 'cr', 'inr', 'usd', 'near', 'around'
  ]);

  const normalize = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const cleanedInput = normalize(rawTerms);
  const inputTokens = cleanedInput
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stopWords.has(t));

  if (inputTokens.length === 0 && !cleanedInput) {
    return [];
  }

  // Fetch advisor user details for all matched users
  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const { data: advisors } = await supabase
    .from('users')
    .select('id, name, firm_name, base_city, role')
    .in('id', userIds);

  const advisorMap = new Map<string, { name: string | null; firm_name: string | null; base_city: string | null; role: string | null }>();
  (advisors || []).forEach(a => advisorMap.set(a.id, a));

  const scoredMatches: FallbackRequirementMatch[] = [];

  for (const row of rows) {
    const rowSectors = Array.isArray(row.sectors) ? row.sectors : [];
    const rowNiche = row.niche || '';
    const rowDetails = row.details || '';

    const rowText = `${rowSectors.join(' ')} ${rowNiche} ${rowDetails}`;
    const cleanedRowText = normalize(rowText);
    const cleanedRowSectors = rowSectors.map(s => normalize(s));
    const cleanedRowNiche = normalize(rowNiche);

    let matchScore = 0;

    // 1. Check exact phrase matches in sector or niche
    for (const sec of cleanedRowSectors) {
      if (sec.length >= 3 && (cleanedInput.includes(sec) || sec.includes(cleanedInput))) {
        matchScore = Math.max(matchScore, 90);
      }
    }

    if (cleanedRowNiche.length >= 3) {
      if (cleanedInput.includes(cleanedRowNiche) || cleanedRowNiche.includes(cleanedInput)) {
        matchScore = Math.max(matchScore, 92);
      }
    }

    // 2. Check token / keyword overlaps
    const rowTokens = cleanedRowText
      .split(' ')
      .map(t => t.trim())
      .filter(t => t.length >= 2 && !stopWords.has(t));

    const matchedTokens = inputTokens.filter(t =>
      rowTokens.some(rt => isTokenMatch(t, rt))
    );

    if (matchedTokens.length > 0) {
      const overlapRatio = matchedTokens.length / Math.min(inputTokens.length, 3);
      const tokenScore = 75 + Math.round(overlapRatio * 15);
      if (tokenScore > matchScore) {
        matchScore = tokenScore;
      }
    }

    if (matchScore >= 70) {
      const adv = advisorMap.get(row.user_id);
      scoredMatches.push({
        id: row.id,
        userId: row.user_id,
        slotIndex: row.slot_index,
        intent: row.intent || 'BUY_SIDE',
        sectors: rowSectors,
        niche: rowNiche,
        cities: Array.isArray(row.cities) ? row.cities : [],
        revenueRaw: row.revenue_raw,
        revenueMinCr: row.revenue_min_cr,
        revenueMaxCr: row.revenue_max_cr,
        details: row.details,
        businessModels: Array.isArray(row.business_models) ? row.business_models : [],
        dealStructures: Array.isArray(row.deal_structures) ? row.deal_structures : [],
        advisorName: adv?.name || null,
        advisorFirm: adv?.firm_name || null,
        advisorCity: adv?.base_city || null,
        advisorRole: adv?.role || null,
        similarity: matchScore / 100,
      });
    }
  }

  scoredMatches.sort((a, b) => b.similarity - a.similarity);
  return scoredMatches.slice(0, input.limit || 6);
}

/**
 * Query fallback advisor requirements for a zero-match sell-side deal
 */
export async function searchAdvisorRequirementsFallback(
  queryEmbedding: number[],
  excludeUserId: string,
  limit = 6
): Promise<FallbackRequirementMatch[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('match_advisor_requirements', {
    query_embedding: queryEmbedding,
    exclude_user_id: excludeUserId,
    result_count: limit,
  });

  if (error || !data) {
    console.warn('[ADVISOR_REQ] Fallback search RPC error:', error?.message);
    return [];
  }

  return (data as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    userId: r.user_id as string,
    slotIndex: r.slot_index as number,
    intent: (r.intent as string) || 'BUY_SIDE',
    sectors: (r.sectors as string[]) || [],
    niche: (r.niche as string) || '',
    cities: (r.cities as string[]) || [],
    revenueRaw: (r.revenue_raw as string) || null,
    revenueMinCr: r.revenue_min_cr as number | null,
    revenueMaxCr: r.revenue_max_cr as number | null,
    details: (r.details as string) || null,
    businessModels: (r.business_models as string[]) || [],
    dealStructures: (r.deal_structures as string[]) || [],
    advisorName: (r.advisor_name as string) || null,
    advisorFirm: (r.advisor_firm as string) || null,
    advisorCity: (r.advisor_city as string) || null,
    advisorRole: (r.advisor_role as string) || null,
    similarity: (r.similarity as number) || 0,
  }));
}
