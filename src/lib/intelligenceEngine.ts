import Groq from "groq-sdk";
import OpenAI from "openai";
import { IntelligenceState } from "./conversationState";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

// ─────────────────────────────────────────────────────────────
// LAZY CLIENT INITIALIZERS
// Throws clearly at call-time if env vars are missing,
// not at import-time (avoids Next.js build crashes).
// ─────────────────────────────────────────────────────────────

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getGroq(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in environment variables.");
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// ─────────────────────────────────────────────────────────────
// RESPONSE VALIDATION
// Called on raw string from any provider before returning.
// Catches the three most common failure modes:
//   1. Empty string   — provider returned nothing
//   2. HTML page      — rate limit, bad key, deprecated model, 413
//   3. Markdown fences — model wrapped JSON in ```json ... ```
// ─────────────────────────────────────────────────────────────

function validateAndClean(raw: string, source: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error(`[${source}] Returned an empty response.`);
  }

  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    // Strip HTML tags to surface the readable error (e.g. "429 Rate Limit Exceeded")
    const readable = trimmed
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    throw new Error(
      `[${source}] Returned an HTML error page instead of JSON. ` +
      `Common causes: deprecated model, rate limit (429), bad API key (401), ` +
      `or request too large (413). Page text: "${readable}"`
    );
  }

  // Strip accidental markdown fences that some models add despite response_format
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error(`[${source}] Response was empty after stripping markdown fences.`);
  }

  return cleaned;
}

// ─────────────────────────────────────────────────────────────
// INDIVIDUAL PROVIDER CALLS
// Separated so errors surface with full context instead of
// being silently caught by a single try/catch in callAI.
// ─────────────────────────────────────────────────────────────

async function callOpenAI(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content ?? "";
  return validateAndClean(raw, "OpenAI gpt-4o-mini");
}

