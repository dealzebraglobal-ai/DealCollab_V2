/**
 * Profile Validation — Single source of truth for frontend + backend.
 * Every field rule from the PRD is encoded here.
 */

export interface ValidationError {
  field: string;
  message: string;
}

// ─── PRD Option Constants ───────────────────────────────────────

export const ROLE_OPTIONS = [
  'Founder / Partner',
  'Director / VP',
  'Associate',
  'Independent Advisor',
  'Other',
] as const;

export const PROFESSIONAL_CATEGORY_OPTIONS = [
  'M&A Advisor',
  'Investment Banker',
  'Business Broker',
  'Private Equity / VC',
  'Merchant Banker',
  'Chartered Accountant (CA)',
  'Company Secretary (CS)',
  'Corporate Development',
  'Valuer',
  'Insolvency Professional',
  'Corporate Lawyer',
  'Business Owner / Promoter',
  'CFO / Finance Head',
  'Investor / Family Office',
  'Other',
] as const;

export const GEOGRAPHY_OPTIONS = [
  'Local',
  'Regional',
  'India',
  'United States',
  'United Kingdom',
  'UAE',
  'Singapore',
  'Southeast Asia',
  'Europe',
  'International Markets',
] as const;

export const CORRIDOR_OPTIONS = [
  'India ↔ USA',
  'India ↔ UAE',
  'India ↔ UK',
  'India ↔ SEA',
  'Other',
] as const;

export const INTENT_OPTIONS = [
  'Closing Existing Deals',
  'New Deal Flow',
  'Buyer Introductions',
  'Investor Access',
  'Strategic Acquisitions',
  'Sell-Side Mandates',
  'Buy-Side Mandates',
  'Cross-Border Expansion',
  'Sector-Specific Opportunities',
  'Collaboration with Advisors',
] as const;

export const MANDATE_OPTIONS = [
  'Sell-Side Mandates',
  'Buy-Side Mandates',
  'Startup Fundraising',
  'Private Equity Fundraising',
  'Debt Funding',
  'Strategic Investor Search',
  'Investor Introductions',
  'Joint Venture (JV) Opportunities',
  'IPO / Pre-IPO Advisory',
  'NCLT Matters (IBC / Distressed Assets)',
  'Distressed Asset Transactions',
  'Cross-Border Transactions',
  'Business Valuation',
  'Strategic Partnerships',
  'Other',
] as const;

export const COLLABORATION_MODEL_OPTIONS = [
  'Revenue sharing',
  'Deal-by-deal',
  'Long-term partnerships',
] as const;

export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ─── Form Data Shape ────────────────────────────────────────────

export interface AdvisorRequirementItem {
  id?: string;
  slotIndex: number;
  sectors: string[];
  niche: string;
  cities: string[];
  revenue: string;
  details?: string;
  businessModels?: string[];
  dealStructures?: string[];
}

export interface ProfileFormData {
  // Moment 1: Basic Identity
  fullName: string;
  workEmail: string;
  phone: string;
  firmName: string;
  role: string;
  customRole: string;
  professionalCategory: string[];
  customCategory: string;
  avatarFile: File | null;
  profileImage: string;

  // Moment 2: Requirements (1 to 5 slots)
  requirements?: AdvisorRequirementItem[];

  // End User specific
  companyName: string;
  website: string;

  // Geography & Coverage
  baseCity: string;
  baseCountry: string;
  activeGeographies: string[];
  crossBorder: boolean;
  corridors: string[];
  customCorridor: string;

  // Expertise & Deal Capability
  primarySectors: string[];

  // Current Intent
  currentFocus: string[];
  expertiseDescription: string;

  // Moment 3: Client Mandates & Verification
  activeMandates: string[];
  coAdvisory: boolean;
  collaborationModels: string[];
  attachmentFile: File | null;
  attachmentUrl: string;
  additionalInfo: string;
  termsAccepted: boolean;

  // Metadata / Tokens / DB Aliases
  tokens?: number;
  profile_image?: string | null;
  profile_attachment_url?: string | null;
}

export const INITIAL_FORM_DATA: ProfileFormData = {
  fullName: '',
  workEmail: '',
  phone: '',
  firmName: '',
  role: '',
  customRole: '',
  professionalCategory: [],
  customCategory: '',
  avatarFile: null,
  profileImage: '',
  companyName: '',
  website: '',
  baseCity: '',
  baseCountry: '',
  activeGeographies: [],
  crossBorder: false,
  corridors: [],
  customCorridor: '',
  primarySectors: [],
  currentFocus: [],
  expertiseDescription: '',
  activeMandates: [],
  coAdvisory: false,
  collaborationModels: [],
  attachmentFile: null,
  attachmentUrl: '',
  additionalInfo: '',
  termsAccepted: false,
};

// ─── Step Configuration ─────────────────────────────────────────

export const STEPS = [
  { id: 1, label: 'Basic Identity', section: 'Section 1' },
  { id: 2, label: 'Geography & Coverage', section: 'Section 2' },
  { id: 3, label: 'Expertise', section: 'Section 3' },
  { id: 4, label: 'Current Intent', section: 'Section 4' },
  { id: 5, label: 'Client Mandates', section: 'Section 5' },
  { id: 6, label: 'Collaboration', section: 'Section 6' },
  { id: 7, label: 'Attachments', section: 'Section 7' },
  { id: 8, label: 'Additional Info', section: 'Section 8' },
  { id: 9, label: 'Terms and Conditions', section: 'Section 9' },
] as const;

