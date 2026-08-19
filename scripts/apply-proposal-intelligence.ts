import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Load environment variables (checks .env.local first, then .env)
const envFiles = ['.env.local', '.env'];
for (const e of envFiles) {
    const ep = path.resolve(process.cwd(), e);
    if (fs.existsSync(ep)) {
        const envFile = fs.readFileSync(ep, 'utf8');
        envFile.split('\n').forEach((line: string) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const [key, ...value] = trimmed.split('=');
            if (key && value.length > 0) {
                process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
            }
        });
        break; // Stop after first match
    }
}

async function run() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL is not configured in .env or .env.local');
        process.exit(1);
    }

    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260811_proposal_intelligence.sql');
    if (!fs.existsSync(migrationPath)) {
        console.error(`Migration file not found at: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Connecting to database...');
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    try {
        console.log('Applying migration...');
        await client.query(sql);
        console.log('✅ Migration applied successfully!');
    } catch (error) {
        console.error('❌ Failed to apply migration:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
