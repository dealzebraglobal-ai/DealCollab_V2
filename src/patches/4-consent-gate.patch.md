# Patch 4 — enforce the gate on EOI + token purchase

The checkbox is UI. The gate is these two server-side checks. Without them,
a direct API call bypasses consent entirely. Both are 3 lines.

## 4a. EOI-send handler

Find the handler/action that sends an EOI (the one that will, after the
Phase-0 token fix, place the token hold / initiate the EOI). At the TOP,
after you resolve the authenticated user and BEFORE any DB write:

```ts
import { hasAcceptedTerms } from '@/lib/consent';

// ...inside the handler, right after auth:
if (!(await hasAcceptedTerms(user.id))) {
  return NextResponse.json(
    { error: 'consent_required',
      message: 'Complete your profile and accept the Terms to send an EOI.' },
    { status: 403 },
  );
}
```

## 4b. Buy-tokens handler

Same guard at the top of the token-purchase / checkout-initiation endpoint:

```ts
import { hasAcceptedTerms } from '@/lib/consent';

if (!(await hasAcceptedTerms(user.id))) {
  return NextResponse.json(
    { error: 'consent_required',
      message: 'Complete your profile and accept the Terms before purchasing tokens.' },
    { status: 403 },
  );
}
```

## 4c. Client-side (optional, UX only)

So users don't hit a 403 blindly, hide/disable the "Send EOI" and "Buy
tokens" buttons until consent is given. Fetch acceptance state once on load
(add a tiny `GET /api/consent/status` returning `{ accepted: boolean }`, or
include the flag in whatever user/session object you already hydrate). This
is convenience only — 4a and 4b are the real gate.

## Why both layers

- Client hiding = good UX, trivially bypassed.
- Server 403 = the actual enforcement. A user who never ticked the box
  cannot send an EOI or buy tokens even by calling the API directly.

## Verify

- New user, profile <100%: `/api/consent/accept` → 403 profile_incomplete.
- Profile 100%, box unticked → button disabled; forced POST without
  `accepted:true` → 400 consent_not_given.
- Tick box → accept → 200, 100 tokens credited exactly once (re-POST →
  200 alreadyAccepted, NO second credit).
- After acceptance: EOI-send and buy-tokens both pass the guard.
- Fresh user hitting EOI-send API directly (no acceptance row) → 403
  consent_required.
