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

    console.log('Creating end_user_profiles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS end_user_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          company_name TEXT NOT NULL,
          website TEXT NOT NULL,
          sectors TEXT[],
          intent TEXT[] NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('✔ Table end_user_profiles created successfully');

    console.log('Adding performance index on user_id...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_end_user_profiles_user_id ON end_user_profiles(user_id);
    `);
    console.log('✔ Performance index added');

    console.log('All migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
