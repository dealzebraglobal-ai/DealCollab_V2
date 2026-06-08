import pg from "pg";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
}

if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
}

const client = new pg.Client({
    connectionString: DATABASE_URL,
});

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const BATCH_SIZE = 20;

async function generateSummary(
    rawText: string | null,
    normalizedText: string
): Promise<string> {
    const prompt = `
You are a senior investment banker.

Generate a professional deal summary from the following data.

Requirements:
- 80-150 words
- Professional investment banking language
- Mention intent, sector, geography, revenue, EBITDA, valuation, growth metrics if available
- No bullet points
- Return only the summary

RAW TEXT:
${rawText ?? ""}

NORMALIZED DATA:
${JSON.stringify(normalizedText, null, 2)}
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        messages: [
            {
                role: "system",
                content:
                    "You are an elite M&A analyst creating deal summaries."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });

    return (
        response.choices[0]?.message?.content?.trim() ??
        "Professional deal summary unavailable."
    );
}

async function processBatch(): Promise<boolean> {
    const result = await client.query(
        `
    SELECT
      id,
      raw_text,
      normalised_text
    FROM proposals
    WHERE summary_text IS NULL
    LIMIT $1
    `,
        [BATCH_SIZE]
    );

    const rows = result.rows;

    if (rows.length === 0) {
        return false;
    }

    console.log(`Processing ${rows.length} proposals`);

    for (const proposal of rows) {
        try {
            const summary = await generateSummary(
                proposal.raw_text,
                proposal.normalised_text
            );

            await client.query(
                `
        UPDATE proposals
        SET
          summary_text = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
                [summary, proposal.id]
            );

            console.log(`✅ ${proposal.id}`);
        } catch (error) {
            console.error(
                `❌ Failed ${proposal.id}`,
                error
            );
        }

        await new Promise((resolve) =>
            setTimeout(resolve, 300)
        );
    }

    return true;
}

async function main() {
    await client.connect();

    try {
        console.log(
            "🚀 Starting proposal summary backfill..."
        );

        while (await processBatch()) {
            // keep processing
        }

        console.log(
            "🎉 Proposal summary backfill completed"
        );
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});