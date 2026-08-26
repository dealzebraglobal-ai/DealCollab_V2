import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import VideoBackground from '@/components/auth/VideoBackground';
import VideoLogo from '@/components/auth/VideoLogo';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How DealCollab collects, uses, and protects your information.',
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center px-4 py-10 overflow-y-auto relative">
      <VideoBackground />

      <div className="relative z-20 w-full max-w-4xl space-y-8 flex flex-col items-center">
        {/* Logo Section */}
        <Link href="/" className="flex flex-col items-center hover:opacity-90 transition-opacity animate-in fade-in slide-in-from-top-6 duration-1000">
          <VideoLogo />
          <div className="mt-6 text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-sm">DealCollab AI</h1>
            <p className="text-white/60 text-[10px] sm:text-xs mt-2.5 font-bold tracking-[0.3em] uppercase italic">
              INDIA&apos;S M&A INTELLIGENCE NETWORK
            </p>
          </div>
        </Link>

        {/* Content Card */}
        <div className="w-full bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-in fade-in zoom-in duration-700 relative">
          
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-brand-secondary hover:text-primary-hover transition-colors mb-6">
            <ArrowLeft size={16} />
            Back to Home
          </Link>

          <div className="space-y-2 text-center mb-8 border-b border-border pb-6">
            <h2 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Privacy <span className="text-primary-hover">Policy</span></h2>
            <p className="text-sm text-brand-secondary font-medium tracking-tight">Last updated: {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-a:text-primary-hover prose-strong:text-foreground">
            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">1. Information We Collect</h2>
            <p className="mb-4 text-brand-secondary">When you use DealCollab AI, especially via WhatsApp, we collect the following information:</p>
            <ul className="list-disc pl-6 mb-4 text-brand-secondary">
              <li>Your phone number (to communicate via WhatsApp).</li>
              <li>Messages you send to our WhatsApp bot.</li>
              <li>Basic profile information provided by WhatsApp.</li>
            </ul>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">2. How We Use Your Information</h2>
            <p className="mb-4 text-brand-secondary">We use the information we collect to:</p>
            <ul className="list-disc pl-6 mb-4 text-brand-secondary">
              <li>Provide, operate, and maintain our services.</li>
              <li>Process and complete transactions, and send you related information.</li>
              <li>Respond to your comments, questions, and requests and provide customer service.</li>
            </ul>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">3. WhatsApp Integration</h2>
            <p className="mb-4 text-brand-secondary">We use the official WhatsApp Business API. Messages are processed by Meta and our servers to provide you with AI-driven collaboration features. Please refer to Meta&apos;s privacy policy for how they handle data on their end.</p>

            <h2 id="data-deletion" className="text-xl font-bold mt-6 mb-2 text-foreground">4. Data Deletion</h2>
            <p className="mb-4 text-brand-secondary">If you wish to have your data deleted from our systems, you can request data deletion by contacting us at dealzebraglobal@gmail.com or by visiting our <Link href="/data-deletion" className="text-primary-hover hover:underline">Data Deletion Instructions page</Link>.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">5. Contact Us</h2>
            <p className="mb-4 text-brand-secondary">If you have any questions about this Privacy Policy, please contact us at: dealzebraglobal@gmail.com</p>
          </div>
        </div>
      </div>
    </main>
  );
}
