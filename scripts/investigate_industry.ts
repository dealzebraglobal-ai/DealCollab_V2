import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const cols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='proposals' ORDER BY ordinal_position;
  `);
  console.log('=== proposals columns ===');
  console.log(cols.rows.map(r => r.column_name).join(', '));

  const hasMandateId = cols.rows.some(r => r.column_name === 'mandate_id');
  console.log('has mandate_id:', hasMandateId);

  const tbl = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='raw_proposals_import';`);
  console.log('raw_proposals_import exists:', tbl.rows.length > 0);

  const mandIndustries = await client.query(`
    SELECT industry, COUNT(*) as count FROM mandates WHERE industry IS NOT NULL AND industry != ''
    GROUP BY industry ORDER BY count DESC LIMIT 40;
  `);
  console.log('\n=== mandates.industry distinct (top 40) ===');
  mandIndustries.rows.forEach(r => console.log(`${r.count}\t${r.industry}`));

  const nullTotal = await client.query(`SELECT COUNT(*) FROM proposals WHERE industry IS NULL;`);
  console.log('\nNULL proposals total:', nullTotal.rows[0].count);

  const withMandateLink = hasMandateId ? await client.query(`
    SELECT COUNT(*) FROM proposals p WHERE p.industry IS NULL AND p.mandate_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM mandates m WHERE m.id = p.mandate_id AND m.industry IS NOT NULL AND m.industry != '');
  `) : { rows: [{ count: 'n/a (no mandate_id col)' }] };
  console.log('NULL proposals with a linked mandate that HAS industry:', withMandateLink.rows[0].count);

  const withMetadataIndustry = await client.query(`
    SELECT COUNT(*) FROM proposals WHERE industry IS NULL AND metadata->>'industry' IS NOT NULL AND metadata->>'industry' != '';
  `);
  console.log('NULL proposals with metadata->industry populated:', withMetadataIndustry.rows[0].count);

  const withSectors = await client.query(`
    SELECT COUNT(*) FROM proposals WHERE industry IS NULL AND sectors IS NOT NULL AND array_length(sectors,1) > 0;
  `);
  console.log('NULL proposals with non-empty sectors[]:', withSectors.rows[0].count);

  const sample = await client.query(`
    SELECT id, intent, sectors, geographies, deal_structure, metadata, summary_text,
           ${hasMandateId ? 'mandate_id,' : ''} raw_text, normalised_text, created_at
    FROM proposals WHERE industry IS NULL ORDER BY created_at DESC LIMIT 15;
  `);
  console.log('\n=== sample NULL proposals ===');
  for (const r of sample.rows) {
    console.log('---');
    console.log('id:', r.id, '| intent:', r.intent, '| sectors:', r.sectors, '| geo:', r.geographies);
    console.log('metadata:', JSON.stringify(r.metadata)?.slice(0, 300));
    console.log('summary_text:', (r.summary_text || '').slice(0, 200));
    if (hasMandateId) console.log('mandate_id:', r.mandate_id);
    console.log('raw_text:', (r.raw_text || '').slice(0, 200));
  }

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
