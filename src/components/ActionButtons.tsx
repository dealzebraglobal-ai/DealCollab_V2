'use client';
import React from 'react';
import { Trash2 } from 'lucide-react';

interface ActionButtonsProps {
  onView?: () => void;
  onDelete?: () => void;
  label?: string;
  variant?: 'match' | 'deal';
  isDeleteDisabled?: boolean;
}

export default function ActionButtons({ onView, onDelete, label, variant = 'match', isDeleteDisabled }: ActionButtonsProps) {
  if (variant === 'deal') {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        disabled={isDeleteDisabled}
        className={`p-2 rounded-lg transition-all ${isDeleteDisabled
          ? 'text-gray-300 cursor-not-allowed opacity-50'
          : 'text-[#6B7280] hover:text-red-500 hover:bg-red-50 active:scale-[0.95]'
          }`}
        title={isDeleteDisabled ? "Cannot delete — active connection" : "Delete Deal"}
      >
        <Trash2 size={18} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onView?.();
        }}
        className="px-3 py-1.5 text-xs font-bold text--white bg-[#F97316] hover:bg-[#EA580C] border border-[#F97316] rounded-lg shadow-sm transition-all active:scale-[0.97]"
      >
        View {label}
      </button>

    </div>
  );
}
