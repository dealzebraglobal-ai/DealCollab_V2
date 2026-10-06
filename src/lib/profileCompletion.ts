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

  const name = (user.name ?? user.fullName ?? '').trim();
  const email = (user.email ?? user.workEmail ?? '').trim();
  const companyName = (
    user.company_name ?? 
    user.companyName ?? 
    (user as { firm_name?: string | null }).firm_name ?? 
    (user as { firmName?: string | null }).firmName ?? 
    ''
  ).trim();
  const website = (user.website ?? '').trim();
  const rawIntent = user.intent ?? user.currentFocus ?? [];
  const intent = Array.isArray(rawIntent) ? rawIntent : [];
  const termsAccepted = !!(user.terms_accepted ?? user.termsAccepted);

  const checks: { key: string; passed: boolean }[] = [
    { key: 'name', passed: !!name },
    { key: 'email', passed: !!email },
    { key: 'terms_accepted', passed: termsAccepted },
  ];

  // Promoters require company name and website
  const categories = (user.category || user.professionalCategory || []) as string[];
  const isBusinessPromoter = 
    categories.includes('Business Owner / Promoter') || 
    (user as Record<string, unknown>).customCategory === 'promoter' || 
    (user as Record<string, unknown>).userType === 'promoter';

  if (isBusinessPromoter) {
    checks.push({ key: 'intent', passed: intent.length > 0 });
    checks.push({ key: 'company_name', passed: !!companyName });
  } else {
    // For intermediaries, company name is optional but good to have.
    // If they provided it, we can still count it, or we can just require role/base_city.
    // Let's require role and place for intermediaries instead.
    const role = (user.role && user.role !== 'Other' ? user.role : (user as Record<string, unknown>).customRole || (user as Record<string, unknown>).custom_role);
    const place = user.base_city || user.baseCity;
    checks.push({ key: 'role', passed: !!role });
    checks.push({ key: 'place', passed: !!place });
  }

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
