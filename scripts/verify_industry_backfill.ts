import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const nullCount = await client.query(`SELECT COUNT(*) FROM public.proposals WHERE industry IS NULL;`);
  console.log('1. Remaining NULL proposals:', nullCount.rows[0].count);

  const dist = await client.query(`
    SELECT industry, COUNT(*) AS count FROM public.proposals
    GROUP BY industry ORDER BY count DESC LIMIT 30;
  `);
  console.log('\n2. Industry distribution (top 30):');
  dist.rows.forEach(r => console.log(`  ${r.count}\t${r.industry}`));

  const homeTextiles = await client.query(`
    SELECT id, industry FROM public.proposals WHERE industry ILIKE '%home%textile%';
  `);
  console.log('\n3. Home Textiles records:', homeTextiles.rows.length);
  homeTextiles.rows.forEach(r => console.log(`  ${r.id} -> ${r.industry}`));

  const totalProposals = await client.query(`SELECT COUNT(*) FROM public.proposals;`);
  console.log('\nTotal proposals:', totalProposals.rows[0].count);

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