export const TOTAL_STEPS = STEPS.length;

// ─── Validation Functions ───────────────────────────────────────

 
export const END_USER_INTENT_OPTIONS = [
  'Sell Business',
  'Raise Capital',
  'Find Strategic Partner',
  'Acquire a Business',
  'Other',
] as const;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  // Accepts international format with country code
  return /^\+?[\d\s()-]{7,20}$/.test(phone.trim());
}

export function isValidWebsite(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const formatted = url.includes('://') ? url : `http://${url}`;
    const parsed = new URL(formatted);
    return parsed.hostname.includes('.') && parsed.hostname.length > 3;
  } catch {
    return false;
  }
}

export function validateStep(step: number, data: ProfileFormData): ValidationError[] {
  const errors: ValidationError[] = [];
  const isBusinessPromoter = data.professionalCategory.includes('Business Owner / Promoter');

  if (isBusinessPromoter) {
    switch (step) {
      case 1: // Basic Identity
        if (!data.fullName.trim()) {
          errors.push({ field: 'fullName', message: 'Full Name is required' });
        }
        if (!data.workEmail.trim()) {
          errors.push({ field: 'workEmail', message: 'Work Email is required' });
        } else if (!isValidEmail(data.workEmail)) {
          errors.push({ field: 'workEmail', message: 'Enter a valid professional email address' });
        }
        if (!data.companyName.trim()) {
          errors.push({ field: 'companyName', message: 'Company / Business Name is required' });
        }
        if (!data.website.trim()) {
          errors.push({ field: 'website', message: 'Business Website is required' });
        } else if (!isValidWebsite(data.website)) {
          errors.push({ field: 'website', message: 'Enter a valid business website URL' });
        }
        if (data.phone.trim() && !isValidPhone(data.phone)) {
          errors.push({ field: 'phone', message: 'Enter a valid phone number with country code' });
        }
        break;

      case 2: // Business Details
        if (data.currentFocus.length === 0) {
          errors.push({ field: 'currentFocus', message: 'Select at least one intent' });
        }
        if (data.primarySectors.length > 5) {
          errors.push({ field: 'primarySectors', message: 'Maximum 5 industry sectors allowed' });
        }
        // Requirement 17: No minimum character restriction on expertiseDescription
        break;

      case 3: // Terms and Conditions
        if (!data.termsAccepted) {
          errors.push({ field: 'termsAccepted', message: 'You must accept the Terms of Service & Privacy Policy' });
        }
        break;
    }
    return errors;
  }

  switch (step) {
    case 1: // Moment 1: Identity
      if (!data.fullName.trim()) {
        errors.push({ field: 'fullName', message: 'Full Name is required' });
      }
      if (!data.workEmail.trim()) {
        errors.push({ field: 'workEmail', message: 'Work Email is required' });
      } else if (!isValidEmail(data.workEmail)) {
        errors.push({ field: 'workEmail', message: 'Enter a valid professional email address' });
      }
      if (!data.phone.trim()) {
        errors.push({ field: 'phone', message: 'Phone Number is required' });
      } else if (!isValidPhone(data.phone)) {
        errors.push({ field: 'phone', message: 'Enter a valid phone number with country code' });
      }
      if (!data.role) {
        errors.push({ field: 'role', message: 'Role is required' });
      }
      if (data.role === 'Other' && !data.customRole.trim()) {
        errors.push({ field: 'customRole', message: 'Please specify your role' });
      }
      if (!data.baseCity.trim()) {
        errors.push({ field: 'baseCity', message: 'Base city is required' });
      }
      if (data.professionalCategory.length === 0) {
        errors.push({ field: 'professionalCategory', message: 'Select at least one Professional Category' });
      }
      if (data.professionalCategory.includes('Other') && !data.customCategory.trim()) {
        errors.push({ field: 'customCategory', message: 'Please specify your category' });
      }
      break;

    case 2: // Moment 2: Requirements (Slots are optional for profile submission)
      break;

    case 3: // Moment 3: Verification
      if (!data.termsAccepted) {
        errors.push({ field: 'termsAccepted', message: 'You must accept the Terms of Service & Privacy Policy' });
      }
      break;
  }

  return errors;
}

/**
 * Validate the entire form (used on final submit / backend)
 */
export function validateFullProfile(data: ProfileFormData): ValidationError[] {
  const allErrors: ValidationError[] = [];
  const isBusinessPromoter = data.professionalCategory.includes('Business Owner / Promoter');
  const totalSteps = isBusinessPromoter ? 3 : 3;
  for (let step = 1; step <= totalSteps; step++) {
    allErrors.push(...validateStep(step, data));
  }
  return allErrors;
}

/**
 * Check if a specific step passes validation
 */
export function isStepValid(step: number, data: ProfileFormData): boolean {
  return validateStep(step, data).length === 0;
}

import { getProfileCompletion } from '../profileCompletion';

/**
 * Calculate profile completion percentage using canonical definition
 */
export function calculateProgress(data: ProfileFormData): number {
  return getProfileCompletion(data).percentage;
}

