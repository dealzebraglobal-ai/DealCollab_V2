'use client';
import React, { useState } from 'react';
import { Mail, Phone, MessageSquare, Download, Copy, Check, FileText, User, Building2 } from 'lucide-react';

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

  return (
    <div className="bg-white border-t border-[#E5E7EB] p-6 sm:p-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        
        {/* SECTION 1: Your Deal vs Their Deal */}
        <div className="space-y-6">
          <div className="space-y-4">
             <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-[#F97316]" />
                <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Deal Alignment</h4>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                   <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1">Your Proposal</p>
                   <p className="text-sm font-bold text-[#1F2937] mb-1">{item.deal}</p>
                   <p className="text-xs text-[#6B7280] leading-relaxed">{item.dealDesc}</p>
                </div>
                <div className="bg-[#F97316]/5 p-4 rounded-xl border border-[#F97316]/10">
                   <p className="text-[10px] font-bold text-[#F97316] uppercase mb-1">Their Requirement</p>
                   <p className="text-sm font-bold text-[#1F2937] mb-1">{item.match}</p>
                   <p className="text-xs text-[#6B7280] leading-relaxed">{item.matchDesc}</p>
                </div>
             </div>
          </div>

          {/* SECTION 2: Full Profile */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 mb-2">
                <User size={16} className="text-[#F97316]" />
                <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Entity Profile</h4>
             </div>
             <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-2">
                   <div className="p-4 border-r border-b border-[#E5E7EB]">
                      <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1">Point of Contact</p>
                      <p className="text-sm font-bold text-[#1F2937]">{counterparty?.name || 'N/A'}</p>
                   </div>
                   <div className="p-4 border-b border-[#E5E7EB]">
                      <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1">Firm / Fund</p>
                      <p className="text-sm font-bold text-[#1F2937]">{counterparty?.firm_name || 'N/A'}</p>
                   </div>
                   <div className="p-4 border-r border-[#E5E7EB]">
                      <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1">Position</p>
                      <p className="text-sm font-bold text-[#1F2937]">{counterparty?.role || 'N/A'}</p>
                   </div>
                   <div className="p-4">
                      <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1">Direct Email</p>
                      <p className="text-sm font-bold text-[#1F2937] truncate">{counterparty?.email || 'N/A'}</p>
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
                  <Building2 size={16} className="text-[#F97316]" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Direct Contact</h4>
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-[#6B7280] transition-all">
                   <Download size={12} /> Download vCard
                </button>
              </div>

              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#F97316]/30 transition-all group">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[#6B7280]">
                       <Phone size={16} />
                    </div>
                    <span className="text-sm font-medium text-[#1F2937] flex-1">{contactInfo.phone}</span>
                    <button 
                      onClick={() => handleCopy(contactInfo.phone, 'phone')}
                      className="p-1.5 hover:bg-gray-100 rounded-md text-[#6B7280] transition-all"
                    >
                       {copiedField === 'phone' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                 </div>

                 <div className="flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#F97316]/30 transition-all group">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[#6B7280]">
                       <Mail size={16} />
                    </div>
                    <span className="text-sm font-medium text-[#1F2937] flex-1">{contactInfo.email}</span>
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
                   className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-sm font-bold transition-all shadow-sm active:scale-[0.98]"
                 >
                    <MessageSquare size={18} /> Message on WhatsApp
                 </a>
              </div>
           </div>

           {/* SECTION 4: Notes */}
           <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Internal Notes</h4>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your tracking notes here... (e.g. Last met at conference, follow up next Tuesday)"
                className="w-full min-h-[120px] p-4 bg-gray-50 border border-[#E5E7EB] focus:border-[#F97316]/50 focus:bg-white rounded-xl text-xs font-medium text-[#1F2937] outline-none transition-all resize-none"
              />
           </div>
        </div>
      </div>
    </div>
  );
}
