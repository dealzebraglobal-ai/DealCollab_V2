'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DealDashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/eoi-activities');
  }, [router]);

  return null;
}
