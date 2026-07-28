import { auth } from '@/auth';
import { calculateProfileCompletion } from '@/lib/profileCompletion';
import { ProfileFormData, validateFullProfile } from '@/lib/validation/profile';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
    }

    // Map DB (snake_case) to Frontend (camelCase)
    const profileData = {
      id: profile.id,
      fullName: profile.name,
      email: profile.email,
      phone: profile.phone,
      firmName: profile.firm_name,
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
      sectors: profile.sectors || [],
      currentFocus: profile.intent || [],
      expertiseDescription: profile.expertise_description,
      activeMandates: profile.active_mandates || [],
      prioritySectors: profile.priority_sectors || [],
      coAdvisory: profile.co_advisory === true,
      collaborationModels: profile.collaboration_model || [],
      profileAttachmentUrl: profile.profile_attachment_url,
      profileImage: profile.profile_image,
      additionalInfo: profile.additional_info,
      profileCompletion: profile.profile_completion || 0,
      tokens: profile.tokens,
    };

    return NextResponse.json(profileData);
  } catch (error: unknown) {
    console.error("FULL ERROR IN PROFILE GET:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    console.error('[PROFILE POST] Supabase init failed:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    return NextResponse.json({ error: 'Database not configured. Check Vercel environment variables.' }, { status: 503 });
  }
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as ProfileFormData;
    const email = session.user.email.trim().toLowerCase();

    // 1. Validate Input (Using PRD rules)
    const errors = validateFullProfile(body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    // Fetch current user state
    const { data: currentUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .single();

    if (fetchError || !currentUser) {
      if (fetchError) console.error("Supabase error:", fetchError);
      return NextResponse.json({ error: fetchError?.message || 'User not found' }, { status: 404 });
    }

    // Reward logic: will be re-evaluated after re-calculating the new score based on DB state
    let shouldShowSuccess = false;

    const incomingPhone = body.phone || (body as { phone_number?: string }).phone_number;
    console.log("Saving phone:", incomingPhone);
    console.log("User ID:", session?.user?.id);

    // 3. Build update object (Snake Case)
    const updateData = {
      name: body.fullName || currentUser.name,
      email: body.workEmail || currentUser.email,
      phone: incomingPhone || currentUser.phone,
      firm_name: body.firmName || currentUser.firm_name,
      role: body.role || currentUser.role,
      custom_role: body.customRole || currentUser.custom_role,
      category: body.professionalCategory || currentUser.category,
      custom_category: body.customCategory || currentUser.custom_category,
      base_city: body.baseCity || currentUser.base_city,
      base_country: body.baseCountry || currentUser.base_country,
      base_location: (body.baseCity && body.baseCountry) ? `${body.baseCity}, ${body.baseCountry}` : currentUser.base_location,
      geographies: body.activeGeographies || currentUser.geographies,
      cross_border: body.crossBorder !== undefined ? body.crossBorder : currentUser.cross_border,
      corridors: body.corridors || currentUser.corridors,
      sectors: body.primarySectors || currentUser.sectors,
      expertise_description: body.expertiseDescription !== undefined ? body.expertiseDescription : currentUser.expertise_description,
      active_mandates: body.activeMandates !== undefined ? body.activeMandates : currentUser.active_mandates,
      priority_sectors: body.primarySectors !== undefined ? body.primarySectors : currentUser.priority_sectors,
      co_advisory: body.coAdvisory !== undefined ? body.coAdvisory : currentUser.co_advisory,
      collaboration_model: body.collaborationModels || currentUser.collaboration_model,
      profile_attachment_url: body.attachmentUrl !== undefined ? body.attachmentUrl : (body.profile_attachment_url !== undefined ? body.profile_attachment_url : currentUser.profile_attachment_url),
      additional_info: body.additionalInfo !== undefined ? body.additionalInfo : currentUser.additional_info,
      // SAFE UPDATE: Prevent overwriting intent/currentFocus with empty values if not provided
      intent: (body.currentFocus !== undefined && body.currentFocus !== null && body.currentFocus.length > 0)
        ? body.currentFocus
        : currentUser.intent,
      profile_completion: currentUser.profile_completion, // Will be updated after this save
      profile_completed_once: currentUser.profile_completed_once,
      is_phone_verified: incomingPhone ? true : currentUser.isPhoneVerified,
      // Balance is never client-settable — this endpoint is a profile save,
      // not a token operation. Always carry the current value forward; use
      // /api/profile/tokens (server-fixed action costs) to change balance.
      tokens: currentUser.tokens ?? 0,
      // STRICT: Only update profile_image if a value is provided in the request
      // and it is NOT a Google avatar URL (Google avatars are fallbacks, not DB values)
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
      console.error("Supabase error:", updateError);
      throw new Error(updateError.message);
    }

    // 5. Recalculate completion using the NEW logic based on DB state
    const { data: updatedUser } = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .single();

    const score = calculateProfileCompletion(updatedUser);
    let tokenIncrement = 0;

    // Reward logic: +100 tokens if reaching 100% for the first time
    if (score === 100 && !currentUser.profile_completed_once) {
      tokenIncrement = 100;
      const finalTokensWithReward = (updatedUser.tokens ?? 0) + tokenIncrement;

      await supabase
        .from("users")
        .update({
          profile_completion: score,
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
        .update({ profile_completion: score })
        .ilike("email", email);
    }

    return NextResponse.json({
      success: true,
      rewarded: tokenIncrement > 0,
      shouldShowSuccess,
      progress: score
    });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

