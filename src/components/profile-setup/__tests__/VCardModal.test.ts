import { describe, it, expect } from 'vitest';
import { buildVCardText, vcardEscape } from '../VCardModal';

describe('vcardEscape — RFC 6350 field escaping', () => {
  it('escapes commas, semicolons, backslashes, and newlines', () => {
    expect(vcardEscape('Doe, John; Sr.')).toBe('Doe\\, John\\; Sr.');
    expect(vcardEscape('C:\\path')).toBe('C:\\\\path');
    expect(vcardEscape('line1\nline2')).toBe('line1\\nline2');
  });
});

describe('buildVCardText — produces a valid minimal vCard 3.0 record', () => {
  it('includes all provided fields', () => {
    const text = buildVCardText({
      name: 'Jane Doe',
      phone: '+91 98765 43210',
      email: 'jane@example.com',
      company: 'Acme Capital',
      role: 'Managing Partner',
      place: 'Mumbai, India',
      sectors: ['SaaS', 'Manufacturing'],
    });

    expect(text).toContain('BEGIN:VCARD');
    expect(text).toContain('VERSION:3.0');
    expect(text).toContain('FN:Jane Doe');
    expect(text).toContain('ORG:Acme Capital');
    expect(text).toContain('TITLE:Managing Partner');
    expect(text).toContain('TEL;TYPE=CELL:+91 98765 43210');
    expect(text).toContain('EMAIL:jane@example.com');
    expect(text).toContain('ADR;TYPE=WORK:;;;Mumbai\\, India;;;');
    expect(text).toContain('SaaS\\, Manufacturing');
    expect(text).toContain('END:VCARD');
  });

  it('omits optional fields cleanly when absent', () => {
    const text = buildVCardText({
      name: 'Jane Doe',
      phone: null,
      email: 'jane@example.com',
      company: null,
      role: null,
      place: null,
      sectors: [],
    });

    expect(text).not.toContain('ORG:');
    expect(text).not.toContain('TITLE:');
    expect(text).not.toContain('TEL;');
    expect(text).not.toContain('ADR;');
    expect(text).toContain('FN:Jane Doe');
    expect(text).toContain('EMAIL:jane@example.com');
  });
});
