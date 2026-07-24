import type { Components } from 'react-markdown';

/** ReactMarkdown component overrides — app typography, no serif fonts, orange accent links. */
export const guideMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-4 border-b border-gray-100 pb-3 text-lg font-black text-gray-950 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-sm font-black uppercase tracking-widest text-gray-500">{children}</h3>,
  p: ({ children }) => <p className="mb-4 text-sm font-medium leading-relaxed text-gray-600 sm:text-base">{children}</p>,
  strong: ({ children }) => <strong className="font-black text-gray-900">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="font-bold text-[#F97316] underline decoration-orange-200 underline-offset-2 hover:text-[#EA580C]">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm font-medium text-gray-600 sm:text-base">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm font-medium text-gray-600 sm:text-base">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-2xl border border-gray-100">
      <table className="w-full min-w-[480px] text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50 text-[11px] font-black uppercase tracking-widest text-gray-400">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3">{children}</th>,
  td: ({ children }) => <td className="border-t border-gray-50 px-4 py-3 font-medium text-gray-600">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 rounded-2xl border-l-4 border-[#F97316] bg-orange-50/60 px-4 py-3 text-sm font-semibold text-gray-700">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-gray-100" />,
  code: ({ children }) => <code className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[13px] font-mono text-gray-800">{children}</code>,
};
