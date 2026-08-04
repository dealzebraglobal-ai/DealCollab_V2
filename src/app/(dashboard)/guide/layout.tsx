import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, Instrument_Sans } from 'next/font/google';
import './guide.css';

const display = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--guide-font-display',
});
const body = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--guide-font-body',
});

export const metadata: Metadata = {
  title: { default: 'Guide & Trust — DealCollab', template: '%s — DealCollab' },
  description:
    'How DealCollab works, what it costs, and where our responsibilities begin and end.',
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${display.variable} ${body.variable} guide-root`}>
      <header className="guide-header">
        <Link href="/" className="guide-brand">
          DealCollab
        </Link>
        <span className="guide-header-tag">Guide &amp; Trust</span>
      </header>
      <main className="guide-main">{children}</main>
      <footer className="guide-footer">
        <span>Dealzebra Global Intelligence LLP</span>
        <nav>
          <Link href="/guide/privacy-policy">Privacy</Link>
          <Link href="/guide/terms-of-service">Terms</Link>
          {/* TODO: replace with your real support address */}
          <a href="mailto:support@dealcollab.example">Contact</a>
        </nav>
      </footer>
    </div>
  );
}
