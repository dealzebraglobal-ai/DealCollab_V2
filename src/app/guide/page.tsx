import Link from 'next/link';
import { GUIDE_DOCS } from '@/lib/guide';

export default function GuideIndexPage() {
  return (
    <>
      <p className="guide-kicker">Guide &amp; Trust</p>
      <h1 className="guide-title">Know exactly what you&rsquo;re working with.</h1>
      <p className="guide-lede">
        How the platform works, what it costs, what we promise — and just as
        clearly, what we don&rsquo;t. Published so you can hold us to it.
      </p>
      <div className="guide-grid">
        {GUIDE_DOCS.map((doc, i) => (
          <Link
            key={doc.slug}
            href={`/guide/${doc.slug}`}
            className="guide-card"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="guide-card-index">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <span className="guide-card-cta">Read &rarr;</span>
          </Link>
        ))}
      </div>
    </>
  );
}
