'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildPublicProfileUrl } from '@/lib/publicProfileUrl';

export interface DealCollabVCardData {
  fullName?: string | null;
  name?: string | null;
  initials?: string | null;
  firmName?: string | null;
  companyName?: string | null;
  company?: string | null;
  designation?: string | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  category?: string[] | string | null;
  professionalCategory?: string[] | string | null;
  sectors?: string[] | string | null;
  geographies?: string[] | string | null;
  city?: string | null;
  baseCity?: string | null;
  location?: string | null;
  baseLocation?: string | null;
  country?: string | null;
  baseCountry?: string | null;
  photoUrl?: string | null;
  profileImage?: string | null;
  userAvatar?: string | null;
  profileSlug?: string | null;
  qrDataUrl?: string | null;
}

interface DealCollabVCardProps {
  data: DealCollabVCardData;
  className?: string;
  qrDataUrl?: string | null;
}

export default function DealCollabVCard({ data, className = '', qrDataUrl: propQrUrl }: DealCollabVCardProps) {
  const [internalQr, setInternalQr] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const name = data.fullName || data.name || 'Verified Member';
  const company = data.companyName || data.company || data.firmName || 'Independent';
  const role = data.designation || data.role || 'Advisor';
  const phone = data.phone || '';
  const email = data.email || '';
  const photo = data.photoUrl || data.profileImage || data.userAvatar || null;

  // Format category
  const rawCat = data.professionalCategory || data.category;
  const categoryText = Array.isArray(rawCat)
    ? rawCat.filter(Boolean).join(', ')
    : rawCat || role || 'Advisor';

  // Format sectors
  const rawSectors = data.sectors;
  const sectorsText = Array.isArray(rawSectors)
    ? (rawSectors.length > 0 ? rawSectors.filter(Boolean).join(' , ') : 'M&A, Growth, Capital')
    : rawSectors || 'M&A, Growth, Capital';

  // Format city & country
  const placeParts = [
    data.baseCity || data.city,
    data.baseLocation || data.location,
    data.baseCountry || data.country
  ].filter(Boolean);
  const uniquePlace = Array.from(new Set(placeParts));
  const basedCityText = uniquePlace.length > 0 ? uniquePlace.join(', ') : 'India';

  // Format geographies
  const rawGeos = data.geographies;
  const geographiesText = Array.isArray(rawGeos)
    ? (rawGeos.length > 0 ? rawGeos.filter(Boolean).join(', ') : 'India')
    : rawGeos || 'India';

  // Compute initials fallback
  const initials = data.initials || (name ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() : 'DC');

  const profileSlug = data.profileSlug || `usr_${String(name).replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase()}`;

  useEffect(() => {
    if (propQrUrl) {
      setInternalQr(propQrUrl);
      return;
    }
    let cancelled = false;
    const url = buildPublicProfileUrl(profileSlug);
    QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((qr) => {
        if (!cancelled) setInternalQr(qr);
      })
      .catch((err) => {
        console.error('Failed to generate vCard QR code', err);
      });

    return () => {
      cancelled = true;
    };
  }, [profileSlug, propQrUrl]);

  return (
    <div
      className={`w-full bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-md border border-gray-200 text-black relative select-none box-border ${className}`}
      style={{
        fontFamily: "'Cambria', Cochin, Georgia, Times, 'Times New Roman', serif",
        maxWidth: '470px',
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* 1. Header Bar: Tagline on Left, Exact DealCollab Logo on Right (exactly as sample) */}
      <div className="flex items-center justify-between pb-3 border-b border-transparent">
        <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium tracking-tight">
          Connecting People, Possibilities & Deals
        </span>
        <div className="shrink-0 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dealcollab-logo.png"
            alt="DealCollab"
            className="h-5 sm:h-6 w-auto object-contain block"
          />
        </div>
      </div>

      {/* 2. Hero Profile Row: Photo (left) + Name, Firm, Designation (right) */}
      <div className="flex items-center gap-3.5 sm:gap-5 my-3.5">
        {/* Photo Box */}
        <div
          className="rounded-2xl border-2 border-[#EFD2A5] p-0.5 shrink-0 overflow-hidden shadow-xs bg-white flex items-center justify-center"
          style={{ width: '104px', height: '104px', minWidth: '104px', minHeight: '104px', maxWidth: '104px', maxHeight: '104px' }}
        >
          {photo && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={name}
              className="rounded-[14px] block"
              style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
              onError={() => setPhotoFailed(true)}
              crossOrigin="anonymous"
            />
          ) : (
            <div className="w-full h-full rounded-[14px] bg-[#FDF8EE] text-[#B45309] font-bold text-2xl sm:text-3xl flex items-center justify-center">
              {initials}
            </div>
          )}
        </div>

        {/* Name and Titles in Cambria font */}
        <div className="flex-1 min-w-0 pr-1">
          <h1 className="font-bold text-xl sm:text-2xl text-black tracking-tight leading-snug break-words">
            {name}
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-900 mt-2 leading-snug break-words">
            <span className="font-bold text-black">Firm Name:</span> {company}
          </p>
          <p className="text-xs sm:text-[13px] text-gray-900 mt-1 leading-snug break-words">
            <span className="font-bold text-black">Designation:</span> {role}
          </p>
        </div>
      </div>

      {/* 3. Golden Divider 1 */}
      <div className="w-full h-[2px] bg-[#EFD2A5] my-3.5 sm:my-4" />

      {/* 4. Two-Column Info Grid — Row-by-row structure prevents any overlapping */}
      <div className="space-y-3 sm:space-y-3.5 text-xs sm:text-[13px]">
        {/* Row 1: Contact (left) | Email (right) */}
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 items-start">
          <div className="min-w-0">
            <span className="font-bold text-black block">Contact:</span>
            <span className="text-gray-900 block mt-0.5 break-words">
              {phone || 'Not provided'}
            </span>
          </div>

          <div className="min-w-0">
            <span className="font-bold text-black block">Email:</span>
            <span className="text-gray-900 block mt-0.5 break-all">
              {email || 'Not provided'}
            </span>
          </div>
        </div>

        {/* Row 2: Professional Category (left) | Based City (right) */}
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 items-start">
          <div className="min-w-0">
            <span className="font-bold text-black block">Professional Category</span>
            <span className="text-gray-900 block mt-0.5 leading-snug break-words">
              {categoryText}
            </span>
          </div>

          <div className="min-w-0">
            <span className="font-bold text-black block">Based City:</span>
            <span className="text-gray-900 block mt-0.5 leading-snug break-words">
              {basedCityText}
            </span>
          </div>
        </div>

        {/* Row 3: Focus Sector (left) | Focus Geography (right) */}
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 items-start">
          <div className="min-w-0">
            <span className="font-bold text-black block">Focus Sector:</span>
            <span className="text-gray-900 block mt-0.5 leading-snug break-words">
              {sectorsText}
            </span>
          </div>

          <div className="min-w-0">
            <span className="font-bold text-black block">Focus Geography:</span>
            <span className="text-gray-900 block mt-0.5 leading-snug break-words">
              {geographiesText}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Golden Divider 2 */}
      <div className="w-full h-[2px] bg-[#EFD2A5] my-3.5 sm:my-4" />

      {/* 6. Footer Section: Promotional pitch on left, QR Code on right */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex-1 pr-2">
          <p className="font-bold text-[11px] sm:text-xs text-black leading-snug break-words">
            Accelerate your next M&A, Joint Venture, Partnership, or Fundraising round.......
          </p>
          <p className="text-[10px] sm:text-[11px] text-gray-900 leading-relaxed mt-1 break-words">
            <strong className="font-bold text-black">DealCollab</strong> connects you with the ideal counterparties and unlocks premium deal-sourcing opportunities tailored to your strategic goals.
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-center justify-center" style={{ width: '80px', minWidth: '80px' }}>
          {internalQr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={internalQr}
              alt="DealCollab Public Profile QR Code"
              className="object-contain block"
              style={{ width: '70px', height: '70px', maxWidth: '70px', maxHeight: '70px' }}
            />
          ) : (
            <div className="bg-gray-100 rounded-md animate-pulse" style={{ width: '70px', height: '70px' }} />
          )}
          <span className="text-[9px] text-gray-700 font-medium tracking-tight mt-0.5 text-center">
            dealcollab.org
          </span>
        </div>
      </div>

      {/* 7. Bottom Golden Divider 3 */}
      <div className="w-full h-[2.5px] bg-[#EFD2A5] mt-3.5 sm:mt-4" />
    </div>
  );
}
