const { PDFParse } = require('pdf-parse');

async function testPdfNative() {
  const url = "https://d3h7pbw71jzzlo.cloudfront.net/6a180a1623c5e516c21a21df/docs/64a25c9c-b1f2-4ae0-acab-4355c2f70be1_media-1791528892075.pdf";
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  const parser = new PDFParse({ data: buf });
  const textResult = await parser.getText();
  console.log("Pages:", textResult.pages.length);
  for (let i = 0; i < textResult.pages.length; i++) {
    console.log(`Page ${i + 1} text length:`, textResult.pages[i].text.length);
    console.log(`Page ${i + 1} text content:\n---`, textResult.pages[i].text, '\n---');
  }
}

testPdfNative().catch(console.error);
