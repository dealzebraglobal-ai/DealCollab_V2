import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Updating match_proposals RPC...');

  // Drop existing match_proposals functions
  await client.query(`
    DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int);
    DROP FUNCTION IF EXISTS public.match_proposals(vector, text[], uuid, int, int, boolean);
  `);

  // Create updated match_proposals returning serving_sectors and buyer_type
  await client.query(`
    CREATE OR REPLACE FUNCTION public.match_proposals(
      query_embedding  vector(1536),
      match_intents    TEXT[],           -- Counterparty intents pre-flipped in TypeScript
      exclude_user_id  UUID,             -- Source user to exclude from results
      min_quality      INT DEFAULT 3,    -- Quality tier ceiling (1=Rich -> 3=Thin; 4=Stub excluded)
      result_count     INT DEFAULT 30    -- Max candidates to return before TypeScript hard rules
    )
    RETURNS TABLE (
      id                 UUID,
      user_id            UUID,
      intent             TEXT,
      industry           TEXT,
      sectors            TEXT[],
      serving_sectors    TEXT[],
      buyer_type         TEXT,
      geographies        TEXT[],
      deal_size_min_cr   NUMERIC,
      deal_size_max_cr   NUMERIC,
      revenue_min_cr     NUMERIC,
      revenue_max_cr     NUMERIC,
      deal_structure     TEXT,
      normalised_text    TEXT,
      raw_text           TEXT,
      fraud_flags        TEXT[],
      quality_tier       NUMERIC,
      is_shell           BOOLEAN,
      metadata           JSONB,
      created_at         TIMESTAMPTZ,
      similarity         FLOAT
    )
    LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN QUERY
      SELECT
        p.id,
        p.user_id,
        p.intent,
        COALESCE(
          p.industry,
          NULLIF(TRIM(p.metadata->>'industry'), ''),
          NULLIF(TRIM(p.metadata->>'original_industry'), ''),
          p.sectors[1]
        ) AS industry,
        p.sectors,
        COALESCE(p.serving_sectors, '{}'::TEXT[]) AS serving_sectors,
        COALESCE(p.buyer_type, p.metadata->>'buyer_type', NULL) AS buyer_type,
        p.geographies,
        p.deal_size_min_cr,
        p.deal_size_max_cr,
        p.revenue_min_cr,
        p.revenue_max_cr,
        p.deal_structure,
        p.normalised_text,
        p.raw_text,
        p.fraud_flags,
        p.quality_tier,
        COALESCE(p.is_shell, false) AS is_shell,
        -- Strip any confidential fields from metadata before returning to engine
        p.metadata - 'contact_email' - 'contact_phone' - 'advisor_name' - 'URL' - 'source_file' AS metadata,
        p.created_at,
        (1 - (p.embedding <=> query_embedding))::FLOAT AS similarity
      FROM public.proposals p
      WHERE
        p.status            = 'ACTIVE'
        AND p.embedding     IS NOT NULL
        AND p.embedding_status = 'DONE'
        AND p.quality_tier  <= min_quality
        AND (p.user_id IS NULL OR p.user_id != exclude_user_id)
        AND p.intent        = ANY(match_intents)
        AND (1 - (p.embedding <=> query_embedding)) > 0.10
      ORDER BY p.embedding <=> query_embedding
      LIMIT result_count;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.match_proposals TO authenticated;
    GRANT EXECUTE ON FUNCTION public.match_proposals TO anon;
    GRANT EXECUTE ON FUNCTION public.match_proposals TO service_role;
  `);

  console.log('✅ match_proposals RPC updated successfully!');

  // Verify parameters
  const rpcCols = await client.query(`
    SELECT parameter_name, data_type, parameter_mode
    FROM information_schema.parameters
    WHERE specific_name LIKE 'match_proposals%'
    ORDER BY ordinal_position;
  `);
  console.table(rpcCols.rows);

  await client.end();
}

main().catch(console.error);
