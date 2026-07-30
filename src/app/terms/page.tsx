import React from 'react';
import VideoBackground from '@/components/auth/VideoBackground';

export default function TermsOfService() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 py-10 overflow-y-auto relative">
      <VideoBackground />

      <div className="relative z-20 w-full max-w-4xl">
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-in fade-in zoom-in duration-700 relative max-h-[90vh] overflow-y-auto scrollbar-hide">
          <div className="space-y-2 text-center mb-8 border-b border-border pb-6">
            <h1 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Terms of <span className="text-primary-hover">Service</span></h1>
            <p className="text-sm text-brand-secondary font-medium tracking-tight">Last updated: {new Date().toLocaleDateString()}</p>
          </div>
          
          <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-a:text-primary-hover prose-strong:text-foreground">
            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">1. Acceptance of Terms</h2>
            <p className="mb-4 text-brand-secondary">By accessing and using DealCollab AI, you agree to be bound by these Terms of Service.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">2. Use of Service</h2>
            <p className="mb-4 text-brand-secondary">You agree to use the Service only for lawful purposes and in accordance with these Terms.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">3. WhatsApp Integration</h2>
            <p className="mb-4 text-brand-secondary">By using our WhatsApp bot, you agree to receive messages from DealCollab AI. Standard messaging rates may apply depending on your carrier.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">4. Disclaimer</h2>
            <p className="mb-4 text-brand-secondary">The materials on DealCollab AI's website and services are provided on an 'as is' basis. DealCollab AI makes no warranties, expressed or implied.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">5. Contact</h2>
            <p className="mb-4 text-brand-secondary">For any questions regarding these terms, contact dealzebraglobal@gmail.com.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
