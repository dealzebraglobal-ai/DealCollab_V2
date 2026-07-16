'use client';
import React from 'react';
import { UploadCloud } from 'lucide-react';

interface BulkMandateEmptyStateProps {
  onUpload: () => void;
}

// Defensive fallback for the Bulk Uploaded Mandates tab's list view.
// The tab itself is only rendered when bulk mandates exist (Deal Log gates on
// bulk_uploaded_records.length > 0), so this is a safety net rather than the
// default state — e.g. the moment between deleting the last bulk mandate and
// the tab re-hiding on next refresh.
export default function BulkMandateEmptyState({ onUpload }: BulkMandateEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-4 bg-gray-50/50 rounded-[40px] border-2 border-dashed border-gray-200 animate-in fade-in zoom-in duration-500">
      <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-gray-100 mb-2">
        <UploadCloud size={28} className="text-[#F97316]" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-black text-[#1F2937] tracking-tight">No Bulk Uploaded Mandates Found</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto font-medium leading-relaxed">
          Upload your mandates to begin matching.
        </p>
      </div>
      <button
        onClick={onUpload}
        className="mt-4 bg-[#F97316] text-white px-8 py-3 rounded-2xl font-black text-sm hover:bg-[#EA580C] transition-all active:scale-95 shadow-lg shadow-[#F97316]/20"
      >
        Upload Bulk Data
      </button>
    </div>
  );
}
