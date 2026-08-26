import { describe, it, expect } from 'vitest';
import { checkFileSignature } from '../fileSignature';

/**
 * Regression tests for magic-byte validation (2026-08-26). Both
 * /api/chat/parse-document and /api/profile/upload previously trusted the
 * browser-supplied Content-Type and/or filename extension alone — an
 * attacker could rename any file (including an executable) to claim to be
 * a PDF/DOCX/image and it would sail through untouched.
 */
describe('checkFileSignature', () => {
  it('accepts a real PDF signature', () => {
    const buf = Buffer.from('%PDF-1.4\n...rest of file', 'utf8');
    expect(checkFileSignature(buf, 'application/pdf').valid).toBe(true);
  });

  it('rejects a file claiming to be a PDF without the %PDF- magic bytes', () => {
    const buf = Buffer.from('MZ\x90\x00this is actually an executable', 'binary');
    const result = checkFileSignature(buf, 'application/pdf');
    expect(result.valid).toBe(false);
  });

  it('accepts a real DOCX (ZIP) signature', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(checkFileSignature(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').valid).toBe(true);
  });

  it('rejects a non-ZIP file claiming to be DOCX', () => {
    const buf = Buffer.from('not a zip file at all');
    const result = checkFileSignature(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.valid).toBe(false);
  });

  it('accepts a real PNG signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(checkFileSignature(buf, 'image/png').valid).toBe(true);
  });

  it('rejects an executable renamed to claim image/png', () => {
    // MZ header = Windows PE executable
    const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(checkFileSignature(buf, 'image/png').valid).toBe(false);
  });

  it('accepts a real JPEG signature', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(checkFileSignature(buf, 'image/jpeg').valid).toBe(true);
  });

  it('accepts a real WEBP signature', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
    expect(checkFileSignature(buf, 'image/webp').valid).toBe(true);
  });

  it('rejects a RIFF file that is not actually WEBP (e.g. a WAV)', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVE')]);
    expect(checkFileSignature(buf, 'image/webp').valid).toBe(false);
  });

  it('accepts plain text without a NUL byte', () => {
    const buf = Buffer.from('Just a normal deal summary in plain text.', 'utf8');
    expect(checkFileSignature(buf, 'text/plain').valid).toBe(true);
  });

  it('rejects binary content disguised as text/plain', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(checkFileSignature(buf, 'text/plain').valid).toBe(false);
  });

  it('accepts a legacy .doc via its OLE Compound File signature', () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(checkFileSignature(buf, 'application/msword').valid).toBe(true);
  });

  it('fails closed for a MIME type with no defined signature check', () => {
    const buf = Buffer.from('irrelevant');
    expect(checkFileSignature(buf, 'application/x-made-up').valid).toBe(false);
  });
});
