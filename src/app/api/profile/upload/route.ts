import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient, getServerKeyType } from '@/utils/supabase/server';
import { checkFileSignature } from '@/lib/fileSignature';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];

// Canonical MIME type per extension — used for the magic-byte check below
// when the browser-supplied file.type is missing/wrong but the extension
// matched (this route accepts by EITHER, unlike parse-document's strict
// MIME check, so a canonical type must be resolved before signature-checking).
const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET_NAME = 'profile-attachments';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    console.error('[UPLOAD] Supabase client could not be initialized. Check env vars:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    return NextResponse.json(
      { field: 'file', message: 'Upload service is not configured. Missing Supabase environment variables.' },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ field: 'file', message: 'No file provided' }, { status: 400 });
    }

    // Validate by MIME type OR file extension (browsers can report incorrect MIME types)
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    const isValidType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);

    if (!isValidType) {
      return NextResponse.json(
        { field: 'file', message: `Only PDF, DOC, DOCX, PPT, PPTX files are accepted. (Received: ${file.type || 'unknown'})` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ field: 'file', message: 'File must be under 10MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // SECURITY: Content-Type and extension are both spoofable — verify the
    // actual bytes match the claimed type before it's stored. Resolve a
    // canonical MIME to check against, since this route accepts by EITHER
    // MIME OR extension (file.type may be empty/wrong even on a legitimate
    // upload if only the extension matched).
    const signatureMime = ACCEPTED_TYPES.includes(file.type) ? file.type : EXTENSION_TO_MIME[ext];
    const sigCheck = signatureMime ? checkFileSignature(buffer, signatureMime) : { valid: false as const, reason: 'Unresolvable file type' };
    if (!sigCheck.valid) {
      console.error(`[UPLOAD] Rejected file with mismatched signature: claimed=${file.type || ext} reason=${sigCheck.reason}`);
      return NextResponse.json({ field: 'file', message: 'File content does not match the declared file type.' }, { status: 400 });
    }

    // Ensure bucket exists (auto-create with service role key)
    const keyType = getServerKeyType();
    if (keyType === 'service_role') {
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = buckets?.some(b => b.name === BUCKET_NAME);
        if (!exists) {
          console.log(`[UPLOAD] Creating bucket '${BUCKET_NAME}'...`);
          await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: MAX_SIZE,
            allowedMimeTypes: ACCEPTED_TYPES,
          });
        }
      } catch (bucketErr) {
        console.warn('[UPLOAD] Bucket check/create failed (may already exist):', bucketErr);
      }
    }

    // Build file path
    const email = session.user.email.trim().toLowerCase();
    const safeFolder = email.replace(/[^a-z0-9]/g, '_');
    const cleanExt = ext.replace('.', '');
    const fileName = `${safeFolder}/${Date.now()}.${cleanExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase error:", uploadError);
      console.error("FULL ERROR:", uploadError);
      console.error("STRINGIFIED:", JSON.stringify(uploadError, null, 2));

      // Provide actionable error message
      let userMessage = 'Upload failed: ' + uploadError.message;
      if (uploadError.message.includes('Bucket not found')) {
        userMessage = 'Storage bucket not configured. Please create a public bucket named "profile-attachments" in your Supabase dashboard (Storage → New Bucket).';
      } else if (uploadError.message.includes('security') || uploadError.message.includes('policy')) {
        userMessage = 'Storage permission denied. Please add a public upload policy to your "profile-attachments" bucket.';
      }

      return NextResponse.json({ field: 'file', message: userMessage }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    // Persist URL to user profile
    const { error: updateError } = await supabase
      .from('users')
      .update({ profile_attachment_url: urlData.publicUrl })
      .ilike('email', email);

    if (updateError) {
      console.error("Supabase error:", updateError);
      console.error("FULL ERROR:", updateError);
      console.error("STRINGIFIED:", JSON.stringify(updateError, null, 2));
    }

    console.log('[UPLOAD] Success:', { fileName, url: urlData.publicUrl, keyType });

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      fileName: file.name,
    });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ field: 'file', message: `Upload failed: ${errorMessage || 'Unknown upload error'}` }, { status: 500 });
  }
}
