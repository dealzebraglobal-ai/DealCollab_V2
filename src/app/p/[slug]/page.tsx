import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import IdentityCard from '@/components/IdentityCard';

export const dynamic = 'force-dynamic';

interface PublicUserRow {
  id: string;
  name: string | null;
  firm_name: string | null;
  role: string | null;
  custom_role: string | null;
  base_city: string | null;
  base_country: string | null;
  sectors: string[] | null;
  intent: string[] | null;
  expertise_description: string | null;
  priority_sectors: string[] | null;
  geographies: string[] | null;
  is_phone_verified: boolean | null;
  profile_completion: number | null;
  profile_image: string | null;
}

// The QR/share slug is `usr_${id.slice(0,8)}` (see /api/identity-card and
// VCardModal). It is not reversible to email/phone — only enough to look up
// the matching user id prefix. Collision odds at this app's scale are
// astronomically small for an 8-hex-char UUID prefix.
async function resolveUserBySlug(slug: string): Promise<PublicUserRow | null> {
  const prefix = slug.replace(/^usr_/, '');
  if (!/^[0-9a-f]{6,8}$/i.test(prefix)) return null;

  const supabase = createServerSupabaseClient();
  if (!supabase) return null;

  // PostgREST cannot ILIKE a uuid column directly (42883: operator does not
  // exist: uuid ~~* unknown) — resolved server-side via RPC instead.
  // See supabase/migrations/20260921_resolve_user_by_id_prefix.sql.
  const { data, error } = await supabase
    .rpc('resolve_user_by_id_prefix', { prefix })
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicUserRow;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const user = await resolveUserBySlug(slug);
  return {
    title: user?.name ? `${user.name} — DealCollab` : 'DealCollab Profile',
    description: 'Verified DealCollab member profile.',
    robots: { index: false, follow: false },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await resolveUserBySlug(slug);
  if (!user) notFound();

  const name = user.name || 'Verified Member';
  const role = user.custom_role || user.role || 'Advisory Partner';
  const sectors = (user.sectors || user.priority_sectors || []).slice(0, 4);
  const geographies = (user.geographies || []).slice(0, 3);
  const place = [user.base_city, user.base_country].filter(Boolean).join(', ');
  const headline = user.expertise_description ? user.expertise_description.slice(0, 120) : undefined;

  return (
    <main className="min-h-screen w-full flex flex-col items-center px-4 py-10 bg-[#0B0D0F]">
      <div className="w-full max-w-md">
        <IdentityCard
          mode="public"
          data={{
            fullName: name,
            photoUrl: user.profile_image || undefined,
            designation: role,
            organisation: user.firm_name || 'DealCollab Member',
            headline,
            mandateSide: (user.intent && user.intent[0]) ? user.intent[0].replace('_', '-').toLowerCase() : undefined,
            sectors,
            geographies: geographies.length > 0 ? geographies : ['India'],
            location: place || undefined,
            // No phone/email/internal ids on the public unauthenticated view.
            isVerified: !!user.is_phone_verified || (user.profile_completion ?? 0) >= 100,
            verifiedCode: String(user.id).slice(-4).toUpperCase(),
            profileSlug: `usr_${String(user.id).slice(0, 8)}`,
          }}
          showExportButtons={false}
        />
      </div>
    </main>
  );
}
