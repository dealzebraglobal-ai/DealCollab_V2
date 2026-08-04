import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
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
    console.log('Connected to database...');

    console.log('Adding missing columns to chat_sessions table...');
    await client.query(`
      ALTER TABLE chat_sessions 
      ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'WEB';
    `);
    console.log('✔ Added source column');

    await client.query(`
      ALTER TABLE chat_sessions 
      ADD COLUMN IF NOT EXISTS whatsapp_phone_number text;
    `);
    console.log('✔ Added whatsapp_phone_number column');

    await client.query(`
      ALTER TABLE chat_sessions 
      ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 0;
    `);
    console.log('✔ Added state_version column');

    console.log('All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
