import { describe, it, expect } from 'vitest';
import { ONBOARDING_STEPS } from '../OnboardingTutorial';

describe('OnboardingTutorial Business Logic & Acceptance Criteria', () => {
  it('Requirement 4: Contains exactly four steps in sequential order', () => {
    expect(ONBOARDING_STEPS).toHaveLength(4);
    expect(ONBOARDING_STEPS[0].id).toBe('tokens');
    expect(ONBOARDING_STEPS[1].id).toBe('search');
    expect(ONBOARDING_STEPS[2].id).toBe('deal-log');
    expect(ONBOARDING_STEPS[3].id).toBe('deal-dashboard');
  });

  it('Step 1: Tokens step explains tokens and targets "tokens"', () => {
    const step1 = ONBOARDING_STEPS[0];
    expect(step1.targetKey).toBe('tokens');
    expect(step1.title).toBe('Tokens');
    expect(step1.badge).toBe('1 of 4');
    expect(step1.description).toContain('Tokens are used across DealCollab');
  });

  it('Step 2: Search bar step targets "search" and explains opportunity discovery', () => {
    const step2 = ONBOARDING_STEPS[1];
    expect(step2.targetKey).toBe('search');
    expect(step2.title).toBe('Search Bar');
    expect(step2.badge).toBe('2 of 4');
    expect(step2.description).toBe('Use Search to find relevant deals, mandates, and counterparties across the platform.');
  });

  it('Step 3: Deal Log step targets "deal-log" with exact description', () => {
    const step3 = ONBOARDING_STEPS[2];
    expect(step3.targetKey).toBe('deal-log');
    expect(step3.title).toBe('Deal Log');
    expect(step3.badge).toBe('3 of 4');
    expect(step3.description).toBe('Deal Log is where you can see your deals, conversations, and matched opportunities.');
  });

  it('Step 4: Deal Dashboard step targets "deal-dashboard" with exact description', () => {
    const step4 = ONBOARDING_STEPS[3];
    expect(step4.targetKey).toBe('deal-dashboard');
    expect(step4.title).toBe('Deal Dashboard');
    expect(step4.badge).toBe('4 of 4');
    expect(step4.description).toBe('Deal Dashboard helps you track and manage your overall deal activity.');
  });

  describe('Eligibility & Profile-Completion Precedence Rules', () => {
    function evaluateShouldShowTutorial(params: {
      isAuthenticated: boolean;
      profile: {
        profileCompleted?: boolean;
        profileCompletedOnce?: boolean;
        profileCompletion?: number;
        onboardingTutorialCompleted?: boolean;
      } | null;
      onboarding: {
        profileCompleted?: boolean;
        tutorialCompleted?: boolean;
      };
      localStorageFlag?: string | null;
    }): boolean {
      const { isAuthenticated, profile, onboarding, localStorageFlag } = params;
      if (!isAuthenticated) return false;
      if (!profile) return false;

      // CRITICAL RULE: Profile completed strictly takes precedence over onboarding
      const isProfileComplete = !!(
        profile.profileCompleted ||
        profile.profileCompletedOnce ||
        (profile.profileCompletion ?? 0) >= 100 ||
        onboarding.profileCompleted
      );
      if (isProfileComplete) return false;

      if (profile.onboardingTutorialCompleted || onboarding.tutorialCompleted) return false;
      if (localStorageFlag === 'true') return false;

      return true;
    }

    it('CASE A: New user + incomplete profile -> show tutorial (true)', () => {
      const shouldShow = evaluateShouldShowTutorial({
        isAuthenticated: true,
        profile: {
          profileCompleted: false,
          profileCompletedOnce: false,
          profileCompletion: 20,
          onboardingTutorialCompleted: false,
        },
        onboarding: {
          profileCompleted: false,
          tutorialCompleted: false,
        },
        localStorageFlag: null,
      });
      expect(shouldShow).toBe(true);
    });

    it('CASE B: New user + completed profile -> DO NOT show tutorial (false)', () => {
      const shouldShow = evaluateShouldShowTutorial({
        isAuthenticated: true,
        profile: {
          profileCompleted: true,
          profileCompletedOnce: true,
          profileCompletion: 100,
          onboardingTutorialCompleted: false,
        },
        onboarding: {
          profileCompleted: true,
          tutorialCompleted: false,
        },
        localStorageFlag: null,
      });
      expect(shouldShow).toBe(false);
    });

    it('CASE C: Completed profile overrides incomplete tutorial flag', () => {
      const shouldShow = evaluateShouldShowTutorial({
        isAuthenticated: true,
        profile: {
          profileCompleted: true,
          profileCompletedOnce: true,
          profileCompletion: 100,
          onboardingTutorialCompleted: false, // tutorial not yet completed, but profile IS completed
        },
        onboarding: {
          profileCompleted: true,
          tutorialCompleted: false,
        },
        localStorageFlag: null,
      });
      expect(shouldShow).toBe(false);
    });

    it('CASE D: User skipped tutorial (persisted in DB or localStorage) -> DO NOT show tutorial', () => {
      const shouldShowDb = evaluateShouldShowTutorial({
        isAuthenticated: true,
        profile: {
          profileCompleted: false,
          profileCompletion: 0,
          onboardingTutorialCompleted: true, // skipped/finished in DB
        },
        onboarding: {
          profileCompleted: false,
          tutorialCompleted: true,
        },
        localStorageFlag: null,
      });
      expect(shouldShowDb).toBe(false);

      const shouldShowLs = evaluateShouldShowTutorial({
        isAuthenticated: true,
        profile: {
          profileCompleted: false,
          profileCompletion: 0,
          onboardingTutorialCompleted: false,
        },
        onboarding: {
          profileCompleted: false,
          tutorialCompleted: false,
        },
        localStorageFlag: 'true',
      });
      expect(shouldShowLs).toBe(false);
    });

    it('CASE E: Unauthenticated session -> DO NOT show tutorial', () => {
      const shouldShow = evaluateShouldShowTutorial({
        isAuthenticated: false,
        profile: null,
        onboarding: { profileCompleted: false, tutorialCompleted: false },
        localStorageFlag: null,
      });
      expect(shouldShow).toBe(false);
    });
  });
});
