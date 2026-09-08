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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
          { label: 'Home', href: '/home' },
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
            <div className="rounded-2xl bg-[#FFF7ED] border border-[#FFEDD5] p-3 text-[#FF6A00] shrink-0">
              <Icon size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1F1F1F] sm:text-3xl">{doc.title}</h1>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-[#747775]">
                {category && (
                  <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-1 text-[#1F1F1F] font-medium">{category.label}</span>
                )}
                <span className="flex items-center gap-1 font-medium">
                  <Clock3 size={12} /> {doc.readingTimeMinutes} min read
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={guideMarkdownComponents}>
              {markdown}
            </ReactMarkdown>
          </div>

          {next && (
            <Link
              href={`/guide/${next.slug}`}
              className="group mt-6 flex items-center justify-between rounded-2xl border border-[#E5E7EB] hover:border-black bg-white p-5 transition-all duration-200 shadow-sm"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#747775]">Next</p>
                <p className="mt-1 text-sm font-bold text-[#1F1F1F]">{next.title}</p>
              </div>
              <ArrowRight size={18} className="text-[#747775] transition-all group-hover:translate-x-0.5 group-hover:text-black" />
            </Link>
          )}

          <div className="h-10 shrink-0" />
        </article>
      </div>
    </div>
  );
}
