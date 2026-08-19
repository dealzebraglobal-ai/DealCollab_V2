import { listFiles, readText, writeJson } from './shared.mjs';
const usage = new Map();
for (const file of listFiles()) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
    const text = readText(file);
    const vars = [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(m => m[1]);
    for (const name of vars) {
        if (!usage.has(name)) usage.set(name, new Set());
        usage.get(name).add(file);
    }
}
const envVars = [...usage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({
    var: name,
    used_in: [...files].sort(),
    set_in: name.startsWith('NEXT_PUBLIC_') ? ['Vercel dashboard', '.env.local', 'browser-exposed build/runtime environment'] : ['Vercel dashboard', '.env.local'],
    required: !/DEBUG|OPTIONAL|TEST/.test(name),
    failure_if_missing: 'Feature paths that read this variable may fail, disable integration behavior, or produce configuration errors.',
    rotated: 'unknown'
}));
writeJson('cartography/inventory/env-vars.json', envVars);
