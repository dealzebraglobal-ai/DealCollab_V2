'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/components/UserProvider';
import { Sparkles, Loader2 } from 'lucide-react';
import ProfileStepper from '@/components/profile-setup/ProfileStepper';
import ProfileView from '@/components/profile-setup/ProfileView';
import ProfileSuccessScreen from '@/components/profile-setup/ProfileSuccessScreen';

export default function ProfilePage() {
   const router = useRouter();
   const { profile, onboarding } = useUser();
   const [isEditing, setIsEditing] = useState(false);
   const [showSuccess, setShowSuccess] = useState(false);

   const handleComplete = (shouldShowSuccess?: boolean) => {
      // Force exit from editing/setup mode
      setIsEditing(false);
      
      if (shouldShowSuccess) {
         setShowSuccess(true);
      }
   };

   if (!profile) {
      return (
         <div className="flex-1 flex items-center justify-center bg-[#F9FAFB]">
            <div className="flex flex-col items-center gap-4">
               <Loader2 className="w-10 h-10 text-[#FFA000] animate-spin" />
               <p className="text-sm font-bold text-brand-secondary uppercase tracking-widest">Loading Profile...</p>
            </div>
         </div>
      );
   }

   if (showSuccess) {
      return <ProfileSuccessScreen onDashboardClick={() => {
         router.push('/profile');
         setShowSuccess(false);
         setIsEditing(false);
      }} />;
   }

   // If onboarding not completed and not currently editing, show onboarding
   if (!onboarding.profileCompleted && !isEditing) {
      return (
         <div className="flex-1 flex flex-col w-full bg-[#F9FAFB] relative min-h-screen">
            <HeroSection />
            <div className="w-full bg-gray-50/50">
               <ProfileStepper 
                  onComplete={handleComplete} 
                  initialData={profile}
               />
            </div>
         </div>
      );
   }

   return (
      <div className="flex-1 flex flex-col w-full bg-[#F9FAFB] relative min-h-screen">
         {isEditing ? (
            <div className="w-full py-12">
               <div className="max-w-5xl mx-auto px-6 mb-8 flex justify-between items-center">
                  <h2 className="text-2xl font-black text-foreground tracking-tight">Update Your Profile</h2>
                  <button 
                     onClick={() => setIsEditing(false)}
                     className="text-sm font-bold text-brand-secondary hover:text-brand-accent transition-colors"
                  >
                     Cancel Changes
                  </button>
               </div>
               <ProfileStepper 
                  onComplete={handleComplete} 
                  initialData={profile} 
               />
            </div>
         ) : (
            <>
               <HeroSection />
               <div className="w-full bg-gray-50/50 py-8 space-y-8">
                  <ProfileView 
                     data={profile} 
                     onEdit={() => setIsEditing(true)} 
                  />
               </div>
            </>
         )}
      </div>
   );
}

function HeroSection() {
   return (
      <section className="w-full bg-[#0B1B2B] py-10 relative overflow-hidden shrink-0">
         <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#F97316]/5 rounded-full -mr-40 -mt-40 blur-[100px] opacity-30 pointer-events-none" />
         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="flex flex-col items-center lg:items-start gap-3 text-center lg:text-left">
               <div className="flex items-center gap-2 px-3 py-1 bg-white/5 backdrop-blur-md rounded-full border border-white/10">
                  <div className="bg-[#F97316] text-white p-0.5 rounded shadow-lg">
                     <Sparkles size={11} />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/80">Professional Intelligence Layer</span>
               </div>
               <div className="space-y-2">
                  <h1 className="text-2xl md:text-3xl font-black text-white leading-tight tracking-tight">
                     Professional <span className="text-[#F97316]">Intelligence Profile</span>
                  </h1>
                  <p className="text-gray-400 font-medium max-w-2xl text-xs md:text-sm leading-relaxed">
                     Your verified profile determines the quality of deal matches and collaborator credibility within the DealCollab network.
                  </p>
               </div>
            </div>
         </div>
      </section>
   );
}
