const { PDFParse } = require('pdf-parse');
const fs = require('fs');

async function testScreenshot() {
  const url = "https://d3h7pbw71jzzlo.cloudfront.net/6a180a1623c5e516c21a21df/docs/64a25c9c-b1f2-4ae0-acab-4355c2f70be1_media-1791528892075.pdf";
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  const parser = new PDFParse({ data: buf });
  const shot = await parser.getScreenshot({ partial: [1], imageDataUrl: true, imageBuffer: true });
  console.log("Shot pages:", shot.pages.length);
  const page1 = shot.pages[0];
  console.log("Page 1 keys:", Object.keys(page1));
  if (page1.dataUrl) {
    console.log("dataUrl length:", page1.dataUrl.length);
    const base64Data = page1.dataUrl.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync('scratch/page1.png', Buffer.from(base64Data, 'base64'));
    console.log("Saved scratch/page1.png");
  }
}

testScreenshot().catch(console.error);
