import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import EOIContributionModal from '../EOIContributionModal';

describe('EOIContributionModal Component (Server & Content Verification)', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToString(<EOIContributionModal isOpen={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('renders exact requested copy and replaces legacy "OKAY" button with "☕ Buy Us a Coffee"', () => {
    const html = renderToString(<EOIContributionModal isOpen={true} onClose={() => {}} />);

    // Check header and success notice
    expect(html).toContain('Introduction sent successfully');
    expect(html).toContain('We hope this introduction leads to something meaningful.');

    // Check exact copy body
    expect(html).toContain('Maybe a conversation.');
    expect(html).toContain('Maybe a collaboration.');
    expect(html).toContain('Maybe a deal.');
    expect(html).toContain('If you believe in what we’re building, help us keep it alive.');
    expect(html).toContain('Your small contribution helps us keep DealCollab free for the community.');

    // Check primary button is ☕ Buy Us a Coffee
    expect(html).toContain('data-testid="buy-us-a-coffee-btn"');
    expect(html).toContain('☕ Buy Us a Coffee');

    // Verify old "OKAY" button is GONE
    expect(html).not.toMatch(/>\s*OKAY\s*</i);
    expect(html).not.toMatch(/>\s*Okay\s*</i);
  });
});
