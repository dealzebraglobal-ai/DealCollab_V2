/**
 * DealCollab — Guide & Trust markdown loader
 * =============================================
 * Content lives in /content/guide/<slug>.md — read at build/request time.
 * SERVER-ONLY (uses `fs`) — never import this into a client component.
 * Client components should import from '@/lib/guideData' instead.
 */

import fs from 'fs';
import path from 'path';
import { GUIDE_DOCS, type GuideDoc } from './guideData';

export { GUIDE_CATEGORIES, GUIDE_DOCS } from './guideData';
export type { GuideCategoryId, GuideCategoryMeta, GuideDoc } from './guideData';

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
