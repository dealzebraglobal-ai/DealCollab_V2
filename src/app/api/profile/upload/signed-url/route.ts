import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';

// Without an allowlist, `bucket` was taken straight from a query param and
// passed to createSignedUploadUrl() — any caller could request a signed
// upload URL into an arbitrary (existing) bucket name, not just the ones
// this endpoint is meant to serve.
const ALLOWED_BUCKETS = ['profile-attachments', 'avatars'];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileName = searchParams.get('file');
  const fileType = searchParams.get('type');
  const bucket = searchParams.get('bucket') || 'profile-attachments';

  if (!fileName || !fileType) {
    return NextResponse.json({ error: 'File name and type are required' }, { status: 400 });
  }

  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'Invalid storage bucket' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
  }

  const email = session.user.email.trim().toLowerCase();
  const safeFolder = email.replace(/[^a-z0-9]/g, '_');
  const ext = fileName.split('.').pop() || (fileType.split('/')[1]) || 'bin';
  const path = `${safeFolder}/${Date.now()}.${ext}`;

  // Create a signed URL for uploading (valid for 5 minutes)
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("Supabase error:", error);
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    
    // Check if it's a "bucket not found" error
    const isNotFound = error.message?.includes('not found') || 
                       error.message?.includes('does not exist') || 
                       (error as { status?: number }).status === 404 || 
                       (error as { status?: number }).status === 400;

    if (isNotFound) {
      return NextResponse.json({ 
        error: `Storage bucket '${bucket}' does not exist. Please create it in your Supabase dashboard or run the setup migration.` 
      }, { status: 500 });
    }

    return NextResponse.json({ error: error.message || 'Could not generate upload permission' }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    path: path,
    token: data.token // Required for some Supabase client versions
  });
}
