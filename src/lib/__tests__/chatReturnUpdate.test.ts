import { describe, it, expect } from 'vitest';
import {
  evaluateReturningUserUpdate,
  isMeaningfulConversation,
  MANDATORY_CLOSING_PROMPT,
} from '../chatReturnUpdate';

describe('evaluateReturningUserUpdate — returning user 3-4 day update', () => {
  const fixedNow = new Date('2026-09-01T12:00:00.000Z');

  it('State 1: First-time user has no previous sessions -> shouldShow is false', () => {
    const res = evaluateReturningUserUpdate({
      sessions: [],
      referenceNow: fixedNow,
    });
    expect(res.shouldShow).toBe(false);
    expect(res.reason).toBe('first-time-user');
  });

  it('State 2: Returning user within 3 days (< 72 hours) -> shouldShow is false', () => {
    // 1 day ago
    const oneDayAgo = new Date(fixedNow.getTime() - 24 * 3600 * 1000).toISOString();
    const res = evaluateReturningUserUpdate({
      sessions: [{ id: 's1', title: 'Pharma Buy-side', createdAt: oneDayAgo }],
      referenceNow: fixedNow,
    });
    expect(res.shouldShow).toBe(false);
    expect(res.reason).toBe('returned-within-3-days');
  });

  it('State 3: Returning user after 3-4 days (>= 72 hours) -> shouldShow is true with exact prompt', () => {
    // 3.5 days ago (84 hours)
    const threeAndHalfDaysAgo = new Date(fixedNow.getTime() - 84 * 3600 * 1000).toISOString();
    const res = evaluateReturningUserUpdate({
      sessions: [{ id: 's1', title: 'Solar Tech Mandate', createdAt: threeAndHalfDaysAgo }],
      lastSessionMessages: [
        { role: 'user', content: 'Looking for a Series A solar tech company in India' },
        { role: 'assistant', content: 'Understood. Searching for matches...' },
      ],
      referenceNow: fixedNow,
    });

    expect(res.shouldShow).toBe(true);
    expect(res.updateMessage).toContain('Solar Tech Mandate');
    expect(res.updateMessage).toContain(MANDATORY_CLOSING_PROMPT);
    expect(res.updateMessage?.endsWith(MANDATORY_CLOSING_PROMPT)).toBe(true);
  });

  it('State 4: Returning user after 3-4 days but previous conversation was not meaningful -> shouldShow is false', () => {
    const fourDaysAgo = new Date(fixedNow.getTime() - 96 * 3600 * 1000).toISOString();
    const res = evaluateReturningUserUpdate({
      sessions: [{ id: 's1', title: 'New Conversation', createdAt: fourDaysAgo }],
      lastSessionMessages: [
        { role: 'user', content: 'hi' },
      ],
      referenceNow: fixedNow,
    });

    expect(res.shouldShow).toBe(false);
    expect(res.reason).toBe('no-meaningful-conversation');
  });

  it('isMeaningfulConversation correctly distinguishes real deals from one-word greetings', () => {
    expect(isMeaningfulConversation([])).toBe(false);
    expect(isMeaningfulConversation([{ role: 'user', content: 'hello' }])).toBe(false);
    expect(isMeaningfulConversation([
      { role: 'user', content: 'We want to sell 100% equity in an EV charging company for 50 Cr' },
      { role: 'assistant', content: 'Great, let us qualify the deal.' }
    ])).toBe(true);
  });

  it('closing prompt matches the exact required phrasing', () => {
    expect(MANDATORY_CLOSING_PROMPT).toBe('Do you have any new requirement? If yes, please share it with us.');
  });
});
