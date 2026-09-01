import { describe, it, expect } from 'vitest';
import { getProfileCompletion, calculateProfileCompletion, type ProfileUser } from '../profileCompletion';

describe('Canonical Profile Completion & Synchronization Suite', () => {
  const completeAdvisorProfile: ProfileUser = {
    name: 'Jane Doe',
    email: 'jane@advisory.com',
    phone: '+919876543210',
    role: 'Founder / Partner',
    category: ['M&A Advisor'],
    base_city: 'Mumbai',
    base_country: 'India',
    geographies: ['India', 'United States'],
    sectors: ['Technology', 'Financial Services'],
    intent: ['Closing Existing Deals'],
    expertise_description: 'We specialize in mid-market cross-border technology and healthcare M&A advisory transactions across India and US corridors.',
    active_mandates: ['Sell-Side Mandates'],
    co_advisory: true,
    terms_accepted: true,
  };

  const completeBusinessPromoterProfile: ProfileUser = {
    name: 'Rajesh Sharma',
    email: 'rajesh@fintechscale.com',
    category: ['Business Owner / Promoter'],
    company_name: 'FinTechScale Pvt Ltd',
    website: 'https://fintechscale.com',
    intent: ['Buyer Introductions', 'Strategic Acquisitions'],
    terms_accepted: true,
  };

  describe('Canonical Calculation Rules', () => {
    it('TEST 1: 100% complete advisor profile returns isComplete=true and percentage=100', () => {
      const res = getProfileCompletion(completeAdvisorProfile);
      expect(res.percentage).toBe(100);
      expect(res.isComplete).toBe(true);
      expect(res.missingFields).toHaveLength(0);
      expect(calculateProfileCompletion(completeAdvisorProfile)).toBe(100);
    });

    it('TEST 1b: 100% complete business promoter profile returns isComplete=true and percentage=100', () => {
      const res = getProfileCompletion(completeBusinessPromoterProfile);
      expect(res.percentage).toBe(100);
      expect(res.isComplete).toBe(true);
      expect(res.missingFields).toHaveLength(0);
    });

    it('TEST 2: Incomplete profile (missing terms or description < 60 chars) returns isComplete=false and percentage < 100', () => {
      const incompleteProfile: ProfileUser = {
        ...completeAdvisorProfile,
        expertise_description: 'Too short', // less than 60 chars
      };
      const res = getProfileCompletion(incompleteProfile);
      expect(res.isComplete).toBe(false);
      expect(res.percentage).toBeLessThan(100);
      expect(res.missingFields).toContain('expertise_description');
    });

    it('TEST 2b: Incomplete profile missing terms acceptance returns isComplete=false', () => {
      const unacceptedTerms: ProfileUser = {
        ...completeAdvisorProfile,
        terms_accepted: false,
      };
      const res = getProfileCompletion(unacceptedTerms);
      expect(res.isComplete).toBe(false);
      expect(res.missingFields).toContain('terms_accepted');
    });

    it('TEST 5: profile_completed_once in DB strictly overrides and returns 100% isComplete=true', () => {
      const staleUserWithCompletedFlag: ProfileUser = {
        profile_completed_once: true,
        name: 'Jane Doe',
      };
      const res = getProfileCompletion(staleUserWithCompletedFlag);
      expect(res.isComplete).toBe(true);
      expect(res.percentage).toBe(100);
      expect(res.missingFields).toHaveLength(0);
    });

    it('Handles null or undefined gracefully without crashing', () => {
      expect(getProfileCompletion(null).isComplete).toBe(false);
      expect(getProfileCompletion(undefined).isComplete).toBe(false);
      expect(calculateProfileCompletion(null)).toBe(0);
    });
  });

  describe('UI & EOI Eligibility Simulation & State Transitions', () => {
    function evaluateEOIEvaluation(state: {
      isProfileLoading: boolean;
      profile: ProfileUser | null;
      dbProfileCompletedOnce?: boolean;
    }) {
      if (state.isProfileLoading) {
        return {
          shouldRenderWarning: false, // Must NOT render warning prematurely during loading
          canSendEOI: false,
          status: 'LOADING',
        };
      }

      const canonical = getProfileCompletion(state.profile);
      const isComplete = canonical.isComplete || !!state.dbProfileCompletedOnce || (state.profile?.profileCompletion ?? 0) >= 100;

      return {
        shouldRenderWarning: !isComplete,
        canSendEOI: isComplete,
        status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
        percentage: isComplete ? 100 : canonical.percentage,
      };
    }

    it('TEST 3: When profile is loading, EOI completion warning is NOT rendered prematurely', () => {
      const initialLoad = evaluateEOIEvaluation({
        isProfileLoading: true,
        profile: null,
      });
      expect(initialLoad.shouldRenderWarning).toBe(false);
      expect(initialLoad.status).toBe('LOADING');
    });

    it('TEST 4: State transition from incomplete -> complete removes warning and enables EOI', () => {
      // Incomplete state
      const beforeSave = evaluateEOIEvaluation({
        isProfileLoading: false,
        profile: { ...completeAdvisorProfile, terms_accepted: false },
      });
      expect(beforeSave.shouldRenderWarning).toBe(true);
      expect(beforeSave.canSendEOI).toBe(false);

      // User submits step 9, save completes, state refreshed
      const afterSave = evaluateEOIEvaluation({
        isProfileLoading: false,
        profile: completeAdvisorProfile,
      });
      expect(afterSave.shouldRenderWarning).toBe(false);
      expect(afterSave.canSendEOI).toBe(true);
      expect(afterSave.percentage).toBe(100);
    });

    it('TEST 6 & 8: Browser refresh after profile completion retains 100% complete state and hides warning', () => {
      const refreshedState = evaluateEOIEvaluation({
        isProfileLoading: false,
        profile: {
          ...completeAdvisorProfile,
          profile_completed_once: true,
          profile_completion: 100,
        },
        dbProfileCompletedOnce: true,
      });
      expect(refreshedState.shouldRenderWarning).toBe(false);
      expect(refreshedState.canSendEOI).toBe(true);
      expect(refreshedState.percentage).toBe(100);
    });

    it('TEST 7: Genuinely incomplete new user continues to see the completion prompt', () => {
      const newIncompleteUser = evaluateEOIEvaluation({
        isProfileLoading: false,
        profile: {
          name: 'New User',
          email: 'new@dealcollab.org',
          phone: '',
          category: [],
        },
      });
      expect(newIncompleteUser.shouldRenderWarning).toBe(true);
      expect(newIncompleteUser.canSendEOI).toBe(false);
      expect(newIncompleteUser.percentage).toBeLessThan(100);
    });
  });
});
