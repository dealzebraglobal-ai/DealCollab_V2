import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
  const { data, error } = await supabase.from('proposals').select('id, intent, sector, industry, serving_sectors').order('created_at', { ascending: false }).limit(5);
  console.log('Latest proposals:', data);

  if (data && data.length >= 2) {
    const buySide = data.find(p => p.intent === 'BUY_SIDE');
    const sellSide = data.find(p => p.intent === 'SELL_SIDE');
    
    if (buySide && sellSide) {
      console.log('Buy Side:', buySide);
      console.log('Sell Side:', sellSide);
      
      const { data: matchesForBuy } = await supabase.from('proposal_matches').select('*').eq('proposal_id', buySide.id);
      console.log('Matches for Buy Side:', matchesForBuy);

      const { data: matchesForSell } = await supabase.from('proposal_matches').select('*').eq('proposal_id', sellSide.id);
      console.log('Matches for Sell Side:', matchesForSell);
    }
  }
}

test();
