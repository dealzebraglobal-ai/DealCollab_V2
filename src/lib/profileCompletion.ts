interface ProfileUser {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_phone_verified?: boolean | string | null;
  role?: string | null;
  category?: unknown[] | null;
  base_city?: string | null;
  base_country?: string | null;
  geographies?: unknown[] | null;
  sectors?: unknown[] | null;
  intent?: unknown[] | null;
  expertise_description?: string | null;
  active_mandates?: unknown[] | null;
  co_advisory?: boolean | null;
  terms_accepted?: boolean | null;
}

/**
 * MASTER COMPLETION LOGIC
 * Synchronized with frontend (src/lib/validation/profile.ts)
 */
export function calculateProfileCompletion(user: ProfileUser): number {
  const checks = [
    // Section 1: Basic Identity
    !!user.name?.trim(),
    !!user.email?.trim(),
    !!user.phone?.trim(),
    !!user.role,
    (user.category?.length ?? 0) > 0,
    
    // Section 2: Geography
    !!user.base_city?.trim(),
    !!user.base_country?.trim(),
    (user.geographies?.length ?? 0) > 0,
    
    // Section 3: Expertise
    (user.sectors?.length ?? 0) > 0,
    
    // Section 4: Intent & Expertise Description
    (user.intent?.length ?? 0) > 0,
    (user.expertise_description?.trim().length ?? 0) >= 60,
    
    // Section 5: Active Mandates
    (user.active_mandates?.length ?? 0) > 0,
    
    // Section 6: Collaboration
    user.co_advisory !== null && user.co_advisory !== undefined,

    // Section 9: Terms and Conditions
    !!user.terms_accepted,
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}
