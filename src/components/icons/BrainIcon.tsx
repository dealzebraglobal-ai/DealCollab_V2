import React from 'react';

export default function BrainIcon({ size = 19, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Central vertical dividing line */}
      <path d="M12 3v18" />
      {/* Left Hemisphere - 3 rounded lobes */}
      <path d="M12 3C8.5 3 6 5.5 6 8.5C3.8 9 2.5 11 2.5 13.5C2.5 16 4.5 18 6.5 18.5C6.5 20.8 9 21 12 21" />
      {/* Right Hemisphere - 3 rounded lobes */}
      <path d="M12 3C15.5 3 18 5.5 18 8.5C20.2 9 21.5 11 21.5 13.5C21.5 16 19.5 18 17.5 18.5C17.5 20.8 15 21 12 21" />
    </svg>
  );
}

