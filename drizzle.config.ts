import type { Config } from 'drizzle-kit';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Manual env loading for .env.local or .env
const envPath = existsSync(join(process.cwd(), '.env.local'))
  ? join(process.cwd(), '.env.local')
  : join(process.cwd(), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
}

export default {
  schema: './src/db/schema.ts',
  out: './supabase/migrations',
  connectionString: process.env.DATABASE_URL || '',
} satisfies Config;
