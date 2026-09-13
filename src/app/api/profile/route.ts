import { auth } from '@/auth';
import { calculateProfileCompletion, getProfileCompletion } from '@/lib/profileCompletion';
import { ProfileFormData, validateFullProfile } from '@/lib/validation/profile';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasAcceptedTerms, recordAcceptance } from '@/lib/consent';

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

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = session.user.email.trim().toLowerCase();
    console.log('[PROFILE GET] Fetching user by email:', email);

    const { data: initialProfile, error: dbError } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (dbError) {
      console.error('[PROFILE GET] Database error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    console.log('[PROFILE GET] Initial profile result:', {
      found: !!initialProfile,
      id: initialProfile?.id
    });

    let profile = initialProfile;
    let endUserProfile = null;
 
    if (!profile) {
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
 
      if (insertError) {
        console.error("Supabase error:", insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      profile = newProfile;
    } else {
      const categories = profile.category || [];
      if (categories.includes('Business Owner / Promoter')) {
        const { data: eup } = await supabase
          .from('end_user_profiles')
          .select('*')
          .eq('user_id', profile.id)
          .maybeSingle();
        endUserProfile = eup;
      }
    }
 
    const isBusinessPromoter = profile.category?.includes('Business Owner / Promoter') || false;
    const accepted = await hasAcceptedTerms(profile.id, session.user?.id);
    const mergedUser = {
      ...profile,
      ...(endUserProfile || {}),
      terms_accepted: accepted,
    };
    const canonical = getProfileCompletion(mergedUser);
    const isComplete = canonical.isComplete || !!profile.profile_completed_once || (profile.profile_completion ?? 0) >= 100;
    const finalPercentage = isComplete ? 100 : canonical.percentage;

    // Map DB (snake_case) to Frontend (camelCase)
    const profileData = {
      id: profile.id,
      fullName: profile.name,
      email: profile.email,
      phone: profile.phone,
      firmName: isBusinessPromoter ? null : profile.firm_name,
      companyName: endUserProfile?.company_name || null,
      website: endUserProfile?.website || null,
      role: isBusinessPromoter ? null : profile.role,
      customRole: isBusinessPromoter ? null : profile.custom_role,
      category: profile.category || [],
      customCategory: isBusinessPromoter ? null : profile.custom_category,
      baseCity: isBusinessPromoter ? null : profile.base_city,
      baseCountry: isBusinessPromoter ? null : profile.base_country,
      baseLocation: isBusinessPromoter ? null : profile.base_location,
      geographies: isBusinessPromoter ? [] : (profile.geographies || []),
      crossBorder: isBusinessPromoter ? false : (profile.cross_border === true),
      corridors: isBusinessPromoter ? [] : (profile.corridors || []),
      sectors: isBusinessPromoter ? (endUserProfile?.sectors || []) : (profile.sectors || []),
      currentFocus: isBusinessPromoter ? (endUserProfile?.intent || []) : (profile.intent || []),
      expertiseDescription: isBusinessPromoter ? (endUserProfile?.description || '') : (profile.expertise_description || ''),
      activeMandates: isBusinessPromoter ? [] : (profile.active_mandates || []),
      prioritySectors: isBusinessPromoter ? (endUserProfile?.sectors || []) : (profile.priority_sectors || []),
      coAdvisory: isBusinessPromoter ? false : (profile.co_advisory === true),
      collaborationModels: isBusinessPromoter ? [] : (profile.collaboration_model || []),
      profileAttachmentUrl: isBusinessPromoter ? null : profile.profile_attachment_url,
      profileImage: profile.profile_image,
      additionalInfo: isBusinessPromoter ? null : profile.additional_info,
      profileCompletion: finalPercentage,
      profileCompletedOnce: !!profile.profile_completed_once || isComplete,
      profileCompleted: isComplete,
      isComplete: isComplete,
      missingFields: isComplete ? [] : canonical.missingFields,
      onboardingTutorialCompleted: !!profile.onboarding_tutorial_completed,
      tokens: profile.tokens,
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

  if (!session?.user?.email) {
    logProfileCreate(requestId, 'auth', 'failed');
    return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
  }

  try {
    const body = await req.json() as ProfileFormData;
    const email = session.user.email.trim().toLowerCase();
    logProfileCreate(requestId, 'auth', 'success', { userEmailDomain: email.split('@')[1] });

    // 1. Validate Input (Using PRD rules)
    const errors = validateFullProfile(body);
    if (errors.length > 0) {
      logProfileCreate(requestId, 'validation', 'failed', { fields: errors.map(e => e.field) });
      return NextResponse.json({ errors, requestId }, { status: 400 });
    }
    logProfileCreate(requestId, 'validation', 'success');

    // Fetch current user state
    const { data: currentUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .single();

    if (fetchError || !currentUser) {
      logProfileCreate(requestId, 'user_lookup', 'failed', { reason: fetchError?.message || 'not_found' });
      return NextResponse.json({ error: fetchError?.message || 'User not found', requestId }, { status: 404 });
    }
    logProfileCreate(requestId, 'user_lookup', 'success', { userId: currentUser.id });

    // Reward logic: will be re-evaluated after re-calculating the new score based on DB state
    let shouldShowSuccess = false;

    const incomingPhone = body.phone || (body as { phone_number?: string }).phone_number;
    console.log("Saving phone:", incomingPhone);
    console.log("User ID:", session?.user?.id);

    const isBusinessPromoter = body.professionalCategory.includes('Business Owner / Promoter');

    // 3. Build update object (Snake Case) for users table
    const updateData = {
      name: body.fullName || currentUser.name,
      email: body.workEmail || currentUser.email,
      phone: incomingPhone || currentUser.phone,
      firm_name: isBusinessPromoter ? null : (body.firmName || currentUser.firm_name),
      role: isBusinessPromoter ? null : (body.role || currentUser.role),
      custom_role: isBusinessPromoter ? null : (body.customRole || currentUser.custom_role),
      category: body.professionalCategory || currentUser.category,
      custom_category: isBusinessPromoter ? null : (body.customCategory || currentUser.custom_category),
      base_city: isBusinessPromoter ? null : (body.baseCity || currentUser.base_city),
      base_country: isBusinessPromoter ? null : (body.baseCountry || currentUser.base_country),
      base_location: isBusinessPromoter ? null : (((body.baseCity && body.baseCountry) ? `${body.baseCity}, ${body.baseCountry}` : currentUser.base_location)),
      geographies: isBusinessPromoter ? null : (body.activeGeographies || currentUser.geographies),
      cross_border: isBusinessPromoter ? false : (body.crossBorder !== undefined ? body.crossBorder : currentUser.cross_border),
      corridors: isBusinessPromoter ? null : (body.corridors || currentUser.corridors),
      sectors: isBusinessPromoter ? null : (body.primarySectors || currentUser.sectors),
      expertise_description: isBusinessPromoter ? null : (body.expertiseDescription !== undefined ? body.expertiseDescription : currentUser.expertise_description),
      active_mandates: isBusinessPromoter ? null : (body.activeMandates !== undefined ? body.activeMandates : currentUser.active_mandates),
      priority_sectors: isBusinessPromoter ? null : (body.primarySectors !== undefined ? body.primarySectors : currentUser.priority_sectors),
      co_advisory: isBusinessPromoter ? false : (body.coAdvisory !== undefined ? body.coAdvisory : currentUser.co_advisory),
      collaboration_model: isBusinessPromoter ? null : (body.collaborationModels || currentUser.collaboration_model),
      profile_attachment_url: isBusinessPromoter ? null : (body.attachmentUrl !== undefined ? body.attachmentUrl : currentUser.profile_attachment_url),
      additional_info: isBusinessPromoter ? null : (body.additionalInfo !== undefined ? body.additionalInfo : currentUser.additional_info),
      intent: isBusinessPromoter ? null : ((body.currentFocus !== undefined && body.currentFocus !== null && body.currentFocus.length > 0) ? body.currentFocus : currentUser.intent),
      profile_completion: currentUser.profile_completion, // Will be updated after this save
      profile_completed_once: currentUser.profile_completed_once,
      is_phone_verified: incomingPhone ? true : currentUser.isPhoneVerified,
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

    // 4. Store in DB
    const { error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .ilike("email", email);

    if (updateError) {
      logProfileCreate(requestId, 'database_insert', 'failed', { reason: updateError.message });
      throw new Error(updateError.message);
    }
    logProfileCreate(requestId, 'database_insert', 'success', { userId: currentUser.id });

    if (isBusinessPromoter) {
      const { error: eupError } = await supabase
        .from('end_user_profiles')
        .upsert({
          user_id: currentUser.id,
          company_name: body.companyName,
          website: body.website,
          sectors: body.primarySectors || [],
          intent: body.currentFocus || [],
          description: body.expertiseDescription || null,
        }, { onConflict: 'user_id' });

      if (eupError) {
        logProfileCreate(requestId, 'attachment_association', 'failed', { reason: eupError.message });
        console.error('[PROFILE POST] end_user_profiles upsert error:', eupError);
        throw new Error(`Failed to save End User profile: ${eupError.message}`);
      }
    } else {
      await supabase
        .from('end_user_profiles')
        .delete()
        .eq('user_id', currentUser.id);
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
      .ilike("email", email)
      .single();

    const accepted = await hasAcceptedTerms(updatedUser.id, session.user?.id);
    let mergedUser = { ...updatedUser, terms_accepted: accepted || !!body.termsAccepted };
    
    if (isBusinessPromoter) {
      const { data: eup } = await supabase
        .from('end_user_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (eup) {
        mergedUser.company_name = eup.company_name;
        mergedUser.website = eup.website;
        mergedUser.sectors = eup.sectors;
        mergedUser.intent = eup.intent;
        mergedUser.expertise_description = eup.description;
      }
    }

    const canonical = getProfileCompletion(mergedUser);
    const score = canonical.percentage;
    const isComplete = canonical.isComplete || score === 100;
    let tokenIncrement = 0;

    // Reward logic: +100 tokens if reaching 100% for the first time
    if (isComplete && !currentUser.profile_completed_once) {
      tokenIncrement = 100;
      const finalTokensWithReward = (updatedUser.tokens ?? 0) + tokenIncrement;

      await supabase
        .from("users")
        .update({
          profile_completion: 100,
          profile_completed_once: true,
          tokens: finalTokensWithReward
        })
        .ilike("email", email);

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
        .ilike("email", email);
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

