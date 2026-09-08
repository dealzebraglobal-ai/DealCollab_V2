'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Settings as SettingsIcon, ChevronLeft } from 'lucide-react';
import ProfileStepper from '@/components/profile-setup/ProfileStepper';
import { UserProfile } from '@/components/UserProvider';
import ProfileSuccessScreen from '@/components/profile-setup/ProfileSuccessScreen';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ProfileSettingsPage() {
   const [profileData, setProfileData] = useState<UserProfile | null>(null);
   const [loading, setLoading] = useState(true);
   const [showSuccess, setShowSuccess] = useState(false);
   const router = useRouter();

   const fetchProfile = useCallback(async () => {
      try {
         const res = await fetch('/api/profile');
         const data = await res.json();
         setProfileData(data);
      } catch (err) {
         console.error('Failed to fetch profile:', err);
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      // Use queueMicrotask to avoid synchronous setState during render/effect phase
      queueMicrotask(() => {
         fetchProfile();
      });
   }, [fetchProfile]);

   if (loading) {
      return (
         <div className="flex-1 flex items-center justify-center bg-[#F9FAFB]">
            <Loader2 className="w-10 h-10 text-brand-accent animate-spin" />
         </div>
      );
   }

   if (showSuccess) {
      return <ProfileSuccessScreen onDashboardClick={() => router.push('/profile')} />;
   }

   return (
      <div className="flex-1 flex flex-col w-full h-full bg-[#F9FAFB] relative overflow-y-auto pb-24">
         <div className="w-full bg-white border-b border-gray-100 py-6 px-6 sticky top-0 z-30">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <Link 
                     href="/profile"
                     className="p-2 hover:bg-gray-50 rounded-xl transition-colors text-brand-secondary"
                  >
                     <ChevronLeft size={20} />
                  </Link>
                  <div className="flex items-center gap-2">
                     <SettingsIcon size={20} className="text-brand-accent" />
                     <h1 className="text-xl font-black text-foreground tracking-tight">Profile Settings</h1>
                  </div>
               </div>
               <div className="text-[10px] font-black uppercase tracking-widest text-brand-secondary opacity-40">
                  Professional Identity Editor
               </div>
            </div>
         </div>

         <div className="py-12">
            <div className="max-w-5xl mx-auto px-6 mb-12">
               <div className="bg-brand-accent/5 p-6 rounded-[28px] border border-brand-accent/10">
                  <h2 className="text-lg font-black text-foreground mb-1">Configuration Mode</h2>
                  <p className="text-sm text-brand-secondary font-medium">
                     Updates to your profile will instantly reflect across the DealCollab intelligence engine.
                  </p>
               </div>
            </div>

            <ProfileStepper 
               onComplete={(shouldShow) => {
                  if (shouldShow) {
                     setShowSuccess(true);
                  } else {
                     router.push('/profile');
                  }
               }} 
               initialData={profileData} 
            />
         </div>
      </div>
   );
}
