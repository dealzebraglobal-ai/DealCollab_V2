'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUser } from '../UserProvider';
import { 
  Globe, 
  ChevronRight, ChevronLeft, Sparkles, Zap
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { UserProfile } from '../UserProvider';

// PRD-aligned validation and types
import { 
  STEPS, 
  TOTAL_STEPS, 
  INITIAL_FORM_DATA, 
  ProfileFormData, 
  validateStep, 
  isStepValid, 
  calculateProgress,
  ROLE_OPTIONS,
  PROFESSIONAL_CATEGORY_OPTIONS,
  GEOGRAPHY_OPTIONS,
  CORRIDOR_OPTIONS,
  INTENT_OPTIONS,
  MANDATE_OPTIONS,
  COLLABORATION_MODEL_OPTIONS
} from '@/lib/validation/profile';

// Sub-components
import MultiSelectChips from '@/components/profile-setup/MultiSelectChips';
import ProgressCircle from './ProgressCircle';
import ProgressBar from './ProgressBar';
import StepCard from './StepCard';
import AnimatedStepWrapper from './AnimatedStepWrapper';
import TagInput from './TagInput';
import FileUpload from './FileUpload';
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
  const dbHydrated = useRef(false);
  const sessionHydrated = useRef(false);

  // Initialize form with initialData or session
  useEffect(() => {
    // Priority 1: Hydrate from Database (initialData)
    if (initialData && !dbHydrated.current) {
      dbHydrated.current = true;
      setFormData(prev => ({
        ...prev,
        fullName: initialData.fullName || initialData.name || '',
        workEmail: initialData.email || '',
        phone: initialData.phone || '',
        firmName: initialData.firmName || initialData.firm_name || '',
        role: initialData.role || '',
        customRole: initialData.customRole || initialData.custom_role || '',
        professionalCategory: initialData.category || [],
        customCategory: initialData.customCategory || initialData.custom_category || '',
        baseCity: initialData.baseCity || initialData.base_city || '',
        baseCountry: initialData.baseCountry || initialData.base_country || '',
        activeGeographies: initialData.geographies || [],
        crossBorder: initialData.crossBorder || initialData.cross_border || false,
        corridors: initialData.corridors || [],
        primarySectors: initialData.sectors || [],
        currentFocus: initialData.currentFocus || initialData.intent || [],
        expertiseDescription: initialData.expertiseDescription || initialData.expertise_description || '',
        activeMandates: initialData.activeMandates || initialData.active_mandates || [],
        coAdvisory: initialData.coAdvisory || initialData.co_advisory || false,
        collaborationModels: initialData.collaborationModels || initialData.collaboration_model || [],
        attachmentUrl: initialData.profileAttachmentUrl || initialData.profile_attachment_url || '',
        profileImage: initialData.profileImage || initialData.profile_image || '',
        additionalInfo: initialData.additionalInfo || initialData.additional_info || '',
      }));
    } 
    // Handle updates to initialData if it changes while mounted (e.g. after a save)
    else if (initialData && dbHydrated.current) {
      setFormData(prev => {
        // Only update if currentFocus is empty in form but present in initialData
        const initialFocus = initialData.currentFocus || initialData.intent || [];
        if (prev.currentFocus.length === 0 && initialFocus.length > 0) {
          return { ...prev, currentFocus: initialFocus };
        }
        return prev;
      });
    }    // Priority 2: Fallback to Session (if DB not yet hydrated)
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

  const handleNext = async () => {
    if (currentStep < TOTAL_STEPS) {
      setDirection('next');
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      await handleFinalSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
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
    try {
      // 0. Submit Terms Acceptance if step 9 is checked
      if (formData.termsAccepted) {
        try {
          const consentRes = await fetch('/api/consent/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accepted: true }),
          });
          const consentData = await consentRes.json().catch(() => ({}));
          if (!consentRes.ok) {
            console.warn('[ProfileStepper] Terms acceptance warning:', consentData?.message || consentData?.error);
          }
        } catch (consentErr) {
          console.error('[ProfileStepper] Terms acceptance network error:', consentErr);
        }
      }

      // 1. Handle File Upload if present (Direct to Supabase via Signed URL)
      let attachmentUrl = formData.attachmentUrl;
      if (formData.attachmentFile) {
        // A. Get Signed URL from our backend
        const signedRes = await fetch(`/api/profile/upload/signed-url?file=${encodeURIComponent(formData.attachmentFile.name)}&type=${encodeURIComponent(formData.attachmentFile.type)}`);
        const { uploadUrl, path, error: signedError } = await signedRes.json();
        
        if (!signedRes.ok) throw new Error(signedError || 'Failed to get upload permission');

        // B. Upload directly to Supabase (Bypasses Vercel 4.5MB limit)
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: formData.attachmentFile,
          headers: { 'Content-Type': formData.attachmentFile.type }
        });

        if (!uploadRes.ok) throw new Error('Direct upload to storage failed');

        // C. Get the public URL
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-attachments/${path}`;
        attachmentUrl = publicUrl;
      }

      // 2. Handle Avatar Upload if present
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

        // Use the supabase client to get the public URL safely
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        finalProfileImage = urlData.publicUrl;
        console.log("Uploaded Image URL:", finalProfileImage);
      }

      const { attachmentFile: _unused, avatarFile: _unused2, profileImage: _old, ...submitData } = formData;
      void _unused;
      void _unused2;
      void _old;
      
      console.log('[ProfileStepper] SUBMITTING PROFILE DATA:', {
        profile_image: finalProfileImage,
        is_google_url: finalProfileImage?.includes('googleusercontent.com')
      });
      
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...submitData, 
          attachmentUrl, 
          profileImage: finalProfileImage, // Ensure we use the NEW one
          // Step 5: Prevent empty array overwrite
          currentFocus: (submitData.currentFocus && submitData.currentFocus.length > 0) 
            ? submitData.currentFocus 
            : undefined
        }),
      });
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.errors?.[0]?.message || 'Submission failed');

      // CRITICAL: Refresh global profile state to show new avatar
      await refreshProfile();
      
      console.log('[ProfileStepper] Submission successful. Profile refreshed.', {
        profile_image_saved: finalProfileImage,
        response: result
      });

      // Update local state and rewards
      updateReadiness('identity', 20);
      updateReadiness('geography', 15);
      updateReadiness('expertise', 15);
      updateReadiness('intent', 15);
      updateReadiness('collaboration', 15);
      updateReadiness('additional', 20);

      if (result.rewarded) addTokens(100);
      setOnboarding('profileCompleted', true);
      onComplete(result.shouldShowSuccess);
    } catch (error: unknown) {
      console.error("FULL ERROR:", error);
      console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
      const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
      alert(errorMessage || 'Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-48">
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
                <span className="text-[10px] font-black text-brand-secondary">Step {currentStep}/{TOTAL_STEPS}</span>
              </div>
              <ProgressBar progress={progress} />
            </div>

            <nav className="space-y-2 pt-4 border-t border-gray-50">
              {STEPS.map((step) => {
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
              <StepCard title="Basic Identity" helper="Establish your professional identity within the network">
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
                      <input type="text" value={formData.fullName} onChange={e => updateFormData({ fullName: e.target.value })} className="input-premium" placeholder="Legal Name" />
                    </InputGroup>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Work Email">
                        <input type="email" value={formData.workEmail} onChange={e => updateFormData({ workEmail: e.target.value })} className="input-premium" placeholder="name@firm.com" />
                      </InputGroup>
                      <InputGroup label="Phone Number">
                        <input type="tel" value={formData.phone} onChange={e => updateFormData({ phone: e.target.value })} className="input-premium" placeholder="+91 00000 00000" />
                      </InputGroup>
                    </div>

                    <InputGroup label="Firm / Organization Name (Optional)">
                      <input type="text" value={formData.firmName} onChange={e => updateFormData({ firmName: e.target.value })} className="input-premium" placeholder="Company Name" />
                    </InputGroup>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Your Role">
                        <select value={formData.role} onChange={e => updateFormData({ role: e.target.value })} className="input-premium cursor-pointer">
                          <option value="">Select your role</option>
                          {ROLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </InputGroup>
                      {formData.role === 'Other' && (
                        <InputGroup label="Specify Role">
                          <input type="text" value={formData.customRole} onChange={e => updateFormData({ customRole: e.target.value })} className="input-premium" placeholder="Enter your role" />
                        </InputGroup>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <MultiSelectChips 
                      label="Professional Category"
                      options={[...PROFESSIONAL_CATEGORY_OPTIONS]}
                      selected={formData.professionalCategory}
                      onChange={(selected: string[]) => updateFormData({ professionalCategory: selected })}
                      grid
                    />
                    {formData.professionalCategory.includes("Other") && (
                      <InputGroup label="Specify Category">
                        <input type="text" value={formData.customCategory} onChange={e => updateFormData({ customCategory: e.target.value })} className="input-premium" placeholder="Your specific professional title" />
                      </InputGroup>
                    )}
                  </div>
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 2: GEOGRAPHY & COVERAGE */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 2}>
              <StepCard title="Geography & Coverage" helper="Define your operational deal-making jurisdictions">
                <div className="space-y-10">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="City">
                        <input type="text" value={formData.baseCity} onChange={e => updateFormData({ baseCity: e.target.value })} className="input-premium" placeholder="e.g. Dubai" />
                      </InputGroup>
                      <InputGroup label="Country">
                        <input type="text" value={formData.baseCountry} onChange={e => updateFormData({ baseCountry: e.target.value })} className="input-premium" placeholder="e.g. UAE" />
                      </InputGroup>
                    </div>
                  </div>

                  <MultiSelectChips 
                    label="Active Deal Geographies" 
                    options={[...GEOGRAPHY_OPTIONS]} 
                    selected={formData.activeGeographies} 
                    onChange={(selected: string[]) => updateFormData({ activeGeographies: selected })} 
                  />

                  <div className="group">
                    <button 
                      type="button"
                      onClick={() => updateFormData({ crossBorder: !formData.crossBorder })}
                      className={`w-full flex items-center justify-between p-8 rounded-[32px] border-2 transition-all duration-300 ${
                        formData.crossBorder ? 'bg-brand-accent/5 border-brand-accent shadow-lg' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className={`p-3 rounded-2xl ${formData.crossBorder ? 'bg-brand-accent text-white' : 'bg-white text-gray-400'}`}>
                          <Globe size={20} />
                        </div>
                        <div>
                          <span className="block text-sm font-black text-foreground uppercase tracking-tight">Handle Cross-border Deals?</span>
                          <span className="block text-[11px] text-brand-secondary font-medium mt-0.5">Show international capital corridors</span>
                        </div>
                      </div>
                      <div className={`toggle-switch ${formData.crossBorder ? 'active' : ''}`}><div className="toggle-knob" /></div>
                    </button>
                  </div>

                  {formData.crossBorder && (
                    <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                      <MultiSelectChips 
                        label="Key Corridors" 
                        options={[...CORRIDOR_OPTIONS]} 
                        selected={formData.corridors} 
                        onChange={(selected: string[]) => updateFormData({ corridors: selected })}
                        grid
                      />
                      {formData.corridors.includes('Other') && (
                        <InputGroup label="Specify Corridor">
                          <input type="text" value={formData.customCorridor} onChange={e => updateFormData({ customCorridor: e.target.value })} className="input-premium" placeholder="e.g. India ↔ Germany" />
                        </InputGroup>
                      )}
                    </div>
                  )}
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 3: EXPERTISE & DEAL CAPABILITY */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 3}>
              <StepCard title="Expertise & Deal Capability" helper="Specify your primary industry sectors">
                <TagInput 
                  label="Primary Industry Sectors" 
                  tags={formData.primarySectors} 
                  onChange={(tags) => updateFormData({ primarySectors: tags })} 
                  maxTags={5}
                  placeholder="e.g. Food, Pharma, Solar..."
                  helperText="Press Enter or comma to add a sector. Max 5 allowed."
                />
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 4: CURRENT INTENT */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 4}>
              <StepCard title="Current Intent" helper="What describes your current deal-making focus?">
                <div className="space-y-10">
                  <MultiSelectChips 
                    label="Current Focus (Max 3)" 
                    options={[...INTENT_OPTIONS]} 
                    selected={formData.currentFocus} 
                    onChange={(selected: string[]) => updateFormData({ currentFocus: selected })} 
                    maxSelections={3}
                    grid
                  />
                  <InputGroup label="What expertise do you bring to the network?">
                    <textarea 
                      value={formData.expertiseDescription} 
                      onChange={e => updateFormData({ expertiseDescription: e.target.value })} 
                      rows={6} 
                      className="textarea-premium" 
                      placeholder="Minimum 60 characters..." 
                    />
                    <div className="flex justify-between mt-1 px-1">
                      <p className="text-[10px] text-brand-secondary font-medium">Replaces Priority Sectors field. Be descriptive.</p>
                      <span className={`text-[10px] font-bold ${formData.expertiseDescription.length >= 60 ? 'text-green-500' : 'text-brand-accent'}`}>
                        {formData.expertiseDescription.length} / 60 min
                      </span>
                    </div>
                  </InputGroup>
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 5: ACTIVE CLIENT MANDATES */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 5}>
              <StepCard title="Active Client Mandates" helper="What mandates are you currently representing?">
                <MultiSelectChips 
                  label="Active Mandates" 
                  options={[...MANDATE_OPTIONS]} 
                  selected={formData.activeMandates} 
                  onChange={(selected: string[]) => updateFormData({ activeMandates: selected })} 
                  grid
                />
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 6: COLLABORATION PREFERENCES */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 6}>
              <StepCard title="Collaboration Preferences" helper="Define how you prefer to partner with others">
                <div className="space-y-10">
                  <div className="group">
                    <button 
                      type="button"
                      onClick={() => updateFormData({ coAdvisory: !formData.coAdvisory })}
                      className={`w-full flex items-center justify-between p-8 rounded-[32px] border-2 transition-all duration-300 ${
                        formData.coAdvisory ? 'bg-brand-accent/5 border-brand-accent shadow-lg' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className={`p-3 rounded-2xl ${formData.coAdvisory ? 'bg-brand-accent text-white' : 'bg-white text-gray-400'}`}>
                          <Sparkles size={20} />
                        </div>
                        <div>
                          <span className="block text-sm font-black text-foreground uppercase tracking-tight">Open to Co-Advisory?</span>
                          <span className="block text-[11px] text-brand-secondary font-medium mt-0.5">Allow shared mandates or split-fee collaborations.</span>
                        </div>
                      </div>
                      <div className={`toggle-switch ${formData.coAdvisory ? 'active' : ''}`}><div className="toggle-knob" /></div>
                    </button>
                  </div>
                  <MultiSelectChips 
                    label="Preferred Collaboration Model" 
                    options={[...COLLABORATION_MODEL_OPTIONS]} 
                    selected={formData.collaborationModels} 
                    onChange={(selected: string[]) => updateFormData({ collaborationModels: selected })} 
                  />
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 7: PROFILE ATTACHMENT */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 7}>
              <StepCard title="Profile Attachment (Optional)" helper="Upload your company or professional credentials">
                <FileUpload 
                  file={formData.attachmentFile} 
                  existingUrl={formData.attachmentUrl}
                  onFileSelect={(file) => {
                    if (file === null) {
                      updateFormData({ attachmentFile: null, attachmentUrl: '' });
                    } else {
                      updateFormData({ attachmentFile: file });
                    }
                  }} 
                />
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 8: ADDITIONAL INFORMATION */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 8}>
              <StepCard title="Additional Information (Optional)" helper="Tell us more about your work and preferences">
                <InputGroup label="Tell us more about your work, deal preferences, or anything important">
                  <textarea 
                    value={formData.additionalInfo} 
                    onChange={e => updateFormData({ additionalInfo: e.target.value })} 
                    rows={8} 
                    className="textarea-premium" 
                    placeholder="Types of deals, typical size, strategic focus..." 
                  />
                </InputGroup>
              </StepCard>
            </AnimatedStepWrapper>

            {/* STEP 9: TERMS AND CONDITIONS */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 9}>
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
                      any match or verify the claims counterparties make. I confirm I am
                      authorised to submit the mandates I enter.
                    </span>
                  </label>
                </div>
              </StepCard>
            </AnimatedStepWrapper>
          </div>
        </div>
      </div>

      {/* STICKY FOOTER NAVIGATION */}
      <div className="sticky bottom-0 w-full bg-white/80 backdrop-blur-xl border-t border-gray-100 py-6 px-6 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] mt-auto">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={handleBack} disabled={currentStep === 1 || isSubmitting} className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 ${currentStep === 1 ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white border-brand-accent/20 text-brand-accent hover:bg-brand-accent/5'}`}>
            <ChevronLeft size={18} /> Back
          </button>

          <div className="flex flex-col items-center gap-1">
            {currentErrors.length > 0 && (
              <span className="text-[10px] font-black text-brand-accent uppercase animate-pulse">{currentErrors[0].message}</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {progress === 100 && currentStep < TOTAL_STEPS && (
              <button 
                onClick={handleFinalSubmit} 
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 border-green-100 text-green-600 hover:bg-green-50 active:scale-95"
              >
                Finalize & Skip <Zap size={14} className="fill-green-600" />
              </button>
            )}

            <button 
              onClick={handleNext} 
              disabled={!isValid || isSubmitting} 
              className={`flex items-center gap-4 px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all ${isValid ? 'bg-[#0B1B2B] text-white hover:bg-brand-accent' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 
              currentStep === TOTAL_STEPS ? <>Finalize Profile <Zap size={16} className="fill-white" /></> : <>Next Step <ChevronRight size={18} /></>}
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
        select.input-premium {
          appearance: none;
        }
        .toggle-switch { width: 3.5rem; height: 2rem; border-radius: 9999px; background-color: #e5e7eb; transition: all 0.2s; position: relative; }
        .toggle-switch.active { background-color: #FFA000; }
        .toggle-knob { position: absolute; top: 0.25rem; left: 0.25rem; width: 1.5rem; height: 1.5rem; background-color: white; border-radius: 9999px; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .toggle-switch.active .toggle-knob { left: 1.75rem; }
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

