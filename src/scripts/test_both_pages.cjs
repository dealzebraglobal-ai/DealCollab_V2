require('dotenv').config();
const { PDFParse } = require('pdf-parse');
const { OpenAI } = require('openai');

async function testBothPages() {
  const url = "https://d3h7pbw71jzzlo.cloudfront.net/6a180a1623c5e516c21a21df/docs/64a25c9c-b1f2-4ae0-acab-4355c2f70be1_media-1791528892075.pdf";
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  const parser = new PDFParse({ data: buf });
  const shot = await parser.getScreenshot({ partial: [1, 2], imageDataUrl: true });
  console.log("Pages rendered:", shot.pages.length);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (let i = 0; i < shot.pages.length; i++) {
    const page = shot.pages[i];
    console.log(`Processing page ${page.pageNumber}... dataUrl length: ${page.dataUrl.length}`);
    const t0 = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text, headings, financial numbers, metrics, deal parameters, and details visible on this document page. Output clean, readable markdown text."
            },
            {
              type: "image_url",
              image_url: {
                url: page.dataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
    });
    console.log(`Page ${page.pageNumber} extracted in ${Date.now() - t0}ms:`);
    console.log(completion.choices[0].message.content);
    console.log("==========================================");
  }
}

testBothPages().catch(console.error);
