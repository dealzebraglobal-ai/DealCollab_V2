require('dotenv').config();
const { OpenAI } = require('openai');
const fs = require('fs');

async function testVision() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const imgBuffer = fs.readFileSync('scratch/page1.png');
  const base64 = imgBuffer.toString('base64');

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the deal mandate information from this image: company name, sector, location, financials (revenue, profit), deal size or fundraising amount, and business description." },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64}`,
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
  });

  console.log("Response:");
  console.log(res.choices[0].message.content);
}

testVision().catch(console.error);
