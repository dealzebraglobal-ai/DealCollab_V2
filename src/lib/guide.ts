/**
 * DealCollab — Guide & Trust manifest + loader
 * =============================================
 * Single source of truth for the guide section: slugs, titles, order.
 * Content lives in /content/guide/<slug>.md — read at build time
 * (server components only; never import this into a client component).
 */

import fs from 'fs';
import path from 'path';

export interface GuideDoc {
  slug: string;
  title: string;
  description: string;
}

/** Order here = card order on /guide. New-user reading order, then legal. */
export const GUIDE_DOCS: GuideDoc[] = [
  {
    slug: 'get-matched-faster',
    title: 'Get Matched Faster',
    description: 'How to answer the intake chat and submit a complete mandate in one message.',
  },
  {
    slug: 'how-it-works',
    title: 'How DealCollab Works',
    description: 'The full flow — mandate to match to connection — and the one privacy rule that governs it.',
  },
  {
    slug: 'tokens-and-payments',
    title: 'Tokens & Payments',
    description: 'What is always free, the one action that costs tokens, and exactly when they are deducted.',
  },
  {
    slug: 'what-we-do-and-dont',
    title: "What We Do — and Don't",
    description: 'Our boundaries, published plainly so you can rely on them before your first EOI.',
  },
  {
    slug: 'faq',
    title: 'FAQ',
    description: 'Straight answers on pricing, matching, confidentiality, and governance.',
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy & Data',
    description: 'What we collect, who sees what, and your rights under the DPDP Act.',
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    description: 'The legal terms governing your use of the platform.',
  },
];

const CONTENT_DIR = path.join(process.cwd(), 'content', 'guide');

export function getGuideDoc(
  slug: string,
): { doc: GuideDoc; markdown: string } | null {
  const doc = GUIDE_DOCS.find(d => d.slug === slug);
  if (!doc) return null;
  const filePath = path.join(CONTENT_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return { doc, markdown: fs.readFileSync(filePath, 'utf8') };
}
