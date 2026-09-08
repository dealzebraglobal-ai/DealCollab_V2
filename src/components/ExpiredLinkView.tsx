'use client';
import React from 'react';
import Link from 'next/link';
import { Clock, ShieldAlert, ArrowRight } from 'lucide-react';

export default function ExpiredLinkView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-700">
      <div className="w-full max-w-sm space-y-8">
        <div className="relative flex justify-center">
           <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 shadow-sm relative">
              <Clock size={40} className="text-gray-300" />
              <div className="absolute -top-1 -right-1 w-8 h-8 bg-[#F97316] rounded-full flex items-center justify-center ring-4 ring-white">
                 <ShieldAlert size={16} className="text-white" />
              </div>
           </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-black text-[#1F2937] tracking-tight">Access Link Expired</h1>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            This invitation link has expired or has already been used. Please sign in to your dashboard to view active deals or request a new link.
          </p>
        </div>

        <div className="pt-4">
           <Link
            href="/login"
            className="group w-full flex items-center justify-center gap-2 py-4 bg-[#1F2937] hover:bg-[#F97316] text-white rounded-2xl font-bold text-sm transition-all shadow-lg hover:shadow-[#F97316]/20 active:scale-[0.98]"
           >
             Sign in to DealCollab
             <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
           </Link>
        </div>

        <div className="flex items-center justify-center gap-6 pt-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest opacity-50">
           <span>Institutional Security</span>
           <span className="w-1 h-1 bg-gray-200 rounded-full" />
           <span>Deal Integrity Guard</span>
        </div>
      </div>
    </div>
  );
}
