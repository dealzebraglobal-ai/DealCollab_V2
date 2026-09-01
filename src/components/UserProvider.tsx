'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useNotifications } from './NotificationProvider';
import { useSession, signOut } from 'next-auth/react';
import { createSupabaseClient } from '@/utils/supabase/client';
import { trackLogout } from '@/lib/analytics';

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  is_phone_verified: boolean;
  profile_completion: number;
  tokens: number;
  firm_name: string | null;
  role: string | null;
  custom_role: string | null;
  category: string[] | null;
  custom_category: string | null;
  base_location: string | null;
  base_city: string | null;
  base_country: string | null;
  geographies: string[] | null;
  cross_border: boolean;
  corridors: string[] | null;
  sectors: string[] | null;
  intent: string[] | null;
  expertise_description: string | null;
  active_mandates: string[] | null;
  priority_sectors: string[] | null;
  co_advisory: boolean;
  collaboration_model: string[] | null;
  profile_attachment_url: string | null;
  profile_image: string | null;
  additional_info: string | null;
  // End User-specific fields
  company_name?: string | null;
  website?: string | null;
  // Mapped/Alias fields used in frontend
  fullName?: string | null;
  profileImage?: string | null;
  userAvatar?: string | null;
  firmName?: string | null;
  companyName?: string | null;
  customRole?: string | null;
  customCategory?: string | null;
  baseLocation?: string | null;
  baseCity?: string | null;
  baseCountry?: string | null;
  crossBorder?: boolean;
  expertiseDescription?: string | null;
  activeMandates?: string[] | null;
  profileAttachmentUrl?: string | null;
  additionalInfo?: string | null;
  profileCompletion?: number;
  currentFocus?: string[] | null;
  coAdvisory?: boolean | null;
  collaborationModels?: string[] | null;
}

interface UserContextType {
  tokens: number | null;
  approvedDeals: number[];
  isEOIApproved: (dealId: number) => boolean;
  approveEOI: (dealId: number) => void;
  canSendEOI: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: (reason?: 'session_expired' | 'link_expired') => void;
  refreshProfile: () => Promise<void>;
  onboarding: {
    phoneVerified: boolean;
    profileCompleted: boolean;
    dealSubmitted: boolean;
  };
  setOnboarding: (step: 'phoneVerified' | 'profileCompleted' | 'dealSubmitted', value: boolean) => void;
  readinessScore: {
    phone: number;
    identity: number;
    geography: number;
    expertise: number;
    intent: number;
    collaboration: number;
    additional: number;
  };
  updateReadiness: (key: keyof UserContextType['readinessScore'], value: number) => void;
  addTokens: (amount: number) => void;
  totalScore: number;
  globalError: string | null;
  setGlobalError: (error: string | null) => void;
  profile: UserProfile | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { addNotification } = useNotifications();
  const { data: session, status } = useSession();
  const [supabase] = useState(() => createSupabaseClient());
  
  // Hardened Session Audit
  useEffect(() => {
    console.log("Session:", session);
    console.log("Auth Status:", status);
  }, [session, status]);
  
  const [tokens, setTokens] = useState<number | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [approvedDeals, setApprovedDeals] = useState<number[]>([]);
  const isAuthenticated = status === 'authenticated';
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const [onboarding, setOnboardingState] = useState({
    phoneVerified: false,
    profileCompleted: false,
    dealSubmitted: false,
  });

  const [readinessScore, setReadinessScore] = useState({
    phone: 0,
    identity: 0,
    geography: 0,
    expertise: 0,
    intent: 0,
    collaboration: 0,
    additional: 0,
  });

