import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import IdentityCard, { type IdentityCardData } from '../IdentityCard';

describe('IdentityCard Unified Component (Server Rendering & Data Guard)', () => {
  const samplePublicData: IdentityCardData = {
    fullName: 'Rohan Mehta',
    initials: 'RM',
    designation: 'Managing Partner',
    organisation: 'Meridian Advisory Partners',
    headline: 'Sell-side for founder-led SaaS and healthtech.',
    mandateSide: 'Sell-side',
    ticketBand: '₹20–250 Cr',
    closedCount: '34 mandates',
    expertise: ['Sell-side M&A', 'Carve-outs', 'Founder exits'],
    sectors: ['B2B SaaS', 'Healthtech', 'Fintech infra', 'D2C'],
    geographies: ['India', 'GCC', 'Southeast Asia'],
    phone: '+91 98204 41180',
    email: 'rohan@meridianap.in',
    location: 'Mumbai, India',
    isVerified: true,
    verifiedCode: '1042',
    profileSlug: 'usr_rohan',
  };

  it('renders public card markup with public fields and no disclosure alert', () => {
    const html = renderToString(<IdentityCard mode="public" data={samplePublicData} />);

    expect(html).toContain('data-testid="identity-card-public"');
    expect(html).toContain('Rohan Mehta');
    expect(html).toContain('Meridian Advisory Partners');
    expect(html).toContain('+91 98204 41180');
    expect(html).toContain('rohan@meridianap.in');
    expect(html).not.toContain('CONFIDENTIAL DISCLOSURE');
    expect(html).not.toContain('INTENT FIT');
  });

  it('renders locked counterparty card without confidential details (phone, email, real name)', () => {
    const lockedData: IdentityCardData = {
      fullName: null,
      designation: 'Senior advisor · boutique firm · West India',
      mandateSide: 'Sell-side',
      ticketBand: '₹20–250 Cr',
      closedCount: '34 mandates',
      expertise: ['Sell-side M&A', 'Carve-outs', 'Founder exits'],
      sectors: ['B2B SaaS', 'Healthtech', 'Fintech infra', 'D2C'],
      geographies: ['India', 'GCC', 'Southeast Asia'],
      location: 'Mumbai region',
      intentFitScore: 82,
      matchedMandateText: 'MATCHED ON DC-M-0912 · SELL-SIDE · B2B SAAS · ₹80–120 CR',
    };

    const html = renderToString(
      <IdentityCard
        mode="locked"
        data={lockedData}
        actionLabel="Approve EOI to reveal identity"
        onAction={() => {}}
      />
    );

    expect(html).toContain('data-testid="identity-card-locked"');
    expect(html).toContain('82<!-- -->%');
    expect(html).toContain('INTENT FIT');
    expect(html).toContain('Senior advisor');
    expect(html).toContain('Mumbai region');
    expect(html).toContain('SEALED');
    expect(html).toContain('Approve EOI to reveal identity');

    // Verify confidential fields are NOT rendered in the markup
    expect(html).not.toContain('Rohan Mehta');
    expect(html).not.toContain('+91 98204 41180');
    expect(html).not.toContain('rohan@meridianap.in');
  });

  it('renders post-EOI disclosure card with orange alert bar and revealed contact details', () => {
    const disclosureData: IdentityCardData = {
      ...samplePublicData,
      eoiReference: '4417',
      disclosureTimestamp: '19 SEP 2026 · 14:22 IST',
      releasedToName: 'Ananya Rao',
      releasedToFirm: 'Kestrel Partners',
      matchReference: 'DC-M-0912 · Sell-side · B2B SaaS · ₹80–120 Cr',
    };

    const html = renderToString(<IdentityCard mode="disclosure" data={disclosureData} />);

    expect(html).toContain('data-testid="identity-card-disclosure"');
    expect(html).toContain('CONFIDENTIAL DISCLOSURE');
    expect(html).toContain('4417');
    expect(html).toContain('19 SEP 2026');
    expect(html).toContain('14:22 IST');
    expect(html).toContain('Rohan Mehta');
    expect(html).toContain('+91 98204 41180');
    expect(html).toContain('RELEASED TO');
    expect(html).toContain('ANANYA RAO');
  });
});
