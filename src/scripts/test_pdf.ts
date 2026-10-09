require('dotenv').config();

async function testPdf() {
  const url = "https://d3h7pbw71jzzlo.cloudfront.net/6a180a1623c5e516c21a21df/docs/64a25c9c-b1f2-4ae0-acab-4355c2f70be1_media-1791528892075.pdf";
  console.log("Fetching from CloudFront:", url);
  const res = await fetch(url);
  console.log("Fetch status:", res.status);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  console.log("Fetched bytes:", buf.length);

  try {
    const { extractTextFromFile } = await import('../lib/documentParser');
    console.log("Calling extractTextFromFile...");
    const result = await extractTextFromFile(buf, 'application/pdf');
    console.log("Extraction result:", {
      textLength: result.text.length,
      method: result.extractionMethod,
      pages: result.pagesProcessed,
      sample: result.text.slice(0, 300)
    });
  } catch (err) {
    console.error("extractTextFromFile ERROR:", err);
  }
}

testPdf();
