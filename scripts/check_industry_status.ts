import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function verify() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL.');

    const tableStats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM proposals) as proposals_total,
        (SELECT COUNT(*) FROM proposals WHERE industry IS NOT NULL AND industry != '') as proposals_with_ind,
        (SELECT COUNT(*) FROM mandates) as mandates_total,
        (SELECT COUNT(*) FROM mandates WHERE industry IS NOT NULL AND industry != '') as mandates_with_ind,
        (SELECT COUNT(*) FROM deals) as deals_total,
        (SELECT COUNT(*) FROM deals WHERE industry IS NOT NULL AND industry != '') as deals_with_ind,
        (SELECT COUNT(*) FROM saved_searches) as searches_total,
        (SELECT COUNT(*) FROM saved_searches WHERE industry IS NOT NULL AND industry != '') as searches_with_ind
    `);
    console.log('Table Stats:', JSON.stringify(tableStats.rows[0], null, 2));

    const sampleDeals = await client.query(`
      SELECT id, title, industry, sector, created_at 
      FROM deals 
      WHERE industry IS NOT NULL 
      LIMIT 3;
    `);
    console.log('Sample Deals:', JSON.stringify(sampleDeals.rows, null, 2));

    const sampleMandates = await client.query(`
      SELECT id, intent, industry, sectors, created_at 
      FROM mandates 
      WHERE industry IS NOT NULL 
      LIMIT 3;
    `);
    console.log('Sample Mandates:', JSON.stringify(sampleMandates.rows, null, 2));

  } catch (err) {
    console.error('Error verifying database:', err);
  } finally {
    await client.end();
  }
}

verify();
