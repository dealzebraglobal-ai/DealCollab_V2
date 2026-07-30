import React from 'react';
import VideoBackground from '@/components/auth/VideoBackground';

export default function DataDeletion() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 py-10 overflow-y-auto relative">
      <VideoBackground />

      <div className="relative z-20 w-full max-w-4xl">
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-in fade-in zoom-in duration-700 relative max-h-[90vh] overflow-y-auto scrollbar-hide">
          <div className="space-y-2 text-center mb-8 border-b border-border pb-6">
            <h1 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Data Deletion <span className="text-primary-hover">Instructions</span></h1>
          </div>
          
          <div className="prose prose-slate max-w-none prose-headings:text-foreground prose-a:text-primary-hover prose-strong:text-foreground">
            <p className="mb-4 text-brand-secondary">At DealCollab AI, we respect your privacy and your right to control your personal data.</p>
            
            <h2 className="text-xl font-bold mt-6 mb-2 text-foreground">How to Delete Your Data</h2>
            <p className="mb-4 text-brand-secondary">If you have used our services (including our WhatsApp bot) and would like your data to be permanently deleted from our servers, you can do so by following these steps:</p>
            
            <ol className="list-decimal pl-6 mb-4 text-brand-secondary">
              <li className="mb-2">Send an email to <strong>dealzebraglobal@gmail.com</strong>.</li>
              <li className="mb-2">Use the subject line: <strong>"Data Deletion Request"</strong>.</li>
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
