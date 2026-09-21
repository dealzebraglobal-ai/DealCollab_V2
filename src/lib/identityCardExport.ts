/**
 * Helper to export an IdentityCard DOM node or render it directly to a 1200x2160 PNG canvas.
 * Target: 1200 x 2160 (3x of 400x720 aspect ratio), sRGB.
 */

export interface ExportCardData {
  mode: 'public' | 'locked' | 'disclosure';
  fullName?: string;
  initials?: string;
  photoUrl?: string;
  qrDataUrl?: string;
  designation?: string;
  organisation?: string;
  headline?: string;
  mandateSide?: string;
  ticketBand?: string;
  closedCount?: number | string;
  expertise?: string[];
  sectors?: string[];
  geographies?: string[];
  phone?: string;
  email?: string;
  location?: string;
  verifiedCode?: string;
  isVerified?: boolean;
  intentFitScore?: number;
  matchReference?: string;
  eoiReference?: string;
  timestamp?: string;
  releasedTo?: string;
}

export async function exportIdentityCardToImage(
  data: ExportCardData,
  filename = 'dealcollab-identity-card',
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  const width = 1200;
  const height = 2160;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context for canvas export');

  const isDisclosure = data.mode === 'disclosure';
  const isLocked = data.mode === 'locked';

  // 1. Background Fill
  if (isDisclosure) {
    ctx.fillStyle = '#F1EFE9';
    ctx.fillRect(0, 0, width, height);

    // Subtle background grain or warmth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
    ctx.fillRect(0, 0, width, height);
  } else {
    // Dark #0E1114
    ctx.fillStyle = '#0E1114';
    ctx.fillRect(0, 0, width, height);

    // Subtle radial glow
    const grad = ctx.createRadialGradient(width * 0.75, height * 0.35, 80, width * 0.75, height * 0.35, 700);
    grad.addColorStop(0, 'rgba(255, 161, 0, 0.08)');
    grad.addColorStop(1, 'rgba(14, 17, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle globe wireframe arcs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width * 0.85, height * 0.38, 450, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width * 0.85, height * 0.38, 320, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Disclosure Top Bar & Watermark
  if (isDisclosure) {
    // Top Orange Bar
    ctx.fillStyle = '#FFA100';
    ctx.fillRect(0, 0, width, 90);

    ctx.fillStyle = '#000000';
    ctx.font = '700 24px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CONFIDENTIAL DISCLOSURE · EOI ${data.eoiReference || 'AUTHORIZED'}`, 60, 45);

    ctx.textAlign = 'right';
    ctx.fillText(data.timestamp || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · IST', width - 60, 45);

    // Watermark across the card
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = '700 26px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
    ctx.textAlign = 'center';
    const watermarkText = `RELEASED TO ${data.releasedTo || 'AUTHORIZED RECIPIENT'} · SINGLE-RECIPIENT COPY · EOI ${data.eoiReference || 'REF'}`;
    for (let y = -900; y <= 900; y += 160) {
      ctx.fillText(watermarkText, 0, y);
    }
    ctx.restore();
  }

  const paddingX = 80;
  let cursorY = isDisclosure ? 160 : 100;

  // 3. Avatar: real profile photo when available, else a sealed/initials box
  const avatarSize = 150;
  let photoDrawn = false;
  if (!isLocked && data.photoUrl) {
    try {
      const photoImg = new window.Image();
      photoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        photoImg.onload = () => resolve();
        photoImg.onerror = () => reject();
        photoImg.src = data.photoUrl!;
      });
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(paddingX, cursorY, avatarSize, avatarSize, [28]);
      ctx.clip();
      ctx.drawImage(photoImg, paddingX, cursorY, avatarSize, avatarSize);
      ctx.restore();
      photoDrawn = true;
    } catch {
      // Fall through to initials fallback below.
    }
  }

  if (!photoDrawn) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(paddingX, cursorY, avatarSize, avatarSize, [28]);
    if (isDisclosure) {
      ctx.fillStyle = '#E2DFD7';
      ctx.fill();
      ctx.font = '500 56px "Instrument Serif", Georgia, serif';
      ctx.fillStyle = '#262626';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.initials || 'DC', paddingX + avatarSize / 2, cursorY + avatarSize / 2);
    } else if (isLocked) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Lock symbol inside
      ctx.font = '50px sans-serif';
      ctx.fillStyle = '#FFA100';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', paddingX + avatarSize / 2, cursorY + avatarSize / 2);
    } else {
      // Public, no photo available
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fill();
      ctx.font = '500 56px "Instrument Serif", Georgia, serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.initials || 'DC', paddingX + avatarSize / 2, cursorY + avatarSize / 2);
    }
    ctx.restore();
  }

  // Verification status top right
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  if (isDisclosure) {
    ctx.fillStyle = '#1F1F1F';
    ctx.fillText('🛡 ID VERIFIED', width - paddingX, cursorY + 10);
    ctx.font = '400 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(`DC · ${data.verifiedCode || '1042'}`, width - paddingX, cursorY + 45);
  } else if (isLocked) {
    ctx.fillStyle = '#FFA100';
    ctx.fillText('🛡 VERIFIED', width - paddingX, cursorY + 10);
    ctx.font = '400 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('DC · ****', width - paddingX, cursorY + 45);

    // Intent fit percentage badge
    if (data.intentFitScore) {
      ctx.font = '700 80px "Instrument Serif", Georgia, serif';
      ctx.fillStyle = '#FFA100';
      ctx.fillText(`${data.intentFitScore}%`, width - paddingX, cursorY + 95);
      ctx.font = '700 20px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('INTENT FIT', width - paddingX, cursorY + 185);
    }
  } else {
    ctx.fillStyle = '#FFA100';
    ctx.fillText('🛡 VERIFIED', width - paddingX, cursorY + 10);
    ctx.font = '400 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6B7280';
    ctx.fillText(`DC · ${data.verifiedCode || '1042'}`, width - paddingX, cursorY + 45);
  }

  cursorY += avatarSize + 50;

  // 4. Name & Role
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (isLocked) {
    // Masked name bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(paddingX, cursorY, 480, 52, [12]);
    ctx.fill();

    cursorY += 75;
    ctx.font = '500 32px "Manrope", sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(data.designation || 'Senior advisor · boutique firm · West India', paddingX, cursorY);
    cursorY += 60;
  } else {
    // Real Name
    ctx.font = '700 76px "Instrument Serif", Georgia, serif';
    ctx.fillStyle = isDisclosure ? '#111827' : '#FFFFFF';
    ctx.fillText(data.fullName || 'Member', paddingX, cursorY);

    cursorY += 95;
    ctx.font = '500 34px "Manrope", sans-serif';
    ctx.fillStyle = isDisclosure ? '#4B5563' : '#D1D5DB';
    const roleText = `${data.designation || 'Partner'} · ${data.organisation || 'Advisory'}`;
    ctx.fillText(roleText, paddingX, cursorY);
    cursorY += 65;

    // Bio / Headline (cap 120 chars)
    if (data.headline) {
      ctx.font = '400 28px "Manrope", sans-serif';
      ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
      const truncatedBio = data.headline.slice(0, 120);
      ctx.fillText(truncatedBio, paddingX, cursorY);
      cursorY += 50;
    }
  }

  // 5. In Relation To / Match line
  if (isDisclosure && data.matchReference) {
    cursorY += 20;
    ctx.font = '700 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('IN RELATION TO', paddingX, cursorY);
    cursorY += 35;
    ctx.font = '600 30px "Manrope", sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(data.matchReference, paddingX, cursorY);
    cursorY += 45;
  }

  // Thin Separator
  cursorY += 25;
  ctx.strokeStyle = isDisclosure ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(paddingX, cursorY);
  ctx.lineTo(width - paddingX, cursorY);
  ctx.stroke();
  cursorY += 45;

  // 6. Metrics Grid: SIDE | TICKET BAND
  const colW = (width - paddingX * 2) / 2;

  const renderMetric = (label: string, val: string, xPos: number) => {
    ctx.font = '700 22px "IBM Plex Mono", monospace';
    ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
    ctx.fillText(label, xPos, cursorY);

    ctx.font = '700 36px "Manrope", sans-serif';
    ctx.fillStyle = isDisclosure ? '#111827' : '#FFFFFF';
    ctx.fillText(val, xPos, cursorY + 40);
  };

  renderMetric('SIDE', data.mandateSide || 'Sell-side', paddingX);
  renderMetric('TICKET BAND', data.ticketBand || '₹20–250 Cr', paddingX + colW);

  cursorY += 125;

  // 7. EXPERTISE Chips (top 3)
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
  ctx.fillText('EXPERTISE', paddingX, cursorY);
  cursorY += 40;

  const expertiseChips = (data.expertise && data.expertise.length > 0)
    ? data.expertise.slice(0, 3)
    : ['Sell-side M&A', 'Carve-outs', 'Founder exits'];

  let chipX = paddingX;
  for (const chip of expertiseChips) {
    ctx.font = '600 26px "Manrope", sans-serif';
    const textMetrics = ctx.measureText(chip);
    const chipW = textMetrics.width + 48;
    const chipH = 58;

    ctx.beginPath();
    ctx.roundRect(chipX, cursorY, chipW, chipH, [14]);
    if (isDisclosure) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#D5D2C9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#111827';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.textBaseline = 'middle';
    ctx.fillText(chip, chipX + 24, cursorY + chipH / 2);
    ctx.textBaseline = 'top';
    chipX += chipW + 18;
  }

  cursorY += 95;

  // 8. SECTORS Line (top 4)
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
  ctx.fillText('SECTORS', paddingX, cursorY);
  cursorY += 40;

  const sectorList = (data.sectors && data.sectors.length > 0)
    ? data.sectors.slice(0, 4).join('  ·  ')
    : 'B2B SaaS  ·  Healthtech  ·  Fintech infra  ·  D2C';
  ctx.font = '600 32px "Manrope", sans-serif';
  ctx.fillStyle = isDisclosure ? '#1F2937' : '#E5E7EB';
  ctx.fillText(sectorList, paddingX, cursorY);

  cursorY += 85;

  // 9. FOCUS GEOGRAPHY Line (top 3)
  ctx.font = '700 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
  ctx.fillText('FOCUS GEOGRAPHY', paddingX, cursorY);
  cursorY += 40;

  const geoList = (data.geographies && data.geographies.length > 0)
    ? data.geographies.slice(0, 3).join('  ·  ')
    : 'India  ·  GCC  ·  Southeast Asia';
  ctx.font = '600 32px "Manrope", sans-serif';
  ctx.fillStyle = isDisclosure ? '#1F2937' : '#E5E7EB';
  ctx.fillText(geoList, paddingX, cursorY);

  cursorY += 120;

  // 10. Contact Section & QR Code
  // Left Column: Contact info / Masked
  const contactY = cursorY;
  const qrSize = 220;
  const qrX = width - paddingX - qrSize;

  if (isLocked) {
    // Masked phone row
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.fillText('🔒', paddingX, contactY);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(paddingX + 50, contactY + 5, 340, 28, [6]);
    ctx.fill();

    // Masked email row
    ctx.fillText('🔒', paddingX, contactY + 60);
    ctx.beginPath();
    ctx.roundRect(paddingX + 50, contactY + 65, 420, 28, [6]);
    ctx.fill();

    // Region only
    ctx.font = '500 30px "Manrope", sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(`📍 ${data.location || 'Mumbai region'}`, paddingX, contactY + 125);

    // Sealed QR box
    ctx.beginPath();
    ctx.roundRect(qrX, contactY - 10, qrSize, qrSize, [20]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    ctx.font = '48px sans-serif';
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', qrX + qrSize / 2, contactY + qrSize / 2 - 25);
    ctx.font = '700 20px "IBM Plex Mono", monospace';
    ctx.fillText('SEALED', qrX + qrSize / 2, contactY + qrSize / 2 + 35);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  } else {
    // Revealed Contact
    ctx.font = '500 32px "Manrope", sans-serif';
    ctx.fillStyle = isDisclosure ? '#111827' : '#FFFFFF';

    ctx.fillText(`📱  ${data.phone || '+91 98204 41180'}`, paddingX, contactY);
    ctx.fillText(`✉️  ${data.email || 'rohan@meridianap.in'}`, paddingX, contactY + 65);
    ctx.fillText(`📍  ${data.location || 'Mumbai, India'}`, paddingX, contactY + 130);

    // QR Code Box — real, scannable QR resolving to the public profile URL
    // (see IdentityCard.tsx / publicProfileUrl.ts). Falls back to a plain
    // white box with no code if generation failed upstream — never a fake
    // decorative pattern that looks scannable but isn't.
    const qrPad = 14;
    ctx.beginPath();
    ctx.roundRect(qrX, contactY - 10, qrSize, qrSize, [20]);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    if (data.qrDataUrl) {
      try {
        const qrImg = new window.Image();
        await new Promise<void>((resolve, reject) => {
          qrImg.onload = () => resolve();
          qrImg.onerror = () => reject();
          qrImg.src = data.qrDataUrl!;
        });
        ctx.drawImage(
          qrImg,
          qrX + qrPad,
          contactY - 10 + qrPad,
          qrSize - qrPad * 2,
          qrSize - qrPad * 2
        );
      } catch {
        // Leave the white box empty rather than draw a fake/misleading code.
      }
    }
  }

  // 11. Footer Line & Logo
  const footerY = height - 120;
  ctx.strokeStyle = isDisclosure ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(paddingX, footerY - 30);
  ctx.lineTo(width - paddingX, footerY - 30);
  ctx.stroke();

  if (isDisclosure) {
    ctx.font = '700 20px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#92400E';
    ctx.fillText(`RELEASED TO ${data.releasedTo || 'COUNTERPARTY'} · SINGLE-RECIPIENT COPY`, paddingX, footerY - 70);
  }

  // DealCollab Logo text
  ctx.font = '900 36px "Poppins", sans-serif';
  ctx.fillStyle = isDisclosure ? '#111827' : '#FFFFFF';
  ctx.fillText('Deal', paddingX, footerY);
  const dealW = ctx.measureText('Deal').width;
  ctx.fillStyle = '#FFA100';
  ctx.fillText('Collab', paddingX + dealW, footerY);

  ctx.textAlign = 'right';
  ctx.font = '500 24px "Manrope", sans-serif';
  ctx.fillStyle = isDisclosure ? '#6B7280' : '#9CA3AF';
  ctx.fillText('Connecting People, Possibilities and Deals', width - paddingX, footerY + 8);

  // 12. Trigger Browser Download
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const fileExt = format === 'jpeg' ? 'jpg' : 'png';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.95));
  if (!blob) throw new Error(`Failed to generate ${format.toUpperCase()} blob`);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith(`.${fileExt}`) ? filename : `${filename}.${fileExt}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
