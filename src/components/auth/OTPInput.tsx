'use client';
import React, { useRef } from 'react';

interface OTPInputProps {
  value: string[];
  onChange: (index: number, value: string) => void;
  onComplete?: (code: string) => void;
  isLoading?: boolean;
}

export default function OTPInput({ value, onChange, onComplete, isLoading }: OTPInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 1) {
      onChange(index, val);
      if (val && index < 5) {
        inputs.current[index + 1]?.focus();
      }

      const next = [...value];
      next[index] = val;
      const code = next.join('');
      if (code.length === value.length) {
        onComplete?.(code);
      }
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
    if (!pasted) return;
    e.preventDefault();

    const next = [...value];
    const digits = pasted.slice(0, value.length - index).split('');
    digits.forEach((digit, i) => {
      next[index + i] = digit;
      onChange(index + i, digit);
    });

    const nextIndex = Math.min(index + digits.length, value.length - 1);
    inputs.current[nextIndex]?.focus();

    const code = next.join('');
    if (code.length === value.length) {
      onComplete?.(code);
    }
  };

  return (
    <div className="flex justify-between gap-3 sm:gap-4">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={isLoading}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onChange={(e) => handleChange(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className="w-full h-14 sm:h-16 bg-white/50 border border-[#E5E7EB] rounded-2xl text-center text-xl font-bold text-[#1F2937] focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-[#F97316]/10 transition-all outline-none disabled:opacity-50"
          required
        />
      ))}
    </div>
  );
}
