'use client';
import React from 'react';
import Link from 'next/link';
import VideoBackground from '@/components/auth/VideoBackground';
import VideoLogo from '@/components/auth/VideoLogo';
import GoogleAuthButton from '@/components/auth/GoogleAuthButton';
import { Sparkles } from 'lucide-react';

export default function SignupPage() {
  const handleSignup = () => {
    // Simulator
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4">
      <VideoBackground />

      <div className="relative z-20 space-y-8">
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-1000">
          <VideoLogo />
          <div className="mt-6 text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">Join DealCollab AI</h1>
            <p className="text-white/60 text-sm mt-1.5 uppercase tracking-widest italic">INDIA&apos;S M&A INTELLIGENCE NETWORK</p>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-2xl border border-white/20">
          <div className="space-y-6">
            <div className="space-y-2 text-center pb-2">
              <h2 className="text-xl font-bold text-[#1F2937]">Create Institutional Account</h2>
              <p className="text-sm text-gray-500 font-medium">Get exclusive access to verified deal flow</p>
            </div>

            <GoogleAuthButton 
              onClick={handleSignup} 
              isLoading={false} 
            />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-gray-400">
                <span className="bg-white px-2">Secure Verification</span>
              </div>
            </div>

            <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest pt-2">
              Institutional Grade Security
            </p>

            <div className="pt-4 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/login" className="text-[#F97316] font-bold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-6 text-[10px] font-bold text-white/40 uppercase tracking-[0.25em]">
           <div className="flex items-center gap-1.5">
             <Sparkles size={12} className="text-[#F97316]" />
             <span>AI Verified</span>
           </div>
           <span className="opacity-30">|</span>
           <span>Privacy Shield</span>
        </div>
      </div>
    </main>
  );
}
