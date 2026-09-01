import React from 'react';
import { CheckCircle2, Circle, ChevronRight, User as UserIcon, Smartphone } from 'lucide-react';
import { useUser } from './UserProvider';
import Link from 'next/link';

export default function OnboardingChecklist() {
  const { onboarding, isProfileComplete, profile } = useUser();

  const { phoneVerified } = onboarding;
  const profileCompleted = isProfileComplete || !!(onboarding.profileCompleted || profile?.profileCompleted || (profile?.profileCompletion ?? 0) >= 100);

  // Don't show if both steps are complete
  if (phoneVerified && profileCompleted) return null;

  const steps = [
    {
      id: 1,
      title: 'Phone Verified',
      completed: phoneVerified,
      icon: <Smartphone size={18} />,
      active: !phoneVerified,
      action: null
    },
    {
      id: 2,
      title: 'Complete Profile',
      completed: profileCompleted,
      icon: <UserIcon size={18} />,
      active: phoneVerified && !profileCompleted,
      action: !profileCompleted ? (
        <Link 
          href="/profile" 
          className="text-xs font-bold text-[#F97316] hover:underline flex items-center gap-1"
        >
          Go to Profile <ChevronRight size={12} />
        </Link>
      ) : (
        <div className="text-xs font-bold text-green-600 flex items-center gap-1">
          Profile Ready <CheckCircle2 size={12} />
        </div>
      )
    }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 animate-in fade-in duration-500">
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-foreground">Onboarding Checklist</h3>
          <div className="bg-primary text-white px-3 py-1 rounded-full text-xs font-bold border border-primary/20 shadow-sm">
            {steps.filter(s => s.completed).length} / {steps.length} Complete
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          {steps.map((step, index) => (
            <div 
              key={step.id} 
              style={{ animationDelay: `${index * 150}ms` }}
              className={`flex flex-col gap-3 p-5 rounded-[22px] border transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 fill-mode-both ${
                step.completed 
                  ? 'bg-green-50/50 border-green-100/50 opacity-80' 
                  : step.active 
                    ? 'bg-primary/5 border-primary/30 shadow-md ring-1 ring-primary/10 scale-[1.02]' 
                    : 'bg-primary-soft/30 border-border opacity-40'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`p-2.5 rounded-xl transition-colors duration-500 ${step.completed ? 'bg-green-100 text-green-600' : 'bg-primary/20 text-primary-hover'}`}>
                  {step.icon}
                </div>
                <div className="transition-all duration-500">
                  {step.completed ? (
                    <CheckCircle2 size={22} className="text-green-500 animate-in zoom-in duration-500" />
                  ) : (
                    <Circle size={22} className="text-border" />
                  )}
                </div>
              </div>
              
              <div className="space-y-1">
                <p className={`text-sm font-black tracking-tight ${step.completed ? 'text-green-800' : 'text-foreground'}`}>
                  {step.title}
                </p>
                <div className="min-h-[20px] transition-all duration-300">
                  {step.action}
                </div>
              </div>
            </div>
          ))}

          {/* Connection between steps (Desktop only) */}
          <div className="hidden md:block absolute top-[30px] left-[calc(50%-24px)] w-[48px] h-[2px] bg-border -z-10 animate-in fade-in duration-1000 delay-500" />
        </div>
      </div>
    </div>
  );
}
