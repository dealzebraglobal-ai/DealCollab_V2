'use client';

import React, { useEffect, useState } from 'react';
import {
  Lock,
  ShieldCheck,
  Download,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import QRCode from 'qrcode';
import { exportIdentityCardToPNG } from '@/lib/identityCardExport';
import { buildPublicProfileUrl } from '@/lib/publicProfileUrl';

export type IdentityCardMode = 'public' | 'locked' | 'disclosure';

export interface IdentityCardData {
  photoUrl?: string | null;
  fullName?: string | null;
  initials?: string | null;
  designation?: string | null;
  organisation?: string | null;
  headline?: string | null;
  mandateSide?: string | null;
  ticketBand?: string | null;
  closedCount?: number | string | null;
  expertise?: string[];
  sectors?: string[];
  geographies?: string[];
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  city?: string | null;
  country?: string | null;
  isVerified?: boolean;
  verifiedCode?: string | null;
  profileSlug?: string | null;

  // Locked mode specifics
  intentFitScore?: number | null;
  matchReference?: string | null;
  matchedMandateText?: string | null;

  // Disclosure mode specifics
  eoiReference?: string | null;
  disclosureTimestamp?: string | null;
  releasedToName?: string | null;
  releasedToFirm?: string | null;
}

export interface IdentityCardProps {
  mode: IdentityCardMode;
  data: IdentityCardData;
  onAction?: () => void;
  actionLoading?: boolean;
  actionLabel?: string;
  className?: string;
  showExportButtons?: boolean;
}

export default function IdentityCard({
  mode,
  data,
  onAction,
  actionLoading = false,
  actionLabel,
  className = '',
  showExportButtons = true,
}: IdentityCardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Reset the broken-image flag when the photo itself changes, without a
  // cascading-render effect (React's "adjust state while rendering" pattern).
  const [lastPhotoUrl, setLastPhotoUrl] = useState(data.photoUrl);
  if (data.photoUrl !== lastPhotoUrl) {
    setLastPhotoUrl(data.photoUrl);
    setPhotoFailed(false);
  }

  const isDisclosure = mode === 'disclosure';
  const isLocked = mode === 'locked';
  const isPublic = mode === 'public';

  // Only the public card is ever safe to encode into a QR — locked/disclosure
  // cards carry counterparty data that must stay behind auth + EOI approval.
  const qrTargetUrl = isPublic && data.profileSlug ? buildPublicProfileUrl(data.profileSlug) : null;

  useEffect(() => {
    let cancelled = false;
    if (!qrTargetUrl) {
      return;
    }
    QRCode.toDataURL(qrTargetUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => {
        console.error('QR generation failed:', err);
        if (!cancelled) setQrDataUrl(null);
      });
    return () => { cancelled = true; };
  }, [qrTargetUrl]);

  const showPhoto = !!data.photoUrl && !photoFailed;

  // Compute initials fallback
  const initials =
    data.initials ||
    (data.fullName
      ? data.fullName
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : 'DC');

  // Hard cap on bio (120 chars)
  const bio = data.headline ? data.headline.slice(0, 120) : null;

  // Expertise (top 3)
  const expertise = data.expertise && data.expertise.length > 0
    ? data.expertise.slice(0, 3)
    : [];

  // Sectors (top 4)
  const sectors = data.sectors && data.sectors.length > 0
    ? data.sectors.slice(0, 4)
    : [];

  // Geographies (top 3)
  const geos = data.geographies && data.geographies.length > 0
    ? data.geographies.slice(0, 3)
    : [];

  const locationText = data.location || [data.city, data.country].filter(Boolean).join(', ') || null;

  const handleExportPNG = async () => {
    try {
      setIsExporting(true);
      await exportIdentityCardToPNG({
        mode,
        fullName: data.fullName || undefined,
        initials,
        photoUrl: showPhoto ? data.photoUrl || undefined : undefined,
        qrDataUrl: qrDataUrl || undefined,
        designation: data.designation || undefined,
        organisation: data.organisation || undefined,
        headline: bio || undefined,
        mandateSide: data.mandateSide || undefined,
        ticketBand: data.ticketBand || undefined,
        closedCount: data.closedCount || undefined,
        expertise,
        sectors,
        geographies: geos,
        phone: data.phone || undefined,
        email: data.email || undefined,
        location: locationText || (isLocked ? 'West India region' : undefined),
        verifiedCode: data.verifiedCode || undefined,
        isVerified: data.isVerified,
        intentFitScore: data.intentFitScore || undefined,
        matchReference: data.matchReference || undefined,
        eoiReference: data.eoiReference || undefined,
        timestamp: data.disclosureTimestamp || undefined,
        releasedTo: data.releasedToName
          ? `${data.releasedToName}${data.releasedToFirm ? ` · ${data.releasedToFirm}` : ''}`
          : undefined,
      }, `dealcollab-${mode}-card.png`);
    } catch (err) {
      console.error('PNG Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`flex flex-col items-center w-full max-w-[420px] mx-auto ${className}`}>
      {/* Top Action Bar (Download Button) */}
      {showExportButtons && (
        <div className="w-full flex items-center justify-between pb-3 px-1 text-xs text-[#747775]">
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">
            {isPublic && 'Share card · public'}
            {isLocked && 'Counterparty Card · Locked'}
            {isDisclosure && 'Disclosure card · post-EOI'}
          </span>
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#F3F4F6] text-[#1F1F1F] border border-[#E5E7EB] rounded-lg font-bold text-[11px] uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Download high-resolution 1200x2160 PNG"
          >
            <Download size={13} className="text-[#FF6A00]" />
            <span>{isExporting ? 'Exporting…' : 'PNG (1200×2160)'}</span>
          </button>
        </div>
      )}

      {/* The Unified Card Body */}
      <div
        data-testid={`identity-card-${mode}`}
        className={`w-full rounded-[28px] overflow-hidden transition-all duration-300 relative shadow-2xl ${
          isDisclosure
            ? 'bg-[#F1EFE9] text-[#111827] border border-[#E2DFD7]'
            : 'bg-[#0E1114] text-white border border-white/10'
        }`}
        style={{
          minHeight: '620px',
        }}
      >
        {/* DISCLOSURE STATE: Orange Top Alert Bar */}
        {isDisclosure && (
          <div className="w-full bg-[#FFA100] px-6 py-2.5 flex items-center justify-between text-black text-[10px] sm:text-[11px] font-bold tracking-wider font-mono">
            <span>
              CONFIDENTIAL DISCLOSURE · EOI {data.eoiReference || 'AUTHENTICATED'}
            </span>
            <span>
              {data.disclosureTimestamp || '19 SEP 2026 · IST'}
            </span>
          </div>
        )}

        {/* DISCLOSURE STATE: Subtle Repeated Watermark Background */}
        {isDisclosure && (
          <div className="absolute inset-0 pointer-events-none opacity-[0.035] flex items-center justify-center select-none overflow-hidden rotate-[-28deg]">
            <p className="text-2xl font-black font-mono tracking-widest leading-loose text-center">
              RELEASED TO {data.releasedToName?.toUpperCase() || 'AUTHORIZED RECIPIENT'}{' '}
              · SINGLE-RECIPIENT COPY · EOI {data.eoiReference || '4417'}
              <br />
              CONFIDENTIAL · DO NOT DISTRIBUTE
            </p>
          </div>
        )}

        {/* DARK STATES (Public & Locked): Subtle Globe Ambient Graphic */}
        {!isDisclosure && (
          <>
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFA100]/10 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
            <div className="absolute right-[-40px] top-[140px] w-60 h-60 rounded-full border border-white/5 pointer-events-none" />
            <div className="absolute right-[-20px] top-[160px] w-44 h-44 rounded-full border border-white/5 pointer-events-none" />
          </>
        )}

        {/* INNER CONTENT CONTAINER */}
        <div className="p-6 sm:p-7 relative z-10 flex flex-col justify-between h-full space-y-6">
          {/* HEADER ROW: Avatar / Initial Box + Verification Status */}
          <div>
            <div className="flex items-start justify-between">
              {/* Avatar / Seal */}
              {isLocked ? (
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FFA100] shadow-inner">
                  <Lock size={26} className="text-white/70" />
                </div>
              ) : showPhoto ? (
                <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm border border-white/10 shrink-0">
                  <img
                    src={data.photoUrl || undefined}
                    alt={data.fullName || 'Profile photo'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoFailed(true)}
                  />
                </div>
              ) : (
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center font-serif text-2xl font-medium shadow-sm ${
                    isDisclosure
                      ? 'bg-[#E2DFD7] text-[#262626] border border-[#D5D2C9]'
                      : 'bg-white/10 text-white border border-white/10'
                  }`}
                  style={{ fontFamily: 'var(--font-serif-card, Georgia, serif)' }}
                >
                  {initials}
                </div>
              )}

              {/* Verified Badge & DC Code */}
              <div className="text-right font-mono">
                <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-wider text-[#FFA100]">
                  <ShieldCheck size={12} />
                  <span className={isDisclosure ? 'text-[#1F1F1F]' : 'text-white/80'}>
                    {isDisclosure ? 'ID VERIFIED' : 'VERIFIED'}
                  </span>
                </div>
                <p className="text-[10px] text-white/50 tracking-wider mt-0.5">
                  {isLocked ? 'DC · ****' : `DC · ${data.verifiedCode || '1042'}`}
                </p>

                {/* Locked Mode: Intent Fit Percentage Badge */}
                {isLocked && (
                  <div className="mt-3 text-right">
                    <div
                      className="text-3xl font-bold font-serif text-[#FFA100] leading-none"
                      style={{ fontFamily: 'var(--font-serif-card, Georgia, serif)' }}
                    >
                      {data.intentFitScore ?? 82}%
                    </div>
                    <span className="text-[9px] font-mono uppercase tracking-widest text-white/50">
                      INTENT FIT
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* IDENTITY / NAME & TITLE SECTION */}
            <div className="mt-5 space-y-2">
              {isLocked ? (
                <>
                  {/* Masked Name Bar */}
                  <div className="w-48 h-7 bg-white/10 rounded-lg animate-pulse" />
                  {/* Safe Generalized Role */}
                  <p className="text-xs font-medium text-white/60">
                    {data.designation || 'Senior advisor · boutique firm · West India'}
                  </p>
                </>
              ) : (
                <>
                  <h2
                    className={`text-2xl sm:text-3xl font-bold tracking-tight font-serif ${
                      isDisclosure ? 'text-[#111827]' : 'text-white'
                    }`}
                    style={{ fontFamily: 'var(--font-serif-card, Georgia, serif)' }}
                  >
                    {data.fullName || 'Verified Member'}
                  </h2>
                  <p
                    className={`text-xs sm:text-sm font-medium ${
                      isDisclosure ? 'text-[#4B5563]' : 'text-white/70'
                    }`}
                  >
                    <span className="font-semibold">{data.designation || 'Partner'}</span>
                    {data.organisation && (
                      <>
                        <span className="opacity-50"> · </span>
                        <span className="font-bold">{data.organisation}</span>
                      </>
                    )}
                  </p>
                  {bio && (
                    <p
                      className={`text-xs leading-relaxed pt-1 line-clamp-2 ${
                        isDisclosure ? 'text-[#6B7280]' : 'text-white/60'
                      }`}
                    >
                      {bio}
                    </p>
                  )}
                </>
              )}

              {/* Disclosure Mode: In Relation To line */}
              {isDisclosure && (
                <div className="pt-2 border-t border-[#E2DFD7] mt-3">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#6B7280] font-bold block">
                    IN RELATION TO
                  </span>
                  <p className="text-xs font-semibold text-[#111827] mt-0.5">
                    {data.matchReference || 'DC-M-0912 · Sell-side · B2B SaaS · ₹80–120 Cr'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* DIVIDER */}
          <div
            className={`border-t ${
              isDisclosure ? 'border-[#E2DFD7]' : 'border-white/10'
            }`}
          />

          {/* METRICS ROW: SIDE | TICKET BAND | CLOSED */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                SIDE
              </span>
              <p
                className={`text-xs sm:text-sm font-bold mt-1 ${
                  isDisclosure ? 'text-[#111827]' : 'text-white'
                }`}
              >
                {data.mandateSide || 'Sell-side'}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                TICKET BAND
              </span>
              <p
                className={`text-xs sm:text-sm font-bold mt-1 ${
                  isDisclosure ? 'text-[#111827]' : 'text-white'
                }`}
              >
                {data.ticketBand || '₹20–250 Cr'}
              </p>
            </div>
            <div>
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                CLOSED
              </span>
              <p
                className={`text-xs sm:text-sm font-bold mt-1 ${
                  isDisclosure ? 'text-[#111827]' : 'text-white'
                }`}
              >
                {data.closedCount ? `${data.closedCount} mandates` : '34 mandates'}
              </p>
            </div>
          </div>

          {/* EXPERTISE SECTION (Top 3 Chips) */}
          {expertise.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                EXPERTISE
              </span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {expertise.map((exp) => (
                  <span
                    key={exp}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold tracking-wide ${
                      isDisclosure
                        ? 'bg-white text-[#111827] border border-[#D5D2C9] shadow-2xs'
                        : 'bg-white/5 text-white/90 border border-white/10'
                    }`}
                  >
                    {exp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* SECTORS SECTION (Top 4) */}
          {sectors.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                SECTORS
              </span>
              <p
                className={`text-xs font-semibold ${
                  isDisclosure ? 'text-[#1F2937]' : 'text-white/85'
                }`}
              >
                {sectors.join(' · ')}
              </p>
            </div>
          )}

          {/* FOCUS GEOGRAPHY SECTION (Top 3) */}
          {geos.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block">
                FOCUS GEOGRAPHY
              </span>
              <p
                className={`text-xs font-semibold ${
                  isDisclosure ? 'text-[#1F2937]' : 'text-white/85'
                }`}
              >
                {geos.join(' · ')}
              </p>
            </div>
          )}

          {/* CONTACT & QR SECTION */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
            {/* Contact Rows */}
            <div className="space-y-2 text-xs min-w-0 flex-1">
              {isLocked ? (
                <>
                  {/* Masked Phone */}
                  <div className="flex items-center gap-2 text-white/40">
                    <Lock size={12} className="shrink-0" />
                    <div className="w-32 h-3.5 bg-white/10 rounded-sm" />
                  </div>
                  {/* Masked Email */}
                  <div className="flex items-center gap-2 text-white/40">
                    <Lock size={12} className="shrink-0" />
                    <div className="w-40 h-3.5 bg-white/10 rounded-sm" />
                  </div>
                  {/* Region Only */}
                  <div className="flex items-center gap-2 text-white/70 font-medium">
                    <MapPin size={12} className="shrink-0 text-[#FFA100]" />
                    <span>{locationText || 'West India region'}</span>
                  </div>
                </>
              ) : (
                <>
                  {data.phone && (
                    <div
                      className={`flex items-center gap-2 font-medium truncate ${
                        isDisclosure ? 'text-[#111827]' : 'text-white/90'
                      }`}
                    >
                      <Phone size={12} className="shrink-0 text-[#FFA100]" />
                      <span>{data.phone}</span>
                    </div>
                  )}
                  {data.email && (
                    <div
                      className={`flex items-center gap-2 font-medium truncate ${
                        isDisclosure ? 'text-[#111827]' : 'text-white/90'
                      }`}
                    >
                      <Mail size={12} className="shrink-0 text-[#FFA100]" />
                      <span>{data.email}</span>
                    </div>
                  )}
                  {locationText && (
                    <div
                      className={`flex items-center gap-2 font-medium truncate ${
                        isDisclosure ? 'text-[#111827]' : 'text-white/90'
                      }`}
                    >
                      <MapPin size={12} className="shrink-0 text-[#FFA100]" />
                      <span>{locationText}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* QR Code / Sealed Container */}
            <div className="shrink-0">
              {isLocked ? (
                <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center p-2 text-white/40">
                  <Lock size={20} className="mb-1 text-white/50" />
                  <span className="text-[9px] font-mono font-bold tracking-wider uppercase">
                    SEALED
                  </span>
                </div>
              ) : isPublic && qrDataUrl ? (
                <div className="w-20 h-20 rounded-xl bg-white p-1.5 shadow-sm flex items-center justify-center">
                  <img src={qrDataUrl} alt="Scan to view public DealCollab profile" className="w-full h-full" />
                </div>
              ) : isPublic ? (
                <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
              ) : (
                <div
                  className={`w-20 h-20 rounded-xl flex flex-col items-center justify-center text-center p-2 ${
                    isDisclosure ? 'bg-white border border-[#D5D2C9] text-[#92400E]' : 'bg-white/5 border border-white/10 text-white/40'
                  }`}
                >
                  <ShieldCheck size={20} className={isDisclosure ? 'mb-1 text-[#FFA100]' : 'mb-1 text-white/50'} />
                  <span className="text-[9px] font-mono font-bold tracking-wider uppercase">
                    {isDisclosure ? 'DISCLOSED' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* LOCKED MODE: Mandate Reference Match Line & Primary Action CTA */}
          {isLocked && (
            <div className="pt-3 border-t border-white/10 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-white/50 text-center">
                {data.matchedMandateText || 'MATCHED ON DC-M-0912 · SELL-SIDE · B2B SAAS · ₹80–120 CR'}
              </p>
              {onAction && (
                <button
                  onClick={onAction}
                  disabled={actionLoading}
                  data-testid="locked-card-cta-btn"
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-[#D96B27] to-[#C2581A] hover:from-[#E67832] hover:to-[#CF6220] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{actionLabel || 'Approve EOI to reveal identity'}</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* FOOTER ROW: Branding & Tagline */}
          <div
            className={`pt-4 border-t flex items-center justify-between text-[10px] ${
              isDisclosure
                ? 'border-[#E2DFD7] text-[#6B7280]'
                : 'border-white/10 text-white/40'
            }`}
          >
            {/* Logo */}
            <div className="flex items-center gap-1">
              <span className="font-bold text-xs">
                Deal<span className="text-[#FFA100]">Collab</span>
              </span>
            </div>
            {/* Tagline */}
            <span className="font-mono text-[9px] uppercase tracking-wider">
              Connecting People, Possibilities and Deals
            </span>
          </div>

          {/* Post-EOI Released Copy Bar */}
          {isDisclosure && (
            <div className="text-[9px] font-mono text-[#92400E] uppercase tracking-wider font-semibold">
              RELEASED TO {data.releasedToName?.toUpperCase() || 'ANANYA RAO'} ·{' '}
              {data.releasedToFirm?.toUpperCase() || 'KESTREL PARTNERS'} · SINGLE-RECIPIENT COPY
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
