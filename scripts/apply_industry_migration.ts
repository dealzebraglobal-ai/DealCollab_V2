import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
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
    console.log('Connected to PostgreSQL database...');

    const migrationSql = fs.readFileSync(
      path.join(process.cwd(), 'supabase', 'migrations', '20260920_industry_structural_fix.sql'),
      'utf8'
    );

    console.log('Executing migration 20260920_industry_structural_fix.sql...');
    await client.query(migrationSql);
    console.log('✔ Migration executed successfully!');

    // Verify proposals column
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'proposals' AND column_name = 'industry';
    `);
    console.log('Industry column verification:', res.rows);

    // Check count of populated industries
    const countRes = await client.query(`
      SELECT count(*) as total, count(industry) as has_industry FROM proposals;
    `);
    console.log('Industry backfill verification:', countRes.rows[0]);

  } catch (err) {
    console.error('Migration execution failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
