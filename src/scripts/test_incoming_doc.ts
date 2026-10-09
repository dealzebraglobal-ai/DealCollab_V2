import 'dotenv/config';
import { db } from '../db';
import { users, documents, chatSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { extractTextFromFile } from '../lib/documentParser';
import { cleanAndStructureDocument } from '../lib/intelligenceEngine';
import { initializeStateFromDocument } from '../lib/promptRouter';

async function testIncomingDoc() {
  const incomingDocument = {
    filename: "Project_Jewel_Investor_Teaser_V2_Oct26.pdf",
    mediaUrl: "https://d3h7pbw71jzzlo.cloudfront.net/6a180a1623c5e516c21a21df/docs/64a25c9c-b1f2-4ae0-acab-4355c2f70be1_media-1791528892075.pdf",
    mimeType: "application/pdf"
  };
  const formattedPhone = "+918850333250";
  const user = await db.query.users.findFirst({
    where: eq(users.phone, formattedPhone)
  });
  console.log("Found user:", user?.id);

  let extractedDocText = '';
  let docId: string | null = null;
  let structuredData: Record<string, unknown> = {};

  try {
    console.log("Fetching media...");
    const docRes = await fetch(incomingDocument.mediaUrl);
    console.log("Fetch status:", docRes.status);
    const arrayBuf = await docRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    console.log("Buffer length:", buffer.length);

    console.log("Extracting text...");
    const extraction = await extractTextFromFile(buffer, incomingDocument.mimeType);
    extractedDocText = extraction.text.trim();
    console.log("Extracted chars:", extractedDocText.length);

    console.log("Structuring document...");
    const rawStruct = await cleanAndStructureDocument(extractedDocText);
    console.log("Raw struct:", rawStruct);
    if (rawStruct && typeof rawStruct === "object" && !Array.isArray(rawStruct)) {
      structuredData = rawStruct as Record<string, unknown>;
    }

    console.log("Inserting into documents...");
    const [newDoc] = await db
      .insert(documents)
      .values({
        userId: user!.id,
        name: incomingDocument.filename,
        url: incomingDocument.mediaUrl,
        extracted_text: extractedDocText,
        structured_data: structuredData,
      })
      .returning({ id: documents.id });
    docId = newDoc?.id ?? null;
    console.log("Inserted docId:", docId);

    const seededState = initializeStateFromDocument(structuredData);
    seededState.is_document_intake = true;

    console.log("Inserting chat session...");
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        userId: user!.id,
        documentId: docId,
        title: `Deal Intake: ${incomingDocument.filename}`,
        state: seededState,
        source: "WHATSAPP-WAPPBIZ",
        whatsappPhoneNumber: formattedPhone,
      })
      .returning();
    console.log("Created session:", newSession.id);
  } catch (err) {
    console.error("TEST FAILED WITH ERROR:", err);
  }
}

testIncomingDoc();
