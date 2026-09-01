import type { Metadata } from 'next';
import WelcomeClient from './WelcomeClient';

export const metadata: Metadata = {
  title: "India's M&A Intelligence Network",
  description:
    'Accelerate deal sourcing, verify institutional identities, and analyze acquisition and fundraising opportunities with AI. Built for India\'s private market.',
};

export default function WelcomePage() {
  return <WelcomeClient />;
}
