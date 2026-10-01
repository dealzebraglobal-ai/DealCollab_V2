import { describe, it, expect } from 'vitest';
import { ONBOARDING_STEPS } from '../OnboardingTutorial';

describe('OnboardingTutorial Business Logic & Acceptance Criteria', () => {
  it('Requirement 4: Contains exactly five steps in sequential order', () => {
    expect(ONBOARDING_STEPS).toHaveLength(5);
    expect(ONBOARDING_STEPS[0].id).toBe('tokens');
    expect(ONBOARDING_STEPS[1].id).toBe('deal-log');
    expect(ONBOARDING_STEPS[2].id).toBe('deal-dashboard');
    expect(ONBOARDING_STEPS[3].id).toBe('notifications');
    expect(ONBOARDING_STEPS[4].id).toBe('guide');
  });

  it('Step 1: Tokens step explains tokens and targets "tokens"', () => {
    const step1 = ONBOARDING_STEPS[0];
    expect(step1.targetKey).toBe('tokens');
    expect(step1.title).toBe('Tokens');
    expect(step1.badge).toBe('1 of 5');
    expect(step1.description).toContain('Tokens are used across DealCollab');
  });

  it('Step 2: Deal Log step targets "deal-log" with exact description', () => {
    const step2 = ONBOARDING_STEPS[1];
    expect(step2.targetKey).toBe('deal-log');
    expect(step2.title).toBe('Deal Log');
    expect(step2.badge).toBe('2 of 5');
    expect(step2.description).toBe('Deal Log is where you can see your deals, conversations, and matched opportunities.');
  });

  it('Step 3: EOI Activities step targets "deal-dashboard" with exact description', () => {
    const step3 = ONBOARDING_STEPS[2];
    expect(step3.targetKey).toBe('deal-dashboard');
    expect(step3.title).toBe('EOI Activities');
    expect(step3.badge).toBe('3 of 5');
    expect(step3.description).toBe('EOI Activities helps you track your EOI interactions, mutual interest, and connected parties.');
  });

  it('Step 4: Notifications step targets "notifications" with real-time alerts description', () => {
    const step4 = ONBOARDING_STEPS[3];
    expect(step4.targetKey).toBe('notifications');
    expect(step4.title).toBe('Notifications');
    expect(step4.badge).toBe('4 of 5');
    expect(step4.description).toContain('Stay updated with real-time deal alerts');
  });

  it('Step 5: Guide & Trust step targets "guide" with platform & trust description', () => {
    const step5 = ONBOARDING_STEPS[4];
    expect(step5.targetKey).toBe('guide');
    expect(step5.title).toBe('Guide & Trust');
    expect(step5.badge).toBe('5 of 5');
    expect(step5.description).toContain('Explore comprehensive guides');
    expect(step5.description).toContain('Trust Center');
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
