'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useUser } from '../UserProvider';
import {
  Globe,
  ChevronRight, ChevronLeft, Zap, Check, Plus, X, FileText
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { UserProfile } from '../UserProvider';

// PRD-aligned validation and types
import { 
  STEPS, 
  INITIAL_FORM_DATA, 
  ProfileFormData, 
  AdvisorRequirementItem,
  validateStep, 
  isStepValid, 
  calculateProgress,
  ROLE_OPTIONS,
  PROFESSIONAL_CATEGORY_OPTIONS,
  MANDATE_OPTIONS,
  COLLABORATION_MODEL_OPTIONS,
  END_USER_INTENT_OPTIONS,
} from '@/lib/validation/profile';

// Sub-components
import MultiSelectChips from '@/components/profile-setup/MultiSelectChips';
import ProgressCircle from './ProgressCircle';
import ProgressBar from './ProgressBar';
import StepCard from './StepCard';
import AnimatedStepWrapper from './AnimatedStepWrapper';
import FileUpload from './FileUpload';
import AvatarUpload from './AvatarUpload';

const SECTORS_LIST = [
  "Pharma & Lifesciences", "Specialty Chemicals", "Auto & Components", "Engineering & Capital Goods",
  "Textiles & Apparel", "Food & Agri Processing", "FMCG & Consumer Brands", "IT Services & ITES",
  "Software & SaaS", "Healthcare & Hospitals", "Defence & Aerospace", "Education", "BFSI & Fintech",
  "Logistics & Supply Chain", "Real Estate & Infra", "Metals & Mining", "Packaging", "Renewables & Power",
  "Retail & D2C", "Building Materials", "Electronics & EMS", "Media & Entertainment", "Hospitality & Travel",
  "Agritech", "Chemicals & Fertilisers", "Plastics & Polymers", "Printing", "Water & Environment"
];

const GEOS_LIST = [
  "Pan India", "Mumbai", "Pune", "Delhi NCR", "Bengaluru", "Chennai", "Hyderabad", "Ahmedabad",
  "Kolkata", "Surat", "Jaipur", "Indore", "Coimbatore", "Nagpur", "Maharashtra", "Gujarat",
  "Karnataka", "Tamil Nadu", "Telangana", "Andhra Pradesh", "West Bengal", "Rajasthan", "Punjab",
  "Haryana", "Madhya Pradesh", "Uttar Pradesh", "Kerala", "Odisha", "Goa", "North East", "International"
];

const MODELS_LIST = [
  "Manufacturing", "Contract manufacturing", "B2B services", "B2B SaaS", "D2C / consumer brand",
  "Marketplace / platform", "Distribution", "EPC / projects", "Franchise", "Asset-heavy", "Asset-light"
];

const STRUCTS_LIST = [
  "100% buyout", "Majority / control", "Minority stake", "Growth capital", "Slump sale",
  "Asset purchase", "Merger", "JV / strategic", "Distressed / NCLT", "Management buyout"
];

interface ProfileStepperProps {
  onComplete: (showSuccess?: boolean) => void;
  initialData?: UserProfile | null;
}

function emptyCard(idx: number): AdvisorRequirementItem {
  return {
    slotIndex: idx,
    sectors: [],
    niche: '',
    cities: [],
    revenue: '',
    details: '',
    businessModels: [],
    dealStructures: []
  };
}

function isCardFilled(c: AdvisorRequirementItem): boolean {
  return Boolean(
    c.sectors && c.sectors.length > 0 &&
    c.niche && c.niche.trim().length > 0 &&
    c.cities && c.cities.length > 0 &&
    c.revenue && c.revenue.trim().length > 0
  );
}

export default function ProfileStepper({ onComplete, initialData }: ProfileStepperProps) {
  const { refreshProfile, setOnboarding, updateReadiness, addTokens } = useUser();
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProfileFormData>(INITIAL_FORM_DATA);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dbHydrated = useRef(false);
  const sessionHydrated = useRef(false);

  // Requirements Slots state (for Intermediary)
  const [requirementSlots, setRequirementSlots] = useState<AdvisorRequirementItem[]>([
    emptyCard(1), emptyCard(2), emptyCard(3), emptyCard(4), emptyCard(5)
  ]);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [draftCard, setDraftCard] = useState<AdvisorRequirementItem | null>(null);
  const [showMoreModalOptions, setShowMoreModalOptions] = useState(false);
  const [sectorSearch, setSectorSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardSaveError, setCardSaveError] = useState<string | null>(null);

  // Initialize form with initialData or session
  useEffect(() => {
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
        primarySectors: initialData.sectors as string[] || [],
        currentFocus: (initialData.currentFocus || initialData.intent || []) as string[],
        expertiseDescription: initialData.expertiseDescription || initialData.expertise_description || '',
        profileImage: initialData.profileImage || initialData.profile_image || '',
        termsAccepted: !!((initialData as { termsAccepted?: boolean; terms_accepted?: boolean }).termsAccepted || (initialData as { termsAccepted?: boolean; terms_accepted?: boolean }).terms_accepted),
        role: initialData.role || '',
        customRole: (initialData as any).customRole || (initialData as any).custom_role || '',
        professionalCategory: (initialData.category || (initialData as any).professionalCategory || []) as string[],
        baseCity: initialData.baseCity || initialData.base_city || '',
        baseCountry: initialData.baseCountry || initialData.base_country || '',
        activeGeographies: (initialData as any).geographies || (initialData as any).activeGeographies || [],
        crossBorder: (initialData as any).cross_border ?? (initialData as any).crossBorder ?? false,
        corridors: (initialData as any).corridors || [],
        coAdvisory: (initialData as any).co_advisory ?? (initialData as any).coAdvisory ?? false,
        collaborationModels: (initialData as any).collaboration_model || (initialData as any).collaborationModels || [],
        activeMandates: (initialData as any).active_mandates || (initialData as any).activeMandates || [],
      }));

      // Hydrate requirements
      if (Array.isArray((initialData as { requirements?: AdvisorRequirementItem[] }).requirements)) {
        const reqs = (initialData as { requirements?: AdvisorRequirementItem[] }).requirements || [];
        if (reqs.length > 0) {
          const loaded = [1, 2, 3, 4, 5].map(i => {
            const found = reqs.find(r => r.slotIndex === i);
            return found ? { ...found } : emptyCard(i);
          });
          setRequirementSlots(loaded);
        }
      }

      // Also ensure live DB requirements are synced
      fetch('/api/profile/requirements')
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (json && Array.isArray(json.requirements) && json.requirements.length > 0) {
            const reqs = json.requirements;
            const loaded = [1, 2, 3, 4, 5].map(i => {
              const found = reqs.find((r: Record<string, unknown>) => (r.slot_index ?? r.slotIndex) === i);
              return found ? {
                id: found.id as string,
                slotIndex: ((found.slot_index ?? found.slotIndex) as number) || i,
                sectors: (found.sectors as string[]) || [],
                niche: (found.niche as string) || '',
                cities: (found.cities as string[]) || [],
                revenue: (found.revenue_raw as string) || (found.revenue as string) || '',
                details: (found.details as string) || '',
                businessModels: (found.business_models as string[]) || (found.businessModels as string[]) || [],
                dealStructures: (found.deal_structures as string[]) || (found.dealStructures as string[]) || [],
              } : emptyCard(i);
            });
            setRequirementSlots(loaded);
          }
        })
        .catch(() => {});
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

      fetch('/api/profile/requirements')
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (json && Array.isArray(json.requirements) && json.requirements.length > 0) {
            const reqs = json.requirements;
            const loaded = [1, 2, 3, 4, 5].map(i => {
              const found = reqs.find((r: Record<string, unknown>) => (r.slot_index ?? r.slotIndex) === i);
              return found ? {
                id: found.id as string,
                slotIndex: ((found.slot_index ?? found.slotIndex) as number) || i,
                sectors: (found.sectors as string[]) || [],
                niche: (found.niche as string) || '',
                cities: (found.cities as string[]) || [],
                revenue: (found.revenue_raw as string) || (found.revenue as string) || '',
                details: (found.details as string) || '',
                businessModels: (found.business_models as string[]) || (found.businessModels as string[]) || [],
                dealStructures: (found.deal_structures as string[]) || (found.dealStructures as string[]) || [],
              } : emptyCard(i);
            });
            setRequirementSlots(loaded);
          }
        })
        .catch(() => {});
    }
  }, [session, initialData]);

  const updateFormData = (data: Partial<ProfileFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const isBusinessPromoter = formData.professionalCategory.includes('Business Owner / Promoter');

  const activeSteps = useMemo(() => {
    if (isBusinessPromoter) {
      return [
        { id: 1, label: 'Company Identity', section: 'Section 1' },
        { id: 2, label: 'Business Details', section: 'Section 2' },
        { id: 3, label: 'Terms & Conditions', section: 'Section 3' },
      ];
    }
    return [
      { id: 1, label: 'Basic Identity', section: 'Moment 1' },
      { id: 2, label: 'Deal Requirements', section: 'Moment 2' },
      { id: 3, label: 'Verification & Mandates', section: 'Moment 3' },
    ];
  }, [isBusinessPromoter]);

  const activeTotalSteps = activeSteps.length;
  const progress = useMemo(() => calculateProgress(formData), [formData]);
  const currentErrors = useMemo(() => validateStep(currentStep, formData), [currentStep, formData]);
  const isValid = currentErrors.length === 0;

  const handleUserTypeChange = (type: 'intermediary' | 'promoter') => {
    if (type === 'promoter') {
      updateFormData({
        professionalCategory: ['Business Owner / Promoter'],
      });
      if (currentStep > 3) setCurrentStep(3);
    } else {
      const cleaned = formData.professionalCategory.filter(cat => cat !== 'Business Owner / Promoter');
      updateFormData({
        professionalCategory: cleaned.length > 0 ? cleaned : ['Investment Banker'],
      });
    }
  };

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
      setDirection('back');
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const validReqs = requirementSlots.filter(isCardFilled);

    const payload: Partial<ProfileFormData> = {
      ...formData,
      requirements: !isBusinessPromoter ? validReqs : [],
      termsAccepted: true,
    };

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
              : undefined,
            requirements: payload.requirements,
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

  // Requirement Card Modal Handlers
  const openCardModal = (idx: number) => {
    setEditingCardIndex(idx);
    setDraftCard({ ...requirementSlots[idx] });
    setShowMoreModalOptions(false);
    setSectorSearch('');
    setCitySearch('');
    setCardSaveError(null);
  };

  const closeCardModal = () => {
    setEditingCardIndex(null);
    setDraftCard(null);
    setCardSaveError(null);
  };

  const saveCardModal = async () => {
    if (editingCardIndex === null || !draftCard) return;

    // Auto-use typed custom sector if user hasn't pressed Enter/Add
    const activeSectors = draftCard.sectors.length > 0
      ? draftCard.sectors
      : (sectorSearch.trim() ? [sectorSearch.trim()] : []);

    if (activeSectors.length === 0 || !draftCard.niche.trim()) {
      setCardSaveError('Please enter or select a target sector and enter your specific niche focus.');
      return;
    }

    setIsSavingCard(true);
    setCardSaveError(null);

    const slotNumber = editingCardIndex + 1;
    const cardToSave: AdvisorRequirementItem = {
      ...draftCard,
      sectors: activeSectors,
      slotIndex: slotNumber,
    };

    try {
      const res = await fetch('/api/profile/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardToSave),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save requirement in database');
      }

      const next = [...requirementSlots];
      next[editingCardIndex] = {
        ...cardToSave,
        id: json.requirement?.id || cardToSave.id,
      };
      setRequirementSlots(next);
      closeCardModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCardSaveError(msg);
    } finally {
      setIsSavingCard(false);
    }
  };

  const clearCardSlot = async () => {
    if (editingCardIndex === null) return;
    const slotNumber = editingCardIndex + 1;
    setIsSavingCard(true);
    try {
      await fetch(`/api/profile/requirements?slotIndex=${slotNumber}`, {
        method: 'DELETE',
      });
      const next = [...requirementSlots];
      next[editingCardIndex] = emptyCard(slotNumber);
      setRequirementSlots(next);
      closeCardModal();
    } catch (err: unknown) {
      console.error('Clear card error:', err);
    } finally {
      setIsSavingCard(false);
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

            {/* USER TYPE SELECTION HEADER */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm mb-8 space-y-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Profile Setup Category</span>
                <h3 className="text-xl font-black text-foreground tracking-tight mt-1">Select Your Profile Type</h3>
                <p className="text-xs font-semibold text-brand-secondary mt-1 leading-relaxed">
                  Choose the category that matches your purpose to display the right steps and fields.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => handleUserTypeChange('intermediary')}
                  className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all duration-300 ${
                    !isBusinessPromoter
                      ? 'border-brand-accent bg-brand-accent/5 shadow-md shadow-brand-accent/5'
                      : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <span className="block text-sm font-black text-foreground uppercase tracking-tight">IB / Intermediary Professional</span>
                  <span className="block text-[11px] text-brand-secondary font-medium mt-1.5 leading-relaxed">
                    For M&A advisors, brokers, investment bankers (3 Moments: Identity, Requirements, Verification)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUserTypeChange('promoter')}
                  className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all duration-300 ${
                    isBusinessPromoter
                      ? 'border-brand-accent bg-brand-accent/5 shadow-md shadow-brand-accent/5'
                      : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <span className="block text-sm font-black text-foreground uppercase tracking-tight">Business Promoter (End User)</span>
                  <span className="block text-[11px] text-brand-secondary font-medium mt-1.5 leading-relaxed">
                    For business owners and founders looking to raise capital, sell, or partner directly (3 steps)
                  </span>
                </button>
              </div>
            </div>

            {/* ── STEP 1: BASIC IDENTITY ── */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 1}>
              <StepCard 
                title="Basic Identity" 
                helper={isBusinessPromoter ? "Establish your business promoter identity within the network" : "Establish your verified intermediary identity (~40 seconds)"}
              >
                <div className="space-y-8">
                  {!isBusinessPromoter && (
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
                  )}

                  <div className="grid grid-cols-1 gap-6">
                    <InputGroup label="Full Name *">
                      <input 
                        type="text" 
                        value={formData.fullName} 
                        onChange={e => updateFormData({ fullName: e.target.value })} 
                        className="input-premium" 
                        placeholder="Legal Name" 
                      />
                    </InputGroup>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Work Email *">
                        <input 
                          type="email" 
                          value={formData.workEmail} 
                          onChange={e => updateFormData({ workEmail: e.target.value })} 
                          className="input-premium" 
                          placeholder="name@firm.com" 
                        />
                      </InputGroup>
                      <InputGroup label="Phone Number * (with country code)">
                        <input 
                          type="tel" 
                          value={formData.phone} 
                          onChange={e => updateFormData({ phone: e.target.value })} 
                          className="input-premium" 
                          placeholder="+91 00000 00000" 
                        />
                      </InputGroup>
                    </div>

                    {isBusinessPromoter ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputGroup label="Company / Business Name *">
                          <input 
                            type="text" 
                            value={formData.companyName} 
                            onChange={e => updateFormData({ companyName: e.target.value })} 
                            className="input-premium" 
                            placeholder="e.g. Acme Corp" 
                          />
                        </InputGroup>
                        <InputGroup label="Business Website *">
                          <input 
                            type="text" 
                            value={formData.website} 
                            onChange={e => updateFormData({ website: e.target.value })} 
                            className="input-premium" 
                            placeholder="e.g. https://acme.com" 
                          />
                        </InputGroup>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <InputGroup label="Firm / Organisation Name (Optional)">
                            <input 
                              type="text" 
                              value={formData.firmName} 
                              onChange={e => updateFormData({ firmName: e.target.value })} 
                              className="input-premium" 
                              placeholder="e.g. Sterling Advisors LLP" 
                            />
                          </InputGroup>
                          <InputGroup label="Base City *">
                            <input 
                              type="text" 
                              value={formData.baseCity} 
                              onChange={e => updateFormData({ baseCity: e.target.value })} 
                              className="input-premium" 
                              placeholder="e.g. Mumbai" 
                            />
                          </InputGroup>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <InputGroup label="Your Role *">
                            <select 
                              value={formData.role} 
                              onChange={e => updateFormData({ role: e.target.value })} 
                              className="input-premium cursor-pointer"
                            >
                              <option value="">Select your role</option>
                              {ROLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          </InputGroup>
                          {formData.role === 'Other' && (
                            <InputGroup label="Specify Role *">
                              <input 
                                type="text" 
                                value={formData.customRole} 
                                onChange={e => updateFormData({ customRole: e.target.value })} 
                                className="input-premium" 
                                placeholder="Enter your role" 
                              />
                            </InputGroup>
                          )}
                        </div>

                        <div className="space-y-6">
                          <MultiSelectChips
                            label="Professional Category *"
                            options={[...PROFESSIONAL_CATEGORY_OPTIONS]}
                            selected={formData.professionalCategory}
                            onChange={(selected: string[]) => updateFormData({ professionalCategory: selected })}
                            grid
                          />
                          {formData.professionalCategory.includes("Other") && (
                            <InputGroup label="Specify Category *">
                              <input 
                                type="text" 
                                value={formData.customCategory} 
                                onChange={e => updateFormData({ customCategory: e.target.value })} 
                                className="input-premium" 
                                placeholder="Your specific professional title" 
                              />
                            </InputGroup>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* ── STEP 2 FOR INTERMEDIARY: DEAL REQUIREMENTS (5 CARDS GRID) ── */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 2 && !isBusinessPromoter}>
              <StepCard 
                title="What You Are Looking For" 
                helper="Share your acquisition interests and sectors of focus. We’ll route relevant sell-side opportunities from the network to you"
              >
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Standing Buy-Side Requirements
                    </span>
                    <span className="text-xs font-black text-brand-accent bg-brand-accent/5 px-3 py-1 rounded-full">
                      {requirementSlots.filter(isCardFilled).length} of {requirementSlots.length} filled
                    </span>
                  </div>

                  {/* 5 Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {requirementSlots.map((card, idx) => {
                      const filled = isCardFilled(card);
                      return (
                        <div
                          key={idx}
                          onClick={() => openCardModal(idx)}
                          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between h-44 ${
                            filled
                              ? 'border-brand-accent/40 bg-brand-accent/5 shadow-sm hover:border-brand-accent'
                              : 'border-dashed border-gray-200 bg-white hover:border-brand-accent/50 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                              filled ? 'bg-brand-accent text-white' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {idx + 1}
                            </span>
                            {filled ? (
                              <span className="text-[10px] font-black uppercase text-brand-accent bg-white px-2 py-0.5 rounded-md border border-brand-accent/20 flex items-center gap-1">
                                <Check size={12} /> Filled
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Slot {idx + 1}</span>
                            )}
                          </div>

                          {filled ? (
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-foreground line-clamp-1">
                                {card.sectors.join(', ')}
                              </div>
                              <div className="text-[11px] text-brand-secondary line-clamp-1">
                                {card.niche}
                              </div>
                              <div className="text-[10px] text-gray-400 line-clamp-1">
                                {card.cities.join(', ')}
                              </div>
                              <div className="text-xs font-black text-brand-accent">
                                {card.revenue}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-xs font-bold text-foreground">Requirement {idx + 1}</div>
                              <div className="text-[11px] font-bold text-brand-accent mt-1">+ Click to configure</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {requirementSlots.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setRequirementSlots([...requirementSlots, emptyCard(requirementSlots.length + 1)])}
                      className="w-full py-3.5 border-2 border-dashed border-brand-accent/30 text-brand-accent text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-brand-accent/5 transition-all"
                    >
                      + Add Another Requirement Slot
                    </button>
                  )}
                </div>
              </StepCard>
            </AnimatedStepWrapper>

            {/* ── STEP 2 FOR BUSINESS PROMOTER: BUSINESS DETAILS ── */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 2 && isBusinessPromoter}>
              <StepCard title="Business Details" helper="Specify your industry, goals, and description">
                <div className="space-y-8">
                  <MultiSelectChips
                    label="Primary Industry Sectors *"
                    options={[...SECTORS_LIST]}
                    selected={formData.primarySectors}
                    onChange={(selected: string[]) => updateFormData({ primarySectors: selected })}
                    grid
                  />

                  <MultiSelectChips
                    label="What are you looking for? *"
                    options={[...END_USER_INTENT_OPTIONS]}
                    selected={formData.currentFocus}
                    onChange={(selected: string[]) => updateFormData({ currentFocus: selected })}
                    grid
                  />

                  <InputGroup label="Business Description">
                    <textarea 
                      value={formData.expertiseDescription} 
                      onChange={e => updateFormData({ expertiseDescription: e.target.value })} 
                      className="textarea-premium"
                      placeholder="Briefly describe your company, traction, and key value propositions."
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

            {/* ── STEP 3: VERIFICATION & MANDATES ── */}
            <AnimatedStepWrapper direction={direction} isActive={currentStep === 3}>
              <StepCard 
                title={isBusinessPromoter ? "Terms & Conditions" : "Verification & Mandates"} 
                helper={isBusinessPromoter ? "Accept terms to finalize promoter profile" : "Complete verification and accept terms to unlock 100 free tokens"}
              >
                <div className="space-y-8">
                  {!isBusinessPromoter && (
                    <>
                      <InputGroup label="Track Record & Closed Transactions (Optional)">
                        <textarea
                          value={formData.expertiseDescription}
                          onChange={e => updateFormData({ expertiseDescription: e.target.value })}
                          className="textarea-premium"
                          placeholder="Transactions you have closed, sectors you specialize in, average deal sizes."
                        />
                      </InputGroup>

                      {/* Co-Advisory Toggle */}
                      <div className="group">
                        <button
                          type="button"
                          onClick={() => updateFormData({ coAdvisory: !formData.coAdvisory })}
                          className={`w-full flex items-center justify-between p-6 rounded-[28px] border-2 transition-all duration-300 ${
                            formData.coAdvisory ? 'bg-brand-accent/5 border-brand-accent shadow-md' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-4 text-left">
                            <div className={`p-3 rounded-2xl ${formData.coAdvisory ? 'bg-brand-accent text-white' : 'bg-white text-gray-400'}`}>
                              <Globe size={20} />
                            </div>
                            <div>
                              <span className="block text-sm font-black text-foreground uppercase tracking-tight">Open to Co-Advisory?</span>
                              <span className="block text-[11px] text-brand-secondary font-medium mt-0.5">Shared mandates and split-fee opportunities</span>
                            </div>
                          </div>
                          <div className={`toggle-switch ${formData.coAdvisory ? 'active' : ''}`}><div className="toggle-knob" /></div>
                        </button>
                      </div>

                      {formData.coAdvisory && (
                        <MultiSelectChips
                          label="Preferred Collaboration Models"
                          options={[...COLLABORATION_MODEL_OPTIONS]}
                          selected={formData.collaborationModels}
                          onChange={(selected: string[]) => updateFormData({ collaborationModels: selected })}
                        />
                      )}

                      <FileUpload
                        label="Credentials / Firm Deck (Optional)"
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
                    </>
                  )}

                  {/* Terms Checkbox */}
                  <label className="flex items-start gap-4 p-6 rounded-2xl bg-amber-50/50 border border-amber-200/60 cursor-pointer select-none">
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
                      . I understand that sending an EOI costs tokens and reveals my verified contact details to the counterparty on approval.
                    </span>
                  </label>
                </div>
              </StepCard>
            </AnimatedStepWrapper>
          </div>
        </div>
      </div>

      {/* STICKY FOOTER NAVIGATION */}
      <div className="sticky bottom-0 w-full bg-white/80 backdrop-blur-xl border-t border-gray-100 py-6 px-6 z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] mt-auto">
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
            className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 ${
              currentStep === 1 ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white border-brand-accent/20 text-brand-accent hover:bg-brand-accent/5'
            }`}
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
              className={`flex items-center gap-4 px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all ${
                isValid ? 'bg-[#0B1B2B] text-white hover:bg-brand-accent shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting…
                </>
              ) : currentStep === activeTotalSteps ? (
                <>Finalize Profile <Zap size={16} className="fill-white" /></>
              ) : (
                <>Next Step <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL FOR REQUIREMENT CARD CONFIGURATION */}
      {editingCardIndex !== null && draftCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand-accent text-white text-xs font-black flex items-center justify-center">
                  {editingCardIndex + 1}
                </span>
                <h3 className="font-black text-foreground text-lg tracking-tight">
                  Requirement Slot {editingCardIndex + 1}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={closeCardModal}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 overflow-y-auto space-y-6 flex-1">
              <div>
                <InputGroup label="Target Sector *">
                  <div className="flex flex-wrap gap-1.5 p-3 bg-[#fffaf3] border border-[#FFE4B5] rounded-2xl min-h-[48px] items-center">
                    {draftCard.sectors.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5 bg-brand-accent text-white text-xs font-bold px-3 py-1.5 rounded-xl">
                        {draftCard.sectors[0]}
                        <button 
                          type="button"
                          onClick={() => setDraftCard({ ...draftCard, sectors: [] })}
                          className="hover:opacity-80 font-black text-sm ml-1"
                          title="Remove and change sector"
                        >
                          &times;
                        </button>
                      </span>
                    ) : (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={sectorSearch}
                          onChange={e => setSectorSearch(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (sectorSearch.trim()) {
                                setDraftCard({ ...draftCard, sectors: [sectorSearch.trim()] });
                                setSectorSearch('');
                              }
                            }
                          }}
                          placeholder="Type any sector (press Enter) or choose below..."
                          className="flex-1 min-w-[160px] bg-transparent text-xs font-bold outline-none px-1 text-foreground"
                        />
                        {sectorSearch.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftCard({ ...draftCard, sectors: [sectorSearch.trim()] });
                              setSectorSearch('');
                            }}
                            className="px-3 py-1 bg-[#0B1B2B] text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-brand-accent transition-colors shrink-0"
                          >
                            Set Sector
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </InputGroup>
                {/* Sector Suggestions & Custom Chip */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-28 overflow-y-auto">
                  {sectorSearch.trim() && !SECTORS_LIST.some(s => s.toLowerCase() === sectorSearch.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftCard({ ...draftCard, sectors: [sectorSearch.trim()] });
                        setSectorSearch('');
                      }}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors shadow-sm"
                    >
                      + Use &ldquo;{sectorSearch.trim()}&rdquo; (Custom Sector)
                    </button>
                  )}
                  {SECTORS_LIST.filter(s => !sectorSearch || s.toLowerCase().includes(sectorSearch.toLowerCase())).slice(0, 8).map(s => {
                    const isSelected = draftCard.sectors.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setDraftCard({ ...draftCard, sectors: [s] });
                          setSectorSearch('');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                          isSelected 
                            ? 'bg-brand-accent text-white shadow-sm' 
                            : 'bg-gray-100 hover:bg-brand-accent/10 hover:text-brand-accent text-gray-700'
                        }`}
                      >
                        {isSelected ? `✓ ${s}` : `+ ${s}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <InputGroup label="Specific Niche Focus *">
                  <input
                    type="text"
                    value={draftCard.niche}
                    onChange={e => setDraftCard({ ...draftCard, niche: e.target.value })}
                    placeholder="e.g. Formulation CDMO with USFDA approval"
                    className="input-premium"
                  />
                </InputGroup>
                <p className="text-[10px] text-brand-secondary font-semibold mt-1 ml-2">
                  Be specific: Vague criteria cannot be matched or routed.
                </p>
              </div>

              <div>
                <InputGroup label="Target Cities / Regions *">
                  <div className="flex flex-wrap gap-1.5 p-3 bg-[#fffaf3] border border-[#FFE4B5] rounded-2xl min-h-[48px] items-center">
                    {draftCard.cities.map(c => (
                      <span key={c} className="inline-flex items-center gap-1.5 bg-brand-accent text-white text-xs font-bold px-3 py-1.5 rounded-xl">
                        {c}
                        <button 
                          type="button"
                          onClick={() => setDraftCard({ ...draftCard, cities: draftCard.cities.filter(x => x !== c) })}
                          className="hover:opacity-80 font-black text-sm"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={citySearch}
                      onChange={e => setCitySearch(e.target.value)}
                      placeholder={draftCard.cities.length === 0 ? "Type or select cities..." : ""}
                      className="flex-1 min-w-[140px] bg-transparent text-xs font-bold outline-none px-1 text-foreground"
                    />
                  </div>
                </InputGroup>
                {/* Geo Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-24 overflow-y-auto">
                  {GEOS_LIST.filter(g => !draftCard.cities.includes(g) && (!citySearch || g.toLowerCase().includes(citySearch.toLowerCase()))).slice(0, 8).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setDraftCard({ ...draftCard, cities: [...draftCard.cities, g] });
                        setCitySearch('');
                      }}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-gray-100 hover:bg-brand-accent/10 hover:text-brand-accent text-gray-700 transition-colors"
                    >
                      + {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <InputGroup label="Target Revenue Range *">
                  <input
                    type="text"
                    value={draftCard.revenue}
                    onChange={e => setDraftCard({ ...draftCard, revenue: e.target.value })}
                    placeholder="e.g. ₹50–200 Cr, or ₹200 Cr+"
                    className="input-premium"
                  />
                </InputGroup>
              </div>

              <div>
                <InputGroup label="More Details / Must-Haves">
                  <textarea
                    value={draftCard.details || ''}
                    onChange={e => setDraftCard({ ...draftCard, details: e.target.value })}
                    placeholder="Promoter criteria, profitability threshold, deal constraints"
                    className="textarea-premium"
                    style={{ minHeight: '80px' }}
                  />
                </InputGroup>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowMoreModalOptions(!showMoreModalOptions)}
                  className="text-xs font-black text-brand-accent flex items-center gap-1 hover:underline"
                >
                  {showMoreModalOptions ? '– Fewer Options' : '+ More Options (Business Models & Structures)'}
                </button>

                {showMoreModalOptions && (
                  <div className="mt-4 p-5 bg-gray-50 rounded-2xl space-y-4 border border-gray-100">
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-brand-secondary mb-2">Business Model</span>
                      <div className="flex flex-wrap gap-1.5">
                        {MODELS_LIST.map(m => {
                          const sel = (draftCard.businessModels || []).includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                const current = draftCard.businessModels || [];
                                setDraftCard({
                                  ...draftCard,
                                  businessModels: sel ? current.filter(x => x !== m) : [...current, m]
                                });
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                                sel ? 'bg-brand-accent text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-700'
                              }`}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-brand-secondary mb-2">Deal Structure</span>
                      <div className="flex flex-wrap gap-1.5">
                        {STRUCTS_LIST.map(s => {
                          const sel = (draftCard.dealStructures || []).includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                const current = draftCard.dealStructures || [];
                                setDraftCard({
                                  ...draftCard,
                                  dealStructures: sel ? current.filter(x => x !== s) : [...current, s]
                                });
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                                sel ? 'bg-brand-accent text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-700'
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-5 border-t border-gray-100 flex flex-col gap-3 bg-gray-50/50">
              {cardSaveError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">
                  {cardSaveError}
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={clearCardSlot}
                  disabled={isSavingCard}
                  className="px-4 py-2.5 text-xs font-black text-red-500 hover:text-red-700 uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  Clear Slot
                </button>
                <button
                  type="button"
                  onClick={saveCardModal}
                  disabled={isSavingCard}
                  className="flex items-center gap-2 px-8 py-3.5 bg-[#0B1B2B] text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-brand-accent transition-all shadow-md disabled:opacity-50"
                >
                  {isSavingCard ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving to DB…
                    </>
                  ) : (
                    'Save Requirement'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
