import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Until now, no test in this repo ever exercised a real (non-mocked) `@/`
 * import — every existing test either used relative imports for real
 * modules, or referenced `@/...` only inside vi.mock() calls (which
 * intercept by specifier text as written in the file under test, not by
 * actually resolving the path). That masked the fact that nothing here
 * ever configured `@/` → `src/` for Vitest itself (tsconfig's `paths` is
 * read by tsc/Next.js's own bundler, not by Vite/Vitest). The gap surfaced
 * the first time a real, unmocked `@/lib/...` import was added to a file
 * under test (src/lib/parseDocumentContract.ts, imported for real by
 * parse-document/route.ts) — resolution failed with "Cannot find package
 * '@/lib/...'" even though `npx tsc --noEmit` and `npm run build` both
 * resolve it correctly via their own tooling.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
