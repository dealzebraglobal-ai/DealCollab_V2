import Groq from "groq-sdk";
import OpenAI from "openai";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * PRODUCTION-SAFE AI GENERATOR
 * Ensures no top-level initialization that could fail during build or runtime.
 */
export async function generateAIResponse(messages: ChatMessage[]) {
  // 1. Initialize Clients INSIDE the function to be safe on Vercel
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  console.log("AI DEBUG (PRODUCTION):", {
    HAS_GROQ_KEY: !!groqApiKey,
    HAS_OPENAI_KEY: !!openaiApiKey,
    MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b"
  });

  if (!groqApiKey && !openaiApiKey) {
    console.error("AI ERROR: No API keys found in environment variables.");
    throw new Error("MISSING_API_KEYS");
  }

  // 🚀 PRIMARY: GROQ (Fast + High Rate Limits)
  if (groqApiKey) {
    try {
      console.log("AI: Attempting Groq generation...");
      const groq = new Groq({ apiKey: groqApiKey });
      
      const response = await groq.chat.completions.create({
        // llama-3.1-8b-instant was decommissioned by Groq (returns HTTP 404) —
        // verified against GET /openai/v1/models as of 2026-09.
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages,
        temperature: 0,
        stream: false,
      });

      const content = response.choices[0]?.message?.content || "";
      if (content) return content;
      
    } catch (groqError) {
      console.error("AI ERROR: Groq generation failed:", groqError);
    }
  }

  // 🔁 FALLBACK: OPENAI (High Reliability)
  if (openaiApiKey) {
    try {
      console.log("AI: Attempting OpenAI fallback...");
      const openai = new OpenAI({ apiKey: openaiApiKey });
      
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages,
        temperature: 0,
        stream: false,
      });

      const content = response.choices[0]?.message?.content || "";
      if (content) return content;

    } catch (openaiError) {
      console.error("AI ERROR: OpenAI fallback failed:", openaiError);
    }
  }

  // 🛑 FINAL FAIL-SAFE: Throw error to be caught by API handler
  throw new Error("AI_PROCESSING_FAILED");
}

/**
 * Utility to clean AI output by removing markdown code blocks.
 */
export function cleanAIJSON(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}
