import type { Components } from 'react-markdown';

/** ReactMarkdown component overrides — matching platform typography with bold headings and normal body text. */
export const guideMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold tracking-tight text-[#1F1F1F] sm:text-3xl mb-4">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-4 border-b border-[#E5E7EB] pb-2.5 text-lg font-bold text-[#1F1F1F] first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wider text-[#1F1F1F]">{children}</h3>,
  p: ({ children }) => <p className="mb-4 text-sm font-normal leading-relaxed text-[#4B5563] sm:text-base">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[#1F1F1F]">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} className="font-medium text-[#FF6A00] underline decoration-[#FF6A00]/30 underline-offset-2 hover:text-[#EA580C] transition-colors">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm font-normal text-[#4B5563] sm:text-base">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm font-normal text-[#4B5563] sm:text-base">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed font-normal">{children}</li>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-xl border border-[#E5E7EB]">
      <table className="w-full min-w-[480px] text-left text-sm font-normal">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#F9FAFB] text-[11px] font-semibold uppercase tracking-wider text-[#1F1F1F] border-b border-[#E5E7EB]">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 font-semibold text-[#1F1F1F]">{children}</th>,
  td: ({ children }) => <td className="border-t border-[#E5E7EB] px-4 py-3 font-normal text-[#4B5563]">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 rounded-xl border-l-4 border-[#FF6A00] bg-[#FFF7ED] px-4 py-3 text-sm font-normal text-[#1F1F1F]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-[#E5E7EB]" />,
  code: ({ children }) => <code className="rounded-md bg-[#F3F4F6] border border-[#E5E7EB] px-1.5 py-0.5 text-[13px] font-mono text-[#1F1F1F]">{children}</code>,
};
