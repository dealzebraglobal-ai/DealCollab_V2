'use client';
import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function DealDashboardIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);

  useEffect(() => {
    if (resolvedParams?.id) {
      router.replace(`/eoi-activities/${resolvedParams.id}`);
    } else {
      router.replace('/eoi-activities');
    }
  }, [resolvedParams, router]);

  return null;
}
