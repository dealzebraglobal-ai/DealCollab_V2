/**
 * DealCollab — Guide & Trust data manifest
 * =========================================
 * Client-safe: slugs, titles, categories, order. No filesystem access here —
 * this is imported directly by client components (e.g. the searchable
 * /guide index). Markdown loading (fs-dependent) lives in src/lib/guide.ts,
 * server-only.
 */

export type GuideCategoryId = 'platform' | 'trust' | 'legal' | 'support';

export interface GuideCategoryMeta {
  id: GuideCategoryId;
  label: string;
  description: string;
  /** lucide-react icon name — resolved in the client via guideIcons.ts */
  icon: string;
}

export const GUIDE_CATEGORIES: GuideCategoryMeta[] = [
  { id: 'platform', label: 'Platform', description: 'How DealCollab works, day to day.', icon: 'Compass' },
  { id: 'trust', label: 'Trust', description: 'Privacy, security, and confidentiality.', icon: 'ShieldCheck' },
  { id: 'legal', label: 'Legal', description: 'Terms and policies that govern the platform.', icon: 'Scale' },
  { id: 'support', label: 'Support', description: 'Answers and how to reach us.', icon: 'LifeBuoy' },
];

export interface GuideDoc {
  slug: string;
  title: string;
  description: string;
  category: GuideCategoryId;
  /** lucide-react icon name — resolved in the client via guideIcons.ts */
  icon: string;
  readingTimeMinutes: number;
}

/** Order here = card order within each category on /guide. */
export const GUIDE_DOCS: GuideDoc[] = [
  {
    slug: 'get-matched-faster',
    title: 'Get Matched Faster',
    description: 'How to answer the intake chat and submit a complete mandate in one message.',
    category: 'platform',
    icon: 'Zap',
    readingTimeMinutes: 3,
  },
  {
    slug: 'how-it-works',
    title: 'How DealCollab Works',
    description: 'The full flow — mandate to match to connection — and the one privacy rule that governs it.',
    category: 'platform',
    icon: 'Workflow',
    readingTimeMinutes: 4,
  },
  {
    slug: 'tokens-and-payments',
    title: 'Tokens & Payments',
    description: 'What is always free, the one action that costs tokens, and exactly when they are deducted.',
    category: 'platform',
    icon: 'Coins',
    readingTimeMinutes: 3,
  },
  {
    slug: 'what-we-do-and-dont',
    title: "What We Do — and Don't",
    description: 'Our boundaries, published plainly so you can rely on them before your first EOI.',
    category: 'trust',
    icon: 'ShieldCheck',
    readingTimeMinutes: 3,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy & Data',
    description: 'What we collect, who sees what, and your rights under the DPDP Act.',
    category: 'trust',
    icon: 'Lock',
    readingTimeMinutes: 5,
  },
  {
    slug: 'terms-of-service',
    title: 'Terms of Service',
    description: 'The legal terms governing your use of the platform.',
    category: 'legal',
    icon: 'Scale',
    readingTimeMinutes: 6,
  },
  {
    slug: 'faq',
    title: 'FAQ',
    description: 'Straight answers on pricing, matching, confidentiality, and governance.',
    category: 'support',
    icon: 'HelpCircle',
    readingTimeMinutes: 4,
  },
];
