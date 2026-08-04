'use client';
import React, { useState, Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/components/UserProvider';
import VideoBackground from '@/components/auth/VideoBackground';
import VideoLogo from '@/components/auth/VideoLogo';
import GoogleAuthButton from '@/components/auth/GoogleAuthButton';
import PhoneVerification from '@/components/auth/PhoneVerification';
import EmailVerification from '@/components/auth/EmailVerification';
import EmailOtpVerification from '@/components/auth/EmailOtpVerification';
import { ShieldCheck, Sparkles, Mail } from 'lucide-react';

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

function AuthContent() {
  const searchParams = useSearchParams();
  const { login, setOnboarding } = useUser();
  
  const source = searchParams.get('source') || 'web'; 
  const error = searchParams.get('error');
  const logoutSuccess = searchParams.get('logout') === 'success';
  const isFromWhatsApp = source === 'whatsapp';

  const [step, setStep] = useState<'google' | 'email' | 'otp' | 'phone' | 'verified'>('google');
  const [pendingEmail, setPendingEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { status, data: session } = useSession();

  // Onboarding logic: If authenticated but missing phone, skip to phone step
  useEffect(() => {
    if (status === 'authenticated' && step === 'google') {
      interface CustomUser { phone?: string };
      const hasPhone = (session?.user as CustomUser)?.phone;
      
      Promise.resolve().then(() => {
        if (!hasPhone) {
          setStep('phone');
        } else {
          setStep('verified');
          const timer = setTimeout(() => {
            window.location.href = '/home';
          }, 800);
          return () => clearTimeout(timer);
        }
      });
    }
  }, [status, session, step]);

  const handleGoogleSuccess = async () => {
    setIsLoading(true);
    const { signIn } = await import('next-auth/react');
    
    // In production, we trigger the real NextAuth flow
    // If it's from WhatsApp, we ensure the source is passed so callbacks can handle it
    await signIn('google', { 
      callbackUrl: isFromWhatsApp ? '/home?source=whatsapp' : '/home',
      redirect: true 
    });
  };

  const handlePhoneSuccess = () => {
    setOnboarding('phoneVerified', true);
    handleFinalAuth();
  };

  const handleEmailSent = (email: string) => {
    setPendingEmail(email);
    setStep('otp');
  };

  const handleEmailOtpSuccess = () => {
    handleFinalAuth();
  };

  const handleFinalAuth = () => {
    login();
    setStep('verified');
    
    // Instant session-aware redirect
    if (typeof window !== 'undefined') {
      window.location.href = '/home';
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
      <VideoBackground />

      <div className="relative z-20 space-y-8">
        {/* Logo Section */}
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-1000">
          <VideoLogo />
          <div className="mt-6 text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-sm">DealCollab AI</h1>
            <p className="text-white/60 text-sm mt-1.5 font-medium tracking-wide tracking-widest uppercase italic">INDIA&apos;S M&A INTELLIGENCE NETWORK</p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/20 animate-in fade-in zoom-in duration-700">
          
          {error && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
               <div className="bg-orange-500/10 p-1.5 rounded-lg text-orange-600">
                  <ShieldCheck size={18} />
               </div>
               <p className="text-sm font-bold text-orange-700 leading-tight">
                  {error === 'session_expired' ? 'Session expired. Please sign in again' : 'Access link has expired'}
               </p>
            </div>
          )}

          {logoutSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
               <div className="bg-green-500/10 p-1.5 rounded-lg text-green-600">
                  <ShieldCheck size={18} />
               </div>
               <p className="text-sm font-bold text-green-700 leading-tight">
                  Logged out successfully
               </p>
            </div>
          )}
          <AnimatePresence mode="wait">
            {step === 'google' && (
              <motion.div
                key="google"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="space-y-2 text-center pb-2">
                  <h2 className="text-xl font-bold text-[#1F2937]">Secure Access</h2>
                  <p className="text-sm text-gray-500 font-medium tracking-tight">Verified connections for deal sourcing</p>
                </div>

                {isFromWhatsApp && (
                  <div className="bg-green-50/80 border border-green-100/50 p-3.5 rounded-2xl flex items-center gap-3 mb-4">
                    <div className="bg-green-500 text-white p-1 rounded-full animate-pulse">
                      <ShieldCheck size={14} />
                    </div>
                    <p className="text-[10px] font-bold text-green-700 leading-tight uppercase tracking-wider">
                      WhatsApp Identity Verified
                    </p>
                  </div>
                )}

                <GoogleAuthButton
                  onClick={handleGoogleSuccess}
                  isLoading={isLoading}
                />

                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-gray-100" />
                  <span className="mx-3 text-[10px] font-bold text-gray-300 uppercase tracking-widest">or</span>
                  <div className="flex-grow border-t border-gray-100" />
                </div>

                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="w-full bg-white text-[#1F2937] py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 border border-[#E5E7EB] hover:bg-gray-50 transition-all active:scale-[0.98] shadow-sm hover:shadow-md group"
                >
                  <Mail size={18} className="text-gray-400 group-hover:text-[#F97316] transition-colors" />
                  <span className="font-semibold tracking-tight">Sign in with Email</span>
                </button>

                <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest pt-4 opacity-50">
                  Institutional Grade Security
                </p>

                <div className="pt-2 text-center space-y-1">
                  <p className="text-[10px] text-gray-400 font-medium">Lost access to your Google account?</p>
                  <a
                    href="mailto:support@dealcollab.in"
                    className="text-[10px] font-bold text-[#F97316] hover:underline"
                  >
                    Email support@dealcollab.in
                  </a>
                </div>
              </motion.div>
            )}

            {step === 'email' && (
              <motion.div
                key="email"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <EmailVerification
                  initialEmail={pendingEmail}
                  onSent={handleEmailSent}
                  onBack={() => setStep('google')}
                />
              </motion.div>
            )}

            {step === 'otp' && (
              <motion.div
                key="otp"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <EmailOtpVerification
                  email={pendingEmail}
                  onVerify={handleEmailOtpSuccess}
                  onBack={() => setStep('email')}
                />
              </motion.div>
            )}

            {step === 'phone' && (
              <motion.div
                key="phone"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <PhoneVerification
                  onVerify={handlePhoneSuccess}
                  onBack={() => setStep('google')}
                />
              </motion.div>
            )}

            {step === 'verified' && (
              <motion.div
                key="verified"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center py-8 space-y-6"
              >
                <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-green-500/20">
                  <ShieldCheck size={32} />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-bold text-[#1F2937]">Access Granted</h2>
                  <p className="text-sm text-gray-500 italic">Initializing Deal Room...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Meta */}
        <div className="flex justify-center gap-6 text-[10px] font-bold text-white/40 uppercase tracking-[0.25em] animate-in fade-in duration-1000 delay-500">
           <div className="flex items-center gap-1.5">
             <Sparkles size={12} className="text-[#F97316]" />
             <span>AI Verified</span>
           </div>
           <span className="opacity-30">|</span>
           <span>Privacy Shield</span>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
