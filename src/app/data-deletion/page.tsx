import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import VideoBackground from '@/components/auth/VideoBackground';
import VideoLogo from '@/components/auth/VideoLogo';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Data Deletion',
  description: 'How to request deletion of your DealCollab account and data.',
};

export default function DataDeletion() {
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
            <h2 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Data Deletion <span className="text-primary-hover">Instructions</span></h2>
          </div>
          
          <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-a:text-primary-hover prose-strong:text-foreground">
            <p className="mb-4 text-brand-secondary">At DealCollab AI, we respect your privacy and your right to control your personal data.</p>
            
            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">How to Delete Your Data</h2>
            <p className="mb-4 text-brand-secondary">If you have used our services (including our WhatsApp bot) and would like your data to be permanently deleted from our servers, you can do so by following these steps:</p>
            
            <ol className="list-decimal pl-6 mb-4 text-brand-secondary">
              <li className="mb-2">Send an email to <strong>dealzebraglobal@gmail.com</strong>.</li>
              <li className="mb-2">Use the subject line: <strong>&quot;Data Deletion Request&quot;</strong>.</li>
              <li className="mb-2">In the body of the email, please include the phone number you used to interact with our WhatsApp bot and any email address associated with your account.</li>
            </ol>

            <p className="mb-4 text-brand-secondary">Upon receiving your request, we will process it within 7 business days and permanently remove your information from our active databases.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">Data We Delete</h2>
            <ul className="list-disc pl-6 mb-4 text-brand-secondary">
              <li>Your phone number</li>
              <li>Your conversation history with our AI bot</li>
              <li>Any associated account information on DealCollab AI</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
