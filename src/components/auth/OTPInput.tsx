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
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        inputs.current[index - 1]?.focus();
      }
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const val = rawVal.replace(/[^0-9]/g, '');
    
    // Support Android OTP autofill which can sometimes push all 6 digits to the first input's onChange
    if (val.length === value.length) {
      val.split('').forEach((digit, i) => {
        onChange(i, digit);
      });
      inputs.current[5]?.focus();
      onComplete?.(val);
      return;
    }

    if (val.length <= 1) {
      onChange(index, val);
      if (val && index < value.length - 1) {
        inputs.current[index + 1]?.focus();
      }

      const next = [...value];
      next[index] = val;
      const code = next.join('');
      if (code.length === value.length && next.every(d => d.length === 1)) {
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
    <div className="flex justify-center gap-2 sm:gap-3 w-full max-w-[360px] mx-auto">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          maxLength={value.length}
          value={digit}
          disabled={isLoading}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onChange={(e) => handleChange(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className="w-12 h-14 sm:w-14 sm:h-16 bg-white border-2 border-gray-300 rounded-2xl text-center text-xl sm:text-2xl font-black text-[#0B1B2B] shadow-sm hover:border-gray-400 focus:bg-white focus:border-[#F97316] focus:ring-4 focus:ring-[#F97316]/10 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          required
        />
      ))}
    </div>
  );
}
