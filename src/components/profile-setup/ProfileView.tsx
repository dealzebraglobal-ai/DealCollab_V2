'use client';
import React from 'react';
import Image from 'next/image';
import { 
  User, Globe, MapPin, Target, Zap, MessageSquare, Edit3, Briefcase, FileText
} from 'lucide-react';
import { UserProfile } from '../UserProvider';

interface ProfileViewProps {
  data: UserProfile | null; // Corrected from 'any'
  onEdit: () => void;
}

export default function ProfileView({ data, onEdit }: ProfileViewProps) {
  if (!data) return null;

  const isBusinessPromoter = Array.isArray(data.category) && data.category.includes('Business Owner / Promoter');

  if (isBusinessPromoter) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 pb-32">
        {/* Header Card */}
        <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-brand-accent/5 rounded-3xl flex items-center justify-center text-brand-accent overflow-hidden relative">
              {data.profileImage ? (
                <Image 
                  src={data.profileImage} 
                  alt="Profile" 
                  className="object-cover" 
                  fill
                  sizes="80px"
                />
              ) : (
                <User size={40} />
              )}
            </div>
            <div>
              <h1 className="text-3xl font-black text-foreground tracking-tight">{data.fullName || data.name}</h1>
              <p className="text-brand-secondary font-medium">
                Business Promoter {data.companyName ? `@ ${data.companyName}` : ''}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Profile Verified
                </span>
                <span className="px-3 py-1 bg-brand-accent/5 text-brand-accent rounded-full text-[10px] font-black uppercase tracking-wider">
                  Strength: {data.profileCompletion || 0}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onEdit}
              className="flex items-center gap-2 px-6 py-3 bg-foreground text-white rounded-2xl font-black text-sm hover:bg-brand-accent transition-all transform hover:-translate-y-1 shadow-lg hover:shadow-brand-accent/20"
            >
              <Edit3 size={18} />
              Update Profile
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Section 1: Basic Identity */}
          <SectionCard title="Basic Identity" icon={<User size={20} />} onClick={onEdit}>
            <DataRow label="Full Name" value={data.fullName || data.name} />
            <DataRow label="Work Email" value={data.email} />
            <DataRow label="Phone" value={data.phone || 'Not provided'} />
            <DataRow label="Company / Business Name" value={data.companyName} />
            {data.website && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Business Website</span>
                <a 
                  href={data.website.startsWith('http') ? data.website : `https://${data.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-brand-accent hover:underline break-all"
                >
                  {data.website}
                </a>
              </div>
            )}
          </SectionCard>

          {/* Section 2: Business Details */}
          <SectionCard title="Business Details" icon={<Target size={20} />} onClick={onEdit}>
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Industry / Sector</span>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(data.sectors) && data.sectors.length > 0 ? (
                  data.sectors.map((sector: string) => (
                    <span 
                      key={sector} 
                      className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 text-[11px] font-bold rounded-lg"
                    >
                      {sector}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-brand-secondary">Not provided</span>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">What are you looking for?</span>
              <div className="flex flex-wrap gap-2">
                {Array.isArray(data.intent) && data.intent.length > 0 ? (
                  data.intent.map((focus: string) => (
                    <span 
                      key={focus} 
                      className="px-3 py-1.5 bg-brand-accent/5 border border-brand-accent/20 text-brand-accent text-[11px] font-bold rounded-lg"
                    >
                      {focus}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-brand-secondary">Not provided</span>
                )}
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Brief Requirement Description</span>
              <p className="text-sm font-medium text-foreground leading-relaxed italic">
                {data.expertiseDescription ? `"${data.expertiseDescription}"` : 'No description provided.'}
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 pb-32">

      {/* Header Card */}
      <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-brand-accent/5 rounded-3xl flex items-center justify-center text-brand-accent overflow-hidden relative">
            {data.profileImage ? (
              <Image 
                src={data.profileImage} 
                alt="Profile" 
                className="object-cover" 
                fill
                sizes="80px"
              />
            ) : (
              <User size={40} />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">{data.fullName || data.name}</h1>
            <p className="text-brand-secondary font-medium">
              {data.role === 'Other' ? data.customRole : data.role} {data.firmName ? `@ ${data.firmName}` : ''}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                Profile Verified
              </span>
              <span className="px-3 py-1 bg-brand-accent/5 text-brand-accent rounded-full text-[10px] font-black uppercase tracking-wider">
                Strength: {data.profileCompletion || 0}%
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onEdit}
            className="flex items-center gap-2 px-6 py-3 bg-foreground text-white rounded-2xl font-black text-sm hover:bg-brand-accent transition-all transform hover:-translate-y-1 shadow-lg hover:shadow-brand-accent/20"
          >
            <Edit3 size={18} />
            Update Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Section 1: Basic Identity */}
        <SectionCard title="Basic Identity" icon={<User size={20} />} onClick={onEdit}>
          <DataRow label="Full Name" value={data.fullName || data.name} />
          <DataRow label="Work Email" value={data.email} />
          <DataRow label="Phone" value={data.phone} />
          <DataRow label="Firm" value={data.firmName || 'Not provided'} />
          <DataRow label="Role" value={data.role === 'Other' ? data.customRole : data.role} />
          <div className="space-y-3 pt-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Professional Category</span>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(data.category) && data.category.map((cat: string) => (
                <span 
                  key={cat} 
                  className="px-3 py-1.5 bg-brand-accent/5 border border-brand-accent/20 text-brand-accent text-[11px] font-bold rounded-lg"
                >
                  {cat === 'Other' && data.customCategory ? `${data.customCategory}` : cat}
                </span>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Section 2: Geography & Coverage */}
        <SectionCard title="Geography & Coverage" icon={<MapPin size={20} />} onClick={onEdit}>
          <DataRow label="Base Location" value={`${data.baseCity}, ${data.baseCountry}`} />
          <DataRow label="Active Geographies" value={Array.isArray(data.geographies) ? data.geographies.join(', ') : 'Not provided'} />
          <DataRow label="Cross-border" value={data.crossBorder ? 'Enabled' : 'Disabled'} />
          {data.crossBorder && (
            <DataRow label="Key Corridors" value={Array.isArray(data.corridors) ? data.corridors.join(', ') : 'Not provided'} />
          )}
        </SectionCard>

        {/* Section 3: Expertise & Deal Capability */}
        <SectionCard title="Expertise" icon={<Target size={20} />} onClick={onEdit}>
          <div className="space-y-3">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Primary Industry Sectors</span>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(data.sectors) && data.sectors.map((sector: string) => (
                <span 
                  key={sector} 
                  className="px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 text-[11px] font-bold rounded-lg"
                >
                  {sector}
                </span>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Section 4: Current Intent */}
        <SectionCard title="Current Intent" icon={<Zap size={20} />} onClick={onEdit}>
          <DataRow label="Current Focus" value={Array.isArray(data.intent) ? data.intent.join(', ') : 'Not provided'} />
          <div className="space-y-1 pt-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Core Professional Expertise</span>
            <p className="text-sm font-medium text-foreground leading-relaxed italic">
              &quot;{data.expertiseDescription || 'No description provided.'}&quot;
            </p>
          </div>
        </SectionCard>

        {/* Section 5: Active Mandates */}
        <SectionCard title="Active Client Mandates" icon={<Briefcase size={20} />} onClick={onEdit}>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(data.activeMandates) && data.activeMandates.map((mandate: string) => (
              <span 
                key={mandate} 
                className="px-3 py-1.5 bg-gray-50 border border-gray-100 text-gray-600 text-[11px] font-bold rounded-lg"
              >
                {mandate}
              </span>
            ))}
          </div>
        </SectionCard>

        {/* Section 6: Collaboration */}
        <SectionCard title="Collaboration" icon={<Globe size={20} />} onClick={onEdit}>
          <DataRow label="Open to Co-Advisory" value={data.co_advisory || data.coAdvisory ? 'Yes' : 'No'} />
          <DataRow label="Preferred Models" value={Array.isArray(data.collaboration_model) ? data.collaboration_model.join(', ') : Array.isArray(data.collaborationModels) ? data.collaborationModels.join(', ') : 'Not provided'} />
        </SectionCard>

        {/* Section 7: Attachments */}
        <SectionCard title="Credentials" icon={<FileText size={20} />} onClick={onEdit}>
          {data.profileAttachmentUrl ? (
            <a 
              href={data.profileAttachmentUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl border border-green-100 text-green-700 hover:bg-green-100 transition-all group"
            >
              <FileText size={24} className="group-hover:scale-110 transition-transform" />
              <div>
                <span className="block text-sm font-bold">Professional Profile</span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Click to view attachment</span>
              </div>
            </a>
          ) : (
            <p className="text-sm text-brand-secondary font-medium">No profile attachment uploaded.</p>
          )}
        </SectionCard>

        {/* Section 8: Additional Information */}
        <SectionCard title="Additional Info" icon={<MessageSquare size={20} />} onClick={onEdit}>
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">Deal Preferences & Focus</span>
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {data.additionalInfo || 'No additional details provided.'}
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, onClick }: { title: string, icon: React.ReactNode, children: React.ReactNode, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm space-y-6 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:border-brand-accent hover:shadow-xl hover:shadow-brand-accent/5 group/card' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="text-brand-accent group-hover/card:scale-110 transition-transform">{icon}</div>
          <h3 className="text-lg font-black text-foreground tracking-tight">{title}</h3>
        </div>
        {onClick && (
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent opacity-0 group-hover/card:opacity-100 transition-opacity">
            Edit Section
          </span>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string, value: string | number | boolean | string[] | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary opacity-50">{label}</span>
      <span className="text-sm font-bold text-foreground">{value || 'Not provided'}</span>
    </div>
  );
}
