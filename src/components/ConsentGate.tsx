'use client';

/**
 * DealCollab — Consent Gate
 * ==========================
 * Shown at 100% profile completion. One checkbox (not pre-ticked).
 * On accept: POSTs to /api/consent/accept, which records consent and
 * credits the 100 tokens. On success, calls onAccepted() so the parent
 * can unlock EOI / token purchase and refresh the balance.
 *
 * Render this wherever your "profile 100%" moment lives (a modal, or the
 * final profile step). It does not self-gate visibility — the parent
 * decides when to show it.
 */

import { useState } from 'react';
import styles from './ConsentGate.module.css';

export default function ConsentGate({
  onAccepted,
}: {
  onAccepted?: () => void;
}) {
  const [checked, setChecked] = useState(false); // never pre-ticked
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/consent/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || data?.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      onAccepted?.();
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.card}>
      <p className={styles.kicker}>One last step</p>
      <h2 className={styles.title}>Activate your account</h2>
      <p className={styles.lede}>
        Your profile is complete. Accept the terms below to receive{' '}
        <strong>100 tokens</strong> and unlock sending Expressions of Interest.
      </p>

      <label className={styles.consentRow}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => setChecked(e.target.checked)}
          className={styles.checkbox}
        />
        <span className={styles.consentText}>
          I agree to DealCollab&rsquo;s{' '}
          <a href="/guide/terms-of-service" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/guide/privacy-policy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          . I understand that sending an EOI costs tokens and reveals my
          verified contact details to the counterparty on approval, that
          tokens are non-refundable, and that DealCollab does not guarantee
          any match or verify the claims counterparties make. I confirm I am
          authorised to submit the mandates I enter.
        </span>
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.button}
        disabled={!checked || submitting}
        onClick={handleContinue}
      >
        {submitting ? 'Activating…' : 'Agree & activate'}
      </button>

      <p className={styles.footnote}>
        You can read these in full any time under Guide &amp; Trust.
      </p>
    </div>
  );
}