async function callGroq(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const groq = getGroq();
  const res = await groq.chat.completions.create({
    // llama-3.1-8b-instant  → REMOVED: deprecated, returns HTML 404
    // llama-3.1-70b-versatile → REMOVED: deprecated
    // llama-3.3-70b-versatile → CURRENT stable model (2025)
    model: "llama-3.3-70b-versatile",
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content ?? "";
  return validateAndClean(raw, "Groq llama-3.3-70b-versatile");
}

// ─────────────────────────────────────────────────────────────
// CALL AI — PRIMARY ORCHESTRATOR
//
// Since you are using an OpenAI key, OpenAI is always tried first.
// Groq is a genuine fallback only for infrastructure failures.
//
// KEY BEHAVIOUR CHANGE vs original:
//   Original: caught ALL OpenAI errors and fell through to Groq.
//   Problem:  A bad-JSON response from a working OpenAI call would
//             silently retry on Groq (deprecated model → HTML page
//             → JSON.parse crash with "Unexpected token '<'").
//
//   Fixed:    Only falls back to Groq for infrastructure errors
//             (missing key, rate limit, network, server error).
//             Logic errors (empty response, bad JSON shape) from a
//             working OpenAI call throw immediately — Groq won't fix
//             a prompt problem, and retrying hides the real issue.
// ─────────────────────────────────────────────────────────────

async function callAI(messages: ChatMessage[], maxTokens: number = 700): Promise<string> {
  // ── Primary: OpenAI ───────────────────────────────────────
  try {
    console.log("[AI] Calling OpenAI gpt-4o-mini...");
    const result = await callOpenAI(messages, maxTokens);
    console.log("[AI] OpenAI succeeded.");
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Infrastructure errors → worth trying Groq as backup
    const isInfraError =
      msg.includes("429") ||            // Rate limit
      msg.includes("401") ||            // Bad/expired key
      msg.includes("500") ||            // OpenAI server error
      msg.includes("503") ||            // OpenAI unavailable
      msg.includes("ECONNREFUSED") ||   // Network down
      msg.includes("fetch failed") ||   // Next.js network error
      msg.includes("not set in environment"); // Key missing → try Groq

    if (!isInfraError) {
      // Logic error: the API call reached OpenAI and got a bad response.
      // Groq will hit the same prompt problem — surface the error clearly.
      console.error("[AI] OpenAI returned a bad response (not retrying on Groq):", msg);
      throw err;
    }

    console.warn(`[AI] OpenAI infrastructure failure, trying Groq. Reason: ${msg}`);
  }

  // ── Fallback: Groq ────────────────────────────────────────
  try {
    console.log("[AI] Calling Groq llama-3.3-70b-versatile...");
    const result = await callGroq(messages, maxTokens);
    console.log("[AI] Groq succeeded.");
    return result;
  } catch (groqErr) {
    const groqMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
    console.error("[AI] Groq also failed:", groqMsg);
    throw new Error(
      `Both AI providers failed. Groq error: ${groqMsg}. ` +
      `Check OPENAI_API_KEY and GROQ_API_KEY in your environment.`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESS INTELLIGENCE
// Core per-turn handler called by the chat route.
// Returns structured IntelligenceState parsed from AI JSON output.
// ─────────────────────────────────────────────────────────────

export async function processIntelligence(
  message: string,
  history: ChatMessage[],
  documentText?: string,
  systemPrompt?: string,
): Promise<IntelligenceState> {
  const hasDocument = !!(documentText && documentText.trim().length > 50);
  const finalSystemPrompt = systemPrompt || "You are a helpful deal intelligence assistant.";

  let userContent: string;

  if (hasDocument) {
    // Cap at 8,000 chars ≈ 2,000 tokens — well within gpt-4o-mini context
    const docText = documentText!.trim().slice(0, 8_000);
    const userQuestion = message.trim();
    userContent =
      `### PRIMARY TASK: RESPOND TO LIVE USER INPUT\n` +
      `User Message: "${userQuestion || "Please extract all relevant deal data from this document and structure it according to your instructions."}"\n\n` +
      `### SUPPORTING CONTEXT (HISTORICAL DOCUMENT)\n` +
      `Use the text below ONLY to enrich responses or skip repeated questions. ` +
      `Do NOT let it dominate if the user's message introduces a new intent.\n` +
      `---\n${docText}\n---`;
  } else {
    userContent = message;
  }

  const aiMessages: ChatMessage[] = [
    { role: "system", content: finalSystemPrompt },
    // Last 8 turns — keeps token count predictable and cost low
    ...history.slice(-8).map((h) => ({
      role: h.role as "user" | "assistant" | "system",
      content:
        h.role === "assistant"
          ? (() => {
            try {
              const p = JSON.parse(h.content);
              return p.message || h.content;
            } catch {
              return h.content;
            }
          })()
          : h.content,
    })),
    { role: "user", content: userContent },
  ];

  console.log(
    `[INTELLIGENCE] Processing — document: ${hasDocument} | history: ${history.length} turns`
  );

  // callAI validates the raw string before returning (HTML guard, fence strip).
  // Any error propagates to route.ts which wraps it in a 502 response.
  const content = await callAI(aiMessages, 800);

  try {
    return JSON.parse(content) as IntelligenceState;
  } catch (parseErr) {
    console.error(
      "[INTELLIGENCE] JSON parse failed. First 400 chars of AI response:\n",
      content.slice(0, 400)
    );
    throw new Error(
      `AI returned a response that could not be parsed as JSON. ` +
      `Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT INTELLIGENCE — TYPES & SAFE FALLBACK
// ─────────────────────────────────────────────────────────────

export interface DocumentIntelligence {
  company_overview: string;
  industry: string;
  location: string;
  transaction_type: string;
  deal_size?: string;
  revenue?: string;
  products_services: string[];
  capabilities: string[];
  market_position: string;
  competitive_advantages: string[];
  certifications: string[];
  growth_drivers: string[];
  missing_information: string[];
}

// Used when AI structuring fails — never null, never throws.
// The parse-document route stores this so the upload still succeeds.
// missing_information tells engineers (and the bot) why data is absent.
const EMPTY_INTEL: Omit<DocumentIntelligence, "missing_information"> = {
  company_overview: "",
  industry: "",
  location: "",
  transaction_type: "",
  deal_size: "",
  revenue: "",
  products_services: [],
  capabilities: [],
  market_position: "",
  competitive_advantages: [],
  certifications: [],
  growth_drivers: [],
};

// ─────────────────────────────────────────────────────────────
// CLEAN AND STRUCTURE DOCUMENT
// Converts raw PDF-extracted text into structured M&A intelligence.
//
// FIXES vs original:
//   1. Never returns null — always returns DocumentIntelligence.
//      parse-document/route.ts no longer needs null checks before use.
//   2. Validates AI response shape field-by-field — partial AI output
//      fills missing_information rather than crashing downstream.
//   3. Input capped at 12,000 chars to prevent 413 errors on large PDFs.
//   4. Uses callAI (with smart fallback) instead of a bare Groq call.
// ─────────────────────────────────────────────────────────────

export async function cleanAndStructureDocument(
  rawText: string,
): Promise<DocumentIntelligence> {
  const SYSTEM_PROMPT = `You are an expert document intelligence engine for M&A (Mergers & Acquisitions).
Process raw PDF-extracted text into clean, structured, high-quality information.

GOALS:
1. CLEAN: Remove noise, duplicate headers/footers, OCR artifacts.
2. STRUCTURE: Rebuild logical business sections.
3. EXTRACT: company overview, industry, location, transaction type, products/services,
   capabilities, market position, competitive advantages, certifications, growth drivers.

Return ONLY this JSON — no markdown, no explanation:
{
  "company_overview": "...",
  "industry": "...",
  "location": "...",
  "transaction_type": "...",
  "deal_size": "...",
  "revenue": "...",
  "products_services": ["..."],
  "capabilities": ["..."],
  "market_position": "...",
  "competitive_advantages": ["..."],
  "certifications": ["..."],
  "growth_drivers": ["..."],
  "missing_information": ["..."]
}

Rules: Do not hallucinate. Missing data → add field name to missing_information.
Remove redundancy. Preserve technical terms. Tone: investment banker summarising a deal.`;

  // 12,000 chars ≈ 3,000 tokens — safely within both gpt-4o-mini and Groq limits
  const MAX_CHARS = 12_000;
  const inputText =
    rawText.length > MAX_CHARS
      ? rawText.slice(0, MAX_CHARS) + "\n[truncated — processing first 12,000 characters]"
      : rawText;

  console.log(
    `[DOC-INTEL] Input: ${rawText.length} chars → processing: ${inputText.length} chars`
  );

  try {
    const content = await callAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `RAW EXTRACTED TEXT:\n---\n${inputText}\n---` },
      ],
      1200,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.error(
        "[DOC-INTEL] JSON parse failed. First 400 chars:\n",
        content.slice(0, 400)
      );
      throw new Error(
        `Document AI returned non-JSON: ` +
        `${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        `Document AI returned unexpected type: ${Array.isArray(parsed) ? "array" : typeof parsed}`
      );
    }

    // Normalise each field — partial AI output fills defaults, doesn't crash
    const r = parsed as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

    return {
      company_overview: str(r.company_overview),
      industry: str(r.industry),
      location: str(r.location),
      transaction_type: str(r.transaction_type),
      deal_size: str(r.deal_size),
      revenue: str(r.revenue),
      products_services: arr(r.products_services),
      capabilities: arr(r.capabilities),
      market_position: str(r.market_position),
      competitive_advantages: arr(r.competitive_advantages),
      certifications: arr(r.certifications),
      growth_drivers: arr(r.growth_drivers),
      missing_information: arr(r.missing_information),
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[DOC-INTEL] Structuring failed:", errMsg);

    // Safe fallback — upload succeeds, chat still works with document text,
    // missing_information records what went wrong for debugging.
    return {
      ...EMPTY_INTEL,
      missing_information: [
        "AI structuring failed — document stored, manual review required.",
        `Error: ${errMsg}`,
      ],
    };
  }
}