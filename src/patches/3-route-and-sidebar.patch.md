# Patch 3 — route.ts, sidebar link, middleware

## 3a. route.ts (your chat API route)

I don't have this file, so exact placement is yours — the pattern is:

1. Import (it's re-exported from the router, so no new import path):

```ts
import { buildSystemPrompt, detectHelpQuery /* , ...existing */ } from '@/lib/promptRouter';
```

2. Where you already run detectors on the incoming user message (same place
   you call things like `detectShellQuery`), add:

```ts
const helpQueryDetected = detectHelpQuery(currentUserMessage);
// ^ use whatever variable holds the raw text of the user's latest message
```

3. Find your existing call:

```ts
const routerOutput = buildSystemPrompt(state, matchedMandates);
```

and change it to:

```ts
const routerOutput = buildSystemPrompt(state, matchedMandates, helpQueryDetected);
```

That's the entire route change. No state schema changes, no DB changes —
`helpQueryDetected` is per-message and is not persisted.

## 3b. Sidebar link (your left panel component)

Add one item, matching your existing sidebar item markup/classes:

```tsx
import Link from 'next/link';
// if you use lucide-react for icons:
import { BookOpen } from 'lucide-react';

<Link href="/guide" className="/* copy the classes of your existing sidebar items */">
  <BookOpen size={18} />
  <span>Guide &amp; Trust</span>
</Link>
```

Placement: below your main nav items, above Settings/Profile.

## 3c. Middleware — make /guide PUBLIC

The guide must be readable by non-logged-in users (that is the point of a
trust page). If you have auth middleware, exclude the guide routes.

If you use a matcher:

```ts
export const config = {
  // add '/guide' paths to whatever your public exclusion pattern is, e.g.:
  matcher: ['/((?!guide|_next/static|_next/image|favicon.ico|api/public).*)'],
};
```

If you use route-list logic:

```ts
const PUBLIC_PATHS = ['/login', '/signup', '/guide']; // '/guide' covers /guide/*
const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
```

## Verify

- Logged OUT, open `/guide` and `/guide/faq` → both render, no auth redirect.
- Logged IN, sidebar shows "Guide & Trust" → opens `/guide`.
- Send "do you charge anything?" in chat → reply answers pricing in ≤3
  sentences AND continues the intake questions in the same message.
