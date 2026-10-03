'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUser } from '../UserProvider';
import { 
  ChevronRight, ChevronLeft, Zap
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { UserProfile } from '../UserProvider';

// PRD-aligned validation and types
import { 
  STEPS, 
  INITIAL_FORM_DATA, 
  ProfileFormData, 
  validateStep, 
  isStepValid, 
  calculateProgress,
  END_USER_INTENT_OPTIONS
} from '@/lib/validation/profile';

// Sub-components
import MultiSelectChips from '@/components/profile-setup/MultiSelectChips';
import ProgressCircle from './ProgressCircle';
import ProgressBar from './ProgressBar';
import StepCard from './StepCard';
import AnimatedStepWrapper from './AnimatedStepWrapper';
import TagInput from './TagInput';
import AvatarUpload from './AvatarUpload';

interface ProfileStepperProps {
  onComplete: (showSuccess?: boolean) => void;
  initialData?: UserProfile | null;
}

export default function ProfileStepper({ onComplete, initialData }: ProfileStepperProps) {
  const { updateReadiness, setOnboarding, addTokens, refreshProfile } = useUser();
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProfileFormData>(INITIAL_FORM_DATA);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dbHydrated = useRef(false);
  const sessionHydrated = useRef(false);

  // Initialize form with initialData or session
  useEffect(() => {
    // Priority 1: Hydrate from Database (initialData)
    if (initialData && !dbHydrated.current) {
      dbHydrated.current = true;
      const comp = initialData.companyName || initialData.company_name || initialData.firmName || initialData.firm_name || '';
      setFormData(prev => ({
        ...prev,
        fullName: initialData.fullName || initialData.name || '',
        workEmail: initialData.email || '',
        phone: initialData.phone || '',
        companyName: comp,
        firmName: comp,
        website: initialData.website || '',
        primarySectors: initialData.sectors || [],
        currentFocus: initialData.currentFocus || initialData.intent || [],
        expertiseDescription: initialData.expertiseDescription || initialData.expertise_description || '',
        profileImage: initialData.profileImage || initialData.profile_image || '',
        termsAccepted: !!((initialData as { termsAccepted?: boolean; terms_accepted?: boolean }).termsAccepted || (initialData as { termsAccepted?: boolean; terms_accepted?: boolean }).terms_accepted),
      }));
    } 
    // Handle updates to initialData if it changes while mounted (e.g. after a save)
    else if (initialData && dbHydrated.current) {
      setFormData(prev => {
        const initialFocus = initialData.currentFocus || initialData.intent || [];
        if (prev.currentFocus.length === 0 && initialFocus.length > 0) {
          return { ...prev, currentFocus: initialFocus };
        }
        return prev;
      });
    }
    // Priority 2: Fallback to Session (if DB not yet hydrated)
    else if (session?.user && !dbHydrated.current && !sessionHydrated.current) {
      sessionHydrated.current = true;
      setFormData(prev => ({
        ...prev,
        fullName: session.user?.name || '',
        workEmail: session.user?.email || '',
        // @ts-expect-error - session.user is extended
        phone: session.user?.phone || '',
      }));
    }
  }, [session, initialData]);

  const progress = useMemo(() => calculateProgress(formData), [formData]);
  const currentErrors = useMemo(() => validateStep(currentStep, formData), [currentStep, formData]);
  const isValid = currentErrors.length === 0;

  const updateFormData = (data: Partial<ProfileFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const activeSteps = STEPS;
  const activeTotalSteps = STEPS.length;

  const handleNext = async () => {
    if (currentStep < activeTotalSteps) {
      setDirection('next');
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      await handleFinalSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setSubmitError(null);
      setDirection('back');
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Check consent status on mount to pre-fill termsAccepted if already accepted
  useEffect(() => {
    fetch('/api/consent/status')
      .then(res => res.json())
      .then(data => {
        if (data?.accepted === true) {
          setFormData(prev => ({ ...prev, termsAccepted: true }));
        }
      })
      .catch(() => {});
  }, []);

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Handle Avatar Upload if present
      let finalProfileImage = formData.profileImage;
      
      if (formData.avatarFile) {
        const { createSupabaseClient } = await import('@/utils/supabase/client');
        const supabase = createSupabaseClient();
        if (!supabase) throw new Error('Could not initialize storage client');

        const signedRes = await fetch(`/api/profile/upload/signed-url?file=${encodeURIComponent(formData.avatarFile.name)}&type=${encodeURIComponent(formData.avatarFile.type)}&bucket=avatars`);
        const { uploadUrl, path, error: signedError } = await signedRes.json();
        if (!signedRes.ok) throw new Error(signedError || 'Failed to get avatar upload permission');

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: formData.avatarFile,
          headers: { 'Content-Type': formData.avatarFile.type }
        });
        if (!uploadRes.ok) throw new Error('Avatar upload failed');

        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        finalProfileImage = urlData.publicUrl;
      }

      const { attachmentFile: _unused, avatarFile: _unused2, profileImage: _old, ...submitData } = formData;
      void _unused;
      void _unused2;
      void _old;
      
      let response: Response;
      try {
        response = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...submitData,
            companyName: submitData.companyName || submitData.firmName,
            firmName: submitData.companyName || submitData.firmName,
            profileImage: finalProfileImage,
            currentFocus: (submitData.currentFocus && submitData.currentFocus.length > 0)
              ? submitData.currentFocus
              : undefined
          }),
        });
      } catch {
        throw new Error('Profile submission failed: network error. Please check your connection and try again.');
      }

      const contentType = response.headers.get('content-type') || '';
      const result = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

      if (!response.ok) {
        const backendMessage = result?.errors?.[0]?.message || result?.error;
        const statusMessage =
          response.status === 401 ? 'your session has expired — please sign in again.' :
          response.status === 403 ? 'you do not have permission to update this profile.' :
          response.status === 404 ? 'your user account could not be found.' :
          response.status === 409 ? 'this profile was updated elsewhere — please refresh and try again.' :
          response.status === 429 ? 'too many attempts — please wait a moment and try again.' :
          response.status >= 500 ? 'the server had a problem saving your profile. Please try again.' :
          'please check your details and try again.';
        throw new Error(`Profile submission failed: ${backendMessage || statusMessage}`);
      }
      if (!result) {
        throw new Error('Profile submission failed: received an unexpected response from the server.');
      }

      // Update local state and readiness
      updateReadiness('identity', 35);
      updateReadiness('expertise', 35);
      updateReadiness('additional', 30);

      // Only show the 100 free tokens success screen if user was genuinely rewarded this time
      const isRewardedOrSuccess = !!(
        result.rewarded || 
        result.shouldShowSuccess
      );
      if (result.rewarded) {
        addTokens(100);
      }

      // CRITICAL: Trigger onComplete/success screen FIRST before backgrounding profile refresh
      onComplete(isRewardedOrSuccess);

      // Refresh global profile state and set onboarding in background
      await refreshProfile();
      setOnboarding('profileCompleted', true);
    } catch (error: unknown) {
      console.error("[ProfileStepper] submission failed:", error);
      const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const userMessage = rawMessage.startsWith('Profile submission failed:')
        ? rawMessage
        : 'Profile submission failed: something went wrong. Please try again.';
      setSubmitError(userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between w-full min-h-[calc(100vh-140px)]">
      <div className="max-w-7xl w-full mx-auto px-6 pt-8 pb-12 flex-1">
        <div className="flex flex-col lg:flex-row gap-12 items-start relative">
        
        {/* LEFT SIDEBAR - Progress Panel */}
        <div className="w-full lg:w-[320px] lg:sticky lg:top-24 z-30">
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <ProgressCircle progress={progress} size={60} strokeWidth={4} />
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Overall Progress</span>
                <div className="text-2xl font-black text-foreground tabular-nums">{progress}%</div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <span className="text-sm font-black text-foreground">Journey Progress</span>
                <span className="text-[10px] font-black text-brand-secondary">Step {currentStep}/{activeTotalSteps}</span>
              </div>
              <ProgressBar progress={progress} />
            </div>
 
            <nav className="space-y-2 pt-4 border-t border-gray-50">
              {activeSteps.map((step) => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                
                return (
                  <div 
                    key={step.id}
                    onClick={() => {
                      if (step.id < currentStep || (step.id > currentStep && isStepValid(currentStep, formData))) {
                        setDirection(step.id > currentStep ? 'next' : 'back');
                        setCurrentStep(step.id);
                      }
                    }}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all cursor-pointer hover:bg-gray-50 ${
                      isActive 
                        ? 'bg-brand-accent/5 text-brand-accent' 
                        : isCompleted 
                          ? 'text-foreground/40' 
                          : 'text-brand-secondary/30'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      isActive 
                        ? 'bg-brand-accent animate-pulse' 
                        : isCompleted 
                          ? 'bg-green-500' 
                          : 'bg-gray-200'
                    }`} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{step.label}</span>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* RIGHT CONTENT - Main Form */}
        <div className="flex-1 w-full max-w-3xl min-h-[600px]">
          <div className="transition-all duration-500">
            
            {/* STEP 1: BASIC IDENTITY */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 1}>
              <StepCard title="Basic Identity" helper="Establish your identity within the network">
                <div className="space-y-8">
                  <AvatarUpload 
                    file={formData.avatarFile}
                    existingUrl={formData.profileImage}
                    onFileSelect={(file) => {
                      if (file === null) {
                        updateFormData({ avatarFile: null, profileImage: '' });
                      } else {
                        updateFormData({ avatarFile: file });
                      }
                    }}
                  />
 
                  <div className="grid grid-cols-1 gap-6">
                    <InputGroup label="Full Name">
                      <input 
                        type="text" 
                        value={formData.fullName} 
                        onChange={e => updateFormData({ fullName: e.target.value })} 
                        className="input-premium" 
                        placeholder="Legal Name" 
                      />
                    </InputGroup>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Work Email">
                        <input 
                          type="email" 
                          value={formData.workEmail} 
                          onChange={e => updateFormData({ workEmail: e.target.value })} 
                          className="input-premium" 
                          placeholder="name@firm.com" 
                        />
                      </InputGroup>
                      <InputGroup label="Phone Number (Optional)">
                        <input 
                          type="tel" 
                          value={formData.phone} 
                          onChange={e => updateFormData({ phone: e.target.value })} 
                          className="input-premium" 
                          placeholder="+91 00000 00000" 
                        />
                      </InputGroup>
                    </div>
 
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Company / Business Name">
                        <input 
                          type="text" 
                          value={formData.companyName} 
                          onChange={e => updateFormData({ companyName: e.target.value, firmName: e.target.value })} 
                          className="input-premium" 
                          placeholder="e.g. Acme Corp" 
                        />
                      </InputGroup>
                      <InputGroup label="Business Website">
                        <input 
                          type="text" 
                          value={formData.website} 
                          onChange={e => updateFormData({ website: e.target.value })} 
                          className="input-premium" 
                          placeholder="e.g. https://acme.com" 
                        />
                      </InputGroup>
                    </div>
                  </div>
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 2: BUSINESS DETAILS */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 2}>
              <StepCard title="Business Details" helper="Specify your industry, goals, and description">
                <div className="space-y-10">
                  <TagInput 
                    label="Primary Industry Sectors (Optional)" 
                    tags={formData.primarySectors} 
                    onChange={(tags) => updateFormData({ primarySectors: tags })} 
                    maxTags={5}
                    placeholder="e.g. Food, Pharma, Solar..."
                    helperText="Press Enter or comma to add a sector. Max 5 allowed."
                  />
 
                  <MultiSelectChips 
                    label="What are you looking for? (Select all that apply)" 
                    options={[...END_USER_INTENT_OPTIONS]} 
                    selected={formData.currentFocus} 
                    onChange={(selected: string[]) => updateFormData({ currentFocus: selected })} 
                    grid
                  />
 
                  <InputGroup label="Briefly describe your requirement (Optional)">
                    <textarea 
                      value={formData.expertiseDescription} 
                      onChange={e => updateFormData({ expertiseDescription: e.target.value })} 
                      rows={6} 
                      className="textarea-premium" 
                      placeholder="e.g. Looking to raise capital, strategic acquisition, or business expansion..." 
                    />
                    <div className="flex justify-between mt-1 px-1">
                      <p className="text-[10px] text-brand-secondary font-medium">Please be as descriptive as possible.</p>
                      {formData.expertiseDescription.trim().length > 0 && (
                        <span className="text-[10px] font-bold text-gray-500">
                          {formData.expertiseDescription.length} characters
                        </span>
                      )}
                    </div>
                  </InputGroup>
                </div>
              </StepCard>
            </AnimatedStepWrapper>
 
            {/* STEP 3: TERMS AND CONDITIONS */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 3}>
              <StepCard title="Terms and Conditions" helper="Please confirm your agreement to activate your profile">
                <div className="space-y-6 pt-2">
                  <label className="flex items-start gap-4 p-6 rounded-2xl bg-[#fffaf3] border border-[#FFE4B5] transition-all cursor-pointer hover:border-[#FFA000]">
                    <input
                      type="checkbox"
                      checked={formData.termsAccepted}
                      onChange={e => updateFormData({ termsAccepted: e.target.checked })}
                      className="mt-1 w-5 h-5 accent-[#FFA000] rounded cursor-pointer shrink-0"
                    />
                    <span className="text-xs font-semibold leading-relaxed text-[#0B1B2B]">
                      I agree to DealCollab&rsquo;s{' '}
                      <a href="/guide/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline text-[#F97316] font-bold hover:text-[#FFA000]">
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a href="/guide/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline text-[#F97316] font-bold hover:text-[#FFA000]">
                        Privacy Policy
                      </a>
                      . I understand that sending an EOI costs tokens and reveals my
                      verified contact details to the counterparty on approval, that
                      tokens are non-refundable, and that DealCollab does not guarantee
                      any match or verify the claims counterparties make.
                    </span>
                  </label>
                </div>
              </StepCard>
            </AnimatedStepWrapper>

          </div>
        </div>
      </div>
    </div>

      {/* STICKY FOOTER NAVIGATION - ALWAYS DOCKED AT THE BOTTOM */}
      <div className="sticky bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-xl border-t border-gray-200 py-4 px-6 z-40 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] mt-auto">
        {submitError && (
          <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between gap-4 px-5 py-3 rounded-2xl bg-red-50 border border-red-100">
            <p className="text-xs font-bold text-red-600">{submitError}</p>
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="shrink-0 px-4 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Retrying…' : 'Try Again'}
            </button>
          </div>
        )}
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button 
            onClick={handleBack} 
            disabled={currentStep === 1 || isSubmitting} 
            className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 ${currentStep === 1 ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white border-brand-accent/20 text-brand-accent hover:bg-brand-accent/5'}`}
          >
            <ChevronLeft size={18} /> Back
          </button>

          <div className="flex flex-col items-center gap-1">
            {currentErrors.length > 0 && (
              <span className="text-[10px] font-black text-brand-accent uppercase animate-pulse">{currentErrors[0].message}</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {progress === 100 && currentStep < activeTotalSteps && (
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 border-green-100 text-green-600 hover:bg-green-50 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting…' : 'Finalize & Skip'} <Zap size={14} className="fill-green-600" />
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={!isValid || isSubmitting}
              className={`flex items-center gap-4 px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all ${isValid ? 'bg-[#0B1B2B] text-white hover:bg-brand-accent' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : currentStep === activeTotalSteps ? <>Finalize Profile <Zap size={16} className="fill-white" /></> : <>Next Step <ChevronRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .input-premium {
          width: 100%;
          background-color: #fffaf3;
          border: 1px solid #FFE4B5;
          border-radius: 16px;
          padding: 1rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          transition: all 0.2s;
          outline: none;
        }
        .input-premium:focus {
          border-color: #FFA000;
          box-shadow: 0 0 0 4px rgba(255, 160, 0, 0.1);
        }
        .input-premium::placeholder {
          color: #FFE4B5;
        }
        .textarea-premium {
          width: 100% !important;
          background-color: #fffaf3;
          border: 1px solid #FFE4B5;
          border-radius: 16px;
          padding: 1rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          transition: all 0.2s;
          outline: none;
          resize: none;
          min-height: 120px;
        }
        .textarea-premium:focus {
          border-color: #FFA000;
          box-shadow: 0 0 0 4px rgba(255, 160, 0, 0.1);
        }
        .textarea-premium::placeholder {
          color: #FFE4B5;
        }
      `}</style>
    </div>
  );
}

function InputGroup({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-3 w-full relative">
      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-secondary ml-2 opacity-70 block">{label}</label>
      <div className="relative group">
        {children}
      </div>
    </div>
  );
}
