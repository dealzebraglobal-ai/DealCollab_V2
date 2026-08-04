/**
 * DealCollab — Guide & Trust manifest (CLIENT-SAFE)
 * ==================================================
 * Pure data: slugs, titles, order. NO fs / node imports — this file is
 * imported by the sidebar GuideMenu (a client component) AND by the
 * server-side loader in lib/guide.ts.
 *
 * Do not add node-only imports here. Ever.
 */

export interface GuideDoc {
  slug: string;
  title: string;
  description: string;
}

/** Order here = card order on /guide AND item order in the sidebar menu. */
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
  {
    slug: 'who-we-are',
    title: 'Who We Are',
    description: 'The company behind DealCollab — DealZebra Global Intelligence LLP, its legal existence, and the team.',
  },
];
