/**
 * DealCollab — server-authenticated Supabase Storage download
 * ================================================================
 * Previously, /api/chat/parse-document received a client-constructed
 * public URL (`${supabaseUrl}/storage/v1/object/public/pdfs/${path}`) and
 * fetched it directly. That's fragile and wrong on two counts: (1) it's an
 * unauthenticated, best-effort HTTP GET at the mercy of whatever the public
 * URL actually serves (bucket visibility, propagation timing, CDN caching,
 * an error payload instead of the file) rather than a real storage API
 * call, and (2) the server was fetching a URL *the browser* handed it,
 * which is an SSRF-shaped pattern even when narrowly allowlisted to one
 * host.
 *
 * This downloads the object directly via the Supabase Storage SDK using
 * the server's own (service-role, when configured) client — the same
 * mechanism already used elsewhere in this codebase for authenticated
 * storage access — so there's no URL construction, no public-bucket
 * assumption, and Supabase's own "not found" vs "other failure" signal is
 * available instead of an HTTP status code from a guessed URL.
 */

export interface StorageDownloadSuccess {
  success: true;
  buffer: Buffer;
  contentType: string | null;
}

export interface StorageDownloadFailure {
  success: false;
  code: 'STORAGE_OBJECT_NOT_FOUND' | 'STORAGE_ACCESS_DENIED' | 'STORAGE_DOWNLOAD_FAILED' | 'CORRUPTED_FILE';
  status: 404 | 403 | 502 | 422;
  message: string;
}

export type StorageDownloadResult = StorageDownloadSuccess | StorageDownloadFailure;

interface StorageErrorLike {
  message?: string;
  status?: number;
  statusCode?: string | number;
}

interface DownloadableStorageClient {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: StorageErrorLike | null }>;
    };
  };
}

/** Same heuristic already used by /api/profile/upload/signed-url for classifying "bucket/object not found" Supabase errors — kept consistent rather than inventing a second convention. */
function isNotFoundError(error: StorageErrorLike): boolean {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('not found') || msg.includes('does not exist') || error.status === 404 || String(error.statusCode) === '404';
}

/** Distinct from "not found": the object exists but this client/policy isn't permitted to read it (e.g. an RLS/storage policy denial). */
function isPermissionError(error: StorageErrorLike): boolean {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('permission') || msg.includes('not authorized') || msg.includes('access denied') || error.status === 403 || String(error.statusCode) === '403';
}

export async function downloadFromStorage(
  supabase: DownloadableStorageClient,
  bucket: string,
  path: string,
): Promise<StorageDownloadResult> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    const message = error.message || 'Unknown storage error';
    if (isNotFoundError(error)) {
      return { success: false, code: 'STORAGE_OBJECT_NOT_FOUND', status: 404, message: `Document not found in storage: ${message}` };
    }
    if (isPermissionError(error)) {
      return { success: false, code: 'STORAGE_ACCESS_DENIED', status: 403, message: `Storage access denied: ${message}` };
    }
    return { success: false, code: 'STORAGE_DOWNLOAD_FAILED', status: 502, message: `Storage download failed: ${message}` };
  }

  if (!data) {
    return { success: false, code: 'STORAGE_DOWNLOAD_FAILED', status: 502, message: 'Storage returned no data for this object' };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length === 0) {
    return { success: false, code: 'CORRUPTED_FILE', status: 422, message: 'Downloaded file is empty' };
  }

  return { success: true, buffer, contentType: data.type || null };
}
