import pg from "pg";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const client = new pg.Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();

    const { rows } = await client.query(`
    SELECT id, normalised_text
    FROM mandates
    WHERE summary_text IS NULL
  `);

    console.log(`Found ${rows.length} mandates`);

    for (const row of rows) {
        try {
            const prompt = `
Convert this structured mandate into a professional investment-banking style summary.

Requirements:
- 3-5 sentences
- Natural language
- Mention sector, geography, intent, deal size, revenue, EBITDA, growth if available
- Make it attractive for investors and buyers

JSON:
${JSON.stringify(row.normalised_text)}
`;

            const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            });

            const summary =
                response.choices[0].message.content ?? "";

            await client.query(
                `
        UPDATE mandates
        SET summary_text = $1
        WHERE id = $2
      `,
                [summary, row.id]
            );

            console.log(`✓ ${row.id}`);
        } catch (err) {
            console.error(err);
        }
    }

    await client.end();
}

run();