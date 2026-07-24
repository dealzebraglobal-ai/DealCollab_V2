import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowRight, Clock3 } from 'lucide-react';
import { GUIDE_CATEGORIES, GUIDE_DOCS, getGuideDoc } from '@/lib/guide';
import GuideHeader from '@/components/guide/GuideHeader';
import { guideMarkdownComponents } from '@/components/guide/GuideMarkdown';
import { guideIcon } from '@/components/guide/guideIcons';

export function generateStaticParams() {
  return GUIDE_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGuideDoc(slug);
  if (!entry) return {};
  return { title: entry.doc.title, description: entry.doc.description };
}

export default async function GuideDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGuideDoc(slug);
  if (!entry) notFound();

  const { doc, markdown } = entry;
  const idx = GUIDE_DOCS.findIndex((d) => d.slug === doc.slug);
  const next = GUIDE_DOCS[idx + 1] ?? null;
  const category = GUIDE_CATEGORIES.find((c) => c.id === doc.category);
  const Icon = guideIcon(doc.icon);

  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <GuideHeader
        items={[
          { label: 'Guide & Trust', href: '/guide' },
          ...(category ? [{ label: category.label }] : []),
          { label: doc.title },
        ]}
      />

      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 transition-all duration-700 overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl">
          <Link
            href="/guide"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-[#F97316] transition-colors"
          >
            ← All guides
          </Link>

          <div className="mt-4 flex items-start gap-4">
            <div className="rounded-2xl bg-orange-50 p-3 text-[#F97316] shrink-0">
              <Icon size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">{doc.title}</h1>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-gray-400">
                {category && (
                  <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-gray-500">{category.label}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock3 size={12} /> {doc.readingTimeMinutes} min read
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={guideMarkdownComponents}>
              {markdown}
            </ReactMarkdown>
          </div>

          {next && (
            <Link
              href={`/guide/${next.slug}`}
              className="group mt-6 flex items-center justify-between rounded-3xl border border-gray-100 bg-gray-50 p-5 transition-all hover:border-orange-100 hover:bg-orange-50/40"
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Next</p>
                <p className="mt-1 text-sm font-black text-gray-950">{next.title}</p>
              </div>
              <ArrowRight size={18} className="text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-[#F97316]" />
            </Link>
          )}

          <div className="h-10 shrink-0" />
        </article>
      </div>
    </div>
  );
}
