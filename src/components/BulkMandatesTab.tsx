'use client';
import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import BulkMandateCard, { BulkMandate } from './BulkMandateCard';
import BulkMandateEmptyState from './BulkMandateEmptyState';
import { Match } from './MatchWindow';

interface BulkMandatesTabProps {
  deals: BulkMandate[];
  onUploadClick: () => void;
  onViewMatch: (match: Match) => void;
  onMandatesUpdated: () => void;
}

export default function BulkMandatesTab({ deals, onUploadClick, onViewMatch, onMandatesUpdated }: BulkMandatesTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchingId, setSearchingId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleSearchForMatches = async (id: string) => {
    setSearchingId(id);
    try {
      const res = await fetch(`/api/deals/${id}/search-matches`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Search failed');
      }
      onMandatesUpdated();
    } catch (err) {
      console.error('[BulkMandatesTab] Search for matches failed:', err);
    } finally {
      setSearchingId(null);
    }
  };

  if (deals.length === 0) {
    return <BulkMandateEmptyState onUpload={onUploadClick} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={onUploadClick}
          className="flex items-center gap-2 bg-white border border-[rgba(17,17,17,0.1)] text-[#1F2937] px-4 py-2 rounded-xl text-xs font-bold hover:border-[#F97316]/40 hover:text-[#F97316] transition-all active:scale-[0.98]"
        >
          <UploadCloud size={14} />
          Upload Bulk Data
        </button>
      </div>

      {deals.map(mandate => (
        <BulkMandateCard
          key={mandate.id}
          mandate={mandate}
          isExpanded={expandedId === mandate.id}
          onToggle={() => handleToggle(mandate.id)}
          onSearchForMatches={handleSearchForMatches}
          onViewMatch={onViewMatch}
          searching={searchingId === mandate.id}
        />
      ))}
    </div>
  );
}
