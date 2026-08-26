import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  // Set as the full string rather than relying on the root layout's title
  // template — the "/" segment does not compose with the template the way
  // every other route in this app does (verified: /terms, /guide/[slug] all
  // template correctly; "/" alone renders the child title verbatim). This
  // may be related to the pre-existing duplicate page.tsx for "/" — both
  // src/app/page.tsx and src/app/(auth)/page.tsx compile as separate route
  // entries for the same path — but that's a routing question, not this
  // metadata's problem to solve. Hardcoding avoids depending on inheritance
  // that doesn't reliably apply here.
  title: 'Sign In | DealCollab AI',
  description: "Sign in to DealCollab — India's AI-powered M&A intelligence network.",
};

export default function Page() {
  return <HomeClient />;
}
