/**
 * DealCollab — SSRF guard for server-side fetches of client-supplied URLs
 * ==========================================================================
 * Used by /api/chat/parse-document's JSON-body path, which previously did
 * `fetch(fileUrl)` with a fully client-controlled fileUrl and no validation
 * — an authenticated user could supply an internal/metadata URL and the
 * server would fetch and return its content back as "extracted text".
 *
 * This is an ALLOWLIST of the one legitimate host (the configured Supabase
 * project's storage domain — the only place the real client-side upload
 * flow ever produces a fileUrl from), not a private-IP blocklist. A
 * blocklist is easy to get wrong (DNS rebinding, IPv6 forms, redirects);
 * restricting to the single real origin eliminates the SSRF vector
 * entirely without narrowing the legitimate use case at all.
 */
export function isAllowedFileUrl(fileUrl: string, supabaseUrl: string | undefined): boolean {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  if (!supabaseUrl) return false;
  let supabaseHost: string;
  try {
    supabaseHost = new URL(supabaseUrl).hostname;
  } catch {
    return false;
  }

  return parsed.hostname === supabaseHost;
}
