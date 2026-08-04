/**
 * DealCollab — Guide & Trust manifest + loader
 * =============================================
 * Single source of truth for the guide section: slugs, titles, order.
 * Content lives in /content/guide/<slug>.md — read at build time
 * (server components only; never import this into a client component).
 */

import fs from 'fs';
import path from 'path';

import { GUIDE_DOCS, type GuideDoc } from './guideManifest';

export { GUIDE_DOCS, type GuideDoc };

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
