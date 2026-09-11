import React from 'react';
import Skeleton from '@/components/Skeleton';

export default function GuideLoading() {
  return (
    <div className="relative flex-1 flex flex-col w-full bg-white h-full">
      <div className="flex-1 flex flex-col w-full p-6 sm:p-10 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-8 animate-in fade-in duration-300">
          <div className="space-y-3">
            <Skeleton className="h-9 w-48 rounded-xl" />
            <Skeleton className="h-4 w-full max-w-lg rounded-lg opacity-70" />
          </div>

          <Skeleton className="h-11 w-full rounded-2xl" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="p-6 rounded-2xl border border-[#E5E7EB] bg-white space-y-4 min-h-[250px] flex flex-col justify-between shadow-2xs">
                <div className="space-y-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <Skeleton className="h-5 w-3/4 rounded-lg" />
                  <Skeleton className="h-3 w-full rounded-md opacity-60" />
                  <Skeleton className="h-3 w-4/5 rounded-md opacity-60" />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-md opacity-50" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
