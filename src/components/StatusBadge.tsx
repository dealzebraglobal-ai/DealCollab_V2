import React from 'react';

export type DealStatus = 'Searching Match' | 'Matched' | 'EOI Received' | 'EOI Sent' | 'Approved';

interface StatusBadgeProps {
  status: DealStatus;
}

const statusColors: Record<DealStatus, { bg: string, text: string }> = {
  'Searching Match': { bg: 'bg-[#F3F4F6] border border-[#E5E7EB]', text: 'text-[#4B5563]' },
  'Matched': { bg: 'bg-[#DCFCE7] border border-[#86EFAC]', text: 'text-[#15803D]' },
  'EOI Received': { bg: 'bg-[#FFF7ED] border border-[#FFEDD5]', text: 'text-[#EA580C]' },
  'EOI Sent': { bg: 'bg-[#F3F4F6] border border-[#E5E7EB]', text: 'text-[#4B5563]' },
  'Approved': { bg: 'bg-[#16A34A] text-white shadow-sm', text: '' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusColors[status] || statusColors['Searching Match'];

  return (
    <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${config.bg} ${config.text} whitespace-nowrap`}>
      {status}
    </span>
  );
}
