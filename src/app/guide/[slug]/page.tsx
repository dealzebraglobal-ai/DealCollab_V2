import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GUIDE_DOCS, getGuideDoc } from '@/lib/guide';

/**
 * NOTE — Next.js version:
 * Written for Next 14 (sync `params`). On Next 15, `params` is a Promise:
 *   export default async function GuideDocPage(
 *     { params }: { params: Promise<{ slug: string }> }
 *   ) { const { slug } = await params; ... }
 * Apply the same change to generateMetadata.
 */

export function generateStaticParams() {
  return GUIDE_DOCS.map(d => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGuideDoc(slug);
  if (!entry) return {};
  return { title: entry.doc.title, description: entry.doc.description };
}

export default async function GuideDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getGuideDoc(slug);
  if (!entry) notFound();

  const { doc, markdown } = entry;
  const idx = GUIDE_DOCS.findIndex(d => d.slug === doc.slug);
  const next = GUIDE_DOCS[idx + 1] ?? null;

  return (
    <article className="guide-doc">
      <Link href="/guide" className="guide-back">
        &larr; All guides
      </Link>
      <div className="guide-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
      {next && (
        <Link href={`/guide/${next.slug}`} className="guide-next">
          <span>Next</span>
          <strong>{next.title}</strong>
        </Link>
      )}
    </article>
  );
}
