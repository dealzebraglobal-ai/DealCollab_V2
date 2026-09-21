import React, { useState } from 'react';
import { Mail, Phone, MessageSquare, Download, Copy, Check, FileText, User, Building2, IdCard, X, Loader2 } from 'lucide-react';
import IdentityCard from './IdentityCard';
import { exportIdentityCardToPNG, type ExportCardData } from '@/lib/identityCardExport';
import { buildPublicProfileUrl } from '@/lib/publicProfileUrl';
import QRCode from 'qrcode';
interface ConnectionDetailsProps {
  item: {
    deal: string;
    dealDesc: string;
    match: string;
    matchDesc: string;
    isIncoming?: boolean;
    raw?: any;
  };
  onClose?: () => void;
}

export default function ConnectionDetails({ item }: ConnectionDetailsProps) {
  const [notes, setNotes] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isVCardOpen, setIsVCardOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const rawEoi = item.raw;
  const isIncoming = item.isIncoming;
  const counterparty = isIncoming ? rawEoi?.sender : rawEoi?.receiver;

  const contactInfo = {
    phone: counterparty?.phone || "Not provided",
    email: counterparty?.email || "Not provided",
    whatsapp: counterparty?.phone ? `https://wa.me/${counterparty.phone.replace(/\D/g, '')}` : '#'
  };

  // Build vCard payload
  const cpData = item.raw?.counterparty || {};
  const cpIntent = cpData.intent || '';
  const cpSector = (cpData.sectors && cpData.sectors[0]) || null;
  
  const formatSize = (min: any, max: any) => {
    if (!min && !max) return undefined;
    const minVal = min ? Number(min) : null;
    const maxVal = max ? Number(max) : null;
    if (minVal && maxVal && minVal !== maxVal) return `₹${minVal}–${maxVal} Cr`;
    return `₹${maxVal || minVal} Cr`;
  };
  const cpSize = formatSize(cpData.dealSizeMinCr, cpData.dealSizeMaxCr);

  const photoUrl = counterparty?.profile_image || counterparty?.image;
  const fullName = counterparty?.name || 'Verified Member';
  const role = counterparty?.role === 'Other' ? counterparty?.custom_role : counterparty?.role;
  const company = counterparty?.firm_name;
  
  const placeArr = [counterparty?.base_city, counterparty?.base_country].filter(Boolean);
  const place = placeArr.length > 0 ? placeArr.join(', ') : undefined;

  const sectors = cpSector ? [cpSector] : (counterparty?.sectors || counterparty?.priority_sectors || []);
  const intentStr = cpIntent ? String(cpIntent).replace(/_/g, '-').toLowerCase() : undefined;
  
  const profileSlug = `usr_${String(counterparty?.id || 'dc').slice(0, 8)}`;
  
  const vcardData = {
    fullName,
    initials: (fullName ? fullName.split(' ').map((n: string) => n[0]).slice(0, 2).join('') : 'DC').toUpperCase(),
    photoUrl,
    designation: role,
    organisation: company,
    headline: counterparty?.expertise_description,
    mandateSide: intentStr,
    ticketBand: cpSize,
    closedCount: counterparty?.closed_count,
    expertise: counterparty?.expertise_description ? [counterparty.expertise_description] : undefined,
    sectors: sectors.slice(0, 4),
    geographies: (counterparty?.geographies && counterparty.geographies.length > 0 ? counterparty.geographies : ['India']).slice(0, 3),
    phone: counterparty?.phone,
    email: counterparty?.email,
    location: place,
    isVerified: counterparty?.kycVerified !== undefined ? !!counterparty.kycVerified : true,
    verifiedCode: String(counterparty?.id || '').slice(-4).toUpperCase(),
    profileSlug,
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      let qrDataUrl = undefined;
      try {
        qrDataUrl = await QRCode.toDataURL(buildPublicProfileUrl(profileSlug), {
          width: 440,
          margin: 1,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        console.error('Failed to generate QR for export', err);
      }
      const exportData: ExportCardData = {
        mode: 'public',
        ...vcardData,
        qrDataUrl
      };
      await exportIdentityCardToPNG(exportData, `DealCollab_${fullName.replace(/[^a-z0-9]+/gi, '_') || 'Company'}_vCard.png`);
    } catch (err) {
      console.error('vCard download failed', err);
      alert('Unable to download the vCard. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white border-t border-[#E5E7EB] p-6 sm:p-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        
        {/* SECTION 1: Your Deal vs Their Deal */}
        <div className="space-y-6">
          <div className="space-y-4">
             <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-[#EA580C]" />
                <h4 className="text-xs font-medium uppercase tracking-wider text-[#1F2937]">Deal Alignment</h4>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                   <p className="text-[10px] font-medium text-[#6B7280] uppercase mb-1">Your Proposal</p>
                   <p className="text-sm font-medium text-[#1F2937] mb-1">{item.deal}</p>
                   <p className="text-xs text-[#6B7280] leading-relaxed font-normal">{item.dealDesc}</p>
                </div>
                <div className="bg-[#FFF7ED] p-4 rounded-xl border border-[#FFEDD5]">
                   <p className="text-[10px] font-medium text-[#EA580C] uppercase mb-1">Their Requirement</p>
                   <p className="text-sm font-medium text-[#1F2937] mb-1">{item.match}</p>
                   <p className="text-xs text-[#6B7280] leading-relaxed font-normal">{item.matchDesc}</p>
                </div>
             </div>
          </div>

          {/* SECTION 2: Full Profile */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 mb-2">
                <User size={16} className="text-[#EA580C]" />
                <h4 className="text-xs font-medium uppercase tracking-wider text-[#1F2937]">Entity Profile</h4>
             </div>
             <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-2">
                   <div className="p-4 border-r border-b border-[#E5E7EB]">
                      <p className="text-[10px] font-medium text-[#6B7280] uppercase mb-1">Point of Contact</p>
                      <p className="text-sm font-medium text-[#1F2937]">{counterparty?.name || 'N/A'}</p>
                   </div>
                   <div className="p-4 border-b border-[#E5E7EB]">
                      <p className="text-[10px] font-medium text-[#6B7280] uppercase mb-1">Firm / Fund</p>
                      <p className="text-sm font-medium text-[#1F2937]">{counterparty?.firm_name || 'N/A'}</p>
                   </div>
                   <div className="p-4 border-r border-[#E5E7EB]">
                      <p className="text-[10px] font-medium text-[#6B7280] uppercase mb-1">Position</p>
                      <p className="text-sm font-medium text-[#1F2937]">{counterparty?.role || 'N/A'}</p>
                   </div>
                   <div className="p-4">
                      <p className="text-[10px] font-medium text-[#6B7280] uppercase mb-1">Direct Email</p>
                      <p className="text-sm font-medium text-[#1F2937] truncate">{counterparty?.email || 'N/A'}</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* SECTION 3: Contact & SECTION 4: Notes */}
        <div className="space-y-8">
           {/* Contact Channels */}
           <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-[#EA580C]" />
                  <h4 className="text-xs font-medium uppercase tracking-wider text-[#1F2937]">Direct Contact</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsVCardOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-medium text-[#6B7280] transition-all"
                  >
                     <IdCard size={12} /> View vCard
                  </button>
                  <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-medium text-[#6B7280] transition-all disabled:opacity-50"
                  >
                     {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} 
                     {isDownloading ? 'Preparing...' : 'Download vCard'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#FF6A00]/30 transition-all group">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[#6B7280]">
                       <Phone size={16} />
                    </div>
                    <span className="text-sm font-normal text-[#1F2937] flex-1">{contactInfo.phone}</span>
                    <button 
                      onClick={() => handleCopy(contactInfo.phone, 'phone')}
                      className="p-1.5 hover:bg-gray-100 rounded-md text-[#6B7280] transition-all"
                    >
                       {copiedField === 'phone' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                 </div>

                 <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#FF6A00]/30 transition-all group">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[#6B7280]">
                       <Mail size={16} />
                    </div>
                    <span className="text-sm font-normal text-[#1F2937] flex-1">{contactInfo.email}</span>
                    <button 
                       onClick={() => handleCopy(contactInfo.email, 'email')}
                       className="p-1.5 hover:bg-gray-100 rounded-md text-[#6B7280] transition-all"
                    >
                       {copiedField === 'email' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                 </div>

                 <a 
                   href={contactInfo.whatsapp}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-medium uppercase tracking-wider transition-all shadow-sm active:scale-[0.98]"
                 >
                    <MessageSquare size={16} /> Message on WhatsApp
                 </a>
              </div>
           </div>

           {/* SECTION 4: Notes */}
           <div className="space-y-4">
              <h4 className="text-xs font-medium uppercase tracking-wider text-[#1F2937]">Internal Notes</h4>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your tracking notes here... (e.g. Last met at conference, follow up next Tuesday)"
                className="w-full min-h-[120px] p-4 bg-gray-50 border border-[#E5E7EB] focus:border-[#FF6A00]/50 focus:bg-white rounded-xl text-xs font-normal text-[#1F2937] outline-none transition-all resize-none"
              />
           </div>
        </div>
      </div>

      {isVCardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsVCardOpen(false)}>
          <div
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-black text-gray-900 tracking-tight">Counterparty vCard</h2>
              <button onClick={() => setIsVCardOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <IdentityCard
                mode="public"
                data={vcardData}
                showExportButtons={false}
              />
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#1F2937] hover:bg-[#111827] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50"
                >
                  {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 
                  {isDownloading ? 'Preparing vCard...' : 'Download PNG'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
