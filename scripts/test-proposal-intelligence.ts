import pg from 'pg';
import OpenAI from 'openai';
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

async function test() {
    const dbUrl = process.env.DATABASE_URL;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!dbUrl) {
        console.error('❌ DATABASE_URL is not set in environment.');
        process.exit(1);
    }
    if (!openaiApiKey) {
        console.error('❌ OPENAI_API_KEY is not set in environment.');
        process.exit(1);
    }

    console.log('📡 Initializing OpenAI client...');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    console.log('📡 Connecting to PostgreSQL database...');
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    try {
        // Test query 1
        const testQuery1 = 'debt proposals in manufacturing sector';
        console.log(`\n🔍 Test Case 1: "${testQuery1}" (Semantic + Hybrid Search)`);

        console.log('   Generating query embedding...');
        const embRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: testQuery1,
        });
        const embedding = embRes.data[0].embedding;

        console.log('   Executing search_proposals_intelligence RPC...');
        const { rows: results1 } = await client.query(
            `SELECT * FROM public.search_proposals_intelligence($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                JSON.stringify(embedding), // query_embedding
                'DEBT',                   // filter_intent
                'manufacturing',          // filter_sector
                null,                     // filter_geography
                'manufacturing',          // filter_keyword
                'ACTIVE',                 // filter_status
                false,                    // strict_filters (soft boost)
                5                         // result_count
            ]
        );

        console.log(`   Found ${results1.length} matches:`);
        results1.forEach((row, i) => {
            console.log(`\n   [${i + 1}] Similarity: ${Math.round(row.similarity * 100)}% | Combined Score: ${Math.round(row.combined_score * 100)}%`);
            console.log(`       Intent: ${row.intent} | Sectors: ${row.sectors?.join(', ') || 'N/A'}`);
            console.log(`       Normalised: ${row.normalised_text?.substring(0, 100)}...`);
            console.log(`       User: ${row.user_name} | Contact: ${row.user_email} | Phone: ${row.user_phone}`);
            if (row.advisor_name || row.contact_phone) {
                console.log(`       Advisor: ${row.advisor_name} | Phone: ${row.contact_phone}`);
            }
        });

        // Test query 2: strict filters
        const testQuery2 = 'sell side proposals in mumbai';
        console.log(`\n🔍 Test Case 2: "${testQuery2}" (Strict metadata filters)`);

        console.log('   Generating query embedding...');
        const embRes2 = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: testQuery2,
        });
        const embedding2 = embRes2.data[0].embedding;

        console.log('   Executing search_proposals_intelligence RPC with strict_filters = true...');
        const { rows: results2 } = await client.query(
            `SELECT * FROM public.search_proposals_intelligence($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                JSON.stringify(embedding2), // query_embedding
                'SELL_SIDE',                // filter_intent
                null,                       // filter_sector
                'mumbai',                   // filter_geography
                null,                       // filter_keyword
                'ACTIVE',                   // filter_status
                true,                       // strict_filters (force hard constraints)
                5                           // result_count
            ]
        );

        console.log(`   Found ${results2.length} strict matches:`);
        results2.forEach((row, i) => {
            console.log(`\n   [${i + 1}] Similarity: ${Math.round(row.similarity * 100)}% | Combined Score: ${Math.round(row.combined_score * 100)}%`);
            console.log(`       Intent: ${row.intent} | Geographies: ${row.geographies?.join(', ') || 'N/A'}`);
            console.log(`       Normalised: ${row.normalised_text?.substring(0, 100)}...`);
            console.log(`       User: ${row.user_name} | Contact: ${row.user_email}`);
        });

    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await client.end();
        console.log('\n🏁 Test complete.');
    }
}

test();
