export interface ProfileUser {
  name?: string | null;
  fullName?: string | null;
  email?: string | null;
  workEmail?: string | null;
  phone?: string | null;
  is_phone_verified?: boolean | string | null;
  isPhoneVerified?: boolean | string | null;
  role?: string | null;
  category?: unknown[] | null;
  professionalCategory?: unknown[] | null;
  base_city?: string | null;
  baseCity?: string | null;
  base_country?: string | null;
  baseCountry?: string | null;
  geographies?: unknown[] | null;
  activeGeographies?: unknown[] | null;
  sectors?: unknown[] | null;
  primarySectors?: unknown[] | null;
  intent?: unknown[] | null;
  currentFocus?: unknown[] | null;
  expertise_description?: string | null;
  expertiseDescription?: string | null;
  active_mandates?: unknown[] | null;
  activeMandates?: unknown[] | null;
  co_advisory?: boolean | null;
  coAdvisory?: boolean | null;
  terms_accepted?: boolean | null;
  termsAccepted?: boolean | null;
  profile_completed_once?: boolean | null;
  profileCompletedOnce?: boolean | null;
  profile_completion?: number | null;
  profileCompletion?: number | null;
  // End User fields
  company_name?: string | null;
  companyName?: string | null;
  website?: string | null;
}

export interface CanonicalProfileCompletionResult {
  percentage: number;
  isComplete: boolean;
  missingFields: string[];
}

/**
 * MASTER CANONICAL PROFILE COMPLETION FUNCTION
 * The single source of truth used across the entire application:
 * - Profile Setup / View
 * - EOI Eligibility & Send EOI
 * - Onboarding Tutorial
 * - Dashboard & Deal pages
 * - Consent / Terms Verification
 */
export function getProfileCompletion(user: ProfileUser | null | undefined): CanonicalProfileCompletionResult {
  if (!user) {
    return {
      percentage: 0,
      isComplete: false,
      missingFields: ['profile'],
    };
  }

  // If user is already permanently marked as completed once, return 100% complete
  if (user.profile_completed_once || user.profileCompletedOnce) {
    return {
      percentage: 100,
      isComplete: true,
      missingFields: [],
    };
  }

  const rawCategories = user.category ?? user.professionalCategory ?? [];
  const categories = Array.isArray(rawCategories) ? rawCategories : [];
  const isBusinessPromoter = categories.includes('Business Owner / Promoter');

  const name = (user.name ?? user.fullName ?? '').trim();
  const email = (user.email ?? user.workEmail ?? '').trim();
  const phone = (user.phone ?? '').trim();
  const role = (user.role ?? '').trim();
  const baseCity = (user.base_city ?? user.baseCity ?? '').trim();
  const baseCountry = (user.base_country ?? user.baseCountry ?? '').trim();
  const rawGeographies = user.geographies ?? user.activeGeographies ?? [];
  const geographies = Array.isArray(rawGeographies) ? rawGeographies : [];
  const rawSectors = user.sectors ?? user.primarySectors ?? [];
  const sectors = Array.isArray(rawSectors) ? rawSectors : [];
  const rawIntent = user.intent ?? user.currentFocus ?? [];
  const intent = Array.isArray(rawIntent) ? rawIntent : [];
  const expertiseDescription = (user.expertise_description ?? user.expertiseDescription ?? '').trim();
  const rawMandates = user.active_mandates ?? user.activeMandates ?? [];
  const activeMandates = Array.isArray(rawMandates) ? rawMandates : [];
  const coAdvisory = user.co_advisory ?? user.coAdvisory;
  const termsAccepted = !!(user.terms_accepted ?? user.termsAccepted);
  const companyName = (user.company_name ?? user.companyName ?? '').trim();
  const website = (user.website ?? '').trim();

  if (isBusinessPromoter) {
    const checks: { key: string; passed: boolean }[] = [
      { key: 'name', passed: !!name },
      { key: 'email', passed: !!email },
      { key: 'company_name', passed: !!companyName },
      { key: 'website', passed: !!website },
      { key: 'intent', passed: intent.length > 0 },
      { key: 'terms_accepted', passed: termsAccepted },
    ];

    const passedChecks = checks.filter(c => c.passed);
    const missingFields = checks.filter(c => !c.passed).map(c => c.key);
    const isComplete = checks.every(c => c.passed);
    const percentage = isComplete ? 100 : Math.round((passedChecks.length / checks.length) * 100);

    return {
      percentage,
      isComplete,
      missingFields,
    };
  }

  const checks: { key: string; passed: boolean }[] = [
    // Section 1: Basic Identity
    { key: 'name', passed: !!name },
    { key: 'email', passed: !!email },
    { key: 'phone', passed: !!phone },
    { key: 'role', passed: !!role },
    { key: 'category', passed: categories.length > 0 },

    // Section 2: Geography
    { key: 'base_city', passed: !!baseCity },
    { key: 'base_country', passed: !!baseCountry },
    { key: 'geographies', passed: geographies.length > 0 },

    // Section 3: Expertise
    { key: 'sectors', passed: sectors.length > 0 },

    // Section 4: Intent & Expertise Description
    { key: 'intent', passed: intent.length > 0 },
    { key: 'expertise_description', passed: expertiseDescription.length >= 60 },

    // Section 5: Active Mandates
    { key: 'active_mandates', passed: activeMandates.length > 0 },

    // Section 6: Collaboration
    { key: 'co_advisory', passed: coAdvisory !== null && coAdvisory !== undefined },

    // Section 9: Terms and Conditions
    { key: 'terms_accepted', passed: termsAccepted },
  ];

  const passedChecks = checks.filter(c => c.passed);
  const missingFields = checks.filter(c => !c.passed).map(c => c.key);
  const isComplete = checks.every(c => c.passed);
  const percentage = isComplete ? 100 : Math.round((passedChecks.length / checks.length) * 100);

  return {
    percentage,
    isComplete,
    missingFields,
  };
}

/**
 * Backwards-compatible numeric calculator returning 0..100
 */
export function calculateProfileCompletion(user: ProfileUser | null | undefined): number {
  return getProfileCompletion(user).percentage;
}