  const fetchSupabaseData = useCallback(async () => {
    if (!supabase) {
      setGlobalError("Supabase configuration is missing. Please check your .env file.");
      return;
    }
    const userEmail = session?.user?.email?.trim().toLowerCase();
    if (!userEmail) return;

    console.log("FETCHING PROFILE DATA FROM API FOR:", userEmail);

    
    const response = await fetch('/api/profile');
    if (!response.ok) {
      const errorText = await response.text();
      console.error("FAILED TO FETCH PROFILE FROM API", {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return;
    }
    
    const data = await response.json();
    
    if (data) {
      const dbTokens = data.tokens ?? data.profile?.tokens ?? 0;
      console.log("SYNCING TOKENS TO UI:", dbTokens);
      
      setTokens(dbTokens); 
      
      const rawDbImage = data.profile_image || data.profileImage;
      // STRICT REJECTION: If DB value is a Google URL, ignore it (it shouldn't be there)
      const dbProfileImage = (rawDbImage && rawDbImage.includes('googleusercontent.com')) ? null : rawDbImage;
      const authImage = session?.user?.image;
      
      // UI Avatar Priority: 1. DB image, 2. Auth provider image
      const userAvatar = dbProfileImage || authImage || null;

      setProfile({
        ...data,
        fullName: data.name || data.fullName,
        firmName: data.firmName || data.firm_name,
        companyName: data.companyName || data.company_name,
        website: data.website,
        customRole: data.customRole || data.custom_role,
        customCategory: data.customCategory || data.custom_category,
        baseLocation: data.baseLocation || data.base_location,
        baseCity: data.baseCity || data.base_city,
        baseCountry: data.baseCountry || data.base_country,
        crossBorder: data.crossBorder ?? data.cross_border,
        expertiseDescription: data.expertiseDescription || data.expertise_description,
        activeMandates: data.activeMandates || data.active_mandates,
        profileAttachmentUrl: data.profileAttachmentUrl || data.profile_attachment_url,
        profileImage: dbProfileImage || null, // STRICT: Only DB value
        userAvatar: userAvatar, // UI fallback
        additionalInfo: data.additionalInfo || data.additional_info,
        profileCompletion: data.profileCompletion || data.profile_completion,
        intent: data.intent || data.currentFocus || [],
        currentFocus: data.currentFocus || data.intent || [],
        tokens: dbTokens,
      });
      
      setOnboardingState(prev => ({
        phoneVerified: !!(data.is_phone_verified || data.phone),
        profileCompleted: (data.profileCompletion || data.profile_completion || 0) >= 100,
        dealSubmitted: prev.dealSubmitted,
      }));
    }
  }, [session, status, supabase]); // Removed profile to prevent loop

  // Sync with Supabase (REAL DATA)
  useEffect(() => {
    if (status === 'authenticated') {
      // Use a fire-and-forget pattern to avoid synchronous state-update warnings
      // while maintaining the async fetch integrity
      (async () => {
        await fetchSupabaseData();
      })();
    }
  }, [status, fetchSupabaseData]);

  const login = useCallback(() => {
    // Auth is managed by NextAuth status
  }, []);

  const logout = useCallback(async (reason?: 'session_expired' | 'link_expired') => {
    setProfile(null);
    setTokens(0);
    setApprovedDeals([]);
    setOnboardingState({
      phoneVerified: false,
      profileCompleted: false,
      dealSubmitted: false,
    });
    
    trackLogout();
    await signOut({
      callbackUrl: reason ? `/?error=${reason}` : '/?logout=success',
      redirect: true
    });
  }, []);

  const setOnboarding = useCallback((step: 'phoneVerified' | 'profileCompleted' | 'dealSubmitted', value: boolean) => {
    setOnboardingState(prev => {
      if (prev[step] === value) return prev;
      return { ...prev, [step]: value };
    });
  }, []);

  const updateReadiness = useCallback((key: keyof typeof readinessScore, value: number) => {
    setReadinessScore(prev => {
      if (value > prev[key]) {
        return { ...prev, [key]: value };
      }
      return prev;
    });
  }, []);

  const totalScore = useMemo(() => Object.values(readinessScore).reduce((a, b) => a + b, 0), [readinessScore]);

  const isEOIApproved = useCallback((dealId: number) => approvedDeals.includes(dealId), [approvedDeals]);

  const approveEOI = useCallback(async (dealId: number) => {
    if (approvedDeals.includes(dealId)) return;
    if ((tokens ?? 0) < 50) {
      addNotification({
        type: 'error',
        message: 'Insufficient tokens to connect with this deal.',
        time: 'Just now'
      });
      return;
    }

    try {
      // Server looks up the cost for 'connect' itself (DEBIT_ACTIONS in
      // /api/profile/tokens) — the amount here is display-only and never
      // trusted; sending it would do nothing.
      const res = await fetch('/api/profile/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTokens(data.balance);
        setApprovedDeals(d => [...d, dealId]);
        addNotification({
          type: 'success',
          message: 'Connection approved! 50 tokens debited.',
          time: 'Just now'
        });
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to approve connection');
      }
    } catch (error: unknown) {
      console.error("FULL ERROR:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addNotification({
        type: 'error',
        message: errorMessage || 'Something went wrong.',
        time: 'Just now'
      });
    }
  }, [approvedDeals, tokens, addNotification]);

  const addTokens = useCallback((amount: number) => {
    // Note: Tokens are actually added via the Profile API now for rewards
    setTokens(prev => (prev ?? 0) + amount);
    addNotification({
      type: 'tokens_credited',
      message: `${amount} tokens added to your account.`,
      time: 'Just now'
    });
  }, [addNotification]);

  const canSendEOI = (status === 'authenticated' ? (tokens ?? 0) : 0) > 0;

  return (
    <UserContext.Provider value={{ 
      tokens: status === 'authenticated' ? tokens : 0, 
      profile: status === 'authenticated' ? profile : null,
      approvedDeals, 
      isEOIApproved, 
      approveEOI, 
      canSendEOI, 
      isAuthenticated, 
      login, 
      logout,
      refreshProfile: fetchSupabaseData,
      onboarding: status === 'authenticated' ? onboarding : {
        phoneVerified: false,
        profileCompleted: false,
        dealSubmitted: false,
      }, 
      setOnboarding, 
      readinessScore, 
      updateReadiness, 
      addTokens, 
      totalScore,
      globalError,
      setGlobalError
    }}>
      {globalError && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white py-3 px-6 text-center z-[9999] font-bold shadow-lg flex items-center justify-center gap-3">
          <span className="text-lg">⚠️</span>
          {globalError}
          <button 
            onClick={() => window.location.reload()}
            className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs transition-all"
          >
            Retry
          </button>
        </div>
      )}
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
