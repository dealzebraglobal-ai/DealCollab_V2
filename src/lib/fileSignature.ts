/**
 * DealCollab — file magic-byte (signature) validation
 * ======================================================
 * Neither /api/chat/parse-document nor /api/profile/upload previously
 * checked the actual file content — only the browser-supplied Content-Type
 * and/or the filename extension, both of which are trivially spoofable by
 * an attacker (rename malware.exe to report.pdf, or set an arbitrary
 * Content-Type header on a raw upload). This checks the first few bytes of
 * the real file content against the known signature for the claimed type,
 * so a file that LIES about being a PDF/DOCX/image is rejected before it
 * ever reaches the document parser or gets stored.
 *
 * Deliberately dependency-free — the signature set needed here is small
 * and stable, so a new npm package isn't justified for it.
 */

export type SignatureCheckResult = { valid: true } | { valid: false; reason: string };

function bytesStartWith(buffer: Buffer, offset: number, signature: number[]): boolean {
  if (buffer.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) return false;
  }
  return true;
}

const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .doc/.ppt (Compound File)
const ZIP_SIGS = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06], // empty archive
  [0x50, 0x4b, 0x07, 0x08], // spanned archive
]; // .docx/.pptx are ZIP containers (OOXML)
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIG = [0xff, 0xd8, 0xff];

function isZip(buffer: Buffer): boolean {
  return ZIP_SIGS.some((sig) => bytesStartWith(buffer, 0, sig));
}

function isWebp(buffer: Buffer): boolean {
  return bytesStartWith(buffer, 0, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(buffer, 8, [0x57, 0x45, 0x42, 0x50]);
}

/** Heuristic for plain text: reject if a NUL byte appears in the first 1KB (real text never contains one). */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(1024, buffer.length));
  return !sample.includes(0);
}

/**
 * Validates that `buffer`'s actual content matches what `mimeType` claims.
 * `mimeType` should be the type the caller intends to trust (e.g. already
 * resolved from an allowlist) — this only confirms the bytes back it up.
 */
export function checkFileSignature(buffer: Buffer, mimeType: string): SignatureCheckResult {
  switch (mimeType) {
    case 'application/pdf':
      // ISO 32000-1 (PDF spec): %PDF- must appear in the first 1024 bytes (allows BOM or leading whitespace)
      return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid PDF signature (%PDF-)' };

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return isZip(buffer)
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid Office Open XML (ZIP) signature' };

    case 'application/msword':
    case 'application/vnd.ms-powerpoint':
      // Accept either the legacy OLE binary format or a modern OOXML file
      // saved with the old extension/MIME type (common in the wild).
      return isZip(buffer) || bytesStartWith(buffer, 0, OLE_SIG)
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid legacy Office document signature' };

    case 'image/png':
      return bytesStartWith(buffer, 0, PNG_SIG)
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid PNG signature' };

    case 'image/jpeg':
      return bytesStartWith(buffer, 0, JPEG_SIG)
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid JPEG signature' };

    case 'image/webp':
      return isWebp(buffer)
        ? { valid: true }
        : { valid: false, reason: 'File does not have a valid WEBP signature' };

    case 'text/plain':
      return looksLikeText(buffer)
        ? { valid: true }
        : { valid: false, reason: 'File contains binary data and is not valid plain text' };

    default:
      // Unknown type to this checker — caller's MIME allowlist already
      // rejected anything not in SUPPORTED_TYPES, so this path shouldn't be
      // reached in practice. Fail closed rather than silently accepting.
      return { valid: false, reason: `No signature check defined for ${mimeType}` };
  }
}
