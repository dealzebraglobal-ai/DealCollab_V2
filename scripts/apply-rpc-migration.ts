import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
    });
}

const dbUrl = process.env.DATABASE_URL;

async function applyMigration() {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    try {
        console.log('Applying update_proposal_embedding migration...');
        
        // Use the version that takes TEXT to make it easy to call from JS
        const sql = `
            CREATE OR REPLACE FUNCTION update_proposal_embedding(
                proposal_id UUID,
                embedding_vector TEXT
            )
            RETURNS VOID
            LANGUAGE plpgsql
            AS $$
            BEGIN
                UPDATE proposals
                SET embedding = embedding_vector::vector(1536),
                    embedding_status = 'COMPLETED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = proposal_id;
            END;
            $$;
            
            GRANT EXECUTE ON FUNCTION update_proposal_embedding TO service_role;
            GRANT EXECUTE ON FUNCTION update_proposal_embedding TO authenticated;
            GRANT EXECUTE ON FUNCTION update_proposal_embedding TO anon;
        `;

        await client.query(sql);
        console.log('Migration applied successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
