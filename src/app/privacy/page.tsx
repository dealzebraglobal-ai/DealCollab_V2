import React from 'react';
import VideoBackground from '@/components/auth/VideoBackground';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 py-10 overflow-y-auto relative">
      <VideoBackground />

      <div className="relative z-20 w-full max-w-4xl">
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-in fade-in zoom-in duration-700 relative max-h-[90vh] overflow-y-auto scrollbar-hide">
          <div className="space-y-2 text-center mb-8 border-b border-border pb-6">
            <h1 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Privacy <span className="text-primary-hover">Policy</span></h1>
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
            <p className="mb-4 text-brand-secondary">We use the official WhatsApp Business API. Messages are processed by Meta and our servers to provide you with AI-driven collaboration features. Please refer to Meta's privacy policy for how they handle data on their end.</p>

            <h2 id="data-deletion" className="text-xl font-bold mt-6 mb-2 text-foreground">4. Data Deletion</h2>
            <p className="mb-4 text-brand-secondary">If you wish to have your data deleted from our systems, you can request data deletion by contacting us at dealzebraglobal@gmail.com or by visiting our <a href="/data-deletion" className="text-primary-hover hover:underline">Data Deletion Instructions page</a>.</p>

            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">5. Contact Us</h2>
            <p className="mb-4 text-brand-secondary">If you have any questions about this Privacy Policy, please contact us at: dealzebraglobal@gmail.com</p>
          </div>
        </div>
      </div>
    </main>
  );
}
