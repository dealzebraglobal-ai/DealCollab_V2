import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = {
  title: 'Sign In',
  description: "Sign in to DealCollab — India's AI-powered M&A intelligence network.",
  // Belt-and-suspenders alongside next.config.ts's X-Robots-Tag header and
  // robots.ts's disallow entry (same pattern already used for /signup,
  // /verify) — an authentication page has no independent search value.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginClient />;
}
