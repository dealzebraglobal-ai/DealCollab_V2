'use client';
import { useEffect } from 'react';
import { useUser } from '@/components/UserProvider';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function VerifyPage() {
  const { setOnboarding } = useUser();
  const router = useRouter();

  useEffect(() => {
    setOnboarding('phoneVerified', true);
    router.replace('/home');
  }, [setOnboarding, router]);

  return (
    <div className="bg-white rounded-[32px] border border-[#E5E7EB] p-8 shadow-2xl shadow-[#1F2937]/5 flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-8 h-8 text-[#F97316] animate-spin" />
      <p className="text-sm font-semibold text-gray-500">Redirecting to DealCollab...</p>
    </div>
  );
}
