import { auth } from '@/auth';
import { calculateProfileCompletion, getProfileCompletion } from '@/lib/profileCompletion';
import { ProfileFormData, validateFullProfile } from '@/lib/validation/profile';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasAcceptedTerms, recordAcceptance } from '@/lib/consent';
import { deriveTicketBandFromProposals } from '@/lib/ticketBand';
import { fetchAdvisorRequirements, syncAdvisorRequirements } from '@/lib/advisorRequirements';
import { resolveDbUser } from '@/lib/resolveDbUser';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      console.error('[PROFILE GET] Supabase init failed:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      });
      return NextResponse.json({ error: 'Database not configured. Check Vercel environment variables.' }, { status: 503 });
    }

    const session = await auth();
    console.log('[PROFILE GET] Session check:', {
      hasSession: !!session,
      userEmail: session?.user?.email,
      userId: session?.user?.id
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const initialProfile = await resolveDbUser<{ id: string; [key: string]: any }>(supabase, session.user, '*');

    console.log('[PROFILE GET] Initial profile result:', {
      found: !!initialProfile,
      id: initialProfile?.id
    });

    let profile: { id: string; [key: string]: any } | null = initialProfile;

    if (!profile) {
      const email = session.user.email?.trim().toLowerCase() || `${session.user.id}@dealcollab.ai`;
      const nameFallback = session.user.name || email.split("@")[0];
      const { data: newProfile, error: insertError } = await supabase
        .from("users")
        .insert({
          email: email,
          name: nameFallback,
          tokens: 0,
          profile_completion: 0
        })
        .select()
        .single();

      if (insertError || !newProfile) {
        console.error("Supabase error:", insertError);
        return NextResponse.json({ error: insertError?.message || 'Failed to create user' }, { status: 500 });
      }
      profile = newProfile as { id: string; [key: string]: any };
    }

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const isBusinessPromoter = profile.category?.includes('Business Owner / Promoter') || false;

    const { data: endUserProfile } = await supabase
      .from('end_user_profiles')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    const accepted = await hasAcceptedTerms(profile.id, session.user?.id);
    const compName = endUserProfile?.company_name || profile.firm_name || null;
    const website = endUserProfile?.website || null;
    const sectors = endUserProfile?.sectors?.length ? endUserProfile.sectors : (profile.sectors || []);
    const intent = endUserProfile?.intent?.length ? endUserProfile.intent : (profile.intent || []);
    const expertiseDescription = endUserProfile?.description ?? profile.expertise_description ?? '';

    const mergedUser = {
      ...profile,
      ...(endUserProfile || {}),
      company_name: compName,
      website: website,
      sectors: sectors,
      intent: intent,
      expertise_description: expertiseDescription,
      terms_accepted: accepted,
    };
    const canonical = getProfileCompletion(mergedUser);
    const isComplete = canonical.isComplete || !!profile.profile_completed_once || (profile.profile_completion ?? 0) >= 100;
    const finalPercentage = isComplete ? 100 : canonical.percentage;

    const { data: userProposals } = await supabase
      .from('proposals')
      .select('deal_size_min_cr, deal_size_max_cr, status')
      .eq('user_id', profile.id);

    const derivedTicketBand = deriveTicketBandFromProposals(
      userProposals,
      expertiseDescription || profile.additional_info
    );

    // Fetch requirements for advisor
    const requirements = !isBusinessPromoter ? await fetchAdvisorRequirements(profile.id) : [];

    // Map DB (snake_case) to Frontend (camelCase)
    const profileData = {
      id: profile.id,
      fullName: profile.name,
      email: profile.email,
      phone: profile.phone,
      firmName: compName,
      companyName: compName,
      website: website,
      role: profile.role,
      customRole: profile.custom_role,
      category: profile.category || [],
      customCategory: profile.custom_category,
      baseCity: profile.base_city,
      baseCountry: profile.base_country,
      baseLocation: profile.base_location,
      geographies: profile.geographies || [],
      crossBorder: profile.cross_border === true,
      corridors: profile.corridors || [],
      sectors: sectors,
      currentFocus: intent,
      expertiseDescription: expertiseDescription,
      activeMandates: profile.active_mandates || [],
      prioritySectors: sectors,
      coAdvisory: profile.co_advisory === true,
      collaborationModels: profile.collaboration_model || [],
      profileAttachmentUrl: profile.profile_attachment_url,
      profileImage: profile.profile_image,
      additionalInfo: isBusinessPromoter ? null : profile.additional_info,
      requirements,
      profileCompletion: finalPercentage,
      profileCompletedOnce: !!profile.profile_completed_once || isComplete,
      profileCompleted: isComplete,
      isComplete: isComplete,
      missingFields: isComplete ? [] : canonical.missingFields,
      onboardingTutorialCompleted: !!profile.onboarding_tutorial_completed,
      tokens: profile.tokens,
      ticketBand: derivedTicketBand.ticketBand,
      dealSizeMin: derivedTicketBand.dealSizeMin,
      dealSizeMax: derivedTicketBand.dealSizeMax,
      closedCount: derivedTicketBand.closedCount,
    };

    return NextResponse.json(profileData);
  } catch (error: unknown) {
    console.error("FULL ERROR IN PROFILE GET:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

function genRequestId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* fall through */ }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function logProfileCreate(requestId: string, stage: string, status: 'start' | 'success' | 'failed', extra: Record<string, unknown> = {}) {
  // Never log passwords/tokens/attachment contents — ids and status only.
  console.log(`[PROFILE_CREATE] requestId=${requestId} stage=${stage} status=${status}`, extra);
}

export async function POST(req: NextRequest) {
  const requestId = genRequestId();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    logProfileCreate(requestId, 'init', 'failed', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    return NextResponse.json({ error: 'Database not configured. Check Vercel environment variables.', requestId }, { status: 503 });
  }
  const session = await auth();

  if (!session?.user) {
    logProfileCreate(requestId, 'auth', 'failed');
    return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
  }

  try {
    const body = await req.json() as ProfileFormData;
    logProfileCreate(requestId, 'auth', 'success', { userId: session.user.id });

    // 1. Validate Input (Using PRD rules)
    const errors = validateFullProfile(body);
    if (errors.length > 0) {
      logProfileCreate(requestId, 'validation', 'failed', { fields: errors.map(e => e.field) });
      return NextResponse.json({ errors, requestId }, { status: 400 });
    }
    logProfileCreate(requestId, 'validation', 'success');

    // Fetch current user state by ID, email, or phone
    const currentUser = await resolveDbUser<{ id: string; [key: string]: any }>(supabase, session.user, '*');

    if (!currentUser) {
      logProfileCreate(requestId, 'user_lookup', 'failed', { reason: 'not_found' });
      return NextResponse.json({ error: 'User not found', requestId }, { status: 404 });
    }
    logProfileCreate(requestId, 'user_lookup', 'success', { userId: currentUser.id });

    // Reward logic: will be re-evaluated after re-calculating the new score based on DB state
    let shouldShowSuccess = false;

    const incomingPhone = body.phone || (body as { phone_number?: string }).phone_number;
    console.log("Saving phone:", incomingPhone);
    console.log("User ID:", currentUser.id);

    const company = body.companyName || body.firmName || currentUser.firm_name || '';

    // 3. Build update object (Snake Case) for users table
    const updateData = {
      name: body.fullName || currentUser.name,
      email: currentUser.email, // SECURITY: Primary login email cannot be changed without email verification
      phone: incomingPhone || currentUser.phone,
      firm_name: company || null,
      role: body.role || currentUser.role,
      custom_role: body.customRole || currentUser.custom_role,
      category: body.professionalCategory || currentUser.category,
      custom_category: body.customCategory || currentUser.custom_category,
      base_city: body.baseCity || currentUser.base_city,
      base_country: body.baseCountry || currentUser.base_country,
      base_location: (((body.baseCity && body.baseCountry) ? `${body.baseCity}, ${body.baseCountry}` : currentUser.base_location)),
      geographies: body.activeGeographies || currentUser.geographies,
      cross_border: body.crossBorder !== undefined ? body.crossBorder : currentUser.cross_border,
      corridors: body.corridors || currentUser.corridors,
      sectors: body.primarySectors || currentUser.sectors,
      expertise_description: body.expertiseDescription !== undefined ? body.expertiseDescription : currentUser.expertise_description,
      active_mandates: body.activeMandates !== undefined ? body.activeMandates : currentUser.active_mandates,
      priority_sectors: body.primarySectors !== undefined ? body.primarySectors : currentUser.priority_sectors,
      co_advisory: body.coAdvisory !== undefined ? body.coAdvisory : currentUser.co_advisory,
      collaboration_model: body.collaborationModels || currentUser.collaboration_model,
      profile_attachment_url: body.attachmentUrl !== undefined ? body.attachmentUrl : currentUser.profile_attachment_url,
      additional_info: body.additionalInfo !== undefined ? body.additionalInfo : currentUser.additional_info,
      intent: ((body.currentFocus !== undefined && body.currentFocus !== null && body.currentFocus.length > 0) ? body.currentFocus : currentUser.intent),
      profile_completion: currentUser.profile_completion, // Will be updated after this save
      profile_completed_once: currentUser.profile_completed_once,
      // Phone OTP is not compulsory: saving a phone marks it verified directly
      is_phone_verified: incomingPhone ? true : (currentUser.is_phone_verified ?? currentUser.isPhoneVerified ?? false),
      tokens: currentUser.tokens ?? 0,
      profile_image: (() => {
        const incoming = (body.profileImage !== undefined)
          ? body.profileImage
          : (body.profile_image !== undefined)
            ? body.profile_image
            : undefined;

        if (incoming === undefined) return currentUser.profile_image;
        if (incoming === '' || incoming === null) return null;

        if (incoming && incoming.includes('googleusercontent.com')) {
          console.log('[PROFILE API] REJECTING GOOGLE URL FOR profile_image:', incoming);
          return currentUser.profile_image;
        }

        return incoming;
      })(),
    };

    console.log('[PROFILE API] Final DB value for profile_image:', updateData.profile_image);
    console.log('[PROFILE API] Updating user with data:', updateData);

    // 4. Store in DB by ID
    const { error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", currentUser.id);

    if (updateError) {
      logProfileCreate(requestId, 'database_insert', 'failed', { reason: updateError.message });
      throw new Error(updateError.message);
    }
    logProfileCreate(requestId, 'database_insert', 'success', { userId: currentUser.id });

    const { data: existingEup } = await supabase
      .from('end_user_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    // Always keep end_user_profiles in sync for 3-step setup (stores company_name and website)
    const { error: eupError } = await supabase
      .from('end_user_profiles')
      .upsert({
        user_id: currentUser.id,
        company_name: company || existingEup?.company_name || '',
        website: body.website !== undefined ? body.website : (existingEup?.website || ''),
        sectors: body.primarySectors !== undefined ? body.primarySectors : (existingEup?.sectors || []),
        intent: body.currentFocus !== undefined ? body.currentFocus : (existingEup?.intent || []),
        description: body.expertiseDescription !== undefined ? body.expertiseDescription : (existingEup?.description || null),
      }, { onConflict: 'user_id' });

    if (eupError) {
      logProfileCreate(requestId, 'attachment_association', 'failed', { reason: eupError.message });
      console.warn('[PROFILE POST] end_user_profiles upsert note:', eupError);
    }

    // Sync standing requirements for advisor if provided
    if (body.requirements !== undefined) {
      try {
        await syncAdvisorRequirements(currentUser.id, body.requirements || []);
      } catch (reqErr) {
        console.error('[PROFILE POST] syncAdvisorRequirements error:', reqErr);
      }
    }

    // Record terms acceptance if accepted in body
    if (body.termsAccepted || (body as { terms_accepted?: boolean }).terms_accepted) {
      try {
        await recordAcceptance(
          currentUser.id,
          {
            ip: req.headers.get('x-forwarded-for') ?? undefined,
            userAgent: req.headers.get('user-agent') ?? undefined,
          },
          session.user?.id,
        );
      } catch (consentErr) {
        console.error('[PROFILE POST] recordAcceptance error:', consentErr);
      }
    }

    // 5. Recalculate completion using canonical logic based on DB state
    const { data: updatedUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    const accepted = await hasAcceptedTerms(updatedUser.id, session.user?.id);
    const { data: eup } = await supabase
      .from('end_user_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    const mergedUser = { 
      ...updatedUser, 
      ...(eup || {}),
      company_name: eup?.company_name || updatedUser.firm_name || '',
      website: eup?.website || '',
      sectors: eup?.sectors?.length ? eup.sectors : (updatedUser.sectors || []),
      intent: eup?.intent?.length ? eup.intent : (updatedUser.intent || []),
      expertise_description: eup?.description ?? updatedUser.expertise_description ?? '',
      terms_accepted: accepted || !!body.termsAccepted 
    };

    const canonical = getProfileCompletion(mergedUser);
    const score = canonical.percentage;
    const isComplete = canonical.isComplete || score === 100;
    let tokenIncrement = 0;

    // Check if user already received onboarding tokens previously
    const { data: existingGrant } = await supabase
      .from('token_transactions')
      .select('id')
      .eq('user_id', currentUser.id)
      .in('action', ['SIGNUP_GRANT', 'Profile Completion Reward'])
      .maybeSingle();

    // Reward logic: +100 tokens if reaching 100% for the first time
    const isFirstTimeCompletion = isComplete && !currentUser.profile_completed_once && !existingGrant;

    if (isFirstTimeCompletion) {
      tokenIncrement = 100;
      const finalTokensWithReward = (updatedUser.tokens ?? 0) + tokenIncrement;

      await supabase
        .from("users")
        .update({
          profile_completion: 100,
          profile_completed_once: true,
          tokens: finalTokensWithReward
        })
        .eq("id", currentUser.id);

      shouldShowSuccess = true;

      // Log Transaction if tokens added
      await supabase
        .from("token_transactions")
        .insert({
          user_id: currentUser.id,
          type: 'credit',
          action: 'Profile Completion Reward',
          amount: tokenIncrement,
          balance_after: finalTokensWithReward,
        });
    } else {
      await supabase
        .from("users")
        .update({ 
          profile_completion: score,
          profile_completed_once: currentUser.profile_completed_once || isComplete
        })
        .eq("id", currentUser.id);
    }

    logProfileCreate(requestId, 'complete', 'success', { isComplete, progress: isComplete ? 100 : score });
    return NextResponse.json({
      success: true,
      rewarded: tokenIncrement > 0,
      shouldShowSuccess,
      progress: isComplete ? 100 : score,
      isComplete,
      missingFields: isComplete ? [] : canonical.missingFields,
      requestId,
    });
  } catch (error: unknown) {
    // Full detail (including stack) stays server-side only — the response
    // carries a message + requestId so a user report can be traced back to
    // this exact log line without exposing internals to the client.
    logProfileCreate(requestId, 'unhandled', 'failed', { reason: error instanceof Error ? error.message : String(error) });
    console.error(`[PROFILE_CREATE] requestId=${requestId} full error:`, error);
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unexpected server error');
    return NextResponse.json({ error: errorMessage, requestId }, { status: 500 });
  }
}

